/* Tests for the Design Workshop: parts, pricing, tech and faction gating, and designed units in play.
 * Usage: node test/design.js
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, AI, CARDS, FACTIONS, KEYWORDS, Design: D } = globalThis.TauCeti;
const { checkState } = require('./invariants.js');

let failed = 0, passed = 0;
function ok(cond, what, detail) {
  if (cond) { passed++; return; }
  failed++;
  if (failed <= 40) console.error('FAIL: ' + what + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}
const poolBefore = Object.keys(CARDS).length;
function game(o) {
  o = o || {};
  const g = E.newGame(o.f0 || 'synod', o.f1 || 'ironwake', o.seed || 3, 0, { biome: 'classic', pact0: o.pact0 });
  g.silent = false;
  const p = g.players[0];
  p.hand.length = 0; p.energy = 10; p.maxEnergy = 10; p.research = o.research || 0;
  return g;
}
let nextUid = 90000;
function give(g, pid, id) { const uid = nextUid++; g.players[pid].hand.push({ uid, id, cost: CARDS[id].cost }); return uid; }
const C = (chassis, weapon, armor, ...abilities) => ({ chassis, weapon, armor, abilities });
/** Play a Workshop for player 0 with the given choice; returns the designed hand card or null. */
function design(g, choice) {
  const uid = give(g, 0, 'design_workshop');
  if (!E.playCard(g, 0, uid, null, null, choice)) { g.players[0].hand = g.players[0].hand.filter((h) => h.uid !== uid); return null; }
  return g.players[0].hand.find((h) => D.isDesign(h.id)) || null;
}

/* ---------------------------------------------------------------- the parts table */
{
  const ids = {};
  D.SLOTS.forEach((slot) => D.PARTS[slot].forEach((p) => {
    ok(/^[a-z0-9]+$/.test(p.id), `part id "${p.id}" is plain (no separator characters)`);
    ok(!ids[slot + p.id], `part id ${slot}:${p.id} is unique`); ids[slot + p.id] = true;
    ok(D.TIERS.includes(p.tech), `${p.name}: tech ${p.tech} is one of the tiers`);
    ok(!p.faction || FACTIONS[p.faction], `${p.name}: faction exists`);
    ok(!p.kw || KEYWORDS[p.kw], `${p.name}: keyword exists`);
    ok(D.partBrief(p).length > 0, `${p.name}: has a description`);
  }));
  const sig = {};
  D.SLOTS.forEach((slot) => D.PARTS[slot].forEach((p) => { if (p.faction) sig[p.faction] = (sig[p.faction] || 0) + 1; }));
  ok(Object.keys(FACTIONS).every((f) => sig[f] === 1), 'every faction has exactly one signature part', sig);
  ok(D.PARTS.weapon.concat(D.PARTS.armor, D.PARTS.ability).filter((p) => !p.faction && p.tech === 0).length >= 7, 'there is a real choice of parts at Tech 0');
}

