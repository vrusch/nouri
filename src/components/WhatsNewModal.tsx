import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";
import pkg from "../../package.json";
import { useAuth } from "../context/useAuth";
import { getWhatsNewSince, markVersionSeen, readLastSeenVersion, type WhatsNewEntry } from "../lib/whatsNew";

/**
 * "Co je nového" po aktualizaci appky (UpdatePrompt.tsx → "Aktualizovat" → reload s novou
 * verzí). Rozhoduje se jednou při mountu; texty viz lib/whatsNew.ts.
 */
export default function WhatsNewModal() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<WhatsNewEntry[]>(() => getWhatsNewSince(readLastSeenVersion(), pkg.version));
  const isFemale = profile?.gender === "female";

  // Bez novinek se aktuální verze zapíše hned, ať příští aktualizace ví, od čeho porovnávat.
  useEffect(() => {
    if (entries.length === 0) markVersionSeen(pkg.version);
  }, [entries.length]);

  const handleClose = () => {
    markVersionSeen(pkg.version);
    setEntries([]);
  };

  // N44 (AUDIT_2026-08-14.md) — Escape zavírá všechny modály appky.
  useEffect(() => {
    if (entries.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      markVersionSeen(pkg.version);
      setEntries([]);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md max-h-[85dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-5 h-5 ${isFemale ? "text-rose-500" : "text-sky-500"}`} />
            <h2 className="font-bold text-slate-800 dark:text-white">Co je nového</h2>
          </div>
          <button onClick={handleClose} aria-label="Zavřít" className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {entries.map((entry) => (
            <div key={entry.version}>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">Verze {entry.version}</p>
              <ul className="space-y-2.5">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${isFemale ? "bg-rose-500" : "bg-sky-500"}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            onClick={handleClose}
            className={`w-full py-3.5 rounded-2xl text-white font-bold active:scale-[0.98] transition-all ${
              isFemale ? "bg-rose-600" : "bg-sky-600"
            }`}
          >
            Super, díky
          </button>
        </div>
      </div>
    </div>
  );
}
