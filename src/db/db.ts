import Dexie, { type EntityTable } from 'dexie';

export interface MealItem {
  id?: number;
  name: string;
  value: number; // Kalorie
  time: string;
  date: string; // ISO format (YYYY-MM-DD)
  type: "breakfast" | "lunch" | "dinner" | "snack";
  protein?: number; // g
  fat?: number; // g
  carbs?: number; // g
  source?: "photo" | "manual";
  roughEstimate?: boolean; // zapsáno v režimu "Jím venku" — hodnoty jsou záměrně hrubý odhad, ne měřená data
  syncId?: string; // stabilní UUID pro cloud zálohu (na rozdíl od ++id přežije reset lokální DB)
}

const db = new Dexie('NouriDB') as Dexie & {
  meals: EntityTable<MealItem, 'id'>;
};

// Schéma pro tabulku jídla
db.version(1).stores({
  meals: '++id, name, date, type'
});

db.version(2).stores({
  meals: '++id, name, date, type, syncId'
});

export { db };
