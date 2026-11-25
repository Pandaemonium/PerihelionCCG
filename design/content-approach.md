# Content and balance approach

*Status: agreed between Schwab and Claude on 2026-11-24. The measurement tool and the first stage of AI work were built that day. The doctrine fix, the first rebalance, 18 new cards and the seven Pact decks followed on 2026-11-25, and then a second pass the same day: the opening mulligan, extra Integrity for the first player, 25 more cards and a fourth deck for each faction. A third pass, also that day, was written by Gemini and then reviewed and corrected by Claude: Forecast (the look-ahead keyword), Archive, "Choose one" Orders, Purge, Council Decrees, a reworked Police State, one new doctrine (Planned; a second, Cybernetic, was added and taken out again), five Workshop parts and 20 cards. Every change is listed in [balance-changes.md](balance-changes.md). It covers the one-on-one lane game only, not Planet Mode. Sections marked "proposed" are Claude's starting numbers and have not been confirmed by Schwab.*

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

| What | Target | 2026-11-24, 14 decks | 2026-11-25, 21 decks | 2026-11-25, 28 decks, with the mulligan | 2026-11-25, after the third pass |
|---|---|---|---|---|---|
| Overall win rate of each preset deck against all the others | 45–55% | 40.6% to 65.2%; nine of 14 outside | 45.9% to 54.2% (±1.5); none outside | 45.8% to 55.1% (±1.3); one deck 0.1 over | 46.2% to 55.4% (±1.3); one deck 0.4 over |
| Any single deck-against-deck matchup | no worse than 35/65 | 24 of 91 past it | 34 of 210 past it, 10 of them beyond the margin of error | 58 of 378 past it, 20 of them beyond the margin of error | 54 of 378 past it, 16 of them beyond the margin of error |
| First player's win rate | 48–52% (proposed) | 48.3% (±0.7) | 47.3% (±0.5) | 49.2% (±0.4) | 49.4% (±0.4) |
| One card deciding games | see "Single cards" below (proposed) | 21 cards over the 10-point limit | 37 cards, nearly all 1- and 2-cost openers | 30 cards, the same openers | 27 cards, the same openers |

Every column is 200 games a pairing with the full AI; the last three are on seeds that were not used for tuning.

A deck or matchup outside its range is a bug to fix in the next balance pass, not a feature of the meta. What is still out of range is listed at the end of [balance-changes.md](balance-changes.md).

The picture depends on how well the AI plays. With the old one-action AI the first 14 decks ranged from 41.9% to 57.6%; the stronger AI raised the fast decks and lowered the slow, location-heavy ones.

### Single cards (proposed)

Two checks:

- **Drawn against not drawn** (`test/meta.js`). For each card, compare the win rate of games where its owner drew it by turn 5 with games where they did not. A card that is not a deck's keystone should not move that figure by more than about 10 points. Read a card against the average for its cost: 1-cost cards average about +4 and cards costing 5 or more about −3, simply because of when they can be played.
- **Inclusion lift.** `test/balance.js` already reports how much better random decks do with a card than without it. A card more than about 4 points from the average for its type gets looked at. Location cards read 3–4 points low as a class in this test for reasons that are not about any one card, so judge them against other locations.

A keystone card is allowed a large drawn-against-not-drawn gap. That is the reason its deck needs the consistency tools below.

## The deck line-up

There are **28 preset decks: four per faction.**

- Two per faction built from one faction's cards plus neutrals.
- One **Pact deck** per faction, using up to 10 cards from a partner faction. These show a new player how cross-faction brewing works. Each faction is the partner in exactly one of them.
- One **mechanic deck** per faction, built around a way of playing that no other preset has. The mechanic itself is in the engine for any faction to use.

