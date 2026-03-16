import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth, UserProfile } from "../context/AuthContext";
import { LogoHorizontal } from "../components/Logo";
import { User, Ruler, Weight, Target, ChevronRight, LogIn } from "lucide-react";

export default function Onboarding() {
  const { user, profile, updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  
  // Dočasný stav pro formulář
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    name: "",
    gender: 'female',
    height: 165,
    weight: 65,
    birthDate: "1995-01-01",
    activityLevel: 1.2,
    goal: 'lose',
    targetCalories: 1800,
    setupComplete: false
  });

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setStep(1);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Finální uložení
      await updateProfile({ ...formData, setupComplete: true });
    }
  };

  // 1. PŘIHLÁŠENÍ
  if (!user) {
    return (
      <div className="h-dvh bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-12">
        <LogoHorizontal className="scale-125" />
        <div className="space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Vítej v Nouri</h1>
          <p className="text-slate-500 dark:text-slate-400">Tvůj osobní AI asistent pro zdravý životní styl.</p>
        </div>
        <button
          onClick={handleGoogleLogin}
          className="w-full max-w-xs flex items-center justify-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-4 px-6 rounded-3xl shadow-sm font-bold hover:bg-slate-50 transition-all active:scale-95"
        >
          <LogIn className="w-5 h-5 text-blue-600" />
          Přihlásit se přes Google
        </button>
      </div>
    );
  }

  // 2. KROKY ONBOARDINGU (Přezdívka, Pohlaví)
  if (step === 1) {
    return (
      <div className="h-dvh bg-slate-50 dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors">
        <div className="space-y-8 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-1/3 h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Jak ti máme říkat?</h2>
            <p className="text-slate-500">Mya tě tak bude oslovovat.</p>
          </div>
          <input
            type="text"
            placeholder="Tvoje jméno"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-white dark:bg-slate-900 border-none rounded-3xl p-6 text-xl font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
          <div className="flex gap-4">
             {['female', 'male'].map((g) => (
               <button
                 key={g}
                 onClick={() => setFormData({...formData, gender: g as any})}
                 className={`flex-1 py-4 rounded-3xl font-bold border-2 transition-all ${
                   formData.gender === g ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-transparent bg-white dark:bg-slate-900 text-slate-400'
                 }`}
               >
                 {g === 'female' ? 'Žena' : 'Muž'}
               </button>
             ))}
          </div>
        </div>
        <button onClick={handleNext} disabled={!formData.name} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50">
          Pokračovat <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 3. VÝŠKA A VÁHA
  if (step === 2) {
    return (
      <div className="h-dvh bg-slate-50 dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors">
        <div className="space-y-12 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-2/3 h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Tvoje parametry</h2>
            <p className="text-slate-500">Důležité pro výpočet metabolismu.</p>
          </div>
          
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4 text-slate-400">
                <Ruler className="w-6 h-6" />
                <span className="font-bold">Výška (cm)</span>
              </div>
              <input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                className="w-20 text-right font-bold text-2xl bg-transparent outline-none"
              />
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4 text-slate-400">
                <Weight className="w-6 h-6" />
                <span className="font-bold">Váha (kg)</span>
              </div>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                className="w-20 text-right font-bold text-2xl bg-transparent outline-none"
              />
            </div>
          </div>
        </div>
        <button onClick={handleNext} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
          Už skoro hotovo <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 4. CÍLE
  if (step === 3) {
    return (
      <div className="h-dvh bg-slate-50 dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors">
        <div className="space-y-12 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-full h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Co je tvůj cíl?</h2>
            <p className="text-slate-500">Podle toho nastavíme kalorie.</p>
          </div>
          
          <div className="space-y-3">
             {[
               {id: 'lose', label: 'Hubnout', sub: 'Chci se cítit lehčeji'},
               {id: 'maintain', label: 'Udržovat', sub: 'Cítím se skvěle, chci tak zůstat'},
               {id: 'gain', label: 'Nabírat', sub: 'Chci víc svalů a síly'}
             ].map((g) => (
               <button
                 key={g.id}
                 onClick={() => setFormData({...formData, goal: g.id as any})}
                 className={`w-full p-6 rounded-3xl text-left border-2 transition-all ${
                   formData.goal === g.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent bg-white dark:bg-slate-900'
                 }`}
               >
                 <div className={`font-bold text-lg ${formData.goal === g.id ? 'text-blue-600' : 'text-slate-800 dark:text-slate-100'}`}>{g.label}</div>
                 <div className="text-sm text-slate-500">{g.sub}</div>
               </button>
             ))}
          </div>
        </div>
        <button onClick={handleNext} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2">
          Vše nastaveno! ✨
        </button>
      </div>
    );
  }

  return null;
}
