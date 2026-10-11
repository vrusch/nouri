// analyzeFood bere až MAX_FOOD_PHOTOS fotek JEDNOHO jídla (jiný úhel, detail, etiketa) kvůli
// přesnějšímu rozpoznání. Nový klient posílá `imageDataUrls`, starší build appky (PWA
// v mobilu může chvíli běžet na starém bundlu) jen jedno `imageDataUrl` — obojí platí.
// Klient počet hlídá sám, server proto nic potichu neořezává: víc fotek = neplatný vstup.

export const MAX_FOOD_PHOTOS = 3;

const isImageDataUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:image/");

/** Platné fotky z request.data, nebo null (volající vrátí invalid-argument). */
export function parseFoodImages(data: unknown): string[] | null {
  const input = (data ?? {}) as { imageDataUrls?: unknown; imageDataUrl?: unknown };
  if (input.imageDataUrls !== undefined) {
    const urls = input.imageDataUrls;
    if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_FOOD_PHOTOS) return null;
    return urls.every(isImageDataUrl) ? urls : null;
  }
  return isImageDataUrl(input.imageDataUrl) ? [input.imageDataUrl] : null;
}
