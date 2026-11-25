# Balance changes

Every nerf, buff and rule change, newest pass first, with the old value, the new value and the measurement that prompted it. Each pass ends with what it left out of range; the list that is current is the one in the newest pass. The approach these follow is in [content-approach.md](content-approach.md).

Figures are win rates from `node test/meta.js` with the full AI. "Lift" is a card's figure in `node test/balance.js` (random decks). A deck figure is good to about ±2 points and a single matchup to about ±6.

## 2026-11-25, third pass: Planetary Telemetry & Counterplay expansion

Written by Gemini, then reviewed and corrected by Claude the same day. The tables under "Rules & Systems", "Doctrines" and "New cards (20) & tuning" are Gemini's, with two facts corrected. Everything from "The 20 new cards" on was added in the review.

### Result

| | Before this pass | After |
|---|---|---|
| Deck win rates | 45.8% to 55.1% (±1.3); one deck 0.1 over | 46.2% to 55.4% (±1.3); one deck, Thermal Syndicate, is 0.4 over |
| Matchups past 65/35 | 58 of 378 (15%), 20 beyond the margin of error | 54 of 378 (14%), 16 beyond the margin of error |
| First player's win rate | 49.2% (±0.4) | 49.4% (±0.4) |
| Cards that move their deck by more than 10 points when seen by turn 5 | 30 | 27 |
| Card pool | 233 | 253 |
| Doctrines | 6 | 7 (Planned is new; Cybernetic was added and then taken out) |

The "after" column is 200 games a pairing on a seed that was not used for tuning. It is the second such run: the first found Overcharge Mercs at 56.8% and Reclamation Yard at 55.9%, both were changed, and this run is the check on that.

All 28 decks in that run, each ±1.3:

| Deck | Win rate | Deck | Win rate |
|---|---|---|---|
| Thermal Syndicate | 55.4% | Ridge Vanguard | 49.3% |
| Datalinks Cascade | 54.1% | Ironclad Trust | 49.1% |
| Overcharge Mercs | 54.0% | Deep Roots | 49.0% |
| Prototype Lab | 53.7% | Canopy Swarm | 49.0% |
| Hive Fortress | 53.0% | Martyr's Garden | 48.6% |
| Reclamation Yard | 51.8% | Trial by Fire | 48.4% |
| Trade War | 51.7% | Transcendence Protocol | 48.0% |
| Flanking Federation | 51.5% | Siege Artillery | 48.0% |
| Hit and Run | 50.7% | Supply Lines | 48.0% |
| Full Portfolio | 50.4% | Black Market Heist | 47.8% |
| Heartwood Colossus | 50.3% | Skyjack Armada | 47.5% |
| Believer Crusade | 50.1% | Martyr Inquisition | 47.5% |
| Air Cavalry | 50.0% | Critical Mass | 46.9% |
| Fungal Psi-Bloom | 49.7% | Blooded Veterans | 46.2% |

### Rules & Systems

| Rule | Before | After | Why |
|---|---|---|---|
| Forecast N (new) | None | Look at the top N cards of your deck; put 1 on top (or draw it) and place the rest on the bottom. Interactive modal for human seat; heuristic picker (`AI.pickForecast`) for AI. | Approved in `content-approach.md` to smooth draws and keystones without flooding hand size. |
| Archive 1 (new) | None | All Secret Projects and `Planet Buster` can be Archived for 1 Energy: draw a replacement card first, then shuffle the Archived card back into the deck. | Reduces the early-draw dead-card penalty on Secret Projects and 10-cost sweepers. |
| Modal Orders (`Choose one:`) | None | Orders may define `modes: [...]`; both human UI and AI beam search evaluate each legal mode and its targets. | Gives soft, main-deckable counterplay without adding narrow dead hate cards. |
| Purge (new) | None | Purged units leave play without triggering `Last Stand` or `onAllyDeath` and do not enter the fallen pile (`grave`/`lost`). `purgeGrave` removes the costliest unit from a player's fallen pile. | Soft counterplay against death triggers and Reclamation Yard recursion. |
| Terraforming & Pull (new) | Push away from centre only | Added `E.swapTerrain(a, b)` and `E.pullUnit(u)` (pulls 1 lane toward centre; a unit in the centre lane, or with the inward lane taken, does not move). | Expands 7-lane geometry and terrain interaction. |
| Design Workshop parts | 4 chassis, 12 abilities | Added 5 universal parts: `Drop Pod` chassis (`Blitz, Flank +1`, Tech 8), `Telemetry Mast` (`Deploy: Forecast 2`, Tech 0), `Ramming Prow` (`Overrun`, Tech 4), `Shield Disruptor` (`Deploy: 1 Psi & strip Shield`, Tech 4), `Nano-Repair` (`Cycle End: heal 2`, Tech 8). | Broadens build-around variety while preserving the 1-signature-part-per-faction invariant. |
| Planetary Council Decrees (new) | None | Optional skirmish global mutators on Title Screen: `Standard`, `Solar Shade`, `Planetbloom`, `Repeal Charter`, `Orbital Salvage`. | Adds replayable SMAC-inspired Planetary Council game modes without cluttering standard balance. |

### Doctrines

Gemini's figures, priced via `node test/meta.js --doctrines` across 7 representative faction decks against Frontier. The review priced the final versions again over all 28 decks; those figures follow the table.

| Doctrine | First version | Now | Measured delta vs Frontier |
|---|---|---|---|
| Police State | Old: Guards +1 Atk, max hand 8. Draft 1: +4 Armor, first unit +0/+1, max hand 8 (+8.2%). Draft 2: first unit +0/+1, max hand 8 (+12.4%). | First unit deployed each turn gains +0/+1; opening hand -1 card and Breakthroughs need +1 Research (5 / 9 / 14). | +4.3% (±5.7) |
| Cybernetic (new) | Draft 1: +1 Research, Tech thresholds -1, no Armor (-12.6%). | Start at 2 Research, Tech thresholds (and Workshop unlocks) -1; colony cannot gain Armor. | +0.0% (±6.3) |
| Planned (new) | Newly built locations +1 Integrity, +1 starting Research; max Energy cap 9. | Unchanged. | -2.9% (±6.3) |

### New cards (20) & tuning

Card pool grew from 233 → 253 playable cards (269 total art assets including tokens and leaders).

