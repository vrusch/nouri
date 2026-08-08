# Changelog

Všechny významné změny v projektu Nouri budou zaznamenány v tomto souboru.

## [0.11.0] - 2026-08-08
### Přidáno
- **Testovací sada** — appka dřív neměla žádný test. Vitest (`npm test`): 46 unit/regresních testů pro `nutrition.ts`, `format.ts`, `weighIn.ts` a `cloudSync.ts` (mockovaný Firestore), včetně explicitních regresních testů na obě chyby nahlášené v ostrém provozu. Playwright E2E (`npm run test:e2e`): automatizuje ověření adaptivní kalibrace — jednorázový testovací účet, syntetická historie přes reálný appkový kód, kontrola karty a zápisu, úklid po sobě. Běží proti reálnému Firebase, spouští se jen na vyžádání.

### Opraveno
- **Denní pozdrav od Myi** počítal se zastaralým uloženým cílem kalorií místo živého přepočtu — teď používá stejnou cestu jako zbytek appky.

### Změněno
- Logika klasifikace vážení (`App.tsx`) a hlášky k dennímu postupu (`Home.tsx`) přesunuta do samostatných čistých funkcí (`src/lib/weighIn.ts`, `getProgressCaption`) — nutná příprava pro to, aby šly vůbec testovat.

## [0.10.0] - 2026-08-08
### Přidáno
- **Adaptivní kalibrace kalorického cíle**: appka teď umí porovnat skutečnou změnu váhy se zapsanými kaloriemi za stejné období a odhadnout reálný denní výdej — přesnější než formulka ze sebehodnocené úrovně aktivity. Návrh se zobrazí ve Statistikách, jakmile je dost dat (aspoň 14 dní mezi reálnými zápisy váhy, aspoň 7 dní se zapsaným jídlem, odchylka nad 10 %). Potvrzená kalibrace se promítne všude — Home, Stats, Profil, AI report i denní pozdrav.

### Opraveno
- **Připomínka vážení** brala i starý záznam bez rozlišení seed/manual jako reálné vážení — opravena chybná klasifikace.
- Notifikační okno zvonečku rozšířeno, aby se delší text (dny do vážení) zbytečně nelámal.
- **Home**: statická hláška "Skvělé tempo!" se dřív zobrazovala i při 0 zapsaných kaloriích za den.

## [0.9.0] - 2026-08-08
### Přidáno
- **Popis jídla jako AI kanál**: appka teď umí odhadnout kalorie a makra i ze slovního popisu jídla ("Popsat jídlo"), ne jen z fotky — nová Cloud Function `analyzeFoodText` (gpt-4o-mini), vede na stejný editovatelný formulář jako u fotek.

### Opraveno
- **Zvoneček připomínky vážení**: klik dřív nic nezobrazil, pokud nebylo vážení po termínu (působilo jako mrtvá ikona). Teď se vždy otevře přehled — nikdy nezváženo / po termínu / kolik dní zbývá do příští připomínky.
- **Počítání dní do vážení**: tichý startovní záznam váhy pro graf trendu (založený automaticky z profilu při prvním spuštění) se dřív omylem počítal jako reálné vážení a tím tiše "splnil" připomínku. Nový příznak `weightLogs.source` (seed/manual) odděluje startovní bod grafu od skutečných zápisů — připomínka teď počítá jen ty druhé.

### Změněno
- **Přejmenování "camera" na "add meal"**: hlavní tlačítko appky mělo ikonu fotoaparátu a interní pojmenování (`CameraModal`, `onOpenCamera`), i když appka umí přidat jídlo víc kanály (foto, popis, do budoucna hlas). Ikona nahrazena obecným `+`, komponenta přejmenována na `AddMealModal`.

## [0.8.0] - 2026-08-08
### Přidáno
- **Kontrola verze a auto-aktualizace appky**: appka jako PWA se dřív na telefonu nemohla dostat k nové nasazené verzi (žádný app store update, žádná ruční instalace). Teď se service worker aktivně kontroluje každou hodinu a při každém návratu appky do popředí — jakmile je k dispozici novější verze, zobrazí se banner s tlačítkem "Aktualizovat".