/* ---------------------------------------------------------------- ids, pricing, and every possible design */
{
  const all = D.all();
  ok(all.length > 5000, 'thousands of designs exist', all.length);
  const seen = new Set();
  let bad = 0, nonMono = 0;
  all.forEach((x) => {
    if (seen.has(x.id)) bad++;
    seen.add(x.id);
    const back = D.parse(x.id);
    if (!back || D.idOf(back) !== x.id) bad++;
    const d = D.build(x.choice);
    if (!d || d.id !== x.id || d.type !== 'unit' || !(d.cost >= 1 && d.cost <= D.MAX_COST) || !(d.atk >= 1) || !(d.hp >= 1)) bad++;
    if (!d.name || typeof d.text !== 'string' || !d.art || !(d.faction === 'neutral' || FACTIONS[d.faction])) bad++;
    if (!/^[a-z0-9-]+$/.test(x.id)) bad++;
    // one more point of Attack or Health never makes a design cheaper
    const w = D.part('weapon', x.choice.weapon), a = D.part('armor', x.choice.armor);
    const w2 = D.PARTS.weapon.find((p) => p.atk === w.atk + 1), a2 = D.PARTS.armor.find((p) => !p.faction && p.hp === a.hp + 1);
    if (w2 && D.cost(Object.assign({}, x.choice, { weapon: w2.id })) < x.cost) nonMono++;
    if (a2 && !a.faction && D.cost(Object.assign({}, x.choice, { armor: a2.id })) < x.cost) nonMono++;
  });
  ok(bad === 0, 'every design has a unique id that parses back, and builds a well-formed unit card', bad);
  ok(nonMono === 0, 'more Attack or Health never lowers the cost', nonMono);
  ok(D.idOf(C('inf', 'w2', 'a3', 'blitz', 'guard')) === D.idOf(C('inf', 'w2', 'a3', 'guard', 'blitz')), 'ability order does not matter');
  ok(D.idOf(C('inf', 'w2', 'a3', 'guard', 'guard')) === 'dz-inf-w2-a3-guard', 'a repeated ability counts once');
  ok(D.parse('dz-inf-w2-a3-blitz-guard') === null && D.parse('dz-inf-w2') === null && D.parse('dz-inf-w9-a3') === null && D.parse('survey_drone') === null, 'malformed or non-canonical ids do not parse');
  ok(D.normalize(C('inf', 'w2', 'a3', 'guard', 'blitz', 'flak')) === null, 'three abilities is not a design');

  // the price list: points = Attack + Health + chassis + abilities; Energy = ceil((points - 1) / 2)
  const cost = (...a) => D.cost(C(...a));
  ok(cost('inf', 'w1', 'a1') === 1 && cost('inf', 'w2', 'a3') === 2 && cost('inf', 'w3', 'a4') === 3 && cost('inf', 'w4', 'a5') === 4 && cost('inf', 'w7', 'a8') === 7, 'plain bodies follow the N-cost N/N+1 curve');
  ok(cost('inf', 'w4', 'a4', 'blitz') === 4, 'a 4/4 with Blitz costs 4, like the Iconoclast');
  ok(cost('skim', 'w4', 'a4') === 5, 'a 4/4 Skimmer costs 5, like the Patrol Chopper');
  const pts = (...a) => D.breakdown(C(...a)).points;
  ok(pts('gun', 'w5', 'a5') > pts('skim', 'w5', 'a5') && pts('skim', 'w5', 'a5') > pts('rover', 'w5', 'a5') && cost('gun', 'w5', 'a5') > cost('rover', 'w5', 'a5'), 'Artillery is priced above Aerial, which is priced above Mobile');
  ok(D.partPts(D.part('chassis', 'gun'), 6) > D.partPts(D.part('chassis', 'gun'), 2), 'the Artillery surcharge grows with Attack');
  ok(D.partPts(D.part('ability', 'siphon'), 7) > D.partPts(D.part('ability', 'siphon'), 2) && D.partPts(D.part('chassis', 'skim'), 7) > D.partPts(D.part('chassis', 'skim'), 2), 'so do the Siphon and Aerial surcharges');
  ok(cost('inf', 'w4', 'a5', 'shield') === 6, 'Shielded costs 3 points: a Shielded 4/5 costs 6');
  ok(cost('inf', 'w2', 'bast') < cost('inf', 'w2', 'a6'), 'Bastion Plate gives Health 6 for less');
  ok(D.cost(C('skim', 'w7', 'a8', 'shield', 'siphon')) > D.MAX_COST && !D.all().some((x) => x.id === D.idOf(C('skim', 'w7', 'a8', 'shield', 'siphon'))), 'designs over 10 Energy are excluded');

  const d = D.build(C('rover', 'w4', 'a5', 'guard'));
  ok(d.name === 'Sentinel Rail Rover' && d.atk === 4 && d.hp === 5 && d.kw.mobile && d.kw.guard && d.faction === 'neutral', 'a Sentinel Rail Rover is a 4/5 with Mobile and Guard', d);
  ok(/Guard/.test(d.text) && /Mobile/.test(d.text) && /Rover, Rail Lances, Alloy Carapace, Sentinel Drill/.test(d.flavor), 'its text lists the keywords and its flavor the parts', [d.text, d.flavor]);
  ok(D.build(C('inf', 'w2', 'a3')).name === 'Carbine Squad' && D.build(C('inf', 'w2', 'a3')).text === '', 'a plain design is named for its weapon and chassis');
  ok(D.build(C('skim', 'w5', 'a4', 'shield', 'siphon')).name === 'Aegis Leech Skimmer', 'two abilities name the unit', D.build(C('skim', 'w5', 'a4', 'shield', 'siphon')).name);
  ok(D.build(C('inf', 'w2', 'a3', 'psi')).faction === 'rootbound' && D.build(C('inf', 'w2', 'bast')).faction === 'ironwake', 'a signature part gives the unit its faction');
  ok(D.build(C('inf', 'w2', 'a3', 'zeal')).kw.zeal === 2 && D.build(C('inf', 'w2', 'a3', 'flank')).kw.flank === 2, 'Zeal and Flank come at strength 2');
}

