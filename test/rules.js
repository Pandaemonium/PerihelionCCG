/* Unit tests for core board rules: opening hands, and what screens a location or the colony from attack.
 * Usage: node test/rules.js
 */
require('../js/world.js');
require('../js/cards.js');
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

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
