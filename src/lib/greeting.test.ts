import { describe, it, expect } from "vitest";
import { getTimeOfDay, getTimeGreetingCs, getTimeSubtitleCs } from "./greeting";

// Lokální čas (ne UTC) — appka i produkční kód čtou new Date().getHours(), takže test musí
// stavět Date stejným konstruktorem, jinak by výsledek závisel na timezone stroje.
function at(hour: number): Date {
  return new Date(2026, 7, 19, hour, 30, 0);
}

describe("getTimeOfDay", () => {
  it("dělí den na čtyři části", () => {
    expect(getTimeOfDay(at(7))).toBe("morning");
    expect(getTimeOfDay(at(13))).toBe("day");
    expect(getTimeOfDay(at(20))).toBe("evening");
    expect(getTimeOfDay(at(23))).toBe("night");
  });

  it("hlídá hranice mezi částmi dne", () => {
    expect(getTimeOfDay(at(4))).toBe("night");
    expect(getTimeOfDay(at(5))).toBe("morning");
    expect(getTimeOfDay(at(9))).toBe("morning");
    expect(getTimeOfDay(at(10))).toBe("day");
    expect(getTimeOfDay(at(17))).toBe("day");
    expect(getTimeOfDay(at(18))).toBe("evening");
    expect(getTimeOfDay(at(21))).toBe("evening");
    expect(getTimeOfDay(at(22))).toBe("night");
  });

  // Noc jako jediná část přeskakuje půlnoc (22:00–4:59) — hodiny po půlnoci proto nesmí spadnout
  // do "morning", jinak by appka ve dvě ráno pozdravila "Krásné ráno" (stejný nesmysl jako ranní
  // pozdrav v devět večer, jen v jinou hodinu).
  it("hodiny po půlnoci spadají do 'night', ne do 'morning'", () => {
    expect(getTimeOfDay(at(0))).toBe("night");
    expect(getTimeOfDay(at(2))).toBe("night");
    expect(getTimeOfDay(at(4))).toBe("night");
  });
});

describe("getTimeGreetingCs", () => {
  it("vrací pozdrav odpovídající denní době", () => {
    expect(getTimeGreetingCs(at(7))).toBe("Krásné ráno");
    expect(getTimeGreetingCs(at(13))).toBe("Krásný den");
    expect(getTimeGreetingCs(at(20))).toBe("Hezký večer");
    expect(getTimeGreetingCs(at(23))).toBe("Dobrou noc");
  });

  // REGRESE: hlavní stížnost, kvůli které tenhle modul vznikl — Home.tsx měl natvrdo
  // "Krásné ráno, {jméno}" bez ohledu na hodinu, takže večerní zapnutí appky působilo rozbitě.
  it("večer ani v noci nikdy nevrací ranní pozdrav", () => {
    for (const hour of [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4]) {
      expect(getTimeGreetingCs(at(hour))).not.toBe("Krásné ráno");
    }
  });
});

describe("getTimeSubtitleCs", () => {
  it("vrací podtitulek odpovídající denní době", () => {
    expect(getTimeSubtitleCs(at(7))).toBe("Ať ti den vyjde.");
    expect(getTimeSubtitleCs(at(20))).toBe("Ať máš klidný večer.");
  });

  // REGRESE: dřív natvrdo "Dnes to bude skvělý den." — budoucí čas, který večer nesedí.
  it("večer neslibuje den v budoucím čase", () => {
    expect(getTimeSubtitleCs(at(21))).not.toContain("bude");
    expect(getTimeSubtitleCs(at(23))).not.toContain("bude");
  });
});
