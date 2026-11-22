#!/usr/bin/env node
/**
 * Builds the curated food catalog (packages/content/src/data/foods.json → `foods`) from
 * USDA FoodData Central (SR Legacy + Foundation + FNDDS survey foods, all public domain). Nutrient values and household
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
  /** FNDDS: mixed and regional dishes SR Legacy lacks (paneer, dal, samosa, biryani, dosa …) */
  sv: 'FoodData_Central_survey_food_csv_2024-10-31',
};
const DATASET_NAME = { sr: 'SR Legacy', fd: 'Foundation', sv: 'FNDDS' };
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
  alcohol: ['1018'], // 7 kcal/g; only beer, wine and spirits carry it
};
const WANTED = new Set(Object.values(N).flat());

/* ---------------- portions ---------------- */

const FRACTIONS = { 0.125: '1/8', 0.2: '1/5', 0.25: '1/4', 0.33: '1/3', 0.333: '1/3', 0.5: '1/2', 0.66: '2/3', 0.667: '2/3', 0.75: '3/4', 1.5: '1 1/2' };
const fmtAmount = (a) => FRACTIONS[Math.round(a * 1000) / 1000] ?? FRACTIONS[Math.round(a * 100) / 100] ?? String(Math.round(a * 100) / 100);
/**
 * Portions whose unit is a weight or a bare "serving" are dropped (grams are always available);
 * a volume in fl oz is kept only as a container's size, e.g. "1 can (12 fl oz)".
 */
const SKIP = /^(oz|ounces?|lbs?|pounds?|g|grams?|kg|fl oz|quart|pint|gallon|NLEA serving|serving|recipe|yields?)\b/i;
/** FDC portions nobody logs by: whole roasts/heads/bunches, melted or crushed volumes, survey placeholders. */
const UNHELPFUL = /not specified|guideline|surface inch|cubic inch|\bunit\b|\broast\b|\bbunch\b|\bhead\b|\bmelted\b|\bcrushed\b|\border\b|servings? per|\byields?\b|refuse|with skin and bone|\bchild\b/i;
const OUNCE = /^[\d/ .]+(oz|ounces?)\b/i;

function portionLabel(p, units) {
  // FNDDS puts the whole household measure in portion_description ("1 cup", "1 piece") and a
  // numeric code in modifier; SR Legacy/Foundation split it into amount + unit + modifier.
  if (!p.amount && /^\d/.test(p.portion_description || '')) return cleanLabel(p.portion_description);
  const amount = Number(p.amount) || 1;
  const unit = units.get(p.measure_unit_id);
  const modifier = /^\d+$/.test(p.modifier || '') ? '' : p.modifier; // FNDDS: numeric portion code
  let text = [unit && unit !== 'undetermined' ? unit : '', p.portion_description, modifier]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .filter((s, i, a) => a.indexOf(s) === i)
    .join(' ');
  text = cleanLabel(text);
  if (!text) return null;
  // SR writes label-style servings as "serving 1/2 cup" / "serving 2 TBSP": the measure is the label
  const served = /^serving\s+(\d[\d/.]*\s+.+)$/i.exec(text);
  if (served && amount === 1) return served[1];
  return `${fmtAmount(amount)} ${text}`;
}

