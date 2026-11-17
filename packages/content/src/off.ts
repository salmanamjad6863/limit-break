import type { FoodItem } from './schemas';

/**
 * Open Food Facts product → FoodItem (SYSTEMS.md §2.10). Data © Open Food Facts contributors, ODbL:
 * the app shows "Food data: Open Food Facts" wherever a barcode result appears.
 */
export const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';
export const offProductUrl = (barcode: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
/** Generic client name only — never user details (privacy). */
export const OFF_USER_AGENT = 'LimitBreak/0.1 (fitness app)';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function normalizeOffProduct(json: unknown): FoodItem | null {
  const j = json as { status?: number; product?: Record<string, unknown> } | null;
  const p = j?.product;
  if (!p || j?.status === 0) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) != null ? num(n['energy_100g'])! / 4.184 : null);
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  if (kcal == null || protein == null || carbs == null || fat == null || kcal > 902) return null; // incomplete label: let the user enter it
  const code = String(p.code ?? '');
  const name = String(p.product_name ?? '').trim() || 'Unnamed product';
  const brand = String(p.brands ?? '').split(',')[0]?.trim() || null;
  const servingG = num(p.serving_quantity);
  const servings = [
    ...(servingG && servingG > 0 && servingG < 2000 ? [{ label: String(p.serving_size ?? `1 serving (${servingG} g)`).slice(0, 40), grams: servingG }] : []),
    { label: '100 g', grams: 100 },
  ];
  return {
    id: `off:${code}`,
    name: name.slice(0, 120),
    brand: brand?.slice(0, 80) ?? null,
    per100: { kcal: Math.round(kcal), protein, carbs, fat, ...(num(n['fiber_100g']) != null ? { fiber: num(n['fiber_100g'])! } : {}) },
    servings,
    source: 'off',
    verified: false,
    barcode: code,
  };
}
