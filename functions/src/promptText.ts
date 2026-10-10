const DEFAULT_MAX_PROMPT_TEXT_LENGTH = 300;

// Ořeže délku a odstraní řádkové zlomy z volného textu, který appka posílá do promptu (jméno,
// hint, popis jídla/tréninku, preference, suroviny z lednice, názvy jídel v kontextu chatu...) —
// appku dnes používá jen jedna autentizovaná uživatelka, takže reálné riziko je nízké (nanejvýš
// by obešla vlastní UI a poslala funkci upravený vstup přímo), ale sdílený limit je levnější než
// ho nechat bez hranic, zvlášť tam, kde text jde do SYSTÉMOVÉ části promptu (viz profile.name
// a kontext dne v chatWithMya). Vlastní modul (dřív uvnitř index.ts), ať ho může použít i
// chatContext.ts. undefined vstup (nepovinné pole) i prázdný/jen-mezerový text appka mapuje na
// undefined, ať volající strana může použít stejný `?.trim()` fallback jako dřív.
export function sanitizePromptText(value: unknown, maxLength: number = DEFAULT_MAX_PROMPT_TEXT_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\r\n]+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}