| Faction | Single-faction presets | Pact preset (partner): its plan | Mechanic preset: its plan |
|---|---|---|---|
| Planet's Stepdaughters | Canopy Swarm, Fungal Psi-Bloom | Deep Roots (Iron Hive): ramp into large units | Heartwood Colossus: go tall on one unit, with Overrun |
| The Iron Hive | Hive Fortress, Siege Artillery | Ironclad Trust (Vance): Armor as a weapon | Reclamation Yard: rebuild and bring back destroyed units |
| University of Tau Ceti | Datalinks Cascade, Transcendence Protocol | Critical Mass (Tidewater): the combo deck | Prototype Lab: an army from the Design Workshop |
| The Tidewater Pirates | Skyjack Armada, Black Market Heist | Air Cavalry (Redline): Aerial units stacked with keywords | Hit and Run: strike and return to hand |
| The Cinder Believers | Believer Crusade, Martyr Inquisition | Martyr's Garden (Stepdaughters): sacrifice | Trial by Fire: units that gain from surviving damage |
| Vance Industries | Overcharge Mercs, Thermal Syndicate | Full Portfolio (University): a full hand | Trade War: tax the enemy's cards and Jam their units |
| The Redline Federation | Flanking Federation, Ridge Vanguard | Blooded Veterans (Cinder): promotions | Supply Lines: call down and collect Supply Pods |

A Pact preset names its partner with `pact` in `cards.js`, and the engine brings that partner into the game with the preset.

Rules for the line-up:

- **A faction's four decks must play differently from each other**, not be four tunings of one plan. Each preset has a one-sentence plan (how it wins and what it does on a typical turn), which is its `desc` in `cards.js`. If two plans read alike, one of the decks changes.
- **A preset can carry a game plan for the AI** (`plan` in `cards.js`): its keystone cards, and any settings the AI should pilot it with. 26 of the 28 presets have one today. A setting goes into a plan only after `node test/meta.js --plan` shows it helps.
- **Across the 28 there should be several routes to a win**: fast colony damage, board control, razing locations, the Research race to an Ascent win, build-around decks with a keystone, outlasting the enemy with units that come back, and slowing the enemy down.
- **New cards favour flexible, cross-faction synergy.** A card should key off a mechanic (Shields, Research, Energy Cells, locations, a keyword) and not off a faction's name, so it has a home in more than one deck. Small themed sets are fine. The card pool today is 253 cards: 133 units, 71 Orders and 49 locations, of which 46 are neutral.
- **Every preset still has exactly 30 cards.**

## Finding your key cards

Until 2026-11-25 the game had no mulligan and no way to search the deck or look at it. The first player starts with 3 cards and draws one a turn, so with no mulligan a deck with two copies of a keystone and no other card draw has seen it by its fifth turn in about 47% of games (56% for the second player, who starts with 5). That is too low for a deck built around the card.

All four of these tools are approved:

| Tool | What it does | Notes |
|---|---|---|
| **Opening mulligan** | Swap any cards of your opening hand, once. | Built 2026-11-25. Helps every deck. It shifts every balance figure, and it favours the player with more cards to swap, so the first player now starts with 4 more Integrity. |
| **A look-ahead keyword: Forecast N** | Look at the top N cards of your deck, put one on top and the rest on the bottom. | Built 2026-11-25. On cheap cards across all factions. Smooths draws without adding cards to hand. |
| **Cycle cards** | A small effect that also draws a card, or a card you can discard to draw another. | Thins the deck toward the keystone. |
| **Narrow tutors** | Fetch one kind of card: a location, an Order, a unit with a given keyword. | The strongest and riskiest tool. Few of them, priced with care, and never able to fetch any card at all. |

