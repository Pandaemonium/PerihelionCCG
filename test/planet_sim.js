/* Headless Planet Mode simulation: seven AIs per game. Checks the rules engine for crashes,
 * runaway games and broken invariants, and prints how games end, how each faction places, and
 * which cards get played.
 * Usage: node test/planet_sim.js [games] [firstSeed]
 * Rule experiments: PLANET="CONQUEST_CAPITALS=3,CAPACITY=5" node test/planet_sim.js
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/planet_cards.js');
require('../js/planet.js');
require('../js/planet_ai.js');
const { Planet: P, PlanetAI: PA, PCARDS: PC, PDECKS, FACTIONS } = globalThis.TauCeti;
(process.env.PLANET || '').split(',').filter(Boolean).forEach((kv) => {
  const [k, v] = kv.split('=');
  if (typeof P[k] !== 'number') { console.error('unknown rule constant: ' + k); process.exit(1); }
  P[k] = parseFloat(v);
});

const N = parseInt(process.argv[2] || '200', 10);
const SEED0 = parseInt(process.argv[3] || '1', 10);
const ids = Object.keys(FACTIONS);
let problems = 0;
const fail = (seed, msg) => { problems++; if (problems <= 20) console.error(`seed ${seed}: ${msg}`); };

// Deck integrity
ids.forEach((f) => {
  const list = PDECKS.deckList(f);
  if (list.length !== PDECKS.DECK_SIZE) fail('-', `${f} deck has ${list.length} cards (expected ${PDECKS.DECK_SIZE})`);
  list.forEach((id) => {
    if (!PC[id]) fail('-', `${f} deck has unknown card ${id}`);
    else if (PC[id].faction && PC[id].faction !== f) fail('-', `${f} deck has ${PC[id].faction}'s card ${id}`);
  });
});

const kinds = {}, place = {}, wins = {}, played = {};
ids.forEach((f) => { place[f] = 0; wins[f] = 0; });
const tot = { turns: 0, elim: 0, colonies: 0, units: 0, firstElim: 0, firstElimN: 0, overCap: 0, energyLeft: 0, energyN: 0 };
const t0 = Date.now();

/** Every non-token card a player has ever owned is in their deck, hand, discard, or on the board. */
function cardCount(g) {
  let n = 0;
  g.players.forEach((p) => { n += p.deck.length + p.hand.length + p.discard.length; });
  g.units.forEach((u) => { if (!PC[u.card].token) n++; });
  g.colonies.forEach((c) => { n += c.attached.filter((id) => !PC[id].token).length; });
  return n;
}

function check(g, seed, expectCards) {
  const seen = new Set();
  g.colonies.forEach((c) => {
    if (seen.has(c.sector)) fail(seed, `two cities in sector ${c.sector}`);
    seen.add(c.sector);
    if (!g.players[c.owner].alive) fail(seed, `city owned by eliminated player ${c.owner}`);
    if (c.attached.length > P.slots(c)) fail(seed, `city ${c.name} over its slots`);
    if (c.hp > P.maxHp(c)) fail(seed, `city ${c.name} above max HP`);
  });
  g.units.forEach((u) => {
    const d = PC[u.card];
    if (!d) fail(seed, `unknown card ${u.card} on board`);
    if (!g.players[u.owner].alive) fail(seed, `unit of eliminated player ${u.owner}`);
    if (u.hp <= 0) fail(seed, 'dead unit on board');
    if (P.TERRAIN[g.sectors[u.sector].terrain].water && !d.air && !d.naval && !P.colonyAt(g, u.sector)) fail(seed, `${u.card} in ocean`);
  });
  g.sectors.forEach((s) => {
    if (P.cardsIn(g, s.id) > P.CAPACITY) {
      tot.overCap++;
      const owners = new Set(P.unitsAt(g, s.id).map((u) => u.owner));
      if (P.colonyAt(g, s.id)) owners.add(P.colonyAt(g, s.id).owner);
      if (owners.size === 1 && P.cardsIn(g, s.id) > P.CAPACITY + 1) fail(seed, `sector ${s.id} holds ${P.cardsIn(g, s.id)} cards`);
    }
  });
  g.players.forEach((p) => {
    if (p.energy < 0) fail(seed, `negative energy for ${p.pid}`);
    if (p.hand.length > P.HAND_MAX + 6) fail(seed, `hand of ${p.hand.length} for ${p.pid}`);
  });
  const n = cardCount(g);
  if (n > expectCards) fail(seed, `cards appeared from nowhere: ${n} > ${expectCards}`);
  return n;
}

