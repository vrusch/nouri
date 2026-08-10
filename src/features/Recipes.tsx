import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ChefHat,
  Sparkles,
  Camera,
  Loader2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  BookMarked,
  CheckCircle2,
  Trash2,
  X,
} from "lucide-react";
import { db } from "../db/db";
import { useAuth } from "../context/useAuth";
import { calculateNutrition, computeRemainingMacros, getRecipeAvailability } from "../lib/nutrition";
import { MyaRecipes, type RecipeResult } from "../lib/recipes";
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
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [recipeSource, setRecipeSource] = useState<"text" | "photo">("text");
  const [preferences, setPreferences] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [view, setView] = useState<View>("generate");
  const [shoppingList, setShoppingList] = useState<ShoppingListEntry[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipeEntry[]>([]);
  const [addedToList, setAddedToList] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [expandedSavedId, setExpandedSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];
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

  const handleGenerateText = async () => {
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
      setRecipeSource("text");
      setStatus("result");
    } else {
      setStatus("error");
    }
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
    const result = await MyaRecipes.generateRecipeFromFridgePhoto({
      imageDataUrl: photoDataUrl,
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein,
      remainingFat: remaining.fat,
      remainingCarbs: remaining.carbs,
      goal: profile.goal,
      preferences: preferences.trim() || undefined,
    });
    if (result) {
      setRecipe(result);
      setRecipeSource("photo");
      setStatus("result");
    } else {
      setStatus("error");
    }
  };

  const handleReset = () => {
    setRecipe(null);
    setPhotoDataUrl(null);
    setPhotoError(null);
    setAddedToList(false);
    setSavedToLibrary(false);
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

  const handleSaveRecipe = async () => {
    if (!user || !recipe) return;
    await saveRecipe(user.uid, recipe, recipeSource);
    setSavedToLibrary(true);
  };

  const handleToggleItem = (item: ShoppingListEntry) => {
    if (!user) return;
    toggleShoppingListItem(user.uid, item.id, !item.bought);
  };

  const handleRemoveItem = (item: ShoppingListEntry) => {
    if (!user) return;
    removeShoppingListItem(user.uid, item.id);
  };

  const handleDeleteSavedRecipe = (id: string) => {
    if (!user) return;
    if (expandedSavedId === id) setExpandedSavedId(null);
    deleteSavedRecipe(user.uid, id);
  };

  const unboughtCount = countUnbought(shoppingList);

  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">AI Recepty</h1>

      <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl gap-1 border border-slate-100 dark:border-slate-700 transition-colors">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setView(opt.id)}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              view === opt.id
                ? "bg-white dark:bg-slate-600 shadow-sm text-blue-600 dark:text-white"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {opt.label}
            {opt.id === "list" && unboughtCount > 0 && (
              <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
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

      {view === "generate" && availability === "over-target" && status === "idle" && (
        <EmptyState
          icon={<ChefHat className="w-7 h-7" />}
          title="Dnešní cíl máš splněný"
          text="Dnes už jsi na cíli nebo nad ním, takže by ti recept navíc do plánu neseděl. Zkus to zítra."
        />
      )}

      {view === "generate" && availability === "too-little-remaining" && status === "idle" && (
        <EmptyState
          icon={<ChefHat className="w-7 h-7" />}
          title="Zbývá už jen málo"
          text={`Do cíle ti zbývá jen ${Math.max(0, Math.round(remaining.calories))} kcal — na plnohodnotný recept to není moc. Radši malá svačina.`}
        />
      )}

      {view === "generate" && availability === "ready" && status === "idle" && (
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
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm font-semibold outline-blue-500 dark:text-white transition-all"
            />
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
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Navrhni mi recept
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Najít recept z fotky
          </button>
        </div>
      )}

      {view === "generate" && status === "loading" && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-4 py-16 transition-colors">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {photoDataUrl ? "Mya kouká na lednici a hledá recept..." : "Mya vymýšlí recept..."}
          </p>
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
                : "Mye se teď nepodařilo recept vymyslet. Zkus to prosím znovu."
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

      {view === "generate" && status === "result" && recipe && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
            <RecipeCard recipe={recipe} />
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleSaveRecipe}
              disabled={savedToLibrary}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all ${
                savedToLibrary
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              }`}
            >
              {savedToLibrary ? <CheckCircle2 className="w-4 h-4" /> : <BookMarked className="w-4 h-4" />}
              {savedToLibrary ? "Uloženo" : "Uložit recept"}
            </button>

            <button
              onClick={async () => {
                await handleAddToShoppingList(recipe);
                setAddedToList(true);
              }}
              disabled={addedToList}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold active:scale-[0.98] transition-all ${
                addedToList
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              }`}
            >
              {addedToList ? <CheckCircle2 className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
              {addedToList ? "Přidáno" : "Do seznamu"}
            </button>
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

function RecipeCard({ recipe }: { recipe: RecipeResult }) {
  return (
    <div className="space-y-4">
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

function ShoppingListView({
  items,
  onToggle,
  onRemove,
}: {
  items: ShoppingListEntry[];
  onToggle: (item: ShoppingListEntry) => void;
  onRemove: (item: ShoppingListEntry) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="w-7 h-7" />}
        title="Seznam je prázdný"
        text="Vygeneruj recept a přidej jeho suroviny do nákupního seznamu."
      />
    );
  }

  const groups = new Map<string, ShoppingListEntry[]>();
  items.forEach((item) => {
    const group = groups.get(item.recipeName) ?? [];
    group.push(item);
    groups.set(item.recipeName, group);
  });

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([recipeName, groupItems]) => (
        <div
          key={recipeName}
          className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors"
        >
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{recipeName}</h3>
          <ul className="space-y-2.5">
            {groupItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.bought}
                  onChange={() => onToggle(item)}
                  className="w-5 h-5 rounded accent-blue-600 shrink-0"
                />
                <span
                  className={`flex-1 text-sm ${
                    item.bought ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => onRemove(item)}
                  className="p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
                    onClick={() => onAddToShoppingList(entry)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Do seznamu
                  </button>
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Smazat
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
