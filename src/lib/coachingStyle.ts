// Styl Myi (REFERENCE/STRICT_COACHING_SPEC.md, sekce 4) — obě testerky chtěly přísnější vedení,
// ale jako volbu v Profilu, ne natvrdo změněný tón pro všechny. Chybějící pole v profilu
// (starší účty, starší build appky) = "balanced", žádná migrace potřeba.
//
// Přísnost míří jen na přejídání a zapomínání, nikdy na nízký příjem — karta nízkého příjmu
// (calorieIntakePattern.ts) zůstává pečující v každém stylu, viz principy v spec dokumentu.

export type CoachingStyle = "gentle" | "balanced" | "strict";

export const DEFAULT_COACHING_STYLE: CoachingStyle = "balanced";

export const COACHING_STYLE_OPTIONS: { value: CoachingStyle; label: string; description: string }[] = [
  { value: "gentle", label: "Jemná", description: "Povzbuzuje, nekárá." },
  { value: "balanced", label: "Vyvážená", description: "Řekne na rovinu, když něco nesedí." },
  { value: "strict", label: "Přísná", description: "Hlídá tě a nenechá nic projít." },
];

export function resolveCoachingStyle(value: unknown): CoachingStyle {
  return value === "gentle" || value === "balanced" || value === "strict" ? value : DEFAULT_COACHING_STYLE;
}

export function getCoachingStyleLabel(style: CoachingStyle): string {
  return COACHING_STYLE_OPTIONS.find((o) => o.value === style)?.label ?? "Vyvážená";
}

/**
 * O kolik sklenic smí voda zaostávat za průběžným tempem (computeWaterPaceStatus ve water.ts),
 * než appka připomene. Přísný styl připomíná hned při první chybějící sklenici.
 */
export function getWaterBehindThreshold(style: CoachingStyle): number {
  if (style === "gentle") return 3;
  if (style === "strict") return 1;
  return 2;
}

/**
 * Volný den / dovolená dřív tlumila připomínku jídla vždy. Testerky chtěly, aby appka vedla
 * i o volnu — ale jen v přísném stylu, ostatní si zachovávají původní chování. Voda se
 * volnem neztlumí nikdy (pitný režim není dieta) a vážení se ztlumí vždy (to rozhodnutí
 * zůstává beze změny).
 */
export function shouldMuteMealRemindersOnVacation(style: CoachingStyle): boolean {
  return style !== "strict";
}
