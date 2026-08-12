import { ShoppingCart, X } from "lucide-react";
import type { ShoppingListEntry } from "../lib/cloudSync";
import { CUSTOM_ITEMS_LABEL } from "../lib/shoppingList";
import EmptyState from "./EmptyState";

interface ShoppingListViewProps {
  items: ShoppingListEntry[];
  onToggle: (item: ShoppingListEntry) => void;
  onRemove: (item: ShoppingListEntry) => void;
}

// Sdíleno mezi Recepty (nákupní seznam navázaný na recepty) a ShoppingListModal (ruční
// položky) — obojí žije ve stejné Firestore kolekci (viz cloudSync.ts), tohle je jediné
// vykreslení seznamu, ať appka nikdy neukáže ve dvou místech jinak seskupený stejný seznam.
export default function ShoppingListView({ items, onToggle, onRemove }: ShoppingListViewProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="w-7 h-7" />}
        title="Seznam je prázdný"
        text="Přidej položku ručně, nebo vygeneruj recept a přidej jeho suroviny."
      />
    );
  }

  const groups = new Map<string, ShoppingListEntry[]>();
  items.forEach((item) => {
    const groupName = item.recipeName ?? CUSTOM_ITEMS_LABEL;
    const group = groups.get(groupName) ?? [];
    group.push(item);
    groups.set(groupName, group);
  });

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([groupName, groupItems]) => (
        <div
          key={groupName}
          className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 transition-colors"
        >
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{groupName}</h3>
          <ul className="space-y-2.5">
            {groupItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.bought}
                  onChange={() => onToggle(item)}
                  className="w-5 h-5 rounded accent-rose-600 shrink-0"
                />
                <span
                  className={`flex-1 text-sm ${
                    item.bought ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => onRemove(item)}
                  className="p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
