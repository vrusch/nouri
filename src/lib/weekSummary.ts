export interface WeekSummary {
  avgCalories: number;
  daysLogged: number;
}

/**
 * Průměr kalorií za týden počítaný jen z dní, kdy bylo něco zapsáno — stejná konvence,
 * jakou dřív používal inline výpočet ve Stats.tsx (nezapsaný den nesnižuje průměr k nule).
 * `daysLogged` musí appka ukazovat vždy vedle průměru, ne ho schovávat — 1850 kcal/den
 * z jednoho zapsaného dne a 1850 kcal/den ze sedmi nejsou stejně důvěryhodné číslo.
 */
export function summarizeWeek(dailyTotals: number[]): WeekSummary {
  const loggedDays = dailyTotals.filter((v) => v > 0);
  const avgCalories =
    loggedDays.length > 0 ? Math.round(loggedDays.reduce((a, b) => a + b, 0) / loggedDays.length) : 0;
  return { avgCalories, daysLogged: loggedDays.length };
}
