# Changelog

Všechny významné změny v projektu Nouri budou zaznamenány v tomto souboru.

## [0.4.0] - 2026-03-16
### Přidáno
- **Rozšířený Onboarding**: Sběr dat o datu narození a úrovni aktivity pro přesnější výpočty.
- **Mya Insight (AI)**: V profilu je nyní možné generovat kompletní osobní analýzu těla a doporučení pomocí AI.
- **Živé metriky**: V profilu se v reálném čase počítá BMR a TDEE na základě uživatelských dat.
- **Adaptivní barvy**: Rozhraní se nyní dynamicky zabarvuje podle pohlaví (růžová/modrá) napříč celou aplikací.
- **UI vychytávky**: Přidány animace pro rozbalovací sekce v profilu a nová CSS třída `mask-fade-bottom`.

### Vylepšeno
- **UX**: Přehlednější editační režimy v profilu s okamžitým potvrzením změn.
- **Navigace**: Vizuální indikace postupu v onboardingu přes vylepšený progress bar.

### Technické
- **Typy**: Rozšířen `UserProfile` v `AuthContext` o `birthDate` a `activityLevel`.
- **Plán**: Aktualizace `AI_PLAN.md` na verzi 0.3.5 reflektující aktuální stav implementace.

## [0.3.0] - 2026-03-16

### Přidáno
- **Email/Heslo Autentizace**: Možnost registrace a přihlášení pomocí emailu přímo v onboardingu.
- **Dynamický vizuál**: Pozadí aplikace se nyní jemně zabarvuje podle pohlaví uživatele (růžová pro ženy, modrá pro muže).
- **Interaktivní Profil**: Kompletně přepracovaný profil s možností měnit jméno, váhu a výšku přímo kliknutím a uložením do DB.
- **Bezpečný výběr cíle**: Nový systém pro změnu cíle (hubnutí/nabírání) formou rozbalovacího menu.
- **AI Plán**: Vytvořena roadmapa `AI_PLAN.md` pro budoucí implementaci agentů.

### Vylepšeno
- **UX/UI**: Změna hlavního pozadí na jemnější odstín (`slate-50`) pro úlevu očím a prémiový iOS vzhled.
- **Barvy**: Odstranění agresivní červené barvy u odhlášení a správy dat pro klidnější dojem.
- **Dark Mode**: Opravena čitelnost a barvy textů v přihlašovacím formuláři v tmavém režimu.

### Technické
- **Automatizace**: Verze v patičce profilu se nyní načítá automaticky z `package.json`.

## [0.2.2] - 2026-03-16

### Opraveno
- **TypeScript**: Odstranění nepoužitého importu `Shield` v `Profile.tsx`, který blokoval build na Vercelu.
- **UI**: Aktualizace zobrazené verze v patičce profilu.

## [0.2.1] - 2026-03-16

### Opraveno
- **TypeScript**: Oprava importů typů (`type-only imports`) pro kompatibilitu s Vercel buildem (`verbatimModuleSyntax`).
- **Cleanup**: Odstranění nepoužitých importů v Onboarding komponentě.

## [0.2.0] - 2026-03-16

### Přidáno
- **Firebase Auth**: Integrováno přihlašování přes Google a Email/Heslo.
- **Firebase Firestore**: Implementováno ukládání a načítání profilu uživatele z cloudu.
- **Onboarding Flow**: Nový průvodce při prvním spuštění (nastavení jména, pohlaví, výšky, váhy a cíle).
- **Personalizace**: Dynamický pozdrav a kalorický limit na domovské obrazovce podle dat z profilu.
- **Pročištěný Profil**: Nové funkční rozhraní s kartičkami metrik, správou dat a informacemi o verzi.
- **Bezpečnost**: Aktualizován `.gitignore` pro ochranu citlivých souborů `.env`.
- **Vizuální vylepšení**: Čistě bílé texty v tmavém režimu pro lepší čitelnost na Home screen.

### Opraveno
- **Layout**: Oprava scrollování s pevnou spodní navigací (`h-dvh` a flex struktura).
- **Témata**: Oprava přepínání tmavého režimu v Tailwind v4 pomocí `@custom-variant dark`.

## [0.1.0] - 2026-03-16
