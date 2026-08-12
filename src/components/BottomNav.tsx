import { useEffect, useState, type CSSProperties } from 'react';
import { Home, BarChart2, Utensils, User, Plus, Camera, Mic, PenLine } from 'lucide-react';

export type NavTab = 'home' | 'stats' | 'recipes' | 'profile';
export type AddMealAction = 'photo' | 'voice' | 'text';

// --dx/--dy nejsou ve standardním typu CSSProperties, i když je runtime i .fab-satellite* třídy
// v index.css normálně čtou — odsud jde jen o TS typing vlastních properties.
const satelliteOffset = (dx: string, dy: string): CSSProperties => ({ '--dx': dx, '--dy': dy } as CSSProperties);

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenAddMeal: (action: AddMealAction) => void;
}

const SATELLITES: { action: AddMealAction; label: string; icon: typeof Camera; dx: string; dy: string }[] = [
  { action: 'photo', label: 'Foto', icon: Camera, dx: '-72px', dy: '-40px' },
  { action: 'voice', label: 'Hlas', icon: Mic, dx: '0px', dy: '-100px' },
  { action: 'text', label: 'Text', icon: PenLine, dx: '72px', dy: '-40px' },
];

export default function BottomNav({ activeTab, setActiveTab, onOpenAddMeal }: BottomNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = [
    { id: 'home', label: 'Domů', icon: Home },
    { id: 'stats', label: 'Statistiky', icon: BarChart2 },
    { id: 'recipes', label: 'Recepty', icon: Utensils },
    { id: 'profile', label: 'Profil', icon: User },
  ] as const;

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen, setMenuOpen]);

  const navItemClass = (id: NavTab) =>
    `flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-2xl transition-colors ${
      activeTab === id
        ? 'bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400'
        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
    }`;

  const selectTab = (id: NavTab) => {
    setMenuOpen(false);
    setActiveTab(id);
  };

  const chooseAction = (action: AddMealAction) => {
    setMenuOpen(false);
    onOpenAddMeal(action);
  };

  return (
    <div className="shrink-0 w-full px-5 pb-6 pt-2 flex justify-center z-20">
      {menuOpen && (
        <button
          aria-label="Zavřít nabídku"
          onClick={() => setMenuOpen(false)}
          className="absolute inset-0 z-10 bg-slate-950/20 dark:bg-slate-950/40 transition-colors"
        />
      )}

      <div className="relative w-full flex items-center justify-between rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-rose-100/70 dark:border-slate-800 shadow-[0_14px_34px_-16px_rgba(196,58,92,0.4)] dark:shadow-[0_14px_34px_-16px_rgba(0,0,0,0.65)] px-2.5 py-2 transition-colors">
        {tabs.slice(0, 2).map((tab) => (
          <button key={tab.id} onClick={() => selectTab(tab.id)} className={navItemClass(tab.id)}>
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[9px] font-bold">{tab.label}</span>
          </button>
        ))}

        {/* HLAVNÍ AKČNÍ TLAČÍTKO — po klepnutí vyrojí tři satelity (foto / hlas / text),
            samo se nemění, jen se ikona +/× otočí. Kruhovost tlačítka tak zůstává netknutá. */}
        <div className="relative -top-4 w-14 h-14 shrink-0 z-20">
          {SATELLITES.map(({ action, label, icon: Icon, dx, dy }) => (
            <button
              key={action}
              onClick={() => chooseAction(action)}
              tabIndex={menuOpen ? 0 : -1}
              aria-label={label}
              style={satelliteOffset(dx, dy)}
              className={`fab-satellite absolute left-1/2 bottom-0 w-11 h-11 rounded-full flex items-center justify-center text-white bg-linear-to-tr from-rose-600 to-rose-400 border-[3px] border-white dark:border-slate-900 shadow-lg shadow-rose-500/40 active:scale-95 ${
                menuOpen ? 'fab-satellite-open' : ''
              }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          ))}
          {SATELLITES.map(({ action, label, dx, dy }) => (
            <span
              key={action}
              aria-hidden="true"
              style={satelliteOffset(dx, `calc(${dy} - 34px)`)}
              className={`fab-satellite-label absolute left-1/2 bottom-0 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 shadow-md ${
                menuOpen ? 'fab-satellite-label-open' : ''
              }`}
            >
              {label}
            </span>
          ))}

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Zavřít nabídku' : 'Přidat jídlo'}
            className="absolute inset-0 bg-linear-to-tr from-rose-600 to-rose-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-rose-500/40 transform transition-transform active:scale-95 hover:scale-105 border-4 border-white dark:border-slate-900"
          >
            <Plus className={`w-6 h-6 transition-transform duration-300 ${menuOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>

        {tabs.slice(2).map((tab) => (
          <button key={tab.id} onClick={() => selectTab(tab.id)} className={navItemClass(tab.id)}>
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[9px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
