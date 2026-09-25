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

// Průběžné tempo pití (REFERENCE/STRICT_COACHING_SPEC.md, A4) — appka čeká, že se denní cíl
// rozloží rovnoměrně mezi 8:00 a 20:00. Před 8:00 nečeká nic, po 20:00 celý cíl.
const WATER_PACE_START_HOUR = 8;
const WATER_PACE_END_HOUR = 20;

export interface WaterPaceStatus {
  expectedGlasses: number;
  glassesBehind: number;
  behind: boolean;
}

/**
 * Kolik sklenic by touhle dobou "mělo" být vypito a jestli skluz dosáhl prahu. Práh závisí na
 * stylu Myi (getWaterBehindThreshold v coachingStyle.ts) — přísná připomíná hned po první
 * chybějící sklenici. Očekávaný počet se zaokrouhluje dolů, ať appka nikdy nečeká sklenici,
 * na kterou ještě reálně nebyl čas.
 */
export function computeWaterPaceStatus(
  glasses: number,
  now: Date = new Date(),
  behindThreshold: number = 2,
  target: number = WATER_TARGET_GLASSES
): WaterPaceStatus {
  const hourFraction = now.getHours() + now.getMinutes() / 60;
  const dayProgress = Math.min(
    1,
    Math.max(0, (hourFraction - WATER_PACE_START_HOUR) / (WATER_PACE_END_HOUR - WATER_PACE_START_HOUR))
  );
  const expectedGlasses = Math.floor(dayProgress * target);
  const glassesBehind = Math.max(0, expectedGlasses - glasses);
  return { expectedGlasses, glassesBehind, behind: behindThreshold > 0 && glassesBehind >= behindThreshold };
}
