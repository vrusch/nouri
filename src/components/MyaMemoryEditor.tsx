import { useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import type { UserProfile } from "../context/AuthContext";
import { getLocalDateISO } from "../lib/date";
import { CHATGPT_SUMMARY_PROMPT, MAX_MYA_MEMORY_LENGTH, parseMyaMemoryForm, type MyaMemoryFields } from "../lib/myaMemory";

// Rozbalený řádek Profil → "Co o mně Mya ví" (REFERENCE/MYA_COACH_SPEC.md 5.5): začátek cesty
// a volný text pro Myu, včetně návodu, jak do něj přenést, co o ní ví ChatGPT.
export default function MyaMemoryEditor({
  profile,
  accentBg,
  buttonClass,
  onSave,
}: {
  profile: UserProfile;
  accentBg: string;
  buttonClass: string;
  onSave: (fields: MyaMemoryFields) => Promise<void>;
}) {
  const [startWeight, setStartWeight] = useState(profile.journeyStartWeight !== undefined ? String(profile.journeyStartWeight) : "");
  const [startDate, setStartDate] = useState(profile.journeyStartDate ?? "");
  const [memory, setMemory] = useState(profile.myaMemory ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CHATGPT_SUMMARY_PROMPT);
      setCopied(true);
    } catch {
      // Bez přístupu ke schránce (starší prohlížeč) zůstane dotaz k ručnímu označení níž.
      setCopied(false);
    }
  };

  const handleSave = async () => {
    const result = parseMyaMemoryForm({ startWeight, startDate, memory }, getLocalDateISO());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(result.fields);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full mt-1 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-rose-500 dark:text-white transition-all";

  return (
    <div className={`px-4 pb-4 space-y-3 ${accentBg}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Tohle bude Mya vědět v každém rozhovoru – odkud jsi začala, co ti chutná, co ti fungovalo a co ne. Čím víc toho
        ví, tím konkrétněji ti poradí.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Váha na začátku (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="např. 115"
            value={startWeight}
            onChange={(e) => {
              setStartWeight(e.target.value);
              setError(null);
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kdy jsi začala</label>
          <input
            type="date"
            max={getLocalDateISO()}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setError(null);
            }}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Co má Mya vědět</label>
        <textarea
          rows={7}
          maxLength={MAX_MYA_MEMORY_LENGTH}
          placeholder="Např. Nemám ráda tvaroh. Nejlíp mi funguje skyr a kuřecí. Večer mívám chutě na sladké…"
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          className={`${inputClass} font-medium leading-relaxed resize-y`}
        />
        <p className="text-[10px] text-slate-400 text-right">
          {memory.length} / {MAX_MYA_MEMORY_LENGTH}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 space-y-2">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Radila ses s ChatGPT? Pošli mu tenhle dotaz a jeho odpověď vlož do pole výš – Mya pak bude vědět, co on.
        </p>
        <p className="text-xs italic text-slate-500 dark:text-slate-400 leading-relaxed select-all">„{CHATGPT_SUMMARY_PROMPT}“</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2 active:scale-[0.98] transition-all"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Zkopírováno" : "Zkopírovat dotaz"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full ${buttonClass} text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60`}
      >
        Uložit
      </button>
    </div>
  );
}
