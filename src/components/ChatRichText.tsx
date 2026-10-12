import { classifyReportLine, splitBoldSegments } from "../lib/aiReportMarkdown";

// Odpověď Myi v bublině chatu (MYA_COACH_SPEC 5.6) — stejná podmnožina markdownu jako AI report
// v Profilu: nadpis "###", **tučně** a odrážka "-"/"*". Prompt (RICH_TEXT_RULE ve
// functions/src/chatPrompt.ts) smí povolit jen to, co umí tenhle renderer — mění se spolu.
// Starší zprávy v čistém textu se vykreslí stejně jako dřív (odstavce a odrážky pomlčkou).
export default function ChatRichText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const { kind, text: content } = classifyReportLine(line);
        if (kind === "blank") return <div key={i} className="h-1.5" />;
        const inline = splitBoldSegments(content).map((segment, j) =>
          segment.bold ? (
            <strong key={j} className="font-bold text-slate-800 dark:text-white">
              {segment.text}
            </strong>
          ) : (
            <span key={j}>{segment.text}</span>
          )
        );
        if (kind === "header") {
          return (
            <p key={i} className="font-bold text-slate-800 dark:text-white pt-1">
              {inline}
            </p>
          );
        }
        if (kind === "bullet") {
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-slate-400">•</span>
              <span className="min-w-0">{inline}</span>
            </div>
          );
        }
        return <p key={i}>{inline}</p>;
      })}
    </div>
  );
}
