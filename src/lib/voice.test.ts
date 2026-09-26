import { beforeEach, describe, expect, it, vi } from "vitest";

// N48 (AUDIT_2026-08-14.md) — kontrakt obalu: text přepisu, jinak null (chyba i "nic nerozpoznáno").
const callable = vi.hoisted(() => ({
  calls: [] as { name: string; payload: unknown }[],
  results: new Map<string, () => Promise<unknown>>(),
}));

vi.mock("./firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (payload: unknown) => {
    callable.calls.push({ name, payload });
    const result = callable.results.get(name);
    return result ? result() : Promise.reject(new Error(`${name}: internal`));
  },
}));

const { MyaVoice } = await import("./voice");

beforeEach(() => {
  callable.calls.length = 0;
  callable.results.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MyaVoice.transcribeAudio", () => {
  it("pošle nahrávku do transcribeAudio a vrátí text", async () => {
    callable.results.set("transcribeAudio", () => Promise.resolve({ data: { text: "rohlík s máslem" } }));

    await expect(MyaVoice.transcribeAudio("data:audio/webm;base64,xx")).resolves.toBe("rohlík s máslem");
    expect(callable.calls).toEqual([{ name: "transcribeAudio", payload: { audioDataUrl: "data:audio/webm;base64,xx" } }]);
  });

  it("když server nic nerozpozná (null), vrátí null", async () => {
    callable.results.set("transcribeAudio", () => Promise.resolve({ data: null }));

    await expect(MyaVoice.transcribeAudio("x")).resolves.toBeNull();
  });

  it("při selhání vrátí null, nevyhodí", async () => {
    await expect(MyaVoice.transcribeAudio("x")).resolves.toBeNull();
  });
});
