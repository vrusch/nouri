import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCloudError, subscribeCloudErrors } from "./cloudErrors";

describe("cloudErrors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("doručí zprávu všem přihlášeným posluchačům a zaloguje chybu", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeCloudErrors(a);
    const unsubB = subscribeCloudErrors(b);

    const error = new Error("permission-denied");
    reportCloudError("Položku se nepodařilo uložit.", error);

    expect(a).toHaveBeenCalledWith("Položku se nepodařilo uložit.");
    expect(b).toHaveBeenCalledWith("Položku se nepodařilo uložit.");
    expect(consoleSpy).toHaveBeenCalledWith("Položku se nepodařilo uložit.", error);
    unsubA();
    unsubB();
  });

  it("po odhlášení posluchač další zprávy nedostává", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn();
    const unsubscribe = subscribeCloudErrors(listener);
    unsubscribe();

    reportCloudError("Nic.");

    expect(listener).not.toHaveBeenCalled();
  });
});
