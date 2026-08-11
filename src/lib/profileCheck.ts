import { daysSince } from "./weighIn";

// Jak často appka nabídne "pořád ti sedí profil?" — viz FEATURE_IDEAS.md sekce 8.
export const PROFILE_CHECK_INTERVAL_DAYS = 21;

export interface ProfileCheckStatus {
  daysSinceCheck: number | null;
  checkOverdue: boolean;
}

/**
 * Bez záznamu (`lastCheckISO` chybí) je `checkOverdue` vždy true — na rozdíl od váhy appka
 * u profilu nemá žádný jiný signál, kdy byl naposledy skutečně zkontrolovaný, takže "nikdy
 * neověřeno" se počítá jako "po termínu". Nové účty tomu unikají tím, že Onboarding při
 * dokončení nastaví `lastProfileCheckAt` rovnou na dnešek.
 */
export function computeProfileCheckStatus(
  lastCheckISO: string | null | undefined,
  todayISO: string = new Date().toISOString().split("T")[0]
): ProfileCheckStatus {
  if (!lastCheckISO) return { daysSinceCheck: null, checkOverdue: true };
  const daysSinceCheck = daysSince(lastCheckISO, todayISO);
  return { daysSinceCheck, checkOverdue: daysSinceCheck >= PROFILE_CHECK_INTERVAL_DAYS };
}
