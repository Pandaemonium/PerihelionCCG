/* Unit tests for individual card effects (the Second Landfall expansion cards and the engine hooks they use).
 * Usage: node test/cards.js
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

/** A fresh game on flat ground: player 0 to move, empty hands, 10 Energy each, Landing Sites in lane 3. */
function game(f0, f1, opts) {
  const g = E.newGame(f0 || 'rootbound', f1 || 'ironwake', 1, 0, Object.assign({ biome: 'classic' }, opts));
  g.players.forEach((p) => { p.hand = []; p.energy = 10; p.maxEnergy = 10; });
  return g;
}
function give(g, pid, id, cost) {
  const hc = { uid: g.nextUid++, id, cost: cost == null ? CARDS[id].cost : cost };
  g.players[pid].hand.push(hc);
  return hc.uid;
}
/** Put a card in hand and play it. Returns the unit it deployed (or true), or false if the play was refused. */
function play(g, pid, id, o) {
  o = o || {};
  const before = g.nextUid;
  const uid = give(g, pid, id);
  if (!E.playCard(g, pid, uid, o.target || null, o.lane == null ? null : o.lane)) return false;
  return g.players[pid].board.find((u) => u.uid > before && u.id === id) || true;
}
/** Place a unit that is ready to act (as if it arrived on an earlier turn). */
function unit(g, pid, id, lane) {
  const u = E.summon(g, pid, id, lane);
  u.summonedTurn = -1; u.ready = true;
  return u;
}
const site = (g, pid, id, lane) => E.build(g, pid, id, lane, true);
const uref = (u) => ({ k: 'u', uid: u.uid });
const sref = (s) => ({ k: 's', uid: s.uid });
const hand = (g, pid) => g.players[pid].hand.map((h) => h.id);
const stats = (u) => u.atk + '/' + u.hp;
/** End the current player's turn and the opponent's, returning to the same player. */
function cycle(g) { const pid = g.active; E.endTurn(g, pid); E.endTurn(g, 1 - pid); }

