// Odpověď analyzeFood (rozpoznání jídla z fotky). Testování 2026-10-11: Mya na fotce pozná
// brambory, šunku i sýr, ale gramáž jednotlivých složek z fotky odhadne špatně. Proto vrací
// i složky s odhadem gramů — appka z nich předvyplní ingredience a uživatelka může (nemusí)
// gramy přepsat podle skutečnosti, kalorie se pak přepočítají na klientu bez dalšího volání AI.

type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type Confidence = "low" | "medium" | "high";

export interface FoodComponent {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface FoodPhotoResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  type: MealType;
  confidence: Confidence;
  components?: FoodComponent[];
}

export const MAX_FOOD_COMPONENTS = 8;
const MAX_COMPONENT_NAME_LENGTH = 60;
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const CONFIDENCE_LEVELS: Confidence[] = ["low", "medium", "high"];

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

const isNumeric = (value: unknown): boolean =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));

/**
 * Složky z odpovědi modelu. Všechno, nebo nic: jedna vadná složka (bez názvu, gramů nebo kalorií) zahodí
 * celý rozpad a appka ukáže jen souhrn jako dřív — jinak by se kalorie té složky potichu ztratily
 * ze součtu.
 */
export function parseFoodComponents(raw: unknown): FoodComponent[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FOOD_COMPONENTS) return [];
  const components: FoodComponent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return [];
    const c = item as Record<string, unknown>;
    const rawName = typeof c.name === "string" ? c.name.replace(/[\r\n]+/g, " ").trim().slice(0, MAX_COMPONENT_NAME_LENGTH) : "";
    const grams = nonNegativeInt(c.grams);
    // Kalorie bez čísla ("154 kcal", chybí) by se jinak tiše staly nulou a součet složek by
    // přepsal souhrn modelu menším číslem. Chybějící makro nevadí, to jen bude nula.
    if (!rawName || grams === 0 || !isNumeric(c.calories)) return [];
    components.push({
      // Model píše složky malými písmeny ("vařené brambory") — v seznamu ingrediencí by to působilo nedbale.
      name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
      grams,
      calories: nonNegativeInt(c.calories),
      protein: nonNegativeInt(c.protein),
      fat: nonNegativeInt(c.fat),
      carbs: nonNegativeInt(c.carbs),
    });
  }
  return components;
}

/**
 * Celá odpověď modelu → výsledek pro klienta. Se složkami je souhrn jejich součtem, ať se
 * celkové kalorie nemůžou rozejít s tím, co uživatelka vidí v ingrediencích (a starší build
 * appky, který složky nezná, dostane stejná čísla).
 */
export function parseFoodPhotoResult(parsed: unknown): FoodPhotoResult {
  const p = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const result: FoodPhotoResult = {
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Neznámé jídlo",
    calories: nonNegativeInt(p.calories),
    protein: nonNegativeInt(p.protein),
    fat: nonNegativeInt(p.fat),
    carbs: nonNegativeInt(p.carbs),
    type: MEAL_TYPES.find((t) => t === p.type) ?? "snack",
    confidence: CONFIDENCE_LEVELS.find((c) => c === p.confidence) ?? "low",
  };
  const components = parseFoodComponents(p.components);
  if (components.length > 0) {
    result.components = components;
    result.calories = components.reduce((sum, c) => sum + c.calories, 0);
    result.protein = components.reduce((sum, c) => sum + c.protein, 0);
    result.fat = components.reduce((sum, c) => sum + c.fat, 0);
    result.carbs = components.reduce((sum, c) => sum + c.carbs, 0);
  }
  return result;
}

export const FOOD_PHOTO_SYSTEM_PROMPT = `Jsi Mya, AI nutriční asistentka aplikace Nouri. Uživatel ti pošle jednu nebo víc fotek (nejvýš 3) JEDNOHO jídla.
Tvým úkolem je identifikovat jídlo a odhadnout jeho nutriční hodnoty pro porci na fotce.

Víc fotek = pořád jedna porce jednoho jídla, jen pro přesnější rozpoznání (jiný úhel, detail, obal nebo etiketa):
- co je vidět na víc fotkách, započítej jen jednou
- součást, která je jen na jedné fotce (příloha, omáčka, nápoj), k jídlu přičti
- když je vidět etiketa s nutričními hodnotami, vycházej z ní, ale velikost porce odhadni podle fotek

Jídlo rozlož na hlavní složky tak, jak by je uživatel mohl zvážit (např. brambory, šunka, sýr) — nejvýš ${MAX_FOOD_COMPONENTS} složek, drobnosti (koření, bylinky) zvlášť nepočítej. Jednoduché jídlo (jablko, jogurt) je jedna složka. U každé složky odhadni hmotnost v gramech tak, jak je na talíři (vařená rýže, upečené maso), a nutriční hodnoty právě pro tu hmotnost.

Když uživatel v upřesnění uvede gramáž nějaké složky, je přesná — u té složky použij přesně tu hmotnost (neodhaduj ji z fotky) a hodnoty spočítej podle ní. Když uvede hmotnost syrové nebo suché suroviny ("80 g rýže nasucho", "před vařením"), spočítej hodnoty z té syrové hmotnosti a do "grams" dej odpovídající hmotnost hotové složky na talíři.

Odpověz VÝHRADNĚ validním JSON objektem v tomto přesném tvaru (žádný markdown, žádný text okolo):
{
  "name": "krátký český název jídla",
  "calories": číslo (celkové kalorie porce na fotce),
  "protein": číslo (bílkoviny v gramech),
  "fat": číslo (tuky v gramech),
  "carbs": číslo (sacharidy v gramech),
  "type": "breakfast" | "lunch" | "dinner" | "snack" (odhad podle charakteru jídla),
  "confidence": "low" | "medium" | "high" (jak jistá si jsi odhadem),
  "components": [
    { "name": "krátký český název složky", "grams": číslo, "calories": číslo, "protein": číslo, "fat": číslo, "carbs": číslo }
  ]
}

Součet složek musí odpovídat hodnotám celého jídla. Pokud na fotce není rozpoznatelné jídlo, vrať confidence "low", name "Neznámé jídlo", nulové hodnoty a "components": [].`;
