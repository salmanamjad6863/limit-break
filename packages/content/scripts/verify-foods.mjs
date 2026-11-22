#!/usr/bin/env node
/**
 * Spot-checks curated foods against the live USDA FoodData Central API and records the fdcId.
 * The catalog itself is generated offline from the FDC CSV release by tools/foods/import-fdc.mjs.
 *
 *   USDA_API_KEY=xxxx node packages/content/scripts/verify-foods.mjs [--ids a,b] [--write]
 *
 * A free key from api.data.gov allows 1,000 requests/hour; without one, DEMO_KEY allows ~10.
 * --write replaces our values with USDA's and marks the food checked (fdcId + checkedAt).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../src/data/foods.json');
const KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : ''; };
const write = process.argv.includes('--write');
const ids = arg('ids').split(',').filter(Boolean);
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const NUT = { kcal: ['Energy', 'KCAL'], protein: ['Protein', 'G'], carbs: ['Carbohydrate, by difference', 'G'], fat: ['Total lipid (fat)', 'G'], fiber: ['Fiber, total dietary', 'G'] };

let bad = 0;
for (const f of data.foods.filter((x) => !ids.length || ids.includes(x.id))) {
  const dataType = encodeURIComponent({ foundation: 'Foundation', fndds: 'Survey (FNDDS)' }[f.dataset] ?? 'SR Legacy');
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${KEY}&dataType=${dataType}&pageSize=10&query=${encodeURIComponent(f.usda.replace(/[/%(),]/g, " "))}`;
  const res = await fetch(url);
  const left = res.headers.get('x-ratelimit-remaining');
  if (!res.ok) { console.error(`${f.id}: HTTP ${res.status}${left === '0' ? ' (rate limit: set USDA_API_KEY)' : ''}`); break; }
  const json = await res.json();
  const hit = json.foods.find((x) => x.description.toLowerCase() === f.usda.toLowerCase());
  if (!hit) { console.log(`✗ ${f.id}: no exact USDA match for "${f.usda}"`); bad++; continue; }
  const usda = {};
  for (const [k, [name, unit]] of Object.entries(NUT)) {
    const n = hit.foodNutrients.find((x) => x.nutrientName === name && x.unitName === unit);
    usda[k] = n ? n.value : 0;
  }
  const diffs = Object.keys(NUT).filter((k) => Math.abs((f.per100[k] ?? 0) - usda[k]) > Math.max(0.5, 0.03 * usda[k]));
  console.log(`${diffs.length ? '≠' : '✓'} ${f.id} (fdc ${hit.fdcId})${diffs.map((k) => `  ${k}: ours ${f.per100[k]} vs USDA ${usda[k]}`).join('')}  [${left} left]`);
  if (diffs.length) bad++;
  if (write) Object.assign(f, { per100: usda, fdcId: hit.fdcId, checkedAt: new Date().toISOString().slice(0, 10) });
  if (left === '0') { console.error('rate limit reached: set USDA_API_KEY for the rest'); break; }
}
if (write) writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
console.log(bad ? `${bad} food(s) differ or are missing${write ? ' (USDA values written)' : ''}` : 'all checked foods match USDA');
