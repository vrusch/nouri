import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite"; // <-- Přidán import pro Tailwind
import { VitePWA } from "vite-plugin-pwa";

console.log("Loading Vite configuration...");

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // N28 (AUDIT_2026-08-14.md) — Firebase SDK appka odhaduje jako většinu zbývající váhy
        // hlavního chunku po lazy-loadingu tabů/modálů. Všechny firebase/@firebase balíčky musí
        // skončit v JEDNOM sdíleném chunku, ne rozdělené po jednotlivých submodulech (app/auth/
        // firestore/...) — modulární Firebase SDK má vlastní interní registraci komponent mezi
        // submoduly při načtení, kterou by rozdělení do víc chunků mohlo rozbít v závislosti na
        // pořadí, v jakém prohlížeč chunky vykoná.
        manualChunks(id) {
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) {
            return "firebase";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(), // <-- Přidán plugin pro Tailwind
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["apple-touch-icon.png", "favicon.png"],
      manifest: {
        name: "Nouri",
        short_name: "Nouri",
        description: "React PWA aplikace",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Zapsat jídlo",
            short_name: "Zapsat jídlo",
            description: "Otevře formulář pro rychlý zápis jídla",
            url: "/?action=add-meal",
            icons: [
              {
                src: "/pwa-192.png",
                sizes: "192x192",
                type: "image/png",
              },
            ],
          },
        ],
      },
      // N27 (AUDIT_2026-08-14.md) — dřív tu bylo runtimeCaching pravidlo pro `^https://api\./`,
      // na které appka nikdy nemluví (jen firestore.googleapis.com, identitytoolkit.googleapis.com,
      // firebasestorage.app, *.cloudfunctions.net) — mrtvá konfigurace, pravděpodobně zkopírovaná
      // ze šablony. Přepsat na skutečné hostitele appka záměrně nedělá: Firestore/Auth SDK má
      // vlastní offline persistenci (persistentLocalCache, viz CLAUDE.md), takže Workbox cache by
      // byla redundantní; a všech 14 Cloud Functions je onCall (POST s proměnným body) — NetworkFirst
      // by je cachoval podle URL, ne obsahu, takže by appka riskovala vrácení odpovědi z JINÉHO
      // požadavku (jiná zpráva v chatu, jiná fotka jídla) jako "cached" výsledek.
    }),
  ],
});
