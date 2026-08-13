# Changelog

Všechny významné změny v projektu Nouri budou zaznamenány v tomto souboru.

## [0.16.0] - 2026-08-13
### Přidáno
- **Vlastní makra místo automatického výpočtu**: možnost ručně nastavit bílkoviny a tuky (např. podle výživového poradce/lékaře) místo formulkového výpočtu — appka je respektuje ve všech výpočtech i AI reportech, sacharidy dál dopočítá jako zbytek do cíle. Nastavitelné v Profilu, s možností kdykoliv se vrátit k automatickému výpočtu.

## [0.15.0] - 2026-08-13
### Přidáno
- **Fitness modul**: rychlý textový zápis tréninku s AI odhadem spálených kalorií a délky, dynamický denní cíl navýšený o dnešní trénink, přehled tréninků za týden ve Statistikách.
- **Plánování tréninků**: nastavení pravidelných dnů v týdnu v Profilu, appka připomene nezapsaný trénink v plánovaný den.
- **Rozbalovací tlačítko pro zápis jídla**: tlačítko "+" nabídne tři rychlé cesty — foto, hlas, text — místo jednoho kroku navíc.
- **Míry těla**: zápis pasu/boků/hrudníku ve Statistikách, nezávisle volitelná pole s trendem oproti prvnímu záznamu.
- **Progress fotky**: appka poprvé používá Firebase Storage — nahrání a prohlížení fotek postavy v čase, mazání s potvrzením.
- **PDF report pro lékaře**: měsíční shrnutí (kalorie, makra, trend váhy, míry těla) ke stažení, s vlastním vloženým fontem pro českou diakritiku.
- **Sdílená týdenní karta**: obrázek ke stažení/sdílení s kaloriemi, streakem a váhovým posunem za týden.
- **Volný chat s Myou**: celoobrazovkový chat s historií konverzace — appka poprvé volá AI opakovaně podle používání, ne jednorázově za funkci.
- **Samostatný nákupní seznam**: ruční přidávání položek, sdílí jeden seznam s recepto-navázanými položkami.
- **Rozpad jídla na ingredience**: složené jídlo (např. "kuřecí salát") jde rozepsat na jednotlivé suroviny s vlastními kaloriemi/makry.
- **Proaktivní check-iny od Myi**: připomínka nezapsaného oběda, "před měsícem vs. dnes" v trendu váhy, milníkové oslavy (streak/váha), citlivé sledování dlouhodobě nízkého příjmu, týdenní AI shrnutí na vyžádání.
- **Detekce dosaženého cíle váhy**: appka pozná, že váha dosáhla cílové hodnoty, pogratuluje a nabídne přepnutí na "Udržovat váhu" — nové pole cílové váhy v Profilu.
- **Nálada/energie check-in**: rychlý tap na emoji na Home, appka reakci zohlední v denním pozdravu.
- **Volný den a dovolenkový režim**: appka ztlumí připomínky vážení a nezapsaného oběda, vynechané dny se nepočítají do streaku ani týdenních průměrů.
- **Sledování cyklu ovlivňujícího kalorie**: explicitní opt-in pro ženy — fáze cyklu ve Statistikách, oprava kalibrace cíle proti zkreslení zadržováním vody v luteální fázi, luteální kalorický bonus (+75 kcal) do cíle i maker.
- **Onboarding vynucuje reálná data**: appka dřív povinná pole (výška, váha, datum narození, pohlaví, aktivita, cíl) předvyplňovala věrohodnými výchozími hodnotami, které šlo projít bez úpravy — appka teď nepustí dál, dokud nejsou skutečně vyplněná a v rozumných mezích.
- **"Nedost dat" hlášky místo ticha**: appka ukáže, kolik dat ještě chybí (kalibrace cíle, dlouhodobé vzorce příjmu), místo aby sekci beze slova skryla; chybějící cílová váha a výchozí délka cyklu appka teď taky přiznává.
- **Varování před skoro prázdným PDF exportem**: appka upozorní, než necháte stáhnout report bez dostatku dat.

### Opraveno
- **24 nálezů z auditu existujících featur** — mj. dovolenkový režim si odporoval s připomínkou vážení, milníková oslava se mohla trvale ztratit kvůli race podmínce, "Plná záloha (JSON)" nebyla plná, kalibrace cíle mohla zkreslit odhad při řídkém zapisování, nedokončený dnešek se počítal jako celý den ve vzorcích příjmu, a další drobnosti v datové/synchronizační vrstvě (`REFERENCE/AUDIT_2026-08-13.md`).
- **Lokální cache jídel/tréninků nebyla vázaná na účet** — po přepnutí účtu ve stejném prohlížeči appka dočasně zobrazovala jídla předchozího účtu jako vlastní data.
- **AI denní pozdrav** posílal doslovnou nulu, i když uživatel den ještě jen nezačal zapisovat, ne že by opravdu nic nesnědl.

