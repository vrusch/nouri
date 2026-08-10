import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChefHat, Sparkles, Loader2, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { db } from "../db/db";
import { useAuth } from "../context/useAuth";
import { calculateNutrition, computeRemainingMacros, getRecipeAvailability } from "../lib/nutrition";
import { MyaRecipes, type RecipeResult } from "../lib/recipes";

type Status = "idle" | "loading" | "result" | "error";

export default function Recipes() {
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [preferences, setPreferences] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const todaysMeals = useLiveQuery(() => db.meals.where("date").equals(today).toArray()) || [];

  if (!profile) return null;

  const target = calculateNutrition(profile);
  const remaining = computeRemainingMacros(target, todaysMeals);
  const availability = getRecipeAvailability(remaining.calories);

  const handleGenerate = async () => {
    setStatus("loading");
    const result = await MyaRecipes.generateRecipe({
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingFat: remaining.fat,
      remainingCarbs: remaining.carbs,
      goal: profile.goal,
      preferences: preferences.trim() || undefined,
    });
    if (result) {
      setRecipe(result);
      setStatus("result");
    } else {
      setStatus("error");
    }
  };

  const handleReset = () => {
    setRecipe(null);
    setStatus("idle");
  };

  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">AI Recepty</h1>

      {availability === "over-target" && status === "idle" && (
        <EmptyState
          icon={<ChefHat className="w-7 h-7" />}
          title="Dnešní cíl máš splněný"
          text="Dnes už jsi na cíli nebo nad ním, takže by ti recept navíc do plánu neseděl. Zkus to zítra."
        />
      )}

      {availability === "too-little-remaining" && status === "idle" && (
        <EmptyState
          icon={<ChefHat className="w-7 h-7" />}
          title="Zbývá už jen málo"
          text={`Do cíle ti zbývá jen ${Math.max(0, Math.round(remaining.calories))} kcal — na plnohodnotný recept to není moc. Radši malá svačina.`}
        />
      )}

      {availability === "ready" && (status === "idle" || status === "loading") && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-white">Co ti dnes ještě zbývá</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Mya navrhne recept, který se do toho vejde</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <MacroTile label="Kcal" value={Math.round(remaining.calories)} />
            <MacroTile label="Bílkoviny" value={Math.round(remaining.protein)} unit="g" />
            <MacroTile label="Tuky" value={Math.round(remaining.fat)} unit="g" />
            <MacroTile label="Sacharidy" value={Math.round(remaining.carbs)} unit="g" />
          </div>

          {remaining.hasIncompleteMacroData && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Některé dnešní jídlo má zapsané jen kalorie bez maker, takže zbývající bílkoviny/tuky/sacharidy nemusí sedět úplně přesně.</span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nějaké přání? (nepovinné)</label>
            <input
              type="text"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Např. vegetariánské, bez lepku, rychlovka do 15 minut"
              disabled={status === "loading"}
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm font-semibold outline-blue-500 dark:text-white transition-all disabled:opacity-50"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={status === "loading"}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mya vymýšlí recept...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Navrhni mi recept
              </>
            )}
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <EmptyState
            icon={<AlertCircle className="w-7 h-7" />}
            title="Nepovedlo se"
            text="Mye se teď nepodařilo recept vymyslet. Zkus to prosím znovu."
          />
          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Zkusit znovu
          </button>
        </div>
      )}

      {status === "result" && recipe && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4 transition-colors">
            <div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-white">{recipe.name}</h2>
              {recipe.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{recipe.description}</p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              {recipe.prepMinutes} min
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <MacroTile label="Kcal" value={recipe.calories} />
              <MacroTile label="Bílkoviny" value={recipe.protein} unit="g" />
              <MacroTile label="Tuky" value={recipe.fat} unit="g" />
              <MacroTile label="Sacharidy" value={recipe.carbs} unit="g" />
            </div>

            {recipe.ingredients.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Suroviny</h3>
                <ul className="space-y-1.5">
                  {recipe.ingredients.map((item, i) => (
                    <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-2">
                      <span className="text-blue-400">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recipe.instructions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Postup</h3>
                <ol className="space-y-2">
                  {recipe.instructions.map((step, i) => (
                    <li key={i} className="text-sm text-slate-700 dark:text-slate-300 flex gap-3">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Zkusit jiný recept
          </button>
        </div>
      )}
    </div>
  );
}

function MacroTile({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl py-2.5">
      <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
        {value}
        {unit && <span className="text-[10px] font-bold text-slate-400 ml-0.5">{unit}</span>}
      </div>
      <div className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4 transition-colors">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 dark:text-blue-400">
        {icon}
      </div>
      <div>
        <h2 className="font-bold text-slate-800 dark:text-white mb-1">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
