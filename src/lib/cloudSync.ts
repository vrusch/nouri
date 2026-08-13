import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { db as firestoreDb, storage } from "./firebase";
import { db as dexieDb, type MealItem, type WorkoutItem } from "../db/db";
import type { ShoppingListItemDraft } from "./shoppingList";
import type { RecipeResult } from "./recipes";

function mealsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "meals");
}

function weightLogsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "weightLogs");
}

function shoppingListCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "shoppingList");
}

function savedRecipesCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "savedRecipes");
}

function waterLogsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "waterLogs");
}

function mealTemplatesCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "mealTemplates");
}

function bodyMeasurementsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "bodyMeasurements");
}

function progressPhotosCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "progressPhotos");
}

function workoutsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "workouts");
}

function chatMessagesCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "chatMessages");
}

// Odloží cloud zálohu, aby nikdy neblokovala lokální (Dexie) zápis — chyba se jen zaloguje.
export async function backupMeal(uid: string, meal: MealItem): Promise<void> {
  if (!meal.syncId) return;
  try {
    // Editace může teď makro nebo celý rozpad na ingredience explicitně smazat (nastaví pole
    // na undefined, aby to zmizelo i z Dexie) — Firestore ale pole s hodnotou undefined
    // odmítá (stejná oprava jako u addShoppingListItems), proto se tu před zápisem odfiltrují.
    const clean = Object.fromEntries(Object.entries(meal).filter(([, v]) => v !== undefined)) as MealItem;
    await setDoc(doc(mealsCollection(uid), meal.syncId), clean);
  } catch (error) {
    console.error("Cloud záloha jídla selhala:", error);
  }
}

// Smaže jen jeden dokument podle syncId — subscribeMeals se o odstranění z lokální
// Dexie postará sám přes svůj "removed" docChange, nemusí se duplikovat tady.
export async function deleteMeal(uid: string, syncId: string): Promise<void> {
  try {
    await deleteDoc(doc(mealsCollection(uid), syncId));
  } catch (error) {
    console.error("Smazání jídla z cloudu selhalo:", error);
  }
}

// Hromadná varianta backupMeal pro CSV import (viz csvImport.ts) — stejné chunkování po 400
// jako clearMealsBackup, protože import může přenést stovky jídel najednou.
export async function bulkBackupMeals(uid: string, meals: MealItem[]): Promise<void> {
  const withSyncId = meals.filter((meal): meal is MealItem & { syncId: string } => !!meal.syncId);
  if (withSyncId.length === 0) return;
  try {
    const chunkSize = 400;
    for (let i = 0; i < withSyncId.length; i += chunkSize) {
      const batch = writeBatch(firestoreDb);
      withSyncId.slice(i, i + chunkSize).forEach((meal) => {
        // Stejný filtr jako backupMeal — Firestore odmítá pole s hodnotou undefined.
        const clean = Object.fromEntries(Object.entries(meal).filter(([, v]) => v !== undefined)) as MealItem;
        batch.set(doc(mealsCollection(uid), meal.syncId), clean);
      });
      await batch.commit();
    }
  } catch (error) {
    console.error("Hromadné zálohování importovaných jídel selhalo:", error);
  }
}

