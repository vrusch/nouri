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

export interface WeekdayWeekendProteinBreakdown {
  weekdayAvgProtein: number;
  weekdayDaysLogged: number;
  weekendAvgProtein: number;
  weekendDaysLogged: number;
}

function isWeekendDate(dateISO: string): boolean {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

/**
 * Rozdělí spolehlivé dny (viz buildDailyProteinRecords v macroPattern.ts) na všední/víkendové
 * a spočítá průměr bílkovin pro obě skupiny — vstup pro Týdenní AI shrnutí (FEATURE_IDEAS.md
 * sekce 3), appka takhle Mye dá číselný podklad, aby netvořila srovnání jen z dojmu.
 */
export function computeWeekdayWeekendProteinBreakdown(
  records: { date: string; totalProtein: number; reliable: boolean }[]
): WeekdayWeekendProteinBreakdown {
  const reliable = records.filter((r) => r.reliable);
  const weekday = reliable.filter((r) => !isWeekendDate(r.date));
  const weekend = reliable.filter((r) => isWeekendDate(r.date));
  const avg = (days: typeof reliable) =>
    days.length > 0 ? Math.round(days.reduce((sum, r) => sum + r.totalProtein, 0) / days.length) : 0;

  return {
    weekdayAvgProtein: avg(weekday),
    weekdayDaysLogged: weekday.length,
    weekendAvgProtein: avg(weekend),
    weekendDaysLogged: weekend.length,
  };
}
