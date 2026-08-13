/**
 * Fáze menstruačního cyklu, odhad průměrné délky cyklu z historie a luteální kalorický
 * bonus. Viz REFERENCE/CYCLE_TRACKING_PROPOSAL.md pro výzkum a zdůvodnění čísel níže —
 * appka tohle prezentuje jako hrubý, nastavitelný odhad, ne přesnou fyziologii.
 */

export type CyclePhase = "menstruation" | "follicular" | "ovulation" | "luteal";

export const DEFAULT_CYCLE_LENGTH_DAYS = 28;

// Menstruace trvá typicky ~5 dní. Luteální fáze je fyziologicky mnohem stabilnější než
// folikulární a drží se ~14 dní bez ohledu na celkovou délku cyklu, proto se ovulační den
// počítá odzadu (cycleLength - 14), ne jako pevný bod uprostřed.
const PERIOD_LENGTH_DAYS = 5;
const LUTEAL_PHASE_LENGTH_DAYS = 14;
const OVULATION_WINDOW_DAYS = 2;

export interface CyclePhaseInfo {
  phase: CyclePhase;
  dayInCycle: number; // 1-indexed, den 1 = datum posledního zaznamenaného začátku menstruace
}

/**
 * Odhadne aktuální fázi cyklu z historie zaznamenaných začátků menstruace. Vrací null bez
 * jediného záznamu (appka nemá od čeho počítat) nebo když je poslední záznam v budoucnosti.
 */
export function getCyclePhase(
  cycleLogs: { date: string }[],
  avgCycleLengthDays: number,
  todayISO: string
): CyclePhaseInfo | null {
  if (cycleLogs.length === 0) return null;

  const lastStart = [...cycleLogs].sort((a, b) => a.date.localeCompare(b.date)).pop()!.date;
  const daysSinceStart = Math.round(
    (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${lastStart}T00:00:00Z`)) / 86400000
  );
  if (daysSinceStart < 0) return null;

  const cycleLength = avgCycleLengthDays > 0 ? avgCycleLengthDays : DEFAULT_CYCLE_LENGTH_DAYS;
  const dayInCycle = (daysSinceStart % cycleLength) + 1;
  const ovulationDay = Math.max(1, cycleLength - LUTEAL_PHASE_LENGTH_DAYS);

  let phase: CyclePhase;
  if (dayInCycle <= PERIOD_LENGTH_DAYS) {
    phase = "menstruation";
  } else if (Math.abs(dayInCycle - ovulationDay) <= OVULATION_WINDOW_DAYS) {
    phase = "ovulation";
  } else if (dayInCycle < ovulationDay) {
    phase = "follicular";
  } else {
    phase = "luteal";
  }

  return { phase, dayInCycle };
}

// Appka si průběžně přepočítává vlastní průměr z posledních zápisů, nepředpokládá se
// pravidelnost. Bere jen posledních MAX_CYCLES_FOR_AVERAGE rozestupů, ať appku netáhne dolů
// jeden starý záznam, a ignoruje nepravděpodobné rozestupy (duplicitní zápis stejného dne,
// nebo mezera po vynechaném zápisu), aby appka nepočítala s vymyšleným číslem.
const MAX_CYCLES_FOR_AVERAGE = 6;
const MIN_PLAUSIBLE_CYCLE_DAYS = 15;
const MAX_PLAUSIBLE_CYCLE_DAYS = 60;

export function computeAvgCycleLength(cycleLogs: { date: string }[]): number | null {
  const sorted = [...cycleLogs].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-(MAX_CYCLES_FOR_AVERAGE + 1));

  const diffs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const diff = Math.round(
      (Date.parse(`${recent[i].date}T00:00:00Z`) - Date.parse(`${recent[i - 1].date}T00:00:00Z`)) / 86400000
    );
    if (diff >= MIN_PLAUSIBLE_CYCLE_DAYS && diff <= MAX_PLAUSIBLE_CYCLE_DAYS) diffs.push(diff);
  }
  if (diffs.length === 0) return null;
  return Math.round(diffs.reduce((sum, d) => sum + d, 0) / diffs.length);
}

export const PHASE_LABELS_CS: Record<CyclePhase, string> = {
  menstruation: "Menstruace",
  follicular: "Folikulární fáze",
  ovulation: "Ovulace",
  luteal: "Luteální fáze",
};

// Opatrný, pečující tón — stejný princip jako "Citlivé sledování nízkého příjmu" (Stats.tsx):
// appka informuje, nevaruje. Viz CYCLE_TRACKING_PROPOSAL.md sekce 5, Úroveň 0.
export const PHASE_NOTES_CS: Record<CyclePhase, string> = {
  menstruation: "Buď na sebe dnes hodná — únava a nižší energie jsou teď normální.",
  follicular: "Energie i nálada bývají v týhle fázi na vzestupu.",
  ovulation: "Jsi v období ovulace.",
  luteal: "Zadržování vody a chutě na sacharidy jsou teď normální — není to selhání diety.",
};

// Konzervativní střed z výzkumu (~50-100 kcal/den), ne blogové "100-300 kcal" — appka radši
// podhodnotí. Viz CYCLE_TRACKING_PROPOSAL.md sekce 3.1 a 5 (Úroveň 2).
export const LUTEAL_CALORIE_BONUS = 75;
