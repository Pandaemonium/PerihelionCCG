/* Pact-deck simulation: AI-vs-AI games with two-faction decks.
 *
 *   Stage 1  random legal decks for every leader+partner pairing (and every single faction) play each
 *            other. Checks the engine for crashes, stuck games and broken board states when cards meet
 *            outside their own faction, and scores each card by how often decks holding it win.
 *   Stage 2  builds a "best cards" deck for every pairing from those scores and plays it against all
 *            the preset decks, to flag pairings that are far stronger or weaker than the rest.
 *
 * Usage: node test/pact.js [stage1GamesPerPairing=40] [stage2GamesPerPreset=4] [biome=tau_ceti]
 *        PACT=n node test/pact.js …   tries a different Pact card limit (rule experiment)
 * The AI plays both sides, so treat the win rates as a rough screen, not as balance figures.
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
require('../js/decks.js');
const { Engine: E, AI, FACTIONS, CARDS, DOCTRINES, Decks, buildDeck } = globalThis.TauCeti;
const { checkState } = require('./invariants.js');

if (process.env.PACT) Decks.PACT_LIMIT = Math.max(0, Math.min(Decks.DECK_SIZE, parseInt(process.env.PACT, 10) || 0));
const N1 = parseInt(process.argv[2] || '40', 10);
const N2 = parseInt(process.argv[3] || '4', 10);
const BIOME = process.argv[4] || 'tau_ceti';
const fids = Object.keys(FACTIONS);
const docs = Object.keys(DOCTRINES);
const short = (fid) => FACTIONS[fid].name.replace(/^The /, '').split(' ')[0];

// deterministic RNG for deck building, so a run can be repeated
let rs = 987654321;
const rnd = (n) => { rs = (Math.imul(rs, 1664525) + 1013904223) | 0; return ((rs >>> 0) % 1000003) % n; };
const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

let problems = 0;
const report = (m) => { if (problems < 30) console.error(m); };

/** A random legal deck: up to the Pact limit of partner cards, the rest main faction and colonist. */
function randomDeck(faction, pact) {
  const deck = { faction, pact, doctrine: docs[rnd(docs.length)], cards: [] };
  const counts = {};
  const take = (ids, target) => {
    for (const id of shuffled(ids)) {
      const copies = 1 + rnd(Decks.copyLimit(id));
      for (let k = 0; k < copies && deck.cards.length < target; k++) { deck.cards.push(id); counts[id] = (counts[id] || 0) + 1; }
    }
  };
  const pool = Decks.poolFor(faction, pact);
  if (pact && Decks.PACT_LIMIT > 0) take(pool.filter((id) => Decks.source(deck, id) === 'pact'), Math.ceil(Decks.PACT_LIMIT * 0.4) + rnd(Math.floor(Decks.PACT_LIMIT * 0.6) + 1));
  const rest = pool.filter((id) => Decks.source(deck, id) !== 'pact');
  take(rest, Decks.DECK_SIZE);
  // top up (only needed if the shuffle left the deck short)
  for (const id of rest) while (deck.cards.length < Decks.DECK_SIZE && (counts[id] || 0) < Decks.copyLimit(id)) { deck.cards.push(id); counts[id] = (counts[id] || 0) + 1; }
  const v = Decks.validate(deck);
  if (!v.ok) { problems++; report(`generated an illegal deck ${faction}+${pact}: ${v.errors[0]}`); }
  return deck;
}

/** Play one AI-vs-AI game between two decks. Returns 0 / 1 for the winner, -1 for a draw, null if it never finished. */
function play(d0, d1, seed, first) {
  const g = E.newGame(d0.faction, d1.faction, seed, first, {
    biome: BIOME, deck0: d0.cards, deck1: d1.cards, pact0: d0.pact, pact1: d1.pact, doctrine0: d0.doctrine, doctrine1: d1.doctrine,
  });
  let steps = 0;
  while (!g.over && g.turn < 160) {
    const pid = g.active;
    let acts = 0;
    for (;;) {
      const act = AI.choose(g, pid);
      if (!act || acts++ > 80) break;
      if (!AI.apply(g, pid, act)) { problems++; report(`AI chose an illegal action ${JSON.stringify(act)}`); break; }
      problems += checkState(g, `${d0.faction}+${d0.pact} vs ${d1.faction}+${d1.pact}, after ${act.type}${act.id ? ' ' + act.id : ''}`, report);
      if (g.over || ++steps > 8000) break;
    }
    if (!g.over) { E.endTurn(g, pid); problems += checkState(g, 'end turn', report); }
    g.events.length = 0;
  }
  if (!g.over) { problems++; report(`game did not finish: ${d0.faction}+${d0.pact} vs ${d1.faction}+${d1.pact} (seed ${seed})`); return null; }
  return g.winner;
}

