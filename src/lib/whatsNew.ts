// "Co je nového" po aktualizaci appky. Krátké body psané pro uživatelku (ne technický
// CHANGELOG.md) — vyplňuje je SP mandát spolu s CHANGELOG.md (viz CLAUDE.md). Verze bez změny,
// kterou by uživatelka poznala (interní úklid, čistě serverové opravy), sem nepatří — modal
// se pak po takové aktualizaci vůbec neukáže. Nejnovější verze nahoře.

export interface WhatsNewEntry {
  version: string; // SemVer z package.json
  items: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: "0.20.0",
    items: [
      "Mya v chatu teď vidí tvůj den — jídla, vodu, trénink i váhu — a umí ti říct, jak na tom jsi.",
      "Pozdrav od Myi se obnoví po každé sklenici vody i úpravě jídla a už si neplete „zbývá“ s „překročila“.",
      "Fotku jídla, lednice i progress fotku jde nahrát i z galerie, nejen rovnou vyfotit.",
      "Obrazovka se už omylem nepřiblíží roztažením prstů.",
    ],
  },
];

// Verze, kterou tohle zařízení naposledy vidělo. localStorage (ne profil ve Firestore) záměrně:
// aktualizace probíhá per zařízení (iPhone z plochy i prohlížeč mají každý svůj service worker),
// takže i "už jsem to viděla" patří k zařízení.
const LAST_SEEN_VERSION_KEY = "nouri_last_seen_version";

export function readLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function markVersionSeen(version: string) {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // localStorage nemusí být dostupné (privátní režim) — modal se pak ukáže znovu po reloadu.
  }
}

/** Porovná dvě SemVer verze (jen major.minor.patch) — záporné, nula, nebo kladné jako u sort. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Co ukázat po spuštění verze `currentVersion`, když zařízení naposledy vidělo `lastSeenVersion`.
 * Všechny přeskočené verze (lastSeen < verze ≤ current) od nejnovější, prázdné vynechá.
 *
 * lastSeenVersion === null (zařízení si verzi ještě nikdy nezapsalo — appka z doby před touhle
 * funkcí; nová instalace si verzi zapíše už při onboardingu, viz App.tsx) ukáže jen aktuální
 * verzi: uživatelka, která aktualizovala ze starší verze, tak novinky uvidí, ale nedostane
 * výpis celé historie.
 */
export function getWhatsNewSince(
  lastSeenVersion: string | null,
  currentVersion: string,
  entries: WhatsNewEntry[] = WHATS_NEW
): WhatsNewEntry[] {
  return entries
    .filter((e) => e.items.length > 0 && compareVersions(e.version, currentVersion) <= 0)
    .filter((e) =>
      lastSeenVersion === null
        ? compareVersions(e.version, currentVersion) === 0
        : compareVersions(e.version, lastSeenVersion) > 0
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}
