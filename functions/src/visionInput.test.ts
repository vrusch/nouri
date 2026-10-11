import { describe, expect, it } from "vitest";
import { parseFoodImages } from "./visionInput.js";

const img = (n: number) => `data:image/jpeg;base64,${n}`;

describe("parseFoodImages", () => {
  it("vezme 1–3 fotky z imageDataUrls", () => {
    expect(parseFoodImages({ imageDataUrls: [img(1)] })).toEqual([img(1)]);
    expect(parseFoodImages({ imageDataUrls: [img(1), img(2), img(3)] })).toEqual([img(1), img(2), img(3)]);
  });

  it("starší klient s jedním imageDataUrl dál funguje", () => {
    expect(parseFoodImages({ imageDataUrl: img(1) })).toEqual([img(1)]);
  });

  it("nový klient posílá obě pole — platí imageDataUrls", () => {
    expect(parseFoodImages({ imageDataUrl: img(1), imageDataUrls: [img(1), img(2)] })).toEqual([img(1), img(2)]);
  });

  it("víc než 3 fotky, prázdné pole nebo ne-obrázek odmítne", () => {
    expect(parseFoodImages({ imageDataUrls: [img(1), img(2), img(3), img(4)] })).toBeNull();
    expect(parseFoodImages({ imageDataUrls: [] })).toBeNull();
    expect(parseFoodImages({ imageDataUrls: [img(1), "https://example.com/a.jpg"] })).toBeNull();
    expect(parseFoodImages({ imageDataUrls: img(1) })).toBeNull();
    expect(parseFoodImages({ imageDataUrl: "text" })).toBeNull();
    expect(parseFoodImages({})).toBeNull();
    expect(parseFoodImages(undefined)).toBeNull();
  });
});