/* ---------------------------------------------------------------- colonist */
{
  const g = game();
  ok(stats(play(g, 0, 'colony_militia', { lane: 3 })) === '2/3', 'Colony Militia: +1/+1 at a location');
  ok(stats(play(g, 0, 'colony_militia', { lane: 0 })) === '1/2', 'Colony Militia: plain elsewhere');
}
{
  const g = game();
  g.lanes[1].terrain = 'ridge';
  play(g, 0, 'geo_survey', { lane: 1 });
  ok(hand(g, 0).length === 1, 'Geosurvey Team: draws in terrain', hand(g, 0));
  play(g, 0, 'geo_survey', { lane: 0 });
  ok(hand(g, 0).length === 1, 'Geosurvey Team: no draw on open ground');
}
{
  const g = game();
  play(g, 0, 'freight_crawler', { lane: 3 });
  play(g, 0, 'freight_crawler', { lane: 0 });
  g.players[0].hand = [];
  cycle(g);
  ok(hand(g, 0).filter((x) => x === 'cell').length === 1, 'Freight Crawler: one Cell, only from the stationed crawler', hand(g, 0));
}
{
  const g = game();
  site(g, 0, 'reclamation_vats', 0);
  const a = unit(g, 0, 'sprout', 1), b = unit(g, 0, 'sprout', 2);
  give(g, 0, 'debris_rain');
  E.playCard(g, 0, g.players[0].hand[0].uid, { k: 'c', lane: 1 }, null);
  ok(!E.alive(a) || !g.players[0].board.includes(a), 'setup: sprouts died');
  ok(hand(g, 0).filter((x) => x === 'cell').length === 1, 'Reclamation Vats: one Cell for the first death in a turn', hand(g, 0));
  void b;
}
{
  const g = game();
  play(g, 0, 'blackbox_gunnery', { target: { k: 'l', pid: 1 } });
  ok(g.players[1].hp === 28 && g.players[0].blackBox === 1, 'Black Box: first Gunnery Log deals 2', g.players[1].hp);
  g.players[0].hp = 20;
  play(g, 0, 'blackbox_medical');
  ok(g.players[0].hp === 26, 'Black Box: Medical Log heals 4 + 2 per earlier box', g.players[0].hp);
  g.players[0].hand = [];
  play(g, 0, 'blackbox_flight');
  ok(hand(g, 0).length === 3, 'Black Box: Flight Log draws 3 after two other boxes', hand(g, 0));
  play(g, 0, 'blackbox_gunnery', { target: { k: 'l', pid: 1 } });
  ok(g.players[1].hp === 23, 'Black Box: fourth box deals 2 + 3', g.players[1].hp);
  const g2 = game();
  play(g2, 0, 'blackbox_flight');
  ok(hand(g2, 0).length === 1, 'Black Box: Flight Log alone draws 1');
  ok(g2.players[0].research === 1, 'Black Boxes are Orders and give Research');
}
{
  const g = game();
  g.lanes[2].terrain = 'fungus';
  play(g, 0, 'landshaper', { lane: 1 });
  ok(g.lanes[1].terrain === 'fungus', 'Landshaper Crew: copies a neighbour', g.lanes[1].terrain);
  const g2 = game();
  g2.lanes[0].terrain = 'ridge'; g2.lanes[2].terrain = 'borehole';
  play(g2, 0, 'landshaper', { lane: 1 });
  ok(g2.lanes[1].terrain === 'borehole', 'Landshaper Crew: prefers the lane nearer the centre', g2.lanes[1].terrain);
  const g3 = game();
  g3.lanes[1].terrain = 'ridge'; g3.lanes[2].terrain = 'fungus';
  play(g3, 0, 'landshaper', { lane: 1 });
  ok(g3.lanes[1].terrain === 'ridge', 'Landshaper Crew: leaves existing terrain alone');
  const g4 = game();
  play(g4, 0, 'landshaper', { lane: 1 });
  ok(g4.lanes[1].terrain == null, 'Landshaper Crew: nothing to copy');
}
{
  const g = game();
  g.players[0].research = 8;
  ok(stats(play(g, 0, 'field_theorist', { lane: 0 })) === '4/5', 'Field Theorist: +1/+1 per Breakthrough (two at 8 Research)');
  const g2 = game('rootbound', 'ironwake', { doctrine0: 'power' });
  g2.players[0].research = 8;
  ok(stats(play(g2, 0, 'field_theorist', { lane: 0 })) === '3/4', 'Field Theorist: Power Doctrine thresholds apply');
}
{
  const g = game();
  const w = unit(g, 0, 'wayfarer', 0);
  ok(E.move(g, 0, w.uid, 1) && stats(w) === '3/4', 'Dust Wayfarer: +1/+1 when it moves', stats(w));
  ok(E.attackTargets(g, w).length > 0, 'Dust Wayfarer: Mobile, can still attack after moving');
}
{
  const g = game();
  site(g, 0, 'dreamcaster_pylon', 1);
  const u = unit(g, 0, 'perimeter_sentry', 1);
  g.players[1].armor = 5;
  ok(E.hasKw(g, u, 'psi'), 'Dreamcaster Pylon: stationed unit has Psi');
  E.attack(g, 0, u.uid, { k: 'l', pid: 1 });
  ok(E.kwVal(g, u, 'zeal') === 1 && g.players[1].armor === 5 && g.players[1].hp === 28, 'Dreamcaster Pylon: Zeal 1, and its attacks ignore Armor', [g.players[1].armor, g.players[1].hp]);
}
{
  const g = game();
  site(g, 0, 'logistics_hub', 0);
  play(g, 0, 'survey_drone', { lane: 1 });
  play(g, 0, 'survey_drone', { lane: 2 });
  ok(hand(g, 0).length === 0, 'Logistics Hub: nothing after two cards');
  play(g, 0, 'colony_militia', { lane: 4 });
  ok(hand(g, 0).length === 1, 'Logistics Hub: draws after the third card', hand(g, 0));
  play(g, 0, 'colony_militia', { lane: 5 });
  ok(hand(g, 0).length === 1, 'Logistics Hub: only once a turn');
  const g2 = game();
  play(g2, 0, 'survey_drone', { lane: 1 }); play(g2, 0, 'survey_drone', { lane: 2 });
  E.playCard(g2, 0, give(g2, 0, 'logistics_hub'), null, 0);
  ok(hand(g2, 0).length === 0, 'Logistics Hub: does not count itself as the third card');
}
{
  const g = game();
  const u = play(g, 0, 'excavation_team', { lane: 0 });
  ok(g.lanes[0].terrain === 'monolith', 'Excavation Team: unearths a Monolith');
  E.endTurn(g, 0);
  ok(stats(u) === '4/5', 'Excavation Team: then benefits from it', stats(u));
  const g2 = game();
  g2.lanes[0].terrain = 'ridge';
  play(g2, 0, 'excavation_team', { lane: 0 });
  ok(g2.lanes[0].terrain === 'ridge', 'Excavation Team: does not replace terrain');
}

