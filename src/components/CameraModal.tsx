import { useRef, useState } from "react";
import { X, Camera, PenLine, Loader2, ChevronLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { db, type MealItem } from "../db/db";
import { MyaVision, type VisionResult, type MealType } from "../lib/vision";
import { MyaAI } from "../lib/ai";
import { useAuth } from "../context/AuthContext";

interface CameraModalProps {
  onClose: () => void;
}

type Step = "choose" | "photo-preview" | "analyzing" | "form" | "feedback";

const MEAL_TYPE_OPTIONS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Snídaně" },
  { id: "lunch", label: "Oběd" },
  { id: "dinner", label: "Večeře" },
  { id: "snack", label: "Svačina" },
];

function guessMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour < 20) return "dinner";
  return "snack";
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function fileToCompressedDataUrl(file: File, maxDim = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Nepodařilo se načíst obrázek"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas není podporován"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function CameraModal({ onClose }: CameraModalProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [source, setSource] = useState<"photo" | "manual">("manual");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [type, setType] = useState<MealType>(guessMealType());
  const [time, setTime] = useState(currentTime());

  const resetFormFromVision = (result: VisionResult | null) => {
    if (result) {
      setName(result.name);
      setCalories(result.calories ? String(result.calories) : "");
      setProtein(result.protein ? String(result.protein) : "");
      setFat(result.fat ? String(result.fat) : "");
      setCarbs(result.carbs ? String(result.carbs) : "");
      setType(result.type);
      setNotice(result.confidence === "low" ? "Mya si nebyla úplně jistá odhadem — zkontroluj prosím hodnoty." : null);
    } else {
      setName("");
      setCalories("");
      setProtein("");
      setFat("");
      setCarbs("");
      setType(guessMealType());
      setNotice("Mya se nepodařilo rozpoznat jídlo z fotky. Zapiš prosím hodnoty ručně.");
    }
    setTime(currentTime());
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setSource("photo");
      setStep("photo-preview");
    } catch (error) {
      console.error(error);
      setNotice("Fotku se nepodařilo načíst. Zkus to znovu nebo zapiš jídlo ručně.");
    }
  };

  const handleAnalyze = async () => {
    if (!photoDataUrl) return;
    setStep("analyzing");
    const result = await MyaVision.analyzeFood(photoDataUrl);
    resetFormFromVision(result);
    setStep("form");
  };

  const handleManualStart = () => {
    setSource("manual");
    setPhotoDataUrl(null);
    setName("");
    setCalories("");
    setProtein("");
    setFat("");
    setCarbs("");
    setType(guessMealType());
    setTime(currentTime());
    setNotice(null);
    setStep("form");
  };

  const handleBack = () => {
    setStep("choose");
    setPhotoDataUrl(null);
    setNotice(null);
  };

  const handleSave = async () => {
    const caloriesNum = Number(calories);
    if (!name.trim() || !caloriesNum || caloriesNum <= 0) return;

    setSaving(true);
    try {
      const meal: MealItem = {
        name: name.trim(),
        value: Math.round(caloriesNum),
        time,
        date: new Date().toISOString().split("T")[0],
        type,
        source,
      };
      if (protein) meal.protein = Math.round(Number(protein));
      if (fat) meal.fat = Math.round(Number(fat));
      if (carbs) meal.carbs = Math.round(Number(carbs));

      await db.meals.add(meal);
      setStep("feedback");

      if (profile) {
        const todayMeals = await db.meals.where("date").equals(meal.date).toArray();
        const consumedTodayCalories = todayMeals.reduce((sum, m) => sum + m.value, 0);
        MyaAI.getMealFeedback({
          mealName: meal.name,
          calories: meal.value,
          protein: meal.protein ?? 0,
          mealType: meal.type,
          consumedTodayCalories,
          targetCalories: profile.targetCalories,
        }).then(setFeedbackText);
      } else {
        setFeedbackText("Zapsáno! 👍");
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave = name.trim().length > 0 && Number(calories) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md max-h-[92dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        {/* HLAVIČKA */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {(step === "photo-preview" || step === "form") && (
              <button
                onClick={handleBack}
                className="p-1 -ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="font-bold text-slate-800 dark:text-white">
              {step === "choose" && "Přidat jídlo"}
              {step === "photo-preview" && "Zkontroluj fotku"}
              {step === "analyzing" && "Mya analyzuje..."}
              {step === "form" && (source === "photo" ? "Potvrď jídlo" : "Zapsat jídlo")}
              {step === "feedback" && "Uloženo"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OBSAH */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "choose" && (
            <div className="space-y-3 py-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-3 py-8 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border-2 border-dashed border-blue-200 dark:border-blue-900/50 active:scale-[0.98] transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <div className="font-bold text-slate-800 dark:text-white">Vyfotit / nahrát jídlo</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mya odhadne kalorie a makra</div>
                </div>
              </button>

              <button
                onClick={handleManualStart}
                className="w-full flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <PenLine className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-slate-800 dark:text-white">Zapsat ručně</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Rychlý zápis bez focení</div>
                </div>
              </button>

              {notice && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}
            </div>
          )}

          {step === "photo-preview" && photoDataUrl && (
            <div className="space-y-4">
              <img src={photoDataUrl} alt="Fotka jídla" className="w-full aspect-square object-cover rounded-3xl" />
              <button
                onClick={handleAnalyze}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
              >
                Analyzovat jídlo
              </button>
              <button
                onClick={handleManualStart}
                className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-1"
              >
                Radši zapsat ručně
              </button>
            </div>
          )}

          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Mya kouká na fotku a počítá kalorie...</p>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-4">
              {notice && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}

              {photoDataUrl && (
                <img src={photoDataUrl} alt="Fotka jídla" className="w-full h-32 object-cover rounded-2xl" />
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Název</label>
                <input
                  type="text"
                  autoFocus={!photoDataUrl}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Např. Kuřecí salát"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-blue-500 dark:text-white transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kalorie (kcal)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="0"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-blue-500 dark:text-white transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bílkoviny</label>
                  <input
                    type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-blue-500 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tuky</label>
                  <input
                    type="number" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-blue-500 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sacharidy</label>
                  <input
                    type="number" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-blue-500 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Typ jídla</label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {MEAL_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setType(opt.id)}
                      className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        type === opt.id
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                          : "border-transparent bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Čas</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-blue-500 dark:text-white transition-all"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Uložit jídlo
              </button>
            </div>
          )}

          {step === "feedback" && (
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="min-h-10 flex items-center justify-center px-4">
                {feedbackText ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{feedbackText}</p>
                ) : (
                  <Loader2 className="w-5 h-5 text-slate-300 dark:text-slate-600 animate-spin" />
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
              >
                Hotovo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
