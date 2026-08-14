import { useState } from "react";
import { X, ChevronLeft, Loader2, AlertCircle } from "lucide-react";
import { db, type WorkoutItem } from "../db/db";
import { MyaWorkout } from "../lib/workout";
import { backupWorkout } from "../lib/cloudSync";
import { getLocalDateISO } from "../lib/date";
import { useAuth } from "../context/useAuth";

interface LogWorkoutModalProps {
  onClose: () => void;
}

type Step = "describe" | "analyzing" | "form";

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export default function LogWorkoutModal({ onClose }: LogWorkoutModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [caloriesBurned, setCaloriesBurned] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");

  const handleAnalyze = async () => {
    if (!description.trim()) return;
    setStep("analyzing");
    const result = await MyaWorkout.analyzeWorkout(description.trim());
    if (result) {
      setName(result.name);
      setCaloriesBurned(result.caloriesBurned ? String(result.caloriesBurned) : "");
      setDurationMinutes(result.durationMinutes ? String(result.durationMinutes) : "");
      setNotice(result.confidence === "low" ? "Mya si nebyla úplně jistá odhadem — zkontroluj prosím hodnoty." : null);
    } else {
      setName("");
      setCaloriesBurned("");
      setDurationMinutes("");
      setNotice("Mye se nepodařilo odhadnout trénink z popisu. Zapiš prosím hodnoty ručně.");
    }
    setStep("form");
  };

  const handleBack = () => {
    setStep("describe");
    setNotice(null);
  };

  const canSave = name.trim().length > 0 && Number(caloriesBurned) > 0;

  const handleSave = async () => {
    const caloriesNum = Number(caloriesBurned);
    if (!name.trim() || !caloriesNum || caloriesNum <= 0) return;

    setSaving(true);
    try {
      const workout: WorkoutItem = {
        name: name.trim(),
        caloriesBurned: Math.round(caloriesNum),
        time: currentTime(),
        date: getLocalDateISO(),
        syncId: crypto.randomUUID(),
      };
      if (durationMinutes) workout.durationMinutes = Math.round(Number(durationMinutes));

      await db.workouts.add(workout);
      if (user) backupWorkout(user.uid, workout);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md max-h-[92dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        {/* HLAVIČKA */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {step === "form" && (
              <button
                onClick={handleBack}
                className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="font-bold text-slate-800 dark:text-white">
              {step === "describe" && "Zapsat trénink"}
              {step === "analyzing" && "Mya počítá..."}
              {step === "form" && "Potvrď trénink"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OBSAH */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "describe" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Co jsi cvičila?</label>
                <textarea
                  autoFocus
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Např. 30 min běh, hodina jógy, posilovna nohy"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-orange-500 dark:text-white transition-all resize-none"
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={!description.trim()}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Analyzovat
              </button>
            </div>
          )}

          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Mya odhaduje spálené kalorie...</p>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-4">
              {notice && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aktivita</label>
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Např. Běh"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-orange-500 dark:text-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Spáleno (kcal)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={caloriesBurned}
                    onChange={(e) => setCaloriesBurned(e.target.value)}
                    placeholder="0"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-orange-500 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Délka (min)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="0"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-orange-500 dark:text-white transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Uložit trénink
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
