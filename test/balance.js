/* Balance report from AI-vs-AI games with random legal decks.
 *
 *   node test/balance.js [games=4000] [seed=1]            run a league and print the report
 *   node test/balance.js 4000 2 --json out.json           also save the raw counts
 *   node test/balance.js --merge a.json b.json …          combine saved runs into one report
 *   node test/balance.js --power [gamesPerFaction=400]    price each leader power in mirror matches
 *   …  --all                                              list every card, not just the extremes
 *
 * What it measures
 *   faction   win rate of random decks led by that faction (cards + leader power together)
 *   card      "lift": win rate of decks that include the card minus win rate of decks that could have
 *             included it but did not. Positive = decks do better with it.
 *   power     win rate of a side that may use its leader power against the same faction without it.
 *
 * The AI plays both sides, so cards it plays badly (delayed pay-offs, combos) read weaker than they are.
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
require('../js/decks.js');
const fs = require('fs');
const { Engine: E, AI, FACTIONS, CARDS, Decks, NEUTRAL_CARDS, Design } = globalThis.TauCeti;
const { checkState } = require('./invariants.js');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--json'));
const fids = Object.keys(FACTIONS);
const BIOME = process.env.BIOME || 'tau_ceti';
// rule experiments: RAZE=n (raze damage), SITEHP=±n (all location integrity), SITECOST=±n (all location costs),
// SECONDCELLS=n / SECONDCARDS=n (Reserve Cells / extra cards the second player starts with)
if (process.env.SECONDCELLS) E.SECOND_CELLS = +process.env.SECONDCELLS;
if (process.env.SECONDCARDS) E.SECOND_EXTRA_CARDS = +process.env.SECONDCARDS;
// DZFREE=n (free points every Workshop design gets), DZCOST=n (Energy cost of the Design Workshop itself)
if (process.env.DZFREE) { Design.FREE_POINTS = +process.env.DZFREE; Design.reset(); AI.resetDesigns(); }
if (process.env.DZCOST) CARDS.design_workshop.cost = +process.env.DZCOST;
if (process.env.RAZE) { E.RAZE_DAMAGE = +process.env.RAZE; E.PROJECT_RAZE_DAMAGE = +process.env.RAZE + 2; }
Object.values(CARDS).forEach((c) => {
  if (c.type !== 'site' || c.token) return;
  if (process.env.SITEHP) c.hp = Math.max(1, c.hp + +process.env.SITEHP);
  if (process.env.SITECOST) c.cost = Math.max(1, c.cost + +process.env.SITECOST);
});
const label = (fid) => (fid === 'neutral' ? 'Colonist' : FACTIONS[fid].name.replace(/^The /, '').split(' ')[0]);

let rs = 1;
const rnd = (n) => { rs = (Math.imul(rs, 1664525) + 1013904223) | 0; return ((rs >>> 0) % 1000003) % n; };
const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let problems = 0;
const report = (m) => { if (problems++ < 20) console.error(m); };

/** Random legal deck shaped like a real one: mostly the leading faction, some colonist cards, an optional Pact. */
function randomDeck(faction, pact) {
  const deck = { faction, pact: pact || null, doctrine: 'standard', cards: [] };
  const take = (ids, target) => {
    for (const id of shuffled(ids)) {
      const copies = 1 + rnd(Decks.copyLimit(id));
      for (let k = 0; k < copies && deck.cards.length < target; k++) deck.cards.push(id);
    }
  };
  if (deck.pact) take(FACTIONS[deck.pact].cards.filter((id) => !CARDS[id].project), 3 + rnd(Decks.PACT_LIMIT - 2));
  // a single-faction deck leans on its faction about as hard as a Pact deck leans on its two
  take(FACTIONS[faction].cards, deck.cards.length + (deck.pact ? 14 : 20) + rnd(5));
  take(NEUTRAL_CARDS, Decks.DECK_SIZE);
  const v = Decks.validate(deck);
  if (!v.ok) report(`illegal random deck ${faction}+${pact}: ${v.errors[0]}`);
  return deck;
}

