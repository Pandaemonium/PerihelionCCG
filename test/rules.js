/* Unit tests for core board rules: opening hands, and what screens a location or the colony from attack.
 * Usage: node test/rules.js
 */
require('../js/world.js');
require('../js/cards.js');
require('../js/design.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, CARDS } = globalThis.TauCeti;

let failed = 0, passed = 0;
function ok(cond, what, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + what + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''));
}
const game = () => E.newGame('rootbound', 'ironwake', 1, 0, { biome: 'classic' });
function unit(g, pid, id, lane) { const u = E.summon(g, pid, id, lane); u.summonedTurn = -1; u.ready = true; return u; }
const site = (g, pid, id, lane) => E.build(g, pid, id, lane, true);
/** What unit u may attack, as a readable list: U<lane> enemy unit, S<lane> enemy location, COLONY. Lanes are 1-based. */
function targets(g, u) {
  return E.attackTargets(g, u).map((t) => {
    if (t.k === 'l') return 'COLONY';
    if (t.k === 'u') return 'U' + (E.find(g, t.uid).unit.lane + 1);
    return 'S' + (E.findSite(g, t.uid).site.lane + 1);
  }).sort().join(' ');
}

/* ---------------------------------------------------------------- opening hands */
[0, 1].forEach((first) => {
  const g = E.newGame('rootbound', 'ironwake', 3, first, { biome: 'classic' });
  const p1 = g.players[g.active], p2 = g.players[1 - g.active];
  // the first player has also drawn for turn 1
  ok(p1.hand.length === E.START_CARDS + 1 && !p1.hand.some((h) => h.id === 'cell'), `first player (seat ${first}): ${E.START_CARDS} cards plus the turn-1 draw`, p1.hand.length);
  ok(p2.hand.filter((h) => h.id !== 'cell').length === E.START_CARDS + 2, 'second player: two extra cards', p2.hand.length);
  ok(p2.hand.filter((h) => h.id === 'cell').length === 1, 'second player: one Reserve Cell');
});
ok(E.SECOND_EXTRA_CARDS === 2 && E.SECOND_CELLS === 1, 'second-player compensation is 2 cards + 1 Cell');

