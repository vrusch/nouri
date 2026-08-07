import { ChefHat } from "lucide-react";

export default function Recipes() {
  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">AI Recepty</h1>

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4 transition-colors">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 dark:text-blue-400">
          <ChefHat className="w-7 h-7" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800 dark:text-white mb-1">Připravujeme</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Mya časem naučí navrhovat recepty na míru tvým makrům a tomu, co ti dnes ještě zbývá sníst. Zatím se soustředíme na zápis jídel a přehledy.
          </p>
        </div>
      </div>
    </div>
  );
}
