import { httpsCallable } from "firebase/functions";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import app, { db, functions } from "./firebase";

// Fáze C (REFERENCE/STRICT_COACHING_SPEC.md, sekce 7) — push připomínky jídla a vody.
// Zapíná se na každém zařízení zvlášť: token zařízení leží v users/{uid}/pushTokens/{sha256(token)},
// id dokumentu si zařízení pamatuje v localStorage. Připomínky posílá plánovaná Cloud Function
// sendNudgePushes, notifikaci zobrazuje public/push-handler.js ve stávajícím service workeru
// (vite-plugin-pwa, workbox.importScripts) — FCM žádný vlastní SW neregistruje.

const VAPID_KEY: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
const TOKEN_ID_STORAGE_KEY = "nouri_push_token_id";
const SW_READY_TIMEOUT_MS = 10_000;

export type PushSupport =
  | "ready" // dá se zapnout
  | "no-key" // build bez VITE_FIREBASE_VAPID_KEY (např. Vercel bez proměnné)
  | "unsupported" // prohlížeč web push neumí
  | "needs-install" // iPhone/iPad v Safari, ne z plochy — push funguje jen v PWA na ploše
  | "denied"; // uživatelka povolení zamítla, znovu jde zapnout jen v nastavení telefonu/prohlížeče

export interface PushEnvironment {
  hasVapidKey: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | null;
}

export function detectPushSupport(env: PushEnvironment): PushSupport {
  if (!env.hasVapidKey) return "no-key";
  // iOS Safari mimo plochu nemá PushManager vůbec — proto kontrola instalace před "unsupported",
  // jinak by appka iPhonu řekla "neumí", místo "přidej si mě na plochu".
  if (env.isIOS && !env.isStandalone) return "needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "denied";
  return "ready";
}

export function readPushEnvironment(): PushEnvironment {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const ua = nav?.userAgent ?? "";
  // iPadOS 13+ se hlásí jako Macintosh — rozliší ho dotykový displej.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  const hasNotification = typeof window !== "undefined" && "Notification" in window;
  return {
    hasVapidKey: !!VAPID_KEY,
    hasServiceWorker: !!nav && "serviceWorker" in nav,
    hasPushManager: typeof window !== "undefined" && "PushManager" in window,
    hasNotification,
    isIOS,
    isStandalone: !!isStandalone,
    permission: hasNotification ? Notification.permission : null,
  };
}

function readStoredTokenId(): string | null {
  try {
    return localStorage.getItem(TOKEN_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTokenId(id: string | null): void {
  try {
    if (id) localStorage.setItem(TOKEN_ID_STORAGE_KEY, id);
    else localStorage.removeItem(TOKEN_ID_STORAGE_KEY);
  } catch {
    // Bez localStorage (soukromé okno) se jen nepamatuje stav přepínače — push sám funguje dál.
  }
}

export function isPushEnabledOnThisDevice(): boolean {
  return readStoredTokenId() !== null && readPushEnvironment().permission === "granted";
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// V dev serveru service worker není (vite-plugin-pwa ho registruje jen v buildu) a
// navigator.serviceWorker.ready by čekalo věčně — proto timeout se srozumitelnou chybou.
async function waitForServiceWorker(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Service worker není k dispozici (dev server?)")), SW_READY_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Získá FCM token tohohle zařízení a uloží ho. Volá se až PO udělení povolení (viz
 * enablePush) a při každém startu appky se zapnutým pushem — token se může změnit.
 */
async function registerToken(uid: string): Promise<void> {
  const { getMessaging, getToken } = await import("firebase/messaging");
  const registration = await waitForServiceWorker();
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  const id = await sha256Hex(token);
  const previousId = readStoredTokenId();
  await setDoc(
    doc(db, "users", uid, "pushTokens", id),
    { token, userAgent: navigator.userAgent.slice(0, 200), updatedAt: serverTimestamp() },
    { merge: true }
  );
  writeStoredTokenId(id);
  if (previousId && previousId !== id) {
    await deleteDoc(doc(db, "users", uid, "pushTokens", previousId)).catch(() => {});
  }
}

/**
 * Zapnutí z klepnutí na přepínač. Notification.requestPermission() musí být PRVNÍ await
 * v obsluze kliknutí — iOS Safari povolení mimo přímou akci uživatelky tiše zamítne, a každé
 * čekání předtím (import, service worker, hash) by tu vazbu na klepnutí mohlo přerušit.
 */
export async function enablePush(uid: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  await registerToken(uid);
  return permission;
}

export async function disablePush(uid: string): Promise<void> {
  const id = readStoredTokenId();
  writeStoredTokenId(null);
  if (id) await deleteDoc(doc(db, "users", uid, "pushTokens", id));
  try {
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    await deleteToken(getMessaging(app));
  } catch (error) {
    // Dokument je smazaný, server sem už nic nepošle — zrušení odběru v prohlížeči je jen úklid.
    console.error("Zrušení push odběru v prohlížeči selhalo:", error);
  }
}

/** Při startu appky: token se mohl obnovit (FCM ho občas rotuje), ať server nemá starý. */
export async function refreshPushTokenIfEnabled(uid: string): Promise<void> {
  if (!isPushEnabledOnThisDevice()) return;
  try {
    await registerToken(uid);
  } catch (error) {
    console.error("Obnovení push tokenu selhalo:", error);
  }
}

export function getDeviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

const sendTestPushFn = httpsCallable<void, { sent: number; failed: number }>(functions, "sendTestPush");

export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  const response = await sendTestPushFn();
  return response.data;
}
