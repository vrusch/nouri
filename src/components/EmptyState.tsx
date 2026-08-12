import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text: string;
}

export default function EmptyState({ icon, title, text }: EmptyStateProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4 transition-colors">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 dark:text-rose-400">
        {icon}
      </div>
      <div>
        <h2 className="font-bold text-slate-800 dark:text-white mb-1">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
