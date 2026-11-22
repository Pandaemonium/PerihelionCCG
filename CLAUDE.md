# Tau Ceti — Ashes of the Perihelion

A browser card game with lanes, inspired by Hearthstone and themed after Alpha Centauri. It's plain HTML, CSS and JavaScript with no build step and no dependencies: open `index.html` in a browser to play.

The repo belongs to Schwab (GitHub `Pandaemonium`), and Timothy is a collaborator. Changes land through branches and pull requests into `master`. Don't push to `master` directly.

## Layout

Scripts load as plain globals, in the order listed in `index.html`. Each file adds itself to `globalThis.TauCeti`, so a file can only use what loaded before it.

| File | Role |
|---|---|
| `js/world.js` | Lane terrain, biomes, doctrines, campaign map (`TERRAIN`, `BIOMES`, `DOCTRINES`, `CAMPAIGN`) |
| `js/art.js` | **Generated** list of which card ids have art. Don't edit by hand; `tools/pack_art.py` rewrites it. |
| `js/cards.js` | Every card, the 7 factions with their leaders and preset decks, and keywords. Card effects are functions `(g, ctx)` that call the engine. The header comment documents the `ctx` shapes and target refs. |
| `js/engine.js` | The rules. Board constants are at the top (7 lanes, 30 HP, 10 max energy, 22 research for an Ascent win, milestones at 4/8/13). |
| `js/ai.js` | The opponent: a greedy look-ahead with weights in `AI.TUNE` and three difficulty levels. |
| `js/decks.js` | The deckbuilder pool, validation, share codes, Expedition Draft, and saving to localStorage. |
| `js/ui.js`, `js/audio.js` | Screen rendering and input; sound effects. |
| `test/sim.js` | Headless AI-vs-AI games. Checks for crashes, stuck games, broken invariants and 30-card presets, and prints balance figures. |
| `test/tune.js` | An A/B test of AI weights against the baseline across every faction pairing. |
| `tools/`, `art/` | The card-art pipeline (see below). The game loads `art/<id>.webp` and falls back to the card's emoji. |

## Rules that must not be broken

- **The engine stays free of the DOM, and game state stays plain JSON.** The AI clones the state (`E.clone`) to try out moves, and the Node tests run the engine with no page at all. Keep page code in `ui.js`, and keep functions, class instances and DOM nodes out of the state `g`. Card effect functions are fine because they live in `CARDS`, not in `g`.
- **Randomness in rules and card effects goes through the game's seeded RNG** (`E.rand`, `E.pick`, `shuffle(g, …)`), never `Math.random`. That way a game replays exactly from its seed. There are two deliberate exceptions. `E.clone` reseeds the copy and reshuffles both decks so the AI's look-ahead can't see the real draw order. The AI's difficulty jitter in `ai.js` also uses `Math.random`. Keep both as they are.
- **Engine events go through `ev(g, …)`.** The UI animates from `g.events`. Clones have `silent` set, so the AI's look-ahead records no events.
- **Every preset deck has exactly 30 cards.** `test/sim.js` checks this.
- Adding a card needs its `def(...)` in `cards.js`. Art is optional: without art the card shows its `art` emoji.

## Testing

Run these after any change to the rules, cards or AI (needs Node):

```
node test/sim.js [gamesPerMatchup] [biome]      # e.g. node test/sim.js 12 tau_ceti
node test/tune.js key=value[,key=value] [games] # e.g. node test/tune.js foeSite=2 20
```

`tune.js` also takes the environment variables `RAZE` and `SITEHP` for rule experiments. There's no browser test suite: check UI changes by playing in the browser.

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