/* ---------------------------------------------------------------- gating by Research */
{
  const g = game({ research: 0 });
  const tryAt = (research, choice) => { g.players[0].research = research; return D.why(g, 0, choice); };
  ok(tryAt(0, C('inf', 'w2', 'a3', 'guard')) === null, 'Tech 0: Infantry, Carbines, Composite Plate and Guard are open');
  ok(tryAt(0, C('inf', 'w1', 'a1', 'blitz')) === null, 'Tech 0: Blitz is open too');
  ok(/Tech 4/.test(tryAt(0, C('rover', 'w2', 'a3'))) && /Tech 4/.test(tryAt(3, C('inf', 'w3', 'a3'))) && /Tech 4/.test(tryAt(3, C('inf', 'w2', 'a4'))) && /Tech 4/.test(tryAt(3, C('inf', 'w2', 'a3', 'flak'))), 'Rover, Coilguns, Ceramic Plate and Flak need Tech 4');
  ok(tryAt(4, C('rover', 'w4', 'a5', 'vet')) === null, 'Tech 4 opens them');
  ok(/Tech 8/.test(tryAt(7, C('skim', 'w2', 'a3'))) && /Tech 8/.test(tryAt(7, C('gun', 'w2', 'a3'))) && /Tech 8/.test(tryAt(7, C('inf', 'w5', 'a3'))) && /Tech 8/.test(tryAt(7, C('inf', 'w2', 'a3', 'shield'))) && /Tech 8/.test(tryAt(7, C('inf', 'w2', 'a3', 'siphon'))), 'Skimmer, Gun Carriage, Plasma Cutters, Aegis and Leech need Tech 8');
  ok(tryAt(8, C('skim', 'w6', 'a7', 'shield')) === null && tryAt(8, C('gun', 'w5', 'a6', 'siphon')) === null, 'Tech 8 opens them');
  ok(/Tech 13/.test(tryAt(12, C('inf', 'w7', 'a3'))) && /Tech 13/.test(tryAt(12, C('inf', 'w2', 'a8'))) && /second ability/.test(tryAt(12, C('inf', 'w2', 'a3', 'guard', 'blitz'))), 'the Singularity Cannon, Monolith Weave and a second ability need Tech 13');
  ok(tryAt(13, C('inf', 'w7', 'a8', 'guard', 'shield')) === null, 'Tech 13 opens them');
  ok(D.abilitySlots(g, 0) === 2 && (g.players[0].research = 12, D.abilitySlots(g, 0)) === 1, 'one ability slot until Tech 13, then two');
  ok(/limit/.test(tryAt(13, C('skim', 'w7', 'a8', 'shield', 'siphon'))), 'a design over 10 Energy is refused', tryAt(13, C('skim', 'w7', 'a8', 'shield', 'siphon')));
  ok(/complete/.test(D.why(g, 0, null)) && /complete/.test(D.why(g, 0, { chassis: 'inf' })) && /complete/.test(D.why(g, 0, C('inf', 'w2', 'a3', 'nope'))), 'a missing or unknown part is refused');
  // the strongest thing each tier can build gets bigger
  const best = (research) => { g.players[0].research = research; return Math.max(...D.all().filter((x) => !D.why(g, 0, x.choice)).map((x) => x.cost)); };
  ok(best(0) <= 3 && best(4) > best(0) && best(8) > best(4) && best(13) >= best(8), 'low Tech builds only cheap units; each tier builds bigger ones', [best(0), best(4), best(8), best(13)]);
}

