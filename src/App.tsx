import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { LogoHorizontal, LogoIcon } from "./components/Logo";
import BottomNav, { type NavTab, type AddMealAction } from "./components/BottomNav";
import AddMealModal from "./components/AddMealModal";
import QuickLookupModal from "./components/QuickLookupModal";
import MyaChatModal from "./components/MyaChatModal";
import ShoppingListModal from "./components/ShoppingListModal";
import Home from "./features/Home";
import Stats from "./features/Stats";
import Recipes from "./features/Recipes";
import Profile from "./features/Profile";
import Onboarding from "./features/Onboarding";
import { db, type MealItem } from "./db/db";
import { useAuth } from "./context/useAuth";
import {
  seedWeightLogIfEmpty,
  subscribeMeals,
  subscribeWeightLogs,
  subscribeWorkouts,
  subscribeCycleLogs,
  type CycleLogEntry,
} from "./lib/cloudSync";
import { getLocalDateISO } from "./lib/date";
import { formatDaysCs } from "./lib/format";
import { computeWeighInStatus } from "./lib/weighIn";
import { calculateNutrition } from "./lib/nutrition";
import { getCyclePhase, DEFAULT_CYCLE_LENGTH_DAYS, isLutealBonusActive, applyLutealBonus } from "./lib/cyclePhase";
import { computeProfileCheckStatus } from "./lib/profileCheck";
import { computeWorkoutPlanStatus } from "./lib/workoutPlan";
import { computeMealReminderStatus } from "./lib/mealReminder";
import { isQuietHours } from "./lib/quietHours";
import { isVacationDay } from "./lib/vacationMode";
import { Bell, Search, Dumbbell, MessageCircle, ClipboardList, UtensilsCrossed, TreePalm } from "lucide-react";