### Opraveno
- **Všechny ESLint chyby v appce**: `any` typy nahrazeny skutečnými typy (`FirebaseError`, `LucideIcon`, `NutritionResults`), `AuthContext`/`ThemeContext` rozděleny na komponentu a samostatný kontext + hook kvůli React Fast Refresh, odstraněné nepoužité proměnné a doplněné hook závislosti. Čistě typová/strukturální oprava, appka se chová stejně jako předtím.

## [0.7.0] - 2026-08-07
### Přidáno
- **Cloud záloha jídel**: Write-through zálohování do Firestore (`users/{uid}/meals`) přes stabilní `syncId` (UUID) místo lokálního Dexie `++id` — přežije evikci IndexedDB na iOS. Při prázdné lokální databázi (nový telefon, smazaná data) se historie jednorázově obnoví z cloudu.
- **Historie váhy**: Každá změna váhy v Profilu se ukládá do Firestore (`weightLogs`, doc id = datum, oprava překlepu ve stejný den nevytváří duplicitu). Stats zobrazuje trend váhy, jakmile jsou k dispozici aspoň 2 záznamy.
- **Připomínka vážení**: Nastavitelný interval (1–7 dní) v Profilu — zvonek v hlavičce appky se rozsvítí, jakmile je poslední zápis váhy po termínu, s odkazem rovnou na zápis nové hodnoty.
- **`firestore.rules`**: Poprvé verzovaná bezpečnostní pravidla (dřív v repu chyběla úplně) — uživatel má přístup jen ke svému vlastnímu stromu dokumentů. Nasazeno na produkci.

### Opraveno
- **Zastaralý kalorický cíl**: `targetCalories` se dřív přepočítal jen po ručním kliknutí na "Aktualizovat analýzu" v AI reportu — po změně váhy/cíle/aktivity tak zůstával neplatný. Home, Stats i AI zpětná vazba k jídlu ho teď počítají živě z aktuálních dat profilu.

## [0.6.0] - 2026-08-07
### Přidáno
- **Zpětná vazba k jídlu**: Nová Cloud Function `getMealFeedback` — Mya krátce zareaguje na každé uložené jídlo (foto i ruční zápis), zobrazí se hned po uložení.
- **Reálné Statistiky**: `Stats.tsx` nahrazen sloupcovým grafem kalorií za posledních 7 dní z reálných dat, s referenční linkou denního cíle a týdenním průměrem.

### Vylepšeno
- **Denní pozdrav od Myi**: Přegeneruje se po každém novém zápisu jídla (dřív zůstával zafixovaný na stav z rána) a nově zohledňuje i snězené bílkoviny vůči cíli.
- **Recepty**: 3 fake karty nahrazeny upřímným stavem "Připravujeme" — appka už neslibuje funkci, kterou nemá.

## [0.5.0] - 2026-08-07
### Přidáno
- **Zápis jídel**: Hlavní tlačítko konečně funguje — vyfocení jídla s AI rozpoznáním (GPT-4o Vision, odhad kalorií a maker) nebo rychlý ruční zápis jako rovnocenná alternativa.
- **Rozšířený model jídla**: `MealItem` nyní nese i bílkoviny/tuky/sacharidy a zdroj záznamu (foto/ruční).
- **Export a správa dat**: Funkční export historie jídel do CSV a smazání historie (s dvoutapovým potvrzením) v Profilu.

### Vylepšeno
- **Bezpečnost AI volání**: `Mya` (report, pozdrav, rozpoznání fotky) volá OpenAI přes Firebase Cloud Functions místo přímo z klienta — API klíč už není součástí client bundlu a každé volání vyžaduje přihlášeného uživatele.

### Opraveno
- Odstraněna fake demo data, která se tiše zapisovala do Home při prvním spuštění.
- Opraven nefunkční gradientový rámeček avataru v Profilu (dynamicky skládaná Tailwind třída).

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
