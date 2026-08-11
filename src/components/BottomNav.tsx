import { Home, BarChart2, Utensils, User, Plus } from 'lucide-react';

export type NavTab = 'home' | 'stats' | 'recipes' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenAddMeal: () => void;
}

export default function BottomNav({ activeTab, setActiveTab, onOpenAddMeal }: BottomNavProps) {
  const tabs = [
    { id: 'home', label: 'Domů', icon: Home },
    { id: 'stats', label: 'Statistiky', icon: BarChart2 },
    { id: 'recipes', label: 'Recepty', icon: Utensils },
    { id: 'profile', label: 'Profil', icon: User },
  ] as const;

  const navItemClass = (id: NavTab) =>
    `flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-2xl transition-colors ${
      activeTab === id
        ? 'bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400'
        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
    }`;

  return (
    <div className="shrink-0 w-full px-5 pb-6 pt-2 flex justify-center z-20">
      <div className="w-full flex items-center justify-between rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-rose-100/70 dark:border-slate-800 shadow-[0_14px_34px_-16px_rgba(196,58,92,0.4)] dark:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.65)] px-2.5 py-2 transition-colors">
        {tabs.slice(0, 2).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={navItemClass(tab.id)}>
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[9px] font-bold">{tab.label}</span>
          </button>
        ))}

        {/* HLAVNÍ AKČNÍ TLAČÍTKO - Přidání jídla (foto / popis / hlas) */}
        <button
          onClick={onOpenAddMeal}
          className="relative -top-4 w-14 h-14 shrink-0 bg-linear-to-tr from-rose-600 to-rose-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-rose-500/40 transform transition-transform active:scale-95 hover:scale-105 border-4 border-white dark:border-slate-900"
        >
          <Plus className="w-6 h-6" />
        </button>

        {tabs.slice(2).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={navItemClass(tab.id)}>
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[9px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
