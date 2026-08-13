export type ShareCardGender = "male" | "female";

export interface WeeklyShareCardData {
  periodStart: string; // ISO datum, první den týdne
  periodEnd: string; // ISO datum, poslední den týdne (dnešek)
  streak: number;
  avgCalories: number;
  daysLogged: number;
  trackableDays: number; // jmenovatel pro "X/Y dní zapsáno" — 7 minus dny ve volnu/dovolené, viz Stats.tsx
  weightChangeKg: number | null; // null = míň než 2 zápisy váhy v tomto týdnu
  gender: ShareCardGender;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

const MONTHS_CS_GENITIVE = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

function formatDateRangeCs(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const endLabel = `${end.getDate()}. ${MONTHS_CS_GENITIVE[end.getMonth()]} ${end.getFullYear()}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}.–${endLabel}`;
  }
  return `${start.getDate()}. ${MONTHS_CS_GENITIVE[start.getMonth()]} – ${endLabel}`;
}

// Stejné dvě cesty jako LogoIcon.tsx (bloom + jiskřička), přepsané do samostatného SVG
// dokumentu — explicitní xmlns a width/height (ne jen viewBox), jinak Chrome při načtení
// jako <img> rasterizuje na 0×0. encodeURIComponent, ne btoa — # v hex barvách by v syrovém
// data URL jinak ukončilo řetězec.
function buildLogoSvgDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="bloomGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FF9AB0" />
        <stop offset="100%" stop-color="#C43A5C" />
      </linearGradient>
      <linearGradient id="starGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FBC4D0" />
        <stop offset="100%" stop-color="#E14E72" />
      </linearGradient>
    </defs>
    <path d="M 15 80 L 15 35 C 15 10, 45 10, 45 35 L 45 65 C 45 90, 75 90, 75 65 L 75 25" fill="none" stroke="url(#bloomGradMain)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 88 5 Q 88 15 98 15 Q 88 15 88 25 Q 88 15 78 15 Q 88 15 88 5 Z" fill="url(#starGrad)" />
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const ACCENT_GRADIENTS: Record<ShareCardGender, [string, string]> = {
  female: ["#FB7185", "#9F1239"], // rose-400 -> rose-800
  male: ["#38BDF8", "#075985"], // sky-400 -> sky-800
};

const ACCENT_BLOOM: Record<ShareCardGender, string> = {
  female: "#FFE4E9",
  male: "#E0F2FE",
};

/**
 * Vykreslí týdenní sdílecí kartu (kalorie, streak, váhový posun) na canvas a vrátí PNG blob.
 * Ruční kreslení přes Canvas 2D API místo html2canvas/dom-to-image — appka žádnou takovou
 * závislost nemá a přidávat ji jen kvůli jedné kartě by šlo proti opakovanému důrazu na
 * velikost bundlu (viz PDF report). Formát 1080×1920 (9:16) — Instagram/WhatsApp Stories.
 */
export async function generateWeeklyShareCardBlob(data: WeeklyShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D kontext není dostupný");

  const [accentFrom, accentTo] = ACCENT_GRADIENTS[data.gender];

  // Pozadí — diagonální gradient v barvě akcentu podle pohlaví (stejná konvence jako zbytek appky).
  const bgGradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bgGradient.addColorStop(0, accentFrom);
  bgGradient.addColorStop(1, accentTo);
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Dekorativní rozmazané "bloom" kruhy na pozadí — odkaz na tvar loga, jemný, ne rušivý.
  const bloomCircle = (cx: number, cy: number, radius: number, alpha: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, ACCENT_BLOOM[data.gender] + Math.round(alpha * 255).toString(16).padStart(2, "0"));
    g.addColorStop(1, ACCENT_BLOOM[data.gender] + "00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  bloomCircle(CARD_WIDTH * 0.85, CARD_HEIGHT * 0.12, 420, 0.35);
  bloomCircle(CARD_WIDTH * 0.1, CARD_HEIGHT * 0.85, 380, 0.3);

  // Logo — bílý odznak pod ikonou, ať růžový/gradientní bloom vynikne na jakémkoliv pozadí.
  const logoImg = await loadImage(buildLogoSvgDataUrl());
  const badgeRadius = 76;
  const badgeCx = CARD_WIDTH / 2;
  const badgeCy = 190;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fill();
  const logoSize = 96;
  ctx.drawImage(logoImg, badgeCx - logoSize / 2, badgeCy - logoSize / 2, logoSize, logoSize);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 700 68px Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
  ctx.fillText("Nouri.", badgeCx, badgeCy + badgeRadius + 90);

  ctx.font = "500 34px -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Týdenní shrnutí", badgeCx, badgeCy + badgeRadius + 145);
  ctx.font = "400 30px -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(formatDateRangeCs(data.periodStart, data.periodEnd), badgeCx, badgeCy + badgeRadius + 190);

  // Statistické karty — "matné sklo" přes gradient, konzistentní vzhled napříč všemi třemi.
  const cardX = 90;
  const cardW = CARD_WIDTH - cardX * 2;
  const cardH = 260;
  const cardGap = 46;
  let cardY = 560;

  const statCard = (
    y: number,
    emoji: string,
    value: string,
    valueSuffix: string,
    label: string,
    sublabel?: string
  ) => {
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, cardX, y, cardW, cardH, 40);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, y, cardW, cardH, 40);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.font = "64px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(emoji, cardX + 56, y + 100);

    ctx.font = "800 84px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#ffffff";
    const valueWidth = ctx.measureText(value).width;
    ctx.fillText(value, cardX + 190, y + 118);

    ctx.font = "500 38px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(valueSuffix, cardX + 190 + valueWidth + 16, y + 118);

    ctx.font = "600 36px -apple-system, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(label, cardX + 190, y + 172);

    if (sublabel) {
      ctx.font = "400 30px -apple-system, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(sublabel, cardX + 190, y + 214);
    }
  };

  statCard(
    cardY,
    "🔥",
    String(data.streak),
    data.streak === 1 ? "den" : data.streak >= 2 && data.streak <= 4 ? "dny" : "dní",
    "V řadě zapsáno",
    data.streak > 0 ? "Bez přerušení" : "Dnes je dobrý den začít"
  );
  cardY += cardH + cardGap;

  statCard(
    cardY,
    "🍽️",
    String(data.avgCalories),
    "kcal/den",
    "Průměrný příjem",
    `${data.daysLogged}/${data.trackableDays} dní zapsáno`
  );
  cardY += cardH + cardGap;

  const weightValue = data.weightChangeKg === null ? "—" : `${data.weightChangeKg > 0 ? "+" : ""}${data.weightChangeKg}`;
  const weightSuffix = data.weightChangeKg === null ? "" : "kg";
  const weightSublabel = data.weightChangeKg === null ? "Zatím málo dat za tento týden" : "Za tento týden";
  statCard(cardY, "⚖️", weightValue, weightSuffix, "Váhový posun", weightSublabel);

  ctx.textAlign = "center";
  ctx.font = "400 28px -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("Zaznamenáno v appce Nouri", CARD_WIDTH / 2, CARD_HEIGHT - 70);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Vykreslení karty selhalo"))), "image/png");
  });
}