export default function App() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [addMealOpen, setAddMealOpen] = useState(() => {
    const openFromShortcut = new URLSearchParams(window.location.search).get("action") === "add-meal";
    if (openFromShortcut) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return openFromShortcut;
  });
  const [editingMeal, setEditingMeal] = useState<MealItem | null>(null);
  const [addMealAction, setAddMealAction] = useState<AddMealAction | null>(null);
  // N41 v AUDIT_2026-08-14.md — výchozí `true` sedí s tím, co by computeWeighInStatus(null, ...)
  // vrátila samo (žádný záznam = appka má nudgnout), a `weighInStatusLoaded` (stejný vzor jako
  // todaysDataLoaded, C2 v AUDIT_2026-08-13.md) brání tomu, aby červená tečka na zvonu na chvíli
  // bliknula/zmizela dřív, než dorazí první odpověď z subscribeWeightLogs.
  const [weighInOverdue, setWeighInOverdue] = useState(true);
  const [weighInStatusLoaded, setWeighInStatusLoaded] = useState(false);
  const [daysSinceWeighIn, setDaysSinceWeighIn] = useState<number | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [quickLookupOpen, setQuickLookupOpen] = useState(false);
  const [myaChatOpen, setMyaChatOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const reminderDays = profile?.weighInReminderDays ?? 3;
  const notificationRef = useRef<HTMLDivElement>(null);
  const today = getLocalDateISO();
  // Hook musí běžet nepodmíněně na každém renderu, i před přesměrováním na Onboarding níže —
  // proto tady, ne až za `if (!user...)`. Necháváme raw (možné `undefined`, dokud Dexie
  // neodpoví) místo rovnou kolabovat na 0/[] — na studeném cache appka jinak na pár vteřin
  // spletla "ještě nenačteno" s "opravdu nic nezapsáno" (C2 v AUDIT_2026-08-13.md).
  const todaysWorkoutCountRaw = useLiveQuery(() => db.workouts.where("date").equals(today).count());
  const todaysMealsRaw = useLiveQuery(() => db.meals.where("date").equals(today).toArray());
  const todaysDataLoaded = todaysWorkoutCountRaw !== undefined && todaysMealsRaw !== undefined;
  const todaysWorkoutCount = todaysWorkoutCountRaw ?? 0;
  const todaysMeals = todaysMealsRaw ?? [];

  // N-audit 2026-08-14: Mya (denní pozdrav, chat, reakce na zapsané jídlo) počítala s cílem bez
  // luteálního kalorického bonusu (viz stejný výpočet v Home.tsx), protože AddMealModal a
  // MyaChatModal posílaly do AI volání syrový `profile.calibratedTDEE` místo hodnoty, kterou Home
  // reálně zobrazuje uživatelce. Appka drží vlastní odběr cycleLogs tady (ne jen v Home.tsx), ať
  // efektivní TDEE může protéct dolů i do modálů, které App.tsx renderuje samostatně.
  const [cycleLogs, setCycleLogs] = useState<CycleLogEntry[]>([]);
  useEffect(() => {
    // Nulování stavu tady není potřeba: cyclePhaseInfo/effectiveCalibratedTDEE níž kontrolují
    // profile?.cycleTrackingEnabled samy, takže zastaralá data v cycleLogs po vypnutí sledování
    // nikam neprotečou.
    if (!user || !profile?.cycleTrackingEnabled) return;
    return subscribeCycleLogs(user.uid, setCycleLogs);
  }, [user, profile?.cycleTrackingEnabled]);

  const cyclePhaseInfo = profile?.cycleTrackingEnabled
    ? getCyclePhase(cycleLogs, profile.avgCycleLength ?? DEFAULT_CYCLE_LENGTH_DAYS, today)
    : null;
  const lutealBonusActive = isLutealBonusActive(cyclePhaseInfo, profile?.onHormonalContraception);
  // Jen scalar (ne celý přepočtený nutrition objekt jako v Home.tsx) — AddMealModal a
  // MyaChatModal si samy volají calculateNutrition, tahle appka jim jen posílá, jaké
  // calibratedTDEE mají použít místo profile.calibratedTDEE.
  const effectiveCalibratedTDEE = profile && lutealBonusActive
    ? applyLutealBonus(calculateNutrition(profile).tdee, lutealBonusActive)
    : undefined;

  useEffect(() => {
    if (!showReminder) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowReminder(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showReminder]);

  useEffect(() => {
    if (!user || !profile?.setupComplete) return;
    const uid = user.uid;
    let unsubscribeMeals: (() => void) | undefined;
    let unsubscribeWorkouts: (() => void) | undefined;
    let unsubscribeWeights: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      await seedWeightLogIfEmpty(uid, profile.weight);
      if (cancelled) return;

      // Živé listenery místo jednorázového čtení — appka se drží v syncu i s dalšími
      // zařízeními/taby, dokud běží (Fáze 5 synchronizace, viz REFERENCE/done/IMPLEMENTATION_PLAN.md).
      unsubscribeMeals = subscribeMeals(uid);
      unsubscribeWorkouts = subscribeWorkouts(uid);
      unsubscribeWeights = subscribeWeightLogs(uid, (entries) => {
        const latest = entries.length > 0 ? entries[entries.length - 1] : null;
        const status = computeWeighInStatus(latest, reminderDays);
        setDaysSinceWeighIn(status.daysSinceWeighIn);
        setWeighInOverdue(status.weighInOverdue);
        setWeighInStatusLoaded(true);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribeMeals?.();
      unsubscribeWorkouts?.();
      unsubscribeWeights?.();
    };
  }, [user, profile?.setupComplete, profile?.weight, reminderDays]);

  // PWA zástupce "Přidat jídlo" nastaví addMealOpen z URL parametru už v lazy initu useState
  // výš, dřív než appka stihne zjistit, jestli je uživatel vůbec přihlášený/má dokončený
  // onboarding — na nepřihlášeném zařízení by se tak modal otevřel hned po dokončení
  // Onboardingu bez varování (C1). Reset patří do render těla, ne do efektu (setState
  // synchronně uvnitř efektu jen kvůli synchronizaci odvozeného stavu React nedoporučuje,
  // viz react-hooks/set-state-in-effect) — appka proto porovnává s předchozí hodnotou přímo
  // tady, stejný vzor jako "Adjusting state when a prop changes" v docs React.dev.
  const needsOnboarding = !loading && (!user || !profile?.setupComplete);
  const [prevNeedsOnboarding, setPrevNeedsOnboarding] = useState(needsOnboarding);
  if (needsOnboarding !== prevNeedsOnboarding) {
    setPrevNeedsOnboarding(needsOnboarding);
    // Reset jen při přechodu ZE stavu "potřebuje onboarding" DO hlavní appky (typicky: appka
    // právě dokončila Onboarding) — ne v opačném směru, kdy addMealOpen beztak nejde vidět,
    // protože se místo hlavního stromu vykresluje jen <Onboarding />.
    if (prevNeedsOnboarding && !needsOnboarding && addMealOpen) {
      setAddMealOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LogoIcon className="w-16 h-16" animated />
      </div>
    );
  }

  if (!user || !profile?.setupComplete) {
    return <Onboarding />;
  }

  const profileCheck = computeProfileCheckStatus(profile.lastProfileCheckAt);
  const workoutPlanRaw = computeWorkoutPlanStatus(profile.plannedWorkoutDays, todaysWorkoutCount > 0);
  const mealReminderRaw = computeMealReminderStatus(todaysMeals.map((m) => m.type));
  // Dokud Dexie nevrátí dnešní data, appka nudge nepočítá jako aktivní (C2) — jinak by na
  // studeném cache/novém zařízení na pár vteřin ukázala falešnou připomínku.
  const workoutPlan = { ...workoutPlanRaw, reminderDue: todaysDataLoaded && workoutPlanRaw.reminderDue };
  const mealReminder = { ...mealReminderRaw, lunchOverdue: todaysDataLoaded && mealReminderRaw.lunchOverdue };
  // Appka během tichých hodin nesmí sama upoutávat pozornost na připomínky — červená tečka
  // je jediný pasivní "nudge" prvek, zvon samotný jde otevřít ručně kdykoliv. Okno je uživatelem
  // nastavitelné v Profilu (výchozí 22-7, viz quietHours.ts), vypínatelné přes quietHoursEnabled.
  const quietHoursActive =
    (profile.quietHoursEnabled ?? true) && isQuietHours(new Date().getHours(), profile.quietHoursStart, profile.quietHoursEnd);
  // Volný den / dovolenkový režim (FEATURE_IDEAS.md sekce 3) ztlumí konkrétně připomínku vážení
  // a nezapsaného oběda (jediné dvě appka podle zadání "ztlumí") — kontrola profilu a plán
  // tréninků vynechané dny záměrně nerespektují, appka o ně nebyla žádaná.
  const vacationActive = isVacationDay(today, profile.vacationDates);

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home onEditMeal={setEditingMeal} />;
      case "stats":
        return <Stats />;
      case "recipes":
        return <Recipes />;
      case "profile":
        return <Profile />;
      default:
        return <Home onEditMeal={setEditingMeal} />;
    }
  };

  const genderBg = profile?.gender === 'female' 
    ? 'bg-rose-50/30' 
    : profile?.gender === 'male' 
      ? 'bg-sky-50/30' 
      : 'bg-slate-50';

  return (
    <div className={`h-dvh ${genderBg} dark:bg-slate-950 font-sans flex justify-center text-slate-900 dark:text-slate-100 overflow-hidden transition-colors`}>
      {/* Omezení šířky pro "App" vzhled i na desktopu */}
      <div className={`w-full max-w-md ${genderBg} dark:bg-slate-950 h-full relative flex flex-col shadow-2xl overflow-hidden transition-colors`}>
        
        {/* --- HLAVIČKA --- */}
        <header className={`px-6 pt-12 pb-4 ${genderBg}/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 flex justify-between items-center border-b border-slate-100/50 dark:border-slate-800 shrink-0 transition-colors`}>
          <LogoHorizontal />

          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuickLookupOpen(true)}
              aria-label="Rychlé hledání"
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none"
            >
              <Search className="w-5 h-5 stroke-2" />
            </button>
            <button
              onClick={() => setMyaChatOpen(true)}
              aria-label="Chat s Myou"
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none"
            >
              <MessageCircle className="w-5 h-5 stroke-2" />
            </button>
            <button
              onClick={() => setShoppingListOpen(true)}
              aria-label="Nákupní seznam"
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none"
            >
              <ClipboardList className="w-5 h-5 stroke-2" />
            </button>
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowReminder((v) => !v)}
                className="relative p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none"
              >
                <Bell className="w-6 h-6 stroke-2" />
                {((weighInStatusLoaded && weighInOverdue && !vacationActive) ||
                  profileCheck.checkOverdue ||
                  workoutPlan.reminderDue ||
                  (mealReminder.lunchOverdue && !vacationActive)) &&
                  !quietHoursActive && (
                    <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                  )}
              </button>
              {showReminder && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 z-30 text-left">
                  {vacationActive ? (
                    <>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                        <TreePalm className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        Jsi v dovolenkovém režimu — připomínky vážení a jídla appka do konce dovolené ztlumí.
                      </p>
                      <button
                        onClick={() => { setActiveTab("profile"); setShowReminder(false); }}
                        className="w-full bg-teal-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                      >
                        Spravovat v Profilu
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                        {daysSinceWeighIn === null
                          ? "Ještě jsi nezapsala váhu — zapiš první hodnotu a appka ti pak sama pohlídá další vážení."
                          : weighInOverdue
                            ? "Nezapomeň se dnes zvážit — pomůže ti to sledovat trend."
                            : `Naposledy zváženo před ${formatDaysCs(daysSinceWeighIn)} · další připomínka za ${formatDaysCs(reminderDays - daysSinceWeighIn)}.`}
                      </p>
                      <button
                        onClick={() => { setActiveTab("profile"); setShowReminder(false); }}
                        className="w-full bg-rose-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                      >
                        Zapsat váhu
                      </button>
                    </>
                  )}
                  {profileCheck.checkOverdue && (
                    <>
                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-3" />
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                        Pořád ti sedí výška, aktivita a cíl v profilu? Appka si čas od času ráda ověří, že se čísla neliší od reality.
                      </p>
                      <button
                        onClick={() => { setActiveTab("profile"); setShowReminder(false); }}
                        className="w-full bg-slate-700 dark:bg-slate-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                      >
                        Zkontrolovat profil
                      </button>
                    </>
                  )}
                  {workoutPlan.reminderDue && (
                    <>
                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-3" />
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                        <Dumbbell className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        Dnes máš v plánu trénink — zatím ho nemáš zapsaný.
                      </p>
                      <button
                        onClick={() => { setActiveTab("home"); setShowReminder(false); }}
                        className="w-full bg-orange-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                      >
                        Přejít na Home
                      </button>
                    </>
                  )}
                  {mealReminder.lunchOverdue && !vacationActive && (
                    <>
                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-3" />
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                        <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        Dneska ještě nemáš zapsaný oběd.
                      </p>
                      <button
                        onClick={() => { setAddMealAction(null); setAddMealOpen(true); setShowReminder(false); }}
                        className="w-full bg-emerald-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                      >
                        Zapsat oběd
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* --- OBSAH --- */}
        <main className="flex-1 overflow-y-auto px-6 hide-scrollbar">
          {renderContent()}
          {/* Spodní padding aby obsah nekončil pod menu */}
          <div className="h-32 shrink-0"></div>
        </main>

        {/* --- SPODNÍ NAVIGACE --- */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenAddMeal={(action) => {
            setAddMealAction(action);
            setAddMealOpen(true);
          }}
        />
      </div>

      {(addMealOpen || editingMeal) && (
        <AddMealModal
          editMeal={editingMeal ?? undefined}
          initialAction={addMealAction ?? undefined}
          effectiveCalibratedTDEE={effectiveCalibratedTDEE}
          onClose={() => {
            setAddMealOpen(false);
            setEditingMeal(null);
            setAddMealAction(null);
          }}
        />
      )}

      {quickLookupOpen && <QuickLookupModal onClose={() => setQuickLookupOpen(false)} />}
      {myaChatOpen && (
        <MyaChatModal effectiveCalibratedTDEE={effectiveCalibratedTDEE} onClose={() => setMyaChatOpen(false)} />
      )}
      {shoppingListOpen && <ShoppingListModal onClose={() => setShoppingListOpen(false)} />}
    </div>
  );
}