/* ---------------------------------------------------------------- Rootbound */
{
  const g = game();
  g.lanes[1].terrain = 'ridge';
  play(g, 0, 'spore_tender', { lane: 1 });
  play(g, 0, 'spore_tender', { lane: 5 });
  E.endTurn(g, 0);
  ok(g.players[0].board.filter((u) => u.id === 'sprout').length === 1, 'Spore Tender: Sprout only from the one in terrain');
}
{
  const g = game();
  site(g, 0, 'mulch_bed', 0);
  const keeper = unit(g, 0, 'perimeter_sentry', 0);
  const s1 = unit(g, 0, 'sprout', 1);
  E.destroy(g, uref(s1));
  give(g, 0, 'cell'); E.playCard(g, 0, g.players[0].hand[0].uid, null, null); // any action resolves deaths
  ok(stats(keeper) === '2/5', 'Mulch Bed: stationed unit grows when an ally dies', stats(keeper));
}
{
  const g = game();
  play(g, 0, 'brood_whisperer', { lane: 1 });
  const w = g.players[0].board.find((u) => u.id === 'mind_worm');
  ok(w && E.hasKw(g, w, 'psi') && stats(w) === '2/2', 'Brood Whisperer: summons a 2/2 Psi Mind Worm');
}
{
  const g = game();
  const weak = site(g, 1, 'archive_vault', 0); weak.hp = 2;
  play(g, 0, 'rootquake');
  const landing = g.players[1].sites.find((s) => s.id === 'landing');
  ok(landing.hp === 3, 'Rootquake: 2 damage to every enemy location', landing.hp);
  ok(!g.players[1].sites.includes(weak) && g.players[1].hp === 27, 'Rootquake: razes weak locations (colony takes raze damage)', g.players[1].hp);
  ok(g.players[0].board.filter((u) => u.id === 'sprout').length === 1 && g.players[0].razed === 1, 'Rootquake: one Sprout per location razed');
}

/* ---------------------------------------------------------------- Ironwake */
{
  const g = game('ironwake', 'rootbound');
  const a = unit(g, 1, 'worldroot_titan', 3), b = unit(g, 1, 'worldroot_titan', 0);
  play(g, 0, 'killing_ground', { target: uref(a) });
  play(g, 0, 'killing_ground', { target: uref(b) });
  ok(a.hp === 3 && b.hp === 5, 'Killing Ground: 4 in a lane with your location, otherwise 2', [a.hp, b.hp]);
}
{
  const g = game('ironwake', 'rootbound');
  const t = unit(g, 1, 'worldroot_titan', 0);
  g.players[0].armor = 3;
  play(g, 0, 'bastion_gunner', { lane: 1, target: uref(t) });
  ok(t.hp === 3 && g.players[0].armor === 5, 'Bastion Gunner: gains 2 Armor, then damage equal to Armor (capped at 4)', t.hp);
  g.players[0].armor = 9;
  play(g, 0, 'bastion_gunner', { lane: 2, target: uref(t) });
  ok(t.hp === 0 || !g.players[1].board.includes(t), 'Bastion Gunner: capped at 4');
  const g2 = game('ironwake', 'rootbound');
  const t2 = unit(g2, 1, 'worldroot_titan', 0);
  play(g2, 0, 'bastion_gunner', { lane: 1, target: uref(t2) });
  ok(t2.hp === 5, 'Bastion Gunner: 2 damage from its own Armor alone', t2.hp);
}
{
  const g = game('ironwake', 'rootbound');
  const guard = unit(g, 0, 'perimeter_sentry', 0), plain = unit(g, 0, 'survey_drone', 1);
  const cap = play(g, 0, 'line_captain', { lane: 2 });
  ok(stats(guard) === '1/6' && stats(plain) === '1/2' && stats(cap) === '3/4', 'Line Captain: +0/+2 to other Guard units only', [stats(guard), stats(plain)]);
}
{
  const g = game('ironwake', 'rootbound');
  site(g, 0, 'bunker', 0);
  ok(stats(play(g, 0, 'works_foreman', { lane: 1 })) === '5/5', 'Works Foreman: +1/+1 per location (two)');
  site(g, 0, 'bunker', 1); site(g, 0, 'bunker', 2);
  ok(stats(play(g, 0, 'works_foreman', { lane: 4 })) === '6/6', 'Works Foreman: capped at +3/+3');
}

