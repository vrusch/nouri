import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChefHat,
  Sparkles,
  Camera,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  BookMarked,
  CheckCircle2,
  Trash2,
  Refrigerator,
  Heart,
} from "lucide-react";
import { db } from "../db/db";
import { useAuth } from "../context/useAuth";
import { calculateNutrition, computeRemainingMacros, getRecipeAvailability } from "../lib/nutrition";
import {
  MyaRecipes,
  RECIPE_MEAL_TYPE_LABELS,
  bestFitIndex,
  isRecipeSaved,
  recipeFit,
  sortRecipesByFit,
  todayMealTypesOf,
  type RecipeResult,
} from "../lib/recipes";
import { fileToCompressedDataUrl } from "../lib/image";
import {
  addShoppingListItems,
  deleteSavedRecipe,
  removeShoppingListItem,
  saveRecipe,
  subscribeSavedRecipes,
  subscribeShoppingList,
  toggleShoppingListItem,
  type SavedRecipeEntry,
  type ShoppingListEntry,
} from "../lib/cloudSync";
import { buildShoppingListItems, countUnbought } from "../lib/shoppingList";
import { getLocalDateISO } from "../lib/date";
import { reportCloudError } from "../lib/cloudErrors";
import EmptyState from "../components/EmptyState";
import ShoppingListView from "../components/ShoppingListView";
import { MacroTile, RecipeCard, RecipeSuggestion } from "../components/RecipeCards";

type Status = "idle" | "photo-preview" | "loading" | "result" | "error";
type View = "generate" | "saved" | "list";

const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: "generate", label: "Generovat" },
  { id: "saved", label: "Uložené" },
  { id: "list", label: "Seznam" },
];

