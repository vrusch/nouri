// Dnešní kalorická bilance jako text do promptu — sdílí ji getDailyGreeting i chatWithMya, ať
// obě místa popisují stejný stav stejnými slovy.
//
// REGRESE (testování 2026-10-10): pozdrav při 1709 kcal z cíle 1920 tvrdil "Dnes jsi
// překročila kalorický cíl o 211 kcal", zatímco Home ukazovala "Zbývá ti 211 kcal". Klient
// i server počítají cíl stejně a stejné číslo 211 s opačným znaménkem ukazuje, že gpt-4o-mini
// nejspíš jen otočil "Zbývá: 211 kcal" — přísný styl i pořadí priorit v system promptu mu
// "překročení" vkládaly do úst. Proto každá větev nese výslovné slovo STAV a prompt smí
// o dnešním překročení mluvit jen u STAV: PŘEKROČENO (viz INTAKE_STATUS_RULE).

// Jen pro DNEŠEK — včerejšek (pozdrav) i předchozí dny (chat) mají v datech vlastní řádek
// s "přes cíl o X kcal" a o těch Mya mluvit smí.
export const INTAKE_STATUS_RULE =
  'O DNEŠNÍM překročení kalorického cíle mluv JEN když data výslovně uvádějí "STAV: PŘEKROČENO". ' +
  'Při "STAV: POD CÍLEM" uživatel dnešní cíl NEPŘEKROČIL — nikdy netvrď opak a číslo "zbývá" nevydávej za překročení. ' +
  "Včerejšek a předchozí dny posuzuj jen podle jejich vlastního řádku v datech.";

/**
 * Stejná hranice jako Home (getDayTrafficLight / getCalorieOverage v src/lib/nutrition.ts):
 * přes cíl = snězeno víc než cíl, přesně na cíli je ještě v pořádku.
 */
export function describeIntakeStatusCs(
  consumedCalories: number,
  targetCalories: number,
  consumedProtein: number,
  targetProtein: number,
  // Pozdrav na Home dostává bílkoviny zvlášť, jen dosažitelnou část (MYA_COACH_SPEC D6). Bez
  // bílkovin ve STAV řádku úplně — ze snědeného množství a cíle by si model celou mezeru dopočítal
  // sám a ocitoval ji bez ohledu na pravidla v promptu.
  options: { omitProtein?: boolean } = {}
): string {
  const consumed = Math.round(consumedCalories);
  const target = Math.round(targetCalories);
  const protein = Math.round(consumedProtein);
  const proteinRemaining = Math.max(0, Math.round(targetProtein - consumedProtein));
  const proteinText = options.omitProtein ? "" : `; bílkoviny ${protein} g, do cíle chybí ${proteinRemaining} g`;

  // C1 v REFERENCE/DATA_COMPLETENESS_PLAN.md — "nic nezapsáno" není totéž co "nic nesnědeno".
  if (consumed === 0) {
    return `STAV: NIC NEZAPSÁNO — dnes zatím nic nezapsal(a) do appky (nejde poznat, jestli ještě nejedl(a), nebo to jen ještě nezapsal(a)). Cíl: ${target} kcal.`;
  }
  if (consumed > target) {
    return `STAV: PŘEKROČENO — dnes snědeno ${consumed} kcal z cíle ${target} kcal, tedy PŘES cíl o ${consumed - target} kcal${options.omitProtein ? "" : ` (bílkoviny ${protein} g)`}.`;
  }
  return `STAV: POD CÍLEM (cíl nepřekročen) — dnes snědeno ${consumed} kcal z cíle ${target} kcal, zbývá ještě ${target - consumed} kcal${proteinText}.`;
}

// --- Zbytek dne a dosažitelné bílkoviny (MYA_COACH_SPEC 5.3, D5, D6) ---
// Rozbor z 2026-10-11: zbývalo 245 kcal a chybělo 48 g bílkovin. 48 g = 192 kcal, tedy 78 %
// zbytku — tolik bílkovin na kalorii mají jen skoro čisté zdroje bílkovin. Model to sám
// nespočítá, proto hustotu a proveditelnost počítá appka a modelu ji jen podá.

