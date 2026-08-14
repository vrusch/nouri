import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { MyaAI } from "../lib/ai";
import { subscribeChatMessages, saveChatMessage, clearChatHistory, type ChatMessageEntry } from "../lib/cloudSync";

interface MyaChatModalProps {
  onClose: () => void;
  /** Luteálně navýšené TDEE z App.tsx (viz stejný výpočet v Home.tsx) — když je nastavené,
   *  chatWithMya níž dostane profil s tímhle calibratedTDEE místo syrového profile.calibratedTDEE,
   *  ať Mya v chatu nemluví o nižším cíli, než appka reálně ukazuje na Home. */
  effectiveCalibratedTDEE?: number;
}

// Appka posílá funkci jen posledních pár zpráv (ne celou historii) — drží náklady na OpenAI
// pod kontrolou i u dlouhé konverzace, funkce sama v index.ts stejný limit i validuje.
const MAX_CHAT_HISTORY = 20;

export default function MyaChatModal({ onClose, effectiveCalibratedTDEE }: MyaChatModalProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessageEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFemale = profile?.gender === "female";

  useEffect(() => {
    if (!user) return;
    return subscribeChatMessages(user.uid, setMessages);
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !user || !profile || sending) return;

    setInput("");
    setSending(true);
    // N4 (AUDIT_2026-08-14.md) — appka na saveChatMessage nečeká, stejný fire-and-forget vzor
    // jako backupMeal/backupWorkout (AddMealModal.tsx, LogWorkoutModal.tsx): Firestore offline
    // write Promise nikdy nezreject ani neresolvne, dokud appka není zpět online, takže `await`
    // by tu appku offline zaseklo navždy v "odesílání" (try/finally samo o sobě nepomůže — finally
    // se spustí, až execution try blok opustí, a na neresolvnutém awaitu uvnitř k tomu nikdy
    // nedojde). Lokální zobrazení jede přes subscribeChatMessages (onSnapshot vidí lokální
    // cache okamžitě, i před potvrzením od backendu), takže odeslaná zpráva se v UI objeví hned.
    saveChatMessage(user.uid, "user", trimmed);

    try {
      // Historie se skládá lokálně (messages + právě odeslaná zpráva), ne z živého snapshotu —
      // ten by v tuhle chvíli ještě nemusel obsahovat zprávu, kterou appka teprve zapsala.
      const history = [...messages, { role: "user" as const, content: trimmed }]
        .slice(-MAX_CHAT_HISTORY)
        .map(({ role, content }) => ({ role, content }));
      // chatWithMya nikdy nezreject appce zpátky (viz ai.ts) — i offline appka doběhne rychle
      // s Czech fallback textem ("Mya právě neodpovídá..."), takže finally spolehlivě proběhne.
      const effectiveProfile =
        effectiveCalibratedTDEE !== undefined ? { ...profile, calibratedTDEE: effectiveCalibratedTDEE } : profile;
      const reply = await MyaAI.chatWithMya(effectiveProfile, history);
      saveChatMessage(user.uid, "assistant", reply);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!user) return;
    setConfirmingClear(false);
    await clearChatHistory(user.uid);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md h-[92dvh] sm:h-[80vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-white">Chat s Myou</h2>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => setConfirmingClear(true)}
                aria-label="Smazat historii chatu"
                className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {confirmingClear && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30 shrink-0">
            <p className="text-xs text-amber-700 dark:text-amber-400">Smazat celou historii chatu?</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setConfirmingClear(false)}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1"
              >
                Zrušit
              </button>
              <button
                onClick={handleClear}
                className="text-xs font-semibold text-white bg-red-500 rounded-lg px-3 py-1.5 active:scale-95 transition-all"
              >
                Smazat
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 && (
            <div className="max-w-[85%] bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">
              Ahoj! Zeptej se mě na cokoliv o výživě, cvičení nebo zdravém životním stylu.
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm whitespace-pre-wrap rounded-2xl ${
                  m.role === "user"
                    ? `text-white rounded-br-sm ${isFemale ? "bg-rose-600" : "bg-sky-600"}`
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Napiš zprávu Myi..."
            disabled={sending}
            className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm font-medium outline-rose-500 dark:text-white transition-all disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={`shrink-0 w-12 h-12 rounded-2xl text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all ${
              isFemale ? "bg-rose-600" : "bg-sky-600"
            }`}
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
