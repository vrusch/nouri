import { useRef, useState } from "react";
import { User, Moon, Sun, Smartphone, Ruler, Weight, Target, Flag, Trash2, Download, Upload, FileJson, FileText, RefreshCw, ChevronRight, Info, LogOut, ChevronDown, Check, Edit2, Sparkles, Loader2, Zap, Activity, Bell, BellOff, Dumbbell, Plus, MessageCircleHeart, TreePalm, Droplet, type LucideIcon } from "lucide-react";
import { useTheme } from "../context/useTheme";
import { type Theme } from "../context/ThemeContext";
import { useAuth } from "../context/useAuth";
import { type UserProfile } from "../context/AuthContext";
import { MyaAI } from "../lib/ai";
import { calculateNutrition } from "../lib/nutrition";
import {
  logWeight,
  clearMealsBackup,
  bulkBackupMeals,
  fetchWeightLogs,
  fetchBodyMeasurements,
  fetchShoppingList,
  fetchSavedRecipes,
  fetchMealTemplates,
  fetchProgressPhotos,
  fetchChatMessages,
  fetchCycleLogs,
} from "../lib/cloudSync";
import { buildMonthlyReportData } from "../lib/report";
import { downloadMonthlyReportPdf } from "../lib/pdfReport";
import { formatDaysCs, formatMealsCs, formatRowsCs } from "../lib/format";
import { parseMealsCsv } from "../lib/csvImport";
import { classifyReportLine, splitBoldSegments } from "../lib/aiReportMarkdown";
import { computeProfileCheckStatus } from "../lib/profileCheck";
import { QUIET_HOURS_START, QUIET_HOURS_END } from "../lib/quietHours";
import { DAY_NAMES_CS } from "../lib/workoutPlan";
import { addVacationRange, endVacationFromDate } from "../lib/vacationMode";
import { db, type MealItem } from "../db/db";
import pkg from "../../package.json";

// Rozsekání jednoho řádku AI reportu na tučné/normální úseky (viz aiReportMarkdown.ts) do
// React uzlů — čistě prezentační krok, proto zůstává tady, ne v pure lib souboru.
function renderBoldSegments(text: string) {
  return splitBoldSegments(text).map((segment, idx) => (
    <span key={idx} className={segment.bold ? "font-bold text-slate-800 dark:text-slate-100" : undefined}>
      {segment.text}
    </span>
  ));
}

