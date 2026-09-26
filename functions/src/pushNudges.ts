import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getLocalTimeParts, resolveTimeZone } from "./localTime.js";
import {
  computeActiveNudges,
  isQuietHours,
  nextPushState,
  PUSH_TITLES,
  resolveCoachingStyle,
  selectNudgesToSend,
  type PushState,
  type ServerNudge,
} from "./nudgeRules.js";
import { enforceRateLimit } from "./rateLimit.js";

// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md, sekce 7) — push připomínky jídla a vody mimo appku.
// Žádné OpenAI, jen šablony z nudgeRules.ts (stejné texty jako banner v appce).

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Připomínka, která dorazí se zpožděním (telefon byl offline), už nemá smysl — oběd v noci
// by jen otravoval. FCM ji po hodině zahodí.
const PUSH_TTL_SECONDS = 60 * 60;
const INVALID_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

interface DeviceToken {
  token: string;
  ref: DocumentReference;
}

interface PushPayload {
  title: string;
  body: string;
  kind: string;
  url: string;
}

function payloadForNudge(nudge: ServerNudge): PushPayload {
  return {
    title: PUSH_TITLES[nudge.kind],
    body: nudge.text,
    kind: nudge.kind,
    url: nudge.kind === "water" ? "/" : "/?action=add-meal",
  };
}

/**
 * Data-only zpráva (hodnoty musí být řetězce) — notifikaci vždy zobrazí náš handler ve
 * service workeru (public/push-handler.js), ne FCM SDK, které appka v SW nemá.
 * Neplatné tokeny (odinstalovaná appka, odvolané povolení) se smažou; přechodné chyby ne.
 */
async function sendToDevices(tokens: DeviceToken[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    data: { ...payload },
    webpush: { headers: { TTL: String(PUSH_TTL_SECONDS), Urgency: "high" } },
  });
  await Promise.all(
    response.responses.map(async (r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      if (INVALID_TOKEN_CODES.has(code)) {
        await tokens[i].ref.delete().catch((error) => logger.warn("Smazání neplatného push tokenu selhalo", { error }));
      } else {
        logger.warn("Odeslání push notifikace selhalo", { code, message: r.error?.message });
      }
    })
  );
  return { sent: response.successCount, failed: response.failureCount };
}

async function loadTokensByUser(): Promise<Map<string, DeviceToken[]>> {
  const snap = await db.collectionGroup("pushTokens").get();
  const byUser = new Map<string, DeviceToken[]>();
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent?.id;
    const token = doc.get("token");
    if (!uid || typeof token !== "string" || token === "") continue;
    const list = byUser.get(uid) ?? [];
    list.push({ token, ref: doc.ref });
    byUser.set(uid, list);
  }
  return byUser;
}

function optionalHour(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23 ? value : undefined;
}

async function processUser(uid: string, tokens: DeviceToken[], now: Date): Promise<void> {
  const profile = (await db.doc(`users/${uid}`).get()).data();
  if (!profile?.setupComplete) return;

  const { dateISO, hour, minute } = getLocalTimeParts(now, resolveTimeZone(profile.timeZone));
  // Tichý režim má vždy přednost (rozhodnutí uživatele 2026-09-26), stejná výchozí 22–7 jako v appce.
  const quietEnabled = profile.quietHoursEnabled !== false;
  if (quietEnabled && isQuietHours(hour, optionalHour(profile.quietHoursStart), optionalHour(profile.quietHoursEnd))) return;

  const [mealsSnap, waterSnap] = await Promise.all([
    db.collection(`users/${uid}/meals`).where("date", "==", dateISO).get(),
    db.doc(`users/${uid}/waterLogs/${dateISO}`).get(),
  ]);
  const glasses = Number(waterSnap.get("glasses"));
  const nudges = computeActiveNudges({
    todaysMealTypes: mealsSnap.docs.map((d) => String(d.get("type"))),
    waterGlasses: Number.isFinite(glasses) ? glasses : 0,
    hour,
    minute,
    style: resolveCoachingStyle(profile.coachingStyle),
    isVacationDay: Array.isArray(profile.vacationDates) && profile.vacationDates.includes(dateISO),
  });
  if (nudges.length === 0) return;

  // Deduplikace se zapíše PŘED odesláním (transakce) — souběžný nebo zopakovaný běh tak nikdy
  // nepošle totéž dvakrát; za cenu, že selhané odeslání se už nezopakuje. Nejvýš jedna
  // notifikace za běh (hodinu), ať nepřijdou dvě naráz; zbytek počká na další hodinu.
  const stateRef = db.doc(`pushState/${uid}`);
  const toSend = await db.runTransaction(async (tx) => {
    const state = (await tx.get(stateRef)).data() as PushState | undefined;
    const selected = selectNudgesToSend(nudges, state, dateISO).slice(0, 1);
    if (selected.length > 0) tx.set(stateRef, nextPushState(state, dateISO, selected));
    return selected;
  });

  for (const nudge of toSend) {
    const result = await sendToDevices(tokens, payloadForNudge(nudge));
    logger.info("Push připomínka odeslána", { uid, kind: nudge.kind, ...result });
  }
}

export const sendNudgePushes = onSchedule(
  { schedule: "5 * * * *", timeZone: "Etc/UTC", region: "us-central1", timeoutSeconds: 120 },
  async () => {
    const now = new Date();
    const tokensByUser = await loadTokensByUser();
    for (const [uid, tokens] of tokensByUser) {
      try {
        await processUser(uid, tokens, now);
      } catch (error) {
        // Jedna rozbitá uživatelka nesmí zastavit připomínky ostatním.
        logger.error("Push připomínky pro uživatelku selhaly", { uid, error });
      }
    }
  }
);

const TEST_PUSH_MAX = 5;
const TEST_PUSH_WINDOW_MS = 15 * 60 * 1000;

/** Tlačítko „Poslat zkušební upozornění“ v Profilu — jediný rychlý způsob, jak ověřit iPhone. */
export const sendTestPush = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Musíš být přihlášená.");
  const uid = request.auth.uid;
  await enforceRateLimit(uid, "sendTestPush", TEST_PUSH_MAX, TEST_PUSH_WINDOW_MS);
  const snap = await db.collection(`users/${uid}/pushTokens`).get();
  const tokens: DeviceToken[] = snap.docs
    .map((d) => ({ token: d.get("token"), ref: d.ref }))
    .filter((t): t is DeviceToken => typeof t.token === "string" && t.token !== "");
  if (tokens.length === 0) throw new HttpsError("failed-precondition", "Upozornění nemáš zapnutá na žádném zařízení.");
  return sendToDevices(tokens, { title: "Nouri", body: "Upozornění fungují. Takhle ti Mya připomene jídlo a vodu.", kind: "test", url: "/" });
});