// Nejvyšší reálná hustota bílkovin celého jídla: kuřecí prsa ~21 g/100 kcal, odtučněný tvaroh
// a skyr ~17, bílky ~22. Víc se do zbývajících kalorií nevejde ani s čistými zdroji.
export const MAX_PROTEIN_PER_100_KCAL = 20;
// Hranice hustoty pro popis, jaké jídlo mezeru pokryje (g bílkovin na 100 kcal).
const LEAN_PROTEIN_DENSITY = 12;
const MODERATE_PROTEIN_DENSITY = 6;
// Menší mezeru nemá smysl řešit (D5).
export const MIN_PROTEIN_GAP_G = 10;
// Pozdě večer Mya mezeru nehoní (D5). Záloha, dokud appka nezná její obvyklý čas posledního jídla.
export const LATE_EVENING_HOUR = 21;

/** Kolik z chybějících bílkovin se reálně vejde do zbývajících kalorií. */
export function achievableProteinGap(remainingCalories: number, proteinGap: number): number {
  if (remainingCalories <= 0 || proteinGap <= 0) return 0;
  return Math.min(Math.round(proteinGap), Math.floor((remainingCalories * MAX_PROTEIN_PER_100_KCAL) / 100));
}

export interface RemainingToday {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  hasIncompleteMacroData: boolean;
  localHour?: number;
}

/**
 * Řádek „Zbývá dnes“ pro chat: zbytek kcal a maker plus věta, jaké jídlo by bílkoviny pokrylo.
 * undefined = dnes nic nezbývá (přes cíl řeší STAV řádek) nebo nic není zapsané.
 */
export function describeRemainingTodayCs(remaining: RemainingToday): string | undefined {
  const calories = Math.round(remaining.calories);
  if (calories <= 0) return undefined;
  const protein = Math.max(0, Math.round(remaining.protein));
  const carbs = Math.max(0, Math.round(remaining.carbs));
  const fat = Math.max(0, Math.round(remaining.fat));
  const approx = remaining.hasIncompleteMacroData ? " (makra orientačně — některé jídlo nemá rozpad)" : "";
  let line = `Zbývá dnes: ${calories} kcal, bílkoviny ${protein} g, sacharidy ${carbs} g, tuky ${fat} g${approx}.`;

  if (remaining.localHour !== undefined && remaining.localHour >= LATE_EVENING_HOUR) {
    return `${line} Je pozdě večer — mezeru už nehoň: dojídat nemusí, když má hlad, stačí lehká menší porce.`;
  }
  if (protein < MIN_PROTEIN_GAP_G) return line;

  const density = (protein * 100) / calories;
  const achievable = achievableProteinGap(calories, protein);
  if (density > MAX_PROTEIN_PER_100_KCAL) {
    line += ` Celé bílkoviny se do zbývajících kalorií nevejdou ani s čistými zdroji — reálně jde dohnat ~${achievable} g, a to stačí.`;
  } else if (density >= LEAN_PROTEIN_DENSITY) {
    line += ` Na pokrytí bílkovin by jídlo muselo mít ~${Math.round(density)} g bílkovin na 100 kcal — to splňují jen skoro čisté zdroje bílkovin (kuřecí nebo krůtí prsa, tuňák ve vlastní šťávě, odtučněný tvaroh, skyr, bílky).`;
  } else if (density >= MODERATE_PROTEIN_DENSITY) {
    line += ` Na pokrytí bílkovin stačí jídlo s ~${Math.round(density)} g bílkovin na 100 kcal — libové maso, ryba, vejce, mléčné výrobky, luštěniny.`;
  }
  return line;
}

/**
 * Bílkoviny k dohnání pro pozdrav na Home (D6): jen dosažitelná část, pozdě večer nic.
 * undefined = pozdrav o chybějících bílkovinách mlčí.
 */
export function greetingProteinToCatchUp(
  remainingCalories: number,
  proteinGap: number,
  localHour: number | undefined
): number | undefined {
  if (localHour !== undefined && localHour >= LATE_EVENING_HOUR) return undefined;
  const achievable = achievableProteinGap(remainingCalories, proteinGap);
  return achievable >= MIN_PROTEIN_GAP_G ? achievable : undefined;
}
