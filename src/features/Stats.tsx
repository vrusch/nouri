import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Gauge, Sparkles, Loader2, Ruler, Plus, Camera, Share2, Heart, PartyPopper, Droplet, Flag, X, Layers } from "lucide-react";
import { db } from "../db/db";
import { useAuth } from "../context/useAuth";
import {
  calculateNutrition,
  calibrateTarget,
  getCalibrationProgress,
  CALIBRATION_DISMISS_COOLDOWN_DAYS,
  type CalibrationProgressStatus,
} from "../lib/nutrition";
import { summarizeWeek, computeWeekdayWeekendProteinBreakdown } from "../lib/weekSummary";
import { computeLoggingStreak } from "../lib/streak";
import { generateWeeklyShareCardBlob } from "../lib/shareCard";
import { formatWorkoutsCs, formatDaysCs } from "../lib/format";
import {
  buildDailyProteinRecords,
  detectLowProteinPattern,
  MACRO_PATTERN_COOLDOWN_DAYS,
  MIN_RELIABLE_DAYS as MIN_RELIABLE_PROTEIN_DAYS,
} from "../lib/macroPattern";
import {
  buildDailyCalorieRecords,
  detectLowCaloriePattern,
  LOW_CALORIE_PATTERN_COOLDOWN_DAYS,
  MIN_RELIABLE_DAYS as MIN_RELIABLE_CALORIE_DAYS,
} from "../lib/calorieIntakePattern";
import { computeMonthRetrospective } from "../lib/monthRetrospective";
import { detectGoalReached } from "../lib/goalReached";
import { isVacationDay } from "../lib/vacationMode";
import { computeMeasurementTrend, MEASUREMENT_FIELDS, MEASUREMENT_LABELS_CS } from "../lib/bodyMeasurements";
import { fileToCompressedDataUrl } from "../lib/image";
import { daysSince } from "../lib/weighIn";
import { getLocalDateISO } from "../lib/date";
import { getCyclePhase, computeAvgCycleLength, PHASE_LABELS_CS, PHASE_NOTES_CS, DEFAULT_CYCLE_LENGTH_DAYS } from "../lib/cyclePhase";
import { isQuietHours } from "../lib/quietHours";
import { MyaAI } from "../lib/ai";
import {
  subscribeWeightLogs,
  subscribeBodyMeasurements,
  logBodyMeasurement,
  subscribeProgressPhotos,
  uploadProgressPhoto,
  deleteProgressPhoto,
  subscribeCycleLogs,
  logCycleStart,
  deleteCycleLog,
  type WeightLogEntry,
  type BodyMeasurementEntry,
  type ProgressPhotoEntry,
  type CycleLogEntry,
} from "../lib/cloudSync";
import ProgressPhotoLightbox from "../components/ProgressPhotoLightbox";
import EmptyState from "../components/EmptyState";

const DAY_LABELS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

// B1 v REFERENCE/DATA_COMPLETENESS_PLAN.md — calibrateTarget vrací null jak pro "málo dat", tak
// pro "dost dat, ale odhad sedí formulce"; appka to dřív nerozlišovala a kartu v obou případech
// stejně skryla. Text pro "matches-formula"/"ready" appka řeší přímo v render těle (jiný vzhled
// karty), ne tady.
function calibrationProgressText(status: CalibrationProgressStatus): string {
  switch (status) {
    case "not-enough-weighins":
      return "Appka potřebuje aspoň dva zápisy váhy, ať má co porovnávat.";
    case "span-too-short":
      return "Appka potřebuje delší odstup mezi prvním a posledním zápisem váhy, ať cyklické výkyvy stihnou odeznít.";
    case "not-enough-logged-days":
      return "Appka potřebuje víc zapsaných dní s jídlem v tomhle období.";
    case "coverage-too-sparse":
      return "Zapsaných dní je zatím málo vůči délce sledovaného období — přidej pár dalších zápisů.";
    default:
      return "";
  }
}

// offsetDays posouvá celé okno dál do minulosti — lastNDates(7, 7) je týden bezprostředně
// před lastNDates(7), použito pro porovnání "tento týden vs. minulý týden".
function lastNDates(n: number, offsetDays: number = 0): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i - offsetDays);
    dates.push(getLocalDateISO(d));
  }
  return dates;
}