What is built, as of 2026-11-25: the opening mulligan (`E.mulligan`, with the AI's choice in `AI.mulliganChoice`), three narrow tutors (Site Planner draws a location, Heavy Requisition a unit costing 5 or more, Datalinks Search an Order costing 3 or more) on the engine function `E.tutor`, and three more cycle cards (Rite of Ash, Smuggler's Run, Ironbark Graft). Forecast is on eight cards and one Workshop part (`E.forecast`, with the AI's pick in `AI.pickForecast` and a choice screen for a person). Archive is a fifth tool, added in the third pass: for 1 Energy, a Secret Project or Planet Buster in hand is swapped for the top card of the deck and shuffled back in (`E.archiveCard`). It is there for the cards that are bad to hold early.

Measured on 2026-11-25 with the mulligan: a deck has seen a two-copy keystone by turn 5 in 53–64% of games (48–60% before), and a deck with two different two-copy keystones has seen one of them in 77–86%. The combo deck, with two copies of Critical Mass and two Datalinks Searches, has seen Critical Mass in 85%. A one-copy Secret Project is seen in only 24–30%, down from 29–38%, because the AI sends a Secret Project back in the mulligan: it is a bad card to hold on the first turns.

With Archive (third pass) the AI also swaps a Secret Project away on later turns, so a deck has seen its one-copy project by turn 5 in only 12–21% of games. Seeing it early no longer costs most decks anything: of the five decks whose keystone is a project, three read within the margin of error either way, Transcendence Protocol reads 7.1 points better (its project is how it wins), and only Hive Fortress still reads worse, by 4.8 (±4.0). Before Archive the figure was 5–6 points worse for three of them.

The mulligan did not reach the 75% target by itself, because the AI spends it on finding something to play on turns 1 and 2, not on finding its keystone. A person can choose differently. A deck that needs one particular card still needs a tutor for it.

Proposed target: a build-around deck sees its keystone by its fifth turn in about 75% of games. Proposed limit in the other direction: consistency tools should not make a deck play out the same way every game, so no preset runs more than 4 tutor cards.

## Counterplay

Broad, soft answers are preferred. A good answer card is useful against many things and is never dead in hand: a modal Order, or a unit with a useful side effect.

Modal Orders ("Choose one") are built: a card lists `modes`, and the player and the AI pick one when it is played. The third pass used them for answers to the two patterns the second pass left open. Against Shielded Guards: damage in several small hits (Breach Protocol, Suppressive Scatter) and a Workshop part that strips a Shield. Against units that keep coming back: Purge, which removes a unit with no Last Stand and keeps it out of the fallen (Salvage Impound, Containment Purge). Half of those cards are in no preset yet, and the matchups they were made for have not moved; see the open list in balance-changes.md.

Narrow tech cards (strong against one strategy, weak otherwise) are allowed in small numbers, with two conditions:

- The card has a baseline use, so it is still playable when the opponent is not the deck it targets.
- It makes a bad matchup closer. It does not flip one. A card that wins a matchup by itself is a hard counter in card form.

When a matchup falls outside 35/65, the first fix is to change the two decks or the cards that cause it. Adding a silver bullet is the last resort.

## Doctrines

The seven doctrines are meant to be worth about the same to the average deck, with each one better for the decks that suit it. One of them, Planned, was added in the third pass and no preset uses it yet, so it matters only to a person who picks it on the title screen. That pass also added Cybernetic, which was taken out again the same day: it gave Research and lower Tech thresholds, which is Knowledge a second time. A new doctrine should work on something no other doctrine touches. `node test/meta.js 40 1 --doctrines all` prices them: every deck plays with each doctrine in turn against a field on Frontier. Run it after changing a doctrine. The numbers are in `DOCTRINES` in `js/world.js`.

Before 2026-11-25 Free Market was worth 21 points of win rate to the average deck and Frontier nothing, so every deck was best on Free Market. The trials that fixed it found that a starting Energy Cell is worth about 11 points, a starting card about 9, and 5 colony Integrity less than 3. Early tempo is worth far more than Integrity, so price any future opening-hand effect with care.

Council Decrees are a separate thing: an optional rule that applies to both players in a skirmish (no terrain and faster Research, extra Xenofungus and cheaper Native units, a Planet Buster in each deck, extra Supply Pods). They are for variety and are outside the targets in this document. The balance tools and every figure here are with no Decree.

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
| `node test/meta.js` | **The check for the targets.** Every preset against every other: each deck's overall win rate, the full matchup table with every pairing past 65/35, how often each deck has seen its keystone by turn 5, and each card's drawn-against-not-drawn gap. Runs on all cores. | With 28 presets, 200 games a pairing takes about half an hour and gives ±1.3 points per deck but only ±6 per matchup; 100 games takes fifteen minutes and gives ±2 per deck. |
| `node test/meta.js --ab key=value` | An AI change tested across every preset, with the effect on each deck. | A deck's own figure is good to about ±2.6 points at 100 games a pairing. |
| `node test/meta.js --plan deck:change` | A change to one deck's game plan, tested against that deck's current plan. | |
| `node test/meta.js --focus deck` | One deck against every other, in about two minutes at 200 games. | Only that deck's figures mean anything. |
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

**The AI's mulligan.** The AI keeps cards costing 2 or less, keeps a 3-cost card when it has a cheap card or an Energy Cell to go with it or the card is one of its deck's keystones, and sends the rest back, Secret Projects included. Across the 21 decks that rule beats keeping every card 54% to 46% (±0.8), and every deck gains. Keeping only 1-cost cards or keeping up to 3-cost cards measured no better. A deck's plan can name cards to always keep or always send back (`mulligan: { keep, toss }`); no preset uses that yet, and it should be added only with a trial that shows a gain.

**The AI gets little from a card that pays off later.** It scores the position after each line of play, so a card whose value arrives on a later turn looks like a loss to it. The second pass met this four times: a friendly-bounce Order (Evac Shuttle: give up a unit now, reuse its Deploy next turn), two locations that do nothing on the turn they are built (Airdrop Beacon and Trade Embargo), and a unit that needs a Jam played first (Liquidator, whose effect the AI gets in one play in five). The decks they were in first read 32–42%. The fixes were to cut the card from the preset, to make it cheaper, or to give it an effect on the turn it is played. When a new deck reads far below the others, run it with `--focus deck --cards` and look for its own cards at the bottom of the drawn-gap list.

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

## What the second pass of 2026-11-25 learned

- **A new deck lands 10 to 20 points off target on its first run.** The seven mechanic decks first read 58%, 55%, 52%, 42%, 41%, 40% and 32%, and took three or four rounds of 100 games a pairing to bring in. Budget for that.
- **The mulligan favours whoever has more cards to swap.** It moved the first player from 47.3% to 46.0%. Four Integrity for the first player brought that back to 49–50%; taking a card from the second player overshot to 56.7%.
- **A unit that keeps coming back with its Shield is a lock against decks that answer units with single large hits.** Reclamation Yard with Bulwark Drones beat every Vance deck 76–82%. The same was true of Hive Fortress's Barricades in the first pass. Check any new source of repeated Shields or Guards against the Vance decks.
- **Sending a unit back to its owner's hand is a hard answer to a deck that builds one large unit.** Undertow at 3-cost gave Hit and Run 70% against Heartwood Colossus; at 4-cost that matchup is inside the range.
- **A deck that was in range can drift out when the rest of the field gets better.** Critical Mass, Believer Crusade, Skyjack Armada, Ironclad Trust and Full Portfolio each needed a small buff after the mulligan and the new decks, with no change of their own.

## What the third pass of 2026-11-25 learned

The third pass was written by Gemini and reviewed by Claude. What the review found is worth more than the list of fixes:

- **Measure every deck whose list changed, against the whole field.** Ten lists changed and four were measured, at 16 games a pairing, against the decks the change was aimed at. Two of the unmeasured six had moved 6 to 7 points (Ridge Vanguard up, Hit and Run down), and one of the measured four was out as well once it had 200 games behind it. `--focus deck` takes two minutes.
- **Swapping a card that draws for one that does not costs more than it looks.** Two Shivs (1 damage, draw a card) for two Squall Charts (a choice of two small effects, no draw) cost Hit and Run 6 points.
- **A bonus for terrain is nearly always on.** The standard map has two kinds of terrain, so "+1/+1 for each kind of terrain" was +2/+2 at the least. Count what the map gives for free before pricing a card on it.
- **A fix to the AI is a balance change.** Once the AI could see Prescient Empath's bonus, its deck read 57%.
- **Code that waits for a person is not covered by any whole-game tool.** Forecast was correct for the AI and could copy and lose cards for a person; see the rule in CLAUDE.md.
- **An answer card changes nothing until it is in the deck that needs it.** The pass made multi-hit and Purge cards for the Vance decks' two bad matchups, put one copy in two decks, and those matchups did not move: Hive Fortress still beats Trade War 80% and Reclamation Yard beats it 77%. One copy of a 3- or 4-cost answer is seen too late against a deck that sets up on turn 2.
- **Archive mostly works.** Secret Projects had been 5–6 points worse to draw early through two passes of cost cuts. Letting any of them be swapped away for 1 Energy closed that for every deck but Hive Fortress.
- **Chasing the last half point is noise.** Four runs of the same code put Reclamation Yard between 54.6% and 56.3%. A deck that reads 55.4% (±1.3) once is not worth another round; a deck that reads over in three runs is.

## Order of work

1. ~~Add the preset round robin and the keystone and single-card report to `test/`.~~ Done 2026-11-24: `test/meta.js`.
2. ~~AI stage 1.~~ Done 2026-11-24; see "The AI has to be able to play the decks".
3. ~~Opening mulligan.~~ Done 2026-11-25, with 4 extra Integrity for the first player. ~~Cycle cards and narrow tutors.~~ Done 2026-11-25. ~~The look-ahead keyword.~~ Done 2026-11-25 as Forecast, with Archive.
4. ~~Rebalance the 14 existing presets to the targets.~~ Done 2026-11-25, with the doctrines.
5. ~~Add the seven Pact decks and new flexible cards.~~ Done 2026-11-25: 18 cards.
6. ~~A fourth, mechanic deck for each faction.~~ Done 2026-11-25: 25 cards.
7. ~~The Police State doctrine and the look-ahead keyword.~~ Done 2026-11-25 in the third pass, with Archive, "Choose one" Orders, Purge and Council Decrees.
8. Next: the matchups still past 65/35. Hive Fortress now beats all four Vance decks about 70–80%, so start there: get the multi-hit and Purge cards into the Vance decks in numbers that are seen early, and check whether the new Police State is part of it. Find homes for the eleven third-pass cards that are in no preset. Play the combo deck and Trade War by hand.
9. After each set, run the checklist below.

## Checklist for a content pass

- [ ] `node test/sim.js` reports no problems, and the rules, cards, decks and design tests pass.
- [ ] Every preset is 30 cards and has a one-sentence plan that differs from its faction's other presets.
- [ ] A new build-around preset names its keystones in its game plan, and any AI setting in a plan was kept because a trial showed a gain.
- [ ] Preset round robin: every deck 45–55% overall, no matchup worse than 35/65, confirmed on fresh seeds.
- [ ] If a doctrine changed, `--doctrines all` shows them all still worth about the same.
- [ ] If a preset's list changed, that deck was measured against the whole field (`--focus`), not only the decks the change was aimed at.
- [ ] Anything that waits for a person's choice has a unit test with the human seat set, and was played through on the page.
- [ ] No new card outside the single-card limits, or it is a named keystone with a way to find it.
- [ ] New answer cards are broad, or meet the two conditions for tech cards.
- [ ] Any deck the AI still plays badly is named as such in the hand-over.
- [ ] Every nerf and buff is listed in balance-changes.md with before, after and the reason.

## Not yet confirmed

These numbers are Claude's proposals. They should be adjusted once the tools exist and the first measurements are in:

- First player's win rate held to 48–52%, and the 4 extra Integrity that gets it there.
- The single-card limits: about 10 points drawn against not drawn, about 4 points of inclusion lift.
- Keystone found by turn 5 in about 75% of games, and at most 4 tutor cards in a preset.
- The preference for buffing the weak end over nerfing, except for a single outlier.
- The Planned doctrine and the five Council Decrees of the third pass, and whether Field Refit should stay 1 Energy cheaper than the Design Workshop it copies. Planned also starts with Research, as Knowledge does; it may want a different second benefit.
- A new Cybernetic, if it comes back (Claude's proposal, not built or priced): up to 1 unspent Energy carries over to your next turn, with a drawback every deck feels, such as 2 or 3 less starting Integrity. Energy is the most expensive thing in the game to give away (a starting Cell is worth about 11 points), so start at 1 and measure. The runner-up was a leader power that costs 1 less from the start, which is harder to balance because the powers differ so much.