export async function clearMealsBackup(uid: string): Promise<void> {
  try {
    const snap = await getDocs(mealsCollection(uid));
    if (snap.empty) return;
    const refs = snap.docs.map((d) => d.ref);
    const chunkSize = 400; // limit Firestore batch je 500 operací
    for (let i = 0; i < refs.length; i += chunkSize) {
      const batch = writeBatch(firestoreDb);
      refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (error) {
    console.error("Smazání cloud zálohy jídel selhalo:", error);
  }
}

// Živě zrcadlí users/{uid}/meals do lokální Dexie — nahrazuje starší jednorázový
// hydrateMealsIfEmpty (první snímek listeneru dorazí se všemi existujícími dokumenty,
// takže obnova prázdné lokální DB funguje stejně, jen appka navíc zůstává v syncu
// průběžně i mezi víc zařízeními/taby). Upsertuje/maže podle syncId, ne podle Dexie id,
// protože to je jediný identifikátor sdílený mezi lokální DB a cloudem.
export function subscribeMeals(uid: string, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    mealsCollection(uid),
    (snap) => {
      snap.docChanges().forEach((change) => {
        const meal = change.doc.data() as MealItem;
        if (!meal.syncId) return;

        if (change.type === "removed") {
          dexieDb.meals.where("syncId").equals(meal.syncId).delete();
          return;
        }

        dexieDb.meals
          .where("syncId")
          .equals(meal.syncId)
          .first()
          .then((existing) => {
            if (existing?.id !== undefined) {
              // .put (ne .update) — meal je od Firestore vždy celý dokument, ne dílčí patch,
              // a Dexie's UpdateSpec odmítá typovat objekt s polem (ingredients) jako partial update.
              dexieDb.meals.put({ ...meal, id: existing.id });
            } else {
              dexieDb.meals.add(meal);
            }
          });
      });
    },
    (error) => {
      console.error("Synchronizace jídel selhala:", error);
      onError?.(error);
    }
  );
}

// Trénink (Fitness modul) — přesně stejný vzor jako backupMeal/deleteMeal/subscribeMeals výš,
// jen jiná kolekce a typ. Samostatná tabulka místo rozšíření MealItem, protože kalorie u
// tréninku appka odečítá od cíle, ne přičítá ke spotřebě — sémanticky jiný typ záznamu.
export async function backupWorkout(uid: string, workout: WorkoutItem): Promise<void> {
  if (!workout.syncId) return;
  try {
    await setDoc(doc(workoutsCollection(uid), workout.syncId), workout);
  } catch (error) {
    console.error("Cloud záloha tréninku selhala:", error);
  }
}

export async function deleteWorkout(uid: string, syncId: string): Promise<void> {
  try {
    await deleteDoc(doc(workoutsCollection(uid), syncId));
  } catch (error) {
    console.error("Smazání tréninku z cloudu selhalo:", error);
  }
}

export function subscribeWorkouts(uid: string, onError?: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    workoutsCollection(uid),
    (snap) => {
      snap.docChanges().forEach((change) => {
        const workout = change.doc.data() as WorkoutItem;
        if (!workout.syncId) return;

        if (change.type === "removed") {
          dexieDb.workouts.where("syncId").equals(workout.syncId).delete();
          return;
        }

        dexieDb.workouts
          .where("syncId")
          .equals(workout.syncId)
          .first()
          .then((existing) => {
            if (existing?.id !== undefined) {
              dexieDb.workouts.update(existing.id, workout);
            } else {
              dexieDb.workouts.add(workout);
            }
          });
      });
    },
    (error) => {
      console.error("Synchronizace tréninků selhala:", error);
      onError?.(error);
    }
  );
}

// Doc id = datum (YYYY-MM-DD), takže oprava překlepu ve stejný den přepíše
// existující bod místo vytvoření duplicity v trendu.
export async function logWeight(
  uid: string,
  weightKg: number,
  dateISO: string,
  source: "seed" | "manual" = "manual"
): Promise<void> {
  try {
    await setDoc(doc(weightLogsCollection(uid), dateISO), { weight: weightKg, date: dateISO, source });
  } catch (error) {
    console.error("Zápis váhy do cloudu selhal:", error);
  }
}

export interface WeightLogEntry {
  date: string;
  weight: number;
  source?: "seed" | "manual";
}

// Jednorázové načtení pro JSON export (viz Profile.tsx handleExportJson) — na rozdíl od
// subscribeWeightLogs níže appka tady nepotřebuje živý listener, jen snímek pro stažení.
export async function fetchWeightLogs(uid: string): Promise<WeightLogEntry[]> {
  const q = query(weightLogsCollection(uid), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as WeightLogEntry);
}

// Živě streamuje users/{uid}/weightLogs (řazeno podle data), ať trend i připomínka vážení
// reagují na zápis z jiného zařízení bez nutnosti appku restartovat. Pro jednorázové
// čtení (JSON export) viz fetchWeightLogs výše.
export function subscribeWeightLogs(
  uid: string,
  callback: (entries: WeightLogEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(weightLogsCollection(uid), orderBy("date", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as WeightLogEntry)),
    (error) => {
      console.error("Synchronizace historie váhy selhala:", error);
      onError?.(error);
    }
  );
}

// Založí první bod váhové historie z aktuální hodnoty v profilu, pokud appka
// ještě žádný záznam nemá — aby trend měl výchozí bod hned od prvního spuštění.
export async function seedWeightLogIfEmpty(uid: string, currentWeight: number): Promise<void> {
  try {
    const snap = await getDocs(weightLogsCollection(uid));
    if (!snap.empty) return;
    const today = new Date().toISOString().split("T")[0];
    await logWeight(uid, currentWeight, today, "seed");
  } catch (error) {
    console.error("Založení výchozí váhové historie selhalo:", error);
  }
}

