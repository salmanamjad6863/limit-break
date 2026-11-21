#!/usr/bin/env node
/**
 * Builds the curated food catalog (packages/content/src/data/foods.json → `foods`) from
 * USDA FoodData Central (SR Legacy + Foundation, public domain). Nutrient values and household
 * portions are read from the FDC CSV release; nothing is typed by hand except the short display
 * name, the group and (sometimes) which FDC portions to show. `recipes` are left untouched.
 *
 *   node tools/foods/import-fdc.mjs            # download (cached) + regenerate foods.json
 *   node tools/foods/import-fdc.mjs --check    # report only, write nothing
 *
 * The food list lives in ./catalog.mjs. Each entry names an exact FDC description; a typo fails
 * the run and prints the closest descriptions, so a value can never be guessed.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../packages/content/src/data/foods.json');
const CACHE = join(HERE, '.cache');
const DATASETS = {
  sr: 'FoodData_Central_sr_legacy_food_csv_2018-04',
  fd: 'FoodData_Central_foundation_food_csv_2025-04-24',
};
const CHECK = process.argv.includes('--check');
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------------- download + CSV ---------------- */

function ensureDataset(name) {
  const dir = join(CACHE, name);
  if (existsSync(dir) && findCsv(dir, 'food.csv')) return dir;
  mkdirSync(dir, { recursive: true });
  const zip = join(CACHE, `${name}.zip`);
  if (!existsSync(zip)) {
    console.log(`downloading ${name}.zip …`);
    execFileSync('curl', ['-fsSL', '-o', zip, `https://fdc.nal.usda.gov/fdc-datasets/${name}.zip`], { stdio: 'inherit' });
  }
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
  return dir;
}

/** The zips nest their CSVs one folder down; find a file wherever it landed. */
function findCsv(dir, file) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === file) return p;
    if (e.isDirectory()) { const hit = findCsv(p, file); if (hit) return hit; }
  }
  return null;
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Streams a CSV as objects; `keep` filters rows early so the 36 MB nutrient file stays cheap. */
async function readCsv(path, keep = () => true) {
  const rows = [];
  let head = null;
  for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    if (!line) continue;
    const cells = parseLine(line);
    if (!head) { head = cells; continue; }
    const row = Object.fromEntries(head.map((h, i) => [h, cells[i]]));
    if (keep(row)) rows.push(row);
  }
  return rows;
}

/* ---------------- nutrients ---------------- */

const N = {
  kcal: ['1008', '2048', '2047'], // Energy (kcal); Foundation often only has the Atwater energies
  protein: ['1003'],
  carbs: ['1005', '1050'], // by difference; by summation as fallback
  fat: ['1004', '1085'],
  fiber: ['1079'],
};
const WANTED = new Set(Object.values(N).flat());

/* ---------------- portions ---------------- */

const FRACTIONS = { 0.125: '1/8', 0.25: '1/4', 0.33: '1/3', 0.333: '1/3', 0.5: '1/2', 0.66: '2/3', 0.667: '2/3', 0.75: '3/4', 1.5: '1 1/2' };
const fmtAmount = (a) => FRACTIONS[Math.round(a * 1000) / 1000] ?? FRACTIONS[Math.round(a * 100) / 100] ?? String(Math.round(a * 100) / 100);
/** Units a person logs by; ounces/pounds are dropped because grams are always available. */
const SKIP = /(^|\W)(oz|ounces?|lbs?|pounds?|g|grams?|kg|NLEA serving|serving|package|container|recipe|yield|quart|pint|gallon|fl oz)(\W|$)/i;

function portionLabel(p, units) {
  const amount = Number(p.amount) || 1;
  const unit = units.get(p.measure_unit_id);
  let text = [unit && unit !== 'undetermined' ? unit : '', p.portion_description, p.modifier]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .join(' ');
  text = text
    .replace(/\([^)]*(\d|"|dia|long|wide)[^)]*\)/gi, '') // dimensions: 'medium (7" to 7-7/8" long)'
    .replace(/\btablespoons?\b/gi, 'tbsp')
    .replace(/\bteaspoons?\b/gi, 'tsp')
    .replace(/\bcups?\b/gi, 'cup')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim();
  if (!text) return null;
  return `${fmtAmount(amount)} ${text}`;
}

/* ---------------- main ---------------- */

const dirs = Object.fromEntries(Object.entries(DATASETS).map(([k, name]) => [k, ensureDataset(name)]));
const units = new Map();
const byDesc = { sr: new Map(), fd: new Map() };
for (const [ds, dir] of Object.entries(dirs)) {
  for (const u of await readCsv(findCsv(dir, 'measure_unit.csv'))) units.set(u.id, u.name);
  const isFoundation = ds === 'fd' ? new Set((await readCsv(findCsv(dir, 'foundation_food.csv'))).map((r) => r.fdc_id)) : null;
  for (const f of await readCsv(findCsv(dir, 'food.csv'))) {
    if (isFoundation && !isFoundation.has(f.fdc_id)) continue;
    byDesc[ds].set(f.description, Number(f.fdc_id));
  }
}

/** Closest descriptions for a miss (shared-word score), so a typo is quick to fix. */
function suggest(ds, desc) {
  const words = new Set(desc.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean));
  return [...byDesc[ds].keys()]
    .map((d) => [d, d.toLowerCase().split(/[^a-z0-9%]+/).filter((w) => words.has(w)).length - d.length / 400])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([d]) => d);
}

