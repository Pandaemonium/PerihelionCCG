# Tau Ceti — Ashes of the Perihelion

A browser card game with lanes, inspired by Hearthstone and themed after Alpha Centauri. It's plain HTML, CSS and JavaScript with no build step and no dependencies: open `index.html` in a browser to play.

The repo belongs to Schwab (GitHub `Pandaemonium`), and Timothy is a collaborator. Changes land through branches and pull requests into `master`. Don't push to `master` directly.

## Layout

Scripts load as plain globals, in the order listed in `index.html`. Each file adds itself to `globalThis.TauCeti`, so a file can only use what loaded before it.

| File | Role |
|---|---|
| `js/world.js` | Lane terrain, biomes, doctrines, Council Decrees, campaign map (`TERRAIN`, `BIOMES`, `DOCTRINES`, `DECREES`, `CAMPAIGN`). A doctrine's numbers are data (`rules`), which the engine applies; its text has to be kept in step by hand. A Decree is an optional rule for both players in a skirmish, picked on the title screen. A Decree holds only its name and text: its effects are written into `engine.js` by id (search for `g.decree`). The balance tools play with no Decree. |
| `js/art.js` | **Generated** list of which card ids have art. Don't edit by hand; `tools/pack_art.py` rewrites it. |
| `js/cards.js` | Every card, the 7 factions with their leaders and preset decks (four each; the third is a Pact deck that names its partner faction with `pact`, the fourth is built around a mechanic of its own), and keywords. Card effects are functions `(g, ctx)` that call the engine. The header comment documents the `ctx` shapes, the triggers a card may define, target refs, "Choose one" Orders (`modes`), Archive, Forecast and Purge. |
| `js/design.js` | The Design Workshop: the parts table (chassis, weapon, armor, ability), their prices and tech gates, and the code that turns a choice of parts into a unit card. A designed card's id spells out its parts (`dz-rover-w3-a4-guard`), so the id alone rebuilds the card and game state stays plain JSON. Designs are registered in `CARDS` as non-enumerable properties, so they never show up in the card pool. |
| `js/engine.js` | The rules. Board constants are at the top (7 lanes, 30 HP, 10 max energy, 22 research for an Ascent win, milestones at 4/8/13, opening hands and the first player's extra Integrity). A real game opens with the mulligan: `E.newGame(…, { mulligan: true })` deals the hands and waits for one `E.mulligan(g, pid, uids)` from each player before the first turn. Without that option the game starts at once, which the unit tests rely on. A Forecast works the same way for a person: `E.newGame(…, { human: pid })` names the seat a person plays, and a Forecast for that seat waits in `g.forecast` for `E.resolveForecast`, with the cards being looked at held out of the deck and that player's draws put off until the pick. Every other seat, and every headless game, picks at once. |
| `js/ai.js` | The opponent. At full strength it plans a whole turn at a time: a beam search over lines of play, each tried on a copy of the game. Weights and skill switches are in `AI.TUNE`. A preset deck can carry a game plan (`plan` in `cards.js`: keystone cards, its own weights, hold rules, mulligan rules) that the AI pilots it by. `AI.mulligan(g)` takes the opening mulligan for both seats; every tool that plays whole games calls it. `AI.pickForecast` makes the AI's Forecast pick, called from the engine. Three difficulty levels in `AI.LEVELS`; the tests and balance tools play at the strongest. |
| `js/decks.js` | The deckbuilder pool, validation, share codes, Expedition Draft, and saving to localStorage. |
| `js/ui.js`, `js/audio.js` | Screen rendering and input; sound effects. |
| `test/sim.js` | Headless AI-vs-AI games. Checks for crashes, stuck games, broken invariants and 30-card presets, and prints balance figures. |
| `test/meta.js` | The meta report: every preset deck against every other, run on all cores. Prints each deck's win rate, the full matchup table, how often decks find their keystones, and which single cards swing games. `--ab` tests an AI change across every preset, `--focus` plays one deck against the rest, `--doctrines` prices the doctrines, and `PATCH=file.js` applies a trial change without editing the game. This is the check for the targets in the content approach. |
| `test/ai.js` | Unit tests for the AI: planning, Energy Cells, game plans and hold rules, the levels, and that the full AI beats the one-action AI. |
| `test/tune.js` | An older A/B test of AI weights. It only plays each faction's first preset; prefer `test/meta.js --ab`. |
| `test/design.js` | Unit tests for the Design Workshop: every possible design is well formed, gating by Research and faction, pricing, and AI games with Workshops in both decks. |
| `tools/`, `art/` | The card-art pipeline (see below). The game loads `art/<id>.webp` and falls back to the card's emoji. |

## Rules that must not be broken

- **The engine stays free of the DOM, and game state stays plain JSON.** The AI clones the state (`E.clone`) to try out moves, and the Node tests run the engine with no page at all. Keep page code in `ui.js`, and keep functions, class instances and DOM nodes out of the state `g`. Card effect functions are fine because they live in `CARDS`, not in `g`.
- **Randomness in rules and card effects goes through the game's seeded RNG** (`E.rand`, `E.pick`, `shuffle(g, …)`), never `Math.random`. That way a game replays exactly from its seed. There are two deliberate exceptions. `E.clone` reseeds the copy and reshuffles both decks so the AI's look-ahead can't see the real draw order. The AI's difficulty jitter in `ai.js` also uses `Math.random`. Keep both as they are.
- **Engine events go through `ev(g, …)`.** The UI animates from `g.events`. Clones have `silent` set, so the AI's look-ahead records no events.
- **Every preset deck has exactly 30 cards.** `test/sim.js` checks this.
- **A choice that waits for a person must be tested by hand.** The sims and the AI never wait: the mulligan and Forecast finish at once for them. So code that runs only while the game is waiting (`g.mulligan`, `g.forecast`) is not covered by any whole-game tool. Give it a unit test in `test/cards.js` or `test/rules.js` with the human seat set, and check that no card is copied or lost.
- Adding a card needs its `def(...)` in `cards.js`. Art is optional: without art the card shows its `art` emoji.

## Content and balance

Read [design/content-approach.md](design/content-approach.md) before adding cards or decks, or changing card numbers. It sets the goal (many different decks that are equally viable, no hard counters), the targets (each preset wins 45–55% overall, no matchup worse than 35/65), the line-up of 28 presets, the tools for finding key cards, and the order of work. Nerfs and buffs are used freely: change what is out of range, then list every change with its before, after and reason in [design/balance-changes.md](design/balance-changes.md). Each pass in that file ends with what it left out of range; the newest pass is at the top.

## Testing

Run these after any change to the rules, cards or AI (needs Node):

```
node test/sim.js [gamesPerMatchup] [biome]      # e.g. node test/sim.js 12 tau_ceti
node test/meta.js [gamesPerPairing] [seed]      # balance: e.g. node test/meta.js 200 1
node test/meta.js 100 1 --ab key=value          # AI change: e.g. --ab unitRisk=0.5
node test/meta.js 200 1 --focus cinder.crusade  # one deck against the rest, about two minutes
node test/meta.js 40 1 --doctrines all          # after changing a doctrine
node test/ai.js                                 # after any change to the AI
```

`meta.js` needs about 200 games a pairing before a single matchup's figure means much (±7 points); with 28 presets that run takes about half an hour, and 100 games a pairing (±2 points a deck) about fifteen minutes. The AI is not deterministic, so two runs with the same seed differ slightly. The full AI takes about 0.1 seconds a game on one core, so the single-threaded tools are slow at their default sizes (`test/pact.js` takes over ten minutes). Prefix a command with `AI_LEVEL=commander` to run it with the quick one-action AI when it only has to hunt for crashes; use the full AI for balance figures. `tune.js` also takes the environment variables `RAZE` and `SITEHP` for rule experiments. There's no browser test suite: check UI changes by playing in the browser.

## Art pipeline

This only works on Schwab's machine. It calls a local ComfyUI/FLUX install at `C:\AI\ComfyUI` on an Intel Arc A750, so don't expect `tools/gen_local_art.py`, `tools/review_server.py` or the `.cmd` launchers to run anywhere else.

The steps:

1. `tools/build_prompts.js` adds prompts for new cards to `tools/art_prompts.json` and keeps any prompts that were edited by hand.
2. The generator writes full-size images to `art/raw/`, which is gitignored.
3. `tools/pack_art.py` compresses them into `art/*.webp` and regenerates `js/art.js`.

`art/art_review.html` is the page for approving and re-rolling art.

## Planet Mode (prototype, branch `planet-mode`)

This is Timothy's separate mode: all 7 factions share a radial map and plan at the same time, playing cards face down onto the map. The aim is "a Diplomacy card game, not Risk": the map is where cards get played. The design is in [design/planet-mode.md](design/planet-mode.md). It's a **private side project until it's worth showing Schwab**, so keep it on its branch and out of PRs until Timothy says otherwise.

**It must not change the lane game.** The only places it touches shared files are the "Planet Mode" menu button, its `<section>`, and the script and stylesheet tags in `index.html`. Everything else lives in its own files:

| File | Role |
|---|---|
| `js/planet_cards.js` | The cards (`TauCeti.PCARDS`) and faction deck lists (`TauCeti.PDECKS`). The header comment says where each card type can be played. Cards borrow the lane game's art by id. |
| `js/planet.js` | The rules (`TauCeti.Planet`). The header comment documents the map layout, sector capacity, the order format and the resolution steps. The house rules above apply: no DOM, plain-JSON state, seeded randomness. |
| `js/planet_ai.js` | The heuristic AI for every seat (`TauCeti.PlanetAI`). It moves units, then scores every card in hand against every legal target. It has no look-ahead, and its randomness is seeded from game, player and turn, so it never advances `g.seed`. |
| `js/planet_ui.js`, `css/planet.css` | The map, the sector panel, the hand, and the turn playback. All CSS classes and element ids are prefixed `pl-`, and short state classes avoid names the lane game's stylesheet already uses (`hand`, `flash`, `unit` and `big` all clashed once). |
| `test/planet_sim.js` | 7-AI games. Checks invariants (including that no card appears from nowhere) and prints how games end, where each faction places and which cards get played. `PLANET="KEY=val,..."` overrides rule constants for experiments. |

Phase A of the card rework is built: decks, hands, energy, scrapping, face-down plays, a shared 4-card limit per sector, city slots for buildings and citizens, events, faction cards, and a step-by-step playback of each turn. Not built yet: techs that change your deck, secret projects, leader powers, AI leader messages, fog of war, pacts and the council.

Tuning lessons, found with the sim. Don't undo these without re-running it:
- **Holding a sector gives the first-strike bonus only on a High Ridge.** When holding anywhere gave +1 initiative, a full garrison of 6 couldn't be broken, because the stack cap stops attackers from bringing more.
- **An assault may push a sector past its 4-card limit, but each player can bring at most 4 cards in.** With no cap on assaults, one player could pile 9 or more into a sector.
- **A card that adds city slots (Hab Complex) can be played on a full city.** Otherwise it could never be played when it was needed.
- **Scrapping** (discard a card for +1 energy) exists because dead cards, like a Needlejet before Flight, used to clog hands.
- **Drawing 3 a turn** spread faction win rates over 11–20%; drawing 2 gave 7–22%. AIs still end turns with about 30 energy unspent, because room to deploy is the real limit. Secret projects (phase B) are meant to soak that up.
- **The AI counts a colony's threat as the strongest single rival's force, not the sum of all rivals.** Summing them made AIs between two neighbours hold every unit at home and stop building.
- **3 capitals for a conquest win, with 8-HP capitals,** gives about one conquest in four games; 4 capitals gave about one in 25.

Run `node test/planet_sim.js 300` after any change to `planet.js` or `planet_ai.js`.

## Naming

The repo is called PerihelionCCG. In the code the game is "Tau Ceti" (the namespace is `TauCeti`), and the Perihelion is the wrecked colony ship that shows up in the lore and terrain. Factions, leaders and cards echo Alpha Centauri but have original names.
