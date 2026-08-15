import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { useAuth } from "../context/useAuth";
import {
  addShoppingListItems,
  removeShoppingListItem,
  subscribeShoppingList,
  toggleShoppingListItem,
  type ShoppingListEntry,
} from "../lib/cloudSync";
import ShoppingListView from "./ShoppingListView";

interface ShoppingListModalProps {
  onClose: () => void;
}

export default function ShoppingListModal({ onClose }: ShoppingListModalProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ShoppingListEntry[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeShoppingList(user.uid, setItems);
  }, [user]);

  // N44 (AUDIT_2026-08-14.md) — modály v appce dřív zavíral jen klik na X/backdrop, na rozdíl
  // od BottomNav.tsx's FAB menu, který na Escape reaguje.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleAdd = async () => {
    const trimmed = input.trim();
    if (!trimmed || !user) return;
    setInput("");
    await addShoppingListItems(user.uid, [{ text: trimmed }]);
  };

  const handleToggle = (item: ShoppingListEntry) => {
    if (!user) return;
    toggleShoppingListItem(user.uid, item.id, !item.bought);
  };

  const handleRemove = (item: ShoppingListEntry) => {
    if (!user) return;
    removeShoppingListItem(user.uid, item.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md h-[85dvh] sm:h-[75vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-white">Nákupní seznam</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Přidat položku..."
            className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm font-medium outline-rose-500 dark:text-white transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={!input.trim()}
            className="shrink-0 w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <ShoppingListView items={items} onToggle={handleToggle} onRemove={handleRemove} />
        </div>
      </div>
    </div>
  );
}
