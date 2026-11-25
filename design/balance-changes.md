# Balance changes

Every nerf, buff and rule change, newest pass first, with the old value, the new value and the measurement that prompted it. The approach these follow is in [content-approach.md](content-approach.md).

Figures are win rates from `node test/meta.js` with the full AI. "Lift" is a card's figure in `node test/balance.js` (random decks). A deck figure is good to about ±2 points and a single matchup to about ±6.

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

### Still out of range

- **The combo deck is the most lopsided deck in the game.** Critical Mass wins 70–72% against Canopy Swarm and Fungal Psi-Bloom and loses 77–86% to Ironclad Trust, Full Portfolio, Overcharge Mercs, Siege Artillery and Thermal Syndicate. Making Critical Mass ignore Armor and changing the list moved which matchups were lopsided, not how many.
- **The AI does not play the combo deck as a combo deck.** In trials, telling it to hold Critical Mass and bank Energy Cells for one big turn cost it 1 to 4 points; it does best playing everything as soon as it can. A person saving cards for one turn will do better than these figures, by an unknown amount. Play it by hand before trusting them.
- **34 of 210 matchups read past 65/35.** Apart from the combo deck's, the repeat offenders are Full Portfolio (loses to Overcharge Mercs, Thermal Syndicate, Hive Fortress and Martyr's Garden; beats Skyjack Armada and Air Cavalry), Hive Fortress against Ironclad Trust and Overcharge Mercs (70–72%), Datalinks Cascade against Martyr's Garden, Deep Roots and Skyjack Armada (69–74%), and Fungal Psi-Bloom against Hive Fortress (67%).
- **Police State is worth too much to a deck full of Guards.** It averages +4 over Frontier, but +15 for Siege Artillery and +18 for Ironclad Trust, neither of which uses it. In one trial Ironclad Trust on Police State, with slightly cheaper cards than it has now, was a 67% deck. The other doctrines top out at +7 to +14 for their best deck.
- **Secret Projects are still bad to draw early.** Believer Crusade and Skyjack Armada win 9–10 points less often when they have seen theirs by turn 5, even at the lower costs.
- **Cheap openers still swing games.** 37 cards move their deck's win rate by more than 10 points depending on whether it has seen them by turn 5; nearly all cost 1 or 2. Research Fellow is the largest at +17 to +23. This was left for the opening mulligan, which is not built.
- **The second player is ahead**: the first player wins 47.3% (±0.5), outside the proposed 48–52%.