// Míry těla (FEATURE_IDEAS.md sekce 4) — pas/boky/hrudník, každé pole nezávisle volitelné
// (appka nenutí vyplnit všechny najednou). Doc id = datum, stejný přepis-ve-stejný-den vzor
// jako logWeight. Bez lokální Dexie cache, appka streamuje přímo do React stavu ve Stats.tsx —
// stejný vzor jako subscribeWeightLogs, malá kolekce, čte se jen na jednom místě.
export interface BodyMeasurementEntry {
  date: string;
  waist?: number; // pas, cm
  hips?: number; // boky, cm
  chest?: number; // hrudník, cm
}

// Jednorázové načtení pro PDF report (viz Profile.tsx handleExportPdf) — stejný vzor
// jako fetchWeightLogs, appka tu nepotřebuje živý listener, jen snímek pro export.
export async function fetchBodyMeasurements(uid: string): Promise<BodyMeasurementEntry[]> {
  const q = query(bodyMeasurementsCollection(uid), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as BodyMeasurementEntry);
}

export async function logBodyMeasurement(
  uid: string,
  dateISO: string,
  measurement: { waist?: number; hips?: number; chest?: number }
): Promise<void> {
  try {
    // {merge: true} — formulář (Stats.tsx) zapisuje pas/boky/hrudník nezávisle na sobě;
    // bez merge by zápis jednoho pole odpoledne přepsal celý dokument a smazal, co bylo
    // zapsáno ráno (B3 v AUDIT_2026-08-13.md).
    await setDoc(doc(bodyMeasurementsCollection(uid), dateISO), { date: dateISO, ...measurement }, { merge: true });
  } catch (error) {
    console.error("Zápis míry těla do cloudu selhal:", error);
  }
}

export function subscribeBodyMeasurements(
  uid: string,
  callback: (entries: BodyMeasurementEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(bodyMeasurementsCollection(uid), orderBy("date", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as BodyMeasurementEntry)),
    (error) => {
      console.error("Synchronizace měr těla selhala:", error);
      onError?.(error);
    }
  );
}

// Doc id = datum (YYYY-MM-DD). Firestore increment() místo zápisu appkou dopředu spočítané
// hodnoty (C4 v AUDIT_2026-08-13.md) — dva rychlé tapy nebo dvě otevřené záložky by jinak obě
// vycházely ze stejného React state a jeden krok by se ztratil; increment() se aplikuje
// atomicky na serveru bez ohledu na to, co appka lokálně zrovna zobrazuje. merge:true zajistí,
// že první zápis dne (dokument ještě neexistuje) increment počítá od 0, ne od chyby.
export async function adjustWaterGlasses(uid: string, dateISO: string, delta: number): Promise<void> {
  try {
    await setDoc(doc(waterLogsCollection(uid), dateISO), { date: dateISO, glasses: increment(delta) }, { merge: true });
  } catch (error) {
    console.error("Zápis vody do cloudu selhal:", error);
  }
}

// Živě streamuje počet sklenic pro jeden konkrétní den (Home ukazuje jen dnešek) — na rozdíl
// od subscribeWeightLogs appka nepotřebuje celou historii, jen aktuální hodnotu napříč zařízeními.
export function subscribeWaterLog(
  uid: string,
  dateISO: string,
  callback: (glasses: number) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(waterLogsCollection(uid), dateISO),
    (snap) => callback((snap.data()?.glasses as number | undefined) ?? 0),
    (error) => {
      console.error("Synchronizace vody selhala:", error);
      onError?.(error);
    }
  );
}

export interface ShoppingListEntry extends ShoppingListItemDraft {
  id: string;
  bought: boolean;
}

// Jednorázové načtení pro JSON export (viz Profile.tsx handleExportJson) — stejný vzor jako
// fetchWeightLogs/fetchBodyMeasurements výš (B6 v AUDIT_2026-08-13.md: appka dřív exportovala
// jen jídla, profil a váhu, i když se tvářila jako "Plná záloha").
export async function fetchShoppingList(uid: string): Promise<ShoppingListEntry[]> {
  const snap = await getDocs(shoppingListCollection(uid));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ShoppingListItemDraft & { bought: boolean }) }));
}

