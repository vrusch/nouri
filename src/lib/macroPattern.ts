// Jak dlouho appka po potvrzení mlčí, než stejný vzorek příjmu bílkovin nabídne znovu — stejná
// "cooldown" logika jako lastProfileCheckAt (viz profileCheck.ts), jen jiné pole v profilu.
export const MACRO_PATTERN_COOLDOWN_DAYS = 14;

const MIN_RELIABLE_DAYS = 7;
const LOW_RATIO = 0.7; // pod 70 % cíle se den počítá jako "nízký"
const LOW_DAY_FRACTION = 0.7; // aspoň 70 % spolehlivých dní musí být nízkých

export interface DailyProteinRecord {
  date: string;
  totalProtein: number;
  reliable: boolean;
}

/**
 * Sečte bílkoviny po dnech. Den je `reliable: false`, pokud aspoň jedno jídlo nemá zapsané
 * protein — jinak by appka chybějící data počítala jako 0g snězeno a nahlásila "nízký příjem"
 * i uživateli, který jen nezapsal makra, ne že by nejedl bílkoviny. Ze stejného důvodu je
 * nespolehlivý i den s jídlem zapsaným v režimu "Jím venku" (`roughEstimate`, viz AddMealModal) —
 * i když má protein vyplněný, jde o hrubý odhad podle kategorie, ne měřená data.
 */
// excludeDates (typicky dnešek) appce dovolí vyloučit ještě neskončený den z okna, aniž by
// appka musela filtrovat holým `r.date < today` v Stats.tsx, kde by to nešlo unit testovat
// (B5 v AUDIT_2026-08-13.md, stejná chybová třída jako opravená "Skvělé tempo" při 0 kcal).
export function buildDailyProteinRecords(
  meals: { date: string; protein?: number; roughEstimate?: boolean }[],
  excludeDates?: string[]
): DailyProteinRecord[] {
  const excluded = new Set(excludeDates ?? []);
  const byDate = new Map<string, { total: number; reliable: boolean }>();
  meals.forEach((m) => {
    if (excluded.has(m.date)) return;
    const entry = byDate.get(m.date) ?? { total: 0, reliable: true };
    entry.total += m.protein ?? 0;
    if (m.protein === undefined || m.roughEstimate) entry.reliable = false;
    byDate.set(m.date, entry);
  });
  return Array.from(byDate, ([date, { total, reliable }]) => ({ date, totalProtein: total, reliable }));
}

export interface LowProteinPatternResult {
  detected: boolean;
  reliableDaysConsidered: number;
  daysBelowTarget: number;
  avgProtein: number;
}

/**
 * Rozpozná dlouhodobě nízký příjem bílkovin z už předfiltrovaného okna dní (např. posledních
 * 14 kalendářních dní — filtrování je na volající straně, stejně jako u calibrateTarget).
 * Bere v potaz jen `reliable` dny; pokud jich je málo, appka radši mlčí, než aby hádala
 * z neúplných dat.
 */
export function detectLowProteinPattern(
  records: DailyProteinRecord[],
  targetProtein: number
): LowProteinPatternResult {
  const reliable = records.filter((r) => r.reliable);
  const threshold = targetProtein * LOW_RATIO;
  const belowCount = reliable.filter((r) => r.totalProtein < threshold).length;
  const avgProtein =
    reliable.length > 0 ? Math.round(reliable.reduce((sum, r) => sum + r.totalProtein, 0) / reliable.length) : 0;
  const detected = reliable.length >= MIN_RELIABLE_DAYS && belowCount / reliable.length >= LOW_DAY_FRACTION;

  return { detected, reliableDaysConsidered: reliable.length, daysBelowTarget: belowCount, avgProtein };
}