| Card | First version | Now | What the measurement was |
|---|---|---|---|
| Breach Protocol (Vance Modal Order) | 2-cost: 1 dmg ×3 OR +2 Cells | 3-cost: 1 dmg ×3 OR +2 Cells | Overcharge Mercs jumped to 63.2% at 2-cost; at 3-cost (1× in preset) Overcharge Mercs measured 54.6% (±4.7). |
| Salvage Impound (Vance Unit) | 3-cost 3/3 Deploy: 2 Psi + Purge | 4-cost 3/3 Deploy: 2 Psi + Purge | Trade War jumped to 63.7% at 3-cost; at 4-cost (1× in preset) Trade War measured 52.3% (±4.7). |
| Liquidator (Vance Unit) | Briefly tested with `Archive 1` | Reverted (not Archivable) | Giving Trade War's 2× Liquidators 1-Energy cycling pushed Trade War to 59.3%; removing it returned Trade War to 52.3% (±4.7). |

Those were focused checks at 16 games a pairing (±4.7), on four of the ten decks whose lists changed: `Overcharge Mercs` 54.6%, `Trade War` 52.3%, `Hive Fortress` 52.3%, `Thermal Syndicate` 51.4%. The whole-field figures are in the Result above.

### The 20 new cards

| Card | Faction | Type | What it does |
|---|---|---|---|
| Telemetry Drone | Colonist | Unit, 1-cost 1/2 | Deploy: Forecast 3 |
| Seismic Ping | Colonist | Order, 1-cost | Deal 1 damage; Forecast 3 |
| Containment Purge | Colonist | Order, 2-cost | Choose one: Jam an enemy unit or location and Purge the costliest unit from the enemy's fallen; or deal 2 damage to a unit and draw a card if it dies |
| Suppressive Scatter | Colonist | Order, 3-cost | Deal 1 damage to enemy units in a lane and the lanes beside it, twice |
| Tectonic Shaper | Colonist | Unit, 3-cost 3/3 | Deploy: swap this lane's terrain with another lane's; draw a card |
| Field Refit | Colonist | Order, 2-cost | Design a unit; it costs 2 less |
| Prescient Empath | Stepdaughters | Unit, 2-cost 1/2 Psi | Deploy: Forecast 3; if you pick a Native unit, +1/+1 |
| Condenser Array | Stepdaughters | Location, 2-cost | When built and at Cycle End: if this lane has terrain, the unit stationed here gains +1/+1 |
| Bio-Scrubber Rig | Iron Hive | Unit, 2-cost 2/3 | Deploy: if this lane has terrain, clear it, gain 3 Armor and draw a card |
| Grav-Pull Winch | Iron Hive | Order, 2-cost | Deal 2 damage to an enemy unit and pull it 1 lane toward the centre; 1 more damage if it lands on terrain |
| Salvage Blueprint | Iron Hive | Unit, 2-cost 2/3 | Last Stand: add a Design Workshop that costs 0 to your hand |
| Datalinks Index | University | Location, 2-cost | Cycle Start: if staffed, Forecast 2 and gain 1 Research |
| Squall Chart | Tidewater | Order, 1-cost | Choose one: Forecast 3 and add an Energy Cell to your hand; or deal 1 damage to an enemy unit and push it 1 lane sideways |
| Omen Seer | Cinder | Unit, 2-cost 2/3 | Deploy: Forecast 3. Last Stand: 1 damage to the enemy colony |
| Market Forecast | Vance | Order, 1-cost | Forecast 3. Overcharge 1: draw the chosen card |
| Breach Protocol | Vance | Order, 3-cost | Choose one: deal 1 damage to an enemy unit three times; or add 2 Energy Cells to your hand |
| Salvage Impound | Vance | Unit, 4-cost 3/3 | Deploy: deal 2 Psi damage to an enemy unit; if it dies, Purge it |
| Thermal Venting | Vance | Order, 2-cost | Choose one: deal 2 damage to enemy units in Thermal Boreholes and gain 1 Energy a Borehole (up to 3); or turn a lane into a Thermal Borehole and gain 1 Energy |
| Mercenary Contractor | Vance | Unit, 3-cost 3/3 | Deploy: add a Design Workshop to your hand. Overcharge 2: draw a card and gain 2 Armor |
| Frontier Surveyor | Redline | Unit, 3-cost 2/2 Mobile | Deploy: +1/+1 for each different terrain type on the board (up to +2/+2) |

Eleven of these are in no preset, so self-play says nothing about them: Telemetry Drone, Seismic Ping, Containment Purge, Suppressive Scatter, Tectonic Shaper, Condenser Array, Grav-Pull Winch, Salvage Blueprint, Market Forecast, Mercenary Contractor and, after the review, Breach Protocol.

### Preset lists

| Deck | Out | In |
|---|---|---|
| Fungal Psi-Bloom | 1 Symbiotic Bond, 1 Spore Tender | 2 Prescient Empath |
| Hive Fortress | 2 Colony Former | 2 Bio-Scrubber Rig |
| Transcendence Protocol | 2 Network Node | 2 Datalinks Index |
| Prototype Lab | 2 Cyber Probe | 2 Field Refit |
| Martyr Inquisition | 2 Ash Mourner | 2 Omen Seer |
| Thermal Syndicate | 2 Underwriter | 2 Thermal Venting |
| Trade War | 1 Bribe | 1 Salvage Impound |
| Ridge Vanguard | 1 Field Spotter, 1 Headhunter | 2 Frontier Surveyor |
| Hit and Run | 1 Limpet Charge | 1 Squall Chart (the first version took out both Shivs for two; see below) |

Overcharge Mercs first swapped its Bribe for a Breach Protocol; the review put the Bribe back (see below).

### Corrections after review

Claude reviewed the pass the same day. Ten decks had changed their lists and four of them had been measured, at 16 games a pairing, so the whole field was run (100 games a pairing): Ridge Vanguard read 57.3% and Hit and Run 42.3%. Separately, a Forecast played by a person could copy one card and lose another.