export default function Recipes() {
  const { profile, user } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [recipes, setRecipes] = useState<RecipeResult[]>([]);
  // Každé generování dostane nové číslo — karty návrhů se podle něj klíčují, takže nová sada
  // začne s čistým stavem "Uložit"/"Do seznamu" (zámek N21 drží jen v rámci jedné sady).
  const [generation, setGeneration] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [recipeSource, setRecipeSource] = useState<"text" | "photo">("text");
  const [preferences, setPreferences] = useState("");
  const [availableIngredients, setAvailableIngredients] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [view, setView] = useState<View>("generate");
  const [shoppingList, setShoppingList] = useState<ShoppingListEntry[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipeEntry[]>([]);
  const [expandedSavedId, setExpandedSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = getLocalDateISO();
  const todaysMeals = useLiveQuery(() => db.meals.where("date").equals(today).toArray()) || [];

  useEffect(() => {
    if (!user) return;
    return subscribeShoppingList(user.uid, setShoppingList);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeSavedRecipes(user.uid, setSavedRecipes);
  }, [user]);

  if (!profile) return null;

  const target = calculateNutrition(profile);
  const remaining = computeRemainingMacros(target, todaysMeals);
  const availability = getRecipeAvailability(remaining.calories);
  const forAnotherDay = availability !== "ready";

  // Denní cíl jde s každým generováním, ať Mya porce dimenzuje podle typu jídla (lehká snídaně
  // je menší než oběd), ne každý recept na celý zbytek dne.
  const dailyTarget = {
    dailyCalories: target.targetCalories,
    dailyProtein: target.macros.protein,
    dailyFat: target.macros.fat,
    dailyCarbs: target.macros.carbs,
  };

  // Server navrhne jen jídla, která dnes ještě chybí, s porcí podle zbytku dne (MYA_COACH_SPEC 6.6).
  const dayPlan = () => ({ todayMealTypes: todayMealTypesOf(todaysMeals), localHour: new Date().getHours() });

  const showRecipes = (result: RecipeResult[] | null, source: "text" | "photo") => {
    if (result) {
      // Recepty do dneška seřadí podle toho, jak doplní zbytek dne (v rámci typu jídla).
      setRecipes(forAnotherDay ? result : sortRecipesByFit(result, remaining));
      setGeneration((n) => n + 1);
      setExpandedIndex(result.length === 1 ? 0 : null);
      setRecipeSource(source);
      setStatus("result");
    } else {
      setStatus("error");
    }
  };

  const handleGenerateText = async () => {
    setStatus("loading");
    const result = await MyaRecipes.generateRecipes({
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingFat: remaining.fat,
      remainingCarbs: remaining.carbs,
      goal: profile.goal,
      preferences: preferences.trim() || undefined,
      availableIngredients: availableIngredients.trim() || undefined,
      ...dailyTarget,
      ...dayPlan(),
    });
    showRecipes(result, "text");
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setPhotoError(null);
      setStatus("photo-preview");
    } catch (error) {
      console.error(error);
      setPhotoError("Fotku se nepodařilo načíst. Zkus to znovu.");
    }
  };

  const handleGenerateFromPhoto = async () => {
    if (!photoDataUrl) return;
    setStatus("loading");
    const result = await MyaRecipes.generateRecipesFromFridgePhoto({
      imageDataUrl: photoDataUrl,
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingFat: remaining.fat,
      remainingCarbs: remaining.carbs,
      goal: profile.goal,
      preferences: preferences.trim() || undefined,
      ...dailyTarget,
      ...dayPlan(),
    });
    showRecipes(result, "photo");
  };

  const handleReset = () => {
    setRecipes([]);
    setExpandedIndex(null);
    setPhotoDataUrl(null);
    setPhotoError(null);
    setStatus("idle");
  };

  const handleBackFromPreview = () => {
    setPhotoDataUrl(null);
    setPhotoError(null);
    setStatus("idle");
  };

  const handleAddToShoppingList = async (recipeToAdd: RecipeResult) => {
    if (!user) return;
    await addShoppingListItems(user.uid, buildShoppingListItems(recipeToAdd));
  };

  const handleSaveRecipe = async (recipeToSave: RecipeResult) => {
    if (!user) return;
    await saveRecipe(user.uid, recipeToSave, recipeSource);
  };

  const handleToggleItem = (item: ShoppingListEntry) => {
    if (!user) return;
    toggleShoppingListItem(user.uid, item.id, !item.bought).catch((error) =>
      reportCloudError("Položku v nákupním seznamu se nepodařilo odškrtnout.", error)
    );
  };

  const handleRemoveItem = (item: ShoppingListEntry) => {
    if (!user) return;
    removeShoppingListItem(user.uid, item.id).catch((error) =>
      reportCloudError("Položku se nepodařilo odebrat z nákupního seznamu.", error)
    );
  };

  const handleDeleteSavedRecipe = (id: string) => {
    if (!user) return;
    if (expandedSavedId === id) setExpandedSavedId(null);
    deleteSavedRecipe(user.uid, id).catch((error) => reportCloudError("Recept se nepodařilo smazat.", error));
  };

  const unboughtCount = countUnbought(shoppingList);

  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="font-display italic text-2xl font-medium tracking-tight dark:text-slate-100">AI Recepty</h1>

      <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl gap-1 border border-slate-100 dark:border-slate-700 transition-colors">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setView(opt.id)}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              view === opt.id
                ? "bg-white dark:bg-slate-600 shadow-sm text-rose-600 dark:text-white"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {opt.label}
            {opt.id === "list" && unboughtCount > 0 && (
              <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unboughtCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "list" && (
        <ShoppingListView items={shoppingList} onToggle={handleToggleItem} onRemove={handleRemoveItem} />
      )}

      {view === "saved" && (
        <SavedRecipesView
          recipes={savedRecipes}
          expandedId={expandedSavedId}
          onToggleExpand={(id) => setExpandedSavedId(expandedSavedId === id ? null : id)}
          onAddToShoppingList={handleAddToShoppingList}
          onDelete={handleDeleteSavedRecipe}
        />
      )}

      {/* Rozhodnutí 2026-10-11: po splnění cíle (nebo při malém zbytku) appka formulář neschová —
          Mya navrhne recepty "na jindy" s porcemi podle denního cíle, stejně jako chat. Server
          o režimu rozhoduje sám podle zbytku dne (recipeSetBudget ve functions/src/recipes.ts). */}
      {view === "generate" && status === "idle" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
            {forAnotherDay ? (
              <div>
                <h2 className="font-bold text-slate-800 dark:text-white">Recepty na jindy</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {availability === "over-target"
                    ? "Dnešní cíl máš splněný, tak ti Mya navrhne tři recepty s porcemi podle denního cíle."
                    : `Do cíle ti zbývá jen ${Math.max(0, Math.round(remaining.calories))} kcal, tak ti Mya navrhne tři recepty s porcemi podle denního cíle.`}
                </p>
              </div>
            ) : (
              <div>
                <h2 className="font-bold text-slate-800 dark:text-white">Co ti dnes ještě zbývá</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Mya navrhne tři recepty, každý se do toho vejde</p>
              </div>
            )}
          </div>

          {!forAnotherDay && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <MacroTile label="Kcal" value={Math.round(remaining.calories)} />
              <MacroTile label="Bílkoviny" value={Math.round(remaining.protein)} unit="g" />
              <MacroTile label="Tuky" value={Math.round(remaining.fat)} unit="g" />
              <MacroTile label="Sacharidy" value={Math.round(remaining.carbs)} unit="g" />
            </div>
          )}

          {!forAnotherDay && remaining.hasIncompleteMacroData && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Některé dnešní jídlo má zapsané jen kalorie bez maker, takže zbývající bílkoviny/tuky/sacharidy nemusí sedět úplně přesně.</span>
            </div>
          )}

          {/* Zpětná vazba 2026-10-11: šedé popisky malým písmem byly na stránce přehlédnutelné —
              pole jsou teď ve vlastním zvýrazněném bloku s ikonou a čitelným nadpisem. */}
          <div className="bg-rose-50/70 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-2xl p-4 space-y-4">
            <RecipeField
              id="recipe-ingredients"
              icon={<Refrigerator className="w-4 h-4" />}
              title="Co máš doma?"
              hint="Vypiš suroviny a Mya z nich vymyslí lehkou snídani, oběd i večeři. Když nic nenapíšeš, vybere z běžně dostupných."
            >
              <textarea
                id="recipe-ingredients"
                rows={2}
                value={availableIngredients}
                onChange={(e) => setAvailableIngredients(e.target.value)}
                placeholder="Např. vejce, tvaroh, brambory, šunka, rajčata"
                className="w-full resize-none bg-white dark:bg-slate-800 border border-rose-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-medium outline-rose-500 dark:text-white transition-all"
              />
            </RecipeField>

            <RecipeField
              id="recipe-preferences"
              icon={<Heart className="w-4 h-4" />}
              title="Nějaké přání?"
              hint="Třeba jen večeře, bez lepku nebo rychlovka do 15 minut."
            >
              <input
                id="recipe-preferences"
                type="text"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
                placeholder="Např. vegetariánské, jen večeře"
                className="w-full bg-white dark:bg-slate-800 border border-rose-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-medium outline-rose-500 dark:text-white transition-all"
              />
            </RecipeField>
          </div>

          {photoError && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{photoError}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={handleGenerateText}
              className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Navrhni mi recepty
            </button>

            {/* Bez capture="environment" — iPhone by jinak otevřel rovnou fotoaparát bez výběru
                z galerie (viz stejná oprava v AddMealModal.tsx). */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all"
            >
              <Camera className="w-4 h-4" />
              Vyfoť lednici
            </button>
          </div>
        </div>
      )}

      {view === "generate" && status === "photo-preview" && photoDataUrl && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4 transition-colors">
          <button
            onClick={handleBackFromPreview}
            className="flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Zpět
          </button>
          <img src={photoDataUrl} alt="Fotka lednice" className="w-full aspect-square object-cover rounded-2xl" />
          <button
            onClick={handleGenerateFromPhoto}
            className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Najít recepty z fotky
          </button>
        </div>
      )}

      {view === "generate" && status === "loading" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-4 py-16 transition-colors">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {photoDataUrl ? "Mya kouká na lednici a vymýšlí recepty..." : "Mya vymýšlí recepty..."}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">Tři jídla chvilku trvají.</p>
        </div>
      )}

      {view === "generate" && status === "error" && (
        <div className="space-y-3">
          <EmptyState
            icon={<AlertCircle className="w-7 h-7" />}
            title="Nepovedlo se"
            text={
              photoDataUrl
                ? "Mya na fotce nerozpoznala použitelné suroviny, nebo se něco pokazilo. Zkus jinou fotku nebo to zkus znovu."
                : "Mye se teď nepodařilo recepty vymyslet. Zkus to prosím znovu."
            }
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

      {view === "generate" && status === "result" && recipes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
            {recipes.length === 1
              ? "Mya ti navrhla recept:"
              : `Mya ti navrhla ${recipes.length} recepty — rozklikni ten, co tě láká.`}
            {forAnotherDay && " Ber je jako inspiraci na jindy, porce jsou podle denního cíle."}
          </p>

          {recipes.map((item, i) => (
            <RecipeSuggestion
              key={`${generation}-${i}`}
              recipe={item}
              expanded={expandedIndex === i}
              onToggleExpand={() => setExpandedIndex(expandedIndex === i ? null : i)}
              onSave={handleSaveRecipe}
              onAddToShoppingList={handleAddToShoppingList}
              alreadySaved={isRecipeSaved(item, savedRecipes)}
              fit={forAnotherDay ? undefined : recipeFit(item, remaining)}
              bestFit={!forAnotherDay && bestFitIndex(recipes, remaining) === i}
            />
          ))}

          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Zkusit jiné recepty
          </button>
        </div>
      )}
    </div>
  );
}

