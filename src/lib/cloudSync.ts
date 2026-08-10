import { collection, doc, getDocs, onSnapshot, orderBy, query, setDoc, writeBatch, type Unsubscribe } from "firebase/firestore";
import { db as firestoreDb } from "./firebase";
import { db as dexieDb, type MealItem } from "../db/db";

function mealsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "meals");
}

function weightLogsCollection(uid: string) {
  return collection(firestoreDb, "users", uid, "weightLogs");
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

// Živě streamuje users/{uid}/weightLogs (řazeno podle data) — nahrazuje starší
// jednorázové fetchWeightLogs/fetchLatestWeightLog, ať trend i připomínka vážení
// reagují na zápis z jiného zařízení bez nutnosti appku restartovat.
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
