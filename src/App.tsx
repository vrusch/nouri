import { useEffect, useState } from "react";
import { LogoHorizontal } from "./components/Logo";
import BottomNav, { type NavTab } from "./components/BottomNav";
import AddMealModal from "./components/AddMealModal";
import Home from "./features/Home";
import Stats from "./features/Stats";
import Recipes from "./features/Recipes";
import Profile from "./features/Profile";
import Onboarding from "./features/Onboarding";
import { useAuth } from "./context/useAuth";
import { fetchLatestWeightLog, hydrateMealsIfEmpty, seedWeightLogIfEmpty } from "./lib/cloudSync";
import { formatDaysCs } from "./lib/format";
import { Bell } from "lucide-react";

function daysSince(dateISO: string): number {
  const todayISO = new Date().toISOString().split("T")[0];
  const msPerDay = 86400000;
  const diff = Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${dateISO}T00:00:00Z`);
  return Math.round(diff / msPerDay);
}

export default function App() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [weighInOverdue, setWeighInOverdue] = useState(false);
  const [daysSinceWeighIn, setDaysSinceWeighIn] = useState<number | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const reminderDays = profile?.weighInReminderDays ?? 3;

  useEffect(() => {
    if (!user || !profile?.setupComplete) return;
    const uid = user.uid;

    (async () => {
      await hydrateMealsIfEmpty(uid);
      await seedWeightLogIfEmpty(uid, profile.weight);
      const latest = await fetchLatestWeightLog(uid);
      // Tichý "seed" záznam (viz seedWeightLogIfEmpty) se pro připomínku nepočítá jako reálné vážení.
      const lastRealWeighIn = latest && latest.source !== "seed" ? latest : null;
      const sinceDays = lastRealWeighIn ? daysSince(lastRealWeighIn.date) : null;
      setDaysSinceWeighIn(sinceDays);
      setWeighInOverdue(sinceDays === null || sinceDays >= reminderDays);
    })();
  }, [user, profile?.setupComplete, profile?.weight, reminderDays]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !profile?.setupComplete) {
    return <Onboarding />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home />;
      case "stats":
        return <Stats />;
      case "recipes":
        return <Recipes />;
      case "profile":
        return <Profile />;
      default:
        return <Home />;
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

          <div className="relative">
            <button
              onClick={() => setShowReminder((v) => !v)}
              className="relative p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none"
            >
              <Bell className="w-6 h-6 stroke-2" />
              {weighInOverdue && (
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
              )}
            </button>
            {showReminder && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-4 z-30 text-left">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  {daysSinceWeighIn === null
                    ? "Ještě jsi nezapsala váhu — zapiš první hodnotu a appka ti pak sama pohlídá další vážení."
                    : weighInOverdue
                      ? "Nezapomeň se dnes zvážit — pomůže ti to sledovat trend."
                      : `Naposledy zváženo před ${formatDaysCs(daysSinceWeighIn)} · další připomínka za ${formatDaysCs(reminderDays - daysSinceWeighIn)}.`}
                </p>
                <button
                  onClick={() => { setActiveTab("profile"); setShowReminder(false); }}
                  className="w-full bg-blue-600 text-white text-sm font-bold py-2 rounded-xl active:scale-[0.98] transition-all"
                >
                  Zapsat váhu
                </button>
              </div>
            )}
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

      {addMealOpen && <AddMealModal onClose={() => setAddMealOpen(false)} />}
    </div>
  );
}
