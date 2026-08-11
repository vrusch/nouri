export const WATER_TARGET_GLASSES = 8;

export function getWaterProgressPercent(glasses: number, target: number = WATER_TARGET_GLASSES): number {
  return Math.min(100, Math.round((glasses / target) * 100));
}
