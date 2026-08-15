import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

interface RateLimitEntry {
  count: number;
  windowStart: Timestamp;
}

// N19 v REFERENCE/AUDIT_2026-08-14.md — appka dřív neměla žádnou obranu proti runaway smyčce
// (např. chybný retry v klientovi) na nejdražších AI voláních (gpt-4o vision, Whisper). Ukládá
// se do vlastní kolekce `rateLimits/{uid}` mimo `users/{uid}` strom, ke kterému appka dává
// klientům přístup ve firestore.rules — appka tam sahá jen přes Admin SDK (obchází rules úplně),
// takže appka klientovi tuhle kolekci nemusí vůbec vystavovat.
//
// Fail-open: pokud selže samotná Firestore transakce (infrastrukturní chyba, ne překročení
// limitu), appka volání pustí dál a jen zaloguje — rate-limit je pojistka pro dražší volání,
// nesmí se stát novým důvodem, proč appka nefunguje.
export async function enforceRateLimit(uid: string, key: string, maxCalls: number, windowMs: number): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.collection("rateLimits").doc(uid);
      const snap = await tx.get(ref);
      const entry = snap.data()?.[key] as RateLimitEntry | undefined;
      const now = Date.now();
      const withinWindow = !!entry && now - entry.windowStart.toMillis() < windowMs;
      const count = withinWindow && entry ? entry.count : 0;

      if (withinWindow && count >= maxCalls) {
        throw new HttpsError("resource-exhausted", "Příliš mnoho požadavků za krátkou dobu — zkus to prosím za pár minut.");
      }

      const windowStart = withinWindow && entry ? entry.windowStart : Timestamp.now();
      tx.set(ref, { [key]: { count: count + 1, windowStart } }, { merge: true });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error(`Rate limit check failed for ${key}, appka volání pustí dál:`, error);
  }
}
