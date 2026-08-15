import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, setDoc, deleteField, arrayUnion, arrayRemove } from "firebase/firestore";
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

  // N16 (AUDIT_2026-08-14.md) — pole, které appka právě zapisuje (updateProfile níž je má
  // "v letu" mezi optimistickým lokálním merge a potvrzením z Firestore). Živý listener na
  // profilu (viz useEffect níž) je tímhle chráněný před přepsáním starší server hodnotou —
  // bez toho by dvě rychle po sobě jdoucí volání updateProfile (N12) mohla dostat echo ze
  // snapshotu prvního volání zpátky DŘÍV, než druhé doběhne, a ztratit ho. Refcount (ne Set),
  // protože dva překrývající se zápisy do stejného pole se nesmí navzájem předčasně "odemknout".
  // Appka čte/píše jen přes `.current` uvnitř uzávěrů (nikdy nedestrukturuje mapu ven), ať
  // efekt založený jednou s `[]` deps pořád vidí aktuální stav napříč renderama.
  const pendingFieldsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Předchozí uživatelův profilový listener appka vždy nejdřív odhlásí — jinak by po
      // odhlášení/přepnutí účtu na stejném prohlížeči mohl dorazit echo z cizího docu (a
      // appka by navíc dostala zbytečnou permission-denied chybu do konzole).
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

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

      // Nový uživatel (nebo odhlášení) = žádné rozjeté zápisy z předchozí session appku
      // nezajímají.
      pendingFieldsRef.current.clear();
      setUser(currentUser);

      if (currentUser) {
        // Živý listener místo jednorázového getDoc — appka se drží v syncu s dalšími
        // zařízeními/taby stejně jako zbytek appky (Fáze 5 synchronizace), ne jen s vlastními
        // zápisy. `merge`/`delete`-if-absent logika níž je to, co dělá tenhle listener bezpečný
        // souběžně s updateProfile's fire-and-forget optimistickým merge (viz N16 v auditu).
        unsubscribeProfile = onSnapshot(
          doc(db, "users", currentUser.uid),
          (snap) => {
            if (!snap.exists()) {
              setProfile(null);
              setLoading(false);
              return;
            }
            const serverData = snap.data() as UserProfile;
            setProfile((prev) => {
              if (!prev) return serverData;
              const merged: Record<string, unknown> = { ...serverData };
              pendingFieldsRef.current.forEach((_count, key) => {
                const prevRecord = prev as unknown as Record<string, unknown>;
                if (key in prevRecord) {
                  merged[key] = prevRecord[key];
                } else {
                  // Appka pole i lokálně smazala (deleteField() cesta v updateProfile) —
                  // server ještě nemusí odrážet smazání, appka mu tedy nevěří, dokud zápis
                  // nedoběhne.
                  delete merged[key];
                }
              });
              return merged as unknown as UserProfile;
            });
            setLoading(false);
          },
          (error) => {
            console.error("Synchronizace profilu selhala:", error);
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;

    // N16 (AUDIT_2026-08-14.md) — appka pole na dobu zápisu zaznamená do pendingFieldsRef
    // (viz useEffect výš), ať profilový listener nepřepíše lokální hodnotu zastaralou serverovou
    // dřív, než tenhle konkrétní zápis doběhne. Počítadlo, ne jen zápis true/false — kdyby
    // druhé překrývající se volání do stejného pole smazalo ochranu hned po svém doběhnutí,
    // první (ještě běžící) zápis by zůstal nechráněný.
    const keys = Object.keys(data) as (keyof UserProfile)[];
    keys.forEach((key) => {
      pendingFieldsRef.current.set(key, (pendingFieldsRef.current.get(key) ?? 0) + 1);
    });

    // Appka umí i smazat nepovinné pole zpět na "spočítej si to sama" (undefined v data) —
    // Firestore setDoc s merge:true samotné undefined ve writu odmítne (SDK to nepovoluje),
    // takže appka pro takové klíče pošle explicitní deleteField() a zároveň je vyhodí i z
    // lokálního optimistického stavu, ať zůstane v syncu s tím, co skutečně leží ve Firestore.
    const firestorePayload: Record<string, unknown> = { ...data };
    keys.forEach((key) => {
      if (data[key] === undefined) {
        firestorePayload[key] = deleteField();
      }
    });

    // N3/N12 (AUDIT_2026-08-14.md) — funkcionální update uzavírá nad `prev`, ne nad proměnnou
    // `profile` zvenčí, ať dvě rychle po sobě jdoucí volání (např. dva přepínače v Cyklu)
    // jedno druhé lokálně nepřepíší. A appka na `setDoc` dál nečeká: Firestore offline
    // perzistence resolvuje write Promise až po potvrzení od backendu, takže `await
    // updateProfile(...)` by offline viselo navždy a appka by se nikdy nedostala k tomu, co
    // po něm následuje (typicky zavření editačního panelu) — appka teď zapíše lokálně hned
    // a zápis do Firestore doběhne na pozadí, chybu jen zaloguje.
    setProfile((prev) => {
      const next = { ...prev, ...data } as UserProfile;
      keys.forEach((key) => {
        if (data[key] === undefined) {
          delete (next as unknown as Record<string, unknown>)[key];
        }
      });
      return next;
    });

    setDoc(doc(db, "users", user.uid), firestorePayload, { merge: true })
      .catch((error) => {
        console.error("updateProfile: zápis do Firestore selhal na pozadí", error);
      })
      .finally(() => {
        keys.forEach((key) => {
          const count = (pendingFieldsRef.current.get(key) ?? 1) - 1;
          if (count <= 0) pendingFieldsRef.current.delete(key);
          else pendingFieldsRef.current.set(key, count);
        });
      });
  };

  // N15 (AUDIT_2026-08-14.md) — vacationDates/plannedWorkoutDays měly stejnou třídu race-bugu
  // jako voda před C4: appka je počítala jako read-modify-write z lokálního stavu, takže dvě
  // zařízení přidávající různou hodnotu téměř současně mohla jedno přidání ztratit (last-write-
  // wins na celém poli). arrayUnion()/arrayRemove() je server-side atomické stejně jako
  // increment() u vody — appka proto (stejně jako adjustWaterGlasses/subscribeWaterLog)
  // záměrně NEdělá lokální optimistický merge, spolehá na živý profilový listener výš (N16),
  // který změnu vrátí zpátky prakticky okamžitě z lokální Firestore cache, ještě před
  // potvrzením ze serveru. customReminders přidán později (N15, dokončeno v samostatné session) —
  // dřív appka mazala podle indexu, ne podle hodnoty, což s arrayRemove(hodnota) kolidovalo:
  // dvě stejné afirmace by se smazaly obě najednou, ne jen ta jedna vybraná. Řešení není extra
  // dedup logika na appce — arrayUnion() sama o sobě na Firestore serveru nepřidá hodnotu,
  // která v poli už existuje (zdokumentované chování), takže dokud VŠECHNA přidávání jdou přes
  // tuhle funkci, duplicita v poli nemůže vzniknout a arrayRemove(hodnota) je tím pádem bezpečné.
  const updateProfileArray = async (
    field: "vacationDates" | "plannedWorkoutDays" | "customReminders",
    op: "union" | "remove",
    values: (string | number)[]
  ) => {
    if (!user || values.length === 0) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { [field]: op === "union" ? arrayUnion(...values) : arrayRemove(...values) },
        { merge: true }
      );
    } catch (error) {
      console.error(`updateProfileArray(${field}): zápis do Firestore selhal`, error);
    }
  };

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, updateProfile, updateProfileArray, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