// Živě streamuje users/{uid}/shoppingList — jeden běžící nákupní seznam napříč recepty,
// stejný vzor jako subscribeWeightLogs (malá kolekce, čte se na jednom místě, žádná
// lokální Dexie cache navíc).
export function subscribeShoppingList(
  uid: string,
  callback: (items: ShoppingListEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    shoppingListCollection(uid),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ShoppingListItemDraft & { bought: boolean }) }))),
    (error) => {
      console.error("Synchronizace nákupního seznamu selhala:", error);
      onError?.(error);
    }
  );
}

export async function addShoppingListItems(uid: string, items: ShoppingListItemDraft[]): Promise<void> {
  if (items.length === 0) return;
  const batch = writeBatch(firestoreDb);
  items.forEach((item) => {
    // recipeName se zapisuje jen když existuje — Firestore odmítá pole s hodnotou undefined
    // (ruční položky z ShoppingListModal žádný recept nemají).
    const data: { text: string; bought: boolean; recipeName?: string } = { text: item.text, bought: false };
    if (item.recipeName) data.recipeName = item.recipeName;
    batch.set(doc(shoppingListCollection(uid)), data);
  });
  await batch.commit();
}

export async function toggleShoppingListItem(uid: string, itemId: string, bought: boolean): Promise<void> {
  await setDoc(doc(shoppingListCollection(uid), itemId), { bought }, { merge: true });
}

export async function removeShoppingListItem(uid: string, itemId: string): Promise<void> {
  await deleteDoc(doc(shoppingListCollection(uid), itemId));
}

export interface SavedRecipeEntry extends RecipeResult {
  id: string;
  savedAt: string;
  source: "text" | "photo";
}

// Jednorázové načtení pro JSON export (B6) — stejný vzor jako fetchShoppingList výš.
export async function fetchSavedRecipes(uid: string): Promise<SavedRecipeEntry[]> {
  const q = query(savedRecipesCollection(uid), orderBy("savedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedRecipeEntry, "id">) }));
}

// Živě streamuje users/{uid}/savedRecipes, nejnovější první — knihovna receptů, kterou
// appka nabízela jen efemérně (ve stavu komponenty), dokud appka neuměla recept uložit.
// Stejný vzor jako subscribeShoppingList/subscribeWeightLogs — žádná Dexie cache.
export function subscribeSavedRecipes(
  uid: string,
  callback: (recipes: SavedRecipeEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(savedRecipesCollection(uid), orderBy("savedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedRecipeEntry, "id">) }))),
    (error) => {
      console.error("Synchronizace uložených receptů selhala:", error);
      onError?.(error);
    }
  );
}

export async function saveRecipe(uid: string, recipe: RecipeResult, source: "text" | "photo"): Promise<void> {
  const entry: Omit<SavedRecipeEntry, "id"> = { ...recipe, source, savedAt: new Date().toISOString() };
  await setDoc(doc(savedRecipesCollection(uid)), entry);
}

export async function deleteSavedRecipe(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(savedRecipesCollection(uid), id));
}

export interface MealTemplateItem {
  name: string;
  value: number;
  type: MealItem["type"];
  protein?: number;
  fat?: number;
  carbs?: number;
}

export interface MealTemplateEntry {
  id: string;
  name: string;
  items: MealTemplateItem[];
  createdAt: string;
}

// Jednorázové načtení pro JSON export (B6) — stejný vzor jako fetchShoppingList výš.
export async function fetchMealTemplates(uid: string): Promise<MealTemplateEntry[]> {
  const q = query(mealTemplatesCollection(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealTemplateEntry, "id">) }));
}

// Živě streamuje users/{uid}/mealTemplates, nejnovější první — stejný vzor jako
// subscribeSavedRecipes ("typický den" quick-fill místo knihovny receptů).
export function subscribeMealTemplates(
  uid: string,
  callback: (templates: MealTemplateEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(mealTemplatesCollection(uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealTemplateEntry, "id">) }))),
    (error) => {
      console.error("Synchronizace šablon jídel selhala:", error);
      onError?.(error);
    }
  );
}

export async function saveMealTemplate(uid: string, name: string, items: MealTemplateItem[]): Promise<void> {
  const entry: Omit<MealTemplateEntry, "id"> = { name, items, createdAt: new Date().toISOString() };
  await setDoc(doc(mealTemplatesCollection(uid)), entry);
}

export async function deleteMealTemplate(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(mealTemplatesCollection(uid), id));
}

