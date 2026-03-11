import { useState, useEffect } from "react";

// ============================================================================
// 1. ZÁSTUPNÉ IMPORTY (V tvém reálném projektu tyto řádky odkomentuj)
// ============================================================================
// import { LogoHorizontal } from './components/Logo';
// import { db } from './utils/db';

// ============================================================================
// 2. MOCK KOMPONENTY PRO NÁHLED (V reálném projektu smaž, máš je jinde)
// ============================================================================
const LogoIcon = ({ className = "w-8 h-8" }) => (
  <svg
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="blueGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <path
      d="M50 15 C 20 15, 15 45, 15 45 C 15 45, 30 35, 50 35 C 70 35, 85 45, 85 45 C 85 45, 80 15, 50 15 Z"
      fill="url(#blueGradMain)"
      opacity="0.9"
    />
    <path
      d="M50 35 C 30 55, 30 85, 50 85 C 70 85, 70 55, 50 35 Z"
      fill="#2563eb"
    />
    <circle cx="50" cy="85" r="4" fill="#1e40af" />
  </svg>
);

const LogoHorizontal = ({ className = "" }) => (
  <div className={`flex items-center gap-2 select-none ${className}`}>
    <LogoIcon className="w-8 h-8 drop-shadow-sm" />
    <span className="text-2xl font-extrabold tracking-tight text-slate-800">
      Nouri<span className="text-blue-500">.</span>
    </span>
  </div>
);

// ============================================================================
// 3. HLAVNÍ APLIKACE (Zkopíruj do src/App.tsx)
// ============================================================================

interface MealItem {
  id?: number;
  name: string;
  value: number; // Kalorie
  time: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
}

export default function App() {
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Denní cíle (V reálu by se načítaly z uživatelského profilu)
  const GOAL_CALORIES = 1800;

  // Výpočet aktuálního stavu
  const consumedCalories = meals.reduce((sum, meal) => sum + meal.value, 0);
  const remainingCalories = Math.max(0, GOAL_CALORIES - consumedCalories);
  const progressPercent = Math.min(
    100,
    (consumedCalories / GOAL_CALORIES) * 100,
  );

  useEffect(() => {
    // TADY BUDE TVŮJ REÁLNÝ DEXIE KÓD:
    /*
    const loadData = async () => {
      try {
        const data = await db.items.toArray();
        setMeals(data);
      } catch (error) {
        console.error("Chyba při načítání z DB:", error);
      }
    };
    loadData();
    */

    // Pro náhled simulujeme načtení dat z DB (např. včerejší večeře a dnešní snídaně)
    setTimeout(() => {
      setMeals([
        {
          id: 1,
          name: "Avokádový toast s vejcem",
          value: 350,
          time: "08:30",
          type: "breakfast",
        },
        {
          id: 2,
          name: "Matcha Latté (mandlové mléko)",
          value: 120,
          time: "10:15",
          type: "snack",
        },
      ]);
      setIsLoading(false);
    }, 600);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex justify-center text-slate-800">
      {/* Omezení šířky pro "App" vzhled i na desktopu */}
      <div className="w-full max-w-md bg-slate-50 h-full min-h-screen relative flex flex-col shadow-2xl overflow-hidden">
        {/* --- HLAVIČKA --- */}
        <header className="px-6 pt-12 pb-4 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex justify-between items-center border-b border-slate-100">
          <LogoHorizontal />

          {/* Ikonka notifikací (Nahradila zbytečný avatar) */}
          <button className="relative p-2 text-slate-400 hover:text-blue-600 transition-colors focus:outline-none">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {/* Indikátor nepřečtené notifikace */}
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
          </button>
        </header>

        {/* --- OBSAH --- */}
        <main className="flex-1 overflow-y-auto pb-24 px-6 space-y-6 pt-6 hide-scrollbar">
          {/* Uvítání */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Krásné ráno, Evo ✨
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Dnes to bude skvělý den. Jak se cítíš?
            </p>
          </div>

          {/* Hlavní přehled kalorií (Kruh) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-6">
            <div className="relative w-28 h-28 shrink-0">
              {/* SVG Kruhový progress bar */}
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full transform -rotate-90"
              >
                {/* Pozadí kruhu */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="12"
                />
                {/* Progress kruh */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="url(#progressGrad)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${progressPercent * 2.51} 251`} /* 2*pi*r = ~251 */
                  className="transition-all duration-1000 ease-out"
                />
                <defs>
                  <linearGradient
                    id="progressGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#38bdf8" /> {/* sky-400 */}
                    <stop offset="100%" stopColor="#2563eb" /> {/* blue-600 */}
                  </linearGradient>
                </defs>
              </svg>
              {/* Text uvnitř kruhu */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-slate-800">
                  {consumedCalories}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Kcal
                </span>
              </div>
            </div>

            <div className="flex-1">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">
                Zbývá ti
              </h2>
              <div className="text-3xl font-extrabold text-blue-600 mb-2">
                {remainingCalories}{" "}
                <span className="text-sm text-slate-500 font-medium tracking-normal">
                  kcal
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-snug">
                Skvělé tempo! K obědu si můžeš dát něco vydatnějšího.
              </p>
            </div>
          </div>

          {/* AI Doporučení (Mya) */}
          <div className="bg-linear-to-br from-indigo-50 to-blue-50 rounded-3xl p-5 border border-blue-100 relative overflow-hidden">
            {/* Dekorativní prvek v pozadí */}
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-200 rounded-full blur-2xl opacity-50"></div>

            <div className="flex gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 text-blue-500">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-800">
                    Zpráva od Mya (AI)
                  </h3>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  "Venku je dnes slunečno. Nezapomeň doplňovat tekutiny! Co
                  takhle vyměnit odpolední kávu za osvěžující vodu s citronem a
                  mátou?"
                </p>
              </div>
            </div>
          </div>

          {/* Dnešní jídla (Z databáze Dexie) */}
          <div>
            <div className="flex justify-between items-end mb-4 px-1">
              <h3 className="font-bold text-lg text-slate-800">Dnešní jídla</h3>
              <button className="text-sm font-semibold text-blue-500 hover:text-blue-600 transition-colors">
                Zobrazit vše
              </button>
            </div>

            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-slate-200 rounded-2xl"></div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {meals.map((meal) => (
                  <div
                    key={meal.id}
                    className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-xl">
                      {meal.type === "breakfast"
                        ? "🥑"
                        : meal.type === "snack"
                          ? "🍵"
                          : "🥗"}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800">
                        {meal.name}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        {meal.time}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-800">
                        {meal.value}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">kcal</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* --- SPODNÍ NAVIGACE (Bottom Tab Bar) --- */}
        <div className="absolute bottom-0 w-full bg-white border-t border-slate-100 px-6 py-4 flex justify-between items-center rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-20 pb-8 sm:pb-4">
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span className="text-[10px] font-bold">Domů</span>
          </button>

          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span className="text-[10px] font-bold">Statistiky</span>
          </button>

          {/* HLAVNÍ AKČNÍ TLAČÍTKO - Focení / Přidání jídla (AI magicky moment) */}
          <div className="relative -top-6">
            <button className="w-16 h-16 bg-linear-to-tr from-blue-600 to-sky-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transform transition-transform active:scale-95 hover:scale-105 border-4 border-white">
              <svg
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <span className="text-[10px] font-bold">Recepty</span>
          </button>

          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="text-[10px] font-bold">Profil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
