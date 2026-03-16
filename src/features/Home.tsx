import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAuth } from "../context/AuthContext";
import { Zap } from "lucide-react";

export default function Home() {
  const { profile } = useAuth();
  const GOAL_CALORIES = profile?.targetCalories || 1800;
  
  const today = new Date().toISOString().split('T')[0];
  const meals = useLiveQuery(() => db.meals.where('date').equals(today).toArray()) || [];
  
  const consumedCalories = meals.reduce((sum, meal) => sum + meal.value, 0);
  const remainingCalories = Math.max(0, GOAL_CALORIES - consumedCalories);
  const progressPercent = Math.min(100, (consumedCalories / GOAL_CALORIES) * 100);

  useEffect(() => {
    const checkData = async () => {
      const count = await db.meals.count();
      if (count === 0) {
        await db.meals.bulkAdd([
          { name: "Avokádový toast s vejcem", value: 350, time: "08:30", date: today, type: "breakfast" },
          { name: "Matcha Latté (mandlové mléko)", value: 120, time: "10:15", date: today, type: "snack" },
        ]);
      }
    };
    checkData();
  }, [today]);

  return (
    <div className="space-y-6 pt-6 transition-colors">
      {/* Uvítání */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">
          Krásné ráno, {profile?.name || 'Petya'} ✨
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Dnes to bude skvělý den. Jak se cítíš?
        </p>
      </div>

      {/* Hlavní přehled kalorií */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-6 transition-colors">
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
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#2563eb" />
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
          <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mb-2">
            {remainingCalories} <span className="text-sm text-slate-500 dark:text-slate-400 font-medium tracking-normal">kcal</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
            {progressPercent > 80 ? "Pozor na večeři!" : "Skvělé tempo! K obědu si můžeš dát něco vydatnějšího."}
          </p>
        </div>
      </div>

      {/* AI Doporučení */}
      <div className="bg-linear-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-3xl p-5 border border-blue-100 dark:border-blue-900/50 relative overflow-hidden transition-colors">
        <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-200 dark:bg-blue-800 rounded-full blur-2xl opacity-50 dark:opacity-20"></div>
        <div className="flex gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center shrink-0 text-blue-500 dark:text-blue-400 transition-colors">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Zpráva od Mya (AI)</h3>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              "Venku je dnes slunečno. Nezapomeň doplňovat tekutiny! Co takhle vyměnit odpolední kávu za osvěžující vodu s citronem a mátou?"
            </p>
          </div>
        </div>
      </div>

      {/* Dnešní jídla */}
      <div className="pb-4">
        <div className="flex justify-between items-end mb-4 px-1">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Dnešní jídla</h3>
          <button className="text-sm font-semibold text-blue-500 dark:text-blue-400 hover:text-blue-600 transition-colors">
            Zobrazit vše
          </button>
        </div>

        <div className="space-y-3">
          {meals.map((meal) => (
            <div
              key={meal.id}
              className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-xl transition-colors">
                {meal.type === "breakfast" ? "🥑" : meal.type === "snack" ? "🍵" : "🥗"}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-800 dark:text-white">{meal.name}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-400 font-medium">{meal.time}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-slate-800 dark:text-white">{meal.value}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">kcal</span>
              </div>
            </div>
          ))}
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
