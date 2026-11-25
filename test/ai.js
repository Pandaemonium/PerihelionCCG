/* Unit tests for the AI: whole-turn planning, Energy Cells, deck game plans and hold rules, the difficulty levels,
 * and the copy of the game it plans on.
 * Usage: node test/ai.js
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, AI, CARDS, FACTIONS } = globalThis.TauCeti;
const V = globalThis.TauCeti;

let failed = 0, passed = 0;
function ok(cond, what, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + what + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}

const FILLER = Array(30).fill('survey_drone');
/** A quiet position: player 0 to move with the given hand and Energy, no units on either side. */
function setup(hand, energy, opts) {
  const g = E.newGame('auric', 'ironwake', 7, 0, Object.assign({ biome: 'classic', deck0: FILLER, deck1: FILLER }, opts || {}));
  const p = g.players[0];
  p.hand = [];
  hand.forEach((id) => E.addToHand(g, 0, id));
  p.energy = energy;
  p.maxEnergy = Math.max(energy, 1);
  p.powerUsed = true; // keep the leader power out of these small cases
  g.events = [];
  return g;
}
/** Let the AI play out player 0's turn (without ending it); returns the actions it took. */
function playTurn(g, level, T) {
  const acts = [];
  let a, k = 0;
  while (!g.over && (a = AI.choose(g, 0, T, level)) && k++ < 40) {
    if (!AI.apply(g, 0, a)) { acts.push('ILLEGAL ' + JSON.stringify(a)); break; }
    acts.push(a.type === 'play' ? a.id : a.type);
  }
  return acts;
}
const has = (g, id) => g.players[0].board.some((u) => u.id === id) || g.players[0].sites.some((s) => s.id === id);

/* ---------------------------------------------------------------- Energy Cells */
['transcend', 'commander'].forEach((level) => {
  const g = setup(['cell', 'mercenary_lancer'], 2);
  const acts = playTurn(g, level);
  ok(has(g, 'mercenary_lancer'), `${level}: cashes a Cell to afford a 3-cost unit with 2 Energy`, acts);
});
{
  // 3 Energy pays for the Lancer; a Cell on top pays for its Overcharge (Blitz and Shielded)
  const g = setup(['cell', 'mercenary_lancer'], 3);
  const acts = playTurn(g, 'transcend');
  const u = g.players[0].board.find((x) => x.id === 'mercenary_lancer');
  ok(u && u.kw.shield, 'cashes a Cell to reach an Overcharge', acts);
  ok(acts.indexOf('cell') >= 0 && acts.indexOf('cell') < acts.indexOf('mercenary_lancer'), '…and cashes it before playing the card', acts);
}
{
  const g = setup(['cell', 'cell'], 0);
  const acts = playTurn(g, 'transcend');
  ok(!acts.includes('cell'), 'keeps Cells that would buy nothing', acts);
}
{
  const hand = ['cell'].concat(Array(E.MAX_HAND - 1).fill('dreadnought'));
  const g = setup(hand, 0);
  const acts = playTurn(g, 'transcend');
  ok(acts.includes('cell'), 'cashes a Cell when the hand is nearly full, so the next draw is not burned', acts);
}

