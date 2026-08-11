import { useEffect, useRef, useState } from "react";
import { X, Camera, PenLine, Mic, Square, Loader2, ChevronLeft, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { db, type MealItem } from "../db/db";
import { MyaVision, type VisionResult, type MealType } from "../lib/vision";
import { MyaVoice } from "../lib/voice";
import { MyaAI } from "../lib/ai";
import { backupMeal, deleteMeal } from "../lib/cloudSync";
import { calculateNutrition } from "../lib/nutrition";
import { fileToCompressedDataUrl } from "../lib/image";
import { useAuth } from "../context/useAuth";

interface AddMealModalProps {
  onClose: () => void;
  /** Když je vyplněné, modál se otevře rovnou na formuláři předvyplněném touhle položkou
   *  a "Uložit" upraví existující jídlo místo založení nového (viz handleSave). */
  editMeal?: MealItem;
}

type Step = "choose" | "photo-preview" | "describe" | "recording" | "analyzing" | "form" | "feedback";

const RECORDING_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

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

export default function AddMealModal({ onClose, editMeal }: AddMealModalProps) {
  const { profile, user } = useAuth();
  const isEditing = editMeal !== undefined;
  const [step, setStep] = useState<Step>(editMeal ? "form" : "choose");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<"photo" | "manual">(editMeal?.source ?? "manual");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [analyzingMessage, setAnalyzingMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [name, setName] = useState(editMeal?.name ?? "");
  const [calories, setCalories] = useState(editMeal ? String(editMeal.value) : "");
  const [protein, setProtein] = useState(editMeal?.protein !== undefined ? String(editMeal.protein) : "");
  const [fat, setFat] = useState(editMeal?.fat !== undefined ? String(editMeal.fat) : "");
  const [carbs, setCarbs] = useState(editMeal?.carbs !== undefined ? String(editMeal.carbs) : "");
  const [type, setType] = useState<MealType>(editMeal?.type ?? guessMealType());
  const [time, setTime] = useState(editMeal?.time ?? currentTime());

  // Jistota proti mikrofonu, který zůstane "otevřený" (indikátor v prohlížeči), když
  // se modál zavře jinak než přes handleClose/handleBack (např. odhlášení, navigace).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const resetFormFromVision = (result: VisionResult | null, failureNotice: string) => {
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
      setNotice(failureNotice);
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
    setAnalyzingMessage("Mya kouká na fotku a počítá kalorie...");
    setStep("analyzing");
    const result = await MyaVision.analyzeFood(photoDataUrl);
    resetFormFromVision(result, "Mya se nepodařilo rozpoznat jídlo z fotky. Zapiš prosím hodnoty ručně.");
    setStep("form");
  };

  const handleDescribeStart = () => {
    setSource("manual");
    setPhotoDataUrl(null);
    setDescription("");
    setNotice(null);
    setStep("describe");
  };

  const handleAnalyzeText = async () => {
    if (!description.trim()) return;
    setAnalyzingMessage("Mya čte popis a počítá kalorie...");
    setStep("analyzing");
    const result = await MyaVision.analyzeFoodText(description.trim());
    resetFormFromVision(result, "Mya nerozpoznala jídlo z popisu. Zapiš prosím hodnoty ručně.");
    setStep("form");
  };

  const handleRecordingStopped = async () => {
    // Track se zastavuje až tady, ne v handleStopRecording — MediaRecorder.stop() je
    // asynchronní (dovnitř ještě doteče poslední "dataavailable"), zastavení tracku
    // dřív může na iOS Safari/některých Chrome buildech uříznout poslední kus nahrávky.
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    audioChunksRef.current = [];

    setAnalyzingMessage("Mya poslouchá a přepisuje...");
    setStep("analyzing");
    const dataUrl = await blobToDataUrl(blob);
    const text = await MyaVoice.transcribeAudio(dataUrl);

    if (text) {
      setSource("manual");
      setDescription(text);
      setNotice(null);
      setStep("describe");
    } else {
      setNotice("Mye se nepodařilo rozpoznat řeč. Zkus to znovu nebo popiš jídlo textem.");
      setStep("choose");
    }
  };

  const handleVoiceStart = async () => {
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const supportedMimeType = RECORDING_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = handleRecordingStopped;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSource("manual");
      setPhotoDataUrl(null);
      setStep("recording");
    } catch (error) {
      console.error(error);
      setNotice("Nepodařilo se získat přístup k mikrofonu. Zkontroluj oprávnění nebo popiš jídlo textem.");
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null; // zpět uprostřed nahrávání nesmí spustit přepis
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStep("choose");
    setPhotoDataUrl(null);
    setDescription("");
    setNotice(null);
  };

  const handleClose = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  };

  const handleSave = async () => {
    const caloriesNum = Number(calories);
    if (!name.trim() || !caloriesNum || caloriesNum <= 0) return;

    setSaving(true);
    try {
      if (isEditing && editMeal) {
        const updatedFields: Partial<MealItem> = { name: name.trim(), value: Math.round(caloriesNum), time, type };
        if (protein) updatedFields.protein = Math.round(Number(protein));
        if (fat) updatedFields.fat = Math.round(Number(fat));
        if (carbs) updatedFields.carbs = Math.round(Number(carbs));

        if (editMeal.id !== undefined) await db.meals.update(editMeal.id, updatedFields);

        // Firestore backup přepisuje celý dokument (setDoc bez merge), takže musí jít celý
        // sloučený záznam, ne jen upravená pole — jinak by cloud přišel o zbytek jídla.
        const fullUpdatedMeal: MealItem = { ...editMeal, ...updatedFields };
        if (user && fullUpdatedMeal.syncId) backupMeal(user.uid, fullUpdatedMeal);

        onClose();
        return;
      }

      const meal: MealItem = {
        name: name.trim(),
        value: Math.round(caloriesNum),
        time,
        date: new Date().toISOString().split("T")[0],
        type,
        source,
        syncId: crypto.randomUUID(),
      };
      if (protein) meal.protein = Math.round(Number(protein));
      if (fat) meal.fat = Math.round(Number(fat));
      if (carbs) meal.carbs = Math.round(Number(carbs));

      await db.meals.add(meal);
      setStep("feedback");

      if (user) backupMeal(user.uid, meal);

      if (profile) {
        const todayMeals = await db.meals.where("date").equals(meal.date).toArray();
        const consumedTodayCalories = todayMeals.reduce((sum, m) => sum + m.value, 0);
        const { targetCalories } = calculateNutrition(profile);
        MyaAI.getMealFeedback({
          mealName: meal.name,
          calories: meal.value,
          protein: meal.protein ?? 0,
          mealType: meal.type,
          consumedTodayCalories,
          targetCalories,
        }).then(setFeedbackText);
      } else {
        setFeedbackText("Zapsáno! 👍");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMeal = async () => {
    if (!editMeal) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    try {
      if (editMeal.id !== undefined) await db.meals.delete(editMeal.id);
      if (user && editMeal.syncId) await deleteMeal(user.uid, editMeal.syncId);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const canSave = name.trim().length > 0 && Number(calories) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md max-h-[92dvh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        {/* HLAVIČKA */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            {!isEditing && (step === "photo-preview" || step === "describe" || step === "recording" || step === "form") && (
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
              {step === "describe" && "Popiš jídlo"}
              {step === "recording" && "Nahrávám..."}
              {step === "analyzing" && "Mya analyzuje..."}
              {step === "form" && (isEditing ? "Upravit jídlo" : source === "photo" ? "Potvrď jídlo" : "Zapsat jídlo")}
              {step === "feedback" && "Uloženo"}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
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
                className="w-full flex flex-col items-center gap-3 py-8 bg-rose-50 dark:bg-rose-900/20 rounded-3xl border-2 border-dashed border-rose-200 dark:border-rose-900/50 active:scale-[0.98] transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-500/30">
                  <Camera className="w-7 h-7" />
                </div>
                <div className="text-center">
                  <div className="font-bold text-slate-800 dark:text-white">Vyfotit / nahrát jídlo</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mya odhadne kalorie a makra</div>
                </div>
              </button>

              <button
                onClick={handleDescribeStart}
                className="w-full flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <PenLine className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-slate-800 dark:text-white">Popsat jídlo</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mya odhadne kalorie z popisu</div>
                </div>
              </button>

              <button
                onClick={handleVoiceStart}
                className="w-full flex items-center gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-3xl active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-bold text-slate-800 dark:text-white">Namluvit jídlo</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mya přepíše, co řekneš, a odhadne kalorie</div>
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
                className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all"
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

          {step === "describe" && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Co jsi jedla?</label>
                <textarea
                  autoFocus
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Např. dvě vejce na měkko, krajíc chleba s máslem a rajče"
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-rose-500 dark:text-white transition-all resize-none"
                />
              </div>
              <button
                onClick={handleAnalyzeText}
                disabled={!description.trim()}
                className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                Analyzovat
              </button>
              <button
                onClick={handleManualStart}
                className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-1"
              >
                Radši zapsat čísla ručně
              </button>
            </div>
          )}

          {step === "recording" && (
            <div className="flex flex-col items-center justify-center gap-6 py-16">
              <button
                onClick={handleStopRecording}
                className="w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg shadow-red-500/30 bg-red-500 animate-pulse active:scale-95 transition-all"
              >
                <Square className="w-8 h-8" fill="currentColor" />
              </button>
              <p className="text-sm text-slate-500 dark:text-slate-400">Nahrávám... klepnutím ukončíš</p>
            </div>
          )}

          {step === "analyzing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{analyzingMessage}</p>
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
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-rose-500 dark:text-white transition-all"
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
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-rose-500 dark:text-white transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bílkoviny</label>
                  <input
                    type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-rose-500 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tuky</label>
                  <input
                    type="number" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-rose-500 dark:text-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sacharidy</label>
                  <input
                    type="number" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="g"
                    className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold outline-rose-500 dark:text-white transition-all"
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
                          ? "border-rose-600 bg-rose-50 dark:bg-rose-900/20 text-rose-600"
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
                  className="w-full mt-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 font-semibold outline-rose-500 dark:text-white transition-all"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isEditing ? "Uložit změny" : "Uložit jídlo"}
              </button>

              {isEditing && (
                <button
                  onClick={handleDeleteMeal}
                  disabled={deleting}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold active:scale-[0.98] transition-all disabled:opacity-50 border ${
                    confirmDelete
                      ? "bg-red-50 dark:bg-red-900/20 text-red-500 border-red-200 dark:border-red-900/50"
                      : "bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800"
                  }`}
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {confirmDelete ? "Opravdu smazat? Klikni znovu" : "Smazat jídlo"}
                </button>
              )}
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
                className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all"
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