/* ---------------------------------------------------------------- gating by faction and Pact */
{
  const sigOf = {};
  D.SLOTS.forEach((slot) => D.PARTS[slot].forEach((p) => { if (p.faction) sigOf[p.faction] = p; }));
  const withPart = (p) => (p.slot === 'armor' ? C('inf', 'w2', p.id) : C('inf', 'w2', 'a3', p.id));
  Object.keys(FACTIONS).forEach((f) => {
    const other = Object.keys(FACTIONS).find((x) => x !== f);
    ok(D.why(game({ f0: f, f1: other }), 0, withPart(sigOf[f])) === null, `${f} can use its signature part ${sigOf[f].name} at Tech 0`);
    ok(/only/.test(D.why(game({ f0: other, f1: f }), 0, withPart(sigOf[f]))), `another faction cannot use ${sigOf[f].name}`);
    ok(D.why(game({ f0: other, f1: f, pact0: f }), 0, withPart(sigOf[f])) === null, `…unless it has a Pact with ${f}`);
  });
  const g = game({ f0: 'rootbound', pact0: 'cinder', research: 13 });
  ok(D.why(g, 0, C('inf', 'w3', 'a4', 'psi', 'zeal')) === null, 'a Pact deck at Tech 13 can combine both factions\' signature parts');
}

