# Planet Mode — design draft

*Status: phase A of the card rework is built on the `planet-mode` branch: decks, hands, face-down plays, 4-card sectors, city slots, events, faction cards and the turn playback. Draft by Timothy (with Claude), started 2026-11-22. The exact numbers in use are the constants at the top of `js/planet.js`. Where the prototype differs from this draft, it is noted under "Prototype notes" at the end.*

This is a separate game mode, reached from the main menu, in which all seven factions play on one shared planet at the same time. The existing one-on-one lane game stays as it is.

## Why

The lane game plays well but doesn't feel much like Alpha Centauri yet. The lanes gave a first taste of geography. This mode aims for the full 4X feel: a planet to claim, neighbours to deal with, and several ways to win.

The usual problem with a 7-player card game is waiting through six other turns. Here **everyone acts at the same time**, as in Diplomacy. That keeps it quick, and it makes every turn a Prisoner's Dilemma: alliances, guessing what others will do, and betrayal.

## Goals

- **About 30 minutes a game**, while still feeling weighty. Some games should end in a fast conquest rush; others should build to an epic finish with council votes, secret projects and transcendence.
- **Fully playable against AI.** AIs are needed for testing and to fill empty seats. PvP is a long-term ambition.
- **Eventually, lobbies:** humans join, AIs fill the empty seats, and players who are knocked out can watch or leave for another game, as in a battle royale.
- **Talk stays quick.** Diplomacy's free negotiation is what takes six hours. Communication here is structured and short.

## Turn structure

Each turn has a planning timer of about 45–60 seconds. Everyone submits orders, then they resolve together.

1. **Signal** (optional). Send one short, non-binding signal picked from a list, to everyone or to chosen factions. Examples: "I'm moving into sector X." "I won't enter Y." "I'm going after Z."
2. **Plan** (secret). Choose which cards to play, where to move, what to target and what to build, within your energy.
3. **Reveal.** Everyone's orders are shown at once.
4. **Resolve**, in fixed steps:
   1. instant effects
   2. movement
   3. combat in contested sectors
   4. deploying and building
   5. research and income
5. **Upkeep.** Draw cards, gain energy, advance the clock, and update reputations.

At about 1 minute of planning and 30 seconds of animated resolution per turn, **20 turns take roughly 30 minutes.** That matches the singularity clock below.

### Initiative

Every order has an **initiative** value, which replaces Diplomacy's "bounces," where units entering the same space both get stuck.

- **Higher initiative arrives first and holds the sector.** Anyone who arrives later is attacking it.
- Unit type sets the base value: air beats rovers, and rovers beat infantry.
- Research raises it. For example, "Graviton Boost" gives aircraft +2.
- When initiatives tie, the units meet in the field and both fight at full strength.

So researching speed matters on the map: your aircraft can reach the exposed colony pod before it digs in.

### What happens when a target moves

**Open question.** If a target moves away the same turn, does the order fizzle, as in Diplomacy, or hit whatever is now in that sector?

## The map: a radial "tactical radar screen"

The map is a polar grid of rings and sectors, like a 1977 tactical display. Each spoke from the edge to the centre plays the part of one of the existing lanes.

- **Straw man: 3 rings of 21, 14 and 7 sectors, plus one core.** That's 42 sectors, or 3/2/1 per faction on each ring.
- **Adjacency:** a sector touches its neighbours on its own ring (rings wrap around) and the sectors directly inward and outward.
- The rings shrink toward the centre, so the middle is crowded and fought over, and the game naturally escalates inward. **The core** is a special objective, something like a "Voice of Planet."
- **Two zoom levels.** The planet view shows territory and armies. The sector view shows the cards actually placed there.
- **Each sector holds a limited number of units.**
- **Most cards act only in their own sector or adjacent ones.** Existing keywords become ranges:
  - *Artillery* reaches adjacent sectors.
  - *Aerial* reaches 2 sectors.
  - *Mobile* moves twice.

### Terrain

