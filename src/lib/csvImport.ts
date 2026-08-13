import { type MealItem } from "../db/db";

// Musí zůstat v souladu s hlavičkou psanou v Profile.tsx (handleExportCsv) — import čte
// jen appkou vyexportovaný formát, ne libovolné cizí CSV.
// Jen původních 9 sloupců je vyžadovaných — "Hrubý odhad" (C5 v AUDIT_2026-08-13.md) appka
// přidala jako 10., ale zpětně kompatibilně: CSV vyexportované appkou před touhle opravou má
// jen 9 sloupců, a headerMatches na přesnou shodu i délku by ho odmítlo jako "neplatnou
// hlavičku" (a navíc omylem naparsovalo samotný hlavičkový řádek jako data). Chybějící 10.
// sloupec appka na řádku dat prostě přečte jako undefined → žádný roughEstimate, beze změny.
const EXPECTED_HEADER = ["Datum", "Čas", "Typ", "Název", "Kalorie", "Bílkoviny (g)", "Tuky (g)", "Sacharidy (g)", "Zdroj"];
const VALID_TYPES: MealItem["type"][] = ["breakfast", "lunch", "dinner", "snack"];
const VALID_SOURCES: NonNullable<MealItem["source"]>[] = ["photo", "manual"];

export type ImportedMeal = Omit<MealItem, "id" | "syncId">;

export interface ParseMealsCsvResult {
  meals: ImportedMeal[];
  errors: string[];
}

// Rozparsuje jeden CSV řádek se stejným pravidlem uvozovek jako handleExportCsv při zápisu:
// každá buňka je obalená v "...", doslovná uvozovka uvnitř je zdvojená ("").
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export function parseMealsCsv(csvText: string): ParseMealsCsvResult {
  const withoutBom = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const text = withoutBom.replace(/\r\n/g, "\n").trim();
  const meals: ImportedMeal[] = [];
  const errors: string[] = [];

  if (!text) {
    errors.push("Soubor je prázdný.");
    return { meals, errors };
  }

  const lines = text.split("\n").filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const headerMatches = EXPECTED_HEADER.every((h, i) => header[i] === h);
  const dataLines = headerMatches ? lines.slice(1) : lines;
  if (!headerMatches) {
    errors.push("Hlavička CSV neodpovídá formátu z „Exportovat do CSV“ — zkouším řádky přesto načíst.");
  }

  dataLines.forEach((line, idx) => {
    const rowNum = idx + (headerMatches ? 2 : 1);
    const [date, time, type, name, calories, protein, fat, carbs, source, roughEstimate] = parseCsvLine(line);

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Řádek ${rowNum}: neplatné datum "${date ?? ""}".`);
      return;
    }
    if (!VALID_TYPES.includes(type as MealItem["type"])) {
      errors.push(`Řádek ${rowNum}: neznámý typ jídla "${type ?? ""}".`);
      return;
    }
    const caloriesNum = Number(calories);
    if (!name?.trim() || !Number.isFinite(caloriesNum) || caloriesNum <= 0) {
      errors.push(`Řádek ${rowNum}: chybí název nebo neplatné kalorie.`);
      return;
    }

    const meal: ImportedMeal = {
      date,
      time: time || "12:00",
      type: type as MealItem["type"],
      name: name.trim(),
      value: Math.round(caloriesNum),
    };
    const proteinNum = Number(protein);
    if (protein && Number.isFinite(proteinNum)) meal.protein = Math.round(proteinNum);
    const fatNum = Number(fat);
    if (fat && Number.isFinite(fatNum)) meal.fat = Math.round(fatNum);
    const carbsNum = Number(carbs);
    if (carbs && Number.isFinite(carbsNum)) meal.carbs = Math.round(carbsNum);
    if (VALID_SOURCES.includes(source as NonNullable<MealItem["source"]>)) {
      meal.source = source as MealItem["source"];
    }
    // C5 v AUDIT_2026-08-13.md — appka dřív tiše zahazovala příznak "Jím venku" (roughEstimate)
    // při exportu/importu; žádná nutriční data se tím neztratila, jen appka po reimportu
    // považovala hrubý odhad za měřená data.
    if (roughEstimate === "ano") meal.roughEstimate = true;

    meals.push(meal);
  });

  return { meals, errors };
}