// Progress fotky (FEATURE_IDEAS.md sekce 4) — první appkou používaná Firebase Storage data,
// zbytek appky žije jen ve Firestore. Soubor v Storage (users/{uid}/progressPhotos/{syncId}.jpg)
// + metadata dokument ve Firestore se stejným syncId, ať appka nemusí při zobrazení znovu volat
// Storage (getDownloadURL) — URL se uloží rovnou při uploadu.
export interface ProgressPhotoEntry {
  syncId: string;
  date: string;
  downloadURL: string;
  storagePath: string;
}

export async function uploadProgressPhoto(uid: string, photoDataUrl: string, dateISO: string): Promise<void> {
  const syncId = crypto.randomUUID();
  const storagePath = `users/${uid}/progressPhotos/${syncId}.jpg`;
  const storageRef = ref(storage, storagePath);
  await uploadString(storageRef, photoDataUrl, "data_url");
  const downloadURL = await getDownloadURL(storageRef);
  const entry: ProgressPhotoEntry = { syncId, date: dateISO, downloadURL, storagePath };
  await setDoc(doc(progressPhotosCollection(uid), syncId), entry);
}

// Storage soubor se maže PŘED Firestore dokumentem (B7 v AUDIT_2026-08-13.md) — v opačném
// pořadí by selhání Storage mazání (z jiného důvodu než že soubor už neexistuje) appka jen
// zalogovala a smazala metadata, takže by ztratila jediný odkaz, kterým by osiřelý soubor
// ještě někdy našla. "Soubor už neexistuje" appka bere jako úspěch (idempotentní mazání),
// cokoliv jiného nechá Firestore dokument na místě a chybu propaguje volajícímu, ať appka
// umožní opakovat pokus místo tichého no-opu.
export async function deleteProgressPhoto(uid: string, entry: ProgressPhotoEntry): Promise<void> {
  try {
    await deleteObject(ref(storage, entry.storagePath));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== "storage/object-not-found") {
      throw error;
    }
  }
  await deleteDoc(doc(progressPhotosCollection(uid), entry.syncId));
}

// Jednorázové načtení pro JSON export (B6) — jen metadata (URL/cesta ve Storage), ne binární
// data fotky samotné, stejná úvaha jako u ostatních fetch* funkcí v tomhle souboru.
export async function fetchProgressPhotos(uid: string): Promise<ProgressPhotoEntry[]> {
  const q = query(progressPhotosCollection(uid), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ProgressPhotoEntry);
}

export function subscribeProgressPhotos(
  uid: string,
  callback: (entries: ProgressPhotoEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(progressPhotosCollection(uid), orderBy("date", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data() as ProgressPhotoEntry)),
    (error) => {
      console.error("Synchronizace progress fotek selhala:", error);
      onError?.(error);
    }
  );
}

// Volný chat s Myou (FEATURE_IDEAS.md sekce 6) — historie zpráv, stejný vzor jako
// subscribeSavedRecipes/subscribeMealTemplates (auto-id dokument, řazeno podle vzniku,
// žádná lokální Dexie cache). chatWithMya Cloud Function je záměrně bezstavová jako
// všechny ostatní funkce v tomhle souboru — appka jí posílá jen ořezanou historii z téhle
// kolekce, funkce sama do Firestore nesahá.
export interface ChatMessageEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// Jednorázové načtení pro JSON export (B6) — stejný vzor jako fetchShoppingList výš.
export async function fetchChatMessages(uid: string): Promise<ChatMessageEntry[]> {
  const q = query(chatMessagesCollection(uid), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessageEntry, "id">) }));
}

export function subscribeChatMessages(
  uid: string,
  callback: (messages: ChatMessageEntry[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(chatMessagesCollection(uid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessageEntry, "id">) }))),
    (error) => {
      console.error("Synchronizace chatu s Myou selhala:", error);
      onError?.(error);
    }
  );
}

export async function saveChatMessage(uid: string, role: "user" | "assistant", content: string): Promise<void> {
  const entry: Omit<ChatMessageEntry, "id"> = { role, content, createdAt: new Date().toISOString() };
  await setDoc(doc(chatMessagesCollection(uid)), entry);
}

// Smazání celé historie chatu (vlastní tlačítko v MyaChatModal, ne v Profilu — na rozdíl
// od Smazat historii v Profilu, která se týká jen jídel) — stejné dávkové mazání jako
// clearMealsBackup, i když v praxi jedna dávka stačí (chat historie je řádově menší).
export async function clearChatHistory(uid: string): Promise<void> {
  const snap = await getDocs(chatMessagesCollection(uid));
  if (snap.empty) return;
  const batch = writeBatch(firestoreDb);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