/* ---------------------------------------------------------------- location screening
 * Lanes are written 1–7 as on the board. The enemy Landing Site stands in lane 4 in every case. */
{
  // The reported case: attacker in lane 5, enemy location in lane 6, the only enemy unit in lane 4.
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'sprout', 3);
  ok(targets(g, a) === 'S6 U4', 'unit in lane 4 does not protect the lane-6 location from a lane-5 attacker', targets(g, a));
  ok(!targets(g, a).includes('COLONY'), '…but it still screens the colony');
}
{
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'sprout', 6);
  ok(targets(g, a) === 'COLONY S4 S6', 'unit in lane 7 protects neither the lane-6 location nor the colony from a lane-5 attacker', targets(g, a));
}
{
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'sprout', 5);
  ok(targets(g, a) === 'U6', 'unit in the location\'s own lane (6) protects it', targets(g, a));
}
{
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'sprout', 4);
  ok(targets(g, a) === 'U5', 'unit opposite the attacker (lane 5) protects the lane-6 location', targets(g, a));
}
{
  // a location directly opposite is protected only by the unit in that lane
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 4);
  site(g, 1, 'hab_dome', 5);
  unit(g, 1, 'sprout', 5);
  ok(targets(g, a) === 'S4 S5 U6', 'locations opposite and on the open side can be attacked when the only enemy unit is one lane over; that unit protects its own location', targets(g, a));
}
{
  // both neighbours covered, own lane open
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'hab_dome', 4); site(g, 1, 'colony_pod', 5); // the Landing Site is the lane-4 location
  unit(g, 1, 'sprout', 3); unit(g, 1, 'sprout', 5);
  ok(targets(g, a) === 'S5 U4 U6', 'units in lanes 4 and 6 protect their own locations, not the one in lane 5', targets(g, a));
}
{
  // Guard still forces the attack
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'perimeter_sentry', 3);
  ok(targets(g, a) === 'U4', 'an enemy Guard beside the attacker must be attacked first', targets(g, a));
}
{
  // reach 2 (Artillery): every lane from the attacker to the location counts
  const g = game();
  const a = unit(g, 0, 'mortar_team', 2);
  site(g, 1, 'bunker', 4);
  ok(targets(g, a).includes('S5'), 'Artillery reaches a location two lanes away when the path is clear', targets(g, a));
  const mid = unit(g, 1, 'sprout', 3);
  ok(!targets(g, a).includes('S5'), 'a unit in the lane between blocks it', targets(g, a));
  mid.lane = 0;
  ok(targets(g, a).includes('S5') && targets(g, a).includes('U1'), 'a unit on the far side of the attacker does not', targets(g, a));
  mid.lane = 5;
  ok(targets(g, a).includes('S5'), 'nor does a unit beyond the location', targets(g, a));
}
{
  // Aerial ignores ground units; Interceptors still screen
  const g = game();
  const a = unit(g, 0, 'storm_skiff', 4);
  site(g, 1, 'bunker', 5);
  unit(g, 1, 'sprout', 4); unit(g, 1, 'sprout', 5);
  ok(targets(g, a) === 'COLONY S4 S6 U5 U6', 'Aerial flies over ground units', targets(g, a));
  unit(g, 1, 'aaa_sentry', 3);
  ok(targets(g, a) === 'U4', 'an Interceptor beside it must be attacked first', targets(g, a));
}
{
  // Blitz arrival: units only
  const g = game();
  site(g, 1, 'bunker', 5);
  const a = E.summon(g, 0, 'corsair_captain', 4);
  ok(targets(g, a) === '', 'a unit that arrived this turn cannot attack locations or the colony', targets(g, a));
}
{
  // the AI's own check agrees with the rule
  const g = game();
  const a = unit(g, 0, 'survey_drone', 4);
  const s = site(g, 1, 'bunker', 5);
  const blocker = unit(g, 1, 'sprout', 3);
  ok(E.siteOpen(g, a, s) && !E.unscreened(g, a), 'siteOpen / unscreened agree with attackTargets');
  blocker.lane = 5;
  ok(!E.siteOpen(g, a, s), 'siteOpen sees the blocker');
  ok(E.attack(g, 0, a.uid, { k: 's', uid: s.uid }) === false, 'attacking a screened location is refused');
  blocker.lane = 3;
  ok(E.attack(g, 0, a.uid, { k: 's', uid: s.uid }) === true && s.hp === CARDS.bunker.hp - 1, 'attacking an open location works', s.hp);
}

/* ---------------------------------------------------------------- Artillery: no damage back, and the game says so */
{
  const g = E.newGame('cinder', 'rootbound', 1, 0, { biome: 'classic' });
  g.silent = false;
  const ic = unit(g, 0, 'iconoclast', 2), sl = unit(g, 1, 'spore_launcher', 4);
  ok(!targets(g, ic).includes('U5'), 'setup: the Spore Launcher two lanes away is out of the Iconoclast\'s reach', targets(g, ic));
  E.endTurn(g, 0);
  g.events.length = 0;
  ok(E.attack(g, 1, sl.uid, { k: 'u', uid: ic.uid }), 'Artillery can shell a unit two lanes away');
  ok(ic.hp === CARDS.iconoclast.hp - CARDS.spore_launcher.atk && sl.hp === CARDS.spore_launcher.hp, 'the target is hurt and deals nothing back', [ic.hp, sl.hp]);
  ok(g.events.some((e) => e.t === 'noreturn' && e.ref.uid === ic.uid && e.from.uid === sl.uid), 'a "no return damage" event is raised for the UI, anchored on the defender');
  // when the same unit attacks instead, it deals its damage normally
  const g2 = E.newGame('cinder', 'rootbound', 1, 0, { biome: 'classic' });
  g2.silent = false;
  const ic2 = unit(g2, 0, 'iconoclast', 2), sl2 = unit(g2, 1, 'spore_launcher', 3);
  g2.events.length = 0;
  ok(E.attack(g2, 0, ic2.uid, { k: 'u', uid: sl2.uid }) && sl2.hp <= 0, 'Iconoclast attacking a Spore Launcher destroys it', sl2.hp);
  ok(ic2.hp === CARDS.iconoclast.hp - CARDS.spore_launcher.atk && !g2.events.some((e) => e.t === 'noreturn'), 'and takes the Launcher\'s damage in return', ic2.hp);
}

