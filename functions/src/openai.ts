const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAIChatMessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

export interface OpenAIChatMessage {
  // string, ne literal union "system"|"user"|"assistant" — chatWithMya sestavuje apiMessages
  // mapováním z ChatMessageInput (role odvozená za běhu), ne z fresh literálů jako ostatní
  // volající, a literal union by tam TS widening zbytečně rozbil.
  role: string;
  content: OpenAIChatMessageContent;
}

interface OpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object";
  // Jen chatWithMya (karty receptů). Model smí zavolat nejvýš jeden nástroj — appka výsledek
  // nástroje modelu nevrací, jen podle volání spustí vlastní generování (viz index.ts).
  tools?: OpenAITool[];
}

export interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OpenAIToolCall {
  name: string;
  arguments: string;
}

export type OpenAIChatResult =
  | { ok: true; content: string; toolCall?: OpenAIToolCall }
  | { ok: false; reason: "rate_limited" }
  | { ok: false; reason: "empty_response" };

// N17 v REFERENCE/AUDIT_2026-08-14.md — fetch/error-handling/response-parsing kostra byla
// doslovně zkopírovaná ve 14 Cloud Functions. Tenhle helper sdílí jen mechanickou část (HTTP
// volání + vytažení choices[0].message.content); co appka udělá s výsledkem/chybou (throw vs.
// fallback text, které přesně) si každá funkce řeší sama v index.ts — to se mezi funkcemi liší
// a refaktoring to nemá sjednocovat.
export async function callOpenAIChat(options: OpenAIChatOptions): Promise<OpenAIChatResult> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
      ...(options.tools ? { tools: options.tools, tool_choice: "auto", parallel_tool_calls: false } : {}),
    }),
  });

  if (response.status === 429) {
    return { ok: false, reason: "rate_limited" };
  }

  const json = (await response.json()) as {
    choices?: {
      message: { content: string | null; tool_calls?: { function?: { name?: string; arguments?: string } }[] };
    }[];
  };
  const message = json.choices?.[0]?.message;
  const content = message?.content;
  // Při volání nástroje je content null — to není prázdná odpověď.
  const toolFunction = message?.tool_calls?.[0]?.function;
  if (toolFunction?.name) {
    return { ok: true, content: content ?? "", toolCall: { name: toolFunction.name, arguments: toolFunction.arguments ?? "{}" } };
  }
  if (!content) {
    console.error("OpenAI response missing content:", response.status, JSON.stringify(json));
    return { ok: false, reason: "empty_response" };
  }
  return { ok: true, content };
}