## [0.14.0] - 2026-08-11
### Přidáno
- **PWA zástupci appky**: dlouhé podržení ikony appky na ploše nabídne "Zapsat jídlo" rovnou, appka se otevře přímo v modálu pro zápis.
- **Periodická kontrola profilu**: appka po ~3 týdnech bez potvrzení nabídne "pořád ti sedí výška/aktivita/cíl?" — karta v Profilu i druhý nudge ve zvonečku.
- **Import historie z CSV**: opak exportu — appka přijme přesně formát, který sama vyexportuje, chybné řádky se přeskočí a nahlásí místo shození celého importu.
- **Porovnání týdnů**: karta "Průměr za posledních 7 dní" ve Statistikách teď ukazuje i minulý týden vedle sebe (kcal/den + kolik dní bylo zapsáno), bez barevného hodnocení.
- **"Semafor" dne**: barevný odznak (zelená/žlutá/červená) v kartě kalorií na Home podle postupu vůči dennímu cíli.
- **Plný JSON export**: vedle CSV appka nabízí kompletní zálohu — profil, jídla (se `syncId`), historie váhy.
- **"Co mám doma" návrh jídla**: generátor receptů umí navrhnout recept jen ze zadaných surovin.
- **Vlastní připomínkové texty**: appka čas od času nahradí AI pozdrav na Home vlastní připomínkou uživatelky místo generické AI hlášky.
- **Proaktivní doladění maker**: appka detekuje dlouhodobě nízký příjem bílkovin a nabídne ve Statistikách kartu s konkrétním AI návrhem řešení místo tichého reportování v grafu.
- **Poslední jídla**: jedno tapnutí na nedávné jídlo v zápisu jídla ho znovu zapíše bez přepisování názvu a kalorií.
- **Voda**: počítadlo sklenic na Home vedle kalorického kruhu, výchozí cíl 8 sklenic denně.
- **Režim "Jím venku"**: rychlý toggle při popisu jídla — appka akceptuje hrubší odhad bez nutnosti přesných maker, tyhle dny se vyloučí z detekce vzorců dlouhodobě nízkého příjmu bílkovin.
- **Denní šablony**: uložení dnešních jídel jako pojmenovanou šablonu a její aplikace jedním tapnutím jindy.
- **Doplňující otázka u foto-rozpoznání**: appka po nejistém odhadu z fotky nabídne pole na upřesnění kontextu a znovu zavolá AI se stejnou fotkou.
- **Rychlé nutriční hledání**: samostatné pole nezávislé na zápisu jídla (lupa v hlavičce appky) — hodnoty se jen zobrazí, nikam se neukládají.
- **Tichý režim / hodiny klidu**: appka během nastavitelného časového okna (výchozí 22:00–7:00, upravitelné v Profilu) potlačí pasivní upozornění — červenou tečku na zvonu i proaktivní kartu o bílkovinách.
- **Nová ikona appky**: PWA ikony (192/512/maskable/apple-touch/favicon) přegenerovány podle aktuálního gradientového loga appky — dřív byly z doby před vizuálním redesignem.
- **Animovaná loading obrazovka**: appka místo obecného spinneru ukazuje animované logo appky, které se při startu appky postupně "kreslí".

### Opraveno
- **Zavírání notifikačního okna**: klik mimo otevřenou notifikaci (zvoneček v hlavičce) ji dřív nezavíral.
- **Rozbitý favicon**: appka odkazovala na neexistující `vite.svg` (zbytek výchozího Vite scaffoldu), teď používá skutečnou appkovou ikonu.

## [0.13.0] - 2026-08-11
### Přidáno
- **Editace a smazání jednotlivého jídla**: klepnutí na kartičku jídla na Home otevře editační formulář (stejný jako při zápisu, předvyplněný) s možností upravit hodnoty nebo smazat jen tu jednu položku (dvojklikové potvrzení) — dřív šlo jen smazat celou historii najednou. Editace i mazání jdou přes `cloudSync` (nová funkce `deleteMeal`), ne jen lokální Dexie.
- **Vizuální redesign appky**: nová barevná paleta (růžová/"bloom" jako univerzální brand barva napříč logem, navigací, tlačítky a kruhem postupu místo modré), bílkoviny/sacharidy/tuky dostaly vlastní barvy a jsou vidět přímo na Home jako progress bary pod hlavním kalorickým kruhem, serifová kurzíva pro Myin hlas a nadpisy, plovoucí spodní navigace se sklem místo pevné lišty přes celou šířku. Vrstva podle pohlaví profilu (růžové/modré pozadí, rámeček avataru) zůstává beze změny.
- **Streak odznak na Home**: appka počítá, kolik dní po sobě je zapsané aspoň jedno jídlo, a zobrazí ho u pozdravu od druhého dne v řadě.

## [0.12.0] - 2026-08-10
### Přidáno
- **Plná obousměrná synchronizace jídel a váhy mezi zařízeními**: živé Firestore listenery (`subscribeMeals`, `subscribeWeightLogs`) nahrazují jednorázové čtení/zálohu — víc otevřených zařízení/tabů vidí zápisy z ostatních bez restartu appky. Firestore offline perzistence: zápisy bez připojení se frontují a odešlou automaticky po obnovení sítě.
- **AI generátor receptů**: na vyžádání navrhne recept sedící do toho, co ještě zbývá sníst do denního cíle (kalorie/bílkoviny/tuky/sacharidy), podle textového popisu nebo preference.
- **Smart Fridge**: vyfoť obsah lednice/spíže, Mya z rozpoznaných surovin navrhne recept sedící do zbývajících maker.
- **Nákupní seznam**: suroviny z vygenerovaného receptu jde přidat do jednoho běžícího nákupního seznamu (koupeno/nekoupeno, mazání), sledovaného živě napříč zařízeními.
- **Uložené recepty**: recepty jde uložit do trvalé knihovny místo jen vygenerovat a zahodit — prohlížení, mazání a zpětné přidání surovin do nákupního seznamu i odtud.
- **Voice-to-Log**: nová volba "Namluvit jídlo" u zápisu jídla — Whisper přepíše řeč na text, který appka zpracuje stejnou cestou jako psaný popis, s možností přepis před odesláním zkontrolovat a opravit.
- **Mya Voice Mode**: tlačítko reproduktoru u denního pozdravu na Home ho přečte nahlas (Web Speech API, česká výslovnost).

### Změněno
- Cloud Functions runtime upgradován z Node 20 na Node 22 — Node 20 byl mezitím u Firebase označen jako deprecated.

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
