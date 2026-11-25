# Content and balance approach

*Status: agreed between Schwab and Claude on 2026-11-24. The measurement tool and the first stage of AI work were built that day. The doctrine fix, the first rebalance, 18 new cards and the seven Pact decks followed on 2026-11-25; every change is listed in [balance-changes.md](balance-changes.md). The opening mulligan and the look-ahead keyword are not built. It covers the one-on-one lane game only, not Planet Mode. Sections marked "proposed" are Claude's starting numbers and have not been confirmed by Schwab.*

This document says what new cards, decks and balance changes are for, and how to check that they got there. Read it before adding content or changing card numbers.

## The goal

A card game is judged by how fun it is and by how diverse its meta is. For this game that means:

1. **Many decks that play differently and are equally viable.** No deck is the one you have to play.
2. **No hard counters.** A deck should not win or lose mainly because of which deck it was paired against.
3. **Room to brew.** Enough flexible cards that a player can build a deck of their own and have it work.
4. **Auto-build decks for newer players.** Preset decks with obvious synergy and clearly different playstyles, so a new player can try several and find one that clicks.
5. **No game decided by drawing one overpowered card.** Where a deck is built around a keystone card, it has ways to find that card, so it rarely loses just by not drawing it.

Balance serves all five. Because the game is digital, nerfing strong cards and buffing weak ones is cheap, and we use those levers freely.

## Who the meta is for

The game is played solo against the AI today. We balance it as if two humans could play each other. So deck-against-deck win rates and hard counters matter now, and the AI's decks are the meta a player actually meets.

## Targets

| What | Target | 2026-11-24, 14 decks | 2026-11-25, 21 decks |
|---|---|---|---|
| Overall win rate of each preset deck against all the others | 45–55% | 40.6% to 65.2%; nine of 14 outside | 45.9% to 54.2% (±1.5); none outside |
| Any single deck-against-deck matchup | no worse than 35/65 | 24 of 91 past it | 34 of 210 past it, 10 of them beyond the margin of error |
| First player's win rate | 48–52% (proposed) | 48.3% (±0.7) | 47.3% (±0.5) |
| One card deciding games | see "Single cards" below (proposed) | 21 cards over the 10-point limit | 37 cards, nearly all 1- and 2-cost openers |

Both columns are 200 games a pairing with the full AI; the second is on seeds that were not used for tuning.

A deck or matchup outside its range is a bug to fix in the next balance pass, not a feature of the meta. What is still out of range is listed at the end of [balance-changes.md](balance-changes.md).

The picture depends on how well the AI plays. With the old one-action AI the first 14 decks ranged from 41.9% to 57.6%; the stronger AI raised the fast decks and lowered the slow, location-heavy ones.

### Single cards (proposed)

Two checks:

- **Drawn against not drawn** (`test/meta.js`). For each card, compare the win rate of games where its owner drew it by turn 5 with games where they did not. A card that is not a deck's keystone should not move that figure by more than about 10 points. Read a card against the average for its cost: 1-cost cards average about +4 and cards costing 5 or more about −3, simply because of when they can be played.
- **Inclusion lift.** `test/balance.js` already reports how much better random decks do with a card than without it. A card more than about 4 points from the average for its type gets looked at. Location cards read 3–4 points low as a class in this test for reasons that are not about any one card, so judge them against other locations.

A keystone card is allowed a large drawn-against-not-drawn gap. That is the reason its deck needs the consistency tools below.

## The deck line-up

There are **21 preset decks: three per faction.**

- Two per faction built from one faction's cards plus neutrals.
- One **Pact deck** per faction, using up to 10 cards from a partner faction. These show a new player how cross-faction brewing works. Each faction is the partner in exactly one of them.

| Faction | Single-faction presets | Pact preset (partner): its plan |
|---|---|---|
| Planet's Stepdaughters | Canopy Swarm, Fungal Psi-Bloom | Deep Roots (Iron Hive): ramp into large units |
| The Iron Hive | Hive Fortress, Siege Artillery | Ironclad Trust (Vance): Armor as a weapon |
| University of Tau Ceti | Datalinks Cascade, Transcendence Protocol | Critical Mass (Tidewater): the combo deck |
| The Tidewater Pirates | Skyjack Armada, Black Market Heist | Air Cavalry (Redline): Aerial units stacked with keywords |
| The Cinder Believers | Believer Crusade, Martyr Inquisition | Martyr's Garden (Stepdaughters): sacrifice |
| Vance Industries | Overcharge Mercs, Thermal Syndicate | Full Portfolio (University): a full hand |
| The Redline Federation | Flanking Federation, Ridge Vanguard | Blooded Veterans (Cinder): promotions |

