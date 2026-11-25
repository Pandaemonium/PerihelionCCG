/* Unit tests for deck construction rules, share codes, the saved-deck library and the engine's Pact handling.
 * Usage: node test/decks.js
 */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
require('../js/decks.js');
const { Decks, FACTIONS, CARDS, NEUTRAL_CARDS, Engine: E, buildDeck } = globalThis.TauCeti;

let failed = 0, passed = 0;
function ok(cond, what, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + what + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}
const fids = Object.keys(FACTIONS);
const nonProject = (fid) => FACTIONS[fid].cards.filter((id) => !CARDS[id].project);
const project = (fid) => FACTIONS[fid].cards.find((id) => CARDS[id].project);
const errorsOf = (deck) => Decks.validate(deck).errors;
const has = (errs, re) => errs.some((e) => re.test(e));

/** A legal deck: `pactN` partner cards, the rest from the main faction, topped up with colonist cards. */
function makeDeck(faction, pact, pactN) {
  const cards = [];
  const add = (ids, limit) => {
    for (const id of ids) for (let k = 0; k < Decks.copyLimit(id) && cards.length < limit; k++) cards.push(id);
  };
  if (pact) add(nonProject(pact), pactN);
  add(FACTIONS[faction].cards, Decks.DECK_SIZE);
  add(NEUTRAL_CARDS, Decks.DECK_SIZE);
  return { name: 'Test', faction, pact: pact || null, doctrine: 'standard', cards };
}

/* ---- every shipped preset is a legal deck: single-faction, or within the Pact rules with the partner it names */
fids.forEach((fid) => Object.keys(FACTIONS[fid].presets).forEach((pk) => {
  const pact = FACTIONS[fid].presets[pk].pact || null;
  const v = Decks.validate({ faction: fid, pact, cards: buildDeck(fid, pk) });
  ok(v.ok, `preset ${fid}.${pk} is legal`, v.errors);
  if (!pact) ok(Decks.validate(fid, buildDeck(fid, pk)).ok, `preset ${fid}.${pk} is legal via the (faction, list) form`);
  else ok(v.pact > 0 && v.pact <= Decks.PACT_LIMIT, `Pact preset ${fid}.${pk} uses its partner's cards`, v.pact);
}));

/* ---- pact rules */
const [A, B, C] = fids;
ok(Decks.validate(makeDeck(A, null, 0)).ok, 'single-faction deck is legal', errorsOf(makeDeck(A, null, 0)));
const full = makeDeck(A, B, Decks.PACT_LIMIT);
ok(Decks.validate(full).ok && Decks.validate(full).pact === Decks.PACT_LIMIT, 'deck with exactly the Pact limit is legal', Decks.validate(full));
ok(Decks.pactCount(full) === Decks.PACT_LIMIT, 'pactCount counts partner cards');

const over = makeDeck(A, B, Decks.PACT_LIMIT + 1);
ok(over.cards.length === Decks.DECK_SIZE && has(errorsOf(over), /Too many Pact cards: 11/), 'one card over the Pact limit is rejected', errorsOf(over));

const noPact = makeDeck(A, B, 4); noPact.pact = null;
ok(has(errorsOf(noPact), /neither your faction nor your Pact partner/), 'partner cards without a Pact are rejected', errorsOf(noPact));

const third = makeDeck(A, B, 4); third.cards[third.cards.length - 1] = nonProject(C)[0];
ok(has(errorsOf(third), /neither your faction nor your Pact partner/), 'a third faction is rejected', errorsOf(third));

