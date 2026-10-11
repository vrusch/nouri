// Historie chatu od klienta (MyaChatModal posílá posledních 20 zpráv z users/{uid}/chatMessages)
// je nedůvěryhodný vstup — validuje se délka pole i každá zpráva zvlášť.
//
// Uživatelská zpráva nad limit se odmítne. Odpověď Myi ne: od 2026-10-11 umí chat navrhnout
// tři recepty (CHAT_RECIPE_RULE v index.ts) a taková odpověď má klidně přes 2000 znaků. Když
// ji funkce dřív v historii odmítla, každá další zpráva skončila chybou, dokud dlouhá odpověď
// nevypadla z okna 20 zpráv — chat byl na deset výměn rozbitý. Odpověď Myi má proto vyšší limit
// a co je nad ním, se ořízne, nikdy neodmítne.

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export const MAX_CHAT_HISTORY = 20;
export const MAX_USER_MESSAGE_LENGTH = 2000;
export const MAX_ASSISTANT_MESSAGE_LENGTH = 6000;

export type ChatMessagesResult = { ok: true; messages: ChatMessageInput[] } | { ok: false; error: string };

export function parseChatMessages(raw: unknown): ChatMessagesResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Chybí zprávy." };
  if (raw.length > MAX_CHAT_HISTORY) return { ok: false, error: "Příliš dlouhá historie konverzace." };

  const messages: ChatMessageInput[] = [];
  for (const item of raw as unknown[]) {
    const entry = item as { role?: unknown; content?: unknown } | null;
    const role = entry?.role;
    const content = entry?.content;
    if (role !== "user" && role !== "assistant") return { ok: false, error: "Neplatná role zprávy." };
    if (typeof content !== "string" || !content.trim()) return { ok: false, error: "Neplatný obsah zprávy." };
    const trimmed = content.trim();
    if (role === "user") {
      if (trimmed.length > MAX_USER_MESSAGE_LENGTH) return { ok: false, error: "Neplatný obsah zprávy." };
      messages.push({ role, content: trimmed });
    } else {
      messages.push({ role, content: trimmed.slice(0, MAX_ASSISTANT_MESSAGE_LENGTH) });
    }
  }
  return { ok: true, messages };
}