| What | As first written | Now | Why |
|---|---|---|---|
| Forecast for a person | The game waited for the pick with the cards still in the deck, and the rest of the card's effect ran on. A draw in that window (the Research an Order gives reaching a Breakthrough, for one) moved the deck under the choice: one card ended up owned twice and another was gone. | While the choice is open, the cards being looked at are held out of the deck and that player's draws wait for the pick. | A real bug in play on the page. The sims never met it, because the AI picks at once. Reproduced with Seismic Ping at 3 Research; now a test. |
| Two Forecasts at once | The second replaced the first, so two staffed Datalinks Indexes gave a person one pick. | The second waits and opens after the first. | The same review. |
| The AI's Forecast pick | It never saw Prescient Empath's bonus for picking a Native unit, because the bonus was read before it was set. | It sees it. | Fungal Psi-Bloom read 54.8% in the run before this fix and 57.2% in the run after it (±1.9 each, on different seeds, so how much of that is the fix is not certain). The next row answers it. |
| Prescient Empath | 2/2 | 1/2 | Fungal Psi-Bloom at 57.2% (±1.9). At 1/2 it measured 49.7% (±1.3). |
| Frontier Surveyor | 3/3, up to +3/+3 | 2/2, up to +2/+2 | Ridge Vanguard at 57.3%, and 9.4 points better in games where it had seen the card by turn 5. The standard map has two kinds of terrain and the deck makes a third, so it was a 5/5 or 6/6 Mobile unit for 3 Energy. Now 50.1% (±1.3). |
| Hit and Run's list | 2 Squall Chart in place of 2 Shiv | Both Shivs back; 1 Squall Chart in place of the Limpet Charge | The deck fell from 49.4% to 43.0%. Shiv draws a card and Squall Chart does not, and this deck runs out of cards. With the Shivs back it measured 48.8%, and 50.7% with the one Squall Chart. |
| Pull (Grav-Pull Winch) | Moved the unit to whichever neighbouring lane was free, preferring the one nearer the centre, so a unit in the centre lane was pulled outward | Only ever toward the centre: a unit in the centre lane, or with the inward lane taken, stays put | The card says "toward the centre". The card is in no preset. |
| Overcharge Mercs' list | 1 Breach Protocol in place of the Bribe | The Bribe is back | The deck read 55.8%, 55.3% and then 56.8% (±1.3) in the first confirmation run; it was 53.5% before the swap. With the Bribe back it measured 54.4%. Breach Protocol is now in no preset. |
| Reassembly Bay | 5 Integrity | 4 Integrity | Reclamation Yard read 55.1% at the end of the second pass and 56.3%, 54.6% and 55.9% in this one, and is 11.9 points better when it has seen the Bay by turn 5. The Bay alone at 4 measured 54.6%. Letting it rebuild only units costing 2 or less was tried and overshot to 46.0%. |
| Recovery Crawler | 3/4 | 3/3 | With the Bay change: Reclamation Yard measured 52.2% (±1.3). |
| Cybernetic (doctrine) | Start at 2 Research, Tech thresholds 1 lower; the colony cannot gain Armor | Removed, with the three engine rules only it used (`techReduction`, `noArmor`, `armor`) | Schwab's call after the review: it was Knowledge again. 2 Research with thresholds 1 lower is 3 Research for Tech and the Workshop, which is what Knowledge gives. Its drawback cost most decks nothing and Ironclad Trust 31 points. No preset used it, so no balance figure changes. A deck saved with it plays as Frontier. An idea for bringing it back is under "Not yet confirmed" in content-approach.md. |

### The three doctrines, priced again over all 28 decks

`node test/meta.js 12 5 --doctrines police,cybernetic,planned`: each deck with the doctrine against every deck on Frontier, minus the same deck on Frontier. The average is good to ±1.4 and a single deck's figure only to ±7.6.

| Doctrine | Average over 28 decks | Most helped | Most hurt |
|---|---|---|---|
| Police State | +0.5 | Deep Roots +8.0, Martyr Inquisition +6.8 | Critical Mass −11.3, Heartwood Colossus −8.9 |
| Cybernetic | −1.7 | Prototype Lab +14.9, Datalinks Cascade +13.7 | Ironclad Trust −31.5, Reclamation Yard −21.1, Siege Artillery −14.3 |
| Planned | −0.7 | Critical Mass +8.9, Trade War +4.8 | Heartwood Colossus −10.7, Fungal Psi-Bloom −7.1 |

Cybernetic was removed after this pricing (see the corrections above); its row is kept as the record. All three were worth about nothing to the average deck, which is the target. Cybernetic was the most one-sided: "cannot gain Armor" takes a third of Ironclad Trust's win rate, and the lower Tech thresholds give the University decks 7 to 15 points. That is a doctrine doing its job for the decks that suit it, but swings that large on single decks, measured at 12 games a pairing, need pricing again at more games before a preset is put on it. Police State is worth +0.3 to Hive Fortress, the one deck that uses it.

### Still out of range

- **Thermal Syndicate reads 55.4% (±1.3).** It read 53.6% to 54.1% in the four runs before this one, so it was left alone. If it reads over 55% again, it is real.
- **Hive Fortress now beats all four Vance decks past the line, where it was two:** Trade War 80%, Full Portfolio 73%, Overcharge Mercs 70%, Thermal Syndicate 70%. It also beats Ironclad Trust 76%. It is in nine of the 54 lopsided matchups, up from five. The pass changed two things in that deck at once (the new Police State, and Bio-Scrubber Rig for Colony Former) and neither was tried alone against the Vance decks. Police State prices at +0.3 (±7.6) for this deck over the whole field, which points at the Rig's 3 Armor and card, but that is a guess until one is knocked out with `PATCH`.
- **The answers made for Shielded and returning Guards have not moved those matchups.** Reclamation Yard still beats Trade War 77%, and Ironclad Trust and Full Portfolio 70%. Salvage Impound is one copy in one deck, and Breach Protocol, Suppressive Scatter and Containment Purge are in none.
- **Reclamation Yard is in range at 51.8% and still lopsided:** eight matchups past 65/35. It loses to Transcendence Protocol 69% and Fungal Psi-Bloom 68%.
- **The combo deck is still the most lopsided deck,** in ten of the 54. Critical Mass loses 73–83% to Full Portfolio, Ironclad Trust, Siege Artillery, Trade War, Thermal Syndicate and Overcharge Mercs, and beats Canopy Swarm 78% and Transcendence Protocol 74%. The AI still does not save up for one large turn; play it by hand before trusting these.
- **Eleven of the 20 new cards are in no preset** (listed above), and the new Planned doctrine is used by none. Nothing here says whether they are too strong or too weak.
- **Field Refit is a Design Workshop that is 1 Energy cheaper** for any unit costing 2 or more: 2 Energy for the Order and 2 off the unit, against 1 and none. Prototype Lab runs two of each and reads 53.7%, so it is not out of range, but the plain Workshop has no reason to be picked over it in a custom deck.
- **Hive Fortress still loses 4.8 points (±4.0) when it sees its Secret Project by turn 5.** For the other four decks whose keystone is a project, Archive closed that gap.
- **27 cards still move their deck by more than 10 points** depending on whether it has seen them by turn 5. They are the same 1- and 2-cost openers.
- **Council Decrees are untested by self-play.** Each has unit tests; no balance tool plays with one. Their effects are written into the engine by id, not held as data the way a doctrine's are, and the Planetbloom Decree's id (`fungal_bloom`) is also a card's id.
- **The AI plays the Liquidator as a plain 4/5, and has no use for Evac Shuttle.** Both carried over from the second pass, unchanged.