/* ---------------------------------------------------------------- playing the Workshop */
{
  const g = game({ research: 4 });
  const p = g.players[0];
  const before = JSON.stringify(g.players[1]);
  ok(E.canPlay(g, 0, { uid: 1, id: 'design_workshop', cost: 1 }), 'the Workshop is playable with 1 Energy');
  const wUid = give(g, 0, 'design_workshop');
  ok(E.playCard(g, 0, wUid, null, null) === false && E.playCard(g, 0, wUid, null, null, C('skim', 'w2', 'a3')) === false, 'it cannot be played without a legal design');
  ok(p.energy === 10 && p.hand.length === 1 && p.research === 4, 'a refused play spends nothing');
  g.events.length = 0;
  ok(E.playCard(g, 0, wUid, null, null, C('rover', 'w4', 'a5', 'guard')) === true, 'it plays with a legal design');
  const hc = p.hand[0];
  ok(p.hand.length === 1 && hc.id === 'dz-rover-w4-a5-guard' && hc.cost === 5, 'the designed card is in hand at its price', hc);
  ok(p.energy === 9 && p.research === 5, 'the Workshop costs 1 Energy and counts as an Order for Research');
  ok(g.events.some((e) => e.t === 'design' && e.pid === 0 && e.id === hc.id) && g.events.some((e) => e.t === 'gain' && e.id === hc.id), 'the design is announced');
  ok(CARDS[hc.id] && CARDS[hc.id].name === 'Sentinel Rail Rover', 'its definition can be looked up like any card');
  ok(Object.keys(CARDS).length === poolBefore && !Object.keys(CARDS).includes(hc.id) && !Object.values(CARDS).some((c) => c.designed), 'but it never appears in the card pool');
  ok(JSON.stringify(g.players[1]) === before, 'the opponent is untouched');

  // state stays plain JSON, and a clone can use the card
  const round = JSON.parse(JSON.stringify(g));
  ok(JSON.stringify(round) === JSON.stringify(g), 'game state survives a JSON round trip unchanged');
  const c = E.clone(g);
  ok(E.playCard(c, 0, hc.uid, null, 2) === true && c.players[0].board.some((u) => u.id === hc.id) && p.hand.length === 1, 'a clone can deploy the designed unit without touching the real game');

  // deploy it and use it
  ok(E.playCard(g, 0, hc.uid, null, 2) === true, 'the designed unit deploys');
  const u = p.board.find((x) => x.id === hc.id);
  ok(u && u.atk === 4 && u.hp === 5 && u.maxHp === 5 && E.hasKw(g, u, 'guard') && E.hasKw(g, u, 'mobile') && p.energy === 4, 'as a 4/5 with Guard and Mobile, for 5 Energy', u);
  ok(checkState(g, 'design', () => {}) === 0, 'invariants hold');
  const foe = E.summon(g, 1, 'survey_drone', 2);
  E.endTurn(g, 0); E.endTurn(g, 1);
  const hpBefore = foe.hp;
  ok(E.attack(g, 0, u.uid, { k: 'u', uid: foe.uid }) && (!E.find(g, foe.uid) || foe.hp === hpBefore - 4), 'it attacks for its Attack');
  ok(E.moveTargets(g, u).length > 0, 'and, being Mobile, can still move after attacking');
}
{
  // with a full hand the design still fits, because the Workshop leaves first
  const g = game({ research: 0 });
  const p = g.players[0];
  p.energy = 10;
  while (p.hand.length < E.maxHand(g, 0) - 1) give(g, 0, 'cell');
  const w = give(g, 0, 'design_workshop');
  ok(p.hand.length === E.maxHand(g, 0) && E.playCard(g, 0, w, null, null, C('inf', 'w1', 'a1')) && p.hand.length === E.maxHand(g, 0), 'with a full hand the design takes the Workshop\'s place');
}
{
  // scripted signature parts
  const g = game({ f0: 'synod', research: 0 });
  const p = g.players[0];
  const lab = design(g, C('inf', 'w2', 'a3', 'lab'));
  const r = p.research;
  E.playCard(g, 0, lab.uid, null, 1);
  ok(p.research === r + 1 && /Gain 1 Research/.test(CARDS[lab.id].text), 'Field Lab: Deploy gains 1 Research', p.research - r);

  const g2 = game({ f0: 'auric' });
  const esc = design(g2, C('inf', 'w2', 'a3', 'escort'));
  const armor = g2.players[0].armor;
  E.playCard(g2, 0, esc.uid, null, 1);
  ok(g2.players[0].armor === armor + 3, 'Bonded Escort: Deploy gains 3 Colony Armor');

  const g3 = game({ f0: 'tide' });
  const sal = design(g3, C('inf', 'w1', 'a1', 'salvage'));
  E.playCard(g3, 0, sal.uid, null, 1);
  const su = g3.players[0].board.find((x) => x.id === sal.id);
  const cells = g3.players[0].hand.filter((h) => h.id === 'cell').length;
  E.damage(g3, { k: 'u', uid: su.uid }, 5, null);
  E.playCard(g3, 0, give(g3, 0, 'cell'), null, null); // any action resolves deaths
  ok(g3.players[0].hand.filter((h) => h.id === 'cell').length === cells + 1, 'Salvage Rig: Last Stand adds an Energy Cell');

  const g4 = game({ f0: 'rootbound' });
  const psi = design(g4, C('inf', 'w2', 'a3', 'psi'));
  E.playCard(g4, 0, psi.uid, null, 1);
  ok(E.hasKw(g4, g4.players[0].board.find((x) => x.id === psi.id), 'psi'), 'Psi Lattice: the unit has Psi');

  const g5 = game({ f0: 'ironwake', f1: 'synod' });
  const b = design(g5, C('inf', 'w2', 'bast', 'guard'));
  ok(b && CARDS[b.id].hp === 6 && b.cost === 4 && CARDS[b.id].name === 'Sentinel Bastion Squad' && D.cost(C('inf', 'w1', 'bast')) === 3, 'Bastion Plate: a 1/6 for 3, a 2/6 Guard for 4', b && CARDS[b.id].name);

  // both hooks at once (a Pact deck at Tech 13)
  const g6 = game({ f0: 'synod', pact0: 'auric', research: 13 });
  const both = design(g6, C('inf', 'w2', 'a3', 'lab', 'escort'));
  const r6 = g6.players[0].research, a6 = g6.players[0].armor;
  E.playCard(g6, 0, both.uid, null, 1);
  ok(g6.players[0].research === r6 + 1 && g6.players[0].armor === a6 + 3, 'two Deploy parts both fire');
}
{
  // other cards treat a designed unit as an ordinary unit
  const g = game({ f0: 'synod', f1: 'ironwake', research: 4 });
  const p = g.players[0];
  const id = D.idOf(C('rover', 'w3', 'a4'));
  const eu = E.summon(g, 1, id, 3);               // the enemy fields a design
  ok(eu && eu.atk === 3 && eu.hp === 4, 'a design id can be summoned directly');
  E.playCard(g, 0, give(g, 0, 'reverse_engineer'), { k: 'u', uid: eu.uid }, null);
  ok(!E.find(g, eu.uid) && p.hand.some((h) => h.id === id), 'Reverse Engineer destroys it and copies it');
  ok(E.isForeign(g, 0, id) === false && E.isForeign(g, 0, D.idOf(C('inf', 'w2', 'a3', 'zeal'))) === true, 'a plain design is Colonist; one with another faction\'s part is foreign');
  // a design id met for the first time is rebuilt on demand
  const fresh = D.idOf(C('inf', 'w1', 'a2', 'blitz'));
  ok(!Object.prototype.hasOwnProperty.call(CARDS, fresh) && E.addToHand(g, 0, fresh) && CARDS[fresh].name === 'Assault Sidearm Squad', 'an unseen design id is rebuilt from the id alone');
}

