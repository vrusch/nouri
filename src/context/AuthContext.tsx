import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { db as localDb } from "../db/db";
import { AuthContext } from "./AuthContextBase";

// Lokální Dexie cache (meals/workouts, viz src/db/db.ts) není vázaná na uid — appka ji jinak
// při přepnutí účtu ve stejném prohlížeči vůbec nemazala, takže nový uživatel dočasně viděl
// jídla/tréninky předchozího účtu jako vlastní, se stejnou jistotou jako reálná data (objeveno
// při živém ověření REFERENCE/DATA_COMPLETENESS_PLAN.md). Appka má jen jednoho reálného
// uživatele, takže dopad je v praxi nízký, ale je to reálná díra v datové izolaci.
const LAST_SYNCED_UID_KEY = "nouri_last_synced_uid";

export interface UserProfile {
  name: string;
  gender: 'male' | 'female';
  height: number;
  weight: number;
  birthDate: string;
  activityLevel: 1 | 1.2 | 1.375 | 1.55 | 1.725 | 1.9; // BMR multipliers
  goal: 'lose' | 'maintain' | 'gain';
  targetCalories: number;
  targetWeight?: number; // cílová váha v kg — jen pro goal 'lose'/'gain', u 'maintain' se nesbírá (viz goalReached.ts)
  setupComplete: boolean;
  lastAiReport?: string; // Uložený AI report od Myi
  weighInReminderDays?: number; // Jak často připomínat vážení (1-7 dní)
  calibratedTDEE?: number; // Skutečný výdej odhadnutý z dat (viz Stats.tsx), přepíše formulkový odhad z activityLevel
  lastProfileCheckAt?: string; // ISO datum poslední potvrzené kontroly profilu (viz profileCheck.ts)
  customReminders?: string[]; // Vlastní afirmace/texty, které Mya občas použije místo generické hlášky (viz customReminders.ts)
  lastMacroPatternDismissedAt?: string; // ISO datum posledního potvrzení návrhu na doladění maker (viz macroPattern.ts)
  quietHoursEnabled?: boolean; // vypnutí/zapnutí tichého režimu (viz quietHours.ts), výchozí (undefined) = zapnuto
  quietHoursStart?: number; // hodina 0-23, výchozí 22 (QUIET_HOURS_START v quietHours.ts)
  quietHoursEnd?: number; // hodina 0-23, výchozí 7 (QUIET_HOURS_END v quietHours.ts)
  plannedWorkoutDays?: number[]; // dny v týdnu, kdy appka připomíná trénink (0=neděle..6=sobota, Date.getDay()), viz workoutPlan.ts
  lastCelebratedStreakDays?: number; // nejvyšší streak milník, který appka už oslavila (viz milestones.ts)
  lastCelebratedWeightMilestoneKg?: number; // nejvyšší váhový milník (v kg pokroku od prvního záznamu), který appka už oslavila
  lastLowCalorieDismissedAt?: string; // ISO datum posledního potvrzení "citlivého" check-inu na nízký příjem (viz calorieIntakePattern.ts)
  lastCelebratedGoalReachedWeight?: number; // targetWeight, pro kterou appka už zobrazila gratulaci (viz goalReached.ts) — ne bool, ať nový (nižší/vyšší) cíl gratulaci umožní znovu
  vacationDates?: string[]; // ISO datumy dní "mimo režim" (volný den i dovolenkový rozsah sdílí stejné pole), viz vacationMode.ts
  lastCalibrationDismissedAt?: string; // ISO datum posledního odmítnutí ("Zatím ne") návrhu kalibrace cíle (viz nutrition.ts calibrateTarget)
  cycleTrackingEnabled?: boolean; // explicitní opt-in sledování cyklu, výchozí vypnuto i pro gender: 'female' (viz cyclePhase.ts, REFERENCE/CYCLE_TRACKING_PROPOSAL.md)
  avgCycleLength?: number; // dny, appka si ho průběžně přepočítává z cycleLogs (computeAvgCycleLength v cyclePhase.ts), výchozí 28 (DEFAULT_CYCLE_LENGTH_DAYS)
  cycleRegularity?: 'regular' | 'irregular'; // explicitní přepínač, ne jen odvození z variance zápisů — u 'irregular' appka ukazuje nižší jistotu odhadu fáze
  onHormonalContraception?: boolean; // gate pro luteální kalorický bonus (Úroveň 2) — na hormonální antikoncepci není přirozený vzestup progesteronu jako v běžné luteální fázi
  customProteinGrams?: number; // ruční přepis bílkovin (g/den) místo formulky 1.8g/kg — např. podle výživového poradce/lékaře, viz calculateNutrition v nutrition.ts
  customFatGrams?: number; // ruční přepis tuků (g/den) místo formulky 25 % cílových kalorií — sacharidy appka i s override dopočítá jako zbytek do cílových kalorií
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Musí doběhnout PŘED setUser níž — jakmile appka nastaví `user`, App.tsx efekt na
        // něm závislý může okamžitě spustit subscribeMeals/subscribeWorkouts pro nový uid a
        // začít do Dexie zapisovat čerstvá data; kdyby clear běžel až po setUser, mohl by je
        // smazat těsně po zápisu (race).
        const lastSyncedUid = localStorage.getItem(LAST_SYNCED_UID_KEY);
        if (lastSyncedUid && lastSyncedUid !== currentUser.uid) {
          await Promise.all([localDb.meals.clear(), localDb.workouts.clear()]);
        }
        localStorage.setItem(LAST_SYNCED_UID_KEY, currentUser.uid);
      }

      setUser(currentUser);

      if (currentUser) {
        // Načíst profil z Firestore
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;

    const newProfile = { ...profile, ...data } as UserProfile;
    // Appka umí i smazat nepovinné pole zpět na "spočítej si to sama" (undefined v data) —
    // Firestore setDoc s merge:true samotné undefined ve writu odmítne (SDK to nepovoluje),
    // takže appka pro takové klíče pošle explicitní deleteField() a zároveň je vyhodí i z
    // lokálního optimistického stavu, ať zůstane v syncu s tím, co skutečně leží ve Firestore.
    const firestorePayload: Record<string, unknown> = { ...data };
    (Object.keys(data) as (keyof UserProfile)[]).forEach((key) => {
      if (data[key] === undefined) {
        firestorePayload[key] = deleteField();
        delete (newProfile as unknown as Record<string, unknown>)[key];
      }
    });

    await setDoc(doc(db, "users", user.uid), firestorePayload, { merge: true });
    setProfile(newProfile);
  };

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
