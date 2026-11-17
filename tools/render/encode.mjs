#!/usr/bin/env node
/**
 * Encode rendered frames into app-ready WebP files (VISUALS.md §3.5), within budget:
 *   loop/side: animated WebP with alpha, ≤ 400 KB (quality steps down until it fits)
 *   thumb:     still WebP of the hardest position, 240×240, ≤ 25 KB
 *
 *   node tools/render/encode.mjs --ids push-up,plank [--trainer a] [--approved-by XY]
 *
 * Tier 1 → apps/mobile/assets/exercises/<id>/ (bundled; regenerates the bundle map)
 * Tier 2 → tools/render/dist/exercises/<id>/ (upload to Supabase Storage)
 * Both   → keys written into packages/content/src/data/exercise-media.json
 * Needs libwebp tools (img2webp, cwebp): free, BSD licence. macOS: brew install webp
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MANIFEST = join(ROOT, 'packages/content/src/data/exercise-media.json');
const BUNDLE_DIR = join(ROOT, 'apps/mobile/assets/exercises');
const DIST = join(HERE, 'dist/exercises');
const LOOP_MAX = 400_000;
const THUMB_MAX = 25_000;

const arg = (name, def = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
const kb = (n) => `${(n / 1000).toFixed(0)} KB`;

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const ids = arg('ids').split(',').filter(Boolean);
if (!ids.length) {
  console.error('usage: node tools/render/encode.mjs --ids push-up,plank [--trainer a] [--approved-by XY]');
  process.exit(2);
}
for (const tool of ['img2webp', 'cwebp']) {
  try { execFileSync('which', [tool], { stdio: 'ignore' }); } catch { console.error(`missing ${tool}: brew install webp`); process.exit(2); }
}

let bundled = false;
for (const id of ids) {
  const jobFile = join(HERE, 'out', id, 'job.json');
  if (!existsSync(jobFile)) throw new Error(`${id}: no render found (run render_exercise.py first)`);
  const job = JSON.parse(readFileSync(jobFile, 'utf8'));
  const trainer = arg('trainer', job.trainers[0]);
  const entry = manifest[id] ?? (manifest[id] = { tier: 2 });
  const dest = entry.tier === 1 ? join(BUNDLE_DIR, id) : join(DIST, id);
  mkdirSync(dest, { recursive: true });
  const frameMs = String(Math.round((1000 / job.fps) * (job.preview ? 2 : 1)));

  for (const angle of job.angles) {
    const dir = join(HERE, 'out', id, trainer, angle);
    const frames = readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f));
    if (!frames.length) throw new Error(`${id}/${angle}: no frames in ${dir}`);
    const file = join(dest, angle === 'front' || job.angles.length === 1 ? 'loop.webp' : `${angle}.webp`);
    // step quality down until the loop fits the budget
    let q = 80;
    for (;;) {
      run('img2webp', ['-loop', '0', '-lossy', '-q', String(q), '-m', '6', '-d', frameMs, ...frames, '-o', file]);
      const size = statSync(file).size;
      if (size <= LOOP_MAX || q <= 35) {
        console.log(`${id} ${angle}: ${frames.length} frames, q${q}, ${kb(size)}${size > LOOP_MAX ? '  ⚠ over budget: shorten the loop or drop to 12 fps' : ''}`);
        break;
      }
      q -= 8;
    }
    if (angle === job.angles[0]) {
      const pick = frames[Math.min(frames.length - 1, Math.max(0, Math.round((job.thumbFrame - job.frames[0]) / (job.preview ? 2 : 1))))];
      const thumb = join(dest, 'thumb.webp');
      let tq = 80;
      do {
        run('cwebp', ['-quiet', '-q', String(tq), '-resize', '240', '240', '-alpha_q', '90', pick, '-o', thumb]);
        tq -= 10;
      } while (statSync(thumb).size > THUMB_MAX && tq > 30);
      console.log(`${id} thumb: ${kb(statSync(thumb).size)}`);
    }
  }

  // manifest keys (paths relative to the media CDN; bundled files are found by the generated map)
  const has = (n) => existsSync(join(dest, n));
  if (has('loop.webp')) entry.loop = `exercises/${id}/loop.webp`;
  if (has('side.webp')) entry.side = `exercises/${id}/side.webp`;
  if (has('thumb.webp')) entry.thumb = `exercises/${id}/thumb.webp`;
  entry.trainer = [...new Set([...(entry.trainer ?? []), trainer])];
  entry.source = job.source;
  const approver = arg('approved-by');
  if (approver) entry.approvedBy = approver;
  if (entry.tier === 1) bundled = true;
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
console.log(`updated ${MANIFEST.replace(ROOT + '/', '')}`);
if (bundled) execFileSync('node', [join(ROOT, 'apps/mobile/scripts/bundle-media.mjs')], { stdio: 'inherit' });