for (let n = 0; n < N; n++) {
  const seed = SEED0 + n * 7919;
  let g;
  try {
    g = P.newGame({ seed });
    let cards = cardCount(g);
    const choices = {};
    g.players.forEach((p) => { choices[p.pid] = PA.landfall(g, p.pid); });
    P.landfall(g, choices);
    cards = cardCount(g); // starting scouts are on top of the decks
    while (g.phase === 'orders' && g.turn <= P.CLOCK + 1) {
      const orders = {};
      g.players.forEach((p) => { if (p.alive) orders[p.pid] = PA.orders(g, p.pid); });
      P.resolve(g, orders);
      g.events.forEach((e) => { if (e.t === 'reveal') played[e.card] = (played[e.card] || 0) + 1; });
      cards = check(g, seed, cards);
      g.players.forEach((p) => { if (p.alive) { tot.energyLeft += p.energy; tot.energyN++; } });
    }
  } catch (e) {
    fail(seed, 'CRASH ' + (e.stack || e));
    continue;
  }
  if (!g.result) { fail(seed, 'game did not end'); continue; }
  kinds[g.result.kind] = (kinds[g.result.kind] || 0) + 1;
  g.result.ranking.forEach((pid, i) => { place[g.players[pid].faction] += i + 1; });
  wins[g.players[g.result.winner].faction]++;
  tot.turns += g.turn;
  Object.keys(g.stats).forEach((k) => { tot[k] = (tot[k] || 0) + g.stats[k]; });
  const out = g.players.filter((p) => !p.alive);
  tot.elim += out.length;
  if (out.length) { tot.firstElim += Math.min(...out.map((p) => p.elimTurn)); tot.firstElimN++; }
  tot.colonies += g.colonies.length;
  tot.units += g.units.length;
}

const per = (k) => ((tot[k] || 0) / N).toFixed(1);
console.log(`${N} games in ${((Date.now() - t0) / 1000).toFixed(1)}s, avg ${per('turns')} turns`);
console.log('endings: ' + Object.keys(kinds).map((k) => `${k} ${(100 * kinds[k] / N).toFixed(0)}%`).join(', '));
console.log(`per game: ${per('collisions')} landfall collisions, ${per('founded')} cities founded, ${per('captures')} captured, ${per('razed')} razed, ${per('takeovers')} bought`);
console.log(`per game: ${per('played')} cards played, ${per('scrapped')} scrapped, ${per('bounced')} bounced back, ${per('battles')} battles, ${per('killed')} units killed`);
console.log(`per game: ${per('elim')} eliminated (first out on turn ${(tot.firstElim / Math.max(1, tot.firstElimN)).toFixed(1)}), ${per('colonies')} cities and ${per('units')} units at the end`);
console.log(`unspent energy per player-turn: ${(tot.energyLeft / Math.max(1, tot.energyN)).toFixed(1)}; over-capacity sector-turns per game: ${per('overCap')}`);
console.log('faction   avg place  wins');
ids.forEach((f) => console.log(`  ${f.padEnd(10)} ${(place[f] / N).toFixed(2)}     ${(100 * wins[f] / N).toFixed(1)}%`));
const totalPlayed = Object.values(played).reduce((a, b) => a + b, 0) || 1;
console.log('cards played (share of all plays): ' + Object.entries(played).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(100 * v / totalPlayed).toFixed(1)}%`).join(', '));
const never = Object.keys(PC).filter((k) => !PC[k].token && !played[k]);
if (never.length) console.log('never played: ' + never.join(', '));
console.log(problems ? `${problems} PROBLEMS` : 'no problems found');
process.exitCode = problems ? 1 : 0;
