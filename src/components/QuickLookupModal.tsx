import { useState } from "react";
import { X, Search, Loader2, AlertCircle } from "lucide-react";
import { MyaVision, type VisionResult } from "../lib/vision";

interface QuickLookupModalProps {
  onClose: () => void;
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function QuickLookupModal({ onClose }: QuickLookupModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleLookup = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);
    setNotFound(false);

    // Kešuje odpověď na stejný dotaz na tuhle relaci (stejný vzor jako denní pozdrav
    // na Home) — hledání se často opakuje ("kolik má banán?") a nemusí pokaždé volat OpenAI.
    const cacheKey = `mya_lookup_${normalizeQuery(trimmed)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setResult(JSON.parse(cached) as VisionResult);
      setLoading(false);
      return;
    }

    const found = await MyaVision.analyzeFoodText(trimmed);
    if (found && found.name !== "Neznámé jídlo") {
      setResult(found);
      sessionStorage.setItem(cacheKey, JSON.stringify(found));
    } else {
      setNotFound(true);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md max-h-[92dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-white">Rychlé hledání</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Zeptej se na cokoliv — hodnoty se jen zobrazí, nikam se neukládají.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Např. banán, nebo krajíc chleba s máslem"
              className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-rose-500 dark:text-white transition-all"
            />
            <button
              onClick={handleLookup}
              disabled={!query.trim() || loading}
              className="shrink-0 w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            </button>
          </div>

          {notFound && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Mya tohle nerozpoznala. Zkus to popsat jinak.</span>
            </div>
          )}

          {result && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-5 space-y-4">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">{result.name}</h3>
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                  {result.calories} <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">kcal</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bílkoviny</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{result.protein} g</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tuky</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{result.fat} g</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sacharidy</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-200">{result.carbs} g</div>
                </div>
              </div>
              {result.confidence === "low" && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Hrubý odhad — mění se podle porce a přípravy.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
