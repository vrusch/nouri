# Changelog

Všechny významné změny v projektu Nouri budou zaznamenány v tomto souboru.

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
