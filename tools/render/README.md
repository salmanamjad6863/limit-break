# Trainer render toolkit ($0)

Turns trainer motions into the app's exercise loops (VISUALS.md §3). Every tool here is free.

| Step | Tool | Output |
|---|---|---|
| 1. Trainer model | VRoid Studio — **built-in parts only** | `assets-src/trainer/trainer-a.vrm`, `trainer-b.vrm` |
| 2. Rig | Export the VRoid model as FBX, upload it to **Mixamo** for auto-rig | trainer on the Mixamo skeleton |
| 3. Stage | Blender + VRM Add-on: toon/outline materials, `CAM_front` + `CAM_side`, lights, floor shadow catcher | `assets-src/trainer/stage.blend` |
| 4. Motions | Mixamo (download *without skin*, 24 fps) **or** coach video → Rokoko Vision → retarget to the Mixamo skeleton with Rokoko's free Blender add-on **or** hand-key | `assets-src/motions/<id>.fbx` |
| 5. Job | Add the exercise to `jobs.json`: loop frame range, thumbnail frame, angles, source | — |
| 6. Render | `blender -b assets-src/trainer/stage.blend --python tools/render/render_exercise.py -- --ids <id>` (add `--preview` for a fast half-res look) | `tools/render/out/<id>/…/*.png` (transparent) |
| 7. Encode | `node tools/render/encode.mjs --ids <id> --approved-by <coach initials>` | Tier 1 → bundled in the app · Tier 2 → `tools/render/dist/` for Supabase Storage · manifest updated |
| 8. Check | Open **`/dev/aura`** in a dev build: the clip plays over the live aura in every state and rank | Coach sign-off (VISUALS.md §3.6) |

## Stage file rules (lock these once, then never change them)
- Armatures are named `Trainer_A` and `Trainer_B`. Cameras are named `CAM_front` (front ¾) and `CAM_side`.
- Background is **transparent**. Never render an aura or glow into the clip: the app draws it live behind the trainer.
- Keep the camera height, lens and distance identical for every exercise. Feet sit on the same floor line, where the aura's ground ring appears.
- Unilateral moves are rendered on the **left side** only; the app mirrors them for the right.
- Loop check: the first and last frames of `frames` must be the same pose (no visible jump).

## Budgets (the encoder enforces them)
- Loop ≤ 400 KB: quality steps down automatically and it warns if a clip still won't fit (shorten the loop or render at 12 fps).
- Thumbnail ≤ 25 KB · bundled Tier 1 total ≤ 25 MB (`pnpm --filter @lb/mobile media:bundle` fails above that).

## Licence log
`encode.mjs` writes `source` (mixamo, rokoko-vision, mocap or hand-keyed) and `approvedBy` into `exercise-media.json` for every clip. Never commit raw Mixamo FBX files to a public place: we ship rendered clips only.

Requires: Blender 4.2+ (free), Node 22, libwebp tools (`brew install webp`, BSD licence).
