# Nouri. 🥑

Moderní AI asistent pro zdravý životní styl a udržování váhy, navržený speciálně pro iOS. Tato aplikace je vyvíjena s láskou jako osobní pomocník pro moji manželku, s důrazem na jednoduchost, eleganci a chytrou asistenci v každém kroku.

## ✨ Klíčové vlastnosti

-   **AI v srdci aplikace**: Implementace umělé inteligence (Mya) pro analýzu jídla, personalizovaná doporučení a generování receptů.
-   **iOS Native Feel**: Čistý, minimalistický design optimalizovaný pro iPhone, včetně podpory tmavého/světlého režimu.
-   **Chytré přidávání jídla**: Centrální AI tlačítko pro rychlé rozpoznávání jídla (přes foťák) a okamžitý zápis kalorií.
-   **Offline First**: Díky Dexie.js a PWA funguje aplikace bleskově a data jsou bezpečně uložena přímo v zařízení.
-   **Denní přehledy**: Intuitivní sledování kalorického příjmu a zbývajícího limitu pro aktuální den.

## 🚀 Technologický stack

-   **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (moderní, ultra-rychlé utility)
-   **Ikony**: [Lucide React](https://lucide.dev/) (konzistentní iOS-style ikony)
-   **Databáze**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **PWA**: [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) pro instalaci na plochu iPhonu

## 🛠️ Instalace a vývoj

1.  Klonování repozitáře:
    ```bash
    git clone [url-repozitáře]
    cd nouri
    ```
2.  Instalace závislostí:
    ```bash
    npm install
    ```
3.  Spuštění vývojového serveru:
    ```bash
    npm run dev
    ```
4.  Sestavení pro produkci (PWA):
    ```bash
    npm run build
    ```

## 📱 iOS Specifika

Aplikace je navržena pro přidání na plochu (**Add to Home Screen**). Podporuje:
-   `h-dvh` (Dynamic Viewport Height) pro správné zobrazení na iPhonech s výřezem.
-   Apple Status Bar (black-translucent).
-   Plynulé přechody mezi světlým a tmavým režimem.

---
*Vyvinuto pro moji nejmilejší manželku, aby cesta za zdravím byla co nejjednodušší. 💙*