function cleanLabel(text) {
  return text
    .replace(/\(([^)]*)\)/g, (m, inner) => (/fl oz|ml\b/i.test(inner) ? m : /\d|"|dia|long|wide/i.test(inner) ? '' : m)) // drop dimensions, keep "(12 fl oz)"
    .replace(/\btablespoons?\b|\bTBSP\b/gi, 'tbsp')
    .replace(/\bteaspoons?\b|\bTSP\b/gi, 'tsp')
    .replace(/\bcups?\b/gi, 'cup')
    .replace(/\b(\w+) \1\b/gi, '$1') // "can can 12 fl oz"
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim()
    .replace(/^([\d/ ]+)([A-Z])(?=[a-z])/, (_, n, c) => n + c.toLowerCase()); // "1 Potato" → "1 potato"
}

/* ---------------- main ---------------- */

const dirs = Object.fromEntries(Object.entries(DATASETS).map(([k, name]) => [k, ensureDataset(name)]));
const units = new Map();
const byDesc = { sr: new Map(), fd: new Map(), sv: new Map() };
for (const [ds, dir] of Object.entries(dirs)) {
  for (const u of await readCsv(findCsv(dir, 'measure_unit.csv'))) units.set(u.id, u.name);
  // the Foundation zip also carries its sample/sub-sample rows; keep only the published foods
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
  const ds = e.fd ? 'fd' : e.sv ? 'sv' : 'sr';
  const desc = e.fd ?? e.sv ?? e.sr;
  const fdcId = byDesc[ds].get(desc);
  if (!fdcId) errors.push(`${e.id}: no ${DATASET_NAME[ds]} food "${desc}"\n    did you mean: ${suggest(ds, desc).map((s) => `"${s}"`).join(' | ')}`);
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
for (const [ds, dir] of Object.entries(dirs)) {
  // FNDDS keys food_nutrient by the legacy nutrient number (208 = energy), not the FDC id (1008).
  const toId = new Map();
  if (ds === 'sv') for (const n of await readCsv(findCsv(dir, 'nutrient.csv'))) toId.set(String(Math.round(Number(n.nutrient_nbr))), n.id);
  const nid = (r) => toId.get(r.nutrient_id) ?? r.nutrient_id;
  for (const r of await readCsv(findCsv(dir, 'food_nutrient.csv'), (r) => needed.has(r.fdc_id) && WANTED.has(nid(r)))) {
    if (!nutrients.has(r.fdc_id)) nutrients.set(r.fdc_id, new Map());
    nutrients.get(r.fdc_id).set(nid(r), Number(r.amount));
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
    if (id === undefined && k !== 'fiber' && k !== 'alcohol') throw new Error(`${e.id}: FDC ${e.fdcId} has no ${k}`);
    per100[k] = id === undefined ? 0 : n.get(id);
  }
  if (!per100.alcohol) delete per100.alcohol;

  let servings = e.servings;
  if (!servings) {
    const all = (portions.get(String(e.portionsFrom ?? e.fdcId)) ?? [])
      .sort((a, b) => Number(a.seq_num) - Number(b.seq_num))
      .map((p) => ({ label: portionLabel(p, units), grams: Math.round(Number(p.gram_weight) * 10) / 10 }))
      .filter((s) => s.label && s.grams > 0 && s.grams < 1000);
    const raw = all.filter((s) => !SKIP.test(s.label.replace(/^[\d/ .]+/, '')) && !UNHELPFUL.test(s.label));
    const unique = raw.filter((s, i) => raw.findIndex((x) => x.label === s.label) === i);
    const pick = e.portions
      ? e.portions.map((re) => unique.find((s) => new RegExp(re, 'i').test(s.label))).filter(Boolean)
      : unique.filter((s) => s.grams <= 500).slice(0, e.ml ? 2 : 3);
    // a food with only "3 oz"-style portions still gets that one household measure
    if (!pick.length && !e.portions) {
      const oz = all.find((s) => OUNCE.test(s.label));
      if (oz) pick.push({ label: `1 serving (${oz.label})`, grams: oz.grams });
    }
    // drinks: a glass / can sized from FDC's own density (its fl oz or cup portion)
    for (const [label, ml] of e.ml ?? []) {
      const floz = all.find((s) => /^1 fl oz$/i.test(s.label)) ?? all.find((s) => /^1 cup\b/i.test(s.label));
      if (!floz) { warnings.push(`${e.id}: no fl oz / cup portion to size "${label}"`); continue; }
      const perMl = floz.grams / (/fl oz/.test(floz.label) ? 29.5735 : 236.588);
      pick.push({ label, grams: Math.round(perMl * ml) });
    }
    if (e.portions && pick.length < e.portions.length) warnings.push(`${e.id}: portion pattern(s) unmatched; FDC has ${unique.map((s) => s.label).join(' | ') || 'none'}`);
    servings = [...pick, ...(e.extra ?? [])];
    if (!servings.length) servings = [{ label: '100 g', grams: 100 }];
  }

  const prev = prevById.get(e.id);
  const same = prev && prev.fdcId === e.fdcId && JSON.stringify(prev.per100) === JSON.stringify(per100);
  const out = { id: e.id, name: e.name, group: e.group, per100, servings, usda: e.desc };
  if (e.ds !== 'sr') out.dataset = e.ds === 'fd' ? 'foundation' : 'fndds';
  out.fdcId = e.fdcId;
  if (e.popularity !== undefined) out.popularity = e.popularity;
  out.checkedAt = same && prev.checkedAt ? prev.checkedAt : TODAY;

  // Same sanity rule as the content tests: label energy vs fiber-adjusted Atwater, ±15%.
  if (per100.kcal >= 40) {
    const est = 4 * per100.protein + 4 * (per100.carbs - per100.fiber) + 9 * per100.fat + 2 * per100.fiber + 7 * (per100.alcohol ?? 0);
    if (Math.abs(per100.kcal - est) / per100.kcal >= 0.15) warnings.push(`${e.id}: kcal ${per100.kcal} vs Atwater ${est.toFixed(0)}`);
  }
  return out;
});

const seen = new Map();
for (const f of foods) {
  if (seen.has(f.fdcId)) warnings.push(`${f.id} uses the same FDC food as ${seen.get(f.fdcId)}`);
  else seen.set(f.fdcId, f.id);
}
for (const id of prevById.keys()) if (!ids.has(id)) warnings.push(`existing id ${id} is no longer in the catalog`);
const recipeMissing = previous.recipes.flatMap((r) => r.ingredients.filter((i) => !ids.has(i.food)).map((i) => `${r.id} → ${i.food}`));
if (recipeMissing.length) errors.push(`recipe ingredients missing: ${recipeMissing.join(', ')}`);

const byGroup = foods.reduce((m, f) => ({ ...m, [f.group]: (m[f.group] ?? 0) + 1 }), {});
const count = (d) => foods.filter((f) => f.dataset === d).length;
console.log(`${foods.length} foods (${count('foundation')} Foundation, ${count('fndds')} FNDDS, rest SR Legacy):`, byGroup);
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!CHECK) {
  writeFileSync(OUT, JSON.stringify({ foods, recipes: previous.recipes }, null, 1) + '\n');
  console.log(`\nwrote ${OUT}`);
}
