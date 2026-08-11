import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db as firestoreDb } from "./firebase";
import { db as dexieDb, type MealItem } from "../db/db";
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

// Odloží cloud zálohu, aby nikdy neblokovala lokální (Dexie) zápis — chyba se jen zaloguje.
export async function backupMeal(uid: string, meal: MealItem): Promise<void> {
  if (!meal.syncId) return;
  try {
    await setDoc(doc(mealsCollection(uid), meal.syncId), meal);
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
        batch.set(doc(mealsCollection(uid), meal.syncId), meal);
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
              dexieDb.meals.update(existing.id, meal);
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

export interface ShoppingListEntry extends ShoppingListItemDraft {
  id: string;
  bought: boolean;
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
    batch.set(doc(shoppingListCollection(uid)), { text: item.text, recipeName: item.recipeName, bought: false });
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
