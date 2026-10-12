// Její příběh a dlouhodobá paměť pro chat (MYA_COACH_SPEC 5.5). Uživatelka zhubla se ChatGPT
// za 7 měsíců ze 115 na 84 kg a ChatGPT to ví. Mya bez toho bere za start první vážení v appce
// a o jejích zkušenostech neví nic. Proto profil nese začátek cesty a text „Co o mně Mya ví“,
// který si uživatelka píše sama (nebo do něj vloží shrnutí od ChatGPT).
//
// Paměť jde s každou zprávou do SYSTÉMOVÉ části promptu a je to nedůvěryhodný vstup jako kontext
// dne: délka se ořízne na serveru, řídicí znaky a značky ohraničení bloku z textu zmizí, ať text
// nemůže blok „data, ne pokyny“ předčasně ukončit.

export const MAX_MEMORY_LENGTH = 3000;

export const MEMORY_BLOCK_START = "<<<INFORMACE O UŽIVATELCE — začátek>>>";
export const MEMORY_BLOCK_END = "<<<INFORMACE O UŽIVATELCE — konec>>>";

export interface UserStory {
  journeyStartWeight?: number;
  journeyStartDate?: string; // YYYY-MM-DD
  memory?: string;
}

/**
 * Víceřádkový volný text do promptu. Na rozdíl od sanitizePromptText řádky nechává (paměť jsou
 * odstavce a odrážky), ale sjednotí konce řádků, zahodí ostatní řídicí znaky, zkrátí víc prázdných
 * řádků za sebou a odstraní `<<<`/`>>>`, kterými appka ohraničuje blok.
 */
export function sanitizePromptMultiline(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n?/g, "\n");
  // Řídicí znaky kromě konce řádku a tabulátoru pryč (filtr místo regexu s řídicími znaky).
  const printable = Array.from(normalized)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch === "\n" || ch === "\t" || (code >= 32 && code !== 127);
    })
    .join("");
  const cleaned = printable
    .replace(/<{3,}|>{3,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength).trim() : undefined;
}

function isoDate(value: unknown, now: Date): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return undefined;
  return value;
}

/** Příběh z profilu od klienta (celý UserProfile) — rozbitá pole vypadnou. */
export function parseUserStory(profile: unknown, now: Date = new Date()): UserStory {
  if (!profile || typeof profile !== "object") return {};
  const raw = profile as Record<string, unknown>;
  const story: UserStory = {};
  const weight = raw.journeyStartWeight;
  if (typeof weight === "number" && Number.isFinite(weight) && weight >= 20 && weight <= 500) story.journeyStartWeight = weight;
  const date = isoDate(raw.journeyStartDate, now);
  if (date) story.journeyStartDate = date;
  const memory = sanitizePromptMultiline(raw.myaMemory, MAX_MEMORY_LENGTH);
  if (memory) story.memory = memory;
  return story;
}

function formatKg(weight: number): string {
  return `${(Math.round(weight * 10) / 10).toString().replace(".", ",")} kg`;
}

function monthsBetween(fromIso: string, now: Date): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
}

function formatMonthsCs(months: number): string {
  if (months === 1) return "1 měsíc";
  if (months >= 2 && months <= 4) return `${months} měsíce`;
  return `${months} měsíců`;
}

/**
 * Řádek o začátku cesty. Váhy počítá appka, ať model neodčítá sám. undefined = začátek nevyplněný.
 */
export function describeJourneyCs(
  story: UserStory,
  currentWeight: number,
  gender: "female" | "male",
  now: Date = new Date()
): string | undefined {
  if (story.journeyStartWeight === undefined) return undefined;
  const diff = Math.round((currentWeight - story.journeyStartWeight) * 10) / 10;
  const since = story.journeyStartDate ? ` (${story.journeyStartDate})` : "";
  const months = story.journeyStartDate ? monthsBetween(story.journeyStartDate, now) : undefined;
  const span = months !== undefined && months > 0 ? ` za ${formatMonthsCs(months)}` : "";
  const ending = gender === "female" ? "a" : "";
  const change =
    diff < 0
      ? `zhubl${ending} ${formatKg(-diff)}${span}`
      : diff > 0
        ? `přibral${ending} ${formatKg(diff)}${span}`
        : "váha je stejná jako na začátku";
  return `Začátek cesty: ${formatKg(story.journeyStartWeight)}${since}, teď ${formatKg(currentWeight)} (váha z profilu) — ${change} (spočítala appka). Část cesty mohla proběhnout ještě před appkou, první vážení v appce není začátek.`;
}

/** Blok paměti do promptu, ohraničený značkami. undefined = paměť prázdná. */
export function formatMemoryBlock(story: UserStory): string | undefined {
  if (!story.memory) return undefined;
  return `${MEMORY_BLOCK_START}\n${story.memory}\n${MEMORY_BLOCK_END}`;
}