export default function Profile() {
  const { theme, setTheme } = useTheme();
  const { profile, user, logout, updateProfile } = useAuth();

  // Stavy pro editaci
  const [editing, setEditing] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Správa dat stavy
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vlastní připomínky stavy
  const [newReminderText, setNewReminderText] = useState("");
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // AI report stavy
  const [isGenerating, setIsGenerating] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  const themeOptions: { id: Theme; label: string; icon: LucideIcon }[] = [
    { id: "light", label: "Světlý", icon: Sun },
    { id: "dark", label: "Tmavý", icon: Moon },
    { id: "system", label: "Systém", icon: Smartphone },
  ];

  const goalOptions: { id: UserProfile['goal']; label: string }[] = [
    { id: 'lose', label: 'Hubnout' },
    { id: 'maintain', label: 'Udržovat váhu' },
    { id: 'gain', label: 'Nabírat svaly' },
  ];

  const reminderOptions = [1, 2, 3, 5, 7];

  const quietHoursEnabled = profile?.quietHoursEnabled ?? true;
  const quietHoursStart = profile?.quietHoursStart ?? QUIET_HOURS_START;
  const quietHoursEnd = profile?.quietHoursEnd ?? QUIET_HOURS_END;
  const formatHour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const handleAdjustQuietHour = (field: "quietHoursStart" | "quietHoursEnd", delta: number) => {
    const current = field === "quietHoursStart" ? quietHoursStart : quietHoursEnd;
    updateProfile({ [field]: (current + delta + 24) % 24 });
  };

  const plannedWorkoutDays = profile?.plannedWorkoutDays ?? [];
  const toggleWorkoutPlanDay = (day: number) => {
    const next = plannedWorkoutDays.includes(day)
      ? plannedWorkoutDays.filter((d) => d !== day)
      : [...plannedWorkoutDays, day].sort();
    updateProfile({ plannedWorkoutDays: next });
  };

  // Dovolenkový režim (FEATURE_IDEAS.md sekce 3) — sdílí `profile.vacationDates` s jednorázovým
  // "Dnes mám volno" tlačítkem na Home (viz vacationMode.ts), appka tu jen přidává celý rozsah
  // najednou. Rozsah appka nikde neukládá jako {start,end} — vždy jen odvozený z aktuálních
  // (dnešek nebo pozdějších) datumů v poli, ať appka nemá dva zdroje pravdy.
  const [vacationStart, setVacationStart] = useState("");
  const [vacationEnd, setVacationEnd] = useState("");
  const todayISO = new Date().toISOString().split("T")[0];
  const upcomingVacationDates = (profile?.vacationDates ?? []).filter((d) => d >= todayISO).sort();
  const formatDateCs = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
  const vacationRangeLabel =
    upcomingVacationDates.length > 0
      ? `${formatDateCs(upcomingVacationDates[0])} – ${formatDateCs(upcomingVacationDates[upcomingVacationDates.length - 1])}`
      : null;

  const handleSetVacationRange = () => {
    if (!vacationStart || !vacationEnd) return;
    updateProfile({ vacationDates: addVacationRange(profile?.vacationDates, vacationStart, vacationEnd) });
    setVacationStart("");
    setVacationEnd("");
  };

  const handleEndVacation = () => {
    updateProfile({ vacationDates: endVacationFromDate(profile?.vacationDates, todayISO) });
  };

  const activityOptions: { id: UserProfile['activityLevel']; label: string; desc: string }[] = [
    { id: 1.2, label: "Nízká", desc: "Sedavé zaměstnání" },
    { id: 1.375, label: "Lehká", desc: "1-3x cvičení nebo 10k kroků" },
    { id: 1.55, label: "Střední", desc: "Aktivní pohyb 3-5x týdně" },
    { id: 1.725, label: "Vysoká", desc: "Denní intenzivní trénink" },
  ];

  const handleSave = async (field: keyof UserProfile | 'name') => {
    if (!tempValue && field === 'name') return setEditing(null);
    if (!tempValue) return setEditing(null);
    
    let val: string | number = tempValue;
    if (field === 'weight' || field === 'height' || field === 'targetWeight') val = Number(tempValue);

    const weightChanged = field === 'weight' && val !== profile?.weight;
    await updateProfile({ [field]: val });
    if (weightChanged && user && typeof val === 'number') {
      logWeight(user.uid, val, new Date().toISOString().split('T')[0]);
    }
    setEditing(null);
  };

  const startEdit = (field: string, current: unknown) => {
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

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const meals = await db.meals.orderBy('date').toArray();
      const header = ['Datum', 'Čas', 'Typ', 'Název', 'Kalorie', 'Bílkoviny (g)', 'Tuky (g)', 'Sacharidy (g)', 'Zdroj', 'Hrubý odhad'];
      const rows = meals.map(m => [
        m.date, m.time, m.type, m.name, m.value,
        m.protein ?? '', m.fat ?? '', m.carbs ?? '', m.source ?? '', m.roughEstimate ? 'ano' : ''
      ]);
      const csv = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nouri-jidla-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  // "Plná záloha" (B6 v AUDIT_2026-08-13.md) — dřív exportovala jen jídla, profil a váhu,
  // přestože se tak jmenovala. Tréninky appka bere z Dexie (stejně jako jídla — lokální cache
  // je tu autoritativní pro syncId), zbytek appka nemá lokálně vůbec, jde napřímo z Firestore
  // přes fetch* funkce (cloudSync.ts).
  const handleExportJson = async () => {
    if (!user) return;
    setIsExportingJson(true);
    try {
      const meals = await db.meals.orderBy('date').toArray();
      const workouts = await db.workouts.orderBy('date').toArray();
      const [
        weightLogs,
        bodyMeasurements,
        shoppingList,
        savedRecipes,
        mealTemplates,
        progressPhotos,
        chatMessages,
        cycleLogs,
      ] = await Promise.all([
        fetchWeightLogs(user.uid),
        fetchBodyMeasurements(user.uid),
        fetchShoppingList(user.uid),
        fetchSavedRecipes(user.uid),
        fetchMealTemplates(user.uid),
        fetchProgressPhotos(user.uid),
        fetchChatMessages(user.uid),
        fetchCycleLogs(user.uid),
      ]);
      const backup = {
        exportedAt: new Date().toISOString(),
        version: 2,
        profile,
        // Bez lokálního Dexie `id` — to je jen autoincrement téhle jedné instalace appky,
        // ne stabilní identifikátor. `syncId` (stabilní napříč zařízeními) zůstává.
        meals: meals.map((m) => ({
          name: m.name,
          value: m.value,
          time: m.time,
          date: m.date,
          type: m.type,
          protein: m.protein,
          fat: m.fat,
          carbs: m.carbs,
          source: m.source,
          syncId: m.syncId,
          // Rozpad na ingredience (FEATURE_IDEAS.md sekce 14) — JSON záloha ho na rozdíl od
          // CSV zachová beze ztráty, JSON.stringify pole s hodnotou undefined stejně zahodí.
          ingredients: m.ingredients,
        })),
        workouts: workouts.map((w) => ({
          name: w.name,
          caloriesBurned: w.caloriesBurned,
          durationMinutes: w.durationMinutes,
          time: w.time,
          date: w.date,
          syncId: w.syncId,
        })),
        weightLogs,
        bodyMeasurements,
        shoppingList,
        savedRecipes,
        mealTemplates,
        // Jen metadata (URL/cesta ve Storage) — samotné soubory fotek záloha neobsahuje.
        progressPhotos,
        chatMessages,
        cycleLogs,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nouri-zaloha-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingJson(false);
    }
  };

  // Formální PDF report za posledních 30 dní (FEATURE_IDEAS.md sekce 9) — vyšší úroveň
  // formálnosti než CSV export, use case "beru si to na kontrolu" k lékaři/nutričnímu poradci.
  const handleExportPdf = async () => {
    if (!user || !profile || !metrics) return;
    setIsExportingPdf(true);
    try {
      const meals = await db.meals.orderBy('date').toArray();
      const weightLogs = await fetchWeightLogs(user.uid);
      const measurements = await fetchBodyMeasurements(user.uid);
      const reportData = buildMonthlyReportData(meals, weightLogs, measurements);
      await downloadMonthlyReportPdf(profile, metrics, reportData);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // umožní vybrat i ten samý soubor znovu napodruhé
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const { meals, errors } = parseMealsCsv(text);
      if (meals.length > 0) {
        const mealsWithSyncId: MealItem[] = meals.map((m) => ({ ...m, syncId: crypto.randomUUID() }));
        await db.meals.bulkAdd(mealsWithSyncId);
        if (user) bulkBackupMeals(user.uid, mealsWithSyncId);
      }
      setImportResult({ imported: meals.length, errors });
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmProfileCheck = () => {
    updateProfile({ lastProfileCheckAt: new Date().toISOString().split('T')[0] });
  };

  const handleAddReminder = async () => {
    const text = newReminderText.trim();
    if (!text) return;
    setIsSavingReminder(true);
    try {
      const current = profile?.customReminders ?? [];
      await updateProfile({ customReminders: [...current, text] });
      setNewReminderText("");
    } finally {
      setIsSavingReminder(false);
    }
  };

  const handleDeleteReminder = (index: number) => {
    const current = profile?.customReminders ?? [];
    updateProfile({ customReminders: current.filter((_, i) => i !== index) });
  };

  const handleDeleteHistory = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setIsDeleting(true);
    try {
      await db.meals.clear();
      if (user) await clearMealsBackup(user.uid);
      setConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const profileCheckStatus = computeProfileCheckStatus(profile?.lastProfileCheckAt);

  // Vypočítat živé metriky pro zobrazení
  const metrics = profile ? calculateNutrition({
    gender: profile.gender,
    weight: profile.weight,
    height: profile.height,
    birthDate: profile.birthDate,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    calibratedTDEE: profile.calibratedTDEE
  }) : null;

  const accentBg = profile?.gender === 'female' ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-sky-50 dark:bg-sky-900/10';
  const accentText = profile?.gender === 'female' ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400';

  return (
    <div className="space-y-6 pt-8 pb-32 transition-colors max-w-lg mx-auto">
      
      {/* 1. HLAVIČKA */}
      <div className="flex flex-col items-center">
        <div className={`w-20 h-20 rounded-full bg-linear-to-tr p-0.5 shadow-lg ${profile?.gender === 'female' ? 'from-rose-500 to-rose-400' : 'from-sky-500 to-sky-400'}`}>
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
              className="text-xl font-bold bg-slate-100 dark:bg-slate-800 rounded px-3 py-1 dark:text-white outline-rose-500 text-center"
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
              <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-500 transition-colors" />
            </div>
          )}
          <p className="text-slate-400 text-xs font-medium">{user?.email}</p>
        </div>
      </div>

      {/* 1.5 PERIODICKÁ KONTROLA PROFILU */}
      {profileCheckStatus.checkOverdue && (
        <div className="px-4">
          <div className="bg-linear-to-br from-slate-50 to-slate-100/60 dark:from-slate-800/40 dark:to-slate-800/10 rounded-3xl p-6 border border-slate-200/60 dark:border-slate-700/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Pořád ti to sedí?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Zkontroluj, jestli výška, aktivita a cíl níže pořád odpovídají realitě — čísla se
              časem umí potichu rozjet od skutečnosti, pokud se profil dlouho needituje.
            </p>
            <button
              onClick={handleConfirmProfileCheck}
              className={`w-full ${profile?.gender === 'female' ? 'bg-rose-600' : 'bg-sky-600'} text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all`}
            >
              Ano, pořád sedí
            </button>
          </div>
        </div>
      )}

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
                className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-rose-500 text-right"
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
                className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-rose-500 text-right"
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

          {profile?.goal !== 'maintain' && (
            <div className="px-4 py-3.5 flex items-center justify-between group active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
                 onClick={() => editing !== 'targetWeight' && startEdit('targetWeight', profile?.targetWeight)}>
              <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
                <Flag className={`w-4 h-4 ${accentText}`} />
                Cílová váha
              </div>
              {editing === 'targetWeight' ? (
                <input
                  type="number" autoFocus
                  className="w-16 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-sm font-bold dark:text-white outline-rose-500 text-right"
                  value={tempValue}
                  onChange={(e) => setTempValue(e.target.value)}
                  onBlur={() => handleSave('targetWeight')}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                    {profile?.targetWeight !== undefined ? `${profile.targetWeight} kg` : 'Nastavit'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              )}
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

          <div
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'reminder' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'reminder' ? null : 'reminder')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Bell className="w-4 h-4 text-purple-500" />
              Připomínat vážení
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                Každých {formatDaysCs(profile?.weighInReminderDays ?? 3)}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'reminder' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>

          {editing === 'reminder' && (
            <div className={`px-2 pb-2 grid grid-cols-5 gap-1 ${accentBg}`}>
              {reminderOptions.map((n) => (
                <button
                  key={n}
                  onClick={async () => { await updateProfile({ weighInReminderDays: n }); setEditing(null); }}
                  className={`flex flex-col items-center py-3 rounded-xl transition-all ${(profile?.weighInReminderDays ?? 3) === n ? 'bg-white dark:bg-slate-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                >
                  <span className={`text-sm font-bold ${(profile?.weighInReminderDays ?? 3) === n ? accentText : 'text-slate-700 dark:text-slate-200'}`}>{n}</span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400">dní</span>
                </button>
              ))}
            </div>
          )}

          <div
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'quietHours' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'quietHours' ? null : 'quietHours')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <BellOff className="w-4 h-4 text-indigo-500" />
              Tichý režim
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                {quietHoursEnabled ? `${formatHour(quietHoursStart)}–${formatHour(quietHoursEnd)}` : 'Vypnuto'}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'quietHours' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>

          {editing === 'quietHours' && (
            <div className={`px-4 pb-4 space-y-4 ${accentBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Potlačovat upozornění v tomhle okně</span>
                <button
                  onClick={() => updateProfile({ quietHoursEnabled: !quietHoursEnabled })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${quietHoursEnabled ? 'bg-rose-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${quietHoursEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              <div className={`flex items-center justify-between gap-3 transition-opacity ${!quietHoursEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Od</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAdjustQuietHour('quietHoursStart', -1)}
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-sm text-slate-500 dark:text-slate-300 font-bold active:scale-90 transition-all"
                    >
                      −
                    </button>
                    <span className="w-11 text-center text-sm font-bold text-slate-800 dark:text-white tabular-nums">{formatHour(quietHoursStart)}</span>
                    <button
                      onClick={() => handleAdjustQuietHour('quietHoursStart', 1)}
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-sm text-slate-500 dark:text-slate-300 font-bold active:scale-90 transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Do</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleAdjustQuietHour('quietHoursEnd', -1)}
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-sm text-slate-500 dark:text-slate-300 font-bold active:scale-90 transition-all"
                    >
                      −
                    </button>
                    <span className="w-11 text-center text-sm font-bold text-slate-800 dark:text-white tabular-nums">{formatHour(quietHoursEnd)}</span>
                    <button
                      onClick={() => handleAdjustQuietHour('quietHoursEnd', 1)}
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-sm text-slate-500 dark:text-slate-300 font-bold active:scale-90 transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'workoutPlan' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'workoutPlan' ? null : 'workoutPlan')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <Dumbbell className="w-4 h-4 text-orange-500" />
              Plán tréninků
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                {plannedWorkoutDays.length === 0 ? 'Nenastaveno' : plannedWorkoutDays.map((d) => DAY_NAMES_CS[d]).join(', ')}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'workoutPlan' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>

          {editing === 'workoutPlan' && (
            <div className={`px-4 pb-4 ${accentBg}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                V naplánované dny appka připomene trénink, pokud do té doby žádný nezapíšeš.
              </p>
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES_CS.map((label, day) => {
                  const active = plannedWorkoutDays.includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleWorkoutPlanDay(day)}
                      className={`flex flex-col items-center py-2.5 rounded-xl transition-all ${active ? 'bg-white dark:bg-slate-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
                    >
                      <span className={`text-xs font-bold ${active ? accentText : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={`px-4 py-3.5 flex items-center justify-between transition-colors cursor-pointer ${editing === 'vacation' ? accentBg : 'active:bg-slate-50 dark:active:bg-slate-800'}`}
            onClick={() => setEditing(editing === 'vacation' ? null : 'vacation')}
          >
            <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
              <TreePalm className="w-4 h-4 text-teal-500" />
              Dovolenkový režim
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-800 dark:text-white">
                {vacationRangeLabel ?? 'Vypnuto'}
              </span>
              <ChevronDown className={`w-4 h-4 ${editing === 'vacation' ? accentText : 'text-slate-400'}`} />
            </div>
          </div>

          {editing === 'vacation' && (
            <div className={`px-4 pb-4 ${accentBg}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Appka po dobu dovolené ztlumí připomínky vážení a nezapsaného oběda a dané dny se
                nepočítají do streaku ani do týdenních průměrů.
              </p>
              {vacationRangeLabel && (
                <div className="flex items-center justify-between gap-2 mb-3 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Naplánováno: {vacationRangeLabel}
                  </span>
                  <button
                    onClick={handleEndVacation}
                    className="text-xs font-bold text-rose-600 dark:text-rose-400 shrink-0"
                  >
                    Ukončit
                  </button>
                </div>
              )}
              <div className="space-y-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Od</span>
                  <input
                    type="date"
                    value={vacationStart}
                    onChange={(e) => setVacationStart(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold dark:text-white outline-rose-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Do</span>
                  <input
                    type="date"
                    value={vacationEnd}
                    onChange={(e) => setVacationEnd(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold dark:text-white outline-rose-500"
                  />
                </label>
                <button
                  onClick={handleSetVacationRange}
                  disabled={!vacationStart || !vacationEnd}
                  className="w-full bg-teal-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  Nastavit dovolenou
                </button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Max. 60 dní najednou.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2.5 CYKLUS — jen gender: 'female', appka gender nikdy nepoužije k automatickému zapnutí
          (výslovný opt-in krok, viz REFERENCE/CYCLE_TRACKING_PROPOSAL.md sekce 7) */}
      {profile?.gender === 'female' && (
        <div className="space-y-1.5 px-4">
          <h2 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider transition-colors">Cyklus</h2>
          <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[15px] font-semibold dark:text-slate-200 transition-colors">
                <Droplet className="w-4 h-4 text-rose-500" />
                Sledovat cyklus
              </div>
              <button
                onClick={() => updateProfile({ cycleTrackingEnabled: !profile.cycleTrackingEnabled })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${profile.cycleTrackingEnabled ? 'bg-rose-600' : 'bg-slate-200 dark:bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${profile.cycleTrackingEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {!profile.cycleTrackingEnabled ? (
              <p className="px-4 pb-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Appka umí sledovat fázi cyklu a jemně na ni upozornit — je to čistě dobrovolné,
                data zůstávají jen tvoje a nikdy se nesdílí.
              </p>
            ) : (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-50 dark:border-slate-800 pt-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Datum začátku menstruace zapisuješ ve Statistikách — tohle jsou jen doplňující nastavení.
                </p>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Pravidelný cyklus</span>
                  <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-100 dark:border-slate-700 shrink-0">
                    <button
                      onClick={() => updateProfile({ cycleRegularity: 'regular' })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${(profile.cycleRegularity ?? 'regular') === 'regular' ? 'bg-white dark:bg-slate-600 shadow-sm text-rose-600 dark:text-white' : 'text-slate-400'}`}
                    >
                      Ano
                    </button>
                    <button
                      onClick={() => updateProfile({ cycleRegularity: 'irregular' })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${profile.cycleRegularity === 'irregular' ? 'bg-white dark:bg-slate-600 shadow-sm text-rose-600 dark:text-white' : 'text-slate-400'}`}
                    >
                      Ne
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Hormonální antikoncepce</span>
                  <button
                    onClick={() => updateProfile({ onHormonalContraception: !profile.onHormonalContraception })}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${profile.onHormonalContraception ? 'bg-rose-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${profile.onHormonalContraception ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
                {profile.onHormonalContraception && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Appka proto nepřidává luteální kalorický bonus k cíli — na antikoncepci není
                    přirozený hormonální vzestup jako v běžném cyklu.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

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
                    const classified = classifyReportLine(line);
                    if (classified.kind === 'header') {
                      return <h4 key={i} className="text-sm font-extrabold text-slate-900 dark:text-white pt-2">{classified.text}</h4>;
                    }
                    if (classified.kind === 'bullet') {
                      return (
                        <div key={i} className="flex gap-2 pl-2">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${profile.gender === 'female' ? 'bg-rose-400' : 'bg-sky-400'}`} />
                          <span>{renderBoldSegments(classified.text)}</span>
                        </div>
                      );
                    }
                    if (classified.kind === 'blank') return <div key={i} className="h-2" />;
                    return <p key={i}>{renderBoldSegments(classified.text)}</p>;
                  })}
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleGenerateReport(); }}
                  disabled={isGenerating}
                  className="w-full mt-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                  Aktualizovat analýzu
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3.5 VLASTNÍ PŘIPOMÍNKY */}
      <div className="px-4 space-y-1.5">
        <h2 className="px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider transition-colors">Vlastní připomínky</h2>
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 space-y-3 transition-colors">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Napiš si vlastní afirmaci nebo připomínku — Mya ji čas od času použije místo generické hlášky.
          </p>

          {(profile?.customReminders ?? []).map((text, i) => (
            <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2.5">
              <MessageCircleHeart className={`w-4 h-4 shrink-0 ${accentText}`} />
              <span className="flex-1 text-sm text-slate-700 dark:text-slate-200">{text}</span>
              <button
                onClick={() => handleDeleteReminder(i)}
                className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newReminderText}
              onChange={(e) => setNewReminderText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
              placeholder="Např. Jsi silnější, než si myslíš"
              maxLength={120}
              className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm outline-rose-500 dark:text-white transition-all"
            />
            <button
              onClick={handleAddReminder}
              disabled={isSavingReminder || !newReminderText.trim()}
              className={`shrink-0 w-10 h-10 flex items-center justify-center ${profile?.gender === 'female' ? 'bg-rose-600' : 'bg-sky-600'} text-white rounded-xl disabled:opacity-40 active:scale-[0.95] transition-all`}
            >
              {isSavingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* 4. VZHLED */}
      <div className="px-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3 pl-2 text-[15px] font-semibold dark:text-slate-200 transition-colors">
            <Sun className="w-4 h-4 dark:hidden text-rose-500" />
            <Moon className="w-4 h-4 hidden dark:block text-rose-400" />
            Vzhled
          </div>
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl gap-1 border border-slate-100 dark:border-slate-700 transition-colors">
            {themeOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={`p-1.5 rounded-lg transition-all ${
                  theme === opt.id
                    ? "bg-white dark:bg-slate-600 shadow-sm text-rose-600 dark:text-white"
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
              <button
                onClick={handleExportCsv}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Download className="w-4 h-4 text-slate-500" />}
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportovat do CSV</span>
              </button>
              <button
                onClick={handleExportJson}
                disabled={isExportingJson}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isExportingJson ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <FileJson className="w-4 h-4 text-slate-500" />}
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Plná záloha (JSON)</span>
              </button>
              <div>
                <button
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <FileText className="w-4 h-4 text-slate-500" />}
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">PDF report pro lékaře</span>
                </button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Shrnutí za posledních 30 dní — kalorie, makra, trend váhy a míry těla.
                </p>
              </div>
              <div>
                <button
                  onClick={handleImportClick}
                  disabled={isImporting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Upload className="w-4 h-4 text-slate-500" />}
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Importovat z CSV</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Očekává formát souboru staženého tlačítkem „Exportovat do CSV“ výše.
                </p>
                {importResult && (
                  <div
                    className={`mt-2 text-xs rounded-xl px-3 py-2 ${
                      importResult.errors.length > 0
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    Naimportováno {formatMealsCs(importResult.imported)}.
                    {importResult.errors.length > 0 && ` ${formatRowsCs(importResult.errors.length)} přeskočeno kvůli chybě.`}
                  </div>
                )}
              </div>
              <button
                onClick={handleDeleteHistory}
                disabled={isDeleting}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 border ${
                  confirmDelete
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-500 border-red-200 dark:border-red-900/50'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800'
                }`}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="text-sm font-bold">{confirmDelete ? 'Opravdu smazat? Klikni znovu' : 'Smazat veškerou historii'}</span>
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
