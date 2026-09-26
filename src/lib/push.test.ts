import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({ default: {}, db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));
vi.mock("firebase/firestore", () => ({ deleteDoc: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn(), setDoc: vi.fn() }));

const { detectPushSupport } = await import("./push");

const iphoneOnHomeScreen = {
  hasVapidKey: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIOS: true,
  isStandalone: true,
  permission: "default" as NotificationPermission,
};

describe("detectPushSupport", () => {
  it("iPhone s Nouri na ploše → dá se zapnout", () => {
    expect(detectPushSupport(iphoneOnHomeScreen)).toBe("ready");
  });

  it("iPhone v Safari (ne z plochy) → návod na přidání na plochu, ne 'neumí'", () => {
    // Safari mimo plochu nemá PushManager ani Notification — přesto má appka poradit instalaci.
    expect(
      detectPushSupport({ ...iphoneOnHomeScreen, isStandalone: false, hasPushManager: false, hasNotification: false, permission: null })
    ).toBe("needs-install");
  });

  it("build bez VAPID klíče nic nenabízí", () => {
    expect(detectPushSupport({ ...iphoneOnHomeScreen, hasVapidKey: false })).toBe("no-key");
  });

  it("zamítnuté povolení → návod do nastavení", () => {
    expect(detectPushSupport({ ...iphoneOnHomeScreen, permission: "denied" })).toBe("denied");
  });

  it("desktopový prohlížeč bez Push API → neumí", () => {
    expect(detectPushSupport({ ...iphoneOnHomeScreen, isIOS: false, isStandalone: false, hasPushManager: false })).toBe("unsupported");
  });

  it("Android/desktop Chrome i v záložce → dá se zapnout (instalace není nutná)", () => {
    expect(detectPushSupport({ ...iphoneOnHomeScreen, isIOS: false, isStandalone: false })).toBe("ready");
  });
});