const errors = [];
const resolved = catalog.map((e) => {
  const ds = e.fd ? 'fd' : 'sr';
  const desc = e.fd ?? e.sr;
  const fdcId = byDesc[ds].get(desc);
  if (!fdcId) errors.push(`${e.id}: no ${ds === 'fd' ? 'Foundation' : 'SR Legacy'} food "${desc}"\n    did you mean: ${suggest(ds, desc).map((s) => `"${s}"`).join(' | ')}`);
  const portionsFrom = e.portionsFrom ? byDesc.sr.get(e.portionsFrom) : null;
  if (e.portionsFrom && !portionsFrom) errors.push(`${e.id}: no SR Legacy food "${e.portionsFrom}" for portions`);
  return { ...e, ds, desc, fdcId, portionsFrom };
});
const ids = new Set();
for (const e of resolved) {
  if (ids.has(e.id)) errors.push(`duplicate id ${e.id}`);
  ids.add(e.id);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const needed = new Set(resolved.flatMap((e) => [String(e.fdcId), e.portionsFrom ? String(e.portionsFrom) : '']).filter(Boolean));
const nutrients = new Map();
const portions = new Map();
for (const dir of Object.values(dirs)) {
  for (const r of await readCsv(findCsv(dir, 'food_nutrient.csv'), (r) => needed.has(r.fdc_id) && WANTED.has(r.nutrient_id))) {
    if (!nutrients.has(r.fdc_id)) nutrients.set(r.fdc_id, new Map());
    nutrients.get(r.fdc_id).set(r.nutrient_id, Number(r.amount));
  }
  for (const r of await readCsv(findCsv(dir, 'food_portion.csv'), (r) => needed.has(r.fdc_id))) {
    if (!portions.has(r.fdc_id)) portions.set(r.fdc_id, []);
    portions.get(r.fdc_id).push(r);
  }
}

const previous = JSON.parse(readFileSync(OUT, 'utf8'));
const prevById = new Map(previous.foods.map((f) => [f.id, f]));
const warnings = [];

const foods = resolved.map((e) => {
  const n = nutrients.get(String(e.fdcId)) ?? new Map();
  const per100 = {};
  for (const [k, list] of Object.entries(N)) {
    const id = list.find((x) => n.has(x));
    if (id === undefined && k !== 'fiber') throw new Error(`${e.id}: FDC ${e.fdcId} has no ${k}`);
    per100[k] = id === undefined ? 0 : n.get(id);
  }

  let servings = e.servings;
  if (!servings) {
    const raw = (portions.get(String(e.portionsFrom ?? e.fdcId)) ?? [])
      .sort((a, b) => Number(a.seq_num) - Number(b.seq_num))
      .map((p) => ({ label: portionLabel(p, units), grams: Math.round(Number(p.gram_weight) * 10) / 10 }))
      .filter((s) => s.label && s.grams > 0 && s.grams < 1000 && !SKIP.test(s.label.replace(/^[\d/ .]+/, '')));
    const unique = raw.filter((s, i) => raw.findIndex((x) => x.label === s.label) === i);
    const pick = e.portions
      ? e.portions.map((re) => unique.find((s) => new RegExp(re, 'i').test(s.label))).filter(Boolean)
      : unique.slice(0, 3);
    if (e.portions && pick.length < e.portions.length) warnings.push(`${e.id}: portion pattern(s) unmatched; FDC has ${unique.map((s) => s.label).join(' | ') || 'none'}`);
    servings = [...pick, ...(e.extra ?? [])];
    if (!servings.length) servings = [{ label: '100 g', grams: 100 }];
  }

  const prev = prevById.get(e.id);
  const same = prev && prev.fdcId === e.fdcId && JSON.stringify(prev.per100) === JSON.stringify(per100);
  const out = { id: e.id, name: e.name, group: e.group, per100, servings, usda: e.desc };
  if (e.ds === 'fd') out.dataset = 'foundation';
  out.fdcId = e.fdcId;
  if (e.popularity !== undefined) out.popularity = e.popularity;
  out.checkedAt = same && prev.checkedAt ? prev.checkedAt : TODAY;

  // Same sanity rule as the content tests: label energy vs fiber-adjusted Atwater, ±15%.
  if (per100.kcal >= 20) {
    const est = 4 * per100.protein + 4 * (per100.carbs - per100.fiber) + 9 * per100.fat + 2 * per100.fiber;
    if (Math.abs(per100.kcal - est) / per100.kcal >= 0.15) warnings.push(`${e.id}: kcal ${per100.kcal} vs Atwater ${est.toFixed(0)}`);
  }
  return out;
});

for (const id of prevById.keys()) if (!ids.has(id)) warnings.push(`existing id ${id} is no longer in the catalog`);
const recipeMissing = previous.recipes.flatMap((r) => r.ingredients.filter((i) => !ids.has(i.food)).map((i) => `${r.id} → ${i.food}`));
if (recipeMissing.length) errors.push(`recipe ingredients missing: ${recipeMissing.join(', ')}`);

const byGroup = foods.reduce((m, f) => ({ ...m, [f.group]: (m[f.group] ?? 0) + 1 }), {});
console.log(`${foods.length} foods (${foods.filter((f) => f.dataset).length} Foundation, rest SR Legacy):`, byGroup);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!CHECK) {
  writeFileSync(OUT, JSON.stringify({ foods, recipes: previous.recipes }, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
}
