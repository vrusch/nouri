// Rozpozná strukturu jednoho řádku AI reportu (Profile.tsx, generateWelcomeReport) — odděleno
// jako pure funkce, ať jde otestovat bez renderovacího harness (appka žádný nemá). Systémový
// prompt slibuje "**tučný text** pro klíčové hodnoty" (functions/src/index.ts), ale starší
// renderer rozeznal odrážku jen podle `line.startsWith('*')` — řádek začínající `**text**` se
// omylem vykreslil jako odrážka a substring(1) odstranil jen jednu hvězdičku (B10 v
// AUDIT_2026-08-13.md). `**` proto appka kontroluje před jednoduchou `*`/`-` odrážkou.
export type ReportLineKind = "header" | "bullet" | "blank" | "paragraph";

export interface ClassifiedReportLine {
  kind: ReportLineKind;
  text: string; // marker (###, odrážka) oříznutý; pro paragraph/blank beze změny
}

export function classifyReportLine(line: string): ClassifiedReportLine {
  if (line.trim() === "") return { kind: "blank", text: "" };
  if (line.startsWith("###")) return { kind: "header", text: line.replace("###", "").trim() };
  if (line.startsWith("**")) return { kind: "paragraph", text: line };
  if (line.startsWith("*") || line.startsWith("-")) return { kind: "bullet", text: line.substring(1).trim() };
  return { kind: "paragraph", text: line };
}

export interface TextSegment {
  text: string;
  bold: boolean;
}

// Rozsekání jednoho řádku (typicky classifyReportLine's `text`) na tučné/normální úseky podle
// párů `**...**`. Nepárová hvězdička appku nikdy nesmí zaseknout na "všechno od téhle chvíle je
// tučné" — bez uzavírajícího páru appka celý zbytek bere jako obyčejný text.
export function splitBoldSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = boldPattern.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  if (segments.length === 0) segments.push({ text, bold: false });

  return segments;
}
