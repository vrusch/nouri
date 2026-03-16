import { useState } from "react";
import { User, Moon, Sun, Smartphone, Ruler, Weight, Target, Trash2, Download, ChevronRight, Info, LogOut, ChevronDown, Check, Edit2, Sparkles, Loader2, Zap, Activity } from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext";
import { useAuth, type UserProfile } from "../context/AuthContext";
import { MyaAI } from "../lib/ai";
import { calculateNutrition } from "../lib/nutrition";
import pkg from "../../package.json";

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const { profile, user, logout, updateProfile } = useAuth();
  
  // Stavy pro editaci
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  // AI report stavy
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

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

  const activityOptions: { id: UserProfile['activityLevel']; label: string; desc: string }[] = [
    { id: 1.2, label: "Nízká", desc: "Sedavé zaměstnání" },
    { id: 1.375, label: "Lehká", desc: "1-3x cvičení nebo 10k kroků" },
    { id: 1.55, label: "Střední", desc: "Aktivní pohyb 3-5x týdně" },
    { id: 1.725, label: "Vysoká", desc: "Denní intenzivní trénink" },
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

  const handleGenerateReport = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const report = await MyaAI.generateWelcomeReport(profile);
      await updateProfile({ 
        lastAiReport: report.text,
        targetCalories: report.data?.targetCalories || profile.targetCalories 
      });
      setShowFullReport(true);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Vypočítat živé metriky pro zobrazení
  const metrics = profile ? calculateNutrition({
    gender: profile.gender,
    weight: profile.weight,
    height: profile.height,
    birthDate: profile.birthDate,
    activityLevel: profile.activityLevel,
    goal: profile.goal
  }) : null;

  const accentColor = profile?.gender === 'female' ? 'rose' : 'sky';
  const accentBg = profile?.gender === 'female' ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-sky-50 dark:bg-sky-900/10';
  const accentText = profile?.gender === 'female' ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400';

  return (
    <div className="space-y-6 pt-8 pb-32 transition-colors max-w-lg mx-auto">
      
      {/* 1. HLAVIČKA */}
      <div className="flex flex-col items-center">
        <div className={`w-20 h-20 rounded-full bg-linear-to-tr from-${accentColor}-500 to-${accentColor}-400 p-0.5 shadow-lg`}>
          <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden transition-colors">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profil" className="w-full h-full object-cover" />
            ) : (
              <User className={`w-10 h-10 text-slate-200`} />
            )}
          </div>
        </div>
        
        <div className="mt-4 flex flex-col items-center gap-1">
          {editing === 'name' ? (
            <input 
              autoFocus
              className="text-xl font-bold bg-slate-100 dark:bg-slate-800 rounded px-3 py-1 dark:text-white outline-blue-500 text-center"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={() => handleSave('name')}
              onKeyDown={(e) => e.key === 'Enter' && handleSave('name')}
            />
          ) : (
            <div 
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => startEdit('name', profile?.name || user?.displayName)}
            >
              <h1 className="text-xl font-bold dark:text-white transition-colors">
                {profile?.name || user?.displayName || 'Uživatel'}
              </h1>
              <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
          )}
          <p className="text-slate-400 text-xs font-medium">{user?.email}</p>
        </div>
      </div>

      {/* 2. MOJE TĚLO A CÍLE */}
      <div className="space-y-1.5 px-4">
        <h2 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider transition-colors">Moje tělo</h2>
        <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800 transition-colors">
          
          <div className="px-4 py-3.5 flex items-center justify-between group active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
               onClick={() => editing !== 'weight' && startEdit('weight', profile?.weight)}>
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Weight className={`w-4 h-4 ${accentText}`} />
              Váha
            </div>
            {editing === 'weight' ? (
              <input 
                type="number" autoFocus
                className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-blue-500 text-right"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleSave('weight')}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-slate-800 dark:text-white">{profile?.weight} kg</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>

          <div className="px-4 py-3.5 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
               onClick={() => editing !== 'height' && startEdit('height', profile?.height)}>
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Ruler className="w-4 h-4 text-emerald-500" />
              Výška
            </div>
            {editing === 'height' ? (
              <input 
                type="number" autoFocus
                className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-blue-500 text-right"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => handleSave('height')}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-slate-800 dark:text-white">{profile?.height} cm</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>

          <div 
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'goal' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'goal' ? null : 'goal')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Target className="w-4 h-4 text-orange-500" />
              Můj cíl
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[15px] font-bold ${accentText}`}>
                {goalOptions.find(o => o.id === profile?.goal)?.label || 'Nastavit'}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'goal' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>
          
          {editing === 'goal' && (
            <div className={`px-2 pb-2 grid grid-cols-1 gap-1 ${accentBg}`}>
              {goalOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={async () => { await updateProfile({ goal: opt.id }); setEditing(null); }}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${profile?.goal === opt.id ? 'bg-white dark:bg-slate-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                >
                  <span className={`text-sm font-bold ${profile?.goal === opt.id ? accentText : 'text-slate-500'}`}>{opt.label}</span>
                  {profile?.goal === opt.id && <Check className={`w-4 h-4 ${accentText}`} />}
                </button>
              ))}
            </div>
          )}

          <div 
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'activity' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'activity' ? null : 'activity')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Zap className="w-4 h-4 text-yellow-500" />
              Aktivita
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                {activityOptions.find(o => o.id === profile?.activityLevel)?.label || 'Nastavit'}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'activity' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>
          
          {editing === 'activity' && (
            <div className={`px-2 pb-2 grid grid-cols-1 gap-1 ${accentBg}`}>
              {activityOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={async () => { await updateProfile({ activityLevel: opt.id }); setEditing(null); }}
                  className={`flex flex-col px-4 py-3 rounded-xl transition-all ${profile?.activityLevel === opt.id ? 'bg-white dark:bg-slate-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                >
                  <div className="w-full flex justify-between items-center">
                    <span className={`text-sm font-bold ${profile?.activityLevel === opt.id ? accentText : 'text-slate-700 dark:text-slate-200'}`}>{opt.label}</span>
                    {profile?.activityLevel === opt.id && <Check className={`w-4 h-4 ${accentText}`} />}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. AI REPORT */}
      <div className="px-4 space-y-1.5">
        <h2 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider transition-colors">Mya Insight</h2>
        
        {!profile?.lastAiReport ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 text-center space-y-4">
            <div className={`w-12 h-12 ${accentBg} rounded-xl flex items-center justify-center ${accentText} mx-auto`}>
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed px-4">
              Mya připraví kompletní report tvého těla a navrhne ideální cestu k tvému cíli.
            </p>
            <button 
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className={`w-full ${profile?.gender === 'female' ? 'bg-rose-500' : 'bg-sky-500'} text-white py-4 rounded-xl font-extrabold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
            >
              {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Mya počítá...</> : "Generovat analýzu"}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
            {/* METRIKY GRID */}
            <div className="grid grid-cols-2 gap-px bg-slate-50 dark:bg-slate-800 border-b border-slate-50 dark:border-slate-800">
              <div className="bg-white dark:bg-slate-900 p-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">BMR</div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{metrics?.bmr} <span className="text-[10px] opacity-50 font-medium">kcal</span></div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">TDEE</div>
                <div className="text-lg font-extrabold text-slate-800 dark:text-white">{metrics?.tdee} <span className="text-[10px] opacity-50 font-medium">kcal</span></div>
              </div>
            </div>

            {/* ROZBALOVACÍ TEXT */}
            <button 
              onClick={() => setShowFullReport(!showFullReport)}
              className="w-full px-4 py-3.5 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200">
                <Sparkles className={`w-4 h-4 ${accentText}`} />
                Osobní analýza od Mya
              </div>
              {showFullReport ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>

            {showFullReport && (
              <div className="px-4 pb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="h-px bg-slate-50 dark:bg-slate-800 -mx-4 mb-4" />
                <div className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 space-y-4">
                  {profile.lastAiReport.split('\n').map((line, i) => {
                    if (line.startsWith('###')) return <h4 key={i} className="text-sm font-extrabold text-slate-900 dark:text-white pt-2">{line.replace('###', '').trim()}</h4>;
                    if (line.startsWith('*') || line.startsWith('-')) return (
                      <div key={i} className="flex gap-2 pl-2">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${profile.gender === 'female' ? 'bg-rose-400' : 'bg-sky-400'}`} />
                        <span>{line.substring(1).trim()}</span>
                      </div>
                    );
                    return line.trim() === '' ? <div key={i} className="h-2" /> : <p key={i}>{line}</p>;
                  })}
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleGenerateReport(); }}
                  disabled={isGenerating}
                  className="w-full mt-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-[11px] font-bold text-slate-400 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                  Aktualizovat analýzu
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. VZHLED */}
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

      {/* 5. SPRÁVA DAT */}
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
            {showPrivacy ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          
          {showPrivacy && (
            <div className="px-4 pb-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all">
                <Download className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportovat do CSV</span>
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800">
                <Trash2 className="w-4 h-4" />
                <span className="text-sm font-bold">Smazat veškerou historie</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 6. PATIČKA */}
      <div className="pt-4 flex flex-col items-center space-y-6">
        <button 
          onClick={() => logout()}
          className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-bold px-6 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-all"
        >
          <LogOut className="w-4 h-4" />
          Odhlásit se
        </button>
        
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest transition-colors">
          <Info className="w-3 h-3" />
          Nouri v{pkg.version} (BETA)
        </div>
      </div>

    </div>
  );
}
