import type { UserProfile } from "../context/AuthContext";
import { calculateAge, type NutritionResults } from "./nutrition";
import { MEASUREMENT_LABELS_CS, type MeasurementField } from "./bodyMeasurements";
import type { MonthlyReportData } from "./report";
import ptSansRegularUrl from "../assets/fonts/PTSans-Regular.ttf?url";
import ptSansBoldUrl from "../assets/fonts/PTSans-Bold.ttf?url";

const GOAL_LABELS_CS: Record<UserProfile["goal"], string> = {
  lose: "Hubnutí",
  maintain: "Udržování váhy",
  gain: "Nabírání svalů",
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 18;
const BOTTOM_MARGIN = 22;

// jsPDF vestavěné fonty (helvetica/times/courier) neumí českou diakritiku (ř, š, ě, ů…) —
// appka proto vkládá vlastní font. PT Sans stažený jen jako podmnožina Latin + Latin-1 +
// Latin Extended-A (přes Google Fonts `text=` API), ne celá rodina — ušetří ~90 % velikosti
// oproti plnému fontu, appka žádný jiný skript (azbuku, řečtinu…) nikdy nepotřebuje.
async function fetchFontBase64(url: string): Promise<string> {
  const buffer = await fetch(url).then((r) => r.arrayBuffer());
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192; // String.fromCharCode(...bytes) na celém poli by u větších fontů přeteklo call stack
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatDateCs(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}. ${m}. ${y}`;
}

/**
 * Vygeneruje a rovnou stáhne formální PDF report za posledních N dní — o úroveň
 * formálnější než CSV export (FEATURE_IDEAS.md sekce 9), use case "beru si to na
 * kontrolu" k lékaři/nutričnímu poradci. jsPDF i vložený font se importují dynamicky
 * (ne staticky nahoře v souboru), ať appka neplatí ~470 kB do hlavního bundlu za funkci,
 * kterou většina návštěv appky vůbec nespustí — stáhne se, jen když se report opravdu vygeneruje.
 */
export async function downloadMonthlyReportPdf(
  profile: UserProfile,
  nutrition: NutritionResults,
  data: MonthlyReportData
): Promise<void> {
  const [{ default: jsPDF }, regularBase64, boldBase64] = await Promise.all([
    import("jspdf"),
    fetchFontBase64(ptSansRegularUrl),
    fetchFontBase64(ptSansBoldUrl),
  ]);

  const doc = new jsPDF();
  doc.addFileToVFS("PTSans-Regular.ttf", regularBase64);
  doc.addFont("PTSans-Regular.ttf", "PTSans", "normal");
  doc.addFileToVFS("PTSans-Bold.ttf", boldBase64);
  doc.addFont("PTSans-Bold.ttf", "PTSans", "bold");

  let y = 20;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > PAGE_HEIGHT - BOTTOM_MARGIN) {
      doc.addPage();
      y = 20;
    }
  };

  const heading = (text: string) => {
    ensureSpace(20);
    doc.setFont("PTSans", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(text, MARGIN_X, y);
    y += 5;
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y);
    y += 6;
  };

  const row = (label: string, value: string) => {
    ensureSpace(6);
    doc.setFont("PTSans", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(label, MARGIN_X, y);
    doc.setFont("PTSans", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(value, PAGE_WIDTH - MARGIN_X, y, { align: "right" });
    y += 6;
  };

  const note = (text: string) => {
    ensureSpace(8);
    doc.setFont("PTSans", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(text, MARGIN_X, y);
    y += 6;
  };

  // Hlavička
  doc.setFont("PTSans", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Nouri - výživový report", MARGIN_X, y);
  y += 8;
  doc.setFont("PTSans", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const todayIso = new Date().toISOString().split("T")[0];
  doc.text(
    `Vygenerováno ${formatDateCs(todayIso)} · období ${formatDateCs(data.periodStart)} - ${formatDateCs(data.periodEnd)}`,
    MARGIN_X,
    y
  );
  y += 12;

  // Osobní údaje
  heading("Osobní údaje");
  row("Jméno", profile.name || "-");
  row("Věk", `${calculateAge(profile.birthDate)} let`);
  row("Výška", `${profile.height} cm`);
  row("Aktuální váha", `${profile.weight} kg`);
  row("Cíl", GOAL_LABELS_CS[profile.goal]);
  y += 4;

  // Nutriční cíle
  heading("Denní nutriční cíle");
  row("Bazální metabolismus (BMR)", `${nutrition.bmr} kcal`);
  row("Celkový denní výdej (TDEE)", `${nutrition.tdee} kcal`);
  row("Cílový příjem", `${nutrition.targetCalories} kcal`);
  row("Bílkoviny", `${nutrition.macros.protein} g`);
  row("Tuky", `${nutrition.macros.fat} g`);
  row("Sacharidy", `${nutrition.macros.carbs} g`);
  y += 4;

  // Přehled za období
  heading(`Přehled za posledních ${data.daysInPeriod} dní`);
  row("Zapsáno dní", `${data.daysLogged} z ${data.daysInPeriod}`);
  if (data.daysLogged > 0) {
    row("Průměrný denní příjem", `${data.avgCalories} kcal`);
    row("Průměrné bílkoviny", `${data.avgProtein} g`);
    row("Průměrné tuky", `${data.avgFat} g`);
    row("Průměrné sacharidy", `${data.avgCarbs} g`);
  } else {
    note("V tomto období nejsou zapsaná žádná jídla.");
  }
  y += 4;

  // Trend váhy
  heading("Trend váhy");
  if (data.weightStart !== null && data.weightEnd !== null && data.weightChangeKg !== null) {
    row("Váha na začátku období", `${data.weightStart} kg`);
    row("Váha na konci období", `${data.weightEnd} kg`);
    const sign = data.weightChangeKg > 0 ? "+" : "";
    row("Změna", `${sign}${data.weightChangeKg} kg`);
  } else {
    note("V tomto období není dost záznamů váhy.");
  }
  y += 4;

  // Míry těla (jen pokud v období vůbec nějaké jsou)
  const measurementFields = Object.keys(data.measurements) as MeasurementField[];
  if (measurementFields.length > 0) {
    heading("Míry těla");
    for (const field of measurementFields) {
      const trend = data.measurements[field]!;
      const deltaText = trend.delta !== null ? ` (${trend.delta > 0 ? "+" : ""}${trend.delta} cm)` : "";
      row(MEASUREMENT_LABELS_CS[field], `${trend.latest} cm${deltaText}`);
    }
    y += 4;
  }

  // Patička
  ensureSpace(14);
  doc.setFont("PTSans", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Automaticky vygenerováno appkou Nouri z dat zadaných uživatelkou. Neslouží jako lékařská diagnóza.",
    MARGIN_X,
    y,
    { maxWidth: PAGE_WIDTH - MARGIN_X * 2 }
  );

  doc.save(`nouri-report-${data.periodEnd}.pdf`);
}
