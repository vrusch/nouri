# Architektura a Implementační Plán AI pro Nouri (v0.3.5)

Tento dokument slouží jako roadmapa pro integraci umělé inteligence do aplikace Nouri. AI v Nouri není jen chatbot, je to ekosystém agentů, kteří spolupracují, aby poskytli uživateli personalizovaný a empatický zážitek.

## 1. Architektura Agentů

AI vrstva je rozdělena do specializovaných rolí (agentů).

### A. Mya (Orchestrátor & Tvář aplikace) - ✅ IMPLEMENTOVÁNO
*   **Role:** Empatický průvodce, motivátor.
*   **Status:** Funkční v `src/lib/ai.ts`. Obsahuje caching v `sessionStorage` pro úsporu API a řešení 429.
*   **Zodpovědnost:**
    *   Generování vstupní diagnózy.
    *   Dynamické pozdravy dle denní doby.
    *   Osobní přístup na základě pohlaví (gender colors).

### B. Nutrition Agent (Analytik & Dietolog) - ✅ IMPLEMENTOVÁNO
*   **Role:** Kalkulačka a ochránce zdraví.
*   **Status:** Funkční v `src/lib/nutrition.ts`.
*   **Zodpovědnost:**
    *   Výpočty BMR (Mifflin-St Jeor) a TDEE.
    *   Hlídání nutričních limitů a stanovení maker (40/30/30).

### C. Vision Agent (Oči) - 🏗️ V IMPLEMENTACI
*   **Nástroj:** OpenAI GPT-4o Vision.
*   **Zodpovědnost:**
    *   Identifikace surovin a odhad gramáže z fotky.
    *   Strukturovaný JSON pro uložení do Firestore.

---

## 2. Plán Implementace (Krok za krokem)

### Fáze 1: Jádro a Diagnóza (Základy) - ✅ HOTOVO
- [x] ~~Vytvořit `src/lib/nutrition.ts` pro deterministické výpočty (BMR, TDEE, makra).~~
- [x] ~~Připravit bezpečné napojení na LLM API.~~
- [x] ~~Vytvořit funkci pro generování "Vstupní diagnózy".~~
- [x] ~~Zobrazit tento report uživateli v Profilu.~~

### Fáze 2: Oči aplikace (Vision Agent) - 📍 AKTUÁLNÍ FOCUS
- [ ] Vytvořit UI komponentu `CameraModal.tsx` (WebRTC + Upload).
- [ ] Vytvořit service `src/lib/vision.ts` pro GPT-4o Vision.
- [ ] Zpracovat JSON výstup a umožnit uživateli potvrdit/upravit data před uložením.
- [ ] **NOVINKA:** Podpora pro skenování čárových kódů (EAN) přes AI.

### Fáze 3: Kontext a Zpětná vazba (Mya Integration)
- [ ] Ke každému jídlu vygenerovat zpětnou vazbu (např. "Super, tohle tě zasytí na celé odpoledne!").
- [ ] AI Doporučení na Home screenu na základě reálných dat z dnešního dne (např. "Chybí ti 20g bílkovin").

### Fáze 4: Nové horizonty (Rozšíření)
- [ ] **Voice-to-Log:** "Mio, teď jsem dopila kafe s mlékem a snědla jeden banán." (Whisper API).
- [ ] **Smart Fridge (Co mám v lednici):** Vyfoť lednici a Mya navrhne recept, který sedí do tvých zbývajících maker.
- [ ] **Apple Health / Google Fit:** Automatický import kroků a spálených kalorií pro dynamické TDEE.
- [ ] **Nákupní seznamy:** Generování nákupního lístku na základě plánovaných receptů.
- [ ] **Mya Voice Mode:** Možnost nechat si ranní report přečíst hlasem.

---

## 3. Technologický Stack pro AI
*   **Text:** `gpt-4o-mini` (rychlost/cena).
*   **Vision:** `gpt-4o` (přesnost odhadu objemu).
*   **Voice:** `whisper-1` pro diktování jídla.
*   **Databáze:** Firestore pro dlouhodobou historii, Dexie pro offline/rychlost.
