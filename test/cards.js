/* Unit tests for individual card effects (the Second Landfall expansion cards and the engine hooks they use).
 * Usage: node test/cards.js
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

/** A fresh game on flat ground: player 0 to move, empty hands, 10 Energy and 30 Integrity each, Landing Sites in lane 3. */
function game(f0, f1, opts) {
  const g = E.newGame(f0 || 'rootbound', f1 || 'ironwake', 1, 0, Object.assign({ biome: 'classic', hp0: 30, hp1: 30 }, opts));
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
/** A card's printed stats plus a bonus, as "atk/hp", so a check survives a balance change to the base stats. */
const plus = (id, a, h) => (CARDS[id].atk + a) + '/' + (CARDS[id].hp + h);
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
  ok(stats(guard) === plus('perimeter_sentry', 1, 2) && stats(plain) === plus('survey_drone', 0, 0) && stats(cap) === plus('line_captain', 0, 0), 'Line Captain: +1/+2 to other Guard units only', [stats(guard), stats(plain)]);
}
{
  const g = game('ironwake', 'rootbound');
  site(g, 0, 'bunker', 0);
  ok(stats(play(g, 0, 'works_foreman', { lane: 1 })) === plus('works_foreman', 2, 2), 'Works Foreman: +1/+1 per location (two)');
  site(g, 0, 'bunker', 1); site(g, 0, 'bunker', 2);
  ok(stats(play(g, 0, 'works_foreman', { lane: 4 })) === plus('works_foreman', 3, 3), 'Works Foreman: capped at +3/+3');
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
  ok(stats(r) === plus('cell_runner', 2, 2), 'Cell Runner: +1/+1 per Energy Cell played, not for other cards', stats(r));
}
{
  const g = game('tide', 'rootbound');
  const boss = unit(g, 0, 'salvage_boss', 0);
  const s = site(g, 1, 'archive_vault', 1);
  play(g, 0, 'limpet_charge', { target: sref(s) });
  ok(stats(boss) === plus('salvage_boss', 1, 1) && hand(g, 0).length === 1 && g.players[0].razed === 1, 'Salvage Boss: draws and grows when an enemy location is razed', [stats(boss), hand(g, 0)]);
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
  ok(stats(play(g, 0, 'heresy_hunter', { lane: 0 })) === plus('heresy_hunter', 0, 0), 'Heresy Hunter: plain at equal Research');
  g.players[1].research = 3;
  ok(stats(play(g, 0, 'heresy_hunter', { lane: 1 })) === plus('heresy_hunter', 2, 1), 'Heresy Hunter: +2/+1 when behind on Research');
}
{
  const g = game('cinder', 'rootbound');
  const m = unit(g, 0, 'ash_mourner', 0);
  const p1 = unit(g, 0, 'pilgrim', 1);
  E.destroy(g, uref(p1));
  E.playCard(g, 0, give(g, 0, 'cell'), null, null);
  ok(stats(m) === plus('ash_mourner', 1, 1), 'Ash Mourner: grows when another friendly unit dies', stats(m));
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
  ok(stats(play(g, 0, 'ridge_battery', { lane: 1 })) === plus('ridge_battery', 1, 1), 'Ridge Battery: +1/+1 in terrain');
  ok(stats(play(g, 0, 'ridge_battery', { lane: 5 })) === plus('ridge_battery', 0, 0), 'Ridge Battery: plain on open ground');
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

/* ---------------------------------------------------------------- Pacts expansion */
{
  const g = game();
  g.players[0].deck = ['survey_drone', 'bunker', 'data_spike'];
  play(g, 0, 'site_planner', { lane: 0 });
  ok(hand(g, 0).join() === 'bunker' && g.players[0].deck.length === 2, 'Site Planner: draws a location from the deck', hand(g, 0));
  g.players[0].hand = [];
  play(g, 0, 'site_planner', { lane: 1 });
  ok(hand(g, 0).length === 0 && g.players[0].deck.length === 2, 'Site Planner: draws nothing when the deck has no location', hand(g, 0));
}
{
  const g = game();
  g.players[0].deck = ['survey_drone', 'dreadnought', 'data_spike', 'siege_walker'];
  play(g, 0, 'heavy_requisition');
  const got = hand(g, 0);
  ok(got.length === 1 && CARDS[got[0]].type === 'unit' && CARDS[got[0]].cost >= 5 && g.players[0].deck.length === 3, 'Heavy Requisition: draws a unit costing 5 or more', got);
}
{
  const g = game('synod', 'ironwake');
  g.players[0].deck = ['data_spike', 'deep_query', 'survey_drone'];
  play(g, 0, 'datalinks_search');
  ok(hand(g, 0).join() === 'deep_query', 'Datalinks Search: draws an Order costing 3 or more', hand(g, 0));
  // a full hand burns the card instead of holding ten
  const g2 = game('synod', 'ironwake');
  g2.players[0].deck = ['deep_query'];
  for (let i = 0; i < E.maxHand(g2, 0); i++) give(g2, 0, 'cell');
  give(g2, 0, 'datalinks_search');
  g2.players[0].hand.shift(); // make room for the search itself, so the hand is full again once it is played
  E.playCard(g2, 0, g2.players[0].hand[g2.players[0].hand.length - 1].uid, null, null);
  ok(g2.players[0].hand.length <= E.maxHand(g2, 0), 'a tutor never overfills the hand', g2.players[0].hand.length);
}
{
  const g = game();
  const u = unit(g, 0, 'perimeter_sentry', 2);
  unit(g, 1, 'perimeter_sentry', 2);
  ok(!E.attackTargets(g, u).some((t) => t.k === 'l'), 'setup: an enemy Guard screens the colony');
  play(g, 0, 'grav_harness', { target: uref(u) });
  ok(E.hasKw(g, u, 'aerial') && stats(u) === plus('perimeter_sentry', 1, 0) && E.attackTargets(g, u).some((t) => t.k === 'l'),
    'Grav Harness: Aerial and +1/+0, so the unit flies over the Guard', stats(u));
}
{
  const g = game();
  g.lanes[1].terrain = 'ridge';
  unit(g, 0, 'sapwell_tender', 1);
  unit(g, 0, 'sapwell_tender', 0);
  cycle(g);
  ok(g.players[0].energy === g.players[0].maxEnergy + 1, 'Sapwell Tender: +1 Energy, only from the one standing in terrain', [g.players[0].energy, g.players[0].maxEnergy]);
}
{
  const g = game();
  const a = unit(g, 0, 'sprout', 0), b = unit(g, 0, 'perimeter_sentry', 1), foe = unit(g, 1, 'sprout', 0);
  play(g, 0, 'verdant_surge');
  ok(stats(a) === plus('sprout', 1, 1) && stats(b) === plus('perimeter_sentry', 1, 1) && stats(foe) === plus('sprout', 0, 0), 'Verdant Surge: +1/+1 to every friendly unit', [stats(a), stats(b), stats(foe)]);
}
{
  const g = game('ironwake', 'rootbound');
  const foe = unit(g, 1, 'worldroot_titan', 2), foe2 = unit(g, 1, 'worldroot_titan', 4);
  g.players[0].armor = 4;
  play(g, 0, 'bulkhead_slam', { target: uref(foe) });
  ok(foe.hp === CARDS.worldroot_titan.hp - 4 && g.players[0].armor === 4, 'Bulkhead Slam: damage equal to Armor, and the Armor stays', foe.hp);
  g.players[0].armor = 20;
  play(g, 0, 'bulkhead_slam', { target: uref(foe2) });
  ok(foe2.hp === CARDS.worldroot_titan.hp - 6, 'Bulkhead Slam: capped at 6', foe2.hp);
  g.players[0].energy = 10;
  g.players[0].armor = 7;
  ok(stats(play(g, 0, 'ironclad_behemoth', { lane: 0 })) === plus('ironclad_behemoth', 2, 2), 'Ironclad Behemoth: +1/+1 per 3 Armor');
  g.players[0].armor = 30;
  ok(stats(play(g, 0, 'ironclad_behemoth', { lane: 1 })) === plus('ironclad_behemoth', 3, 3), 'Ironclad Behemoth: capped at +3/+3');
}
{
  const g = game('synod', 'ironwake');
  const face = { k: 'l', pid: 1 };
  let hp = g.players[1].hp;
  play(g, 0, 'critical_mass');
  ok(hp - g.players[1].hp === 2, 'Critical Mass: 2 damage as the first card of the turn', hp - g.players[1].hp);
  E.playCard(g, 0, give(g, 0, 'cell'), null, null);
  play(g, 0, 'survey_drone', { lane: 0 });
  hp = g.players[1].hp;
  play(g, 0, 'critical_mass');
  ok(hp - g.players[1].hp === 8, 'Critical Mass: +2 for each other card played this turn, Energy Cells included', hp - g.players[1].hp);
  cycle(g);
  hp = g.players[1].hp;
  play(g, 0, 'critical_mass');
  ok(hp - g.players[1].hp === 2, 'Critical Mass: the count starts again each turn', hp - g.players[1].hp);
}
{
  const g = game('tide', 'ironwake');
  const a = unit(g, 0, 'skyjack', 0), b = unit(g, 0, 'leech_diver', 1);
  const lead = play(g, 0, 'squadron_leader', { lane: 2 });
  ok(stats(a) === plus('skyjack', 1, 0) && stats(b) === plus('leech_diver', 0, 0) && stats(lead) === plus('squadron_leader', 0, 0),
    'Squadron Leader: +1/+0 to other Aerial units only', [stats(a), stats(b), stats(lead)]);
  g.players[0].hand = [];
  play(g, 0, 'smugglers_run');
  ok(hand(g, 0).join() === 'cell,cell', 'Smuggler\'s Run: two Energy Cells', hand(g, 0));
}
{
  const g = game('cinder', 'ironwake');
  unit(g, 0, 'pyre_keeper', 0);
  const victim = unit(g, 0, 'sprout', 1);
  g.players[0].deck = ['survey_drone', 'survey_drone', 'survey_drone'];
  const hp = g.players[1].hp;
  play(g, 0, 'rite_of_ash', { target: uref(victim) });
  ok(!g.players[0].board.includes(victim) && hand(g, 0).length === 2, 'Rite of Ash: destroys the friendly unit and draws 2', hand(g, 0));
  ok(hp - g.players[1].hp === 1, 'Pyre Keeper: 1 damage to the enemy colony when another friendly unit dies', hp - g.players[1].hp);
}
{
  const g = game('auric', 'ironwake');
  const adj = unit(g, 0, 'claims_adjuster', 0);
  E.gainArmor(g, 0, 2); E.gainArmor(g, 0, 2);
  ok(stats(adj) === plus('claims_adjuster', 1, 1), 'Claims Adjuster: +1/+1 the first time Armor is gained in a turn', stats(adj));
  cycle(g);
  E.gainArmor(g, 0, 1);
  ok(stats(adj) === plus('claims_adjuster', 2, 2), 'Claims Adjuster: again on a later turn', stats(adj));
}
{
  const g = game('auric', 'ironwake');
  for (let i = 0; i < 5; i++) give(g, 0, 'survey_drone');
  ok(stats(play(g, 0, 'holdings_magnate', { lane: 0 })) === plus('holdings_magnate', 2, 2), 'Holdings Magnate: +1/+1 per 2 other cards in hand');
  const uid = give(g, 0, 'consortium_titan');
  const hc = g.players[0].hand.find((h) => h.uid === uid);
  ok(E.cost(g, 0, hc) === CARDS.consortium_titan.cost - 5, 'Consortium Titan: costs 1 less for each other card in hand', E.cost(g, 0, hc));
  g.players[0].hand = [hc];
  ok(E.cost(g, 0, hc) === CARDS.consortium_titan.cost, 'Consortium Titan: full price alone in hand', E.cost(g, 0, hc));
}
{
  const g = game('redline', 'rootbound');
  site(g, 0, 'war_college', 0);
  const t = unit(g, 0, 'shock_trooper', 1), prey = unit(g, 1, 'sprout', 1);
  g.players[0].deck = ['survey_drone'];
  E.attack(g, 0, t.uid, uref(prey));
  ok(t.promoted && hand(g, 0).length === 1 && t.atk === CARDS.shock_trooper.atk + 2, 'War College: a promoted unit gains a further +1/+1 and its owner draws', [stats(t), hand(g, 0)]);
}
{
  const g = game('redline', 'rootbound');
  unit(g, 0, 'perimeter_sentry', 0); // Guard
  unit(g, 0, 'rover_scout', 1);      // Mobile
  unit(g, 0, 'aaa_sentry', 2);       // Interceptor
  unit(g, 0, 'aaa_sentry', 5);       // a second Interceptor adds nothing
  ok(stats(play(g, 0, 'task_force_commander', { lane: 4 })) === plus('task_force_commander', 3, 3), 'Task Force Commander: +1/+1 per different keyword among other units');
}
{
  const g = E.newGame('synod', 'ironwake', 1, 0, { preset0: 'cascade', preset1: 'fortress' });
  ok(g.players[0].pact === 'tide' && g.players[1].pact === null, 'a Pact preset brings its partner faction into the game', [g.players[0].pact, g.players[1].pact]);
  const g2 = E.newGame('synod', 'ironwake', 1, 0, { deck0: Array(30).fill('survey_drone') });
  ok(g2.players[0].pact === null, 'a custom deck does not inherit a preset\'s Pact');
}

/* ---------------------------------------------------------------- every card is well formed */
Object.values(CARDS).forEach((c) => {
  const where = c.id + ' (' + c.name + ')';
  ok(['unit', 'order', 'site'].includes(c.type), where + ' has a type');
  ok(Number.isInteger(c.cost) && c.cost >= 0, where + ' has a cost');
  if (c.type === 'unit') ok(Number.isInteger(c.atk) && Number.isInteger(c.hp) && c.hp > 0, where + ' has stats');
  if (c.type === 'site') ok(Number.isInteger(c.hp) && c.hp > 0 && typeof c.brief === 'string', where + ' has integrity and a brief');
  if (c.type === 'order') {
    ok(typeof c.play === 'function' || (Array.isArray(c.modes) && c.modes.length >= 2 && c.modes.every((m) => typeof m.play === 'function' && m.name && m.text)), where + ' has an effect');
  }
  ok(typeof c.text === 'string' && typeof c.flavor === 'string' && c.art, where + ' has text, flavour and art');
  Object.keys(c.kw || {}).forEach((k) => ok(!!globalThis.TauCeti.KEYWORDS[k], where + ' keyword ' + k + ' exists'));
  // keywords printed on the card match the keywords it has
  Object.keys(c.kw || {}).forEach((k) => {
    const name = globalThis.TauCeti.KEYWORDS[k].name;
    ok(new RegExp('<b>' + name).test(c.text), where + ' text mentions ' + name);
  });
});

/* ---------------------------------------------------------------- New Doctrines expansion */
{
  // Overrun: what is left after destroying a unit carries on into the colony
  const g = game();
  const t = unit(g, 0, 'thunderback', 2), foe = unit(g, 1, 'sprout', 2);
  ok(E.hasKw(g, t, 'overrun'), 'Thunderback has Overrun');
  E.attack(g, 0, t.uid, uref(foe));
  ok(!E.find(g, foe.uid) && g.players[1].hp === 30 - (CARDS.thunderback.atk - CARDS.sprout.hp), 'Overrun: damage beyond the unit hits the enemy colony', g.players[1].hp);
  // a Shield swallows the whole hit, and a unit that survives lets nothing through
  const g2 = game();
  const t2 = unit(g2, 0, 'thunderback', 2), wall = unit(g2, 1, 'bulwark_drone', 2);
  E.attack(g2, 0, t2.uid, uref(wall));
  ok(g2.players[1].hp === 30 && E.find(g2, wall.uid), 'Overrun: nothing carries past a Shield', g2.players[1].hp);
  const g3 = game();
  const t3 = unit(g3, 0, 'thunderback', 2), big = unit(g3, 1, 'worldroot_titan', 2);
  E.attack(g3, 0, t3.uid, uref(big));
  ok(g3.players[1].hp === 30, 'Overrun: nothing carries past a unit that survives');
  // a unit without Overrun never spills over
  const g4 = game();
  const s4 = unit(g4, 0, 'storm_skiff', 2), foe4 = unit(g4, 1, 'sprout', 2);
  E.attack(g4, 0, s4.uid, uref(foe4));
  ok(g4.players[1].hp === 30, 'no Overrun, no spill');
}
{
  const g = game();
  const u = unit(g, 0, 'perimeter_sentry', 2), foe = unit(g, 1, 'sprout', 2);
  play(g, 0, 'stampede_pheromone', { target: uref(u) });
  ok(stats(u) === plus('perimeter_sentry', 2, 2) && E.hasKw(g, u, 'overrun'), 'Stampede Pheromone: +2/+2 and Overrun', stats(u));
  E.attack(g, 0, u.uid, uref(foe));
  ok(g.players[1].hp === 30 - (CARDS.perimeter_sentry.atk + 2 - CARDS.sprout.hp), 'and the Overrun it grants works', g.players[1].hp);
}
{
  const g = game();
  const c = unit(g, 0, 'graft_champion', 2), other = unit(g, 0, 'perimeter_sentry', 1);
  play(g, 0, 'overgrowth', { target: uref(c) });
  ok(stats(c) === plus('graft_champion', 3, 3), 'Graftling Champion: an Order aimed at it gives +1/+1 on top', stats(c));
  E.usePower(g, 0, uref(c));
  ok(stats(c) === plus('graft_champion', 4, 5), 'Graftling Champion: only the first time each turn', stats(c));
  g.players[0].energy = 10;
  cycle(g);
  E.usePower(g, 0, uref(c));
  ok(stats(c) === plus('graft_champion', 6, 8), 'Graftling Champion: the leader power counts too, and it works again next turn', stats(c));
  const g5 = game();
  const c5 = unit(g5, 0, 'graft_champion', 2), other5 = unit(g5, 0, 'perimeter_sentry', 1);
  play(g5, 0, 'overgrowth', { target: uref(other5) });
  play(g5, 0, 'verdant_surge');
  ok(stats(c5) === plus('graft_champion', 1, 1), 'Graftling Champion: Orders aimed elsewhere, or at nothing, do not count', stats(c5));
  void other;
  // an enemy Order aimed at it does not count either
  const g2 = game('synod', 'rootbound');
  const c2 = unit(g2, 1, 'graft_champion', 2);
  play(g2, 0, 'data_spike', { target: uref(c2) });
  ok(c2.atk === CARDS.graft_champion.atk, 'Graftling Champion: an enemy Order is no boon', stats(c2));
}
{
  const g = game();
  g.players[0].deck = ['survey_drone'];
  const u = unit(g, 0, 'perimeter_sentry', 2);
  play(g, 0, 'ironbark_graft', { target: uref(u) });
  ok(u.kw.shield === true && hand(g, 0).join() === 'survey_drone', 'Ironbark Graft: Shielded, and draws a card', hand(g, 0));
}
{
  // the fallen are recorded, tokens aside
  const g = game('ironwake', 'rootbound');
  const p = g.players[0];
  const a = unit(g, 0, 'bulwark_drone', 0), b = unit(g, 0, 'dreadnought', 1), c = unit(g, 0, 'scrapbot', 2);
  [a, b, c].forEach((u) => E.destroy(g, uref(u)));
  E.endTurn(g, 0); E.endTurn(g, 1);
  ok(p.grave.slice().sort().join() === 'bulwark_drone,dreadnought' && p.lost === 2, 'destroyed units are recorded, tokens are not', [p.grave, p.lost]);
  const m = play(g, 0, 'wreck_marshal', { lane: 5 });
  ok(stats(m) === plus('wreck_marshal', 2, 2), 'Wreck Marshal: +1/+1 for each unit lost', stats(m));
  p.hand = [];
  play(g, 0, 'recovery_crawler', { lane: 4 });
  ok(hand(g, 0).join() === 'dreadnought' && p.grave.join() === 'bulwark_drone', 'Recovery Crawler: returns the costliest fallen unit to hand', [hand(g, 0), p.grave]);
  p.hand = [];
  p.lost = 9;
  p.energy = 10;
  ok(stats(play(g, 0, 'wreck_marshal', { lane: 6 })) === plus('wreck_marshal', 4, 4), 'Wreck Marshal: capped at +4/+4');
  // Reassembly Bay rebuilds a cheap fallen unit in its own lane when the lane is empty
  site(g, 0, 'reassembly_bay', 0);
  p.grave.push('dreadnought');
  E.endTurn(g, 0);
  const back = E.unitAt(g, 0, 0);
  ok(back && back.id === 'bulwark_drone' && p.grave.join() === 'dreadnought', 'Reassembly Bay: rebuilds a unit costing 3 or less, never a dear one', [back && back.id, p.grave]);
  E.endTurn(g, 1);
  p.grave.push('scrap_welder');
  E.endTurn(g, 0);
  ok(p.grave.includes('scrap_welder'), 'Reassembly Bay: does nothing while a unit is stationed there');
  // nothing to bring back
  const g2 = game('ironwake', 'rootbound');
  play(g2, 0, 'recovery_crawler', { lane: 4 });
  ok(hand(g2, 0).length === 0 && stats(play(g2, 0, 'wreck_marshal', { lane: 5 })) === plus('wreck_marshal', 0, 0), 'with no losses the Crawler finds nothing and the Marshal is plain');
}
{
  const g = game('synod', 'ironwake');
  play(g, 0, 'systems_engineer', { lane: 0 });
  ok(hand(g, 0).join() === 'design_workshop', 'Systems Engineer: adds a Design Workshop to hand', hand(g, 0));
  const g2 = game('synod', 'ironwake');
  site(g2, 0, 'skunkworks', 0);
  {
    const hc = E.designUnit(g2, 0, { chassis: 'inf', weapon: 'w2', armor: 'a3', abilities: [] });
    ok(E.cost(g2, 0, hc) === hc.cost - 1 && E.cost(g2, 1, hc) === hc.cost, 'Skunkworks: units I design cost 1 less', [E.cost(g2, 0, hc), hc.cost]);
    ok(E.cost(g2, 0, { id: 'survey_drone', cost: 1 }) === 1, 'Skunkworks: other cards cost what they cost');
    g2.players[0].hand = [];
  }
  cycle(g2);
  ok(hand(g2, 0).filter((id) => id === 'design_workshop').length === 1, 'Skunkworks: a Design Workshop at Cycle Start', hand(g2, 0));
  cycle(g2);
  ok(hand(g2, 0).filter((id) => id === 'design_workshop').length === 1, 'Skunkworks: not while one is already in hand', hand(g2, 0));
  // Proving Ground: a designed unit enters +1/+1, a premade one does not
  const g3 = game('synod', 'ironwake');
  site(g3, 0, 'proving_ground', 0);
  const choice = { chassis: 'inf', weapon: 'w2', armor: 'a3', abilities: [] };
  const hc = E.designUnit(g3, 0, choice);
  const def = CARDS[hc.id];
  E.playCard(g3, 0, hc.uid, null, 1);
  const made = E.unitAt(g3, 0, 1);
  ok(made && made.atk === def.atk + 1 && made.hp === def.hp + 1, 'Proving Ground: a unit you designed enters with +1/+1', made && stats(made));
  ok(stats(play(g3, 0, 'survey_drone', { lane: 2 })) === plus('survey_drone', 0, 0), 'Proving Ground: other units are unchanged');
}
{
  // returning to hand
  const g = game('tide', 'ironwake');
  const p = g.players[0];
  site(g, 0, 'hidden_cove', 0);
  const r = play(g, 0, 'reef_skirmisher', { lane: 2 });
  const foe = unit(g, 1, 'sprout', 2);
  ok(r.ready && E.attackTargets(g, r).length === 1, 'Reef Skirmisher: Blitz, so it can strike a unit at once');
  E.buff(g, foe, 4, 4);
  E.attack(g, 0, r.uid, uref(foe));
  ok(r.hp === CARDS.reef_skirmisher.hp && foe.hp === CARDS.sprout.hp + 4 - CARDS.reef_skirmisher.atk, 'Reef Skirmisher: takes no damage back when it attacks', [r.hp, foe.hp]);
  p.hand = [];
  g.silent = false; g.events.length = 0;
  E.endTurn(g, 0);
  ok(!E.find(g, r.uid) && hand(g, 0).includes('reef_skirmisher'), 'Reef Skirmisher: returns to hand at Cycle End', hand(g, 0));
  ok(hand(g, 0).includes('cell'), 'Hidden Cove: a unit returning to hand gives an Energy Cell', hand(g, 0));
  ok(p.grave.length === 0 && p.lost === 0 && g.events.some((e) => e.t === 'bounce' && e.id === 'reef_skirmisher') && !g.events.some((e) => e.t === 'death' && e.id === 'reef_skirmisher'), 'returning to hand is not being destroyed');
  ok(p.hand.find((h) => h.id === 'reef_skirmisher').cost === CARDS.reef_skirmisher.cost, 'it comes back at its printed cost');
}
{
  const g = game('tide', 'ironwake');
  const big = unit(g, 1, 'dreadnought', 2), tok = unit(g, 1, 'scrapbot', 3);
  E.buff(g, big, 3, 3);
  play(g, 0, 'undertow', { target: uref(big) });
  ok(!E.find(g, big.uid) && hand(g, 1).join() === 'dreadnought' && g.players[1].hand[0].cost === CARDS.dreadnought.cost, 'Undertow: the enemy unit goes back to its owner’s hand as a fresh card', hand(g, 1));
  play(g, 0, 'undertow', { target: uref(tok) });
  ok(!E.find(g, tok.uid) && hand(g, 1).join() === 'dreadnought' && g.players[1].grave.length === 0, 'Undertow: a token is removed from play', hand(g, 1));
  // a full hand: the unit is lost
  const g2 = game('tide', 'ironwake');
  const u2 = unit(g2, 1, 'dreadnought', 2);
  for (let i = 0; i < E.maxHand(g2, 1); i++) give(g2, 1, 'cell');
  play(g2, 0, 'undertow', { target: uref(u2) });
  ok(!E.find(g2, u2.uid) && g2.players[1].hand.length === E.maxHand(g2, 1), 'Undertow: with a full hand the unit is simply lost');
}
{
  const g = game();
  const u = unit(g, 0, 'storm_skiff', 2), tok = unit(g, 0, 'sprout', 3);
  E.buff(g, u, 2, 2);
  ok(E.cardTargets(g, 0, CARDS.evac_shuttle).length === 1, 'Evac Shuttle: cannot pick a token');
  play(g, 0, 'evac_shuttle', { target: uref(u) });
  const hc = g.players[0].hand[0];
  ok(!E.find(g, u.uid) && hc.id === 'storm_skiff' && hc.cost === CARDS.storm_skiff.cost - 1 && E.find(g, tok.uid), 'Evac Shuttle: returns a friendly unit to hand, 1 cheaper', [hc.id, hc.cost]);
  const again = E.playCard(g, 0, hc.uid, null, 2) && E.unitAt(g, 0, 2);
  ok(again && stats(again) === plus('storm_skiff', 0, 0), 'the returned unit is a fresh copy: its buffs are gone', again && stats(again));
}
{
  // surviving damage
  const g = game('cinder', 'ironwake');
  const f = unit(g, 0, 'ember_flagellant', 2), foe = unit(g, 1, 'sprout', 2);
  E.attack(g, 0, f.uid, uref(foe));
  ok(stats(f) === (CARDS.ember_flagellant.atk + 2) + '/' + (CARDS.ember_flagellant.hp - 1), 'Ember Flagellant: +2 Attack when it survives damage', stats(f));
  const p = unit(g, 0, 'scarred_penitent', 4);
  ok(E.effectiveAtk(g, p, null) === CARDS.scarred_penitent.atk, 'Scarred Penitent: plain when unhurt');
  E.damage(g, uref(p), 3, null);
  ok(E.effectiveAtk(g, p, null) === CARDS.scarred_penitent.atk + 3, 'Scarred Penitent: +1 Attack for each damage taken', E.effectiveAtk(g, p, null));
  E.heal(g, uref(p), 2);
  ok(E.effectiveAtk(g, p, null) === CARDS.scarred_penitent.atk + 1, 'Scarred Penitent: healing takes the Attack away again');
  const g2 = game('cinder', 'ironwake');
  const s = unit(g2, 0, 'cinder_scourge', 2);
  E.damage(g2, uref(s), 1, null);
  ok(g2.players[1].hp === 28, 'Cinder Scourge: surviving damage deals 2 to a random enemy (here the colony)', g2.players[1].hp);
  E.damage(g2, uref(s), 9, null);
  ok(g2.players[1].hp === 28, 'Cinder Scourge: nothing when the damage destroys it');
}
{
  const g = game('cinder', 'ironwake');
  const mine = unit(g, 0, 'perimeter_sentry', 1), weak = unit(g, 0, 'pilgrim', 2), fl = unit(g, 0, 'ember_flagellant', 4);
  const foe = unit(g, 1, 'perimeter_sentry', 1), foeWeak = unit(g, 1, 'sprout', 2);
  play(g, 0, 'trial_by_fire');
  ok(!E.find(g, weak.uid) && !E.find(g, foeWeak.uid), 'Trial by Fire: 1 damage to every unit, on both sides');
  ok(stats(mine) === (CARDS.perimeter_sentry.atk + 1) + '/' + CARDS.perimeter_sentry.hp && stats(foe) === CARDS.perimeter_sentry.atk + '/' + (CARDS.perimeter_sentry.hp - 1), 'Trial by Fire: my survivors then gain +1/+1, the enemy’s do not', [stats(mine), stats(foe)]);
  ok(fl.atk === CARDS.ember_flagellant.atk + 3, 'Trial by Fire: and it counts as damage survived', stats(fl));
}
{
  // Jam and tax
  const g = game('auric', 'ironwake');
  const agent = unit(g, 0, 'repo_agent', 0);
  const foe = unit(g, 1, 'siege_walker', 2), foe2 = unit(g, 1, 'perimeter_sentry', 4);
  ok(!E.canPlay(g, 0, { id: 'liquidator', cost: 5 }) || !E.needsTarget(g, 0, { id: 'liquidator', cost: 5 }), 'Liquidator: no target while nothing is Jammed');
  play(g, 0, 'hostile_audit', { target: uref(foe2) });
  ok(foe2.jammed > 0 && foe2.hp === CARDS.perimeter_sentry.hp - 2, 'Hostile Audit: Jams and deals 2 damage', [foe2.jammed, foe2.hp]);
  ok(hand(g, 0).join() === 'cell', 'Repo Agent: an enemy Jammed gives an Energy Cell', hand(g, 0));
  play(g, 0, 'bribe', { target: uref(foe) });
  ok(hand(g, 0).filter((id) => id === 'cell').length === 1, 'Repo Agent: only the first Jam each turn', hand(g, 0));
  ok(E.cardTargets(g, 0, CARDS.liquidator).length === 2, 'Liquidator: may pick any Jammed enemy unit');
  play(g, 0, 'liquidator', { lane: 5, target: uref(foe) });
  ok(!E.find(g, foe.uid), 'Liquidator: destroys the Jammed unit, Shield or not');
  void agent;
}
{
  const g = game('auric', 'ironwake');
  site(g, 0, 'trade_embargo', 0);
  E.endTurn(g, 0);
  const p = g.players[1];
  p.energy = 10;
  const a = give(g, 1, 'scrap_welder'), b = give(g, 1, 'scrap_welder'), c = give(g, 1, 'cell');
  const cost = (uid) => E.cost(g, 1, p.hand.find((h) => h.uid === uid));
  ok(cost(a) === CARDS.scrap_welder.cost + 1 && cost(c) === 0, 'Trade Embargo: the enemy’s first card costs 1 more, an Energy Cell does not', [cost(a), cost(c)]);
  E.playCard(g, 1, c, null, null);
  ok(cost(a) === CARDS.scrap_welder.cost + 1, 'Trade Embargo: playing a Cell first does not dodge it', cost(a));
  const before = p.energy;
  E.playCard(g, 1, a, null, 0);
  ok(p.energy === before - CARDS.scrap_welder.cost - 1 && cost(b) === CARDS.scrap_welder.cost, 'Trade Embargo: paid once, then the next card is at its own cost', [p.energy, cost(b)]);
  E.endTurn(g, 1); E.endTurn(g, 0);
  ok(cost(b) === CARDS.scrap_welder.cost + 1, 'Trade Embargo: and again next turn');
  ok(E.cost(g, 0, { id: 'scrap_welder', cost: 1 }) === 1, 'Trade Embargo: its owner pays nothing extra');
}
{
  // Supply Pods
  const g = game('redline', 'ironwake');
  const off = unit(g, 0, 'logistics_officer', 0);
  g.players[0].hand = [];
  play(g, 0, 'airdrop_beacon', { lane: 5 });
  ok(g.lanes[5].pod === true && stats(off) === plus('logistics_officer', 0, 0), 'Airdrop Beacon: drops a Supply Pod as soon as it is built, and with nobody stationed the Pod waits');
  play(g, 0, 'bunker', { lane: 6 });
  ok(!g.lanes[6].pod, 'Airdrop Beacon: building some other location drops nothing');
  cycle(g);
  ok(g.lanes[5].pod === true, 'Airdrop Beacon: one Pod at a time');
  const u = play(g, 0, 'perimeter_sentry', { lane: 5 });
  ok(g.lanes[5].pod === false && stats(off) === plus('logistics_officer', 1, 1), 'Logistics Officer: +1/+1 when I claim a Supply Pod', stats(off));
  cycle(g);
  ok(g.lanes[5].pod === false && stats(off) === plus('logistics_officer', 2, 2), 'Airdrop Beacon: the unit stationed there claims a new one each cycle', stats(off));
  void u;
  const g2 = game('redline', 'ironwake');
  g2.lanes[3].pod = true;
  play(g2, 0, 'supply_convoy', { lane: 2 });
  ok(g2.lanes[1].pod && g2.lanes[3].pod, 'Supply Convoy: a Supply Pod in each neighbouring lane');
  const g3 = game('redline', 'ironwake');
  play(g3, 0, 'supply_convoy', { lane: 0 });
  ok(g3.lanes[1].pod && !g3.lanes[0].pod, 'Supply Convoy: at the edge of the map, one lane only');
  // an enemy claiming a pod is no business of the officer
  const g4 = game('redline', 'ironwake');
  const off4 = unit(g4, 0, 'logistics_officer', 0);
  g4.lanes[6].pod = true;
  E.endTurn(g4, 0);
  play(g4, 1, 'perimeter_sentry', { lane: 6 });
  ok(stats(off4) === plus('logistics_officer', 0, 0), 'Logistics Officer: an enemy claim does nothing');
}
{
  // the seven presets that came with these cards
  ['colossus', 'reclaim', 'prototype', 'hitrun', 'trial', 'tradewar', 'supply'].forEach((k) => {
    const F = globalThis.TauCeti.FACTIONS;
    const f = Object.keys(F).find((x) => F[x].presets[k]);
    ok(!!f, 'preset exists: ' + k);
  });
}

/* ---------------------------------------------------------------- Planetary Telemetry & Counterplay expansion */
{
  // Forecast: look at top N, put 1 on top (or draw), rest on bottom
  const g = game('rootbound', 'ironwake');
  g.players[0].deck = ['survey_drone', 'bunker', 'storm_skiff', 'worldroot_titan'];
  // top 3 are worldroot_titan (top), storm_skiff, bunker
  g.humanPid = 0;
  g.silent = false;
  play(g, 0, 'telemetry_drone', { lane: 0 });
  ok(!!g.forecast && g.forecast.options.join() === 'worldroot_titan,storm_skiff,bunker', 'Telemetry Drone: pauses human for Forecast 3', g.forecast && g.forecast.options);
  ok(!E.endTurn(g, 0), 'cannot end turn while Forecast is pending');
  E.resolveForecast(g, 0, 1); // pick storm_skiff
  ok(g.forecast === null, 'Forecast cleared after resolve');
  ok(g.players[0].deck[g.players[0].deck.length - 1] === 'storm_skiff', 'Forecast puts chosen card on top of deck', g.players[0].deck);
  ok(g.players[0].deck[0] === 'worldroot_titan' && g.players[0].deck[1] === 'bunker', 'Forecast bottoms the unchosen cards', g.players[0].deck);

  // Market Forecast: Overcharge draws the chosen card
  const g2 = game('auric', 'ironwake');
  g2.players[0].deck = ['survey_drone', 'bunker', 'storm_skiff', 'worldroot_titan'];
  g2.players[0].energy = 2; // 1 base + 1 Overcharge
  g2.humanPid = 0;
  g2.silent = false;
  play(g2, 0, 'market_forecast');
  ok(g2.forecast && g2.forecast.draw === true, 'Market Forecast (Overcharged): sets draw=true');
  E.resolveForecast(g2, 0, 2); // pick bunker
  ok(hand(g2, 0).includes('bunker'), 'Market Forecast (Overcharged): draws the picked card into hand', hand(g2, 0));

  // Prescient Empath: +1/+1 when Forecast picks a Native unit
  const g3 = game('rootbound', 'ironwake');
  g3.players[0].deck = ['bunker', 'survey_drone', 'seedcaster'];
  g3.humanPid = 0;
  g3.silent = false;
  const emp = play(g3, 0, 'prescient_empath', { lane: 1 });
  E.resolveForecast(g3, 0, 0); // pick seedcaster (native)
  ok(stats(emp) === plus('prescient_empath', 1, 1), 'Prescient Empath: +1/+1 when Forecast picks a Native unit', stats(emp));
}
{
  // Archive 1: tradeable Secret Projects & Planet Buster / Liquidator
  const g = game('auric', 'ironwake');
  g.players[0].deck = ['survey_drone', 'bunker'];
  const uid = give(g, 0, 'meridian_exchange');
  ok(E.canArchive(g, 0, g.players[0].hand[0]), 'Secret Project is Archivable');
  const eBefore = g.players[0].energy;
  ok(E.archiveCard(g, 0, uid), 'Archive succeeds');
  ok(g.players[0].energy === eBefore - 1, 'Archive spends 1 Energy');
  ok(hand(g, 0).includes('bunker') && !hand(g, 0).includes('meridian_exchange'), 'Archive draws replacement first', hand(g, 0));
  ok(g.players[0].deck.includes('meridian_exchange'), 'Archive shuffles original back into deck', g.players[0].deck);
  const pb = give(g, 0, 'planet_buster');
  ok(E.canArchive(g, 0, g.players[0].hand.find((h) => h.uid === pb)), 'Planet Buster is Archivable');
}
{
  // Modal Orders + Purge + Multi-hit Shield breaking
  const g = game('auric', 'ironwake');
  const wall = unit(g, 1, 'bulwark_drone', 2); // 2/3 Guard Shielded
  const uid = give(g, 0, 'breach_protocol');
  ok(!E.playCard(g, 0, uid, uref(wall), null, 99), 'Modal Order rejects invalid mode');
  ok(E.playCard(g, 0, uid, uref(wall), null, 0), 'Breach Protocol mode 0 (Triple Pulse) hits 3 times');
  ok(wall.kw.shield === false && wall.hp === 1, 'Triple Pulse pops Shield on hit 1 and deals 2 damage on hits 2-3', [wall.kw.shield, wall.hp]);
  const uid2 = give(g, 0, 'breach_protocol');
  ok(E.playCard(g, 0, uid2, null, null, 1), 'Breach Protocol mode 1 adds 2 Energy Cells');
  ok(hand(g, 0).filter((x) => x === 'cell').length === 2, 'Breach Protocol mode 1 gave 2 Cells', hand(g, 0));

  // Salvage Impound: Psi damage + Purge skips Last Stand, onAllyDeath, and grave
  const g2 = game('auric', 'rootbound');
  site(g2, 1, 'chrysalis_vats', 0);
  const pod = unit(g2, 1, 'podling_carrier', 2); // 2/3 Last Stand: 2 sprouts
  pod.hp = 2;
  play(g2, 0, 'salvage_impound', { lane: 2, target: uref(pod) });
  ok(!E.find(g2, pod.uid), 'Salvage Impound destroys damaged unit');
  ok(g2.players[1].board.length === 0 && g2.players[1].grave.length === 0, 'Purge suppresses Last Stand, Chrysalis Vats, and grave', [g2.players[1].board.length, g2.players[1].grave]);

  // Containment Purge: mode 0 Jams + purges costliest from grave; mode 1 deals 2 + draws on kill
  const g3 = game('synod', 'ironwake');
  g3.players[1].grave = ['scrap_welder', 'dreadnought', 'bulwark_drone'];
  const s = unit(g3, 1, 'siege_walker', 2);
  const cp1 = give(g3, 0, 'containment_purge');
  ok(E.playCard(g3, 0, cp1, uref(s), null, 0), 'Containment Purge mode 0 plays');
  ok(s.jammed > 0 && !g3.players[1].grave.includes('dreadnought') && g3.players[1].grave.length === 2, 'Containment Purge mode 0 Jams and purges costliest unit from grave', g3.players[1].grave);
  const sp = unit(g3, 1, 'sprout', 4);
  g3.players[0].hand = [];
  const cp2 = give(g3, 0, 'containment_purge');
  ok(E.playCard(g3, 0, cp2, uref(sp), null, 1), 'Containment Purge mode 1 plays');
  ok(!E.find(g3, sp.uid) && hand(g3, 0).length === 1, 'Containment Purge mode 1 kills and draws', hand(g3, 0));
}
{
  // Terraforming, Pull, and 7-lane geometry cards
  const g = game('rootbound', 'ironwake');
  g.lanes[0].terrain = 'monolith';
  g.lanes[4].terrain = 'fungus';
  play(g, 0, 'tectonic_shaper', { lane: 4, target: { k: 'c', lane: 0 } });
  ok(g.lanes[4].terrain === 'monolith' && g.lanes[0].terrain === 'fungus' && hand(g, 0).length === 1, 'Tectonic Shaper swaps terrain and draws', [g.lanes[0].terrain, g.lanes[4].terrain]);

  const g2 = game('ironwake', 'rootbound');
  g2.lanes[1].terrain = 'fungus';
  play(g2, 0, 'bio_scrubber', { lane: 1 });
  ok(g2.lanes[1].terrain === null && g2.players[0].armor === 3 && hand(g2, 0).length === 1, 'Bio-Scrubber Rig clears terrain, +3 Armor, draws');

  const g3 = game('ironwake', 'rootbound');
  g3.lanes[2].terrain = 'borehole';
  const foe = unit(g3, 1, 'worldroot_titan', 1);
  play(g3, 0, 'grav_pull_winch', { target: uref(foe) });
  ok(foe.lane === 2 && foe.hp === CARDS.worldroot_titan.hp - 3, 'Grav-Pull Winch pulls toward centre and deals +1 on terrain', [foe.lane, foe.hp]);

  const g4 = game('redline', 'ironwake');
  g4.lanes[0].terrain = 'ridge'; g4.lanes[2].terrain = 'fungus'; g4.lanes[5].terrain = 'monolith';
  const surv = play(g4, 0, 'frontier_surveyor', { lane: 1 });
  ok(stats(surv) === plus('frontier_surveyor', 2, 2), 'Frontier Surveyor gains +1/+1 per distinct terrain type (up to +2/+2)', stats(surv));

  const g5 = game('rootbound', 'ironwake');
  g5.lanes[2].terrain = 'fungus';
  const u5 = unit(g5, 0, 'seedcaster', 2);
  play(g5, 0, 'condenser_array', { lane: 2 });
  ok(stats(u5) === plus('seedcaster', 1, 1), 'Condenser Array buffs stationed unit immediately on terrain', stats(u5));
}
{
  // Field Refit (-2 cost on designed unit) & Salvage Blueprint (0-cost Workshop on Last Stand)
  const g = game('synod', 'ironwake');
  g.players[0].research = 4;
  const choice = { chassis: 'inf', weapon: 'w3', armor: 'a3', abilities: [] }; // 3 Energy normally
  const fr = give(g, 0, 'field_refit');
  ok(E.playCard(g, 0, fr, null, null, choice), 'Field Refit builds a designed unit');
  const designed = g.players[0].hand[0];
  ok(designed && designed.cost === 1, 'Field Refit discounts designed unit by 2 Energy', designed && designed.cost);

  const g2 = game('ironwake', 'rootbound');
  const bp = unit(g2, 0, 'salvage_blueprint', 2);
  play(g2, 0, 'demolition_charge', { target: uref(bp) });
  ok(g2.players[0].hand.some((h) => h.id === 'design_workshop' && h.cost === 0), 'Salvage Blueprint adds 0-cost Design Workshop on Last Stand', g2.players[0].hand);
}
{
  // A Forecast that waits for a person: nothing that happens while it is open may change which cards they own.
  const owned = (g, pid) => {
    const p = g.players[pid];
    return p.deck.concat(p.hand.map((h) => h.id), g.forecast && g.forecast.pid === pid ? g.forecast.options : []).sort().join();
  };
  const g = game('synod', 'ironwake');
  const p = g.players[0];
  g.humanPid = 0;
  p.deck = ['bunker', 'survey_drone', 'acolyte', 'probe_tech', 'data_spike']; // the top of the deck is the last entry
  p.research = E.milestones(g, 0)[0] - 1;
  const uid = give(g, 0, 'seismic_ping');
  const before = owned(g, 0).replace('seismic_ping,', '');
  // the Order's own Research reaches the first Breakthrough, which draws a card, while the Forecast is still open
  ok(E.playCard(g, 0, uid, { k: 'l', pid: 1 }, null) && !!g.forecast, 'Forecast: a person\'s Seismic Ping waits for the pick');
  ok(g.forecast.options.join() === 'data_spike,probe_tech,acolyte' && p.deck.join() === 'bunker,survey_drone', 'Forecast: the cards being looked at are held out of the deck', [g.forecast.options, p.deck]);
  ok(p.hand.length === 0 && g.forecast.owed === 1, 'Forecast: a draw that falls due while it is open waits for the pick', [hand(g, 0), g.forecast.owed]);
  E.resolveForecast(g, 0, 1); // pick probe_tech
  ok(hand(g, 0).join() === 'probe_tech', 'Forecast: the waiting draw then takes the pick, as it does for the AI', hand(g, 0));
  ok(p.deck.join() === 'data_spike,acolyte,bunker,survey_drone', 'Forecast: the other cards went to the bottom', p.deck);
  ok(owned(g, 0) === before, 'Forecast: no card was copied or lost', [before, owned(g, 0)]);

  // the same play by the AI's seat ends the same way
  const ga = game('synod', 'ironwake');
  ga.players[0].deck = ['bunker', 'survey_drone', 'acolyte', 'probe_tech', 'data_spike'];
  ga.players[0].research = E.milestones(ga, 0)[0] - 1;
  E.playCard(ga, 0, give(ga, 0, 'seismic_ping'), { k: 'l', pid: 1 }, null);
  ok(ga.forecast === null && ga.players[0].hand.length === 1 && ga.players[0].deck.length === 4, 'Forecast: the AI seat picks at once and draws its pick', [hand(ga, 0), ga.players[0].deck]);

  // two Forecasts at once: the second waits its turn and shows the deck as the first left it
  const g2 = game('synod', 'ironwake');
  const p2 = g2.players[0];
  g2.humanPid = 0;
  p2.deck = ['bunker', 'survey_drone', 'acolyte', 'probe_tech', 'data_spike'];
  const before2 = owned(g2, 0);
  E.forecast(g2, 0, 2);
  E.forecast(g2, 0, 2);
  ok(g2.forecast.options.join() === 'data_spike,probe_tech' && g2.forecast.queue.length === 1, 'Forecast: a second one queues behind the first', [g2.forecast.options, g2.forecast.queue.length]);
  E.resolveForecast(g2, 0, 1); // probe_tech on top, data_spike to the bottom
  ok(!!g2.forecast && g2.forecast.options.join() === 'probe_tech,acolyte' && g2.forecast.queue.length === 0, 'Forecast: the queued one opens next, on the deck as it now stands', g2.forecast && g2.forecast.options);
  E.resolveForecast(g2, 0, 0);
  ok(g2.forecast === null && p2.deck.join() === 'acolyte,data_spike,bunker,survey_drone,probe_tech' && owned(g2, 0) === before2, 'Forecast: both resolve and every card is still there', p2.deck);
  ok(E.endTurn(g2, 0), 'Forecast: the turn can end once none is open');

  // the AI's pick knows about Prescient Empath's bonus for a Native unit
  const g3 = game('rootbound', 'ironwake');
  g3.players[0].deck = ['bunker', 'seedcaster', 'survey_drone'];
  const emp = play(g3, 0, 'prescient_empath', { lane: 1 });
  ok(stats(emp) === plus('prescient_empath', 1, 1) && g3.players[0].deck[2] === 'seedcaster', 'Prescient Empath: the AI picks the Native unit for the +1/+1', [stats(emp), g3.players[0].deck]);
}
{
  // Pull only ever moves a unit toward the centre lane
  const g = game('ironwake', 'rootbound');
  const mid = unit(g, 1, 'worldroot_titan', E.CENTER);
  ok(!E.pullUnit(g, mid) && mid.lane === E.CENTER, 'Pull: a unit in the centre lane stays there', mid.lane);
  const out = unit(g, 1, 'seedcaster', 1);
  unit(g, 1, 'creeping_vine', 2);
  ok(!E.pullUnit(g, out) && out.lane === 1, 'Pull: a unit whose inward lane is taken stays where it is', out.lane);
  const right = unit(g, 1, 'seedcaster', 6);
  ok(E.pullUnit(g, right) && right.lane === 5, 'Pull: a unit on the right flank moves left, toward the centre', right.lane);
  g.lanes[E.CENTER].terrain = 'borehole';
  play(g, 0, 'grav_pull_winch', { target: uref(mid) });
  ok(mid.lane === E.CENTER && mid.hp === CARDS.worldroot_titan.hp - 2, 'Grav-Pull Winch: no pull, so no extra damage, on a unit already in the centre', [mid.lane, mid.hp]);
}

console.log(failed ? `${failed} FAILED, ${passed} passed` : `all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