/* ---------------------------------------------------------------- Shield: swallows one whole hit from an Order, and the game says so */
{
  const g = E.newGame('synod', 'rootbound', 1, 0, { biome: 'classic', doctrine0: 'knowledge' });
  g.silent = false;
  const p = g.players[0];
  // a Mind Worm Boil that cracked a Supply Pod "upgrade": +1/+1 and Shield, which leaves it on 4 health
  const w = unit(g, 1, 'native_mind_worm', 3);
  E.buff(g, w, 1, 1); w.kw.shield = true;
  p.energy = 10; p.research = 3;
  p.hand.length = 0;
  p.hand.push({ uid: 9001, id: 'reverse_engineer', cost: 4 }, { uid: 9002, id: 'reverse_engineer', cost: 4 });
  g.events.length = 0;
  ok(E.playCard(g, 0, 9001, { k: 'u', uid: w.uid }, null), 'Reverse Engineer can target a Shielded unit');
  ok(w.hp === 4 && w.kw.shield === false, 'the Shield absorbs all 4 damage and is used up', [w.hp, w.kw.shield]);
  ok(g.events.some((e) => e.t === 'block' && e.ref.uid === w.uid && e.id === 'native_mind_worm' && e.pid === 1), 'the "block" event names the unit and its owner, for the log');
  ok(!g.events.some((e) => e.t === 'dmg') && !p.hand.some((h) => h.id === 'native_mind_worm'), 'no damage, so no copy');
  ok(p.research === 4, 'the Order still counts for Research (the Breakthrough is unrelated to the lost damage)', p.research);
  g.events.length = 0;
  ok(E.playCard(g, 0, 9002, { k: 'u', uid: w.uid }, null) && !E.find(g, w.uid), 'a second Reverse Engineer destroys the now-unshielded 4-health unit');
  ok(p.hand.some((h) => h.id === 'native_mind_worm'), 'and adds a copy of it to hand');
}

/* ---------------------------------------------------------------- the first player's extra Integrity */
[0, 1].forEach((first) => {
  const g = E.newGame('rootbound', 'ironwake', 3, first, { biome: 'classic', doctrine0: 'market', doctrine1: 'market' });
  const p1 = g.players[first], p2 = g.players[1 - first];
  ok(p1.hp === E.START_HP + E.FIRST_HP && p1.maxHp === p1.hp && p2.hp === E.START_HP, `the player who moves first (seat ${first}) starts with ${E.FIRST_HP} more Integrity`, [p1.hp, p2.hp]);
});
{
  const g = E.newGame('rootbound', 'ironwake', 3, 0, { biome: 'classic', hp0: 12, hp1: 40 });
  ok(g.players[0].hp === 12 && g.players[1].hp === 40, 'a colony whose Integrity the caller fixed gets no bonus', [g.players[0].hp, g.players[1].hp]);
}

