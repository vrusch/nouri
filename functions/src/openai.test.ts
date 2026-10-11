import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenAIChat } from "./openai.js";

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const tool = {
  type: "function" as const,
  function: { name: "navrhni_recepty", description: "Recepty", parameters: { type: "object", properties: {} } },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("callOpenAIChat", () => {
  it("vrátí text odpovědi a bez tools je do požadavku nepřidá", async () => {
    const fetchMock = mockFetch({ choices: [{ message: { content: "Ahoj" } }] });
    await expect(callOpenAIChat({ apiKey: "k", model: "m", messages: [] })).resolves.toEqual({ ok: true, content: "Ahoj" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.parallel_tool_calls).toBeUndefined();
  });

  it("volání nástroje s content null není prázdná odpověď", async () => {
    const fetchMock = mockFetch({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ function: { name: "navrhni_recepty", arguments: '{"ingredients":"vejce"}' } }],
          },
        },
      ],
    });
    await expect(callOpenAIChat({ apiKey: "k", model: "m", messages: [], tools: [tool] })).resolves.toEqual({
      ok: true,
      content: "",
      toolCall: { name: "navrhni_recepty", arguments: '{"ingredients":"vejce"}' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([tool]);
    expect(body.parallel_tool_calls).toBe(false);
  });

  it("bez textu i bez nástroje = empty_response, 429 = rate_limited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({ choices: [{ message: { content: null } }] });
    await expect(callOpenAIChat({ apiKey: "k", model: "m", messages: [] })).resolves.toEqual({
      ok: false,
      reason: "empty_response",
    });
    mockFetch({}, 429);
    await expect(callOpenAIChat({ apiKey: "k", model: "m", messages: [] })).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});
