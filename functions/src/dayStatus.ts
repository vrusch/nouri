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
  targetProtein: number
): string {
  const consumed = Math.round(consumedCalories);
  const target = Math.round(targetCalories);
  const protein = Math.round(consumedProtein);
  const proteinRemaining = Math.max(0, Math.round(targetProtein - consumedProtein));

  // C1 v REFERENCE/DATA_COMPLETENESS_PLAN.md — "nic nezapsáno" není totéž co "nic nesnědeno".
  if (consumed === 0) {
    return `STAV: NIC NEZAPSÁNO — dnes zatím nic nezapsal(a) do appky (nejde poznat, jestli ještě nejedl(a), nebo to jen ještě nezapsal(a)). Cíl: ${target} kcal.`;
  }
  if (consumed > target) {
    return `STAV: PŘEKROČENO — dnes snědeno ${consumed} kcal z cíle ${target} kcal, tedy PŘES cíl o ${consumed - target} kcal (bílkoviny ${protein} g).`;
  }
  return `STAV: POD CÍLEM (cíl nepřekročen) — dnes snědeno ${consumed} kcal z cíle ${target} kcal, zbývá ještě ${target - consumed} kcal; bílkoviny ${protein} g, do cíle chybí ${proteinRemaining} g.`;
}
