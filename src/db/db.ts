import Dexie, { type EntityTable } from 'dexie';

export interface MealItem {
  id?: number;
  name: string;
  value: number; // Kalorie
  time: string;
  date: string; // ISO format (YYYY-MM-DD)
  type: "breakfast" | "lunch" | "dinner" | "snack";
}

const db = new Dexie('NouriDB') as Dexie & {
  meals: EntityTable<MealItem, 'id'>;
};

// Schéma pro tabulku jídla
db.version(1).stores({
  meals: '++id, name, date, type'
});

export { db };