A Pact preset names its partner with `pact` in `cards.js`, and the engine brings that partner into the game with the preset.

Rules for the line-up:

- **A faction's three decks must play differently from each other**, not be three tunings of one plan. Each preset has a one-sentence plan (how it wins and what it does on a typical turn), which is its `desc` in `cards.js`. If two plans read alike, one of the decks changes.
- **A preset can carry a game plan for the AI** (`plan` in `cards.js`): its keystone cards, and any settings the AI should pilot it with. 19 of the 21 presets have one today. A setting goes into a plan only after `node test/meta.js --plan` shows it helps.
- **Across the 21 there should be several routes to a win**: fast colony damage, board control, razing locations, the Research race to an Ascent win, and build-around decks with a keystone.
- **New cards favour flexible, cross-faction synergy.** A card should key off a mechanic (Shields, Research, Energy Cells, locations, a keyword) and not off a faction's name, so it has a home in more than one deck. Small themed sets are fine. The card pool today is 208 cards: 111 units, 56 Orders and 41 locations, of which 39 are neutral.
- **Every preset still has exactly 30 cards.**

## Finding your key cards

The game has no mulligan and no way to look at the deck, and until 2026-11-25 it had no way to search it. The first player starts with 3 cards and draws one a turn, so a deck with two copies of a keystone and no other card draw has seen it by its fifth turn in about 47% of games (56% for the second player, who starts with 5). That is too low for a deck built around the card.

All four of these tools are approved:

| Tool | What it does | Notes |
|---|---|---|
| **Opening mulligan** | Swap any cards of your opening hand, once. | Helps every deck. It shifts every balance figure, so it goes in before the rebalance. |
| **A look-ahead keyword** (working name: Forecast) | Look at the top 3 cards of your deck and put one on top. | On cheap cards across all factions. Smooths draws without adding cards to hand. |
| **Cycle cards** | A small effect that also draws a card, or a card you can discard to draw another. | Thins the deck toward the keystone. |
| **Narrow tutors** | Fetch one kind of card: a location, an Order, a unit with a given keyword. | The strongest and riskiest tool. Few of them, priced with care, and never able to fetch any card at all. |

