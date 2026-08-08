import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useAuth } from "../context/useAuth";
import { calculateNutrition } from "../lib/nutrition";
import { fetchWeightLogs, type WeightLogEntry } from "../lib/cloudSync";

const DAY_LABELS = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function lastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export default function Stats() {
  const { profile, user } = useAuth();
  const targetCalories = profile ? calculateNutrition(profile).targetCalories : 1800;

  const days = lastNDates(7);
  const today = days[days.length - 1];
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const meals = useLiveQuery(() => db.meals.where("date").aboveOrEqual(days[0]).toArray()) || [];

  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  useEffect(() => {
    if (!user) return;
    fetchWeightLogs(user.uid).then(setWeightLogs);
  }, [user]);

  const totalsByDay = new Map<string, number>(days.map((d) => [d, 0]));
  meals.forEach((m) => totalsByDay.set(m.date, (totalsByDay.get(m.date) || 0) + m.value));

  const values = days.map((d) => totalsByDay.get(d) || 0);
  const maxValue = Math.max(targetCalories, ...values, 1);
  const daysLogged = values.filter((v) => v > 0).length;
  const avgCalories = daysLogged > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / daysLogged) : 0;
  const targetLinePercent = Math.min(100, (targetCalories / maxValue) * 100);

  const chartWeights = weightLogs.slice(-30);
  const hasWeightTrend = chartWeights.length >= 2;
  const weightValues = chartWeights.map((w) => w.weight);
  const minWeight = Math.min(...weightValues, Infinity);
  const maxWeight = Math.max(...weightValues, -Infinity);
  const weightRange = Math.max(maxWeight - minWeight, 0.5); // ochrana proti dělení nulou při ploché váze
  const weightPoints = chartWeights.map((w, i) => {
    const x = chartWeights.length > 1 ? (i / (chartWeights.length - 1)) * 100 : 50;
    const y = 28 - ((w.weight - minWeight) / weightRange) * 26;
    return { x, y, date: w.date, weight: w.weight };
  });
  const latestWeight = chartWeights[chartWeights.length - 1];
  const weightDelta = hasWeightTrend
    ? Math.round((latestWeight.weight - chartWeights[0].weight) * 10) / 10
    : 0;

  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">Statistiky</h1>

      {/* Průměr za týden */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Průměr za posledních 7 dní</div>
        {daysLogged > 0 ? (
          <div className="text-3xl font-extrabold text-slate-800 dark:text-white">
            {avgCalories} <span className="text-sm font-medium text-slate-400 dark:text-slate-500">kcal / den</span>
          </div>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Zatím žádná zapsaná jídla za posledních 7 dní.</p>
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
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap">
                        {value} kcal
                      </div>
                    )}
                    <div
                      className={`w-full max-w-7 rounded-t-md transition-all ${
                        value === 0 ? "h-1 bg-slate-100 dark:bg-slate-800" : "bg-blue-500 dark:bg-blue-400"
                      } ${isSelected && value > 0 ? "ring-2 ring-blue-200 dark:ring-blue-900" : ""}`}
                      style={value > 0 ? { height: `${heightPercent}%` } : undefined}
                    />
                  </div>
                  <span className={`text-[10px] font-bold ${isToday ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>
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
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-16 text-blue-500 dark:text-blue-400">
              <polyline
                points={weightPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {weightPoints.map((p) => (
                <circle key={p.date} cx={p.x} cy={p.y} r="1.5" className="fill-blue-500 dark:fill-blue-400" />
              ))}
            </svg>
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
    </div>
  );
}
