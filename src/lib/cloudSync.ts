import { collection, doc, getDocs, limit, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
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

// Jednorázová obnova pro případ, kdy je lokální Dexie prázdná (např. po evikci
// IndexedDB na iOS nebo po přeinstalaci) — natáhne historii zpět z cloudové zálohy.
export async function hydrateMealsIfEmpty(uid: string): Promise<void> {
  try {
    const localCount = await dexieDb.meals.count();
    if (localCount > 0) return;

    const snap = await getDocs(mealsCollection(uid));
    if (snap.empty) return;

    const meals = snap.docs.map((d) => d.data() as MealItem);
    await dexieDb.meals.bulkAdd(meals);
  } catch (error) {
    console.error("Obnova jídel z cloudu selhala:", error);
  }
}

// Doc id = datum (YYYY-MM-DD), takže oprava překlepu ve stejný den přepíše
// existující bod místo vytvoření duplicity v trendu.
export async function logWeight(uid: string, weightKg: number, dateISO: string): Promise<void> {
  try {
    await setDoc(doc(weightLogsCollection(uid), dateISO), { weight: weightKg, date: dateISO });
  } catch (error) {
    console.error("Zápis váhy do cloudu selhal:", error);
  }
}

export interface WeightLogEntry {
  date: string;
  weight: number;
}

export async function fetchWeightLogs(uid: string): Promise<WeightLogEntry[]> {
  try {
    const q = query(weightLogsCollection(uid), orderBy("date", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WeightLogEntry);
  } catch (error) {
    console.error("Načtení historie váhy selhalo:", error);
    return [];
  }
}

// Jen poslední záznam — pro rychlou kontrolu "je vážení po termínu?" bez tažení celé historie.
export async function fetchLatestWeightLog(uid: string): Promise<WeightLogEntry | null> {
  try {
    const q = query(weightLogsCollection(uid), orderBy("date", "desc"), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as WeightLogEntry);
  } catch (error) {
    console.error("Načtení posledního záznamu váhy selhalo:", error);
    return null;
  }
}

// Založí první bod váhové historie z aktuální hodnoty v profilu, pokud appka
// ještě žádný záznam nemá — aby trend měl výchozí bod hned od prvního spuštění.
export async function seedWeightLogIfEmpty(uid: string, currentWeight: number): Promise<void> {
  try {
    const snap = await getDocs(weightLogsCollection(uid));
    if (!snap.empty) return;
    const today = new Date().toISOString().split("T")[0];
    await logWeight(uid, currentWeight, today);
  } catch (error) {
    console.error("Založení výchozí váhové historie selhalo:", error);
  }
}
