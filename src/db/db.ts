import Dexie, { type EntityTable } from 'dexie';

// Rozpad složeného jídla na ingredience (FEATURE_IDEAS.md sekce 14) — jedna položka rozpadu,
// stejný tvar jako MealItem's kalorie/makra, jen bez data/času/typu (ty patří jídlu jako celku).
export interface MealIngredient {
  name: string;
  value: number; // Kalorie
  protein?: number; // g
  fat?: number; // g
  carbs?: number; // g
}

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
  // Když appka rozpad ingrediencí má, name/value/protein/fat/carbs nahoře zůstávají dopočítaným
  // součtem (viz computeIngredientsTotals v lib/mealComponents.ts) — jediný zdroj pravdy pro
  // cokoliv, co jídla sčítá napříč appkou (Stats, Home, report, CSV export...), zůstává nedotčené,
  // protože o existenci ingredients vůbec neví. Bez Dexie schema bumpu — appka indexuje jen pole
  // v db.version(N).stores() níž, ostatní pole (stejně jako protein/fat/carbs/roughEstimate už dnes)
  // fungují bez deklarace v žádné verzi schématu.
  ingredients?: MealIngredient[];
}

export interface WorkoutItem {
  id?: number;
  name: string;
  caloriesBurned: number;
  durationMinutes?: number;
  time: string;
  date: string; // ISO format (YYYY-MM-DD)
  syncId?: string; // stabilní UUID pro cloud zálohu, stejný vzor jako MealItem
}

const db = new Dexie('NouriDB') as Dexie & {
  meals: EntityTable<MealItem, 'id'>;
  workouts: EntityTable<WorkoutItem, 'id'>;
};

// Schéma pro tabulku jídla
db.version(1).stores({
  meals: '++id, name, date, type'
});

db.version(2).stores({
  meals: '++id, name, date, type, syncId'
});

// Trénink (Fitness modul, FEATURE_IDEAS.md sekce 1) — nová tabulka, meals zůstává beze
// změny (Dexie zachová schéma tabulek nezmíněných v novější verzi).
db.version(3).stores({
  workouts: '++id, name, date, syncId'
});

export { db };
