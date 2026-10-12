import { describe, expect, it } from "vitest";
import { MAX_MYA_MEMORY_LENGTH, parseMyaMemoryForm } from "./myaMemory";
import { MAX_MEMORY_LENGTH as SERVER_MAX_MEMORY_LENGTH } from "../../functions/src/userStory";

const TODAY = "2026-10-12";

describe("parseMyaMemoryForm", () => {
  it("vyplněný formulář → pole profilu, desetinná čárka u váhy", () => {
    expect(parseMyaMemoryForm({ startWeight: "115,4", startDate: "2026-03-10", memory: "  Nemám ráda tvaroh. " }, TODAY)).toEqual({
      ok: true,
      fields: { journeyStartWeight: 115.4, journeyStartDate: "2026-03-10", myaMemory: "Nemám ráda tvaroh." },
    });
  });

  it("prázdná pole = undefined (z profilu se smažou)", () => {
    expect(parseMyaMemoryForm({ startWeight: " ", startDate: "", memory: "\n" }, TODAY)).toEqual({
      ok: true,
      fields: { journeyStartWeight: undefined, journeyStartDate: undefined, myaMemory: undefined },
    });
  });

  it("nesmyslná váha nebo budoucí datum = chyba", () => {
    expect(parseMyaMemoryForm({ startWeight: "abc", startDate: "", memory: "" }, TODAY).ok).toBe(false);
    expect(parseMyaMemoryForm({ startWeight: "15", startDate: "", memory: "" }, TODAY).ok).toBe(false);
    expect(parseMyaMemoryForm({ startWeight: "", startDate: "2026-12-01", memory: "" }, TODAY).ok).toBe(false);
  });

  it("dlouhý text ořízne na limit, který sedí se serverem", () => {
    expect(MAX_MYA_MEMORY_LENGTH).toBe(SERVER_MAX_MEMORY_LENGTH);
    const result = parseMyaMemoryForm({ startWeight: "", startDate: "", memory: "x".repeat(5000) }, TODAY);
    expect(result.ok && result.fields.myaMemory?.length).toBe(MAX_MYA_MEMORY_LENGTH);
  });
});