/* ------------------------------------------------------------ stage 1: random decks */
const shapes = [];
fids.forEach((f) => { shapes.push([f, null]); fids.forEach((p) => { if (p !== f) shapes.push([f, p]); }); });
const cardStat = {};      // id -> { g, w } over decks that held the card
const seenTogether = {};  // "factionA|factionB" pairs of card factions that shared a deck
let games1 = 0, pactWins = 0, pactGames = 0;
const t0 = Date.now();
shapes.forEach(([f, p], si) => {
  for (let n = 0; n < N1; n++) {
    const mine = randomDeck(f, p);
    const [of, op] = shapes[rnd(shapes.length)];
    const theirs = randomDeck(of, op);
    const first = n % 2;
    const w = play(mine, theirs, 5000 + (si * 1000 + n) * 7919, first);
    games1++;
    if (w == null) continue;
    [[mine, 0], [theirs, 1]].forEach(([d, side]) => {
      new Set(d.cards).forEach((id) => {
        const s = cardStat[id] || (cardStat[id] = { g: 0, w: 0 });
        s.g++; if (w === side) s.w++;
      });
      if (d.pact) seenTogether[d.faction + '|' + d.pact] = true;
    });
    // pact deck against single-faction deck, either way round
    if (!!mine.pact !== !!theirs.pact && w !== -1) { pactGames++; if ((w === 0) === !!mine.pact) pactWins++; }
  }
});
const all = Object.keys(CARDS).filter((id) => !CARDS[id].token);
const unplayed = all.filter((id) => !cardStat[id]);
if (process.env.PACT) console.log(`RULE EXPERIMENT: Pact limit ${Decks.PACT_LIMIT}`);
console.log(`Stage 1: ${games1} games with random legal decks across ${shapes.length} deck shapes (${shapes.length - fids.length} pacts + ${fids.length} single-faction), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  pairings exercised: ${Object.keys(seenTogether).length} / ${fids.length * (fids.length - 1)}; cards that appeared in a deck: ${all.length - unplayed.length} / ${all.length}`);
if (unplayed.length) console.log('  never in a deck:', unplayed.join(', '));
if (pactGames) console.log(`  random pact decks beat random single-faction decks in ${(100 * pactWins / pactGames).toFixed(0)}% of ${pactGames} games`);

/* ------------------------------------------------------------ stage 2: best-cards decks vs presets */
const rate = (id) => { const s = cardStat[id]; return s && s.g >= 8 ? (s.w + 3) / (s.g + 6) : 0.5; }; // shrunk toward 50%
{
  const ranked = all.filter((id) => cardStat[id] && cardStat[id].g >= 8).sort((a, b) => rate(b) - rate(a));
  const owner = (id) => (CARDS[id].faction === 'neutral' ? 'Colonist' : short(CARDS[id].faction));
  const show = (id) => `${CARDS[id].name} (${owner(id)}) ${(100 * cardStat[id].w / cardStat[id].g).toFixed(0)}%`;
  console.log('  decks holding these cards won most:  ' + ranked.slice(0, 8).map(show).join(', '));
  console.log('  decks holding these cards won least: ' + ranked.slice(-8).reverse().map(show).join(', '));
}