function RecipeField({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <span className="font-bold text-slate-800 dark:text-white">{title}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          nepovinné
        </span>
      </label>
      {children}
      <p className="text-xs text-slate-500 dark:text-slate-400 px-1 leading-relaxed">{hint}</p>
    </div>
  );
}

function SavedRecipesView({
  recipes,
  expandedId,
  onToggleExpand,
  onAddToShoppingList,
  onDelete,
}: {
  recipes: SavedRecipeEntry[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onAddToShoppingList: (recipe: RecipeResult) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  // N6 (AUDIT_2026-08-14.md) — stejný dvojklik/timeout vzor jako handleDeleteMeal
  // (AddMealModal.tsx), uložené recepty byly jednou ze dvou destruktivních akcí bez ochrany.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((current) => (current === id ? null : current)), 4000);
      return;
    }
    setConfirmDeleteId(null);
    onDelete(id);
  };

  // N21 (AUDIT_2026-08-14.md) — na rozdíl od tlačítka na obrazovce "Generovat" appka tady
  // zámek NEnechává trvalý: uložený recept je knihovna, uživatelka ho může chtít přidat do
  // seznamu znovu za týden, když si ho uvaří podruhé. addingListId blokuje jen dobu zápisu
  // (řeší rychlé dvojťuknutí), justAddedId je jen dočasná vizuální zpětná vazba ("Přidáno"),
  // po pár vteřinách appka tlačítko sama odemkne zpět na "Do seznamu".
  const [addingListId, setAddingListId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const justAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (justAddedTimeoutRef.current) clearTimeout(justAddedTimeoutRef.current);
    };
  }, []);

  const handleAddClick = async (entry: SavedRecipeEntry) => {
    if (addingListId === entry.id) return;
    setAddingListId(entry.id);
    try {
      await onAddToShoppingList(entry);
      setJustAddedId(entry.id);
      if (justAddedTimeoutRef.current) clearTimeout(justAddedTimeoutRef.current);
      justAddedTimeoutRef.current = setTimeout(
        () => setJustAddedId((current) => (current === entry.id ? null : current)),
        2000
      );
    } catch (error) {
      reportCloudError("Suroviny se nepodařilo přidat do nákupního seznamu.", error);
    } finally {
      setAddingListId(null);
    }
  };

  if (recipes.length === 0) {
    return (
      <EmptyState
        icon={<BookMarked className="w-7 h-7" />}
        title="Zatím nemáš žádné uložené recepty"
        text="Vygeneruj recept v záložce Generovat a ulož si ho na později."
      />
    );
  }

  return (
    <div className="space-y-3">
      {recipes.map((entry) => {
        const expanded = expandedId === entry.id;
        return (
          <div
            key={entry.id}
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors"
          >
            <button
              onClick={() => onToggleExpand(entry.id)}
              className="w-full flex items-center justify-between gap-3 p-5 text-left"
            >
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 dark:text-white truncate">{entry.name}</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {entry.mealType && `${RECIPE_MEAL_TYPE_LABELS[entry.mealType]} · `}
                  {entry.calories} kcal · {entry.prepMinutes} min
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
                <RecipeCard recipe={entry} />
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleAddClick(entry)}
                    disabled={addingListId === entry.id}
                    className="flex-1 flex items-center justify-center gap-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {justAddedId === entry.id ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                    {justAddedId === entry.id ? "Přidáno" : "Do seznamu"}
                  </button>
                  <button
                    onClick={() => handleDeleteClick(entry.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all ${
                      confirmDeleteId === entry.id
                        ? "bg-red-50 dark:bg-red-900/20 text-red-500"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    {confirmDeleteId === entry.id ? "Opravdu smazat?" : "Smazat"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

