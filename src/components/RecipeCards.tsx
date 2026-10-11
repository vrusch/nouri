import { useState } from "react";
import { BookMarked, CheckCircle2, ChevronDown, ChevronUp, Clock, ShoppingCart } from "lucide-react";
import { RECIPE_MEAL_TYPE_LABELS, type RecipeResult } from "../lib/recipes";
import { reportCloudError } from "../lib/cloudErrors";

// Karty receptů sdílené záložkou Recepty (Recipes.tsx) a chatem s Myou (MyaChatModal.tsx) —
// recept ze sady vypadá a ukládá se na obou místech stejně.

export function MealTypeChip({ recipe }: { recipe: RecipeResult }) {
  if (!recipe.mealType) return null;
  return (
    <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-full px-2 py-0.5">
      {RECIPE_MEAL_TYPE_LABELS[recipe.mealType]}
    </span>
  );
}

// Jeden návrh ze sady — sbalená hlavička (typ jídla, název, kcal), po rozkliknutí celý recept
// s vlastním "Uložit"/"Do seznamu".
export function RecipeSuggestion({
  recipe,
  expanded,
  onToggleExpand,
  onSave,
  onAddToShoppingList,
  alreadySaved = false,
}: {
  recipe: RecipeResult;
  expanded: boolean;
  onToggleExpand: () => void;
  onSave: (recipe: RecipeResult) => Promise<void>;
  onAddToShoppingList: (recipe: RecipeResult) => Promise<void>;
  /** Stejný recept už je v Uložených (viz isRecipeSaved) — karty v chatu přežijí zavření
   *  chatu, lokální stav "Uloženo" ne, a bez tohohle by šel týž recept uložit znovu. */
  alreadySaved?: boolean;
}) {
  // N21 (AUDIT_2026-08-14.md) — saved/added se nastavují až PO doběhnutí await, takže bez
  // saving/adding by rychlé dvojťuknutí BĚHEM zápisu prošlo dvakrát (recept uložený nebo
  // suroviny přidané dvakrát). Zámek je trvalý, ne jen na dobu zápisu — vygenerovaný návrh je
  // jednorázový, appka nemá důvod dovolit dvojí přidání téhož. Nová sada = nové karty = čistý stav.
  const [saving, setSaving] = useState(false);
  const [savedHere, setSaved] = useState(false);
  const saved = savedHere || alreadySaved;
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await onSave(recipe);
      setSaved(true);
    } catch (error) {
      reportCloudError("Recept se nepodařilo uložit.", error);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (adding || added) return;
    setAdding(true);
    try {
      await onAddToShoppingList(recipe);
      setAdded(true);
    } catch (error) {
      reportCloudError("Suroviny se nepodařilo přidat do nákupního seznamu.", error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors">
      <button onClick={onToggleExpand} className="w-full flex items-center justify-between gap-3 p-5 text-left">
        <div className="min-w-0 space-y-1">
          <MealTypeChip recipe={recipe} />
          <h3 className="font-bold text-slate-800 dark:text-white">{recipe.name}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {recipe.calories} kcal · {recipe.protein} g bílkovin · {recipe.prepMinutes} min
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          <RecipeCard recipe={recipe} hideTitle />
          <div className="flex gap-2.5">
            <button
              onClick={handleSave}
              disabled={saved || saving}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all ${
                saved
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              {saved ? <CheckCircle2 className="w-4 h-4" /> : <BookMarked className="w-4 h-4" />}
              {saved ? "Uloženo" : "Uložit recept"}
            </button>

            <button
              onClick={handleAdd}
              disabled={added || adding}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all ${
                added
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
              }`}
            >
              {added ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
              {added ? "Přidáno" : "Do seznamu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// hideTitle: v kartě návrhu je název a typ jídla už v hlavičce, opakoval by se.
export function RecipeCard({ recipe, hideTitle = false }: { recipe: RecipeResult; hideTitle?: boolean }) {
  return (
    <div className="space-y-4">
      {hideTitle ? (
        recipe.description && <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{recipe.description}</p>
      ) : (
        <div>
          <MealTypeChip recipe={recipe} />
          <h2 className="font-bold text-lg text-slate-800 dark:text-white">{recipe.name}</h2>
          {recipe.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{recipe.description}</p>
          )}
        </div>
      )}

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
                <span className="text-rose-400">•</span>
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
                <span className="shrink-0 w-5 h-5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-500 dark:text-rose-400 text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function MacroTile({ label, value, unit }: { label: string; value: number; unit?: string }) {
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