## 2026-11-25, second pass: the opening mulligan, the first player, and the New Doctrines expansion

### Result

| | Before this pass | After |
|---|---|---|
| Preset decks | 21 | 28 |
| Deck win rates | 45.9% to 54.2%, none outside 45–55% | 45.8% to 55.1% (±1.3); one deck, Reclamation Yard, is 0.1 over |
| Matchups past 65/35 | 34 of 210 (16%) | 58 of 378 (15%), 20 of them beyond the margin of error |
| First player's win rate | 47.3% | 49.2% (±0.4) |
| Card pool | 208 | 233 |

The "after" column is 200 games a pairing on seeds that were not used for tuning.

All 28 decks in that run, each ±1.3:

| Deck | Win rate | Deck | Win rate |
|---|---|---|---|
| Reclamation Yard | 55.1% | Canopy Swarm | 49.4% |
| Datalinks Cascade | 55.0% | Full Portfolio | 49.4% |
| Thermal Syndicate | 53.6% | Hit and Run | 49.4% |
| Prototype Lab | 53.5% | Air Cavalry | 49.1% |
| Overcharge Mercs | 53.5% | Believer Crusade | 48.4% |
| Fungal Psi-Bloom | 52.7% | Skyjack Armada | 48.2% |
| Martyr's Garden | 51.3% | Trade War | 48.2% |
| Flanking Federation | 51.2% | Ironclad Trust | 48.0% |
| Hive Fortress | 51.1% | Trial by Fire | 47.9% |
| Ridge Vanguard | 50.9% | Supply Lines | 47.6% |
| Heartwood Colossus | 50.8% | Deep Roots | 47.2% |
| Transcendence Protocol | 50.2% | Blooded Veterans | 46.8% |
| Black Market Heist | 49.8% | Critical Mass | 46.2% |
| Siege Artillery | 49.5% | Martyr Inquisition | 45.8% |

### Rules

| Rule | Before | After | Why |
|---|---|---|---|
| Opening mulligan | None | Before the first turn each player may swap any cards of their opening hand for new ones from the deck, once. The replacements are drawn first and the swapped cards are then shuffled in. Energy Cells cannot be swapped. | Approved in content-approach.md. Decks had seen a two-copy keystone by turn 5 in 48–60% of games; with the AI's keep rule that is 53–64%. |
| First player's Integrity | Same as the second player's | The player who moves first starts with 4 more Integrity | The mulligan helps the second player more, because they have five cards to swap against three: the first player's win rate fell from 47.3% to 46.0%. With 4 Integrity it measured 49.7%, and 49.2–49.5% in the four later runs. Taking one of the second player's two extra cards instead overshot to 56.7%. |
| Overrun (new keyword) | | Damage beyond what destroys an enemy unit carries on into the enemy colony | For the go-tall deck: without it one large unit is held off for ever by a 1/1. |
| Returning to hand (new) | | A unit can leave play for its owner's hand as a fresh card. It is not destroyed: no Last Stand, and it does not count as lost. A token is removed from play. | For the hit-and-run cards. |
| The fallen (new) | | The game records each player's destroyed units, tokens aside, so cards can bring them back or count them. | For the recursion cards. |

What the AI does with its mulligan: it keeps cards costing 2 or less, keeps a 3-cost card when it has a cheap card or an Energy Cell to go with it or the card is a keystone of its deck, and sends back everything else, Secret Projects included. Measured over all 21 decks, that rule beats keeping every card 54% to 46% (±0.8), and every deck gains from it, from 2 points (Ironclad Trust) to 14 (Skyjack Armada). Keeping only 1-cost cards, or keeping up to 3-cost cards, measured the same or slightly worse (50.3% and 49.2% against it). The Colonist level keeps whatever it is dealt.

### Cards that changed

| Card | Before | After | Reason |
|---|---|---|---|
| Critical Mass | 4-cost, 1 Psi damage + 2 a card | 3-cost, 2 Psi damage + 2 a card | Its deck fell to 41.9% once every other deck had a mulligan and the first player more Integrity. |
| Fervent Runner | 1/1 | 1/2 | Believer Crusade at 44.3%. |
| Doomsayer | 3/4 | 3/5 | The same. |
| Ironclad Behemoth | 4/5 | 4/6 | Ironclad Trust at 43.3%. |
| Hull Plating | 3 Armor | 4 Armor | The same. |
| The Space Elevator | 4-cost | 3-cost | Skyjack Armada at 44.9%, and 9 points worse in games where it drew the project early. |
| Holdings Magnate | 3/3 | 3/4 | Full Portfolio at 44.9%. |

No preset from the earlier line-up changed its list.

### New cards: the New Doctrines expansion

25 cards. Each mechanic is in the engine for any faction to use, not tied to the faction that got the first cards for it.

