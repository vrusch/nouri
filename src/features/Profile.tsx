import { User, Settings, Bell, Shield, Moon, Sun, Smartphone } from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext";

export default function Profile() {
  const { theme, setTheme } = useTheme();

  const menu = [
    { icon: User, label: "Osobní údaje" },
    { icon: Bell, label: "Notifikace" },
    { icon: Shield, label: "Soukromí" },
    { icon: Settings, label: "Obecná nastavení" },
  ];

  const themeOptions: { id: Theme; label: string; icon: any }[] = [
    { id: "light", label: "Světlý", icon: Sun },
    { id: "dark", label: "Tmavý", icon: Moon },
    { id: "system", label: "Systém", icon: Smartphone },
  ];

  return (
    <div className="space-y-8 pt-6">
      {/* Uživatelské info */}
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 border-4 border-white dark:border-slate-800 shadow-sm transition-colors">
          <User className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">Petya</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Cíl: Hubnutí (-5 kg)</p>
      </div>

      {/* Nastavení Vzhledu (Nový přepínač) */}
      <div className="space-y-3">
        <h2 className="px-1 text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Vzhled</h2>
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

      {/* Klasické menu */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
        {menu.map((item, i) => (
          <button key={i} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
            <div className="flex items-center gap-4">
              <item.icon className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
            </div>
            <div className="text-slate-300 dark:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <button className="w-full py-4 text-red-500 dark:text-red-400 font-bold transition-colors">Odhlásit se</button>
    </div>
  );
}
