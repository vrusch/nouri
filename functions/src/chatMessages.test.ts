import { describe, expect, it } from "vitest";
import {
  MAX_ASSISTANT_MESSAGE_LENGTH,
  MAX_CHAT_HISTORY,
  MAX_USER_MESSAGE_LENGTH,
  parseChatMessages,
} from "./chatMessages.js";

describe("parseChatMessages", () => {
  it("platnou historii vrátí s oříznutými mezerami", () => {
    expect(
      parseChatMessages([
        { role: "user", content: "  Co mám dnes uvařit? " },
        { role: "assistant", content: "Třeba omeletu." },
      ])
    ).toEqual({
      ok: true,
      messages: [
        { role: "user", content: "Co mám dnes uvařit?" },
        { role: "assistant", content: "Třeba omeletu." },
      ],
    });
  });

  // REGRESE: odpověď Myi se třemi recepty má přes 2000 znaků. Funkce ji dřív v historii odmítla
  // (stejný limit jako pro uživatelku) a každá další zpráva v chatu skončila chybou "Mya právě
  // neodpovídá", dokud dlouhá odpověď nevypadla z okna posledních 20 zpráv.
  it("dlouhou odpověď Myi (3000 znaků) přijme", () => {
    const long = "a".repeat(3000);
    const result = parseChatMessages([
      { role: "user", content: "Mám doma vejce a tvaroh" },
      { role: "assistant", content: long },
      { role: "user", content: "Díky!" },
    ]);
    expect(result.ok && result.messages[1].content).toBe(long);
  });

  it("odpověď Myi nad limit ořízne, neodmítne", () => {
    const result = parseChatMessages([{ role: "assistant", content: "b".repeat(MAX_ASSISTANT_MESSAGE_LENGTH + 5000) }]);
    expect(result.ok && result.messages[0].content).toHaveLength(MAX_ASSISTANT_MESSAGE_LENGTH);
  });

  it("uživatelskou zprávu nad limit dál odmítne", () => {
    expect(parseChatMessages([{ role: "user", content: "a".repeat(3000) }])).toEqual({
      ok: false,
      error: "Neplatný obsah zprávy.",
    });
    expect(parseChatMessages([{ role: "user", content: "a".repeat(MAX_USER_MESSAGE_LENGTH) }]).ok).toBe(true);
  });

  it("odmítne prázdnou, příliš dlouhou nebo neplatnou historii", () => {
    expect(parseChatMessages(undefined)).toEqual({ ok: false, error: "Chybí zprávy." });
    expect(parseChatMessages([])).toEqual({ ok: false, error: "Chybí zprávy." });
    const tooMany = Array.from({ length: MAX_CHAT_HISTORY + 1 }, () => ({ role: "user", content: "ahoj" }));
    expect(parseChatMessages(tooMany)).toEqual({ ok: false, error: "Příliš dlouhá historie konverzace." });
    expect(parseChatMessages([{ role: "system", content: "ahoj" }])).toEqual({ ok: false, error: "Neplatná role zprávy." });
    expect(parseChatMessages([null])).toEqual({ ok: false, error: "Neplatná role zprávy." });
    expect(parseChatMessages([{ role: "assistant", content: "   " }])).toEqual({ ok: false, error: "Neplatný obsah zprávy." });
    expect(parseChatMessages([{ role: "user", content: 42 }])).toEqual({ ok: false, error: "Neplatný obsah zprávy." });
  });
});
