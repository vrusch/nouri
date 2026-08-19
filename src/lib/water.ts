export const WATER_TARGET_GLASSES = 8;

/**
 * Objem jedné sklenice. Slouží JEN k zobrazení (litrový přepočet v kartě Vody na Home) — appka
 * dál ukládá do waterLogs počet sklenic přes atomický increment() (viz adjustWaterGlasses
 * v cloudSync.ts), ne mililitry. Změna téhle konstanty proto nemění ani neznehodnocuje žádná
 * historická data, jen popisek. 8 × 250 ml = 2 l, tedy standardní "dva litry denně".
 */
export const WATER_GLASS_ML = 250;

export function getWaterProgressPercent(glasses: number, target: number = WATER_TARGET_GLASSES): number {
  return Math.min(100, Math.round((glasses / target) * 100));
}

/**
 * Objem daného počtu sklenic česky — pod litr v mililitrech ("250 ml"), od litru výš v litrech
 * s desetinnou čárkou a bez zbytečných nul ("2 l", "1,5 l"). Bez tohohle popisku appka nikde
 * neřekla, co vlastně "sklenice" znamená.
 */
export function formatWaterVolumeCs(glasses: number, glassMl: number = WATER_GLASS_ML): string {
  const ml = Math.round(glasses * glassMl);
  if (ml < 1000) return `${ml} ml`;
  // toFixed(2) + ořez koncových nul: 2000 → "2", 1500 → "1,5", 1750 → "1,75".
  const liters = (ml / 1000).toFixed(2).replace(/\.?0+$/, "");
  return `${liters.replace(".", ",")} l`;
}