/* ---------------------------------------------------------------- the opening mulligan */
{
  const start = () => E.newGame('rootbound', 'ironwake', 5, 0, { biome: 'classic', mulligan: true });
  const g = start();
  g.silent = false;
  const p0 = g.players[0], p1 = g.players[1];
  ok(g.mulligan && g.turn === 0 && p0.energy === 0, 'with mulligan: true the game waits before the first turn');
  ok(p0.hand.length === E.START_CARDS && p1.hand.filter((h) => h.id !== 'cell').length === E.START_CARDS + E.SECOND_EXTRA_CARDS, 'both opening hands are dealt, without the turn-1 draw', [p0.hand.length, p1.hand.length]);
  ok(!E.endTurn(g, 0) && !E.canPlay(g, 1, p1.hand.find((h) => h.id === 'cell')) && !E.canUsePower(g, 0), 'nothing can be played and the turn cannot end until both have chosen');
  ok(E.mulliganOptions(g, 1).length === p1.hand.length - 1 && !E.mulliganOptions(g, 1).some((h) => h.id === 'cell'), 'an Energy Cell cannot be swapped');
  ok(!E.mulligan(g, 1, [p1.hand.find((h) => h.id === 'cell').uid]) && !E.mulligan(g, 0, [424242]) && g.mulligan[0] && g.mulligan[1], 'a swap that names a Cell or a card not in hand is refused');

  // the same deal, kept and swapped: a kept hand is untouched, a swapped card is replaced by the next card of the deck
  const before0 = p0.hand.map((h) => h.id), deck0 = p0.deck.slice(), size = (p) => p.deck.length + p.hand.length;
  const total0 = size(p0), total1 = size(p1);
  const out = [p0.hand[0].uid, p0.hand[2].uid];
  ok(E.mulligan(g, 0, out), 'the first player swaps two cards');
  ok(g.mulligan && !g.mulligan[0] && g.mulligan[1] && g.turn === 0, 'the game still waits for the other player');
  ok(!E.mulligan(g, 0, []), 'a player gets one mulligan');
  ok(p0.hand.length === 3 && p0.hand[1].id === before0[1], 'the hand is the same size and the kept card stays where it was', p0.hand.map((h) => h.id));
  ok(p0.hand[0].id === deck0[deck0.length - 1] && p0.hand[2].id === deck0[deck0.length - 2], 'the replacements are the next cards of the deck, drawn before the swapped cards go back');
  ok(size(p0) === total0 && p0.mulliganed === 2, 'no card is lost or gained', [size(p0), total0]);
  const count = (list, id) => list.filter((x) => x === id).length;
  ok([before0[0], before0[2]].every((id) => count(p0.deck, id) === count(deck0, id) + count([before0[0], before0[2]], id)), 'the swapped cards are back in the deck');
  ok(g.events.some((e) => e.t === 'mulligan' && e.pid === 0 && e.n === 2), 'the swap is announced');
  const keep1 = p1.hand.map((h) => h.id);
  ok(E.mulligan(g, 1, []), 'the second player keeps');
  ok(g.mulligan === null && g.turn === 1 && g.active === 0 && p0.energy === 1, 'the first turn starts once both have chosen');
  ok(p0.hand.length === E.START_CARDS + 1 && size(p1) === total1 && p1.hand.map((h) => h.id).join() === keep1.join(), 'the first player draws for the turn; the kept hand is unchanged');
  ok(E.endTurn(g, 0), 'and play goes on as usual');

  // a mulligan uses the game's seeded randomness, so the same choices replay the same game
  const a = start(), b = start();
  [a, b].forEach((x) => { E.mulligan(x, 0, x.players[0].hand.map((h) => h.uid)); E.mulligan(x, 1, [x.players[1].hand[0].uid]); });
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same swaps on the same seed give the same game');
  ok(E.newGame('rootbound', 'ironwake', 5, 0, { biome: 'classic' }).mulligan === undefined, 'without the option the game starts at once');
  const c = E.clone(start());
  ok(c.mulligan && E.mulligan(c, 0, []) && E.mulligan(c, 1, []) && c.turn === 1, 'a copy of a game that is waiting can take its mulligans too');
}

