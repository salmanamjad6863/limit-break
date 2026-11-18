# LIMITBREAK — Avatar & Story Visuals Plan

> Product + production plan for hunter identity, suits, and story key art.
> Tech detail for Forge lives in [VISUALS.md](../VISUALS.md) §7. This file is the **style bible, pipeline, monetization, and checklist**.

## 0. Status — PENDING (Nov 2026)

**Avatar Forge is parked.** Do not ship `/forge` or cosmetics UI until we have a proper layered art pass (VRoid PNG layers or equivalent). Home + Profile identity stays **`HeroEmblem`** (onboarding sigil).

Scaffold kept for later: migration **0015_avatar**, `/avatar` API, Essence mint on workouts, `cosmetics.json`, mobile `features/avatar/*`. Re-open this doc when art is ready — not before.

## 1. Two products (do not conflate)

| Product | Job | Surface |
|---|---|---|
| **Story panels** | Emotion / onboarding / rest-day lore (like competitor “Heart Health Risk → Time to Change” screens) | Full-bleed illustration + headline |
| **Avatar Forge** | Daily identity + cosmetics economy | Layered hunter on Home, Profile, License, Community |

Story panels are commissioned (or carefully art-directed) key art. The Forge is a **layered 2D compositor** fed by VRoid renders — not a third-party avatar SaaS.

## 2. Style bible (Phase A — lock before mass production)

**Look:** modern manhwa / System-hunter — dark atmosphere, high-contrast rim light, electric auras. Cool secondary palette; accent = hero class colour.

**Canon rules**
- Original IP only. No copied faces, hair+outfit combos, or signature props from existing anime.
- Same **¾ standing pose** for every Forge layer (compositor alignment).
- Transparent PNG layers; aura is often a live Skia layer (see `<AuraLayer>`), not baked into every outfit.
- AI tools: **moodboards and backgrounds only**. Final faces / hero portraits / Forge bases are human-locked (VRoid + optional commission pass).

**Forbidden in Forge art**
- Photoreal skin or AI “same-face” drift across items.
- Weapons that imply real combat sports branding.
- Text baked into layers (titles/frames are UI).

## 3. Pipeline

```
Style bible (this doc)
    ↓
VRoid Studio (built-in parts / our textures only) → VRM
    ↓
Blender + VRM add-on → fixed camera, toon shade, export PNG layers
    ↓
packages/content cosmetics.json (id, slot, price, locks, tint/shape or layer asset keys)
    ↓
App: Skia HunterAvatar compositor (+ AuraLayer)
```

Optional: one VGen/Skeb pass on six hero **key portraits** + onboarding story pack.

**Avoid:** Ready Player Me (shut down). Treat Genies as a last-resort dependency — Expo + original IP favor the owned pipeline.

## 4. Economy

| Currency | Earn | Spend |
|---|---|---|
| **AP** | Levels | Skill Tree only |
| **Essence** | Training / quests / streaks (cap ~60/day) | Forge items only |

- Essence **never** buys XP, stats, or rank.
- **Earn path:** most cosmetics free via Essence + rank/class locks.
- **Pay path (later, IAP):** non-consumable suit packs; optional Essence packs (must not expire). No paid loot boxes without odds disclosure.
- Premium sub may add *exclusive rotating* sets; earned inventory is never revoked.

## 5. Slots

`aura` → `hairBack` (optional) → `body` → `outfit` → `accessory` → `hair` → `prop` → `frame`

Base body + default hair + starter outfit are **free** at first Forge open.

## 6. Engineering checklist (V4)

- [x] `docs/AVATAR.md` (this file)
- [x] `cosmetics.json` + Zod + content tests
- [x] Prisma: `essence` on HunterState, `EssenceLedger`, `CosmeticOwned`, `AvatarLoadout` (migration **0015_avatar**)
- [x] API `/avatar` — catalog view, inventory, equip, buy, Essence balance
- [x] Grant Essence on workout finish (+10, idempotent, daily cap 60)
- [ ] Mobile Forge UI (parked — no `/forge` route until art is ready)
- [x] Home + Profile identity = onboarding `HeroEmblem` only (Forge not linked)
- [ ] IAP suit packs (after RevenueCat / Sprint S)
- [ ] VRoid PNG layer swap (replace procedural shapes)
- [ ] Story onboarding panel pack

## 7. Content checklist (art)

| # | Asset | Owner | Status |
|---|---|---|---|
| 1 | Style bible locked | Design | In progress |
| 2 | Male + female base body layers | VRoid | **AI draft:** male portraits in `apps/mobile/assets/avatar/` (not true layers yet) |
| 3 | 3 hair / 3 outfit / 2 aura / 2 frame starters | VRoid | **AI draft:** 3 outfits + 2 auras wired; hair/frame still tint / ring |
| 4 | First 40 catalog items | Pipeline | After pose lock |
| 5 | Onboarding story pack (5–7 panels) | Commission / AI draft | **1 panel:** `assets/story/awakening-heart.jpg` |
| 6 | Six hero key portraits | Commission optional | Not started |

### AI draft pack (look-dev only)
| File | Maps to |
|---|---|
| `hunter-training.jpg` | `outfit-training` |
| `hunter-shadow-coat.jpg` | `outfit-shadow-coat` |
| `hunter-iron.jpg` | `outfit-iron` |
| `aura-spirit.jpg` / `aura-ember.jpg` | aura overlays |
| `story/awakening-heart.jpg` | onboarding story concept |

Replace with VRoid-aligned transparent PNGs before store; keep AI for moodboards and story concepts unless a human art pass locks faces.

## 8. Definition of done (Forge MVP)

- Hunter can open Forge, see Essence, buy a free/paid (Essence) item, equip it, and see it on Home/Profile.
- Offline: last loadout composites from cached content + local query cache.
- No pay-to-win. No public weight/calories on avatar or License.
