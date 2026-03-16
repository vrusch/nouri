# Architektura a Implementační Plán AI pro Nouri

Tento dokument slouží jako roadmapa pro integraci umělé inteligence do aplikace Nouri. AI v Nouri není jen chatbot, je to ekosystém agentů, kteří spolupracují, aby poskytli uživateli personalizovaný a empatický zážitek.

## 1. Architektura Agentů

AI vrstva bude rozdělena do tří specializovaných rolí (agentů), aby byl systém škálovatelný, testovatelný a bezpečný.

### A. Mya (Orchestrátor & Tvář aplikace)
*   **Role:** Empatický průvodce, motivátor.
*   **Systémový prompt:** Bude obsahovat vypočítané metriky (BMR, TDEE, cíle) a historii uživatele. Mya "ví", kdo jsi.
*   **Zodpovědnost:**
    *   Generování vstupní diagnózy (Vítej v Nouri, tvůj plán je...).
    *   Proaktivní ranní/večerní zprávy na domovské obrazovce.
    *   Interpretace dat od ostatních agentů do lidské řeči.

### B. Nutrition Agent (Analytik & Dietolog)
*   **Role:** Kalkulačka a ochránce zdraví.
*   **Zodpovědnost:**
    *   Výpočet **BMR** (Mifflin-St Jeor rovnice).
    *   Výpočet **TDEE** (na základě úrovně aktivity).
    *   Stanovení bezpečného deficitu/přebytku (hlídá, aby kalorie neklesly pod BMR).
    *   Výpočet ideálního rozložení makroživin (bílkoviny, sacharidy, tuky).
*   *Poznámka: Tento agent může být čistě algoritmický (TypeScript) nebo LLM prompt, preferujeme deterministický TS pro výpočty a LLM pro textový report.*

### C. Vision Agent (Oči)
*   **Role:** Rozpoznávání obrazu.
*   **Nástroj:** OpenAI GPT-4o Vision (nebo ekvivalent).
*   **Vstup:** Base64 fotografie z kamery/galerie + případný textový kontext od uživatele ("Tohle jsem snědl včera").
*   **Zodpovědnost:**
    *   Identifikace surovin na talíři.
    *   Odhad gramáže (vždy s přiznáním míry nejistoty).
    *   Odhad nutričních hodnot (Kcal, Bílkoviny, Sacharidy, Tuky).
    *   Strukturovaný JSON výstup pro bezproblémové uložení do databáze.

---

## 2. Plán Implementace (Krok za krokem)

### Fáze 1: Jádro a Diagnóza (Základy)
*Cíl: Aplikace "chápe" uživatele a umí mu poradit na základě tvrdých dat.*
- [ ] Vytvořit `src/lib/nutrition.ts` pro deterministické výpočty (BMR, TDEE, makra).
- [ ] Připravit bezpečné napojení na LLM API (přes Firebase Cloud Functions nebo bezpečné API routes, případně zatím přímo v klientovi s `VITE_` proměnnými pro dev).
- [ ] Vytvořit funkci pro generování "Vstupní diagnózy" (The Welcome Report) - obdoba příkladu s 1900 kcal.
- [ ] Zobrazit tento report uživateli (např. po onboardingu nebo jako novou sekci v Profilu/Home).

### Fáze 2: Oči aplikace (Vision Agent)
*Cíl: Uživatel může vyfotit jídlo a systém ho rozpozná.*
- [ ] Vytvořit UI komponentu `CameraModal.tsx` s podporou WebRTC kamery a uploadu souborů.
- [ ] Vytvořit service `src/lib/vision.ts` pro komunikaci s GPT-4o Vision.
- [ ] Napsat robustní systémový prompt pro Vision Agenta (instrukce pro JSON výstup).
- [ ] Zpracovat JSON výstup a zobrazit ho v UI pro kontrolu uživatelem před uložením do Dexie/Firestore.

### Fáze 3: Kontext a Zpětná vazba (Mya Integration)
*Cíl: Mya reaguje na to, co uživatel jí.*
- [ ] Ke každému přidanému jídlu vygenerovat krátkou zpětnou vazbu od Myi (např. "Skvělá volba plná bílkovin!").
- [ ] Oživit "AI Doporučení" na Home screenu tak, aby bralo v potaz reálná data z Dexie (co uživatel dnes snědl) a posílalo to do LLM pro generování tipů (např. "Chybí ti bílkoviny, dej si večer tvaroh").

### Fáze 4: Pokročilé funkce (Budoucnost)
*Cíl: Dlouhodobé plánování a recepty.*
- [ ] Generování denních/týdenních jídelníčků na míru.
- [ ] Interaktivní chat s Myou (poradna).
- [ ] Analýza trendů (týdenní reporty).

---

## 3. Technologický Stack pro AI
*   **LLM Model (Text & Orchestrace):** OpenAI `gpt-4o-mini` (rychlost, cena) nebo `gemini-1.5-flash`.
*   **Vision Model:** OpenAI `gpt-4o` (nejlepší schopnost odhadu objemu z fotografie).
*   **Formát komunikace s AI:** Striktní JSON mode (Zod schemas pro validaci výstupů, např. očekáváme objekt s `name`, `calories`, `proteins` atd.).
*   **Kontext Window:** Do promptu budeme dynamicky vkládat profil uživatele (`{gender, weight, height, goal, targetCalories}`) a dnešní sumář (`{consumed: 1200, remaining: 600}`).