/** Greedy deck: best-scoring cards first, at most the Pact limit from the partner, at least 12 units. */
function bestDeck(faction, pact) {
  const f = FACTIONS[faction];
  const deck = { faction, pact, doctrine: f.presets[Object.keys(f.presets)[0]].doctrine || 'standard', cards: [] };
  const ranked = Decks.poolFor(faction, pact).sort((a, b) => rate(b) - rate(a));
  let pactN = 0;
  const add = (id) => {
    for (let k = 0; k < Decks.copyLimit(id) && deck.cards.length < Decks.DECK_SIZE; k++) {
      if (Decks.source(deck, id) === 'pact') { if (pactN >= Decks.PACT_LIMIT) return; pactN++; }
      deck.cards.push(id);
    }
  };
  // units first until the front line is credible, then the best of everything
  ranked.filter((id) => CARDS[id].type === 'unit').slice(0, 6).forEach(add);
  ranked.filter((id) => !deck.cards.includes(id)).forEach(add);
  const v = Decks.validate(deck);
  if (!v.ok) { problems++; report(`best-cards deck ${faction}+${pact} is illegal: ${v.errors[0]}`); }
  return deck;
}

if (N2 > 0) {
  const presets = [];
  fids.forEach((fid) => Object.keys(FACTIONS[fid].presets).forEach((pk) => {
    presets.push({ faction: fid, pact: null, doctrine: FACTIONS[fid].presets[pk].doctrine || 'standard', cards: buildDeck(fid, pk), key: pk });
  }));
  const t1 = Date.now();
  let seed = 900001;
  const versusPresets = (deck) => {
    let w = 0, n = 0;
    presets.forEach((opp) => {
      for (let k = 0; k < N2; k++) {
        const r = play(deck, opp, (seed += 7919), k % 2);
        if (r == null) continue;
        n++; if (r === 0) w++; else if (r === -1) w += 0.5;
      }
    });
    return n ? w / n : 0;
  };
  const table = {}; // leader -> partner|'-' -> win rate
  let games2 = 0;
  shapes.forEach(([f, p]) => { (table[f] = table[f] || {})[p || '-'] = versusPresets(bestDeck(f, p)); games2 += presets.length * N2; });
  const presetRate = {};
  presets.forEach((d) => { (presetRate[d.faction] = presetRate[d.faction] || []).push(versusPresets(d)); games2 += presets.length * N2; });

  const pct = (x) => (100 * x).toFixed(0).padStart(4) + '%';
  const per = presets.length * N2;
  console.log(`\nStage 2: best-cards deck for each pairing vs the ${presets.length} presets — ${per} games each, ${games2} in all, ${((Date.now() - t1) / 1000).toFixed(0)}s`);
  console.log(`  (± about ${Math.round(100 * Math.sqrt(0.25 / per))} points per figure; rows lead, columns are the Pact partner)`);
  console.log('  ' + 'leader'.padEnd(11) + 'preset'.padStart(7) + 'alone'.padStart(7) + fids.map((p) => short(p).slice(0, 6).padStart(8)).join(''));
  const flat = [];
  fids.forEach((f) => {
    const pr = presetRate[f].reduce((a, b) => a + b, 0) / presetRate[f].length;
    console.log('  ' + short(f).padEnd(11) + pct(pr).padStart(7) + pct(table[f]['-']).padStart(7) +
      fids.map((p) => (p === f ? '·'.padStart(8) : pct(table[f][p]).padStart(8))).join(''));
    fids.forEach((p) => { if (p !== f) flat.push([table[f][p], `${short(f)} + ${short(p)}`]); });
  });
  flat.sort((a, b) => b[0] - a[0]);
  const mean = flat.reduce((a, b) => a + b[0], 0) / flat.length;
  const alone = fids.reduce((a, f) => a + table[f]['-'], 0) / fids.length;
  console.log(`  average: pact decks ${pct(mean).trim()}, best-cards single-faction decks ${pct(alone).trim()}`);
  console.log('  strongest: ' + flat.slice(0, 5).map(([r, n]) => `${n} ${pct(r).trim()}`).join(', '));
  console.log('  weakest:   ' + flat.slice(-5).reverse().map(([r, n]) => `${n} ${pct(r).trim()}`).join(', '));
}

console.log(problems ? `\n${problems} PROBLEMS` : '\nno problems found');
process.exit(problems ? 1 : 0);
