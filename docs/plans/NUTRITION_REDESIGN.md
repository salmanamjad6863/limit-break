# Nutrition Redesign: Plan

Goal: logging food should feel instant, obvious and calm. The tab should look as premium as Train, Home and Quests.

## 1. Tested today (iPhone simulator, signed-in account)

| Feature | Result | Problem |
|---|---|---|
| Search "eggs" | ❌ | Only the omelette shows. Plural words don't match "Egg, whole" (search needs every query word to be a word prefix). |
| Typing in search | ⚠️ | Each keystroke blanks the list to "Searching…" before results return (no previous results kept). |
| Add 2 eggs to Breakfast | ✅ | Works; totals update. The entry reads "2 × 1 large egg". |
| Edit to 3× | ⚠️ | Saves, but the diary shows the old numbers for ~2 s (it waits on the server, then refetches). |
| Water + tapped twice | ❌ | Only one glass is saved: the second tap is based on the stale value. The label shows "0.0 L". |
| Complete day, Copy yesterday | ⚠️ | Work, with the same ~2 s lag. |
| Portion | ⚠️ | Quantities stop at 3× (no 4 eggs); the meal picker uses a different accent colour. |
| Food catalog | ⚠️ | 62 curated foods + 9 home recipes. Small; barcode scan and custom foods fill gaps. |

## 2. What the best apps do (MyFitnessPal, MacroFactor, Cronometer, Yazio)
- **A daily summary hero:** calories left in a big ring, protein/carbs/fat as smaller rings.
- **A week strip** of days with a small adherence ring per day; tap to jump.
- **Meals as cards** with kcal and protein, food rows, and an obvious "Add food" per meal.
- **Instant edits:** every change shows immediately and syncs in the background.
- **Water as tappable glasses**; weight with a mini trend line.
- **Search** that forgives plurals and typos, shows recent foods first, and never flickers.

## 3. The new Nutrition tab ✅
1. **Header:** title + settings.
2. **Week strip:** Mon–Sun chips, a calorie ring per day when logged, today highlighted, tap to switch day.
3. **Summary hero:** calorie ring (left / over) + protein, carbs, fat rings with `eaten / target g`. Protein-only mode shows a single protein ring. Hide-calories mode hides kcal everywhere.
4. **Meals:** four cards (Breakfast, Lunch, Dinner, Snacks), each with kcal + protein, food rows, and an "Add food" row.
5. **Day actions:** Copy yesterday, Templates, Mark day complete (one row of chips).
6. **Water:** 8 tappable glasses + a +250 ml button; instant.
7. **Weight & check-in:** trend card with a mini sparkline, plus the System debrief.

## 4. Fixes ✅ (built and retested in the simulator)
- Optimistic updates for add / edit / delete food, water, complete day (signed in); roll back on error.
- Search: plural/stem matching in the engine (`eggs` → egg, `tomatoes` → tomato), keep previous results while typing.
- Serving label "2 × large egg"; portion quantity stepper (0.5 steps, up to 20×) next to the quick chips.
- Water label formatting.

## 5. Follow-up
- ✅ Grow the food catalog from a real data import (USDA FoodData Central), not hand-typed values. `tools/foods/import-fdc.mjs` downloads the FDC CSV releases (SR Legacy, Foundation, and FNDDS for South Asian and mixed dishes such as paneer, dal, biryani, dosa and samosa) and writes `foods.json` from the list in `tools/foods/catalog.mjs`: 53 → 587 foods. Nutrients and household servings come from FDC; a glass or can is sized from FDC's own fl-oz density. Existing ids and recipes are unchanged. Search: `textMatch` now scores in tiers (starts with the query as a whole word > contains the whole word > prefix) so name length no longer beats popularity, and staples carry `popularity: 1`. "egg", "eggs", "rice", "chicken", "milk", "paneer" and "curd" each return the obvious food first (covered by tests).

## 6. Retest after the build
Search "eggs" finds all four egg foods; adding, editing (2.5×) and removing a food all show instantly; water + twice gives 2 glasses and survives a reload; Complete day toggles instantly; switching days via the week strip is instant; "Back to today" is a real button.