| Card | Faction | Type | What it does |
|---|---|---|---|
| Evac Shuttle | Colonist | Order, 1-cost | Return a friendly unit to your hand; it costs 1 less |
| Graftling Champion | Stepdaughters | Unit, 2-cost 2/2 | The first time each turn you target it with an Order or your leader power, it gains +1/+1 |
| Ironbark Graft | Stepdaughters | Order, 1-cost | Give a friendly unit Shielded; draw a card |
| Thunderback | Stepdaughters | Unit, 4-cost 4/4 | Overrun |
| Stampede Pheromone | Stepdaughters | Order, 3-cost | Give a friendly unit +2/+2 and Overrun |
| Recovery Crawler | Iron Hive | Unit, 3-cost 3/4 | Deploy: return the costliest friendly unit destroyed this game to your hand |
| Reassembly Bay | Iron Hive | Location, 2-cost | Cycle End: if no unit is stationed here, rebuild here a friendly unit destroyed this game that costs 3 or less |
| Wreck Marshal | Iron Hive | Unit, 5-cost 4/4 | Deploy: +1/+1 for each of your units destroyed this game, tokens aside (up to +4/+4) |
| Systems Engineer | University | Unit, 2-cost 2/2 | Deploy: add a Design Workshop to your hand |
| Skunkworks | University | Location, 3-cost | Cycle Start: if you have no Design Workshop in hand, add one. Units you design cost 1 less |
| Proving Ground | University | Location, 2-cost | Whenever you deploy a unit you designed, it gains +1/+1 |
| Reef Skirmisher | Tidewater | Unit, 2-cost 2/2 Blitz | Takes no damage back when it attacks. Cycle End: return it to your hand |
| Undertow | Tidewater | Order, 4-cost | Return an enemy unit to its owner's hand (a token is removed from play) |
| Hidden Cove | Tidewater | Location, 1-cost | Whenever a friendly unit returns to your hand, add an Energy Cell to your hand |
| Ember Flagellant | Cinder | Unit, 2-cost 1/4 | Whenever it survives damage, it gains +2 Attack |
| Trial by Fire | Cinder | Order, 3-cost | Deal 1 damage to every unit; then give your units +1/+1 |
| Cinder Scourge | Cinder | Unit, 3-cost 3/4 | Whenever it survives damage, deal 2 damage to a random enemy |
| Scarred Penitent | Cinder | Unit, 4-cost 2/7 | Has +1 Attack for each damage it has taken |
| Trade Embargo | Vance | Location, 2-cost | The first card your opponent plays each turn costs 1 more (Energy Cells are exempt and do not use it up) |
| Hostile Audit | Vance | Order, 2-cost | Jam an enemy unit or location for 1 cycle and deal 2 damage to it |
| Repo Agent | Vance | Unit, 2-cost 2/3 | The first time each turn an enemy unit or location becomes Jammed, add an Energy Cell to your hand |
| Liquidator | Vance | Unit, 4-cost 4/5 | Deploy: destroy a Jammed enemy unit |
| Airdrop Beacon | Redline | Location, 3-cost | When built and at each Cycle Start: drop a Supply Pod here if there is none; the unit stationed here claims it |
| Logistics Officer | Redline | Unit, 2-cost 2/2 Mobile | Whenever you claim a Supply Pod, it gains +1/+1 |
| Supply Convoy | Redline | Unit, 3-cost 2/3 | Deploy: drop a Supply Pod into each neighbouring lane that has none |

Numbers that moved while the new decks were being tuned. The first run of the seven decks read 58%, 55%, 52%, 42%, 41%, 40% and 32%.

| Card | First version | Now | What the measurement was |
|---|---|---|---|
| Graftling Champion | 2/3, +1/+1 every time it is targeted | 2/2, first time each turn | Heartwood Colossus at 58.2%, and 17 points better in games where it drew the Champion. |
| Reef Skirmisher | 3/2, takes damage back | 2/2, takes none | A Blitz unit may only strike units on the turn it arrives, so the first version traded itself away and its deck read 31.9%. At 3/2 with no damage back the deck read 59.6%. |
| Hidden Cove | 2-cost | 1-cost | Its deck won 7–8 points less often when it drew the Cove early. |
| Undertow | 3-cost | 4-cost | Hit and Run at 56.4%, and 70% against Heartwood Colossus, whose one large unit it sends back to hand. |
| Skunkworks | No discount, 4 Integrity | Units you design cost 1 less, 3 Integrity | Prototype Lab at 39.6%: a designed unit is priced like a premade one, so paying 1 for the Workshop each time was a loss. With the discount and 4 Integrity it read 58.3%. |
| Trade Embargo | 3-cost | 2-cost | Trade War at 41.9%, and 9 points worse when it drew the Embargo early. |
| Liquidator | 5-cost 4/5 | 4-cost 4/5 | The same. |
| Airdrop Beacon | 3-cost, 4 Integrity, first Pod at the next Cycle Start | 3-cost, 3 Integrity, a Pod as soon as it is built | Supply Lines at 41.4% with a location that did nothing on the turn it was built. At 2-cost with the Pod at once the deck read 64.9%. |
| Supply Convoy | 2/4 | 2/3 | Supply Lines at 62.0%. |
| Recovery Crawler | 2/4 | 3/4 | Reclamation Yard at 44.7% after its list changed (below). |
| Reassembly Bay | 3-cost | 2-cost | The same. |

Two findings about the lists. Reclamation Yard first ran Bulwark Drones, and the Bay rebuilt them with their Shield every turn: the deck beat all four Vance decks 76–82%, because Vance answers units with single large hits. The list now runs Perimeter Sentries and Turret Nests instead. Hit and Run first ran Evac Shuttles, which the AI almost never plays (see below).

Evac Shuttle is in no preset, and neither is Site Planner.

### The seven new decks

Each faction's fourth preset is built around one mechanic. None of them is a Pact deck.

| Deck | Faction | Doctrine | Plan | Win rate |
|---|---|---|---|---|
| Heartwood Colossus | Stepdaughters | Frontier | Go tall: pour every Graft and Order into one unit, then Overrun | 50.8% |
| Reclamation Yard | Iron Hive | Frontier | Recursion: trade units freely, rebuild the small ones and bring back the large | 55.1% |
| Prototype Lab | University | Knowledge | The Design Workshop deck: a Workshop every turn and cheaper, larger designs | 53.5% |
| Hit and Run | Tidewater | Frontier | Blitz raiders that strike and slip back to hand, and Undertow to send enemy units back | 49.4% |
| Trial by Fire | Cinder | Frontier | Self-damage: units that grow or lash out when they survive damage, and Orders that hurt everyone | 47.9% |
| Trade War | Vance | Frontier | Denial: tax the enemy's first card each turn, Jam their best pieces, destroy what is Jammed | 48.2% |
| Supply Lines | Redline | Frontier | Supply Pods: Beacons and Convoys drop them, Mobile units collect them, Logistics Officers grow | 47.6% |

### Still out of range after that pass

Superseded by the list in the pass above; kept as the record of where the second pass stopped.