function play(d0, d1, seed, first, setup) {
  const g = E.newGame(d0.faction, d1.faction, seed, first, {
    biome: BIOME, deck0: d0.cards, deck1: d1.cards, pact0: d0.pact, pact1: d1.pact, doctrine0: d0.doctrine, doctrine1: d1.doctrine,
  });
  if (setup) setup(g);
  let steps = 0;
  while (!g.over && g.turn < 160) {
    const pid = g.active;
    let acts = 0;
    for (;;) {
      const act = AI.choose(g, pid);
      if (!act || acts++ > 80) break;
      if (!AI.apply(g, pid, act)) { report('AI chose an illegal action ' + JSON.stringify(act)); break; }
      if (g.over || ++steps > 8000) break;
    }
    if (!g.over) E.endTurn(g, pid);
    g.events.length = 0;
  }
  problems += checkState(g, 'end of game', report) ? 1 : 0;
  if (!g.over) { report(`game did not finish (seed ${seed})`); return { winner: null, g }; }
  return { winner: g.winner, g };
}

/* ------------------------------------------------------------ league */
function emptyCounts() {
  const c = { games: 0, firstWins: 0, decided: 0, turns: 0, faction: {}, card: {} };
  fids.forEach((f) => { c.faction[f] = { g: 0, w: 0, mg: 0, mw: 0 }; });
  Object.keys(CARDS).forEach((id) => { if (!CARDS[id].token) c.card[id] = { wg: 0, ww: 0, og: 0, ow: 0 }; });
  return c;
}

function league(n, seed) {
  rs = (seed * 2654435761) | 0 || 1;
  const c = emptyCounts();
  for (let i = 0; i < n; i++) {
    const decks = [0, 1].map(() => {
      const f = fids[rnd(fids.length)];
      const others = fids.filter((x) => x !== f);
      return randomDeck(f, rnd(2) ? others[rnd(others.length)] : null);
    });
    const first = i % 2;
    const { winner, g } = play(decks[0], decks[1], seed * 100003 + i * 7919, first);
    c.games++;
    if (winner == null) continue;
    c.turns += g.turn;
    if (winner !== -1) { c.decided++; if (winner === first) c.firstWins++; }
    decks.forEach((d, side) => {
      const won = winner === side ? 1 : winner === -1 ? 0.5 : 0;
      const fs_ = c.faction[d.faction];
      fs_.g++; fs_.w += won;
      if (!d.pact) { fs_.mg++; fs_.mw += won; }
      const inDeck = new Set(d.cards);
      Decks.poolFor(d.faction, d.pact).forEach((id) => {
        const s = c.card[id];
        if (inDeck.has(id)) { s.wg++; s.ww += won; } else { s.og++; s.ow += won; }
      });
    });
  }
  return c;
}

function merge(list) {
  const c = emptyCounts();
  list.forEach((x) => {
    ['games', 'firstWins', 'decided', 'turns'].forEach((k) => { c[k] += x[k]; });
    fids.forEach((f) => Object.keys(c.faction[f]).forEach((k) => { c.faction[f][k] += (x.faction[f] || {})[k] || 0; }));
    Object.keys(c.card).forEach((id) => Object.keys(c.card[id]).forEach((k) => { c.card[id][k] += (x.card[id] || {})[k] || 0; }));
  });
  return c;
}

const pct = (x, d) => (100 * x).toFixed(d == null ? 1 : d);
function cardRows(c) {
  return Object.keys(c.card).map((id) => {
    const s = c.card[id];
    const w = s.wg ? s.ww / s.wg : null, o = s.og ? s.ow / s.og : null;
    const se = s.wg && s.og ? Math.sqrt(0.25 / s.wg + 0.25 / s.og) : null;
    return { id, w, o, lift: w != null && o != null ? w - o : null, se, n: s.wg };
  }).filter((r) => r.lift != null);
}

