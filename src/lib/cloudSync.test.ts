import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "mock-collection"),
  doc: vi.fn((_collection: unknown, id: string) => `mock-doc:${id}`),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(),
}));

import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { logWeight, seedWeightLogIfEmpty } from "./cloudSync";

function mockQuerySnapshot(empty: boolean): Awaited<ReturnType<typeof getDocs>> {
  return { empty } as unknown as Awaited<ReturnType<typeof getDocs>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logWeight", () => {
  it("zapíše záznam s výchozím source 'manual', když není zadán", async () => {
    await logWeight("uid1", 75, "2026-08-08");
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { weight: 75, date: "2026-08-08", source: "manual" });
  });

  it("umožní explicitně zapsat source 'seed'", async () => {
    await logWeight("uid1", 80, "2026-07-18", "seed");
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { weight: 80, date: "2026-07-18", source: "seed" });
  });

  it("použije datum jako doc id — oprava ve stejný den přepíše existující bod, ne duplicitu", async () => {
    await logWeight("uid1", 75, "2026-08-08");
    expect(doc).toHaveBeenCalledWith("mock-collection", "2026-08-08");
  });

  it("nevyhodí chybu při selhání zápisu (odloženo, nesmí blokovat lokální zápis)", async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("network down"));
    await expect(logWeight("uid1", 75, "2026-08-08")).resolves.toBeUndefined();
  });
});

describe("seedWeightLogIfEmpty", () => {
  // Regrese: tahle funkce MUSÍ tagovat "seed", ne výchozí "manual" — jinak appka bere
  // tichý startovní bod grafu jako reálné vážení uživatele (viz weighIn.test.ts).
  it("REGRESE: založí záznam s source 'seed', ne 'manual', když je historie prázdná", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(mockQuerySnapshot(true));
    await seedWeightLogIfEmpty("uid1", 80);
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ weight: 80, source: "seed" })
    );
  });

  it("nic nezapíše, pokud už váhová historie existuje", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(mockQuerySnapshot(false));
    await seedWeightLogIfEmpty("uid1", 80);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("dotazuje se na kolekci váhové historie konkrétního uživatele", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(mockQuerySnapshot(true));
    await seedWeightLogIfEmpty("uid-xyz", 80);
    expect(collection).toHaveBeenCalledWith({}, "users", "uid-xyz", "weightLogs");
  });
});
