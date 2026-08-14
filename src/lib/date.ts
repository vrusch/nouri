// AUDIT_2026-08-14.md N10 — `new Date().toISOString().split("T")[0]` vrací UTC datum,
// appka cílí na ČR (UTC+1/+2). Mezi lokální půlnocí a UTC rolloverem appka omylem
// vyhodnotí "dnešek" jako včerejšek. Tahle funkce skládá ISO datum z lokálních komponent.
export function getLocalDateISO(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
