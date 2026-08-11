import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MealItem } from "../db/db";
import { useAuth } from "../context/useAuth";
import { Volume2, Square, Flame } from "lucide-react";
import { MyaAI } from "../lib/ai";
import { calculateNutrition, computeRemainingMacros, getProgressCaption, getDayTrafficLight } from "../lib/nutrition";
import { computeLoggingStreak } from "../lib/streak";
import { pickDailyCustomReminder } from "../lib/customReminders";

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

const TRAFFIC_LIGHT_STYLE = {
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", label: "V pohodě" },
  yellow: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500", label: "Pozor" },
  red: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Nad cílem" },
} as const;

interface HomeProps {
  onEditMeal: (meal: MealItem) => void;
}

export default function Home({ onEditMeal }: HomeProps) {
  const { profile } = useAuth();
  const [greeting, setGreeting] = useState<string>("Přemýšlím o tvém dni...");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const nutrition = profile ? calculateNutrition(profile) : null;
  const GOAL_CALORIES = nutrition ? nutrition.targetCalories : 1800;

  const today = new Date().toISOString().split('T')[0];
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).toArray()) || [];
  const allMeals = useLiveQuery(() => db.meals.toArray()) || [];

  const consumedCalories = meals.reduce((sum, meal) => sum + meal.value, 0);
  const remainingCalories = Math.max(0, GOAL_CALORIES - consumedCalories);
  const progressPercent = Math.min(100, (consumedCalories / GOAL_CALORIES) * 100);

  const trafficLight = getDayTrafficLight(consumedCalories, GOAL_CALORIES);

  const remainingMacros = nutrition ? computeRemainingMacros(nutrition, meals) : null;
  const consumedProtein = nutrition && remainingMacros ? nutrition.macros.protein - remainingMacros.protein : 0;
  const macroRows = nutrition && remainingMacros
    ? [
        { label: "Bílkoviny", consumed: consumedProtein, target: nutrition.macros.protein, dot: "bg-emerald-500", bar: "bg-emerald-500" },
        { label: "Sacharidy", consumed: nutrition.macros.carbs - remainingMacros.carbs, target: nutrition.macros.carbs, dot: "bg-amber-500", bar: "bg-amber-500" },
        { label: "Tuky", consumed: nutrition.macros.fat - remainingMacros.fat, target: nutrition.macros.fat, dot: "bg-violet-500", bar: "bg-violet-500" },
      ]
    : [];

  const streak = computeLoggingStreak(Array.from(new Set(allMeals.map((m) => m.date))));

  useEffect(() => {
    const fetchGreeting = async () => {
      if (!profile) return;

      // Kešování na dnešek + počet zapsaných jídel, ať se pozdrav obnoví po každém novém zápisu
      const cacheKey = `mya_greeting_${today}_${meals.length}`;
      const cached = sessionStorage.getItem(cacheKey);

      if (cached) {
        setGreeting(cached);
        return;
      }

      const customReminder = pickDailyCustomReminder(profile.customReminders ?? [], today);
      if (customReminder) {
        setGreeting(customReminder);
        sessionStorage.setItem(cacheKey, customReminder);
        return;
      }

      try {
        const msg = await MyaAI.getDailyGreeting(profile, { consumedCalories, consumedProtein });
        setGreeting(msg);
        sessionStorage.setItem(cacheKey, msg);
      } catch {
        setGreeting(`Ahoj ${profile.name}! Nezapomeň dnes pít hodně vody. ✨`);
      }
    };

    fetchGreeting();
  }, [profile, today, meals.length, consumedCalories, consumedProtein]);

  // Nová zpráva (nový den / nově zapsané jídlo) nesmí nechat dobíhat přečtení té staré —
  // zastaví se i při odchodu ze záložky Home (odhlášení posluchače na unmount).
  useEffect(() => {
    return () => {
      if (speechSupported) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    };
  }, [greeting]);

  const handleToggleSpeech = () => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(greeting);
    utterance.lang = "cs-CZ";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  return (
    <div className="space-y-6 pt-6 transition-colors">
      {/* Uvítání */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display italic text-2xl font-medium tracking-tight dark:text-slate-100">
            Krásné ráno, {profile?.name || 'Petya'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Dnes to bude skvělý den. Jak se cítíš?
          </p>
        </div>
        {streak >= 2 && (
          <div className="flex items-center gap-1 shrink-0 whitespace-nowrap bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-2.5 py-1.5 rounded-full">
            <Flame className="w-3 h-3" fill="currentColor" />
            {streak} dní
          </div>
        )}
      </div>

      {/* Hlavní přehled kalorií */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        {trafficLight !== "neutral" && (
          <div className="flex justify-end mb-3">
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${TRAFFIC_LIGHT_STYLE[trafficLight].bg} ${TRAFFIC_LIGHT_STYLE[trafficLight].text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${TRAFFIC_LIGHT_STYLE[trafficLight].dot}`} />
              {TRAFFIC_LIGHT_STYLE[trafficLight].label}
            </span>
          </div>
        )}
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="12" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="url(#progressGrad)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${progressPercent * 2.51} 251`}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FDA4AF" />
                  <stop offset="100%" stopColor="#E11D48" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{consumedCalories}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Kcal</span>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Zbývá ti</h2>
            <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mb-2">
              {remainingCalories} <span className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-normal">kcal</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
              {getProgressCaption(consumedCalories, progressPercent)}
            </p>
          </div>
        </div>

        {macroRows.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-50 dark:border-slate-800 space-y-2.5">
            {macroRows.map((m) => {
              const pct = m.target > 0 ? Math.min(100, Math.round((m.consumed / m.target) * 100)) : 0;
              return (
                <div key={m.label} className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${m.dot} shrink-0`} />
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 w-16 shrink-0">{m.label}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <span className={`block h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-10 text-right shrink-0 tabular-nums">
                    {Math.round(m.consumed)}g
                  </span>
                </div>
              );
            })}
            {remainingMacros?.hasIncompleteMacroData && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
                Makra jsou orientační — některé dnešní jídlo je bez rozpadu na bílkoviny/sacharidy/tuky.
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Doporučení */}
      <div className="bg-linear-to-br from-rose-50 to-amber-50/60 dark:from-rose-950/20 dark:to-amber-950/10 rounded-3xl p-5 border border-rose-100/60 dark:border-rose-900/30 relative overflow-hidden transition-colors">
        <div className="flex gap-4 relative z-10">
          <div className="relative w-11 h-11 shrink-0">
            <span className="absolute -inset-1 rounded-full border border-rose-400/40 dark:border-rose-400/30 animate-ping [animation-duration:2.6s]" />
            <div className="absolute inset-0 rounded-full bg-linear-to-br from-rose-300 to-rose-600 shadow-[0_0_0_4px_rgba(225,78,114,0.12)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Mya</h3>
              {speechSupported && (
                <button
                  onClick={handleToggleSpeech}
                  aria-label={isSpeaking ? "Zastavit přehrávání" : "Přečíst nahlas"}
                  className="p-1.5 -m-1.5 rounded-full text-rose-600 dark:text-rose-400 hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors shrink-0"
                >
                  {isSpeaking ? <Square className="w-4 h-4" fill="currentColor" /> : <Volume2 className="w-4 h-4" />}
                </button>
              )}
            </div>
            <p className="font-display italic text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed">
              "{greeting}"
            </p>
          </div>
        </div>
      </div>

      {/* Dnešní jídla */}
      <div className="pb-4">
        <div className="flex justify-between items-end mb-4 px-1">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Dnešní jídla</h3>
          <button className="text-sm font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-600 transition-colors">
            Zobrazit vše
          </button>
        </div>

        <div className="space-y-3">
          {meals.map((meal) => {
            const macroTotal = (meal.protein ?? 0) + (meal.carbs ?? 0) + (meal.fat ?? 0);
            const hasMacroStrip = meal.protein !== undefined && meal.carbs !== undefined && meal.fat !== undefined && macroTotal > 0;

            return (
              <button
                key={meal.id}
                onClick={() => onEditMeal(meal)}
                className="w-full text-left bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-all active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-50/70 dark:bg-slate-800 flex items-center justify-center text-xl transition-colors">
                  {meal.type === "breakfast" ? "🥑" : meal.type === "snack" ? "🍵" : "🥗"}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-800 dark:text-white truncate">{meal.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-slate-400 dark:text-slate-400 font-medium shrink-0">{meal.time}</p>
                    {hasMacroStrip && (
                      <div className="flex h-1 w-11 rounded-full overflow-hidden shrink-0">
                        <span className="bg-emerald-500" style={{ flexGrow: meal.protein }} />
                        <span className="bg-amber-500" style={{ flexGrow: meal.carbs }} />
                        <span className="bg-violet-500" style={{ flexGrow: meal.fat }} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-slate-800 dark:text-white">{meal.value}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">kcal</span>
                </div>
              </button>
            );
          })}
          {meals.length === 0 && (
            <div className="text-center py-8 text-slate-400 dark:text-slate-600 italic">
              Zatím jsi nic nezapsala...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