/* ---------------------------------------------------------------- Lumen Synod */
{
  const g = game('synod', 'rootbound');
  play(g, 0, 'field_researcher', { lane: 3 });
  play(g, 0, 'field_researcher', { lane: 0 });
  E.endTurn(g, 0);
  ok(g.players[0].research === 1, 'Field Researcher: 1 Research, only when stationed', g.players[0].research);
}
{
  const g = game('synod', 'rootbound');
  ok(!play(g, 0, 'theorem_guard', { lane: 0 }).kw.shield, 'Theorem Guard: no shield below Tech 3');
  g.players[0].research = 3;
  ok(play(g, 0, 'theorem_guard', { lane: 1 }).kw.shield === true, 'Theorem Guard: Shielded at Tech 3');
}
{
  const g = game('synod', 'rootbound');
  const prey = unit(g, 1, 'seedcaster', 0), big = unit(g, 1, 'worldroot_titan', 1);
  big.hp = 8; big.maxHp = 8;
  play(g, 0, 'reverse_engineer', { target: uref(prey) });
  ok(hand(g, 0).includes('seedcaster') && !g.players[1].board.includes(prey), 'Reverse Engineer: copy of a destroyed unit', hand(g, 0));
  play(g, 0, 'reverse_engineer', { target: uref(big) });
  ok(!hand(g, 0).includes('worldroot_titan') && big.hp === 4, 'Reverse Engineer: no copy if the unit survives');
}
{
  const g = game('synod', 'rootbound');
  site(g, 0, 'feedback_pylon', 0);
  const opp = unit(g, 1, 'worldroot_titan', 0), other = unit(g, 1, 'worldroot_titan', 1);
  play(g, 0, 'deep_query');
  ok(opp.hp === 6 && other.hp === 7, 'Feedback Pylon: 1 damage to the unit opposite when you play an Order', [opp.hp, other.hp]);
  give(g, 0, 'cell'); E.playCard(g, 0, g.players[0].hand.find((h) => h.id === 'cell').uid, null, null);
  ok(opp.hp === 6, 'Feedback Pylon: Reserve Cells do not count');
}

/* ---------------------------------------------------------------- Free Tide */
{
  const g = game('tide', 'rootbound');
  const a = site(g, 1, 'manifold_former', 0), b = site(g, 1, 'manifold_former', 1);
  unit(g, 1, 'sprout', 1);
  play(g, 0, 'limpet_charge', { target: sref(a) });
  play(g, 0, 'limpet_charge', { target: sref(b) });
  ok(a.hp === 2 && b.hp === 4, 'Limpet Charge: 5 to an unstaffed location, 3 to a staffed one', [a.hp, b.hp]);
}
{
  const g = game('tide', 'rootbound');
  const r = unit(g, 0, 'cell_runner', 0);
  E.playCard(g, 0, give(g, 0, 'cell'), null, null);
  E.playCard(g, 0, give(g, 0, 'cell'), null, null);
  play(g, 0, 'survey_drone', { lane: 1 });
  ok(stats(r) === '4/3', 'Cell Runner: +1/+0 per Reserve Cell played, not for other cards', stats(r));
}
{
  const g = game('tide', 'rootbound');
  const boss = unit(g, 0, 'salvage_boss', 0);
  const s = site(g, 1, 'archive_vault', 1);
  play(g, 0, 'limpet_charge', { target: sref(s) });
  ok(stats(boss) === '4/5' && hand(g, 0).length === 1 && g.players[0].razed === 1, 'Salvage Boss: draws and grows when an enemy location is razed', [stats(boss), hand(g, 0)]);
}
{
  const g = game('tide', 'rootbound');
  unit(g, 0, 'tide_quartermaster', 0);
  cycle(g);
  ok(hand(g, 0).length === 2, 'Tide Quartermaster: extra draw with a small hand', hand(g, 0));
  for (let i = 0; i < 4; i++) give(g, 0, 'cell');
  cycle(g);
  ok(hand(g, 0).length === 7, 'Tide Quartermaster: no extra draw with more than 3 cards', hand(g, 0).length);
}

