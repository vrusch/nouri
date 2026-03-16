export default function Recipes() {
  return (
    <div className="space-y-6 pt-6 transition-colors">
      <h1 className="text-2xl font-bold tracking-tight dark:text-slate-100">AI Recepty</h1>
      <div className="grid grid-cols-1 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 h-48 relative flex items-end p-6 transition-colors">
            {/* Zástupný obrázek s gradientem */}
            <div className="absolute inset-0 bg-linear-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 opacity-50 transition-colors"></div>
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent"></div>
            <div className="relative text-white">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-300">Tip pro tebe</span>
              <h3 className="text-lg font-bold">Zdravý recept #{i}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
