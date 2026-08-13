import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type MealItem, type WorkoutItem } from "../db/db";
import { useAuth } from "../context/useAuth";
import { Volume2, Square, Flame, Droplets, Dumbbell, X, Loader2 } from "lucide-react";
import { MyaAI } from "../lib/ai";
import { calculateNutrition, computeRemainingMacros, getProgressCaption, getDayTrafficLight } from "../lib/nutrition";
import { computeLoggingStreak } from "../lib/streak";
import { pickDailyCustomReminder } from "../lib/customReminders";
import { WATER_TARGET_GLASSES, getWaterProgressPercent } from "../lib/water";
import { formatGlassesCs, formatWorkoutsCs } from "../lib/format";
import {
  subscribeWaterLog,
  logWater,
  saveMealTemplate,
  deleteWorkout,
  subscribeWeightLogs,
  type MealTemplateItem,
  type WeightLogEntry,
} from "../lib/cloudSync";
import {
  detectNewStreakMilestone,
  buildStreakMilestoneMessage,
  detectNewWeightMilestone,
  buildWeightMilestoneMessage,
} from "../lib/milestones";
import LogWorkoutModal from "../components/LogWorkoutModal";

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

const TRAFFIC_LIGHT_STYLE = {
  green: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", label: "V pohodě" },
  yellow: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500", label: "Pozor" },
  red: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400", dot: "bg-red-500", label: "Nad cílem" },
} as const;

// Nálada/energie check-in (FEATURE_IDEAS.md sekce 3) — appka nikam nálady/poznámky neukládá
// jako vlastní data, jen je jednorázově pošle jako kontext do getDailyGreeting (viz
// handleSubmitMood níž), ať appka nemá druhou samostatnou AI zprávu vedle sebe.
const MOOD_OPTIONS = [
  { value: 1, emoji: "😞", label: "Mizerně" },
  { value: 2, emoji: "🙁", label: "Spíš špatně" },
  { value: 3, emoji: "😐", label: "Neutrálně" },
  { value: 4, emoji: "🙂", label: "Dobře" },
  { value: 5, emoji: "😄", label: "Skvěle" },
] as const;

interface HomeProps {
  onEditMeal: (meal: MealItem) => void;
}

