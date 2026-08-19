// Hranice denních částí. Sdílené UI nadpisem na Home i časovým blokem v cache klíči AI pozdravu
// (viz fetchGreeting v Home.tsx) — díky tomu se pozdrav od Myi obnoví přesně tehdy, kdy se změní
// nadpis nad ním, ne dřív (appka tak zaplatí max 4 volání OpenAI denně na jeden počet jídel).
export const GREETING_NIGHT_UNTIL_HOUR = 5;
export const GREETING_MORNING_UNTIL_HOUR = 10;
export const GREETING_DAY_UNTIL_HOUR = 18;
export const GREETING_EVENING_UNTIL_HOUR = 22;

export type TimeOfDay = "morning" | "day" | "evening" | "night";

/**
 * Stejný "hodina z Date" pattern jako computeMealReminderStatus (mealReminder.ts) nebo
 * guessMealType (AddMealModal.tsx) — čistá funkce s injektovatelnými hodinami, ať jde otestovat
 * hranice bez mockování systémového času.
 *
 * "night" je jediná část přes půlnoc (22:00–4:59), takže se neřeší jako jeden AND rozsah, ale
 * dvěma větvemi — před ranní hranicí a za večerní. Ve 2:00 tak appka nepozdraví "Krásné ráno",
 * což byl stejný druh nesmyslu jako ranní pozdrav v devět večer.
 */
export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours();
  if (hour < GREETING_NIGHT_UNTIL_HOUR) return "night";
  if (hour < GREETING_MORNING_UNTIL_HOUR) return "morning";
  if (hour < GREETING_DAY_UNTIL_HOUR) return "day";
  if (hour < GREETING_EVENING_UNTIL_HOUR) return "evening";
  return "night";
}

const GREETING_BY_TIME_OF_DAY: Record<TimeOfDay, string> = {
  morning: "Krásné ráno",
  day: "Krásný den",
  evening: "Hezký večer",
  night: "Dobrou noc",
};

const SUBTITLE_BY_TIME_OF_DAY: Record<TimeOfDay, string> = {
  morning: "Ať ti den vyjde.",
  day: "Ať se ti den daří.",
  evening: "Ať máš klidný večer.",
  night: "Ať se ti dobře spí.",
};

/** Oslovení v hlavičce Home — bez jména, to k němu appka přilepí až v JSX. */
export function getTimeGreetingCs(now: Date = new Date()): string {
  return GREETING_BY_TIME_OF_DAY[getTimeOfDay(now)];
}

/**
 * Podtitulek pod oslovením. Dřív tu bylo natvrdo "Dnes to bude skvělý den." — budoucí čas, který
 * ve 21:00 nedával smysl ze stejného důvodu jako ranní pozdrav večer.
 */
export function getTimeSubtitleCs(now: Date = new Date()): string {
  return SUBTITLE_BY_TIME_OF_DAY[getTimeOfDay(now)];
}