/* ---------------------------------------------------------------- doctrine updates & Council Decrees */
{
  // Reworked Police State: first unit each turn +0/+1, opening hand -1, milestones +1
  const g = E.newGame('ironwake', 'rootbound', 7, 0, { biome: 'classic', doctrine0: 'police' });
  ok(g.players[0].hp === E.START_HP + E.FIRST_HP && E.milestones(g, 0)[0] === 5, 'Police State starts at base Integrity with +1 Breakthrough cost', [g.players[0].hp, E.milestones(g, 0)]);
  g.players[0].energy = 10;
  g.players[0].hand = [{ uid: 9101, id: 'survey_drone', cost: 1 }, { uid: 9102, id: 'survey_drone', cost: 1 }];
  E.playCard(g, 0, 9101, null, 0);
  E.playCard(g, 0, 9102, null, 1);
  ok(E.unitAt(g, 0, 0).hp === 3 && E.unitAt(g, 0, 1).hp === 2, 'Police State buffs only the first unit deployed each turn (+0/+1)');

  // a doctrine that no longer exists (a deck saved while Cybernetic was in the game) plays as no doctrine at all
  const gc = E.newGame('synod', 'ironwake', 7, 0, { biome: 'classic', doctrine0: 'cybernetic' });
  E.gainArmor(gc, 0, 2);
  ok(gc.players[0].research === 0 && gc.players[0].armor === 2 && gc.players[0].hp === E.START_HP + E.FIRST_HP, 'an unknown doctrine id applies no rules', [gc.players[0].research, gc.players[0].armor, gc.players[0].hp]);

  // Planned: Locations +1 HP, +1 starting Research, max Energy cap 9
  const gp = E.newGame('ironwake', 'rootbound', 7, 0, { biome: 'classic', doctrine0: 'planned' });
  ok(gp.players[0].research === 1 && E.maxEnergyCap(gp, 0) === 9, 'Planned starts with 1 Research and max Energy 9', [gp.players[0].research, E.maxEnergyCap(gp, 0)]);
  const b = E.build(gp, 0, 'bunker', 0);
  ok(b.hp === globalThis.TauCeti.CARDS.bunker.hp + 1, 'Planned gives newly built locations +1 Integrity', b.hp);

  // Planetary Council Decrees
  const gd1 = E.newGame('rootbound', 'ironwake', 7, 0, { biome: 'tau_ceti', decree: 'solar_shade' });
  ok(gd1.lanes.every((l) => l.terrain === null) && gd1.players[0].research === 1, 'Solar Shade clears terrain and grants +1 Research on Cycle Start');

  const gd2 = E.newGame('rootbound', 'ironwake', 7, 0, { biome: 'classic', decree: 'fungal_bloom' });
  ok(gd2.lanes[0].terrain === 'fungus' && gd2.lanes[3].terrain === 'fungus' && gd2.lanes[6].terrain === 'fungus', 'Global Fungal Bloom seeds fungus in lanes 1/4/7');
  ok(E.cost(gd2, 0, { id: 'canopy_beast', cost: 5 }) === 4 && E.cost(gd2, 0, { id: 'seedcaster', cost: 1 }) === 1, 'Global Fungal Bloom discounts Native units by 1 (min 1)');

  const gd3 = E.newGame('rootbound', 'ironwake', 7, 0, { biome: 'classic', decree: 'repeal_charter', doctrine0: 'market', doctrine1: 'market' });
  ok(gd3.players[0].hp === E.START_HP + E.FIRST_HP + 5 && gd3.players[1].hp === E.START_HP + 5, 'Repeal UN Charter grants +5 Integrity to both colonies', [gd3.players[0].hp, gd3.players[1].hp]);
  ok(gd3.players[0].deck.concat(gd3.players[0].hand.map((h) => h.id)).includes('planet_buster'), 'Repeal UN Charter shuffles Planet Buster into each deck');
}

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
