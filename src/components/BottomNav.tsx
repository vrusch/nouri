import { Home, BarChart2, Utensils, User, Camera } from 'lucide-react';

export type NavTab = 'home' | 'stats' | 'recipes' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const tabs = [
    { id: 'home', label: 'Domů', icon: Home },
    { id: 'stats', label: 'Statistiky', icon: BarChart2 },
    { id: 'recipes', label: 'Recepty', icon: Utensils },
    { id: 'profile', label: 'Profil', icon: User },
  ] as const;

  return (
    <div className="shrink-0 w-full bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 px-6 pt-4 pb-8 flex justify-between items-center rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-20 transition-colors">
      {tabs.slice(0, 2).map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] font-bold">{tab.label}</span>
        </button>
      ))}

      {/* HLAVNÍ AKČNÍ TLAČÍTKO - Focení / Přidání jídla */}
      <div className="relative -top-6">
        <button className="w-16 h-16 bg-linear-to-tr from-blue-600 to-sky-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transform transition-transform active:scale-95 hover:scale-105 border-4 border-white dark:border-slate-900">
          <Camera className="w-7 h-7" />
        </button>
      </div>

      {tabs.slice(2).map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex flex-col items-center gap-1 transition-colors ${
            activeTab === tab.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[10px] font-bold">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