/* ---------------------------------------------------------------- Cinder Choir */
{
  const g = game('cinder', 'rootbound');
  const z = unit(g, 0, 'pyre_bearer', 0), plain = unit(g, 0, 'survey_drone', 1);
  const base = E.effectiveAtk(g, z, null);
  play(g, 0, 'fervor', { target: uref(z) });
  ok(E.effectiveAtk(g, z, null) === base + 2 && hand(g, 0).length === 1, 'Fervor: +2 Attack this turn and a card for a Zeal unit', [E.effectiveAtk(g, z, null), hand(g, 0)]);
  play(g, 0, 'fervor', { target: uref(plain) });
  ok(hand(g, 0).length === 1 && E.effectiveAtk(g, plain, null) === 3, 'Fervor: no card without Zeal');
  cycle(g);
  ok(E.effectiveAtk(g, z, null) === base && z.atk === 2, 'Fervor: wears off', E.effectiveAtk(g, z, null));
  const g2 = game('rootbound', 'ironwake', { doctrine0: 'power' });
  const u2 = unit(g2, 0, 'survey_drone', 0);
  play(g2, 0, 'fervor', { target: uref(u2) });
  ok(hand(g2, 0).length === 1, 'Fervor: Zeal from Power Doctrine counts');
}
{
  const g = game('cinder', 'synod');
  ok(stats(play(g, 0, 'heresy_hunter', { lane: 0 })) === '2/2', 'Heresy Hunter: plain at equal Research');
  g.players[1].research = 3;
  ok(stats(play(g, 0, 'heresy_hunter', { lane: 1 })) === '4/3', 'Heresy Hunter: +2/+1 when behind on Research');
}
{
  const g = game('cinder', 'rootbound');
  const m = unit(g, 0, 'ash_mourner', 0);
  const p1 = unit(g, 0, 'pilgrim', 1);
  E.destroy(g, uref(p1));
  E.playCard(g, 0, give(g, 0, 'cell'), null, null);
  ok(stats(m) === '3/4', 'Ash Mourner: grows when another friendly unit dies', stats(m));
}
{
  const g = game('cinder', 'rootbound');
  unit(g, 0, 'doomsayer', 0);
  E.endTurn(g, 0);
  ok(g.players[1].hp === 30, 'Doomsayer: nothing before any location is razed');
  E.endTurn(g, 1);
  g.players[0].razed = 5;
  E.endTurn(g, 0);
  ok(g.players[1].hp === 27, 'Doomsayer: 1 damage per razed location, up to 3', g.players[1].hp);
}

/* ---------------------------------------------------------------- Auric Charter */
{
  const g = game('auric', 'rootbound');
  unit(g, 0, 'venture_agent', 0);
  E.playCard(g, 0, give(g, 0, 'bunker'), null, 1);
  ok(hand(g, 0).filter((x) => x === 'cell').length === 1, 'Venture Agent: a Cell when you build a location', hand(g, 0));
}
{
  const g = game('auric', 'rootbound');
  play(g, 0, 'underwriter', { lane: 0 });
  ok(g.players[0].armor === 1, 'Underwriter: 1 Armor per location (Landing Site only)', g.players[0].armor);
  site(g, 0, 'bunker', 0); site(g, 0, 'bunker', 1); site(g, 0, 'bunker', 2);
  play(g, 0, 'underwriter', { lane: 1 });
  ok(g.players[0].armor === 4, 'Underwriter: capped at 3', g.players[0].armor);
}
{
  const g = game('auric', 'rootbound');
  const t = unit(g, 1, 'worldroot_titan', 0);
  give(g, 0, 'cell'); give(g, 0, 'cell');
  play(g, 0, 'asset_seizure', { target: uref(t) });
  ok(t.hp === 5, 'Asset Seizure: damage equals other cards in hand', t.hp);
  for (let i = 0; i < 6; i++) give(g, 0, 'cell');
  play(g, 0, 'asset_seizure', { target: uref(t) });
  ok(t.hp === 0 || !g.players[1].board.includes(t), 'Asset Seizure: capped at 5');
}
{
  const g = game('auric', 'rootbound');
  play(g, 0, 'arbitrageur', { lane: 0 });
  ok(g.players[0].research === 2 && hand(g, 0).length === 1 && g.players[0].energy === 5, 'Arbitrageur: Overcharge pays 2 more for 2 Research and a card', [g.players[0].research, g.players[0].energy]);
  g.players[0].energy = 3; g.players[0].hand = [];
  play(g, 0, 'arbitrageur', { lane: 1 });
  ok(g.players[0].research === 2 && hand(g, 0).length === 0, 'Arbitrageur: no bonus without spare Energy');
}

