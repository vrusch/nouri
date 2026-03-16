import { useState } from "react";
import { User, Moon, Sun, Smartphone, Ruler, Weight, Target, Trash2, Download, ChevronRight, Info, LogOut, ChevronDown, Check, Edit2 } from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext";
import { useAuth, type UserProfile } from "../context/AuthContext";
import pkg from "../../package.json";

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const { profile, user, logout, updateProfile } = useAuth();
  
  // Stavy pro editaci
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  const themeOptions: { id: Theme; label: string; icon: any }[] = [
    { id: "light", label: "Světlý", icon: Sun },
    { id: "dark", label: "Tmavý", icon: Moon },
    { id: "system", label: "Systém", icon: Smartphone },
  ];

  const goalOptions: { id: UserProfile['goal']; label: string }[] = [
    { id: 'lose', label: 'Hubnout' },
    { id: 'maintain', label: 'Udržovat váhu' },
    { id: 'gain', label: 'Nabírat svaly' },
  ];

  const handleSave = async (field: keyof UserProfile | 'name') => {
    if (!tempValue && field === 'name') return setEditing(null);
    if (!tempValue) return setEditing(null);
    
    let val: any = tempValue;
    if (field === 'weight' || field === 'height') val = Number(tempValue);
    
    await updateProfile({ [field]: val });
    setEditing(null);
  };

  const startEdit = (field: string, current: any) => {
    setEditing(field);
    setTempValue(String(current || ''));
  };

  return (
    <div className="space-y-6 pt-8 pb-32 transition-colors max-w-lg mx-auto">
      
      {/* 1. HLAVIČKA (EDITOVATELNÉ JMÉNO) */}
      <div className="flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-linear-to-tr from-blue-500 to-sky-400 p-0.5 shadow-lg">
          <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden transition-colors">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profil" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-slate-300" />
            )}
          </div>
        </div>
        
        <div className="mt-4 flex flex-col items-center gap-1">
          {editing === 'name' ? (
            <div className="flex items-center gap-2">
              <input 
                autoFocus
                className="text-xl font-bold bg-slate-100 dark:bg-slate-800 rounded px-3 py-1 dark:text-white outline-blue-500 text-center"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleSave('name')}
                onKeyDown={(e) => e.key === 'Enter' && handleSave('name')}
              />
            </div>
          ) : (
            <div 
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => startEdit('name', profile?.name || user?.displayName)}
            >
              <h1 className="text-xl font-bold dark:text-white transition-colors">
                {profile?.name || user?.displayName || 'Uživatel'}
              </h1>
              <Edit2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
            </div>
          )}
          <p className="text-slate-400 text-xs font-medium">{user?.email}</p>
        </div>
      </div>

      {/* 2. MOJE TĚLO A CÍLE */}
      <div className="space-y-1.5 px-4">
        <h2 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider transition-colors">Moje tělo</h2>
        <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800 transition-colors">
          
          {/* VÁHA */}
          <div className="px-4 py-3.5 flex items-center justify-between group active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
               onClick={() => editing !== 'weight' && startEdit('weight', profile?.weight)}>
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Weight className="w-4 h-4 text-blue-500" />
              Váha
            </div>
            {editing === 'weight' ? (
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  autoFocus
                  className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-blue-500"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={() => handleSave('weight')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave('weight')}
                />
                <Check className="w-4 h-4 text-green-500" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-slate-800 dark:text-white transition-colors">{profile?.weight} kg</span>
                <ChevronRight className="w-4 h-4 text-slate-300 transition-colors" />
              </div>
            )}
          </div>

          {/* VÝŠKA */}
          <div className="px-4 py-3.5 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
               onClick={() => editing !== 'height' && startEdit('height', profile?.height)}>
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Ruler className="w-4 h-4 text-emerald-500" />
              Výška
            </div>
            {editing === 'height' ? (
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  autoFocus
                  className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-blue-500"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={() => handleSave('height')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave('height')}
                />
                <Check className="w-4 h-4 text-green-500" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-slate-800 dark:text-white transition-colors">{profile?.height} cm</span>
                <ChevronRight className="w-4 h-4 text-slate-300 transition-colors" />
              </div>
            )}
          </div>

          {/* MŮJ CÍL */}
          <div className="transition-all overflow-hidden">
            <div 
              className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'goal' ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
              onClick={() => setEditing(editing === 'goal' ? null : 'goal')}
            >
              <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
                <Target className="w-4 h-4 text-orange-500" />
                Můj cíl
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-blue-600 dark:text-blue-400 transition-colors">
                  {goalOptions.find(o => o.id === profile?.goal)?.label || 'Nastavit'}
                </span>
                {editing === 'goal' ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
              </div>
            </div>
            
            {editing === 'goal' && (
              <div className="px-2 pb-2 grid grid-cols-1 gap-1 bg-blue-50/50 dark:bg-blue-900/10 animate-in fade-in slide-in-from-top-1 duration-200">
                {goalOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={async () => {
                      await updateProfile({ goal: opt.id });
                      setEditing(null);
                    }}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                      profile?.goal === opt.id 
                        ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-white' 
                        : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="text-sm font-bold">{opt.label}</span>
                    {profile?.goal === opt.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. VZHLED */}
      <div className="px-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3 pl-2 text-[15px] font-semibold dark:text-slate-200 transition-colors">
            <Sun className="w-4 h-4 dark:hidden text-indigo-500" />
            <Moon className="w-4 h-4 hidden dark:block text-indigo-400" />
            Vzhled
          </div>
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-100 dark:border-slate-700 transition-colors">
            {themeOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={`p-1.5 rounded-lg transition-all ${
                  theme === opt.id
                    ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white"
                    : "text-slate-400"
                }`}
              >
                <opt.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. SPRÁVA DAT */}
      <div className="px-4 space-y-1.5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <button 
            onClick={() => setShowPrivacy(!showPrivacy)}
            className="w-full px-4 py-3.5 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Trash2 className="w-4 h-4 text-slate-400" />
              Správa dat a historie
            </div>
            {showPrivacy ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
          </button>
          
          {showPrivacy && (
            <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all">
                <Download className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportovat do CSV</span>
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800">
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-bold">Smazat veškerou historii</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. PATIČKA */}
      <div className="pt-4 flex flex-col items-center space-y-6">
        <button 
          onClick={() => logout()}
          className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-bold px-6 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-all"
        >
          <LogOut className="w-4 h-4" />
          Odhlásit se
        </button>
        
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest transition-colors">
          <Info className="w-3 h-3" />
          Nouri v{pkg.version} (BETA)
        </div>
      </div>

    </div>
  );
}