export default function Stats() {
  const { profile, user, updateProfile } = useAuth();
  const nutrition = profile ? calculateNutrition(profile) : null;
  const targetCalories = nutrition ? nutrition.targetCalories : 1800;

  const days = lastNDates(7);
  const previousWeekDays = lastNDates(7, 7);
  const today = days[days.length - 1];
  const [selectedDay, setSelectedDay] = useState<string>(today);
  const [selectedWorkoutDay, setSelectedWorkoutDay] = useState<string>(today);

  // Všechna jídla, ne jen posledních 7 dní — kalibrace cíle a porovnání s minulým týdnem
  // (obojí níže) potřebují delší historii.
  const allMeals = useLiveQuery(() => db.meals.toArray()) || [];
  const allWorkouts = useLiveQuery(() => db.workouts.toArray()) || [];

  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  useEffect(() => {
    if (!user) return;
    return subscribeWeightLogs(user.uid, setWeightLogs);
  }, [user]);

  const [bodyMeasurements, setBodyMeasurements] = useState<BodyMeasurementEntry[]>([]);
  useEffect(() => {
    if (!user) return;
    return subscribeBodyMeasurements(user.uid, setBodyMeasurements);
  }, [user]);
  // N25 (AUDIT_2026-08-14.md) — vstupní pole žijí ve vlastním BodyMeasurementForm níž
  // (jen showLogMeasurement zůstává tady), ať appka psaní do nich neroztáčí přepočet
  // totalsByDay/kalibrace/vzorců, se kterými vůbec nesouvisí.
  const [showLogMeasurement, setShowLogMeasurement] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [weeklySummaryText, setWeeklySummaryText] = useState<string | null>(null);
  const [generatingWeeklySummary, setGeneratingWeeklySummary] = useState(false);

  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoEntry[]>([]);
  useEffect(() => {
    if (!user) return;
    return subscribeProgressPhotos(user.uid, setProgressPhotos);
  }, [user]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<ProgressPhotoEntry | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Cyklus (REFERENCE/CYCLE_TRACKING_PROPOSAL.md, Úroveň 0) — appka data odebírá jen když je
  // sledování zapnuté, ne jen podle gender: 'female' (appka to nikdy nezapne sama za uživatelku).
  const [cycleLogs, setCycleLogs] = useState<CycleLogEntry[]>([]);
  useEffect(() => {
    if (!user || !profile?.cycleTrackingEnabled) {
      setCycleLogs([]);
      return;
    }
    return subscribeCycleLogs(user.uid, setCycleLogs);
  }, [user, profile?.cycleTrackingEnabled]);
  // N25 — datum žije ve vlastním CycleStartForm níž, stejný důvod jako u BodyMeasurementForm.
  const [showLogCycle, setShowLogCycle] = useState(false);

  // Appka si průběžně přepočítává vlastní průměr délky cyklu z posledních zápisů (viz
  // computeAvgCycleLength v cyclePhase.ts) — nepředpokládá se pravidelnost, jen se to zapíše
  // do profilu, jakmile se liší, ať ho i Home.tsx (luteální bonus) může použít bez vlastního
  // přepočtu z celé historie cycleLogs.
  useEffect(() => {
    if (!profile?.cycleTrackingEnabled) return;
    const computed = computeAvgCycleLength(cycleLogs);
    if (computed !== null && computed !== profile.avgCycleLength) {
      updateProfile({ avgCycleLength: computed });
    }
  }, [cycleLogs, profile?.cycleTrackingEnabled, profile?.avgCycleLength, updateProfile]);

  const cyclePhaseInfo = profile?.cycleTrackingEnabled
    ? getCyclePhase(cycleLogs, profile.avgCycleLength ?? DEFAULT_CYCLE_LENGTH_DAYS, today)
    : null;

  const handleToggleLogCycle = () => {
    setShowLogCycle((v) => !v);
  };

  const handleDeleteCycleLog = (dateISO: string) => {
    if (!user) return;
    deleteCycleLog(user.uid, dateISO);
  };

  const totalsByDay = new Map<string, number>();
  allMeals.forEach((m) => totalsByDay.set(m.date, (totalsByDay.get(m.date) || 0) + m.value));

  const values = days.map((d) => totalsByDay.get(d) || 0);
  const maxValue = Math.max(targetCalories, ...values, 1);
  const targetLinePercent = Math.min(100, (targetCalories / maxValue) * 100);

  // Volný den / dovolenkový režim (FEATURE_IDEAS.md sekce 3) — appka je z týdenního průměru
  // vyloučí úplně, ne jen jako "0 kcal den" (ten už summarizeWeek přirozeně ignoruje samo), ať
  // ani reálně zapsaný "oslavný" den (třeba narozeninová večeře) neposune číslo, které appka
  // ukazuje jako "jak se ti daří". `values`/`workoutValues` výš zůstávají nedotčené, protože je
  // ještě potřebuje graf (maxValue/workoutMaxValue) pro škálování všech 7 sloupců, i toho
  // vynechaného.
  const vacationDaysThisWeek = days.filter((d) => isVacationDay(d, profile?.vacationDates));
  const trackableDaysThisWeek = days.filter((d) => !vacationDaysThisWeek.includes(d));
  const valuesForAverage = trackableDaysThisWeek.map((d) => totalsByDay.get(d) || 0);
  const { avgCalories, daysLogged } = summarizeWeek(valuesForAverage);

  const vacationDaysPrevWeek = previousWeekDays.filter((d) => isVacationDay(d, profile?.vacationDates));
  const trackableDaysPrevWeek = previousWeekDays.filter((d) => !vacationDaysPrevWeek.includes(d));
  const previousWeekValues = trackableDaysPrevWeek.map((d) => totalsByDay.get(d) || 0);
  const { avgCalories: previousAvgCalories, daysLogged: previousDaysLogged } = summarizeWeek(previousWeekValues);

  // Týdenní AI shrnutí (FEATURE_IDEAS.md sekce 3) — stejné `days` okno jako avgCalories výš,
  // ne 14denní okno jako macroPatternWindowStart níž (to je pro dlouhodobou detekci vzorce,
  // tohle je vyloženě "tenhle týden"). Záměrně NEfiltrované přes vacationDates jako avgCalories
  // výš — jde jen do AI promptu (getWeeklySummary), ne do žádného čísla zobrazeného appkou, takže
  // riziko z nekonzistence chybí a filtrování by stálo další deploy cyklus Cloud Function bez
  // reálného přínosu.
  // N25 (AUDIT_2026-08-14.md) — appka dřív volala buildDailyProteinRecords 2× nad celou
  // historií (jednou beze excludeDates, podruhé s [today]) — druhé volání appka teď odvodí
  // z prvního (odfiltruje dnešní záznam), místo aby přepočítala od nuly. Ekvivalentní
  // buildDailyProteinRecords(allMeals, [today]): ta dnešek z agregace úplně vynechá, takže
  // odstranění dnešního záznamu z už-agregovaného výsledku dá identické pole.
  const allProteinRecords = buildDailyProteinRecords(allMeals);
  const weekProteinRecords = allProteinRecords.filter((r) => days.includes(r.date));
  const weekdayWeekendBreakdown = computeWeekdayWeekendProteinBreakdown(weekProteinRecords);

  // Sdílecí karta (FEATURE_IDEAS.md sekce 5) — streak a váhový posun počítané ze stejného
  // `days` okna jako avgCalories/daysLogged výš, ať karta nikdy netvrdí jiná čísla než ta,
  // co appka zobrazuje hned vedle ní.
  const streak = computeLoggingStreak(allMeals.map((m) => m.date), undefined, profile?.vacationDates);
  const weekWeightLogs = weightLogs
    .filter((w) => days.includes(w.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightChangeKg =
    weekWeightLogs.length >= 2
      ? Math.round((weekWeightLogs[weekWeightLogs.length - 1].weight - weekWeightLogs[0].weight) * 10) / 10
      : null;

  // Fitness modul (FEATURE_IDEAS.md sekce 1) — stejná vizuální gramatika jako graf kalorií výš,
  // jen bez referenční čáry cíle (spálené kalorie nemají denní cíl jako příjem).
  const workoutTotalsByDay = new Map<string, number>();
  allWorkouts.forEach((w) => workoutTotalsByDay.set(w.date, (workoutTotalsByDay.get(w.date) || 0) + w.caloriesBurned));
  const workoutValues = days.map((d) => workoutTotalsByDay.get(d) || 0);
  const workoutMaxValue = Math.max(...workoutValues, 1);
  const workoutValuesForAverage = trackableDaysThisWeek.map((d) => workoutTotalsByDay.get(d) || 0);
  const { avgCalories: workoutAvgCalories, daysLogged: workoutDaysLogged } = summarizeWeek(workoutValuesForAverage);
  const workoutCountThisWeek = allWorkouts.filter((w) => days.includes(w.date)).length;

  const chartWeights = weightLogs.slice(-30);
  const hasWeightTrend = chartWeights.length >= 2;
  const weightValues = chartWeights.map((w) => w.weight);
  const minWeight = Math.min(...weightValues, Infinity);
  const maxWeight = Math.max(...weightValues, -Infinity);
  const weightRange = Math.max(maxWeight - minWeight, 0.5); // ochrana proti dělení nulou při ploché váze
  const weightPoints = chartWeights.map((w, i) => {
    const x = chartWeights.length > 1 ? (i / (chartWeights.length - 1)) * 100 : 50;
    const y = 28 - ((w.weight - minWeight) / weightRange) * 26;
    return { x, y, date: w.date, weight: w.weight, source: w.source };
  });
  const latestWeight = chartWeights[chartWeights.length - 1];
  const weightDelta = hasWeightTrend
    ? Math.round((latestWeight.weight - chartWeights[0].weight) * 10) / 10
    : 0;
  // Retrospektiva pracuje s celou historií, ne jen posledními 30 záznamy jako graf výš —
  // 30 zaznamenaných vážení může pokrýt méně než 30 kalendářních dní.
  const monthRetrospective = computeMonthRetrospective(weightLogs, today);
  const monthAgoLabel = monthRetrospective
    ? new Date(`${monthRetrospective.monthAgoDate}T00:00:00`).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
    : null;

  const dailyCalories = Array.from(totalsByDay, ([date, calories]) => ({ date, calories }));
  const manualWeighIns = weightLogs.filter((w) => w.source === "manual");
  const calibration =
    profile && nutrition
      ? calibrateTarget(
          manualWeighIns,
          dailyCalories,
          profile.goal,
          nutrition.bmr,
          nutrition.tdee,
          profile.cycleTrackingEnabled ? profile.avgCycleLength : undefined
        )
      : null;
  const calibrationDismissedRecently = profile?.lastCalibrationDismissedAt
    ? daysSince(profile.lastCalibrationDismissedAt) < CALIBRATION_DISMISS_COOLDOWN_DAYS
    : false;
  // Jen když appka nemá reálnou kalibraci k nabídnutí — appka appce vysvětlí PROČ mlčí, ne
  // aby duplikovala samotnou kartu.
  const calibrationProgress =
    profile && nutrition && !calibration
      ? getCalibrationProgress(
          manualWeighIns,
          dailyCalories,
          nutrition.tdee,
          profile.cycleTrackingEnabled ? profile.avgCycleLength : undefined
        )
      : null;

  // Dlouhodobý vzorec nízkých bílkovin — jen z posledních 14 dní, ne z celé historie. Dnešek
  // appka vyloučí (excludeDates) — dokud den neskončil, nejde ho spravedlivě posoudit vůči
  // celodennímu cíli (B5 v AUDIT_2026-08-13.md).
  const macroPatternWindowStart = lastNDates(14)[0];
  const proteinRecords = allProteinRecords.filter((r) => r.date !== today && r.date >= macroPatternWindowStart);
  const lowProteinPattern = nutrition
    ? detectLowProteinPattern(proteinRecords, nutrition.macros.protein)
    : null;
  const macroPatternDismissedRecently = profile?.lastMacroPatternDismissedAt
    ? daysSince(profile.lastMacroPatternDismissedAt) < MACRO_PATTERN_COOLDOWN_DAYS
    : false;

  // Citlivé sledování nízkého příjmu (FEATURE_IDEAS.md sekce 3) — stejné okno a stejný "reliable
  // day" princip jako bílkoviny výš, jen na celkové kalorie.
  const calorieRecords = buildDailyCalorieRecords(allMeals, [today]).filter((r) => r.date >= macroPatternWindowStart);
  const lowCaloriePattern = nutrition ? detectLowCaloriePattern(calorieRecords, targetCalories) : null;
  const lowCalorieDismissedRecently = profile?.lastLowCalorieDismissedAt
    ? daysSince(profile.lastLowCalorieDismissedAt) < LOW_CALORIE_PATTERN_COOLDOWN_DAYS
    : false;

  // Během tichých hodin appka neotvírá nový proaktivní nudge (a nevolá kvůli němu AI) —
  // stejné pravidlo a stejné uživatelsky nastavitelné okno jako červená tečka na zvonu
  // v App.tsx (viz FEATURE_IDEAS.md sekce 12). Volný den/dovolenkový režim (sekce 3) mlčí stejně,
  // ale jen u "nágujících" karet (nízký příjem, nízké bílkoviny) — gratulace k dosaženému cíli
  // (showGoalReachedCard níž) zůstává schválně beze změny, dovolená netlumí oslavu, jen nudge.
  const quietHoursActive =
    (profile?.quietHoursEnabled ?? true) && isQuietHours(new Date().getHours(), profile?.quietHoursStart, profile?.quietHoursEnd);
  const vacationActive = isVacationDay(today, profile?.vacationDates);
  // Kalibrace čte reálná data (zapsaná jídla + váhu), ne motivační stav appky — na rozdíl od
  // sesterských karet výš/níž záměrně NEreaguje na vacationActive (C6 v AUDIT_2026-08-13.md),
  // jen na tiché hodiny a vlastní cooldown po "Zatím ne".
  const showCalibrationCard = !!calibration && !calibrationDismissedRecently && !quietHoursActive;
  const showLowCaloriePatternCard =
    !!lowCaloriePattern?.detected && !lowCalorieDismissedRecently && !quietHoursActive && !vacationActive;
  // Když appka vidí celkově nízký příjem, karta na bílkoviny konkrétně mlčí — nedává smysl radit
  // "přidej bílkoviny", když člověk celkově nejí dost. Nízký příjem jako celek je důležitější
  // signál, viz "Citlivé sledování" výš.
  const showMacroPatternCard =
    !!lowProteinPattern?.detected &&
    !macroPatternDismissedRecently &&
    !quietHoursActive &&
    !vacationActive &&
    !lowCaloriePattern?.detected;

  // B3 v REFERENCE/DATA_COMPLETENESS_PLAN.md — appka dřív o sledování vzorců příjmu mlčela úplně,
  // dokud vzorec nebyl detekovaný. Ukáže se jen v rozjezdu (aspoň 1 spolehlivý den, ale ještě ne
  // dost) a jen když zrovna neběží actionable karta výš, ať appka neduplikuje dvě zprávy najednou.
  const intakePatternProgress =
    !showLowCaloriePatternCard && !showMacroPatternCard && !quietHoursActive && !vacationActive
      ? lowCaloriePattern &&
        lowCaloriePattern.reliableDaysConsidered > 0 &&
        lowCaloriePattern.reliableDaysConsidered < MIN_RELIABLE_CALORIE_DAYS
        ? { current: lowCaloriePattern.reliableDaysConsidered, target: MIN_RELIABLE_CALORIE_DAYS }
        : lowProteinPattern &&
            lowProteinPattern.reliableDaysConsidered > 0 &&
            lowProteinPattern.reliableDaysConsidered < MIN_RELIABLE_PROTEIN_DAYS
          ? { current: lowProteinPattern.reliableDaysConsidered, target: MIN_RELIABLE_PROTEIN_DAYS }
          : null
      : null;

  // Detekce dosaženého cíle (FEATURE_IDEAS.md sekce 3) — poslední známá váha je buď nejnovější
  // zápis, nebo (bez jediného zápisu vůbec) aktuální profile.weight.
  const latestKnownWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : profile?.weight;
  const goalReached =
    profile && latestKnownWeight !== undefined
      ? detectGoalReached(latestKnownWeight, profile.targetWeight, profile.goal, profile.lastCelebratedGoalReachedWeight)
      : false;
  const showGoalReachedCard = goalReached && !quietHoursActive;
  // B4 v REFERENCE/DATA_COMPLETENESS_PLAN.md — bez targetWeight appka nikdy nemůže detekovat
  // dosažený cíl a dřív o tom mlčela úplně, bez odkazu zpátky na to, co appce chybí.
  const showTargetWeightHint = !!profile && profile.goal !== "maintain" && profile.targetWeight === undefined && !quietHoursActive;

  // AUDIT_2026-08-14.md — kalibrace/nízký příjem/bílkoviny se dřív mohly objevit jedna pod druhou
  // bez jakéhokoli vysvětlení, že spolu vlastně nesouvisí. Appka je nadál nikdy neskrývá (schválně,
  // viz D v AUDIT_2026-08-13.md — skrytí jedné kvůli druhé riskuje ztrátu relevantní informace),
  // jen jim dá společný úvod, když je jich aktivních víc najednou.
  const activeInsightCardCount = [showCalibrationCard, showLowCaloriePatternCard, showMacroPatternCard].filter(
    Boolean,
  ).length;

  const [macroSuggestion, setMacroSuggestion] = useState<string | null>(null);
  useEffect(() => {
    if (!showMacroPatternCard || !nutrition || !lowProteinPattern || !profile) return;

    const goal = profile.goal;
    const avgProtein = lowProteinPattern.avgProtein;
    const targetProtein = nutrition.macros.protein;
    const daysConsidered = lowProteinPattern.reliableDaysConsidered;

    let cancelled = false;
    MyaAI.suggestMacroFix({ avgProtein, targetProtein, daysConsidered, goal }).then((text) => {
      if (!cancelled) setMacroSuggestion(text);
    });
    return () => {
      cancelled = true;
    };
    // nutrition/lowProteinPattern/profile jsou tu záměrně jen jako primitivní hodnoty (ne celé
    // objekty) — ty se přepočítávají nanovo při každém renderu, takže by v deps poli způsobily
    // nekonečný cyklus volání API při každém překreslení.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMacroPatternCard, lowProteinPattern?.avgProtein, lowProteinPattern?.reliableDaysConsidered, nutrition?.macros.protein, profile?.goal]);

  const handleDismissMacroPattern = () => {
    updateProfile({ lastMacroPatternDismissedAt: getLocalDateISO() });
    setMacroSuggestion(null);
  };

  const [calorieCheckInMessage, setCalorieCheckInMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!showLowCaloriePatternCard || !nutrition || !lowCaloriePattern || !profile) return;

    const goal = profile.goal;
    const avgCalories = lowCaloriePattern.avgCalories;
    const daysConsidered = lowCaloriePattern.reliableDaysConsidered;

    let cancelled = false;
    MyaAI.checkLowCalorieIntake({ avgCalories, targetCalories, daysConsidered, goal }).then((text) => {
      if (!cancelled) setCalorieCheckInMessage(text);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLowCaloriePatternCard, lowCaloriePattern?.avgCalories, lowCaloriePattern?.reliableDaysConsidered, targetCalories, profile?.goal]);

  const handleDismissLowCaloriePattern = () => {
    updateProfile({ lastLowCalorieDismissedAt: getLocalDateISO() });
    setCalorieCheckInMessage(null);
  };

  const handleDismissCalibration = () => {
    updateProfile({ lastCalibrationDismissedAt: getLocalDateISO() });
  };

  const [goalReachedMessage, setGoalReachedMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!showGoalReachedCard || !profile?.targetWeight || latestKnownWeight === undefined) return;

    const targetWeight = profile.targetWeight;
    const goal = profile.goal;
    const currentWeight = latestKnownWeight;

    let cancelled = false;
    MyaAI.congratulateGoalReached({ targetWeight, currentWeight, goal }).then((text) => {
      if (!cancelled) setGoalReachedMessage(text);
    });
    return () => {
      cancelled = true;
    };
  }, [showGoalReachedCard, profile?.targetWeight, profile?.goal, latestKnownWeight]);

  // Přepnutí na "Udržovat váhu" i prosté zavření karty obojí zapíšou lastCelebratedGoalReachedWeight
  // (viz detectGoalReached v goalReached.ts) — appka se stejným cílem znovu nenudguje, ať uživatelka
  // reaguje jakkoliv.
  const handleSwitchToMaintainAfterGoalReached = () => {
    if (!profile?.targetWeight) return;
    updateProfile({ goal: "maintain", lastCelebratedGoalReachedWeight: profile.targetWeight });
  };

  const handleDismissGoalReached = () => {
    if (!profile?.targetWeight) return;
    updateProfile({ lastCelebratedGoalReachedWeight: profile.targetWeight });
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await uploadProgressPhoto(user.uid, dataUrl, today);
    } catch (error) {
      console.error("Nahrání progress fotky selhalo:", error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photo: ProgressPhotoEntry) => {
    if (!user) return;
    await deleteProgressPhoto(user.uid, photo);
  };

  // Sdílecí karta — vygeneruje PNG a nabídne systémový sheet (uživatelka si sama zvolí
  // kam sdílet), s pádem na přímé stažení, když Web Share API se soubory appka nemá
  // k dispozici (desktop) nebo uživatelka sdílení v sheetu zrušila.
  const handleShareCard = async () => {
    if (!profile) return;
    setIsGeneratingCard(true);
    try {
      const blob = await generateWeeklyShareCardBlob({
        periodStart: days[0],
        periodEnd: days[days.length - 1],
        streak,
        avgCalories,
        daysLogged,
        trackableDays: trackableDaysThisWeek.length,
        weightChangeKg,
        gender: profile.gender,
      });
      const file = new File([blob], `nouri-tyden-${today}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Nouri — týdenní shrnutí" });
          return;
        } catch (error) {
          if ((error as Error).name === "AbortError") return; // uživatelka sheet zavřela, nic dalšího dělat nemá appka
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nouri-tyden-${today}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleGenerateWeeklySummary = async () => {
    if (!profile || !nutrition) return;
    setGeneratingWeeklySummary(true);
    try {
      const text = await MyaAI.getWeeklySummary({
        avgCalories,
        targetCalories,
        daysLogged,
        weekdayAvgProtein: weekdayWeekendBreakdown.weekdayAvgProtein,
        weekdayDaysLogged: weekdayWeekendBreakdown.weekdayDaysLogged,
        weekendAvgProtein: weekdayWeekendBreakdown.weekendAvgProtein,
        weekendDaysLogged: weekdayWeekendBreakdown.weekendDaysLogged,
        targetProtein: nutrition.macros.protein,
        goal: profile.goal,
      });
      setWeeklySummaryText(text);
    } finally {
      setGeneratingWeeklySummary(false);
    }
  };

  return (
    <>
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="font-display italic text-2xl font-medium tracking-tight dark:text-slate-100">Statistiky</h1>

      {/* Průměr za týden */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Průměr za posledních 7 dní</div>
          {daysLogged > 0 && (
            <button
              onClick={handleShareCard}
              disabled={isGeneratingCard}
              aria-label="Sdílet týdenní kartu"
              className={`p-1.5 -m-1.5 rounded-lg active:scale-95 transition-all disabled:opacity-50 ${profile?.gender === 'female' ? 'text-rose-500' : 'text-sky-500'}`}
            >
              {isGeneratingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            </button>
          )}
        </div>
        {daysLogged > 0 ? (
          <>
            <div className="text-3xl font-extrabold text-slate-800 dark:text-white">
              {avgCalories} <span className="text-sm font-medium text-slate-400 dark:text-slate-500">kcal / den</span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              {daysLogged}/{trackableDaysThisWeek.length} dní zapsáno
              {vacationDaysThisWeek.length > 0 && ` (${formatDaysCs(vacationDaysThisWeek.length)} volno)`}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Zatím žádná zapsaná jídla za posledních 7 dní.</p>
        )}

        {previousDaysLogged > 0 && (
          <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Minulý týden: {previousAvgCalories} kcal/den · {previousDaysLogged}/{trackableDaysPrevWeek.length} dní zapsáno
              {vacationDaysPrevWeek.length > 0 && ` (${formatDaysCs(vacationDaysPrevWeek.length)} volno)`}
            </span>
            {daysLogged > 0 && (
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                {avgCalories - previousAvgCalories > 0 ? "+" : ""}
                {avgCalories - previousAvgCalories} kcal
              </span>
            )}
          </div>
        )}
      </div>

      {/* Týdenní AI shrnutí — na vyžádání tlačítkem, nevolá se automaticky */}
      <div className="bg-linear-to-br from-sky-50 to-indigo-50/60 dark:from-sky-950/20 dark:to-indigo-950/10 rounded-3xl p-6 border border-sky-100/60 dark:border-sky-900/30 transition-colors">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-sky-500 dark:text-sky-400" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Týdenní shrnutí od Myi</h3>
        </div>
        {weeklySummaryText ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{weeklySummaryText}</p>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">Necháš Myu shrnout, jak se ti tenhle týden dařilo?</p>
        )}
        <button
          onClick={handleGenerateWeeklySummary}
          disabled={daysLogged === 0 || generatingWeeklySummary}
          className="w-full bg-sky-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generatingWeeklySummary && <Loader2 className="w-4 h-4 animate-spin" />}
          {weeklySummaryText ? "Shrnout znovu" : "Shrnout tento týden"}
        </button>
        {daysLogged === 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 text-center">
            Nejdřív zapiš aspoň jeden den, ať má appka co shrnout.
          </p>
        )}
      </div>

      {/* Graf kalorií */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-6">Kalorie za posledních 7 dní</h3>

        <div className="relative h-36">
          {/* Referenční linka cíle */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-slate-300 dark:border-slate-600"
            style={{ bottom: `${targetLinePercent}%` }}
          />
          <div className="relative h-full flex items-end justify-between gap-2">
            {days.map((d) => {
              const value = totalsByDay.get(d) || 0;
              const heightPercent = value === 0 ? 0 : Math.max(4, (value / maxValue) * 100);
              const dayIndex = new Date(`${d}T00:00:00`).getDay();
              const isToday = d === today;
              const isSelected = selectedDay === d;

              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-2"
                  aria-label={`${DAY_LABELS[dayIndex]}: ${value} kcal`}
                >
                  <div className="relative w-full flex items-end justify-center h-full">
                    {isSelected && value > 0 && (
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-rose-600 dark:bg-rose-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                        {value} kcal
                      </div>
                    )}
                    <div
                      className={`w-full max-w-7 rounded-t-md transition-all ${
                        value === 0
                          ? "h-1 bg-slate-100 dark:bg-slate-800"
                          : isToday
                            ? "bg-linear-to-t from-amber-500 to-amber-300"
                            : "bg-linear-to-t from-rose-600 to-rose-400"
                      } ${isSelected && value > 0 ? "ring-2 ring-rose-200 dark:ring-rose-900" : ""}`}
                      style={value > 0 ? { height: `${heightPercent}%` } : undefined}
                    />
                  </div>
                  <span className={`text-[10px] font-bold ${isToday ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                    {DAY_LABELS[dayIndex]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-50 dark:border-slate-800">
          <div className="w-4 border-t-2 border-dashed border-slate-300 dark:border-slate-600" />
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Cíl: {targetCalories} kcal/den</span>
        </div>
      </div>

      {/* Tréninky za posledních 7 dní */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-6">Tréninky za posledních 7 dní</h3>

        {workoutDaysLogged > 0 ? (
          <>
            <div className="relative h-36">
              <div className="relative h-full flex items-end justify-between gap-2">
                {days.map((d) => {
                  const value = workoutTotalsByDay.get(d) || 0;
                  const heightPercent = value === 0 ? 0 : Math.max(4, (value / workoutMaxValue) * 100);
                  const dayIndex = new Date(`${d}T00:00:00`).getDay();
                  const isToday = d === today;
                  const isSelected = selectedWorkoutDay === d;

                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedWorkoutDay(d)}
                      className="flex-1 h-full flex flex-col items-center justify-end gap-2"
                      aria-label={`${DAY_LABELS[dayIndex]}: ${value} kcal spáleno`}
                    >
                      <div className="relative w-full flex items-end justify-center h-full">
                        {isSelected && value > 0 && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-orange-600 dark:bg-orange-500 text-white text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                            {value} kcal
                          </div>
                        )}
                        <div
                          className={`w-full max-w-7 rounded-t-md transition-all ${
                            value === 0
                              ? "h-1 bg-slate-100 dark:bg-slate-800"
                              : "bg-linear-to-t from-orange-600 to-orange-400"
                          } ${isSelected && value > 0 ? "ring-2 ring-orange-200 dark:ring-orange-900" : ""}`}
                          style={value > 0 ? { height: `${heightPercent}%` } : undefined}
                        />
                      </div>
                      <span className={`text-[10px] font-bold ${isToday ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`}>
                        {DAY_LABELS[dayIndex]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-50 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatWorkoutsCs(workoutCountThisWeek)} tento týden</span>
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                Ø {workoutAvgCalories} kcal / zapsaný den
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Zatím žádný zapsaný trénink za posledních 7 dní.</p>
        )}
      </div>

      {/* Trend váhy */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        {hasWeightTrend ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Trend váhy</h3>
              <span className={`text-xs font-bold ${weightDelta <= 0 ? "text-emerald-500" : "text-slate-400"}`}>
                {weightDelta > 0 ? "+" : ""}{weightDelta} kg
              </span>
            </div>
            <div className="text-3xl font-extrabold text-slate-800 dark:text-white mb-4">
              {latestWeight.weight} <span className="text-sm font-medium text-slate-400 dark:text-slate-500">kg</span>
            </div>
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-16 text-rose-500 dark:text-rose-400">
              <polyline
                points={weightPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {/* C2 v REFERENCE/DATA_COMPLETENESS_PLAN.md — bod založený seedWeightLogIfEmpty
                  appka dřív vykreslila identicky se skutečným zápisem, i když mohl vzejít
                  z needitované výchozí váhy z Onboardingu. */}
              {weightPoints.map((p) =>
                p.source === "seed" ? (
                  <circle
                    key={p.date}
                    cx={p.x}
                    cy={p.y}
                    r="1.5"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    className="fill-white dark:fill-slate-900 stroke-rose-300 dark:stroke-rose-700"
                  >
                    <title>Výchozí hodnota z profilu, ne skutečné vážení</title>
                  </circle>
                ) : (
                  <circle key={p.date} cx={p.x} cy={p.y} r="1.5" className="fill-rose-500 dark:fill-rose-400">
                    <title>{p.weight} kg · {p.date}</title>
                  </circle>
                )
              )}
            </svg>
            {monthRetrospective && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 pt-3 border-t border-slate-50 dark:border-slate-800">
                Před měsícem ({monthAgoLabel}): {monthRetrospective.monthAgoWeight} kg → dnes: {monthRetrospective.currentWeight} kg
              </p>
            )}
          </>
        ) : (
          <>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-2">Trend váhy</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Zatím málo dat na trend — přidej aspoň dva záznamy váhy v Profilu.
            </p>
          </>
        )}
      </div>

      {/* Cyklus (REFERENCE/CYCLE_TRACKING_PROPOSAL.md) — jen gender: 'female' a jen po zapnutí
          v Profilu, appka gender nikdy nepoužije k automatickému zapnutí. */}
      {profile?.gender === 'female' && profile.cycleTrackingEnabled && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-rose-400 dark:text-rose-300" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Cyklus</h3>
            </div>
            <button
              onClick={handleToggleLogCycle}
              aria-label="Zapsat začátek menstruace"
              className="w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center active:scale-90 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {cyclePhaseInfo ? (
            <div className="mt-3">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {PHASE_LABELS_CS[cyclePhaseInfo.phase]}{" "}
                <span className="font-normal text-slate-400 dark:text-slate-500">· den {cyclePhaseInfo.dayInCycle}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {PHASE_NOTES_CS[cyclePhaseInfo.phase]}
              </p>
              {profile.cycleRegularity === 'irregular' && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Cyklus máš označený jako nepravidelný — odhad fáze je proto míň jistý.
                </p>
              )}
              {/* B5 v REFERENCE/DATA_COMPLETENESS_PLAN.md — appka dřív mlčela o tom, že bez dost
                  historie (aspoň dva zaznamenané cykly) počítá s obecným průměrem, ne s vlastními
                  daty uživatelky. */}
              {profile.avgCycleLength === undefined && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Zatím počítáme s obecným průměrem {DEFAULT_CYCLE_LENGTH_DAYS} dní — jakmile appka uvidí víc záznamů, odhad se upřesní.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">
              Zatím žádný záznam — přidej datum začátku poslední menstruace.
            </p>
          )}

          {showLogCycle && user && (
            <CycleStartForm
              initialDate={today}
              maxDate={today}
              onSave={(dateISO) => logCycleStart(user.uid, dateISO)}
              onSaved={() => setShowLogCycle(false)}
            />
          )}

          {cycleLogs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...cycleLogs].slice(-6).reverse().map((log) => (
                <button
                  key={log.date}
                  onClick={() => handleDeleteCycleLog(log.date)}
                  aria-label={`Smazat záznam ${log.date}`}
                  className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 transition-all"
                >
                  {new Date(`${log.date}T00:00:00`).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detekce dosaženého cíle — gratulace + nabídka přepnutí na Udržovat váhu */}
      {showGoalReachedCard ? (
        <div className="bg-linear-to-br from-emerald-50 to-teal-50/60 dark:from-emerald-950/20 dark:to-teal-950/10 rounded-3xl p-6 border border-emerald-100/60 dark:border-emerald-900/30 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <PartyPopper className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Cíl dosažen!</h3>
          </div>
          {goalReachedMessage ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{goalReachedMessage}</p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Mya přemýšlí...
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSwitchToMaintainAfterGoalReached}
              className="flex-1 bg-emerald-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all"
            >
              Přepnout na Udržovat váhu
            </button>
            <button
              onClick={handleDismissGoalReached}
              className="flex-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-bold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 active:scale-[0.98] transition-all"
            >
              Pokračovat dál
            </button>
          </div>
        </div>
      ) : showTargetWeightHint ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Flag className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Cílová váha není nastavená</h3>
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nastav cílovou váhu v Profilu, ať ti appka umí říct, až tam budeš.
          </p>
        </div>
      ) : null}

      {/* Míry těla */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-teal-500 dark:text-teal-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Míry těla</h3>
          </div>
          <button
            onClick={() => setShowLogMeasurement((v) => !v)}
            aria-label="Zapsat míry"
            className="w-7 h-7 rounded-full bg-teal-500 text-white flex items-center justify-center active:scale-90 transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {bodyMeasurements.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">Zatím žádné míry těla — přidej první záznam.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {MEASUREMENT_FIELDS.map((field) => {
              const trend = computeMeasurementTrend(bodyMeasurements, field);
              return (
                <div key={field} className="text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{MEASUREMENT_LABELS_CS[field]}</div>
                  {trend ? (
                    <>
                      <div className="text-xl font-extrabold text-slate-800 dark:text-white">
                        {trend.latest}
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500"> cm</span>
                      </div>
                      {trend.delta !== null && (
                        <div className={`text-[11px] font-bold ${trend.delta <= 0 ? "text-emerald-500" : "text-slate-400"}`}>
                          {trend.delta > 0 ? "+" : ""}
                          {trend.delta} cm
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-slate-300 dark:text-slate-600">—</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showLogMeasurement && user && (
          <BodyMeasurementForm
            onSave={(measurement) => logBodyMeasurement(user.uid, today, measurement)}
            onSaved={() => setShowLogMeasurement(false)}
          />
        )}
      </div>

      {/* Progress fotky */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoSelected}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Progress fotky</h3>
          </div>
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label="Přidat progress fotku"
            className="w-7 h-7 rounded-full bg-cyan-500 text-white flex items-center justify-center active:scale-90 transition-all shrink-0 disabled:opacity-50"
          >
            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        {progressPhotos.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">Zatím žádné progress fotky — přidej první snímek.</p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto -mx-1 px-1 pb-1 mt-4 hide-scrollbar">
            {progressPhotos.map((photo) => (
              <button
                key={photo.syncId}
                onClick={() => setLightboxPhoto(photo)}
                className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 active:scale-95 transition-all"
              >
                <img src={photo.downloadURL} alt={`Progress fotka ${photo.date}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Společný úvod, když appka ukazuje víc "Mya si všimla" karet najednou — viz AUDIT_2026-08-14.md */}
      {activeInsightCardCount >= 2 && (
        <div className="flex items-center gap-2 px-1">
          <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Mya si dnes všimla víc věcí
          </p>
        </div>
      )}

      {/* Kalibrace cíle podle skutečných dat */}
      {showCalibrationCard && calibration ? (
        <div className="bg-linear-to-br from-rose-50 to-amber-50/60 dark:from-rose-950/20 dark:to-amber-950/10 rounded-3xl p-6 border border-rose-100/60 dark:border-rose-900/30 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-rose-500 dark:text-rose-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Kalibrace cíle podle dat</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            Za posledních {calibration.daysSpan} dní (zapsáno {calibration.loggedDays} z nich) jsi v průměru jedla{" "}
            {calibration.avgLoggedCalories} kcal/den a váha se změnila o {calibration.weightChangeKg > 0 ? "+" : ""}
            {calibration.weightChangeKg} kg. Podle toho tvůj skutečný denní výdej vychází spíš na{" "}
            {calibration.estimatedTDEE} kcal (teď se počítá s {nutrition?.tdee} kcal).
          </p>
          <button
            onClick={() =>
              updateProfile({
                calibratedTDEE: calibration.estimatedTDEE,
                targetCalories: calibration.suggestedTargetCalories,
              })
            }
            className="w-full bg-rose-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all"
          >
            Upravit cíl na {calibration.suggestedTargetCalories} kcal
          </button>
          <button
            onClick={handleDismissCalibration}
            className="w-full text-slate-500 dark:text-slate-400 text-xs font-bold py-2 mt-1 active:scale-[0.98] transition-all"
          >
            Zatím ne
          </button>
        </div>
      ) : calibrationProgress?.status === "matches-formula" ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Kalibrace cíle podle dat</h3>
          </div>
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Appka porovnala tvá zapsaná data s formulkovým odhadem — zatím se v podstatě shodují, není co upravovat.
          </p>
        </div>
      ) : calibrationProgress && calibrationProgress.status !== "ready" ? (
        <EmptyState
          icon={<Gauge className="w-6 h-6" />}
          title="Kalibrace cíle podle dat"
          text={calibrationProgressText(calibrationProgress.status)}
          progress={{ current: calibrationProgress.current, target: calibrationProgress.target }}
        />
      ) : null}

      {/* Citlivé sledování nízkého příjmu — pečovatelský check-in, ne "hlídání" */}
      {showLowCaloriePatternCard && (
        <div className="bg-linear-to-br from-amber-50 to-orange-50/60 dark:from-amber-950/20 dark:to-orange-950/10 rounded-3xl p-6 border border-amber-100/60 dark:border-amber-900/30 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Jak se máš?</h3>
          </div>
          {showGoalReachedCard && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">
              Mimochodem — appka si zároveň všimla, že jsi dosáhla cílové váhy. Obojí může platit najednou.
            </p>
          )}
          {calorieCheckInMessage ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{calorieCheckInMessage}</p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Mya přemýšlí...
            </div>
          )}
          <button
            onClick={handleDismissLowCaloriePattern}
            className="w-full bg-amber-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all"
          >
            Beru na vědomí
          </button>
        </div>
      )}

      {/* Dlouhodobě nízké bílkoviny — proaktivní návrh */}
      {showMacroPatternCard && (
        <div className="bg-linear-to-br from-violet-50 to-indigo-50/60 dark:from-violet-950/20 dark:to-indigo-950/10 rounded-3xl p-6 border border-violet-100/60 dark:border-violet-900/30 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-violet-500 dark:text-violet-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Bílkoviny dlouhodobě pod cílem</h3>
          </div>
          {showGoalReachedCard && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic mb-2">
              Mimochodem — appka si zároveň všimla, že jsi dosáhla cílové váhy. Obojí může platit najednou.
            </p>
          )}
          {macroSuggestion ? (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{macroSuggestion}</p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Mya přemýšlí...
            </div>
          )}
          <button
            onClick={handleDismissMacroPattern}
            className="w-full bg-violet-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all"
          >
            Beru na vědomí
          </button>
        </div>
      )}

      {/* B3 v REFERENCE/DATA_COMPLETENESS_PLAN.md — appka dřív o sledování vzorců příjmu mlčela
          úplně, dokud nebyl vzorec detekovaný (karty výš). Ukáže postup, jen když právě neběží
          jedna z nich. */}
      {intakePatternProgress && (
        <EmptyState
          icon={<Heart className="w-6 h-6" />}
          title="Appka sleduje tvůj příjem"
          text="Zatím nemá dost spolehlivě zapsaných dní na to, aby poznala dlouhodobý vzorec — zapisuj dál."
          progress={intakePatternProgress}
        />
      )}
    </div>
    {/* Mimo space-y-6 kontejner výš — Tailwindí space-y dává margin i "poslednímu" prvku,
        dokud přibude další za ním, což by fixed inset-0 overlay posunulo od okraje obrazovky. */}
    {lightboxPhoto && (
      <ProgressPhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} onDelete={handleDeletePhoto} />
    )}
    </>
  );
}

// N25 (AUDIT_2026-08-14.md) — appka dřív držela vstupní pole měr těla přímo ve Stats, takže
// psaní do nich (žádný vztah k datům, se kterými Stats jinak počítá) rozeběhlo přepočet
// totalsByDay/kalibrace/vzorců/weightPoints na KAŽDÝ úhoz klávesy — appka celý komponent
// nemá memoizovaný přes useMemo (exhaustive-deps je jen "warn", viz N29, špatná deps pole by
// se tichým stale-closure bugem neprojevila v buildu/lintu/testech, jen v běhu). Vytažením
// vlastního stavu appka přepočet přeskočí úplně — psaní tady vyvolá jen re-render tohohle
// malého komponentu, ne rodiče.
function BodyMeasurementForm({
  onSave,
  onSaved,
}: {
  onSave: (measurement: { waist?: number; hips?: number; chest?: number }) => Promise<void>;
  onSaved: () => void;
}) {
  const [measurementInputs, setMeasurementInputs] = useState<Record<string, string>>({ waist: "", hips: "", chest: "" });
  const [savingMeasurement, setSavingMeasurement] = useState(false);

  const handleLogMeasurement = async () => {
    const measurement: { waist?: number; hips?: number; chest?: number } = {};
    MEASUREMENT_FIELDS.forEach((field) => {
      const raw = measurementInputs[field];
      if (raw.trim()) measurement[field] = Number(raw);
    });
    if (Object.keys(measurement).length === 0) return;

    setSavingMeasurement(true);
    try {
      await onSave(measurement);
      setMeasurementInputs({ waist: "", hips: "", chest: "" });
      onSaved();
    } finally {
      setSavingMeasurement(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {MEASUREMENT_FIELDS.map((field) => (
          <div key={field}>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{MEASUREMENT_LABELS_CS[field]}</label>
            <input
              type="number"
              inputMode="decimal"
              value={measurementInputs[field]}
              onChange={(e) => setMeasurementInputs((prev) => ({ ...prev, [field]: e.target.value }))}
              placeholder="cm"
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-teal-500 dark:text-white transition-all"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleLogMeasurement}
        disabled={savingMeasurement || Object.values(measurementInputs).every((v) => !v.trim())}
        className="w-full bg-teal-600 text-white text-sm font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {savingMeasurement && <Loader2 className="w-4 h-4 animate-spin" />}
        Uložit míry
      </button>
    </div>
  );
}

// N25 — stejný důvod jako BodyMeasurementForm výš, jen pro datum začátku cyklu.
function CycleStartForm({
  initialDate,
  maxDate,
  onSave,
  onSaved,
}: {
  initialDate: string;
  maxDate: string;
  onSave: (dateISO: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [dateInput, setDateInput] = useState(initialDate);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!dateInput) return;
    setSaving(true);
    try {
      await onSave(dateInput);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center gap-2">
      <input
        type="date"
        value={dateInput}
        max={maxDate}
        onChange={(e) => setDateInput(e.target.value)}
        className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-rose-500 dark:text-white transition-all"
      />
      <button
        onClick={handleSave}
        disabled={!dateInput || saving}
        className="shrink-0 bg-rose-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Uložit
      </button>
    </div>
  );
}
