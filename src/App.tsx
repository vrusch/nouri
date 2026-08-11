import { useEffect, useState } from "react";
import { LogoHorizontal } from "./components/Logo";
import BottomNav, { type NavTab } from "./components/BottomNav";
import AddMealModal from "./components/AddMealModal";
import QuickLookupModal from "./components/QuickLookupModal";
import Home from "./features/Home";
import Stats from "./features/Stats";
import Recipes from "./features/Recipes";
import Profile from "./features/Profile";
import Onboarding from "./features/Onboarding";
import { type MealItem } from "./db/db";
import { useAuth } from "./context/useAuth";
import { seedWeightLogIfEmpty, subscribeMeals, subscribeWeightLogs } from "./lib/cloudSync";
import { formatDaysCs } from "./lib/format";
import { computeWeighInStatus } from "./lib/weighIn";
import { computeProfileCheckStatus } from "./lib/profileCheck";
import { Bell, Search } from "lucide-react";

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
  const [weighInOverdue, setWeighInOverdue] = useState(false);
  const [daysSinceWeighIn, setDaysSinceWeighIn] = useState<number | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [quickLookupOpen, setQuickLookupOpen] = useState(false);
  const reminderDays = profile?.weighInReminderDays ?? 3;

  useEffect(() => {
    if (!user || !profile?.setupComplete) return;
    const uid = user.uid;
    let unsubscribeMeals: (() => void) | undefined;
    let unsubscribeWeights: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      await seedWeightLogIfEmpty(uid, profile.weight);
      if (cancelled) return;

      // Živé listenery místo jednorázového čtení — appka se drží v syncu i s dalšími
      // zařízeními/taby, dokud běží (Fáze 5 synchronizace, viz REFERENCE/IMPLEMENTATION_PLAN.md).
      unsubscribeMeals = subscribeMeals(uid);
      unsubscribeWeights = subscribeWeightLogs(uid, (entries) => {
        const latest = entries.length > 0 ? entries[entries.length - 1] : null;
        const status = computeWeighInStatus(latest, reminderDays);
        setDaysSinceWeighIn(status.daysSinceWeighIn);
        setWeighInOverdue(status.weighInOverdue);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribeMeals?.();
      unsubscribeWeights?.();
    };
  }, [user, profile?.setupComplete, profile?.weight, reminderDays]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  if (!user || !profile?.setupComplete) {
    return <Onboarding />;
  }

  const profileCheck = computeProfileCheckStatus(profile.lastProfileCheckAt);

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
            <div className="relative">
              <button
                onClick={() => setShowReminder((v) => !v)}
                className="relative p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors focus:outline-none"
              >
                <Bell className="w-6 h-6 stroke-2" />
                {(weighInOverdue || profileCheck.checkOverdue) && (
                  <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
                )}
              </button>
              {showReminder && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 z-30 text-left">
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
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} onOpenAddMeal={() => setAddMealOpen(true)} />
      </div>

      {(addMealOpen || editingMeal) && (
        <AddMealModal
          editMeal={editingMeal ?? undefined}
          onClose={() => {
            setAddMealOpen(false);
            setEditingMeal(null);
          }}
        />
      )}

      {quickLookupOpen && <QuickLookupModal onClose={() => setQuickLookupOpen(false)} />}
    </div>
  );
}
