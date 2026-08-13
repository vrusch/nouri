import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { AuthContext } from "./AuthContextBase";

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
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
    await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
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
