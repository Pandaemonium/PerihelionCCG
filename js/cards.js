/* VEYRA — card and faction definitions.
 * Effects are plain functions (g, ctx) that call into Veyra.Engine at run time.
 *   unit triggers:     ctx = { pid, self (the unit), target }
 *   location triggers: ctx = { pid, self (the location), unit (unit stationed in its lane, or null) }
 *   orders / powers:   ctx = { pid, target }
 * Targets are refs: {k:'u',uid} unit, {k:'s',uid} location, {k:'l',pid} colony, {k:'c',lane} lane.
 */
(function (root) {
  'use strict';
  const V = (root.Veyra = root.Veyra || {});
  const E = () => V.Engine;

  const unitRef = (u) => ({ k: 'u', uid: u.uid });
  const leaderRef = (pid) => ({ k: 'l', pid });
  const near = (a, b, r) => Math.abs(a - b) <= (r == null ? 1 : r);

  const CARDS = {};
  function def(id, c) {
    c.id = id;
    c.faction = c.faction || 'neutral';
    CARDS[id] = c;
  }

  /* ------------------------------------------------------------ tokens */
  def('sprout', {
    name: 'Sprout', type: 'unit', cost: 1, atk: 1, hp: 1, art: '🌱', token: true, faction: 'rootbound',
    text: '',
  });
  def('scrapbot', {
    name: 'Scrap Bot', type: 'unit', cost: 1, atk: 2, hp: 1, art: '🤖', token: true, faction: 'ironwake',
    text: '',
  });
  def('barricade', {
    name: 'Barricade', type: 'unit', cost: 1, atk: 0, hp: 3, art: '🚧', token: true, faction: 'ironwake',
    immobile: true, kw: { guard: true },
    text: '<b>Guard.</b> Cannot move or attack.',
  });
  def('cell', {
    name: 'Reserve Cell', type: 'order', cost: 0, art: '🔋', token: true, noResearch: true,
    text: 'Gain 1 Energy this turn.',
    play(g, ctx) { E().gainEnergy(g, ctx.pid, 1); },
  });
  def('landing', {
    name: 'Landing Site', type: 'site', cost: 0, hp: 5, art: '🚀', token: true,
    needsStaff: true, aiValue: 2, aiStaffed: 2,
    brief: '+1 Research if staffed',
    text: '<b>Cycle Start:</b> If a unit is stationed here, gain 1 Research.',
    flavor: 'Where the first pod came down. Everything began here.',
    turnStart(g, ctx) { if (ctx.unit) E().gainResearch(g, ctx.pid, 1); },
  });

  /* ------------------------------------------------------------ neutral: Colonists */
  def('survey_drone', {
    name: 'Survey Drone', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🛰️',
    text: '<b>Deploy:</b> Gain 1 Research.',
    deploy(g, ctx) { E().gainResearch(g, ctx.pid, 1); },
  });
  def('perimeter_sentry', {
    name: 'Perimeter Sentry', type: 'unit', cost: 2, atk: 1, hp: 4, art: '🛡️', kw: { guard: true },
    text: '<b>Guard.</b>',
  });
  def('rover_scout', {
    name: 'Rover Scout', type: 'unit', cost: 2, atk: 2, hp: 2, art: '🚙', kw: { mobile: true },
    text: '<b>Mobile.</b>',
  });
  def('field_medic', {
    name: 'Field Medic', type: 'unit', cost: 3, atk: 2, hp: 3, art: '⛑️', target: 'ally',
    text: '<b>Deploy:</b> Restore 4 health to a friendly unit, location or your colony.',
    deploy(g, ctx) { if (ctx.target) E().heal(g, ctx.target, 4); },
  });
  def('debris_rain', {
    name: 'Debris Rain', type: 'order', cost: 3, art: '☄️', target: 'column',
    text: 'Choose a lane. Deal 2 damage to every unit in it and in both neighbouring lanes.',
    play(g, ctx) {
      E().allUnits(g).filter((u) => near(u.lane, ctx.target.lane)).forEach((u) => E().damage(g, unitRef(u), 2, null));
    },
  });
  def('storm_skiff', {
    name: 'Storm Skiff', type: 'unit', cost: 5, atk: 4, hp: 4, art: '🛩️', kw: { aerial: true },
    text: '<b>Aerial.</b>',
  });
  def('bunker', {
    name: 'Bunker', type: 'site', cost: 2, hp: 4, art: '🧱', needsStaff: true, aiValue: 1.5, aiStaffed: 1.5,
    grant: { guard: true },
    brief: 'Unit here: Guard, +0/+1',
    text: 'The unit stationed here has <b>Guard</b>. <b>Cycle End:</b> It gains +0/+1.',
    turnEnd(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 0, 1); },
  });
  def('hab_dome', {
    name: 'Hab Dome', type: 'site', cost: 3, hp: 4, art: '🏘️', needsStaff: true, aiValue: 2, aiStaffed: 1,
    brief: 'Heals colony and unit',
    text: '<b>Cycle End:</b> Restore 1 health to your colony, and 2 to the unit stationed here.',
    turnEnd(g, ctx) {
      E().heal(g, leaderRef(ctx.pid), 1);
      if (ctx.unit) E().heal(g, unitRef(ctx.unit), 2);
    },
  });

  /* ------------------------------------------------------------ Rootbound */
  def('seedcaster', {
    name: 'Seedcaster', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🌾', faction: 'rootbound',
    text: '<b>Deploy:</b> Summon a 1/1 Sprout in the nearest empty lane.',
    deploy(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('creeping_vine', {
    name: 'Creeping Vine', type: 'unit', cost: 2, atk: 1, hp: 1, art: '🌿', faction: 'rootbound', aiValue: 2,
    text: '<b>Cycle End:</b> Gain +1/+1.',
    turnEnd(g, ctx) { E().buff(g, ctx.self, 1, 1); },
  });
  def('overgrowth', {
    name: 'Overgrowth', type: 'order', cost: 2, art: '🍃', faction: 'rootbound', target: 'allyUnit',
    text: 'Give a friendly unit +2/+2.',
    play(g, ctx) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 2, 2); },
  });
  def('spawning_grove', {
    name: 'Spawning Grove', type: 'site', cost: 2, hp: 4, art: '🍄', faction: 'rootbound', needsEmpty: true, aiValue: 4,
    brief: 'Sprout if lane is empty',
    text: '<b>Cycle End:</b> If no unit is stationed here, grow a 1/1 Sprout in this lane.',
    turnEnd(g, ctx) { if (!E().unitAt(g, ctx.pid, ctx.self.lane)) E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('podling_carrier', {
    name: 'Podling Carrier', type: 'unit', cost: 3, atk: 2, hp: 2, art: '🐛', faction: 'rootbound', aiValue: 1.5,
    text: '<b>Last Stand:</b> Summon two 1/1 Sprouts where it fell.',
    lastStand(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('symbiote_swarm', {
    name: 'Symbiote Swarm', type: 'order', cost: 3, art: '🦠', faction: 'rootbound', target: 'column',
    text: 'Choose a lane. Summon three 1/1 Sprouts in the nearest empty lanes.',
    play(g, ctx) { for (let i = 0; i < 3; i++) E().summon(g, ctx.pid, 'sprout', ctx.target.lane); },
  });
  def('heartwood_bower', {
    name: 'Heartwood Bower', type: 'site', cost: 3, hp: 5, art: '🌴', faction: 'rootbound', needsStaff: true, aiValue: 2, aiStaffed: 3,
    brief: 'Unit here grows +1/+1',
    text: '<b>Cycle End:</b> The unit stationed here gains +1/+1.',
    turnEnd(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 1, 1); },
  });
  def('bloomcaller', {
    name: 'Bloomcaller', type: 'unit', cost: 4, atk: 3, hp: 4, art: '🌺', faction: 'rootbound',
    text: '<b>Deploy:</b> Give friendly units in the neighbouring lanes +1/+1.',
    deploy(g, ctx) {
      g.players[ctx.pid].board.forEach((u) => {
        if (u.uid !== ctx.self.uid && near(u.lane, ctx.self.lane)) E().buff(g, u, 1, 1);
      });
    },
  });
  def('brood_matron', {
    name: 'Brood Matron', type: 'unit', cost: 5, atk: 4, hp: 5, art: '🕷️', faction: 'rootbound', aiValue: 2.5,
    text: '<b>Cycle End:</b> Summon a 1/1 Sprout in the nearest empty lane.',
    turnEnd(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('canopy_beast', {
    name: 'Elder Canopy Beast', type: 'unit', cost: 5, atk: 4, hp: 4, art: '🦣', faction: 'rootbound',
    text: '<b>Deploy:</b> Gain +1/+1 for each other friendly unit.',
    deploy(g, ctx) {
      const n = g.players[ctx.pid].board.length - 1;
      if (n > 0) E().buff(g, ctx.self, n, n);
    },
  });
  def('worldroot_titan', {
    name: 'Worldroot Titan', type: 'unit', cost: 8, atk: 7, hp: 7, art: '🌲', faction: 'rootbound', kw: { guard: true },
    text: '<b>Guard.</b> <b>Deploy:</b> Restore 6 health to your colony.',
    flavor: 'The forest does not forgive. It simply outlasts.',
    deploy(g, ctx) { E().heal(g, leaderRef(ctx.pid), 6); },
  });

  /* ------------------------------------------------------------ Ironwake Compact */
  def('scrap_welder', {
    name: 'Scrap Welder', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🔧', faction: 'ironwake', target: 'allyUnit',
    text: '<b>Deploy:</b> Give another friendly unit +0/+2.',
    deploy(g, ctx) { if (ctx.target) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 0, 2); } },
  });
  def('bulwark_drone', {
    name: 'Bulwark Drone', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🔰', faction: 'ironwake', kw: { guard: true, shield: true },
    text: '<b>Guard.</b> <b>Shielded.</b>',
  });
  def('turret_nest', {
    name: 'Turret Nest', type: 'site', cost: 2, hp: 4, art: '🔫', faction: 'ironwake', aiValue: 3.5,
    brief: 'Shoots the lane opposite',
    text: '<b>Cycle End:</b> Deal 2 damage to the enemy unit in the opposite lane. If there is none, deal 1 damage to the enemy colony.',
    turnEnd(g, ctx) {
      const foe = E().unitAt(g, 1 - ctx.pid, ctx.self.lane);
      if (foe && foe.hp > 0) E().damage(g, unitRef(foe), 2, null);
      else E().damage(g, leaderRef(1 - ctx.pid), 1, null);
    },
  });
  def('riot_plating', {
    name: 'Riot Plating', type: 'order', cost: 2, art: '🦺', faction: 'ironwake', target: 'allyUnit',
    text: 'Give a friendly unit +1/+3 and <b>Guard</b>.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (f) { E().buff(g, f.unit, 1, 3); f.unit.kw.guard = true; }
    },
  });
  def('reactor_core', {
    name: 'Reactor Core', type: 'site', cost: 3, hp: 5, art: '⚛️', faction: 'ironwake', aiValue: 5,
    brief: '+1 Energy each turn',
    text: '<b>Cycle Start:</b> Gain 1 extra Energy this turn.',
    turnStart(g, ctx) { E().gainEnergy(g, ctx.pid, 1); },
  });
  def('salvage_hauler', {
    name: 'Salvage Hauler', type: 'unit', cost: 3, atk: 3, hp: 4, art: '🚜', faction: 'ironwake',
    text: '<b>Deploy:</b> Your colony gains 3 Armor.',
    deploy(g, ctx) { E().gainArmor(g, ctx.pid, 3); },
  });
  def('mortar_team', {
    name: 'Mortar Team', type: 'unit', cost: 3, atk: 2, hp: 4, art: '🎯', faction: 'ironwake', kw: { artillery: true },
    text: '<b>Artillery.</b>',
  });
  def('demolition_charge', {
    name: 'Demolition Charge', type: 'order', cost: 3, art: '🧨', faction: 'ironwake', target: 'unitOrSite',
    text: 'Deal 5 damage to a unit or location.',
    play(g, ctx) { E().damage(g, ctx.target, 5, null); },
  });
  def('foundry', {
    name: 'Foundry', type: 'site', cost: 4, hp: 5, art: '🏭', faction: 'ironwake', needsEmpty: true, aiValue: 5.5,
    brief: 'Scrap Bot if lane is empty',
    text: '<b>Cycle End:</b> If no unit is stationed here, build a 2/1 Scrap Bot in this lane.',
    turnEnd(g, ctx) { if (!E().unitAt(g, ctx.pid, ctx.self.lane)) E().summon(g, ctx.pid, 'scrapbot', ctx.self.lane); },
  });
  def('siege_walker', {
    name: 'Siege Walker', type: 'unit', cost: 5, atk: 5, hp: 5, art: '🦿', faction: 'ironwake', kw: { shield: true },
    text: '<b>Shielded.</b>',
  });
  def('dreadnought', {
    name: 'Dreadnought Chassis', type: 'unit', cost: 8, atk: 8, hp: 8, art: '🏗️', faction: 'ironwake', kw: { guard: true, shield: true },
    text: '<b>Guard.</b> <b>Shielded.</b>',
    flavor: 'Nothing on this world was made to stop it. We checked.',
  });

  /* ------------------------------------------------------------ Lumen Synod */
  def('acolyte', {
    name: 'Acolyte of the Core', type: 'unit', cost: 1, atk: 1, hp: 3, art: '🕯️', faction: 'synod', aiValue: 1.5,
    text: 'Whenever you play an Order, gain +1 Attack.',
    onOrder(g, ctx) { E().buff(g, ctx.self, 1, 0); },
  });
  def('data_spike', {
    name: 'Data Spike', type: 'order', cost: 1, art: '⚡', faction: 'synod', target: 'any',
    text: 'Deal 2 damage. <b>Tech 3:</b> Deal 3 instead.',
    play(g, ctx) { E().damage(g, ctx.target, E().tech(g, ctx.pid, 3) ? 3 : 2, null); },
  });
  def('archive_scribe', {
    name: 'Archive Scribe', type: 'unit', cost: 2, atk: 2, hp: 3, art: '📜', faction: 'synod',
    text: '<b>Deploy:</b> Gain 2 Research.',
    deploy(g, ctx) { E().gainResearch(g, ctx.pid, 2); },
  });
  def('archive_vault', {
    name: 'Archive Vault', type: 'site', cost: 2, hp: 3, art: '🏛️', faction: 'synod', needsStaff: true, aiValue: 1.5, aiStaffed: 2,
    brief: '+1 Research if staffed',
    text: '<b>Cycle Start:</b> If a unit is stationed here, gain 1 Research.',
    turnStart(g, ctx) { if (ctx.unit) E().gainResearch(g, ctx.pid, 1); },
  });
  def('prism_adept', {
    name: 'Prism Adept', type: 'unit', cost: 3, atk: 2, hp: 4, art: '🔮', faction: 'synod', aiValue: 2, random: true,
    text: 'Whenever you play an Order, deal 1 damage to a random enemy unit or the enemy colony.',
    onOrder(g, ctx) {
      const t = E().randomEnemy(g, ctx.pid);
      if (t) E().damage(g, t, 1, null);
    },
  });
  def('deep_query', {
    name: 'Deep Query', type: 'order', cost: 3, art: '💠', faction: 'synod',
    text: 'Draw 2 cards. <b>Tech 6:</b> Draw 3 instead.',
    play(g, ctx) { E().draw(g, ctx.pid, E().tech(g, ctx.pid, 6) ? 3 : 2); },
  });
  def('relay_spire', {
    name: 'Relay Spire', type: 'site', cost: 3, hp: 3, art: '🗼', faction: 'synod', needsStaff: true, aiValue: 1.5, aiStaffed: 3,
    orderDiscount: 1,
    brief: 'Cheaper Orders if staffed',
    text: 'While a unit is stationed here, your Orders cost 1 less.',
  });
  def('arc_lattice', {
    name: 'Arc Lattice', type: 'order', cost: 4, art: '🌩️', faction: 'synod', target: 'column',
    text: 'Choose a lane. Deal 2 damage to enemy units in it and in both neighbouring lanes. <b>Tech 6:</b> Deal 3 instead.',
    play(g, ctx) {
      const n = E().tech(g, ctx.pid, 6) ? 3 : 2;
      g.players[1 - ctx.pid].board.filter((u) => near(u.lane, ctx.target.lane)).forEach((u) => E().damage(g, unitRef(u), n, null));
    },
  });
  def('oracle_engine', {
    name: 'Oracle Engine', type: 'unit', cost: 5, atk: 3, hp: 6, art: '👁️', faction: 'synod', aiValue: 2.5,
    text: '<b>Cycle End:</b> Gain 1 Research and restore 2 health to your colony.',
    turnEnd(g, ctx) { E().gainResearch(g, ctx.pid, 1); E().heal(g, leaderRef(ctx.pid), 2); },
  });
  def('singularity_lance', {
    name: 'Singularity Lance', type: 'order', cost: 6, art: '🔱', faction: 'synod', target: 'any',
    text: 'Deal 6 damage. <b>Tech 6:</b> Deal 8 instead.',
    play(g, ctx) { E().damage(g, ctx.target, E().tech(g, ctx.pid, 6) ? 8 : 6, null); },
  });
  def('voice', {
    name: 'Voice of the Perihelion', type: 'unit', cost: 8, atk: 6, hp: 6, art: '🌌', faction: 'synod', random: true,
    text: '<b>Deploy:</b> Deal damage equal to your Research (up to 10), split randomly among enemy units and the enemy colony.',
    flavor: 'The ship is dead. Its mind is merely elsewhere.',
    deploy(g, ctx) {
      const n = Math.min(10, g.players[ctx.pid].research);
      for (let i = 0; i < n; i++) {
        const t = E().randomEnemy(g, ctx.pid);
        if (!t) break;
        E().damage(g, t, 1, null);
      }
    },
  });

  /* ------------------------------------------------------------ Free Tide */
  def('deckhand', {
    name: 'Tide Deckhand', type: 'unit', cost: 1, atk: 2, hp: 1, art: '⚓', faction: 'tide', aiValue: 0.5,
    text: '<b>Last Stand:</b> Add a Reserve Cell to your hand.',
    lastStand(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('shiv', {
    name: 'Shiv', type: 'order', cost: 1, art: '🗡️', faction: 'tide', target: 'unit',
    text: 'Deal 1 damage to a unit. Draw a card.',
    play(g, ctx) { E().damage(g, ctx.target, 1, null); E().draw(g, ctx.pid, 1); },
  });
  def('leech_diver', {
    name: 'Leech Diver', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🤿', faction: 'tide', kw: { siphon: true },
    text: '<b>Siphon.</b>',
  });
  def('sabotage', {
    name: 'Sabotage', type: 'order', cost: 2, art: '💣', faction: 'tide', target: 'enemyUnitOrSite',
    text: 'Deal 3 damage to an enemy unit, or 5 damage to an enemy location.',
    play(g, ctx) { E().damage(g, ctx.target, ctx.target.k === 's' ? 5 : 3, null); },
  });
  def('smugglers_dock', {
    name: "Smuggler's Dock", type: 'site', cost: 2, hp: 3, art: '🚢', faction: 'tide', aiValue: 2.5,
    brief: 'Arrivals gain Blitz',
    text: 'Units that arrive in this lane gain <b>Blitz</b>.',
    onArrive(g, ctx) { ctx.unit.kw.blitz = true; ctx.unit.ready = true; },
  });
  def('skyjack', {
    name: 'Skyjack Raider', type: 'unit', cost: 3, atk: 2, hp: 3, art: '🪂', faction: 'tide', kw: { aerial: true },
    text: '<b>Aerial.</b>',
  });
  def('skiff_hangar', {
    name: 'Skiff Hangar', type: 'site', cost: 3, hp: 3, art: '🛫', faction: 'tide', needsStaff: true, aiValue: 1.5, aiStaffed: 2.5,
    grant: { aerial: true },
    brief: 'Unit here has Aerial',
    text: 'The unit stationed here has <b>Aerial</b>.',
  });
  def('corsair_captain', {
    name: 'Corsair Captain', type: 'unit', cost: 4, atk: 4, hp: 2, art: '🏴‍☠️', faction: 'tide', kw: { blitz: true },
    text: '<b>Blitz.</b>',
  });
  def('hijack', {
    name: 'Hijack', type: 'order', cost: 6, art: '🎭', faction: 'tide', target: 'enemyUnit',
    targetFilter: (g, u) => u.atk <= 3,
    text: 'Take control of an enemy unit with 3 or less Attack. It crosses to your side of its lane.',
    play(g, ctx) { E().steal(g, ctx.target, ctx.pid); },
  });
  def('gunship', {
    name: 'Tidecaller Gunship', type: 'unit', cost: 6, atk: 4, hp: 5, art: '🚁', faction: 'tide', kw: { aerial: true, siphon: true },
    text: '<b>Aerial.</b> <b>Siphon.</b>',
  });
  def('kingpin', {
    name: 'Kingpin of the Shoals', type: 'unit', cost: 7, atk: 6, hp: 6, art: '👑', faction: 'tide', random: true,
    text: '<b>Deploy:</b> Add 2 random cards from other factions to your hand. They cost 2 less.',
    flavor: 'Everything on Veyra belongs to someone. Briefly.',
    deploy(g, ctx) {
      for (let i = 0; i < 2; i++) {
        const id = E().randomForeignCard(g, ctx.pid);
        if (id) E().addToHand(g, ctx.pid, id, -2);
      }
    },
  });

  /* ------------------------------------------------------------ factions */
  const FACTIONS = {
    rootbound: {
      id: 'rootbound', name: 'The Rootbound', leader: 'Matriarch Suvi Aldane', art: '🌿', color: '#5fbf6a',
      motto: 'We did not conquer this world. We married it.',
      style: 'Fill the lanes with Sprouts, then grow them into something terrible.',
      power: {
        name: 'Graft', cost: 2, target: 'allyUnit', art: '🧬',
        text: 'Give a friendly unit +1/+1.',
        run(g, ctx) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 1, 1); },
      },
      cards: ['seedcaster', 'creeping_vine', 'overgrowth', 'spawning_grove', 'podling_carrier', 'symbiote_swarm',
        'heartwood_bower', 'bloomcaller', 'brood_matron', 'canopy_beast', 'worldroot_titan'],
    },
    ironwake: {
      id: 'ironwake', name: 'Ironwake Compact', leader: 'Foreman Dax Ortega', art: '⚙️', color: '#e39a4a',
      motto: 'The ship is gone. The steel remains. Build.',
      style: 'Raise turrets, reactors and foundries, then hold the line in front of them.',
      power: {
        name: 'Fortify', cost: 2, target: 'emptyLane', art: '🚧',
        text: 'Summon a 0/3 Barricade with <b>Guard</b> in an empty lane.',
        run(g, ctx) { E().summon(g, ctx.pid, 'barricade', ctx.target.lane); },
      },
      cards: ['scrap_welder', 'bulwark_drone', 'turret_nest', 'riot_plating', 'reactor_core', 'salvage_hauler',
        'mortar_team', 'demolition_charge', 'foundry', 'siege_walker', 'dreadnought'],
    },
    synod: {
      id: 'synod', name: 'Lumen Synod', leader: 'Archivist Thessaly Vane', art: '🔆', color: '#6fb6ff',
      motto: 'Knowledge is the only cargo that survived the fall.',
      style: 'Staff your archives, chain Orders up the Research track and unlock devastating Tech bonuses.',
      power: {
        name: 'Scan', cost: 2, target: 'any', art: '📡',
        text: 'Deal 1 damage.',
        run(g, ctx) { E().damage(g, ctx.target, 1, null); },
      },
      cards: ['acolyte', 'data_spike', 'archive_scribe', 'archive_vault', 'prism_adept', 'deep_query',
        'relay_spire', 'arc_lattice', 'oracle_engine', 'singularity_lance', 'voice'],
    },
    tide: {
      id: 'tide', name: 'The Free Tide', leader: 'Captain Maro Quill', art: '🌊', color: '#e06bb5',
      motto: 'No charter. No council. No refunds.',
      style: 'Fly over the front line, raid what the enemy built, and steal whatever works.',
      power: {
        name: 'Black Market', cost: 2, target: null, art: '🎲', random: true,
        text: 'Add a random card from another faction to your hand.',
        run(g, ctx) { const id = E().randomForeignCard(g, ctx.pid); if (id) E().addToHand(g, ctx.pid, id); },
      },
      cards: ['deckhand', 'shiv', 'leech_diver', 'sabotage', 'smugglers_dock', 'skyjack',
        'skiff_hangar', 'corsair_captain', 'hijack', 'gunship', 'kingpin'],
    },
  };

  const NEUTRAL_DECK = ['survey_drone', 'perimeter_sentry', 'rover_scout', 'bunker', 'field_medic',
    'debris_rain', 'hab_dome', 'storm_skiff'];

  const KEYWORDS = {
    guard: { name: 'Guard', icon: '🛡', text: 'Enemy units that can reach this unit must attack it first.' },
    blitz: { name: 'Blitz', icon: '»', text: 'Can attack enemy units on the turn it arrives.' },
    shield: { name: 'Shielded', icon: '◈', text: 'Ignores the first damage it would take.' },
    siphon: { name: 'Siphon', icon: '♥', text: 'Damage it deals also heals your colony.' },
    aerial: { name: 'Aerial', icon: '✈', text: 'Flies over the front line: can attack locations and the colony even when enemy units are in reach, and ignores Guard.' },
    mobile: { name: 'Mobile', icon: '⇄', text: 'Can move and attack in the same turn.' },
    artillery: { name: 'Artillery', icon: '◎', text: 'Reaches two lanes to each side, and takes no damage back when it attacks.' },
  };

  /** 30 cards: two of each of the faction's 11 cards plus one of each of the 8 colonist cards. */
  function buildDeck(factionId) {
    const f = FACTIONS[factionId];
    const deck = [];
    f.cards.forEach((id) => { deck.push(id, id); });
    NEUTRAL_DECK.forEach((id) => deck.push(id));
    return deck;
  }

  V.CARDS = CARDS;
  V.FACTIONS = FACTIONS;
  V.NEUTRAL_DECK = NEUTRAL_DECK;
  V.KEYWORDS = KEYWORDS;
  V.buildDeck = buildDeck;
})(typeof globalThis !== 'undefined' ? globalThis : this);
