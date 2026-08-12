export function formatDaysCs(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

export function formatMealsCs(n: number): string {
  if (n === 1) return "1 jídlo";
  if (n >= 2 && n <= 4) return `${n} jídla`;
  return `${n} jídel`;
}

export function formatRowsCs(n: number): string {
  if (n === 1) return "1 řádek";
  if (n >= 2 && n <= 4) return `${n} řádky`;
  return `${n} řádků`;
}

export function formatGlassesCs(n: number): string {
  if (n === 1) return "1 sklenice";
  if (n >= 2 && n <= 4) return `${n} sklenice`;
  return `${n} sklenic`;
}

export function formatWorkoutsCs(n: number): string {
  if (n === 1) return "1 trénink";
  if (n >= 2 && n <= 4) return `${n} tréninky`;
  return `${n} tréninků`;
}
