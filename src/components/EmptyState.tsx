import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text: string;
  // Kvantifikovaná varianta (REFERENCE/DATA_COMPLETENESS_PLAN.md, B2) — pro featury s číselným
  // prahem (kalibrace, vzorce příjmu), kde appka umí říct "X ze Y", ne jen "zatím nic tu není".
  progress?: { current: number; target: number; label?: string };
}

export default function EmptyState({ icon, title, text, progress }: EmptyStateProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4 transition-colors">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 dark:text-rose-400">
        {icon}
      </div>
      <div className="w-full">
        <h2 className="font-bold text-slate-800 dark:text-white mb-1">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
      </div>
      {progress && (
        <div className="w-full max-w-40 space-y-1.5">
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 dark:bg-rose-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {progress.label ?? `${progress.current} z ${progress.target}`}
          </p>
        </div>
      )}
    </div>
  );
}
