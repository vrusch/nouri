import { User, Settings, Bell, Moon, Sun, Smartphone, Ruler, Weight, Target, Trash2, Download, ChevronRight, Info } from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const { profile, user, logout } = useAuth();

  const metrics = [
    { icon: Ruler, label: "Výška", value: `${profile?.height || '--'} cm` },
    { icon: Weight, label: "Váha", value: `${profile?.weight || '--'} kg` },
    { icon: Target, label: "Cíl", value: profile?.goal === 'lose' ? 'Hubnout' : profile?.goal === 'maintain' ? 'Udržovat' : 'Nabírat' },
  ];

  const themeOptions: { id: Theme; label: string; icon: any }[] = [
    { id: "light", label: "Světlý", icon: Sun },
    { id: "dark", label: "Tmavý", icon: Moon },
    { id: "system", label: "Systém", icon: Smartphone },
  ];

  return (
    <div className="space-y-8 pt-6 pb-24 transition-colors">
      {/* 1. HLAVIČKA PROFILU */}
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 border-4 border-white dark:border-slate-800 shadow-sm transition-colors overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profil" className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12" />
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">{profile?.name || user?.displayName || 'Uživatel'}</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{user?.email}</p>
      </div>

      {/* 2. RYCHLÉ METRIKY (Zobrazujeme to, co se mění nejčastěji) */}
      <div className="grid grid-cols-3 gap-3">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center space-y-1 transition-colors shadow-sm">
            <m.icon className="w-4 h-4 text-blue-500 mb-1" />
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{m.label}</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{m.value}</span>
          </div>
        ))}
      </div>

      {/* 3. SEKCE: MOJE NASTAVENÍ */}
      <div className="space-y-3">
        <h2 className="px-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Moje Nastavení</h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
          <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Settings className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="block font-semibold text-slate-700 dark:text-slate-200">Upravit parametry</span>
                <span className="text-xs text-slate-400">Jméno, výška, věk, pohlaví</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" />
          </button>

          <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Target className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="block font-semibold text-slate-700 dark:text-slate-200">Cíl a kalorie</span>
                <span className="text-xs text-slate-400">Limit: {profile?.targetCalories || 1800} kcal (Automaticky)</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" />
          </button>

          <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Bell className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="block font-semibold text-slate-700 dark:text-slate-200">Notifikace</span>
                <span className="text-xs text-slate-400">Připomenutí jídla a pitného režimu</span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* 4. SEKCE: VZHLED (Ponecháno jako rychlý přepínač) */}
      <div className="space-y-3">
        <h2 className="px-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Vzhled Aplikace</h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-1.5 shadow-sm border border-slate-100 dark:border-slate-800 flex gap-1 transition-colors">
          {themeOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-2xl transition-all ${
                theme === opt.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <opt.icon className="w-4 h-4" />
              <span className="text-sm font-bold">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. SEKCE: DATA A SOUKROMÍ */}
      <div className="space-y-3">
        <h2 className="px-1 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Správa Dat</h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
          <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div className="flex items-center gap-4">
              <Download className="w-5 h-5 text-slate-400" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Exportovat historii (CSV)</span>
            </div>
          </button>

          <button className="w-full px-6 py-4 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors group">
            <div className="flex items-center gap-4">
              <Trash2 className="w-5 h-5 text-red-400 group-hover:text-red-500" />
              <span className="font-semibold text-red-500">Smazat historii jídla</span>
            </div>
          </button>
        </div>
      </div>

      {/* 6. INFO A ODHLÁŠENÍ */}
      <div className="pt-4 flex flex-col items-center space-y-4">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
          <Info className="w-3 h-3" />
          Nouri v0.2.2 (BETA)
        </div>
        <button 
          onClick={() => logout()}
          className="w-full py-5 rounded-3xl bg-slate-100 dark:bg-slate-900 text-red-500 dark:text-red-400 font-bold transition-all active:scale-[0.98] border border-slate-200 dark:border-slate-800 shadow-sm"
        >
          Odhlásit se
        </button>
      </div>
    </div>
  );
}