/* ---------------------------------------------------------------- Redline Cadre */
{
  const g = game('redline', 'rootbound');
  const two = unit(g, 0, 'outrider_recon', 0);   // Mobile, Flank
  const none = unit(g, 0, 'survey_drone', 1);
  const many = unit(g, 0, 'marshals_vanguard', 2); // Mobile, Interceptor, Veteran
  site(g, 0, 'bunker', 2);                         // + Guard = 4 keywords
  play(g, 0, 'combined_arms', { target: uref(two) });
  play(g, 0, 'combined_arms', { target: uref(none) });
  play(g, 0, 'combined_arms', { target: uref(many) });
  ok(stats(two) === '4/3' && stats(none) === '1/2' && stats(many) === '8/8', 'Combined Arms: +1/+1 per keyword, capped at 3, location grants count', [stats(two), stats(none), stats(many)]);
}
{
  const g = game('redline', 'rootbound');
  const rookie = unit(g, 0, 'survey_drone', 0);
  const prey = unit(g, 1, 'sprout', 0);
  play(g, 0, 'drill_instructor', { lane: 1, target: uref(rookie) });
  ok(stats(rookie) === '2/3' && E.hasKw(g, rookie, 'veteran'), 'Drill Instructor: +1/+1 and Veteran', stats(rookie));
  E.attack(g, 0, rookie.uid, uref(prey));
  ok(rookie.promoted && rookie.atk === 3, 'Drill Instructor: the new Veteran promotes on its first kill', stats(rookie));
}
{
  const g = game('redline', 'rootbound');
  g.lanes[1].terrain = 'wreck';
  ok(stats(play(g, 0, 'ridge_battery', { lane: 1 })) === '2/4', 'Ridge Battery: +1/+1 in terrain');
  ok(stats(play(g, 0, 'ridge_battery', { lane: 5 })) === '1/3', 'Ridge Battery: plain on open ground');
}
{
  const g = game('redline', 'rootbound');
  const h = unit(g, 0, 'headhunter', 0);
  const prey = unit(g, 1, 'sprout', 0), tough = unit(g, 1, 'worldroot_titan', 5);
  E.attack(g, 0, h.uid, uref(prey));
  ok(hand(g, 0).length === 1, 'Headhunter: draws on a kill', hand(g, 0));
  const h2 = unit(g, 0, 'headhunter', 5);
  E.attack(g, 0, h2.uid, uref(tough));
  ok(hand(g, 0).length === 1, 'Headhunter: no draw without a kill');
  // defending kills count too
  const g2 = game('redline', 'rootbound');
  const d = unit(g2, 0, 'headhunter', 0);
  E.endTurn(g2, 0);
  const attacker = unit(g2, 1, 'sprout', 0);
  g2.players[0].hand = [];
  E.attack(g2, 1, attacker.uid, uref(d));
  ok(hand(g2, 0).length === 1, 'Headhunter: also draws when it kills an attacker', hand(g2, 0));
}

/* ---------------------------------------------------------------- every card is well formed */
Object.values(CARDS).forEach((c) => {
  const where = c.id + ' (' + c.name + ')';
  ok(['unit', 'order', 'site'].includes(c.type), where + ' has a type');
  ok(Number.isInteger(c.cost) && c.cost >= 0, where + ' has a cost');
  if (c.type === 'unit') ok(Number.isInteger(c.atk) && Number.isInteger(c.hp) && c.hp > 0, where + ' has stats');
  if (c.type === 'site') ok(Number.isInteger(c.hp) && c.hp > 0 && typeof c.brief === 'string', where + ' has integrity and a brief');
  if (c.type === 'order') ok(typeof c.play === 'function', where + ' has an effect');
  ok(typeof c.text === 'string' && typeof c.flavor === 'string' && c.art, where + ' has text, flavour and art');
  Object.keys(c.kw || {}).forEach((k) => ok(!!globalThis.TauCeti.KEYWORDS[k], where + ' keyword ' + k + ' exists'));
  // keywords printed on the card match the keywords it has
  Object.keys(c.kw || {}).forEach((k) => {
    const name = globalThis.TauCeti.KEYWORDS[k].name;
    ok(new RegExp('<b>' + name).test(c.text), where + ' text mentions ' + name);
  });
});

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