Terrain is a set of neutral features that shape the game. `world.js` already has xenofungus, ridges, boreholes, monoliths, sensor arrays and the Perihelion wreck. New ones:

- **Ocean.** Only sea and air units can enter. Sea colonies give the "desert island" option: a remote, safe place to develop.
- **Desert and wasteland.** Poor sectors that thin out the 42 without making the map feel empty.

## Colonies and capitals

- **Turn 0, blind landfall:** every player secretly chooses where to land their colony pod. The fertile garden sector is tempting, but four other players might pick it too.
- **Capitals act as the leader's health.** Losing them all is how you're knocked out of a conquest.
- **Pods can relocate,** at a cost in tempo.
- **Both wide and tall play work.** Building more pods founds more cities. That spreads your risk and adds council votes, while a single huge capital is stronger and safer.

## Diplomacy

Diplomacy works in three layers, all quick enough for an AI to use:

| Layer | What it is | Binding? |
|---|---|---|
| **Signals** | One message per turn, picked from a list, sent to everyone or to chosen factions | No |
| **Reputation** | The game tracks whether you did what you signalled and shows a **trust** rating for each faction. Lying works, but it costs credibility. | No: it's just a record |
| **Pacts** | Cards or actions with real rules: non-aggression, shared vision, trade, sanctions, embargo | Yes. Breaking one is allowed but leaves a public mark and makes you a target for sanctions. |

The diplomat faction's leader power might work through pacts or the council (see Open questions).

*Decided since:* signals start out as **AI leaders reacting in character** (phase C), which keeps the flavour without slowing anyone down. Player signals and reputation can follow if they're still wanted.

## Victory and rankings

**The game ranks everyone 1st to 7th rather than one winner.** Rankings are what make diplomacy rational. A middling faction should happily take a safe 2nd as part of a winning coalition rather than gamble on 1st and risk 6th. The suspense comes from who defects before the vote.

- **Conquest:** hold a set share of territory, or hold the last capitals standing. It must be reachable inside 20 turns so a rush is a real strategy.
- **The Planetary Council** meets every 5 turns. Votes are weighted by population, which rewards wide empires.
  - It votes on proposals: sanctions, embargoes, lifting research caps, electing a Secretary General.
  - **Diplomatic victory:** the Secretary General is elected with a qualifying majority. They place **1st**, and everyone who voted for them shares **2nd**.
- **Economic victory** (still being shaped), with two options:
  - Hold most of the trade-hub sectors, or hold more energy than everyone else combined.
  - Buy enemy colonies outright with energy, a "hostile takeover." This fits the Auric Charter.
- **The singularity clock, which is also the time limit.** At about turn 20 the planet "goes off" and the game ends.
  - Survivors are ranked by **attunement**: research plus control of xenofungus and monolith sectors.
  - Factions can **push the clock.** Nature and research factions speed it up; secret projects slow it down.
  - That gives the game a natural arc. Conquest factions race to break the research factions before the clock runs out, and research factions race to finish first.

## How this fits the existing code

- **A separate set of files** (`js/planet*.js`), built on the same house rules as the lane game: no DOM in the engine, plain-JSON state, seeded randomness.
- **Card art carries over** by id. Card *effects* don't: the lane game's are written in terms of lanes, so Planet Mode has its own card set.
- **Orders are plain data.** Resolving seven sets of orders fits that, and networking can be added later by sending orders between players.
- **The AI is new:** a heuristic one for seven players acting at once.
- **The lane game is untouched.**

## Cards: "a Diplomacy card game, not Risk"

The map is where cards get played. Everything on the board is a card, and turns are about which cards you commit, face down, and where.