/* ---------------------------------------------------------------- the AI */
{
  const g = game({ f0: 'synod', research: 0 });
  const p = g.players[0];
  p.energy = 1; p.maxEnergy = 3;
  give(g, 0, 'design_workshop');
  const acts = AI.legalActions(g, 0).filter((a) => a.id === 'design_workshop');
  ok(acts.length === 1 && acts[0].choice && D.why(g, 0, acts[0].choice) === null, 'the AI offers one legal design');
  ok(D.cost(acts[0].choice) <= 4, 'with no Energy to spare it designs for next turn', D.cost(acts[0].choice));
  const seed = g.seed;
  AI.legalActions(g, 0); AI.pickDesign(g, 0, 1);
  ok(g.seed === seed, 'choosing a design does not advance the game\'s RNG');
  ok(JSON.stringify(AI.pickDesign(g, 0, 1)) === JSON.stringify(AI.pickDesign(g, 0, 1)), 'the choice is repeatable');
  ok(AI.apply(g, 0, acts[0]) === true && p.hand.some((h) => D.isDesign(h.id)), 'the AI can play it');

  // with Energy to spare it builds something it can deploy at once
  const g2 = game({ f0: 'synod', research: 8 });
  g2.players[0].energy = 6;
  const c2 = AI.pickDesign(g2, 0, 1);
  ok(D.cost(c2) <= 5 && D.cost(c2) >= 4, 'with 5 Energy left it designs a unit it can deploy now', D.cost(c2));
  // it answers the board: Interceptors against Aerial
  const sky = E.summon(g2, 1, 'storm_skiff', 3); sky.summonedTurn = -1;
  E.summon(g2, 1, 'storm_skiff', 5);
  ok(AI.pickDesign(g2, 0, 1).abilities.includes('flak') || D.build(AI.pickDesign(g2, 0, 1)).kw.interceptor, 'facing Aerial units it fits a Flak Mount', AI.pickDesign(g2, 0, 1));
}
{
  // full AI-vs-AI games with Workshops in both decks: nothing breaks, and designs get built and deployed
  let designed = 0, deployed = 0, problems = 0, games = 0;
  const facs = Object.keys(FACTIONS);
  for (let n = 0; n < 14; n++) {
    const f0 = facs[n % 7], f1 = facs[(n * 3 + 1) % 7];
    const deck = (f) => globalThis.TauCeti.buildDeck(f).slice(0, 26).concat(['design_workshop', 'design_workshop', 'design_workshop', 'design_workshop']);
    const g = E.newGame(f0, f1, 700 + n * 37, n % 2, { biome: 'tau_ceti', deck0: deck(f0), deck1: deck(f1), pact0: facs[(n + 2) % 7], mulligan: true });
    AI.mulligan(g);
    g.silent = false;
    let steps = 0;
    while (!g.over && g.turn < 160 && steps < 6000) {
      const pid = g.active;
      for (let k = 0; k < 80; k++) {
        const a = AI.choose(g, pid);
        if (!a) break;
        steps++;
        if (!AI.apply(g, pid, a)) { problems++; break; }
        if (a.type === 'play' && a.id === 'design_workshop') designed++;
        if (a.type === 'play' && D.isDesign(a.id)) deployed++;
        problems += checkState(g, 'ai game', (m) => console.error(m));
        g.events.length = 0;
        if (g.over) break;
      }
      if (!g.over) E.endTurn(g, pid);
    }
    if (g.over) games++;
  }
  ok(problems === 0 && games === 14, '14 AI games with Workshops finish with no broken invariants', [problems, games]);
  ok(designed >= 20 && deployed >= designed * 0.6, 'the AI designs units and goes on to deploy most of them', [designed, deployed]);
}

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
