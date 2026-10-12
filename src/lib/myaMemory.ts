// "Co o mně Mya ví" (REFERENCE/MYA_COACH_SPEC.md 5.5) — začátek cesty a volný text, který Mya
// dostane s každou zprávou v chatu. Uživatelka zhubla se ChatGPT 31 kg a ChatGPT o ní ví 7 měsíců;
// tímhle mu Mya ten kontext převezme. Server text ořezává a čte jako data, ne jako pokyny
// (functions/src/userStory.ts) — limit délky musí sedět s tamním MAX_MEMORY_LENGTH.

export const MAX_MYA_MEMORY_LENGTH = 3000;

// Jednorázový dotaz pro ChatGPT — jeho odpověď uživatelka vloží do paměti.
export const CHATGPT_SUMMARY_PROMPT =
  "Shrň všechno, co o mně víš o mém hubnutí a stravování: odkud a kam jsem došla (váhy a kdy), co mi fungovalo " +
  "a co ne, co nemám ráda nebo nejím, jaké mám návyky, kdy a jak jím a v čem mi to nejde. Piš stručně česky v bodech, " +
  "nejvýš 2500 znaků.";

export interface MyaMemoryFields {
  journeyStartWeight: number | undefined;
  journeyStartDate: string | undefined;
  myaMemory: string | undefined;
}

export type MyaMemoryFormResult = { ok: true; fields: MyaMemoryFields } | { ok: false; error: string };

/**
 * Formulář → pole profilu. Prázdné pole = undefined (updateProfile ho z profilu smaže).
 * Váha jako v Onboardingu (30–300 kg, s desetinnou čárkou), datum ne v budoucnosti.
 */
export function parseMyaMemoryForm(
  input: { startWeight: string; startDate: string; memory: string },
  todayISO: string
): MyaMemoryFormResult {
  const weightRaw = input.startWeight.trim().replace(",", ".");
  const weight = weightRaw === "" ? undefined : Number(weightRaw);
  if (weight !== undefined && (!Number.isFinite(weight) || weight < 30 || weight > 300)) {
    return { ok: false, error: "Váhu na začátku zadej v kilech (30–300)." };
  }
  const date = input.startDate.trim() || undefined;
  if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO)) {
    return { ok: false, error: "Datum začátku nemůže být v budoucnosti." };
  }
  const memory = input.memory.trim().slice(0, MAX_MYA_MEMORY_LENGTH).trim() || undefined;
  return {
    ok: true,
    fields: {
      journeyStartWeight: weight === undefined ? undefined : Math.round(weight * 10) / 10,
      journeyStartDate: date,
      myaMemory: memory,
    },
  };
}