- **Sectors hold at most 4 cards, shared by everyone.** Cities, units and structures each take one. That creates crowded border regions and rival cities in the same valley. A full sector can only be entered as an assault, and each player can bring at most 4 cards into a fight.
- **Cities have their own slots** for buildings and citizens: 2, or 3 for a capital, and a Hab Complex adds more. Attachments don't use sector slots, so a single huge capital (tall play) is a real strategy.
- **Deck and hand.** Each faction has a 30-card deck: a shared core (every faction needs colony pods), then four cards of its own that tilt the mix and give it a unique flavour. You start with 5 cards, draw 3 a turn, and can hold 8. Energy from your cities pays for cards. You can **scrap** a card for +1 energy.
- **Where cards go:**
  - **Units:** played on your city.
  - **Structures**, such as a Bunker: on your city or where you have a unit.
  - **Buildings and citizens:** attached to your city.
  - **Events:** aimed at a sector within 2 of your cards. **Events target sectors, not individual units**, which settles the moving-target question: a strike hits whatever is in the sector when it lands, so dodging is a real move.
- **Face down, then the reveal.** Rivals see only card backs until everything flips at once. The playback shows the backs, the flip, movement tier by tier, events, battles, then what got founded, captured and deployed.
- **Faction flavour so far:**
  - **The Rootbound** walk with the worms: Mind Worm Boils, Fungal Bloom, and free passage through xenofungus.
  - **The Free Tide** sail: Foil Raiders, and Sea Colony Pods that can settle the ocean.
  - **The Auric Charter** can buy cities with a Hostile Takeover.
  - **The Lumen Synod** gets more labs and a Knowledge Archive.
  - **The Redline Cadre** fields Elite Commandos.
  - **The Cinder Choir** has Fanatics.
  - **Ironwake** has Scrap Bots and a Foundry.

## Build plan

The first prototype proved the loop: landfall, simultaneous movement and combat by initiative, 7 AIs and a simulator. The card rework comes in phases:

- **Phase A (built):** decks, hands, energy, scrapping, face-down plays, sector and city capacity, events, faction cards, and the turn playback.
- **Phase B:** techs bought with research that add stronger cards to your deck; secret projects played face down on a city and paid into over several turns. Secret projects are also meant to soak up surplus energy.
- **Phase C:** fog of war, which makes meeting neighbours an event, plus AI leaders reacting in character ("You've planted your flag in my shadow"). That keeps the angry-Chairman flavour of signals without slowing turns down.
- **Phase D:** pacts, the council and the diplomat faction; leader powers for every faction.
- **Later:** deckbuilding before a game: choose your techs, secret projects, and the balance of pods against rovers.

## Prototype notes

What the builds so far settled or simplified:

- **Battles.** Fighters strike in initiative order, fastest first. Each fighter strikes once per turn, so battles can last several turns. Units must be cleared before a city can be hit.
- **Captures.** A city at 0 HP is captured if exactly one rival has units there, and razed if two or more do.
- **Holding a sector** gives +1 initiative only on a High Ridge. A bonus for holding anywhere made garrisons impossible to break.
- **Conquest** means holding **3** capitals (your own included). Capitals have 8 HP, or 12 on a High Ridge. With cards, about 37% of AI games end in conquest and the rest at the singularity.
- **Units ending a move.** Moving units can enter an enemy-held sector but can't pass through it. Ground units must stop on xenofungus, except natives and the Rootbound. Moves are checked against the board as it stood at the start of the turn.
- **Techs** are still automatic: Doctrine: Flight at 8 research unlocks Needlejets, and Graviton Boost at 16 gives aircraft +2 initiative. Phase B replaces this.
- **Energy surplus.** AIs end turns with about 30 energy unspent, because room to deploy is the real limit.

## Open questions

- **The diplomat faction.** None of the current seven is clearly Alpha Centauri's peacekeeper or diplomat. Should an existing faction (the Lumen Synod? the Free Tide?) take on council and pact powers? That's Schwab's call, since the factions are his.
- **Economic victory:** trade hubs, an energy majority, or takeovers (the Auric Charter can already buy cities)?
- **Exact numbers:** conquest threshold, council majority, clock length, and whether 4 per sector plays well with humans.
- **Free text chat in lobbies:** offer it alongside the AI leader messages, or leave it out?