export default function Home({ onEditMeal }: HomeProps) {
  const { profile, user, updateProfile } = useAuth();
  const [greeting, setGreeting] = useState<string>("Přemýšlím o tvém dni...");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [waterGlasses, setWaterGlasses] = useState(0);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showLogWorkout, setShowLogWorkout] = useState(false);
  const nutrition = profile ? calculateNutrition(profile) : null;
  const GOAL_CALORIES = nutrition ? nutrition.targetCalories : 1800;

  const today = new Date().toISOString().split('T')[0];
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).toArray()) || [];
  const allMeals = useLiveQuery(() => db.meals.toArray()) || [];
  const todaysWorkouts = useLiveQuery(() => db.workouts.where('date').equals(today).toArray()) || [];

  // "Jak se cítíš?" zmizí, jakmile appka na dnešek dostane odpověď (sessionStorage, stejný
  // "záblesk pro danou session" princip jako milníky výš) — lazy init čte rovnou při mountu,
  // ať appka po refreshi stránky stejný den otázku znovu neukáže.
  const [moodAnswered, setMoodAnswered] = useState(() => !!sessionStorage.getItem(`mya_mood_answered_${today}`));
  const [moodNoteInput, setMoodNoteInput] = useState("");
  const [submittingMood, setSubmittingMood] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeWaterLog(user.uid, today, setWaterGlasses);
  }, [user, today]);

  // Váhové milníky (viz fetchGreeting níž) potřebují první i poslední záznam váhy —
  // Home dosud weightLogs vůbec netahal, na rozdíl od Stats.tsx.
  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  useEffect(() => {
    if (!user) return;
    return subscribeWeightLogs(user.uid, setWeightLogs);
  }, [user]);

  const handleAddWater = () => {
    if (!user) return;
    logWater(user.uid, today, waterGlasses + 1);
  };

  const handleRemoveWater = () => {
    if (!user || waterGlasses <= 0) return;
    logWater(user.uid, today, waterGlasses - 1);
  };

  const handleDeleteWorkout = async (workout: WorkoutItem) => {
    if (workout.id === undefined) return;
    await db.workouts.delete(workout.id);
    if (user && workout.syncId) deleteWorkout(user.uid, workout.syncId);
  };

  const handleSaveTemplate = async () => {
    if (!user || !templateNameInput.trim() || meals.length === 0) return;
    setSavingTemplate(true);
    try {
      const items: MealTemplateItem[] = meals.map((m) => {
        const item: MealTemplateItem = { name: m.name, value: m.value, type: m.type };
        if (m.protein !== undefined) item.protein = m.protein;
        if (m.fat !== undefined) item.fat = m.fat;
        if (m.carbs !== undefined) item.carbs = m.carbs;
        return item;
      });
      await saveMealTemplate(user.uid, templateNameInput.trim(), items);
      setTemplateNameInput("");
      setShowTemplateSave(false);
    } finally {
      setSavingTemplate(false);
    }
  };

  const consumedCalories = meals.reduce((sum, meal) => sum + meal.value, 0);
  const todaysWorkoutCalories = todaysWorkouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
  // Dynamický cíl (FEATURE_IDEAS.md sekce 1): zaznamenaný trénink přidá jednorázový bonus jen
  // pro dnešek, ne trvalou změnu activityLevel v profilu — GOAL_CALORIES (nutrition.targetCalories)
  // zůstává beze změny, sečteno se počítá až tady na Home.
  const adjustedGoalCalories = GOAL_CALORIES + todaysWorkoutCalories;
  const remainingCalories = Math.max(0, adjustedGoalCalories - consumedCalories);
  const progressPercent = Math.min(100, (consumedCalories / adjustedGoalCalories) * 100);

  const trafficLight = getDayTrafficLight(consumedCalories, adjustedGoalCalories);

  const remainingMacros = nutrition ? computeRemainingMacros(nutrition, meals) : null;
  const consumedProtein = nutrition && remainingMacros ? nutrition.macros.protein - remainingMacros.protein : 0;
  const macroRows = nutrition && remainingMacros
    ? [
        { label: "Bílkoviny", consumed: consumedProtein, target: nutrition.macros.protein, dot: "bg-emerald-500", bar: "bg-emerald-500" },
        { label: "Sacharidy", consumed: nutrition.macros.carbs - remainingMacros.carbs, target: nutrition.macros.carbs, dot: "bg-amber-500", bar: "bg-amber-500" },
        { label: "Tuky", consumed: nutrition.macros.fat - remainingMacros.fat, target: nutrition.macros.fat, dot: "bg-violet-500", bar: "bg-violet-500" },
      ]
    : [];

  const handleSubmitMood = async (value: number) => {
    if (!profile || submittingMood) return;
    setSubmittingMood(true);
    try {
      const note = moodNoteInput.trim();
      const msg = await MyaAI.getDailyGreeting(profile, {
        consumedCalories,
        consumedProtein,
        mood: value,
        moodNote: note || undefined,
      });
      sessionStorage.setItem(`mya_mood_greeting_${today}`, msg);
      sessionStorage.setItem(`mya_mood_answered_${today}`, "1");
      setGreeting(msg);
      setMoodAnswered(true);
    } finally {
      setSubmittingMood(false);
    }
  };

  const streak = computeLoggingStreak(Array.from(new Set(allMeals.map((m) => m.date))));

  // Milníková oslava (streak nebo váha, FEATURE_IDEAS.md sekce 3) — vlastní efekt oddělený od
  // fetchGreeting níž, ať streak/weightLogs (obojí dorazí asynchronně z Dexie/Firestore až po
  // prvním renderu) nespouští další volání OpenAI v efektu níž. Jednou zobrazená oslava zůstává
  // celý den beze změny (klíč nezávisí na meals.length) — kdyby sdílela klíč s cacheKey níž,
  // zápis dalšího jídla ten samý den by ji přepsal běžným pozdravem: updateProfile totiž mění
  // profil, takže by se detectNewStreakMilestone spustil znovu s lastCelebratedStreakDays už
  // aktualizovaným a podruhé by vrátil null. Po refreshi stránky ten samý den se milník naopak
  // ztratí (sessionStorage se vyprázdní) a appka ukáže normální pozdrav — profil si ale pořád
  // pamatuje, že oslaveno bylo, takže se nespustí znovu. To je záměr, ne bug: milník je "záblesk"
  // pro danou session, ne trvalá zpráva.
  useEffect(() => {
    if (!profile) return;

    const milestoneCacheKey = `mya_milestone_${today}`;
    if (sessionStorage.getItem(milestoneCacheKey)) return;

    const streakMilestone = detectNewStreakMilestone(streak, profile.lastCelebratedStreakDays);
    if (streakMilestone) {
      const msg = buildStreakMilestoneMessage(streakMilestone);
      sessionStorage.setItem(milestoneCacheKey, msg);
      setGreeting(msg);
      updateProfile({ lastCelebratedStreakDays: streakMilestone });
      return;
    }

    if (weightLogs.length >= 2) {
      // subscribeWeightLogs vrací záznamy už seřazené podle data (orderBy v cloudSync.ts).
      const startWeight = weightLogs[0].weight;
      const currentWeight = weightLogs[weightLogs.length - 1].weight;
      const weightMilestone = detectNewWeightMilestone(
        startWeight,
        currentWeight,
        profile.goal,
        profile.lastCelebratedWeightMilestoneKg
      );
      if (weightMilestone) {
        const msg = buildWeightMilestoneMessage(weightMilestone, profile.goal);
        sessionStorage.setItem(milestoneCacheKey, msg);
        setGreeting(msg);
        updateProfile({ lastCelebratedWeightMilestoneKg: weightMilestone });
      }
    }
    // profile jde do deps jen přes primitiva, ze stejného důvodu jako showMacroPatternCard v
    // Stats.tsx — celý objekt mění referenci při každém renderu AuthProvideru, i kvůli poli,
    // které tenhle efekt vůbec nezajímá.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.lastCelebratedStreakDays, profile?.lastCelebratedWeightMilestoneKg, profile?.goal, today, streak, weightLogs, updateProfile]);

  useEffect(() => {
    const fetchGreeting = async () => {
      if (!profile) return;

      // Milníková oslava (viz efekt výš) má přednost, pokud appka dnes nějakou zobrazila.
      const milestoneCacheKey = `mya_milestone_${today}`;
      const cachedMilestone = sessionStorage.getItem(milestoneCacheKey);
      if (cachedMilestone) {
        setGreeting(cachedMilestone);
        return;
      }

      // Reakce na náladu (viz handleSubmitMood níž) má přednost hned po milníku — jednou
      // vyžádaná zůstává celý den beze změny, i když appka mezitím normálně přepočítá pozdrav
      // kvůli nově zapsanému jídlu (cacheKey níž závisí na meals.length).
      const moodGreetingCacheKey = `mya_mood_greeting_${today}`;
      const cachedMoodGreeting = sessionStorage.getItem(moodGreetingCacheKey);
      if (cachedMoodGreeting) {
        setGreeting(cachedMoodGreeting);
        return;
      }

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
        // Mezitím (appka na odpověď OpenAI čeká) mohla appka dostat reakci na náladu — ta má
        // přednost, tenhle běžný pozdrav by ji jinak přepsal, jakmile doletí později.
        if (sessionStorage.getItem(moodGreetingCacheKey)) return;
        setGreeting(msg);
        sessionStorage.setItem(cacheKey, msg);
      } catch {
        if (sessionStorage.getItem(moodGreetingCacheKey)) return;
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
    <>
    <div className="space-y-6 pt-6 transition-colors">
      {/* Uvítání */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-display italic text-2xl font-medium tracking-tight dark:text-slate-100">
            Krásné ráno, {profile?.name || 'Petya'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Dnes to bude skvělý den.</p>
          {!moodAnswered && (
            <div className="mt-2.5">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-1.5">Jak se cítíš?</p>
              <div className="flex items-center gap-1.5">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => handleSubmitMood(m.value)}
                    disabled={submittingMood}
                    aria-label={m.label}
                    className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-center text-base active:scale-90 transition-all disabled:opacity-40"
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={moodNoteInput}
                onChange={(e) => setMoodNoteInput(e.target.value)}
                disabled={submittingMood}
                placeholder="Chceš něco dodat? (nepovinné)"
                maxLength={300}
                className="mt-2 w-full max-w-xs bg-transparent border-b border-slate-200 dark:border-slate-700 text-sm outline-none py-1 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500 disabled:opacity-40"
              />
            </div>
          )}
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
            {todaysWorkoutCalories > 0 && (
              <p className="text-[11px] font-semibold text-orange-500 dark:text-orange-400 mt-1.5 flex items-center gap-1">
                <Dumbbell className="w-3 h-3" /> +{todaysWorkoutCalories} kcal z tréninku
              </p>
            )}
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

      {/* Voda */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-colors">
        <div className="w-11 h-11 rounded-2xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center text-sky-500 shrink-0">
          <Droplets className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Voda</h3>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              {formatGlassesCs(waterGlasses)} / {WATER_TARGET_GLASSES}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${getWaterProgressPercent(waterGlasses)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleRemoveWater}
            disabled={waterGlasses <= 0}
            aria-label="Odebrat sklenici"
            className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-bold disabled:opacity-30 active:scale-90 transition-all"
          >
            −
          </button>
          <button
            onClick={handleAddWater}
            aria-label="Přidat sklenici"
            className="w-8 h-8 rounded-full bg-sky-500 text-white font-bold active:scale-90 transition-all"
          >
            +
          </button>
        </div>
      </div>

      {/* Trénink */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-500 shrink-0">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Trénink</h3>
            {todaysWorkouts.length > 0 ? (
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {formatWorkoutsCs(todaysWorkouts.length)} · {todaysWorkoutCalories} kcal spáleno
              </p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">Zatím žádný trénink dnes</p>
            )}
          </div>
          <button
            onClick={() => setShowLogWorkout(true)}
            aria-label="Přidat trénink"
            className="w-8 h-8 rounded-full bg-orange-500 text-white font-bold active:scale-90 transition-all shrink-0 flex items-center justify-center"
          >
            +
          </button>
        </div>

        {todaysWorkouts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-800 flex flex-wrap gap-2">
            {todaysWorkouts.map((w) => (
              <button
                key={w.id}
                onClick={() => handleDeleteWorkout(w)}
                aria-label={`Smazat trénink ${w.name}`}
                className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 transition-all"
              >
                {w.name} · {w.caloriesBurned} kcal
                <X className="w-3 h-3" />
              </button>
            ))}
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
          <div className="flex items-center gap-3">
            {meals.length > 0 && (
              <button
                onClick={() => setShowTemplateSave((v) => !v)}
                className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Uložit jako šablonu
              </button>
            )}
            <button className="text-sm font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-600 transition-colors">
              Zobrazit vše
            </button>
          </div>
        </div>

        {showTemplateSave && (
          <div className="flex items-center gap-2 mb-4 px-1">
            <input
              type="text"
              autoFocus
              value={templateNameInput}
              onChange={(e) => setTemplateNameInput(e.target.value)}
              placeholder="Např. Pracovní den"
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-semibold outline-rose-500 dark:text-white transition-all"
            />
            <button
              onClick={handleSaveTemplate}
              disabled={!templateNameInput.trim() || savingTemplate}
              className="shrink-0 bg-rose-600 text-white text-sm font-bold px-3 py-2 rounded-xl disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5"
            >
              {savingTemplate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Uložit
            </button>
          </div>
        )}

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
    {/* Mimo space-y-6 kontejner výš — Tailwindí space-y dává margin i "poslednímu" prvku,
        dokud přibude další za ním, což by fixed inset-0 overlay posunulo od okraje obrazovky. */}
    {showLogWorkout && <LogWorkoutModal onClose={() => setShowLogWorkout(false)} />}
    </>
  );
}
