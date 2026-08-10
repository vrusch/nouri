import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "mock-collection"),
  doc: vi.fn((_collection: unknown, id: string) => `mock-doc:${id}`),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  writeBatch: vi.fn(),
}));

import { collection, doc, getDocs, onSnapshot, orderBy, setDoc } from "firebase/firestore";
import { logWeight, seedWeightLogIfEmpty, subscribeMeals, subscribeWeightLogs } from "./cloudSync";
import { db as dexieDb, type MealItem } from "../db/db";

type SnapshotHandler = (snap: { docChanges(): unknown[] }) => void;

function fakeChange(type: "added" | "modified" | "removed", data: Partial<MealItem>) {
  return { type, doc: { data: () => data } };
}

function triggerLatestSnapshot(changes: ReturnType<typeof fakeChange>[]) {
  const onNext = vi.mocked(onSnapshot).mock.calls.at(-1)?.[1] as SnapshotHandler;
  onNext({ docChanges: () => changes });
}

function mockQuerySnapshot(empty: boolean): Awaited<ReturnType<typeof getDocs>> {
  return { empty } as unknown as Awaited<ReturnType<typeof getDocs>>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await dexieDb.meals.clear();
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

describe("subscribeMeals (živé zrcadlení Firestore → Dexie, Fáze 5 sync)", () => {
  const meal: MealItem = {
    name: "Test jídlo",
    value: 500,
    time: "12:00",
    date: "2026-08-08",
    type: "lunch",
    source: "manual",
    syncId: "abc-123",
  };

  it("přidá nové jídlo z Firestore do lokální Dexie", async () => {
    subscribeMeals("uid1");
    triggerLatestSnapshot([fakeChange("added", meal)]);

    await vi.waitFor(async () => {
      const rows = await dexieDb.meals.where("syncId").equals("abc-123").toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Test jídlo");
    });
  });

  // Regrese proti duplicitám: appka jídlo nejdřív zapíše lokálně (db.meals.add), pak
  // ho odloženě zazálohuje do Firestore (backupMeal) — ten zápis se pak vrátí zpátky
  // přes tenhle listener. Musí se poznat, že syncId už lokálně existuje, a jen ho
  // aktualizovat, ne založit druhý řádek.
  it("REGRESE: nezdvojí záznam, který appka právě sama zapsala lokálně (upsert podle syncId)", async () => {
    await dexieDb.meals.add({ ...meal, name: "Lokální verze" });

    subscribeMeals("uid1");
    triggerLatestSnapshot([fakeChange("added", meal)]);

    await vi.waitFor(async () => {
      const rows = await dexieDb.meals.where("syncId").equals("abc-123").toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("Test jídlo"); // přepsáno cloudovou verzí, ne duplicitní řádek
    });
  });

  it("smaže lokální jídlo, když bylo smazáno v cloudu (removed)", async () => {
    await dexieDb.meals.add(meal);

    subscribeMeals("uid1");
    triggerLatestSnapshot([fakeChange("removed", { syncId: "abc-123" })]);

    await vi.waitFor(async () => {
      const rows = await dexieDb.meals.where("syncId").equals("abc-123").toArray();
      expect(rows).toHaveLength(0);
    });
  });

  it("ignoruje změny bez syncId, místo aby appka spadla", async () => {
    subscribeMeals("uid1");
    expect(() => triggerLatestSnapshot([fakeChange("added", { ...meal, syncId: undefined })])).not.toThrow();
  });

  it("vrací funkci pro odhlášení (unsubscribe)", () => {
    const fakeUnsubscribe = vi.fn();
    vi.mocked(onSnapshot).mockReturnValueOnce(fakeUnsubscribe);
    const unsubscribe = subscribeMeals("uid1");
    unsubscribe();
    expect(fakeUnsubscribe).toHaveBeenCalled();
  });
});

describe("subscribeWeightLogs", () => {
  it("zavolá callback s aktuálním seznamem záznamů při každém snímku", () => {
    const callback = vi.fn();
    subscribeWeightLogs("uid1", callback);

    const onNext = vi.mocked(onSnapshot).mock.calls.at(-1)?.[1] as (snap: {
      docs: { data(): unknown }[];
    }) => void;
    onNext({
      docs: [
        { data: () => ({ date: "2026-07-18", weight: 80, source: "manual" }) },
        { data: () => ({ date: "2026-08-08", weight: 77.5, source: "manual" }) },
      ],
    });

    expect(callback).toHaveBeenCalledWith([
      { date: "2026-07-18", weight: 80, source: "manual" },
      { date: "2026-08-08", weight: 77.5, source: "manual" },
    ]);
  });

  it("řadí dotaz podle data vzestupně", () => {
    subscribeWeightLogs("uid1", vi.fn());
    expect(orderBy).toHaveBeenCalledWith("date", "asc");
  });
});
