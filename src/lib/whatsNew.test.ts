import { describe, expect, it } from "vitest";
import { compareVersions, getWhatsNewSince, WHATS_NEW, type WhatsNewEntry } from "./whatsNew";

const entries: WhatsNewEntry[] = [
  { version: "0.21.0", items: ["Nová věc C"] },
  { version: "0.20.1", items: [] },
  { version: "0.20.0", items: ["Nová věc A", "Nová věc B"] },
];

describe("compareVersions", () => {
  it("porovnává čísla, ne řetězce", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.19.0", "0.19.0")).toBe(0);
    expect(compareVersions("0.19.2", "0.20.0")).toBeLessThan(0);
  });
});

describe("getWhatsNewSince", () => {
  it("stejná verze jako naposledy = nic", () => {
    expect(getWhatsNewSince("0.21.0", "0.21.0", entries)).toEqual([]);
  });

  it("přeskočené verze ukáže všechny, od nejnovější, bez prázdných", () => {
    expect(getWhatsNewSince("0.19.0", "0.21.0", entries).map((e) => e.version)).toEqual(["0.21.0", "0.20.0"]);
  });

  it("verze bez bodů pro uživatelku modal neukáže", () => {
    expect(getWhatsNewSince("0.20.0", "0.20.1", entries)).toEqual([]);
  });

  it("záznam pro ještě nevydanou verzi (novější než package.json) se neukáže", () => {
    expect(getWhatsNewSince("0.19.0", "0.20.1", entries).map((e) => e.version)).toEqual(["0.20.0"]);
  });

  it("zařízení bez zapsané verze uvidí jen aktuální verzi, ne celou historii", () => {
    expect(getWhatsNewSince(null, "0.21.0", entries).map((e) => e.version)).toEqual(["0.21.0"]);
    expect(getWhatsNewSince(null, "0.20.1", entries)).toEqual([]);
  });
});

describe("WHATS_NEW data", () => {
  it("platné, unikátní verze od nejnovější a každá s aspoň jedním bodem", () => {
    const versions = WHATS_NEW.map((e) => e.version);
    expect(versions.every((v) => /^\d+\.\d+\.\d+$/.test(v))).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
    expect(WHATS_NEW.every((e) => e.items.length > 0)).toBe(true);
  });
});