/* ---------------------------------------------------------------- deck game plans */
{
  const g = setup(['perimeter_sentry'], 5);
  playTurn(g, 'transcend');
  ok(has(g, 'perimeter_sentry'), 'with no plan, a playable unit is played');
}
{
  const g = setup(['perimeter_sentry'], 5, { plan0: { hold: { perimeter_sentry: 50 } } });
  const acts = playTurn(g, 'transcend');
  ok(!has(g, 'perimeter_sentry'), 'a hold rule keeps the card in hand until it is worth that much', acts);
  ok(JSON.stringify(JSON.parse(JSON.stringify(g))) === JSON.stringify(g), 'a game with a plan is still plain JSON');
}
{
  const g = setup(['perimeter_sentry'], 5, { plan0: { hold: { perimeter_sentry: 50 } } });
  playTurn(g, 'transcend', Object.assign({}, AI.TUNE, { holdScale: 0 }));
  ok(has(g, 'perimeter_sentry'), 'holdScale 0 switches hold rules off');
}
{
  const g = setup(['perimeter_sentry'], 5, { plan0: { hold: { perimeter_sentry: 50 } } });
  playTurn(g, 'colonist', Object.assign({}, AI.TUNE, { noise: 0.001 }));
  ok(has(g, 'perimeter_sentry'), 'the Colonist level ignores game plans');
}
{
  const g = setup(['bunker'], 5);
  playTurn(g, 'transcend');
  ok(has(g, 'bunker'), 'with no plan, a location is built');
  const g2 = setup(['bunker'], 5, { plan0: { weights: { noBuild: 1, notAWeight: 3 } } });
  const acts = playTurn(g2, 'transcend');
  ok(!has(g2, 'bunker'), 'a plan\'s weights replace the AI\'s own', acts);
}
{
  const g = E.newGame('synod', 'tide', 3, 0, { preset0: 'transcend', preset1: 'heist' });
  ok(g.players[0].preset === 'transcend' && g.players[1].preset === 'heist', 'the game records which preset each side plays');
  ok(AI.planOf(g, 0) === (FACTIONS.synod.presets.transcend.plan || null), 'a preset\'s plan is found from the game');
  const g2 = E.newGame('synod', 'tide', 3, 0, { deck0: FILLER, plan0: { keystones: ['survey_drone'] } });
  ok(g2.players[0].preset === null && AI.planOf(g2, 0).keystones[0] === 'survey_drone', 'a custom deck uses the plan it was given');
  ok(AI.planOf(E.newGame('synod', 'tide', 3, 0, { deck0: FILLER }), 0) === null, 'a custom deck without a plan has none');
}
/* ---------------------------------------------------------------- the opening mulligan */
{
  const deal = (ids, opts) => {
    const g = E.newGame('auric', 'ironwake', 7, 0, Object.assign({ biome: 'classic', deck0: FILLER, deck1: FILLER, mulligan: true }, opts || {}));
    const p = g.players[0];
    p.hand = ids.map((id, i) => ({ uid: 9000 + i, id, cost: CARDS[id].cost }));
    return g;
  };
  const tossed = (g, T, level) => AI.mulliganChoice(g, 0, T, level).map((uid) => g.players[0].hand.find((h) => h.uid === uid).id).sort().join();
  ok(tossed(deal(['survey_drone', 'rover_scout', 'storm_skiff'])) === 'storm_skiff', 'the AI keeps its cheap cards and sends back a dear one');
  ok(tossed(deal(['survey_drone', 'field_medic', 'planet_buster'])) === 'planet_buster', 'a 3-cost card is kept beside a cheap one');
  ok(tossed(deal(['field_medic', 'probe_team', 'storm_skiff'])) === 'field_medic,probe_team,storm_skiff', 'a hand with nothing cheap goes back whole');
  ok(tossed(deal(['field_medic', 'cell', 'storm_skiff'])) === 'storm_skiff', 'an Energy Cell makes a 3-cost card worth keeping, and is never sent back itself');
  ok(tossed(deal(['aegis_algorithm', 'survey_drone', 'survey_drone'])) === 'aegis_algorithm', 'a Secret Project goes back');
  ok(tossed(deal(['field_medic', 'storm_skiff', 'storm_skiff'], { plan0: { keystones: ['field_medic'] } })) === 'storm_skiff,storm_skiff', 'a 3-cost keystone is kept');
  ok(tossed(deal(['survey_drone', 'storm_skiff', 'planet_buster'], { plan0: { mulligan: { keep: ['storm_skiff'], toss: ['survey_drone'] } } })) === 'planet_buster,survey_drone', 'a plan can name cards to keep and to send back');
  ok(tossed(deal(['storm_skiff', 'planet_buster', 'survey_drone']), Object.assign({}, AI.TUNE, { mulligan: 0 })) === '', 'mulligan: 0 keeps every card');
  ok(tossed(deal(['storm_skiff', 'planet_buster', 'survey_drone']), null, 'colonist') === '' && tossed(deal(['storm_skiff', 'survey_drone', 'survey_drone']), null, 'commander') === 'storm_skiff', 'the Colonist keeps what it is dealt; the Commander chooses');
  const g = deal(['survey_drone', 'rover_scout', 'storm_skiff']);
  AI.mulligan(g);
  ok(g.mulligan === null && g.turn === 1 && g.players[0].mulliganed === 1, 'AI.mulligan takes both mulligans and the game starts');
  AI.mulligan(g);
  ok(g.turn === 1, 'and does nothing once they are taken');
}
// every preset's plan is well formed
Object.keys(FACTIONS).forEach((f) => Object.keys(FACTIONS[f].presets).forEach((k) => {
  const pre = FACTIONS[f].presets[k], plan = pre.plan;
  if (!plan) return;
  const inDeck = new Set(pre.cards.map((c) => c[0]));
  const where = `${f}.${k} plan`;
  ok(Object.keys(plan).every((x) => ['keystones', 'weights', 'hold', 'value'].includes(x)), `${where}: only known fields`, Object.keys(plan));
  Object.keys(plan.value || {}).forEach((id) => ok(inDeck.has(id) && typeof plan.value[id] === 'number', `${where}: value ${id} is for a card in the deck`));
  (plan.keystones || []).forEach((id) => ok(inDeck.has(id), `${where}: keystone ${id} is in the deck`));
  Object.keys(plan.hold || {}).forEach((id) => ok(inDeck.has(id) && typeof plan.hold[id] === 'number', `${where}: hold rule ${id} is for a card in the deck`));
  Object.keys(plan.weights || {}).forEach((key) => ok(key in AI.TUNE && typeof plan.weights[key] === 'number', `${where}: weight ${key} is an AI.TUNE number`));
  ok(JSON.stringify(JSON.parse(JSON.stringify(plan))) === JSON.stringify(plan), `${where}: plain data`);
}));
Object.keys(CARDS).forEach((id) => { if (CARDS[id].aiHold != null) ok(typeof CARDS[id].aiHold === 'number' && CARDS[id].aiHold > 0, `${id}: aiHold is a positive number`); });