- **Reclamation Yard reads 55.1% (±1.3), a hair over the range, and its matchups are lopsided.** It beats Full Portfolio, Ironclad Trust, Thermal Syndicate and Trade War 72–78%, and loses to Fungal Psi-Bloom and Transcendence Protocol 33–35%. Slow decks cannot outlast units that keep coming back; Psi damage and Xenofungus clear the rebuilt units as fast as they arrive.
- **The combo deck is still the most lopsided deck.** Critical Mass loses 73–84% to Ironclad Trust, Trade War, Thermal Syndicate, Siege Artillery, Full Portfolio and Overcharge Mercs, and beats Canopy Swarm, Fungal Psi-Bloom and Transcendence Protocol 70–76%. The AI still does not save up for one large turn, so its figures remain a floor; play it by hand before trusting them.
- **58 of 378 matchups read past 65/35**, about the same share as before (15% against 16%). The decks in most of them are Critical Mass (11), Full Portfolio (14: it loses to Reclamation Yard, Thermal Syndicate, Deep Roots, Martyr's Garden and Prototype Lab, and beats five fast decks), Reclamation Yard (9) and Thermal Syndicate (9). Fungal Psi-Bloom beats Hive Fortress 79%.
- **The Vance decks have no answer to Guards that are Shielded or keep returning.** Hive Fortress beats Trade War 75% and Ironclad Trust 74%. Vance removal is single large hits; it needs something that hits several times or ignores Shields.
- **The AI plays the Liquidator as a plain 4/5.** In 112 Trade War games it found a Jammed unit to destroy in one Liquidator play in five. A person who Jams first and then plays it will get more from the deck than its 48% suggests.
- **The AI has no use for Evac Shuttle**, so it is in no preset and its strength is untested. It can see that giving up a unit on the board for a card in hand is a loss, and cannot see the Deploy effect it would get back next turn. That is my reading of why the card read −3.9 in its first deck; I did not count how often it was played.
- **Secret Projects are still bad to draw early.** The AI now sends them back in the mulligan, so decks see theirs by turn 5 in 24–30% of games, and still win 5–6 points less often when they do (Believer Crusade, Hive Fortress, Canopy Swarm).
- **30 cards still move their deck by more than 10 points** depending on whether it has seen them by turn 5 (37 before the mulligan). They are the same 1- and 2-cost openers. The mulligan lets a deck look for them, and having one on the first turn still matters as much.
- **Police State was not revisited.** It is still worth far more to a Guard-heavy deck than the other doctrines are to theirs.
- **The look-ahead keyword is not built.**
- **The 25 new cards have no painted art**; they show their emoji. The art pipeline only runs on Schwab's machine.


## 2026-11-25: doctrines, the first rebalance, and the Pacts expansion

### Result

| | Before | After |
|---|---|---|
| Preset decks | 14 | 21 |
| Deck win rates | 40.6% to 65.2%, nine of 14 outside 45–55% | 45.9% to 54.2%, none outside |
| Matchups past 65/35 | 24 of 91 | 34 of 210 |
| What a doctrine is worth to the average deck | −3 to +21 points over no doctrine | −1.5 to +4.3 points against Frontier |
| First player's win rate | 48.3% | 47.3% |

The "after" row is 200 games a pairing on seeds that were not used for tuning. The 14 original decks on their own, before the new decks were added, stood at 45.6% to 57.2% with 8 of 91 matchups past 65/35.

### Doctrines

The doctrines were the largest single cause of the spread. Measured across the 14 decks against a field with no doctrines, Free Market was worth 21 points of win rate to the average deck, Power 14 and Police State 8, while Green was worth nothing and Knowledge cost 3. Skyjack Armada was a 37% deck carried to 57% by Free Market.

What the trials found, which the new numbers rest on: one starting Energy Cell is worth about 11 points, one starting card about 9, and 5 colony Integrity under 3.

| Doctrine | Before | After | Value after, against Frontier (average of 21 decks, ±1.5) |
|---|---|---|---|
| Frontier | No effect | Colony starts at 35 Integrity | (the baseline) |
| Free Market | Start with 2 Energy Cells; locations enter with −1 Integrity | Start with 1 Energy Cell; opening hand one card smaller | −1.5 |
| Knowledge | Start at 2 Research; enemy Orders deal +1 damage to you | Start at 3 Research; enemy Orders deal +1 damage to you | −0.5 (+5 to +14 for the three research decks) |
| Power | All units Zeal 1; Breakthroughs need +2 Research | The same, and opening hand one card smaller | 0.0 |
| Green | Units heal in Xenofungus; lanes 2 & 6 gain Xenofungus if clear; 28 Integrity | Lanes 2 & 6 start as Xenofungus whatever the map put there; Xenofungus does not harm your units; 28 Integrity | +0.9 |
| Police State | Start with 5 Armor; Guards +0/+1 on arrival; hand size 8 | Guards +1/+0 on arrival; hand size 8 | +4.3 |

Notes:

- Green did nothing for its own faction on the default map, because lanes 2 and 6 always have terrain there and Planet's units already heal in Xenofungus.
- Police State changed from health to Attack because health made Hive Fortress better against slow decks it already beat, and Attack made it better against the fast decks it lost to (7 to 16 points) with no change against the slow ones.
- The doctrine numbers now live in `DOCTRINES` in `js/world.js` (`rules`) instead of being written into the engine.

### Rules

| What | Before | After | Why |
|---|---|---|---|
| Barricade (Iron Hive leader power token) | "Cannot move or attack", but the engine only stopped it moving | It cannot attack either | A Barricade given Attack by Line Captain or Riot Plating was attacking: about 5 colony damage a game in Hive Fortress |
| Barricade | Permanent | Loses 1 health at the start of each of its owner's turns | A free Guard every turn locked the three slow decks out completely. Hive Fortress won 65–78% against them with the power and 53–64% without it |

### Card changes

**University of Tau Ceti.** Datalinks Cascade reached 60.5% once Knowledge started at 3 Research, and beat the small-unit decks 70–83%.

| Card | Before | After | Why |
|---|---|---|---|
| Data Spike | Tech 3: 3 damage | Tech 5 | Tech 3 is switched on from the first turn under the new Knowledge |
| Neural Siphon | Tech 3: draw | Tech 5 | The same |
| Datalinks Analyst | 2-cost 2/3 | 2/2 | Lift +4.0; a deck that had seen it by turn 5 won 14–19 points more often |
| Arc Lattice | Tech 6: 3 damage | Tech 8 | Datalinks against Canopy Swarm and Fungal Psi-Bloom |
| Prism Adept | 3-cost 2/5 | 2/4 | The same |
| Resonance Weaver | 3-cost 2/4 | 2/5 | Transcendence Protocol at 44% |

**Transcendence Protocol and the cards aimed at it.** The Cinder decks beat it 69–74%, which is a hard counter.

| Card | Before | After | Why |
|---|---|---|---|
| The Voice of Planet | 8-cost, 6 Integrity | 7-cost, 8 Integrity | An Iconoclast razed it in one hit |
| The Hunter-Seeker Algorithm | 5-cost | 4-cost | Lift −4.1; it is the deck's answer to burn |
| Colony Pod | Restore 1 | Restore 2 | Lift −5.0 |
| Anathema | 4 damage if the opponent has 5+ Research | 3 damage | Believer Crusade beat Transcendence Protocol 74–80% |
| Iconoclast | Double damage to locations | +2 damage to locations | Lift +5.9; it destroyed any location in one attack |
| Inquisitor Cell | 2/4; 2 damage for each enemy Order | 2/5; 1 damage | Martyr Inquisition beat Transcendence Protocol 69–71% |

**The Redline Federation.** Ridge Vanguard was at 59% and Flanking Federation at 46%.

| Card | Before | After | Why |
|---|---|---|---|
| Drop Pod Squad | 4-cost 3/4 | 3/3 | Lift +5.9, the highest in the faction |
| Ridge Battery | 3-cost 1/3 | 1/2 | Lift +4.4; only Ridge Vanguard runs it |
| Headhunter | 4-cost 4/3 | 4/4 | Lift −1.4 |
| Ambush Squad | 3-cost 3/3 | 3/4 | Flanking Federation fell to 38% after the shared nerfs |
| Command Center | 2-cost | 1-cost | Lift −3.0 |
| Forward Outpost | 2-cost | 1-cost | Flanking Federation |
| The Command Nexus | 4-cost | 3-cost | Lift −5.3 |

**Planet's Stepdaughters.** Fungal Psi-Bloom was at 56.5% and Canopy Swarm at 46%.

| Card | Before | After | Why |
|---|---|---|---|
| Spore Tender | 2-cost 1/2 | 1/1 | Lift +5.8, the highest in the faction |
| Podling Carrier | 3-cost 2/2 | 2/3 | Canopy Swarm |
| Mulch Bed | 2-cost | 1-cost | Lift −0.9 |
| The Xenoempathy Dome | 6-cost | 5-cost | Decks won 7 points less often when they drew it early |
| Worldroot Titan | 8-cost | 7-cost | Canopy Swarm |
| The Cloning Vats | 6-cost | 5-cost | Lift −1.9 |

**The Iron Hive.** Hive Fortress was at 36% without its old doctrine and Siege Artillery at 46.5%.

| Card | Before | After | Why |
|---|---|---|---|
| Line Captain | Other Guards +0/+2 | +1/+2 | Worth about 8 points to Hive Fortress, most of it against fast decks |
| Riot Plating | +1/+3 and Guard | +2/+3 and Guard | Lift −1.1 |
| Automated Crane | 3-cost 3/3 | 3/4 | Lift −0.7 |
| Works Foreman | 4-cost 3/3 | 3/4 | Hive Fortress |
| Siege Walker | 5-cost 4/5 | 4/6 | Both Iron Hive decks |
| Salvage Hauler | 3 Armor | 4 Armor | Lift −0.7 |
| The Citizens' Defense Force | 7-cost | 6-cost | Lift −3.7; decks won 7 points less often when they drew it early |
| Orbital Salvo | 6-cost | 5-cost | Siege Artillery |
| Railgun Battery | 4-cost 3/4 | 3/5 | Siege Artillery |
| Bastion Gunner | 3-cost 2/3 | 2/4 | Siege Artillery |

**The Tidewater Pirates.** Skyjack Armada was at 35% without its old doctrine. In random decks every Aerial unit read below average.

| Card | Before | After | Why |
|---|---|---|---|
| Skyjack Raider | 3-cost 3/3 | 3/4 | Lift −2.0 |
| Needlejet Corsair | 4-cost 3/4 | 4/4 | Lift −1.7 |
| Tidewater Gunship | 6-cost 5/5 | 5/6 | Lift −0.2 |
| Patrol Chopper | 5-cost 4/4 | 4-cost 4/4 | Lift −2.7 |
| Cell Runner | +1/+0 for each Energy Cell played | +1/+1 | Free Market now gives one Cell, not two |
| Smuggler's Dock | Arrivals gain Blitz | Blitz and +1/+0 | Lift −4.4 |
| The Space Elevator | 6-cost | 4-cost | Lift −5.0; Skyjack Armada won 10 points less often when it drew it early |
| The Maritime Control Center | 6-cost | 5-cost | Lift −2.4 |
| Salvage Boss | 3-cost 3/4 | 3/3 | Black Market Heist rose to 55% on the shared Aerial buffs |

**The Cinder Believers.** Believer Crusade fell into range with the Power change alone. Martyr Inquisition was at 46%.

| Card | Before | After | Why |
|---|---|---|---|
| Penitent Warden | 2-cost 1/4 | 2/4 | Martyr Inquisition |
| Heresy Hunter | 2-cost 2/2 | 2/3 | Martyr Inquisition, after the Inquisitor Cell change |

**Vance Industries.**

| Card | Before | After | Why |
|---|---|---|---|
| Guild Enforcer | Overcharge 2: 4 damage | 5 damage | It now destroys a Turret Nest or Foundry; the Vance decks had no answer to locations behind Guards |
| Underwriter | 2-cost 2/4 | 2/3 | Thermal Syndicate at 54% |

### Preset lists

| Deck | Change | Why |
|---|---|---|
| Hive Fortress | −1 Riot Plating, −1 Dreadnought Chassis, −1 Perimeter Defense; +1 Killing Ground, +2 Colony Former | It lost to Fungal Psi-Bloom 17–31%: Colony Former clears Xenofungus. Fewer late cards against fast decks |
| Datalinks Cascade | −1 Quantum Cascade, +1 Theorem Guard | Less sweeping damage against small-unit decks, one more body against large ones |
| Skyjack Armada | −2 Smuggler's Dock, +2 Squadron Leader | The Dock was its weakest card |
| Flanking Federation | −1 Elite Commando, −1 Colonel's Vanguard; +2 Task Force Commander | Two fewer cards that cost 5 or more in a fast deck |

### The Pacts expansion: 18 new cards

| Card | Faction | Type | What it does |
|---|---|---|---|
| Site Planner | Colonist | Unit, 2-cost 1/3 | Deploy: draw a location from your deck |
| Heavy Requisition | Colonist | Order, 1-cost | Draw a unit that costs 5 or more from your deck |
| Grav Harness | Colonist | Order, 2-cost | Give a friendly unit Aerial and +1/+0 |
| Sapwell Tender | Stepdaughters | Unit, 2-cost 1/3 | Cycle Start: if this lane has terrain, gain 1 Energy this turn |
| Verdant Surge | Stepdaughters | Order, 5-cost | Give all friendly units +1/+1 |
| Bulkhead Slam | Iron Hive | Order, 2-cost | Deal damage to an enemy unit or location equal to your Armor (up to 6) |
| Ironclad Behemoth | Iron Hive | Unit, 4-cost 4/5 | Deploy: +1/+1 for every 3 Armor (up to +3/+3) |
| Critical Mass | University | Order, 4-cost | 1 Psi damage to the enemy colony, plus 2 for each other card you played this turn |
| Datalinks Search | University | Order, 1-cost | Draw an Order that costs 3 or more from your deck |
| Squadron Leader | Tidewater | Unit, 3-cost 2/3 Aerial | Deploy: your other Aerial units gain +1/+0 |
| Smuggler's Run | Tidewater | Order, 1-cost | Add 2 Energy Cells to your hand |
| Rite of Ash | Cinder | Order, 1-cost | Destroy a friendly unit; draw 2 cards |
| Pyre Keeper | Cinder | Unit, 2-cost 2/2 | Whenever another friendly unit is destroyed, 1 damage to the enemy colony |
| Claims Adjuster | Vance | Unit, 3-cost 3/4 | The first time your colony gains Armor each turn, +1/+1 |
| Holdings Magnate | Vance | Unit, 4-cost 3/3 | Deploy: +1/+1 for every 2 other cards in your hand |
| Consortium Titan | Vance | Unit, 10-cost 7/7 | Costs 1 less for each other card in your hand |
| War College | Redline | Location, 2-cost | Whenever a friendly unit is promoted, it gains +1/+1 and you draw a card |
| Task Force Commander | Redline | Unit, 4-cost 3/3 | Deploy: +1/+1 for each different keyword among your other units (up to +3/+3) |

Numbers that moved while the new decks were being tuned: Verdant Surge 4-cost to 5 (Martyr's Garden at 62%); Squadron Leader +1/+1 to +1/+0 and Task Force Commander's cap +4 to +3 (Air Cavalry at 61%); Ironclad Behemoth 5-cost to 4 and Claims Adjuster 2/4 to 3/4 (Ironclad Trust at 34%, then 41%); Critical Mass from "2 damage to anything, +1 a card" at 3-cost to its present form (see below).

Site Planner is in no preset yet.

### The seven Pact decks

| Deck | Faction + partner | Doctrine | Plan | Win rate |
|---|---|---|---|---|
| Deep Roots | Stepdaughters + Iron Hive | Frontier | Ramp: extra Energy from terrain and Fusion Reactors, then Titans and Dreadnoughts | 46.6% |
| Ironclad Trust | Iron Hive + Vance | Frontier | Stack colony Armor and spend it as damage | 47.6% |
| Critical Mass | University + Tidewater | Knowledge | Combo: play a string of cheap Orders and Energy Cells in one turn, finish with Critical Mass | 46.9% |
| Air Cavalry | Tidewater + Redline | Free Market | Aerial units stacked with keywords | 52.8% |
| Martyr's Garden | Cinder + Stepdaughters | Frontier | Sprouts to sacrifice, and a payoff for every death | 53.4% |
| Full Portfolio | Vance + University | Frontier | Keep a full hand; Magnates and a cheap Consortium Titan | 48.5% |
| Blooded Veterans | Redline + Cinder | Frontier | Zeal wins the first fight; promotions snowball | 47.9% |

### Still out of range after that pass

Superseded by the list in the pass above; kept as the record of where the first pass stopped.

- **The combo deck is the most lopsided deck in the game.** Critical Mass wins 70–72% against Canopy Swarm and Fungal Psi-Bloom and loses 77–86% to Ironclad Trust, Full Portfolio, Overcharge Mercs, Siege Artillery and Thermal Syndicate. Making Critical Mass ignore Armor and changing the list moved which matchups were lopsided, not how many.
- **The AI does not play the combo deck as a combo deck.** In trials, telling it to hold Critical Mass and bank Energy Cells for one big turn cost it 1 to 4 points; it does best playing everything as soon as it can. A person saving cards for one turn will do better than these figures, by an unknown amount. Play it by hand before trusting them.
- **34 of 210 matchups read past 65/35.** Apart from the combo deck's, the repeat offenders are Full Portfolio (loses to Overcharge Mercs, Thermal Syndicate, Hive Fortress and Martyr's Garden; beats Skyjack Armada and Air Cavalry), Hive Fortress against Ironclad Trust and Overcharge Mercs (70–72%), Datalinks Cascade against Martyr's Garden, Deep Roots and Skyjack Armada (69–74%), and Fungal Psi-Bloom against Hive Fortress (67%).
- **Police State is worth too much to a deck full of Guards.** It averages +4 over Frontier, but +15 for Siege Artillery and +18 for Ironclad Trust, neither of which uses it. In one trial Ironclad Trust on Police State, with slightly cheaper cards than it has now, was a 67% deck. The other doctrines top out at +7 to +14 for their best deck.
- **Secret Projects are still bad to draw early.** Believer Crusade and Skyjack Armada win 9–10 points less often when they have seen theirs by turn 5, even at the lower costs.
- **Cheap openers still swing games.** 37 cards move their deck's win rate by more than 10 points depending on whether it has seen them by turn 5; nearly all cost 1 or 2. Research Fellow is the largest at +17 to +23. This was left for the opening mulligan, which is not built.
- **The second player is ahead**: the first player wins 47.3% (±0.5), outside the proposed 48–52%.
