// Jak často appka (deterministicky, ne náhodně) nahradí AI pozdrav vlastní připomínkou —
// "occasionally" musí být testovatelné pravidlo, ne Math.random() v efektu.
const REMINDER_DAY_INTERVAL = 4;

/**
 * Vybere vlastní připomínku pro daný den místo AI pozdravu, nebo null, pokud dnes appka
 * má sáhnout po AI. Deterministické podle data (den v měsíci) — stejné datum = stejný
 * výsledek, takže se dá volat opakovaně (např. z cache efektu v Home.tsx) beze změny.
 * Bez vlastních připomínek appka vždy vrací null.
 */
export function pickDailyCustomReminder(customReminders: string[], dateISO: string): string | null {
  if (customReminders.length === 0) return null;

  const dayOfMonth = Number(dateISO.split("-")[2]);
  if (dayOfMonth % REMINDER_DAY_INTERVAL !== 0) return null;

  return customReminders[dayOfMonth % customReminders.length];
}
