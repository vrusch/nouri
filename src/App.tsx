import { useState } from "react";
import { LogoHorizontal } from "./components/Logo";
import BottomNav, { type NavTab } from "./components/BottomNav";
import Home from "./features/Home";
import Stats from "./features/Stats";
import Recipes from "./features/Recipes";
import Profile from "./features/Profile";
import { Bell } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("home");

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

  return (
    <div className="h-dvh bg-slate-50 dark:bg-slate-950 font-sans flex justify-center text-slate-800 dark:text-slate-100 overflow-hidden transition-colors">
      {/* Omezení šířky pro "App" vzhled i na desktopu */}
      <div className="w-full max-w-md bg-slate-50 dark:bg-slate-950 h-full relative flex flex-col shadow-2xl overflow-hidden">
        
        {/* --- HLAVIČKA --- */}
        <header className="px-6 pt-12 pb-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
          <LogoHorizontal />

          <button className="relative p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none">
            <Bell className="w-6 h-6 stroke-2" />
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
          </button>
        </header>

        {/* --- OBSAH --- */}
        <main className="flex-1 overflow-y-auto px-6 hide-scrollbar">
          {renderContent()}
          {/* Spodní padding aby obsah nekončil pod menu */}
          <div className="h-32 shrink-0"></div>
        </main>

        {/* --- SPODNÍ NAVIGACE --- */}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>
    </div>
  );
}
