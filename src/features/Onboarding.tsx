import { useState } from "react";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useAuth, type UserProfile } from "../context/AuthContext";
import { LogoHorizontal } from "../components/Logo";
import { Ruler, Weight, ChevronRight, LogIn, Mail, Lock, User as UserIcon } from "lucide-react";

export default function Onboarding() {
  const { user, updateProfile } = useAuth();
  const [step, setStep] = useState(0);
  
  // Auth stavy
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");

  // Dočasný stav pro formulář profilu
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
      setAuthError("");
      await signInWithPopup(auth, googleProvider);
      setStep(1);
    } catch (error: any) {
      setAuthError("Přihlášení přes Google selhalo.");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setStep(1);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') setAuthError("Tento email se již používá.");
      else if (error.code === 'auth/invalid-credential') setAuthError("Nesprávný email nebo heslo.");
      else if (error.code === 'auth/weak-password') setAuthError("Heslo musí mít alespoň 6 znaků.");
      else setAuthError("Chyba při přihlašování.");
    }
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      await updateProfile({ ...formData, setupComplete: true });
    }
  };

  const genderBg = formData.gender === 'female' 
    ? 'bg-rose-50/30' 
    : formData.gender === 'male' 
      ? 'bg-sky-50/30' 
      : 'bg-slate-50';

  // 1. PŘIHLÁŠENÍ / REGISTRACE
  if (!user) {
    return (
      <div className="min-h-dvh bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-8 text-center transition-colors text-slate-900 dark:text-slate-100">
        <div className="w-full max-w-sm space-y-10">
          <LogoHorizontal className="scale-110 mx-auto" />
          
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {isRegistering ? "Vytvořit účet" : "Vítej v Nouri"}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">Tvůj osobní AI asistent pro zdravý životní styl.</p>
          </div>

          <div className="space-y-4">
            {/* GOOGLE BUTTON */}
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-3.5 px-6 rounded-2xl shadow-sm font-bold text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all active:scale-[0.97]"
            >
              <LogIn className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Pokračovat přes Google
            </button>

            <div className="flex items-center gap-4 py-2">
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">nebo</span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>

            {/* EMAIL FORM */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  placeholder="Email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-semibold outline-blue-500 transition-all dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  placeholder="Heslo"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-semibold outline-blue-500 transition-all dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              
              {authError && <p className="text-red-500 text-xs font-bold">{authError}</p>}

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.97] transition-all mt-2"
              >
                {isRegistering ? "Zaregistrovat se" : "Přihlásit se emailem"}
              </button>
            </form>

            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {isRegistering ? "Už máš účet? Přihlas se" : "Nemáš účet? Zaregistruj se"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. KROKY ONBOARDINGU (Přezdívka, Pohlaví)
  if (step === 1) {
    return (
      <div className={`min-h-dvh ${genderBg} dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors text-slate-900 dark:text-slate-100`}>
        <div className="space-y-8 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-1/3 h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-3xl font-bold tracking-tight">Jak ti máme říkat?</h2>
            <p className="text-slate-500 dark:text-slate-400">Mya tě tak bude oslovovat.</p>
          </div>
          <div className="relative">
            <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-300" />
            <input
              type="text"
              placeholder="Tvoje jméno"
              autoFocus
              value={formData.name || user.displayName || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white dark:bg-slate-900 border-none rounded-3xl py-6 pl-16 pr-6 text-xl font-bold shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
          <div className="flex gap-4">
             {['female', 'male'].map((g) => (
               <button
                 key={g}
                 onClick={() => setFormData({...formData, gender: g as any})}
                 className={`flex-1 py-4 rounded-3xl font-bold border-2 transition-all active:scale-[0.97] ${
                   formData.gender === g ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-transparent bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500'
                 }`}
               >
                 {g === 'female' ? 'Žena' : 'Muž'}
               </button>
             ))}
          </div>
        </div>
        <button onClick={handleNext} disabled={!formData.name && !user.displayName} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.97] transition-all">
          Pokračovat <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 3. VÝŠKA A VÁHA
  if (step === 2) {
    return (
      <div className={`min-h-dvh ${genderBg} dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors text-slate-900 dark:text-slate-100`}>
        <div className="space-y-12 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-2/3 h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-3xl font-bold tracking-tight">Tvoje parametry</h2>
            <p className="text-slate-500 dark:text-slate-400">Důležité pro výpočet metabolismu.</p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm flex items-center justify-between border border-transparent focus-within:border-blue-500 transition-all">
              <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
                <Ruler className="w-6 h-6" />
                <span className="font-bold">Výška (cm)</span>
              </div>
              <input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) })}
                className="w-20 text-right font-bold text-2xl bg-transparent outline-none dark:text-white"
              />
            </div>
            
            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm flex items-center justify-between border border-transparent focus-within:border-blue-500 transition-all">
              <div className="flex items-center gap-4 text-slate-400 dark:text-slate-500">
                <Weight className="w-6 h-6" />
                <span className="font-bold">Váha (kg)</span>
              </div>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                className="w-20 text-right font-bold text-2xl bg-transparent outline-none dark:text-white"
              />
            </div>
          </div>
        </div>
        <button onClick={handleNext} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
          Už skoro hotovo <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // 4. CÍLE
  if (step === 3) {
    return (
      <div className={`min-h-dvh ${genderBg} dark:bg-slate-950 p-8 flex flex-col justify-between transition-colors text-slate-900 dark:text-slate-100`}>
        <div className="space-y-12 pt-12">
          <div className="w-12 h-2 bg-blue-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="w-full h-full bg-blue-600 rounded-full" />
          </div>
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-3xl font-bold tracking-tight">Co je tvůj cíl?</h2>
            <p className="text-slate-500 dark:text-slate-400">Podle toho nastavíme kalorie.</p>
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
                 className={`w-full p-6 rounded-3xl text-left border-2 transition-all active:scale-[0.98] ${
                   formData.goal === g.id ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent bg-white dark:bg-slate-900'
                 }`}
               >
                 <div className={`font-bold text-lg ${formData.goal === g.id ? 'text-blue-600' : 'text-slate-800 dark:text-slate-100'}`}>{g.label}</div>
                 <div className="text-sm text-slate-500 dark:text-slate-400">{g.sub}</div>
               </button>
             ))}
          </div>
        </div>
        <button onClick={handleNext} className="bg-blue-600 text-white py-5 rounded-3xl font-bold shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 active:scale-[0.97] transition-all">
          Vše nastaveno! ✨
        </button>
      </div>
    );
  }

  return null;
}
