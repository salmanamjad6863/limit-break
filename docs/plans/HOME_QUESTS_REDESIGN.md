# Home & Quests Redesign: Plan

Goal: bring Home and Quests up to the Train tab's standard. Each screen should have one clear job, a clear next action, no repeated content, and a calm, premium look.

## 1. Review: what we have today

| Screen | Today | Problem |
|---|---|---|
| Home | Hunter card, three 0% rings, a full workout card, the full Daily Quest with +1/+5/+10 buttons, five stat bars | **It repeats Train and Quests**: the full workout card and the quest controls both appear on Home. It doesn't say what to do next; everything has equal weight. Empty rings look dead. A red "0 day streak" chip punishes new users. The page is long. |
| Quests | Streak ring, Penalty window, Daily Quest window, a 12-row side-quest list with a disabled button, a boss card, a sick-mode card | Stacked boxes with no hierarchy. Every quest slot has four buttons (+1/+5/+10/Done). The boss card shows jargon ("Score 0.03 / 1.02"). Sick mode takes a full card. The streak has no sense of the week. |

## 2. What the best apps do
- **Apple Fitness / Whoop:** Home is a *summary*: rings or scores, then one recommended action. Details live in their own tabs.
- **Duolingo:** streak as a hero: a flame, the number, a 7-day row of dots, freeze shields, the next milestone.
- **Fitbod / Nike Training Club:** one "Up next" card with a visual and a single button.
- **Habit apps (Streaks, Fabulous):** quests as tiles you tick, one tap each.

## 3. The new Home (a dashboard)
1. **Header:** greeting, name, streak chip (neutral "Start a streak" at 0), settings.
2. **Up next (hero):** one card, chosen by priority: unfinished workout → Penalty Zone → today's workout → Daily Quest → "All clear" with recovery. It has a gradient, a muscle figure or icon, a title, meta, and one button.
3. **Today checklist:** three rows (Workout, Daily Quest, Protein), each with a small ring, value, status and a chevron. It replaces the big rings and the embedded quest.
4. **Hunter card:** emblem, level, rank, power, XP bar, next trial. Compact; taps to Profile.
5. **True Stats:** a 5-column bar chart (STR, AGI, END, VIT, SPI) with values.
6. **Weekly boss teaser:** HP bar and one line; taps to Quests.

## 4. The new Quests
1. **Streak hero:** big flame and count, Mon–Sun dots for this week, shields, best streak, and a bar to the next milestone title.
2. **Penalty Zone** (only when active): compact red window with the option picker.
3. **Daily Quest:** the System window keeps the brand voice, with an overall ring and countdown. Each slot is a clean row: progress ring, name, `x / target`, and two controls (`+5` or the timer, and ✓ to finish). "Follow along" is the main button.
4. **Side quests:** a 2-column tile grid, used both for picking (tap to select, up to 3) and for ticking or claiming.
5. **Weekly boss:** HP bar plus four objectives in plain words, with this week vs your past week.
6. **Sick or injured?** a small toggle row at the bottom.

## 5. Build order
1. ✅ Shared: new `QuestSlotRow` (ring + 2 controls).
2. ✅ Home rebuilt (sections §3).
3. ✅ Quests rebuilt (sections §4).