/* ---------------------------------------------------------------- levels */
ok(['colonist', 'commander', 'transcend'].every((l) => AI.LEVELS[l]), 'the three difficulty levels exist');
ok(AI.LEVELS.colonist.noise > 0 && AI.LEVELS.colonist.beam === 0 && AI.LEVELS.commander.beam === 0, 'Colonist and Commander pick one action at a time');
ok(AI.TUNE.beam > 0 && Object.keys(AI.LEVELS.transcend).length === 0, 'Transcend is the full AI');
ok(AI.difficulty === (process.env.AI_LEVEL || 'transcend'), 'the tools play at Transcend unless AI_LEVEL says otherwise');
Object.keys(AI.LEVELS).forEach((l) => Object.keys(AI.LEVELS[l]).forEach((k) => ok(k in AI.TUNE, `level ${l}: ${k} is an AI.TUNE key`)));

/* ---------------------------------------------------------------- the copy the AI plans on */
function playGame(seed, a, b, tunes, levels, check) {
  const g = E.newGame(a.f, b.f, seed, seed % 2, { preset0: a.k, preset1: b.k, doctrine0: a.doc, doctrine1: b.doc, mulligan: true });
  AI.mulligan(g, tunes, levels);
  let illegal = 0;
  while (!g.over && g.turn < 160) {
    const pid = g.active;
    let act, k = 0;
    while (!g.over && (act = AI.choose(g, pid, tunes && tunes[pid], levels && levels[pid])) && k++ < 80) {
      if (!AI.apply(g, pid, act)) { illegal++; break; }
    }
    if (check) check(g);
    if (!g.over) E.endTurn(g, pid);
    g.events.length = 0;
  }
  return { g, illegal };
}
const decks = [];
Object.keys(FACTIONS).forEach((f) => Object.keys(FACTIONS[f].presets).forEach((k) => decks.push({ f, k, doc: FACTIONS[f].presets[k].doctrine || 'standard' })));
{
  const norm = (x) => {
    const c = JSON.parse(JSON.stringify(x));
    delete c.seed; delete c.events; delete c.silent;
    c.players.forEach((p) => p.deck.sort());
    return JSON.stringify(c);
  };
  let same = true, checked = 0, real = true;
  playGame(11, decks[2], decks[9], null, null, (g) => {
    if (checked++ > 12) return;
    const before = JSON.stringify(g);
    const c = E.clone(g);
    if (norm(c) !== norm(g)) same = false;
    if (!c.silent || c.events.length) same = false;
    if (!g.over) { E.endTurn(c, c.active); AI.choose(c, c.active); }
    if (JSON.stringify(g) !== before) real = false;
  });
  ok(same, 'E.clone copies the whole state (decks reshuffled, events dropped, silent set)');
  ok(real, 'playing on a copy leaves the real game untouched');
}

/* ---------------------------------------------------------------- whole games */
{
  // every level plays legal games to the end
  let illegal = 0, unfinished = 0, n = 0;
  ['colonist', 'commander', 'transcend'].forEach((lv, i) => {
    for (let k = 0; k < 6; k++) {
      const r = playGame(500 + i * 31 + k, decks[(k * 3 + i) % decks.length], decks[(k * 5 + 7) % decks.length], null, [lv, lv]);
      illegal += r.illegal; if (!r.g.over) unfinished++; n++;
    }
  });
  ok(illegal === 0, `no illegal actions in ${n} games across the three levels`, illegal);
  ok(unfinished === 0, 'every game finished', unfinished);
}
{
  // the planning AI must clearly beat the one-action AI with the same decks, seats swapped evenly
  let wins = 0, n = 0;
  for (let k = 0; k < 120; k++) {
    const a = decks[k % decks.length], b = decks[(k * 5 + 3) % decks.length];
    const side = k % 2;
    const r = playGame(9000 + k * 7919, a, b, null, side === 0 ? ['transcend', 'commander'] : ['commander', 'transcend']);
    if (!r.g.over || r.g.winner === -1) continue;
    n++;
    if (r.g.winner === side) wins++;
  }
  ok(wins / n > 0.58, `the full AI beats the one-action AI (won ${wins} of ${n}; expected about 70%)`);
}

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