const stolenProject = makeDeck(A, B, 4); stolenProject.cards[stolenProject.cards.length - 1] = project(B);
ok(has(errorsOf(stolenProject), /Pact partner's Secret Project/), "the partner's Secret Project is rejected", errorsOf(stolenProject));
ok(Decks.source({ faction: A, pact: B }, project(A)) === 'main', 'own Secret Project is allowed');
ok(Decks.source({ faction: A, pact: B }, project(B)) === null && Decks.source({ faction: A, pact: B }, nonProject(B)[0]) === 'pact', 'source() tells pact cards from the partner project');
ok(!Decks.poolFor(A, B).includes(project(B)) && Decks.poolFor(A, B).includes(project(A)), "pool leaves out the partner's project");
ok(Decks.poolFor(A, B).length === FACTIONS[A].cards.length + nonProject(B).length + NEUTRAL_CARDS.length, 'pool size = main + partner non-projects + colonist');
ok(Decks.poolFor(A, null).length === FACTIONS[A].cards.length + NEUTRAL_CARDS.length, 'pool without a Pact');

const selfPact = makeDeck(A, null, 0); selfPact.pact = A;
ok(has(errorsOf(selfPact), /Invalid Pact partner/), 'a faction cannot pact with itself', errorsOf(selfPact));

const three = makeDeck(A, null, 0); three.cards[0] = three.cards[2] = three.cards[1];
ok(has(errorsOf(three), /exceeds limit \(2\)/), 'three copies rejected', errorsOf(three));
const twoProjects = makeDeck(A, null, 0); twoProjects.cards = twoProjects.cards.filter((id) => id !== project(A)).slice(0, 28).concat([project(A), project(A)]);
ok(has(errorsOf(twoProjects), /exceeds limit \(1\)/), 'two copies of a Secret Project rejected', errorsOf(twoProjects));
const short = makeDeck(A, null, 0); short.cards.pop();
ok(has(errorsOf(short), /must have 30 cards \(currently 29\)/), 'short deck rejected', errorsOf(short));
const token = makeDeck(A, null, 0); token.cards[0] = 'cell';
ok(has(errorsOf(token), /Unknown card: cell/), 'tokens rejected', errorsOf(token));

const part = Decks.partition({ faction: A, pact: C, cards: full.cards });
ok(part.illegal.length === Decks.PACT_LIMIT && part.legal.length === Decks.DECK_SIZE - Decks.PACT_LIMIT, 'partition finds cards that a new Pact would orphan', [part.legal.length, part.illegal.length]);

/* ---- share codes */
fids.forEach((f) => fids.forEach((p) => {
  if (f === p) return;
  const deck = makeDeck(f, p, 7); deck.doctrine = 'power';
  const back = Decks.decode(Decks.encode(deck));
  ok(!back.error && back.faction === f && back.pact === p && back.doctrine === 'power' &&
    JSON.stringify(back.cards.slice().sort()) === JSON.stringify(deck.cards.slice().sort()), `code round-trip ${f}+${p}`, back.error);
}));
const mono = makeDeck(A, null, 0);
ok(/^TC2:[a-z]+:none:standard:/.test(Decks.encode(mono)) && Decks.decode(Decks.encode(mono)).pact === null, 'single-faction code round-trip');
const legacyBody = Object.entries(Decks.countsFromList(mono.cards)).map(([id, n]) => `${id}=${n}`).join(',');
const legacy = Decks.decode(`TC1:${A}:green:${legacyBody}`);
ok(!legacy.error && legacy.pact === null && legacy.doctrine === 'green' && legacy.cards.length === 30, 'old TC1 codes still decode', legacy.error);
ok(!!Decks.decode('').error && !!Decks.decode('hello').error && !!Decks.decode('TC2:nobody:none:standard:x=1').error, 'junk codes are refused');
ok(/Pact partner/.test(Decks.decode(`TC2:${A}:${A}:standard:${legacyBody}`).error || ''), 'self-pact code refused');
ok(/Pact/.test(Decks.decode(Decks.encode(over)).error || ''), 'over-limit code refused', Decks.decode(Decks.encode(over)).error);
ok(!!Decks.decode(Decks.encode(mono).replace(/=2/, '=9')).cards, 'copy counts in a code are clamped to 2 (then validated)');

/* ---- library, incl. migration of the old one-deck-per-faction save */
store.tauceti_custom_decks_v1 = JSON.stringify({
  [A]: { cards: buildDeck(A), doctrine: 'power' },
  [B]: { cards: ['no_such_card', nonProject(B)[0]], doctrine: 'nonsense' },
  ghost: { cards: [], doctrine: 'standard' },
});
let lib = Decks.library();
ok(lib.length === 2 && lib[0].faction === A && lib[0].doctrine === 'power' && lib[0].pact === null && lib[0].cards.length === 30, 'old save migrated', lib.map((d) => [d.id, d.name, d.faction, d.cards.length]));
ok(lib[1].cards.length === 1 && lib[1].doctrine === 'standard', 'migration drops unknown cards and bad doctrines', lib[1]);
ok(Decks.playableFor(A).length === 1 && Decks.playableFor(B).length === 0, 'only finished decks are playable');
ok(JSON.parse(store.tauceti_decks_v2).decks.length === 2, 'migration is written to the new store');

const saved = Decks.saveDeck(Object.assign(makeDeck(A, B, 6), { name: '  My   <i>Pact</i> deck  ' }));
ok(saved.id && saved.name === 'My iPact/i deck' && saved.pact === B, 'saveDeck assigns an id and cleans the name', saved.name);
ok(Decks.library().length === 3 && Decks.getDeck(saved.id).cards.length === 30, 'saved deck is in the library');
const again = Decks.saveDeck(Object.assign({}, saved, { name: 'Renamed', doctrine: 'market' }));
ok(again.id === saved.id && Decks.library().length === 3 && Decks.getDeck(saved.id).name === 'Renamed' && Decks.getDeck(saved.id).doctrine === 'market', 'saving with an id updates in place');
ok(Decks.uniqueName('Renamed') === 'Renamed 2' && Decks.uniqueName('Renamed', saved.id) === 'Renamed' && Decks.uniqueName('Fresh') === 'Fresh', 'uniqueName avoids clashes');
const second = Decks.saveDeck(makeDeck(C, null, 0));
ok(second.id !== saved.id, 'ids are not reused');
Decks.deleteDeck(saved.id);
ok(Decks.getDeck(saved.id) === null && Decks.library().length === 3, 'deleteDeck removes one deck');
const third2 = Decks.saveDeck(makeDeck(C, A, 3));
ok(third2.id !== saved.id && third2.id !== second.id, 'a deleted id is not handed out again', third2.id);
store.tauceti_decks_v2 = '{broken json';
ok(Array.isArray(Decks.library()), 'a corrupt store does not throw');
Decks.savePrefs({ faction: A, picks: { [A]: 'deck:d1' } });
ok(Decks.getPrefs().picks[A] === 'deck:d1', 'prefs round-trip');

/* ---- engine: Pact partner cards are not "foreign" */
const pactDeck = makeDeck('tide', 'synod', 8);
const g = E.newGame('tide', 'ironwake', 7, 0, { deck0: pactDeck.cards, pact0: 'synod', biome: 'classic' });
ok(g.players[0].pact === 'synod' && g.players[1].pact === null, 'newGame stores each side\'s Pact');
ok(!E.isForeign(g, 0, nonProject('synod')[0]) && !E.isForeign(g, 0, nonProject('tide')[0]) && !E.isForeign(g, 0, NEUTRAL_CARDS[0]), 'own, partner and colonist cards are not foreign');
ok(E.isForeign(g, 0, nonProject('ironwake')[0]) && E.isForeign(g, 1, nonProject('synod')[0]), 'other factions are foreign');
let sawPartner = false;
for (let i = 0; i < 300; i++) { const id = E.randomForeignCard(g, 0); if (CARDS[id].faction === 'synod' || CARDS[id].faction === 'tide' || CARDS[id].faction === 'neutral') sawPartner = true; }
ok(!sawPartner, 'randomForeignCard never returns a Pact partner card');
const p0 = g.players[0];
const all = p0.deck.concat(p0.hand.map((h) => h.id)).filter((id) => id !== 'cell');
ok(all.length === 30 && all.filter((id) => CARDS[id].faction === 'synod').length === 8, 'the game is played with the pact deck', all.length);
ok(E.newGame('tide', 'ironwake', 7, 0, { pact0: 'tide' }).players[0].pact === null && E.newGame('tide', 'ironwake', 7, 0, { pact0: 'nobody' }).players[0].pact === null, 'bad pact values are ignored');
// Fence Runner discounts foreign cards only
function fenceRunnerCost(otherFaction) {
  const fr = E.newGame('tide', 'ironwake', 3, 0, { deck0: pactDeck.cards, pact0: 'synod', biome: 'classic' });
  const me = fr.players[0];
  me.hand = [
    { uid: 9001, id: 'fence_runner', cost: 0 },
    { uid: 9002, id: nonProject(otherFaction).find((id) => CARDS[id].cost >= 2), cost: 5 },
  ];
  me.energy = 10;
  ok(E.playCard(fr, 0, 9001, null, 0) !== false, 'Fence Runner can be played');
  return me.hand.find((h) => h.uid === 9002).cost;
}
ok(fenceRunnerCost('ironwake') === 4, 'Fence Runner discounts a foreign card');
ok(fenceRunnerCost('synod') === 5, 'Fence Runner does not discount a Pact partner card');

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
