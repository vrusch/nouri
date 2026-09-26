// N32 (AUDIT_2026-08-14.md) — funkce v cloudSync.ts, které chybu propagují (nákupní seznam,
// recepty, šablony, chat, progress fotky), volaly komponenty buď fire-and-forget bez catch, nebo
// s try/finally bez catch — selhání tak skončilo jako nezachycený reject a uživatelka o něm nevěděla.
// Volající teď chybu pošle sem a App.tsx ji ukáže ve stejném banneru jako chybu synchronizace.
// Záměrně prostý modulový kanál, ne React context: volat ho jde i z .catch() mimo render.

type CloudErrorListener = (message: string) => void;

const listeners = new Set<CloudErrorListener>();

export function reportCloudError(message: string, error?: unknown): void {
  console.error(message, error);
  listeners.forEach((listener) => listener(message));
}

export function subscribeCloudErrors(listener: CloudErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