function printLeague(c) {
  console.log(`${c.games} games on ${BIOME}; average ${(c.turns / c.games).toFixed(1)} turns; first player won ${pct(c.firstWins / Math.max(1, c.decided), 0)}%`);
  console.log('\nFaction strength (random decks led by the faction; ±' + pct(Math.sqrt(0.25 / (2 * c.games / fids.length)), 1) + ' points)');
  fids.slice().sort((a, b) => c.faction[b].w / c.faction[b].g - c.faction[a].w / c.faction[a].g).forEach((f) => {
    const s = c.faction[f];
    console.log(`  ${label(f).padEnd(10)} ${pct(s.w / s.g).padStart(5)}%   single-faction ${pct(s.mw / Math.max(1, s.mg)).padStart(5)}%   (${s.g} decks)`);
  });
  const rows = cardRows(c).sort((a, b) => b.lift - a.lift);
  const kindOf = (d) => (d.project ? 'Secret Projects' : d.type === 'site' ? 'locations' : d.type === 'unit' ? 'units' : 'Orders');
  const byKind = {};
  rows.forEach((r) => { const k = kindOf(CARDS[r.id]); (byKind[k] = byKind[k] || []).push(r.lift); });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log();
  console.log('Average lift by card type: ' + Object.keys(byKind).map((k) => `${k} ${(mean(byKind[k]) >= 0 ? '+' : '') + pct(mean(byKind[k]))}`).join(', '));
  const line = (r) => {
    const d = CARDS[r.id];
    const kind = d.type === 'unit' ? `${d.cost}c ${d.atk}/${d.hp}` : d.type === 'site' ? `${d.cost}c site ${d.hp}` : `${d.cost}c order`;
    return `  ${(r.lift >= 0 ? '+' : '') + pct(r.lift)}`.padEnd(9) + `±${pct(r.se)}  ${d.name.padEnd(26)} ${label(d.faction).padEnd(9)} ${kind.padEnd(12)} in ${r.n} decks`;
  };
  if (flag('--all')) {
    ['neutral'].concat(fids).forEach((f) => {
      console.log(`\n${label(f)} cards by lift`);
      rows.filter((r) => CARDS[r.id].faction === f).forEach((r) => console.log(line(r)));
    });
  } else {
    console.log('\nCards with the most lift'); rows.slice(0, 25).forEach((r) => console.log(line(r)));
    console.log('\nCards with the least lift'); rows.slice(-25).reverse().forEach((r) => console.log(line(r)));
  }
}

/* ------------------------------------------------------------ leader powers */
function powerTest(n) {
  rs = 424242;
  console.log(`Leader power value: same faction on both sides, random single-faction decks, one side may not use its power (${n} games each, ±${pct(Math.sqrt(0.25 / n), 0)} points)`);
  fids.forEach((f, fi) => {
    let w = 0, games = 0, uses = 0, turns = 0;
    for (let i = 0; i < n; i++) {
      const withPower = i % 2;            // which seat keeps its power
      const first = (i >> 1) % 2;         // who moves first, independent of the above
      const { winner, g } = play(randomDeck(f, null), randomDeck(f, null), 777 + fi * 100003 + i * 7919, first, (g0) => { g0.players[1 - withPower].noPower = true; });
      if (winner == null) continue;
      games++;
      w += winner === withPower ? 1 : winner === -1 ? 0.5 : 0;
      uses += g.players[withPower].powerUses || 0;
      turns += Math.ceil(g.turn / 2);
    }
    const pw = FACTIONS[f].power;
    console.log(`  ${label(f).padEnd(10)} ${pct(w / games).padStart(5)}%   ${pw.name} (${pw.cost}) used ${(uses / games).toFixed(1)}× per game over ${(turns / games).toFixed(1)} cycles`);
  });
}

/* ------------------------------------------------------------ main */
if (flag('--power')) {
  powerTest(parseInt(positional[0] || '400', 10));
} else if (flag('--merge')) {
  const files = args.filter((a) => a.endsWith('.json'));
  printLeague(merge(files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))));
} else {
  const n = parseInt(positional[0] || '4000', 10);
  const seed = parseInt(positional[1] || '1', 10);
  const c = league(n, seed);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(c));
  else printLeague(c);
}
if (problems) console.log(`\n${problems} PROBLEMS`);
process.exit(problems ? 1 : 0);