What is built, as of 2026-11-25: three narrow tutors (Site Planner draws a location, Heavy Requisition a unit costing 5 or more, Datalinks Search an Order costing 3 or more) on the engine function `E.tutor`, and two more cycle cards (Rite of Ash, Smuggler's Run). The opening mulligan and the look-ahead keyword are not built. Both need a choice screen in the UI and a way for the AI to choose.

Measured on 2026-11-25: a deck has seen its one-copy Secret Project by turn 5 in 29–38% of games and a two-copy keystone in 48–60%. The combo deck, with two copies of Critical Mass and two Datalinks Searches, has seen Critical Mass in 85%.

Proposed target: a build-around deck sees its keystone by its fifth turn in about 75% of games. Proposed limit in the other direction: consistency tools should not make a deck play out the same way every game, so no preset runs more than 4 tutor cards.

## Counterplay

Broad, soft answers are preferred. A good answer card is useful against many things and is never dead in hand: a modal Order, or a unit with a useful side effect.

Narrow tech cards (strong against one strategy, weak otherwise) are allowed in small numbers, with two conditions:

- The card has a baseline use, so it is still playable when the opponent is not the deck it targets.
- It makes a bad matchup closer. It does not flip one. A card that wins a matchup by itself is a hard counter in card form.

When a matchup falls outside 35/65, the first fix is to change the two decks or the cards that cause it. Adding a silver bullet is the last resort.

## Doctrines

The six doctrines are meant to be worth about the same to the average deck, with each one better for the decks that suit it. `node test/meta.js 40 1 --doctrines all` prices them: every deck plays with each doctrine in turn against a field on Frontier. Run it after changing a doctrine. The numbers are in `DOCTRINES` in `js/world.js`.

Before 2026-11-25 Free Market was worth 21 points of win rate to the average deck and Frontier nothing, so every deck was best on Free Market. The trials that fixed it found that a starting Energy Cell is worth about 11 points, a starting card about 9, and 5 colony Integrity less than 3. Early tempo is worth far more than Integrity, so price any future opening-hand effect with care.

## Nerfs and buffs

- **Used freely.** A card that is out of range gets changed in the next balance pass. Nobody has to prove it is ruining the game first.
- **Claude may change costs, stats, effect numbers, card text and preset lists without asking first.** Every change is listed afterwards, in [balance-changes.md](balance-changes.md), with the old value, the new value and the measurement that prompted it. Schwab reviews on the branch.
- **Prefer the smallest change that works**, and change one thing at a time where the measurement can tell the difference.
- **Proposed:** when the top of the range is fine and the bottom is not, buff the weak deck. When one deck or card is above everything else, nerf it. Don't raise the whole game to meet one outlier.
- **Tune on one set of seeds and confirm on fresh ones.**

## Measuring

Everything is measured with AI-against-AI games, which is fast but has limits.

| Tool | What it tells you | Limits |
|---|---|---|
| `node test/meta.js` | **The check for the targets.** Every preset against every other: each deck's overall win rate, the full matchup table with every pairing past 65/35, how often each deck has seen its keystone by turn 5, and each card's drawn-against-not-drawn gap. Runs on all cores. | 200 games a pairing takes about four minutes and gives ±2 points per deck but only ±7 per matchup. |
| `node test/meta.js --ab key=value` | An AI change tested across every preset, with the effect on each deck. | A deck's own figure is good to about ±2.6 points at 100 games a pairing. |
| `node test/meta.js --plan deck:change` | A change to one deck's game plan, tested against that deck's current plan. | |
| `node test/meta.js --focus deck` | One deck against every other, in under a minute. | Only that deck's figures mean anything. |
| `node test/meta.js --doctrines all` | What each doctrine is worth to every deck, against a field on Frontier. | A deck's figure is good to about ±6 at 30 games; the average to ±1.5. |
| `PATCH=trial.js node test/meta.js …` | Any of the above with a trial change to cards, presets or rules applied first, without editing the game. | |
| `node test/sim.js` | Crashes, stuck games, broken invariants, win rate per faction. | Averages a faction's presets together, which once hid a 16% and a 76% deck behind one figure. |
| `node test/balance.js` | Card-by-card lift in a league of random legal decks; `--power` prices leader powers. | Random decks undervalue build-around cards. Single-threaded, so slow with the full AI. |
| Swap test | Prices a family of generated cards, such as Design Workshop parts, against premade units of the same cost. | Run from a scratch script so far. |

Noise matters. Judging a single matchup against the 35/65 limit needs several hundred games of that pairing, so a matchup that reads just past the limit in one run is a candidate, not a finding. The AI is also not deterministic: two runs with the same seed differ slightly.

Two things to know when reading the card report. A cheap card can be played by turn 5 and a dear one cannot, so cheap cards read high and dear ones low; the report prints the average gap at each cost to compare against. And figures measured before 2026-11-24 used the old AI and are not comparable with later ones.

### The AI has to be able to play the decks

The sims are only as good as the AI's play, and the old AI looked a single action ahead. Schwab's decision was to improve the AI before adding build-around content, in two stages.

**Stage 1 was built on 2026-11-24.** The AI now:

- **Plans its whole turn.** It searches lines of play on copies of the game, keeping the 12 best at each step, with Energy Cells folded into the plays they pay for. It then judges the best lines again after the Cycle End effects have fired. This is most of the gain.
- **Protects units that are about to be destroyed**, and attacks locations less eagerly than it did.
- **Reads a game plan from the deck**: its keystone cards, settings for how to pilot it, hold rules (when a card is worth playing) and extra value for pay-off cards.

Measured over every preset pairing, the new AI beats the old one in 75.5% of games (±1.1). The three difficulty levels now sit like this:

| Level | What it does | Measured |
|---|---|---|
| Colonist | One action at a time, with random mistakes. | Wins 36% against Commander, as before. |
| Commander (the default) | The best single action it can see, one at a time. | Wins 29% against Transcend. Slightly stronger than it was: 52% against its old self. |
| Transcend | The full AI. The tests and balance tools use it. | Beat the old Transcend in 63% of games, measured before the last two skills went in. |

A game takes about 0.1 seconds on one core, five times what it did. `test/meta.js` runs on all cores; the single-threaded tools can be run with `AI_LEVEL=commander` when they only have to hunt for crashes.

What was tried and did not help, so nobody repeats it:

- Setting aggression, colony-health, Research, hand and location weights per deck. No deck gained more than the noise.
- Hold rules on nine conditional cards such as Elder Canopy Beast and Gilded Leviathan. They cost about 2 points: playing on curve beat waiting.
- Drawing cards first and planning the rest of the turn afterwards, and holding Orders back in proportion to their cost. No effect.
- A narrower search (8 lines) saves a fifth of the time and loses 1.4 points. A wider one (20 lines) gains about 1 point and nearly doubles the time.

What did differ by deck is how much to protect units. Swarm and flanking decks want a lot of it and the artillery and Order-heavy decks want none, so seven presets carry their own value in their plan. That is worth about 1 point to those decks on top of the default.

**The AI cannot save up for a combo turn.** The first combo deck, Critical Mass, was tried with plans that told the AI to hold its finisher and bank Energy Cells. Every one of them did worse than no plan at all, by 1 to 4 points: the AI plays the deck best by spending everything as soon as it can. It does order a turn well, so it plays Critical Mass last. A person who saves cards for one large turn will get more out of the deck than the AI does, so its sim figures are a floor and it has to be played by hand before they are trusted. The same will be true of any deck whose plan is "wait, then do it all at once".

**Stage 2, deeper search, only if needed.** The cheapest next step is to play out the opponent's best attacks on the few best lines before choosing. A crude stand-in for that, marking down units the enemy could destroy, was worth 2 points, so the real thing should be worth more.

AI results never replace playing the game: a deck the sims call balanced can still be dull or frustrating to play.

## What the rebalance of 2026-11-25 learned

For whoever does the next pass. The open problems are listed at the end of [balance-changes.md](balance-changes.md).

- **Check the doctrines before the cards.** Most of the first spread was doctrines, not cards.
- **A deck's shape matters more than its average.** Hive Fortress could be moved from 36% to 60% with stat buffs and still lose to every fast deck and beat every slow one. What fixed it was finding the one thing that drove each side: its leader power locked out slow decks, and Attack on its Guards was what it lacked against fast ones. Knock cards or rules out one at a time with `PATCH` and `--focus` and read the whole row of matchups, not the average.
- **Shielded Guards beat decks whose answers are single large hits.** That is why the Vance decks lose to Hive Fortress. Many small hits and Psi damage are the answers.
- **Secret Projects are still bad to draw early**, even at lower costs: 9–10 points for two of them. Trials that made the AI value them lower changed nothing, so it is the cards.
- **Cheap openers swing games**, and were left alone for the mulligan to fix first.
- **A single stat point on a two-copy card moves its deck by 1 to 3 points**, which is inside the noise of one run. Change cards in packages, measure the package, then roll back the part that overshot.

## Order of work

1. ~~Add the preset round robin and the keystone and single-card report to `test/`.~~ Done 2026-11-24: `test/meta.js`.
2. ~~AI stage 1.~~ Done 2026-11-24; see "The AI has to be able to play the decks".
3. Opening mulligan and the look-ahead keyword: **not built.** ~~Cycle cards and narrow tutors.~~ Done 2026-11-25.
4. ~~Rebalance the 14 existing presets to the targets.~~ Done 2026-11-25, with the doctrines.
5. ~~Add the seven Pact decks and new flexible cards.~~ Done 2026-11-25: 18 cards.
6. Next: the mulligan, then a second balance pass on the matchups still past 65/35, the Police State doctrine and the first player's win rate. Play the combo deck by hand.
7. After each set, run the checklist below.

## Checklist for a content pass

- [ ] `node test/sim.js` reports no problems, and the rules, cards, decks and design tests pass.
- [ ] Every preset is 30 cards and has a one-sentence plan that differs from its faction's other presets.
- [ ] A new build-around preset names its keystones in its game plan, and any AI setting in a plan was kept because a trial showed a gain.
- [ ] Preset round robin: every deck 45–55% overall, no matchup worse than 35/65, confirmed on fresh seeds.
- [ ] If a doctrine changed, `--doctrines all` shows the six still worth about the same.
- [ ] No new card outside the single-card limits, or it is a named keystone with a way to find it.
- [ ] New answer cards are broad, or meet the two conditions for tech cards.
- [ ] Any deck the AI still plays badly is named as such in the hand-over.
- [ ] Every nerf and buff is listed in balance-changes.md with before, after and the reason.

## Not yet confirmed

These numbers are Claude's proposals. They should be adjusted once the tools exist and the first measurements are in:

- First player's win rate held to 48–52%.
- The single-card limits: about 10 points drawn against not drawn, about 4 points of inclusion lift.
- Keystone found by turn 5 in about 75% of games, and at most 4 tutor cards in a preset.
- The preference for buffing the weak end over nerfing, except for a single outlier.
- "Forecast" as the name of the look-ahead keyword.
