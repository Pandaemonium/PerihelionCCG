/* TAU CETI — card, keyword, faction, and preset deck definitions.
 * Effects are plain functions (g, ctx) that call into TauCeti.Engine at run time.
 *   unit triggers:     ctx = { pid, self (the unit), target, overcharged }
 *   location triggers: ctx = { pid, self (the location), unit (stationed unit or null) }
 *   orders / powers:   ctx = { pid, target, overcharged }
 * Targets are refs: {k:'u',uid} unit, {k:'s',uid} location, {k:'l',pid} colony, {k:'c',lane} lane.
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const E = () => V.Engine;

  const unitRef = (u) => ({ k: 'u', uid: u.uid });
  const siteRef = (s) => ({ k: 's', uid: s.uid });
  const leaderRef = (pid) => ({ k: 'l', pid });
  const near = (a, b, r) => Math.abs(a - b) <= (r == null ? 1 : r);

  const CARDS = {};
  function def(id, c) {
    c.id = id;
    c.faction = c.faction || 'neutral';
    CARDS[id] = c;
  }

  /* ============================================================ tokens */
  def('sprout', {
    name: 'Sprout', type: 'unit', cost: 1, atk: 1, hp: 1, art: '🌱', token: true, faction: 'rootbound', native: true,
    text: '',
    flavor: 'First the hair-root, then the canopy.',
  });
  def('scrapbot', {
    name: 'Scrap Bot', type: 'unit', cost: 1, atk: 2, hp: 1, art: '🤖', token: true, faction: 'ironwake',
    text: '',
    flavor: 'Welded from bulkhead ribs and spite.',
  });
  def('barricade', {
    name: 'Barricade', type: 'unit', cost: 1, atk: 0, hp: 3, art: '🚧', token: true, faction: 'ironwake',
    immobile: true, kw: { guard: true },
    text: '<b>Guard.</b> Cannot move or attack.',
    flavor: 'Put steel between the storm and the generator.',
  });
  def('pilgrim', {
    name: 'Pilgrim', type: 'unit', cost: 1, atk: 1, hp: 1, art: '🕯️', token: true, faction: 'cinder',
    kw: { zeal: 1 },
    text: '<b>Zeal 1.</b>',
    flavor: 'They carry no shields—only torches.',
  });
  def('mind_worm', {
    name: 'Mind Worm', type: 'unit', cost: 2, atk: 2, hp: 2, art: '🪱', token: true, native: true,
    kw: { psi: true },
    text: '<b>Psi.</b>',
    flavor: 'Armor stops shrapnel. It does not stop a nightmare.',
  });
  def('clone_shell', {
    name: 'Clone Shell', type: 'unit', cost: 2, atk: 2, hp: 2, art: '🧬', token: true,
    text: '',
    flavor: 'Same hands, newer pulse.',
  });
  def('cell', {
    name: 'Reserve Cell', type: 'order', cost: 0, art: '🔋', token: true, noResearch: true,
    text: 'Gain 1 Energy this turn.',
    flavor: 'Standard Perihelion capacitor, still humming after impact.',
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

  /* ============================================================ neutral: Colonists & Planet */
  def('survey_drone', {
    name: 'Survey Drone', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🛰️',
    text: '<b>Deploy:</b> Gain 1 Research.',
    flavor: 'Map the ridge before you march up it.',
    deploy(g, ctx) { E().gainResearch(g, ctx.pid, 1); },
  });
  def('perimeter_sentry', {
    name: 'Perimeter Sentry', type: 'unit', cost: 2, atk: 1, hp: 4, art: '🛡️', kw: { guard: true },
    text: '<b>Guard.</b>',
    flavor: 'Three shifts, cold coffee, long horizon.',
  });
  def('rover_scout', {
    name: 'Rover Scout', type: 'unit', cost: 2, atk: 2, hp: 2, art: '🚙', kw: { mobile: true },
    text: '<b>Mobile.</b>',
    flavor: 'First to the supply pod keeps what is inside.',
  });
  def('aaa_sentry', {
    name: 'AAA Sentry', type: 'unit', cost: 2, atk: 1, hp: 4, art: '📡', kw: { interceptor: true },
    text: '<b>Interceptor.</b>',
    flavor: 'Everything that flies eventually has to come down.',
  });
  def('colony_former', {
    name: 'Colony Former', type: 'unit', cost: 2, atk: 1, hp: 3, art: '🚜',
    text: '<b>Deploy:</b> If this lane has terrain, clear it and draw a card. Otherwise build a <b>Sensor Array</b> here.',
    flavor: 'We did not inherit a paradise. We brought bulldozers.',
    deploy(g, ctx) {
      const ln = g.lanes[ctx.self.lane];
      if (ln.terrain) { E().setTerrain(g, ctx.self.lane, null); E().draw(g, ctx.pid, 1); }
      else E().setTerrain(g, ctx.self.lane, 'sensor');
    },
  });
  def('clean_retrofit', {
    name: 'Clean Reactor', type: 'order', cost: 2, art: '♻️', target: 'allyUnit',
    text: 'Give a friendly unit +1/+1. Refund 1 Energy.',
    flavor: 'Zero waste, half the heat signature.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (f) E().buff(g, f.unit, 1, 1);
      E().gainEnergy(g, ctx.pid, 1);
    },
  });
  def('supply_drop', {
    name: 'Orbital Drop', type: 'order', cost: 2, art: '📦', target: 'column',
    targetFilter: (g, lane) => !g.lanes[lane].pod,
    text: 'Drop a <b>Supply Pod</b> into a lane without one. Draw a card.',
    flavor: 'The wreck still sheds crates whenever the orbit decays.',
    play(g, ctx) {
      E().dropPod(g, ctx.target.lane);
      E().draw(g, ctx.pid, 1);
    },
  });
  def('bunker', {
    name: 'Bunker', type: 'site', cost: 2, hp: 4, art: '🧱', needsStaff: true, aiValue: 1.5, aiStaffed: 1.5,
    grant: { guard: true },
    brief: 'Unit here: Guard, +0/+1',
    text: 'The unit stationed here has <b>Guard</b>. <b>Cycle End:</b> It gains +0/+1.',
    flavor: 'Pour the ferrocrete thick and argue politics later.',
    turnEnd(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 0, 1); },
  });
  def('field_medic', {
    name: 'Field Medic', type: 'unit', cost: 3, atk: 2, hp: 3, art: '⛑️', target: 'ally',
    text: '<b>Deploy:</b> Restore 4 health to a friendly unit, location or your colony.',
    flavor: 'Patch the bone, patch the dome—both keep out the cold.',
    deploy(g, ctx) { if (ctx.target) E().heal(g, ctx.target, 4); },
  });
  def('probe_team', {
    name: 'Probe Team', type: 'unit', cost: 3, atk: 2, hp: 2, art: '🕵️', target: 'enemyUnitOrSite',
    text: '<b>Deploy:</b> <b>Jam</b> an enemy unit or location for 1 cycle and gain 1 Research.',
    flavor: 'A single spliced line of code outweighs a battalion.',
    deploy(g, ctx) {
      if (ctx.target) E().jam(g, ctx.target, 1);
      E().gainResearch(g, ctx.pid, 1);
    },
  });
  def('native_mind_worm', {
    name: 'Brood Worm', type: 'unit', cost: 3, atk: 2, hp: 3, art: '🐛', native: true, kw: { psi: true }, aiValue: 1.5,
    text: '<b>Psi.</b> <b>Cycle End:</b> If in Xenofungus, gain +1/+1.',
    flavor: 'The colony called them vermin until they started humming in unison.',
    turnEnd(g, ctx) { if (g.lanes[ctx.self.lane].terrain === 'fungus') E().buff(g, ctx.self, 1, 1); },
  });
  def('debris_rain', {
    name: 'Debris Rain', type: 'order', cost: 3, art: '☄️', target: 'column',
    text: 'Choose a lane. Deal 2 damage to every unit in it and in both neighbouring lanes.',
    flavor: 'Perihelion still remembers how to fall.',
    play(g, ctx) {
      E().allUnits(g).filter((u) => near(u.lane, ctx.target.lane)).forEach((u) => E().damage(g, unitRef(u), 2, null, { order: true, pid: ctx.pid }));
    },
  });
  def('hab_dome', {
    name: 'Hab Dome', type: 'site', cost: 3, hp: 4, art: '🏘️', needsStaff: true, aiValue: 2, aiStaffed: 1,
    brief: 'Heals colony and unit',
    text: '<b>Cycle End:</b> Restore 1 health to your colony, and 2 to the unit stationed here.',
    flavor: 'Warm air, hydroponic basil, and a thin sheet of glass.',
    turnEnd(g, ctx) {
      E().heal(g, leaderRef(ctx.pid), 1);
      if (ctx.unit) E().heal(g, unitRef(ctx.unit), 2);
    },
  });
  def('colony_pod', {
    name: 'Colony Pod', type: 'site', cost: 4, hp: 5, art: '🏕️', needsStaff: true, aiValue: 2.5, aiStaffed: 2.5,
    brief: '+1 Research & heal if staffed',
    text: '<b>Cycle Start:</b> If staffed, gain 1 Research and restore 1 health to your colony.',
    flavor: 'When one landing site burns, we build another further inland.',
    turnStart(g, ctx) {
      if (ctx.unit) {
        E().gainResearch(g, ctx.pid, 1);
        E().heal(g, leaderRef(ctx.pid), 1);
      }
    },
  });
  def('storm_skiff', {
    name: 'Storm Skiff', type: 'unit', cost: 5, atk: 4, hp: 4, art: '🛩️', kw: { aerial: true },
    text: '<b>Aerial.</b>',
    flavor: 'Above the dust wall, every border looks imaginary.',
  });
  def('planet_buster', {
    name: 'Planet Buster', type: 'order', cost: 10, art: '☢️', target: 'column',
    text: 'Choose a lane. Destroy all units and locations in it and neighbouring lanes, clear their terrain, and deal 4 damage to both colonies.',
    flavor: '“I will not be lectured on restraint by people who have never stared at an empty radar.” — UN Charter Addendum',
    play(g, ctx) {
      const c = ctx.target.lane;
      E().allUnits(g).filter((u) => near(u.lane, c)).forEach((u) => E().destroy(g, unitRef(u)));
      [0, 1].forEach((pid) => {
        g.players[pid].sites.filter((s) => E().alive(s) && near(s.lane, c)).forEach((s) => E().destroy(g, siteRef(s)));
      });
      for (let i = Math.max(0, c - 1); i <= Math.min(E().LANES - 1, c + 1); i++) E().setTerrain(g, i, null);
      E().damage(g, leaderRef(0), 4, null, { order: true, pid: ctx.pid });
      E().damage(g, leaderRef(1), 4, null, { order: true, pid: ctx.pid });
    },
  });

  /* ------------------------------------------------------------ Neutral Secret Projects */
  def('planetary_datalinks', {
    name: 'Planetary Datalinks', type: 'site', cost: 5, hp: 6, art: '🌐', project: true, unique: true, aiValue: 4.5,
    brief: 'Enemy Orders give you +1 Research',
    text: '<b>Secret Project.</b> Whenever your opponent plays an Order, gain 1 Research.',
    flavor: '“Beware of those who lock the archive; they fear what the dead still have to teach.” — Archivist Vane',
    onEnemyOrder(g, ctx) { E().gainResearch(g, ctx.pid, 1); },
  });
  def('aegis_algorithm', {
    name: 'The Aegis Algorithm', type: 'site', cost: 6, hp: 6, art: '🔐', project: true, unique: true, aiValue: 5.5,
    aegisShield: true,
    brief: 'Allies immune to enemy Orders',
    text: '<b>Secret Project.</b> Your units and other locations cannot be targeted by enemy Orders, Powers, or Deploy effects.',
    flavor: '“Every lock has a key, until the lock begins rewriting itself.” — Perihelion Security Log',
  });
  def('manifold_former', {
    name: 'The Manifold Former', type: 'site', cost: 6, hp: 7, art: '🌍', project: true, unique: true, aiValue: 5.5,
    siteBuildHp: 2,
    brief: 'Sites +2 HP; repairs all sites',
    text: '<b>Secret Project.</b> Locations you build enter with +2 Integrity. <b>Cycle Start:</b> Restore 1 Integrity to all friendly locations.',
    flavor: '“A world is only hostile until you change its mind.” — Matriarch Aldane',
    turnStart(g, ctx) {
      g.players[ctx.pid].sites.forEach((s) => { if (E().alive(s)) E().heal(g, siteRef(s), 1); });
    },
  });
  def('chrysalis_vats', {
    name: 'The Chrysalis Vats', type: 'site', cost: 7, hp: 7, art: '🧪', project: true, unique: true, aiValue: 6,
    brief: 'Clones first dead unit each turn',
    text: '<b>Secret Project.</b> The first time a friendly non-token unit dies each turn, summon a 2/2 Clone Shell in its lane.',
    flavor: '“Death was merely a budget constraint of the old earth.” — Director Vance',
    onAllyDeath(g, ctx) {
      const dead = ctx.dead;
      if (!dead || CARDS[dead.id].token) return;
      if (ctx.self.lastCloneTurn === g.turn) return;
      ctx.self.lastCloneTurn = g.turn;
      E().summon(g, ctx.pid, 'clone_shell', dead.lane);
    },
  });
  def('orbital_tether', {
    name: 'The Orbital Tether', type: 'site', cost: 7, hp: 7, art: '🛰️', project: true, unique: true,
    needsStaff: true, aiValue: 5, aiStaffed: 3.5, firstCardDiscount: 1, aerialBuff: 1,
    brief: 'Aerials +1/+1; 1st card -1E staffed',
    text: '<b>Secret Project.</b> Your newly summoned <b>Aerial</b> units gain +1/+1. While staffed, your first card each turn costs 1 less.',
    flavor: '“Look up. The wreckage is no longer a grave; it is scaffolding.” — Captain Quill',
  });
  def('voice_of_tau_ceti', {
    name: 'The Voice of Tau Ceti', type: 'site', cost: 8, hp: 6, art: '🌠', project: true, unique: true,
    needsStaff: true, aiValue: 6.5, aiStaffed: 4, ascentProject: true,
    brief: 'Staffed: +2 Research; win at 22',
    text: '<b>Secret Project.</b> <b>Cycle End:</b> If staffed, gain 2 Research. <b>Ascent:</b> Reaching 22 Research while this stands wins the game.',
    flavor: '“At first we heard static. Then we realized it was asking our names.” — Final Perihelion Transcript',
    turnEnd(g, ctx) { if (ctx.unit) E().gainResearch(g, ctx.pid, 2); },
  });

  /* ============================================================ 1. The Rootbound */
  def('seedcaster', {
    name: 'Seedcaster', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🌾', faction: 'rootbound', native: true,
    text: '<b>Deploy:</b> Summon a 1/1 Sprout in the nearest empty lane.',
    flavor: 'Scatter ten seeds; three will survive the wind.',
    deploy(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('symbiotic_bond', {
    name: 'Symbiotic Bond', type: 'order', cost: 1, art: '💚', faction: 'rootbound', target: 'allyUnit',
    text: 'Restore 3 health to a friendly unit. If it is at full health, give it +1/+1 instead.',
    flavor: 'Sap and blood share the same iron.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      if (f.unit.hp >= f.unit.maxHp) E().buff(g, f.unit, 1, 1);
      else E().heal(g, ctx.target, 3);
    },
  });
  def('creeping_vine', {
    name: 'Creeping Vine', type: 'unit', cost: 2, atk: 1, hp: 1, art: '🌿', faction: 'rootbound', native: true, aiValue: 2,
    text: '<b>Cycle End:</b> Gain +1/+1.',
    flavor: 'Leave a wall unguarded for one season and it belongs to the forest.',
    turnEnd(g, ctx) { E().buff(g, ctx.self, 1, 1); },
  });
  def('overgrowth', {
    name: 'Overgrowth', type: 'order', cost: 2, art: '🍃', faction: 'rootbound', target: 'allyUnit',
    text: 'Give a friendly unit +2/+2.',
    flavor: 'Tau Ceti grows faster when you stop trimming it.',
    play(g, ctx) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 2, 2); },
  });
  def('spawning_grove', {
    name: 'Spawning Grove', type: 'site', cost: 2, hp: 4, art: '🍄', faction: 'rootbound', needsEmpty: true, aiValue: 4,
    brief: 'Sprout if lane is empty',
    text: '<b>Cycle End:</b> If no unit is stationed here, grow a 1/1 Sprout in this lane.',
    flavor: 'Warm mist rises from the mulch before sunrise.',
    turnEnd(g, ctx) { if (!E().unitAt(g, ctx.pid, ctx.self.lane)) E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('mycelial_weaver', {
    name: 'Mycelial Weaver', type: 'unit', cost: 2, atk: 1, hp: 2, art: '🕸️', faction: 'rootbound', native: true,
    text: '<b>Deploy:</b> Turn this lane into <b>Xenofungus</b>.',
    flavor: 'She plants purple thread wherever iron boots have marched.',
    deploy(g, ctx) { E().setTerrain(g, ctx.self.lane, 'fungus'); },
  });
  def('podling_carrier', {
    name: 'Podling Carrier', type: 'unit', cost: 3, atk: 2, hp: 2, art: '🐛', faction: 'rootbound', native: true, aiValue: 1.5,
    text: '<b>Last Stand:</b> Summon two 1/1 Sprouts where it fell.',
    flavor: 'Break the husk and the harvest begins.',
    lastStand(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('symbiote_swarm', {
    name: 'Symbiote Swarm', type: 'order', cost: 3, art: '🦠', faction: 'rootbound', target: 'column',
    text: 'Choose a lane. Summon three 1/1 Sprouts in the nearest empty lanes.',
    flavor: 'Alone, fragile. Together, the biosphere.',
    play(g, ctx) { for (let i = 0; i < 3; i++) E().summon(g, ctx.pid, 'sprout', ctx.target.lane); },
  });
  def('heartwood_bower', {
    name: 'Heartwood Bower', type: 'site', cost: 3, hp: 5, art: '🌴', faction: 'rootbound', needsStaff: true, aiValue: 2, aiStaffed: 3,
    brief: 'Unit here grows +1/+1',
    text: '<b>Cycle End:</b> The unit stationed here gains +1/+1.',
    flavor: 'Stand beneath the ribs of the tree and forget exhaustion.',
    turnEnd(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 1, 1); },
  });
  def('mind_root', {
    name: 'Mind-Root Tendril', type: 'unit', cost: 3, atk: 2, hp: 3, art: '🪻', faction: 'rootbound', native: true, kw: { psi: true }, aiValue: 1.5,
    text: '<b>Psi.</b> <b>Cycle End:</b> If in Xenofungus, gain +1/+1.',
    flavor: 'It hears your heartbeat through three inches of ceramic plate.',
    turnEnd(g, ctx) { if (g.lanes[ctx.self.lane].terrain === 'fungus') E().buff(g, ctx.self, 1, 1); },
  });
  def('bloomcaller', {
    name: 'Bloomcaller', type: 'unit', cost: 4, atk: 3, hp: 4, art: '🌺', faction: 'rootbound', native: true,
    text: '<b>Deploy:</b> Give friendly units in the neighbouring lanes +1/+1.',
    flavor: 'One horn note and the whole ridge answers.',
    deploy(g, ctx) {
      g.players[ctx.pid].board.forEach((u) => {
        if (u.uid !== ctx.self.uid && near(u.lane, ctx.self.lane)) E().buff(g, u, 1, 1);
      });
    },
  });
  def('spore_launcher', {
    name: 'Spore Launcher', type: 'unit', cost: 4, atk: 2, hp: 3, art: '🪷', faction: 'rootbound', native: true,
    kw: { artillery: true, psi: true },
    text: '<b>Artillery.</b> <b>Psi.</b> Attacks turn the target’s lane into <b>Xenofungus</b>.',
    flavor: 'Living mortars that sow the garden as they shell it.',
    onAttack(g, ctx) {
      if (ctx.targetLane != null) E().setTerrain(g, ctx.targetLane, 'fungus');
    },
  });
  def('fungal_bloom', {
    name: 'Fungal Bloom', type: 'order', cost: 4, art: '🌌', faction: 'rootbound', target: 'column',
    text: 'Choose a lane. Turn it and neighbouring lanes into <b>Xenofungus</b> and deal 2 damage to enemy units there.',
    flavor: 'In a single night, the purple tide swallowed the perimeter.',
    play(g, ctx) {
      const c = ctx.target.lane;
      for (let i = Math.max(0, c - 1); i <= Math.min(E().LANES - 1, c + 1); i++) E().setTerrain(g, i, 'fungus');
      g.players[1 - ctx.pid].board.filter((u) => E().alive(u) && near(u.lane, c))
        .forEach((u) => E().damage(g, unitRef(u), 2, null, { order: true, pid: ctx.pid }));
    },
  });
  def('brood_matron', {
    name: 'Brood Matron', type: 'unit', cost: 5, atk: 4, hp: 5, art: '🕷️', faction: 'rootbound', native: true, aiValue: 2.5,
    text: '<b>Cycle End:</b> Summon a 1/1 Sprout in the nearest empty lane.',
    flavor: 'She nests in reactor casings warmed by forgotten cores.',
    turnEnd(g, ctx) { E().summon(g, ctx.pid, 'sprout', ctx.self.lane); },
  });
  def('canopy_beast', {
    name: 'Elder Canopy Beast', type: 'unit', cost: 5, atk: 4, hp: 4, art: '🦣', faction: 'rootbound', native: true,
    text: '<b>Deploy:</b> Gain +1/+1 for each other friendly unit.',
    flavor: 'Its hide carries mosses older than the Perihelion.',
    deploy(g, ctx) {
      const n = g.players[ctx.pid].board.length - 1;
      if (n > 0) E().buff(g, ctx.self, n, n);
    },
  });
  def('locust_swarm', {
    name: 'Locusts of Tau Ceti', type: 'unit', cost: 6, atk: 4, hp: 3, art: '🦟', faction: 'rootbound', native: true,
    kw: { aerial: true, psi: true },
    text: '<b>Aerial.</b> <b>Psi.</b> <b>Deploy:</b> Summon a 1/1 Sprout in each neighbouring empty lane.',
    flavor: 'When the sky hums in purple, abandon the domes.',
    deploy(g, ctx) {
      [ctx.self.lane - 1, ctx.self.lane + 1].forEach((ln) => {
        if (ln >= 0 && ln < E().LANES && !E().unitAt(g, ctx.pid, ln)) E().summon(g, ctx.pid, 'sprout', ln);
      });
    },
  });
  def('living_canopy', {
    name: 'The Living Canopy', type: 'site', cost: 6, hp: 6, art: '🌳', faction: 'rootbound', project: true, unique: true, aiValue: 5.5,
    brief: 'Allies +0/+1; dead Sprouts +1 Research',
    text: '<b>Secret Project.</b> <b>Cycle End:</b> Give all friendly units +0/+1. Whenever a friendly Sprout dies, gain 1 Research.',
    flavor: '“We did not conquer this world. We became its lungs.” — Matriarch Suvi Aldane',
    turnEnd(g, ctx) { g.players[ctx.pid].board.forEach((u) => { if (E().alive(u)) E().buff(g, u, 0, 1); }); },
    onAllyDeath(g, ctx) {
      if (ctx.dead && ctx.dead.id === 'sprout') E().gainResearch(g, ctx.pid, 1);
    },
  });
  def('worldroot_titan', {
    name: 'Worldroot Titan', type: 'unit', cost: 8, atk: 7, hp: 7, art: '🌲', faction: 'rootbound', native: true, kw: { guard: true },
    text: '<b>Guard.</b> <b>Deploy:</b> Restore 6 health to your colony.',
    flavor: 'The forest does not forgive. It simply outlasts.',
    deploy(g, ctx) { E().heal(g, leaderRef(ctx.pid), 6); },
  });

  /* ============================================================ 2. Ironwake Compact */
  def('scrap_welder', {
    name: 'Scrap Welder', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🔧', faction: 'ironwake', target: 'allyUnit',
    text: '<b>Deploy:</b> Give another friendly unit +0/+2.',
    flavor: 'A double seam holds twice as long.',
    deploy(g, ctx) { if (ctx.target) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 0, 2); } },
  });
  def('hull_plating', {
    name: 'Hull Plating', type: 'order', cost: 1, art: '🔩', faction: 'ironwake', target: 'allySite',
    text: 'Give a friendly location +3 Max Integrity and restore 3 Integrity to it.',
    flavor: 'Cut straight from the Perihelion keel.',
    play(g, ctx) {
      const f = E().findSite(g, ctx.target.uid);
      if (f) { f.site.maxHp += 3; E().heal(g, ctx.target, 3); }
    },
  });
  def('bulwark_drone', {
    name: 'Bulwark Drone', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🔰', faction: 'ironwake', kw: { guard: true, shield: true },
    text: '<b>Guard.</b> <b>Shielded.</b>',
    flavor: 'Built to absorb the first volley and ask for a second.',
  });
  def('turret_nest', {
    name: 'Turret Nest', type: 'site', cost: 2, hp: 4, art: '🔫', faction: 'ironwake', aiValue: 3.5,
    brief: 'Shoots the lane opposite',
    text: '<b>Cycle End:</b> Deal 2 damage to the enemy unit in the opposite lane. If there is none, deal 1 damage to the enemy colony.',
    flavor: 'No sleep, no fear, steady traverse.',
    turnEnd(g, ctx) {
      const foe = E().unitAt(g, 1 - ctx.pid, ctx.self.lane);
      if (foe && foe.hp > 0) E().damage(g, unitRef(foe), 2, null);
      else E().damage(g, leaderRef(1 - ctx.pid), 1, null);
    },
  });
  def('riot_plating', {
    name: 'Riot Plating', type: 'order', cost: 2, art: '🦺', faction: 'ironwake', target: 'allyUnit',
    text: 'Give a friendly unit +1/+3 and <b>Guard</b>.',
    flavor: 'Heavy enough to slow you down, thick enough to bring you home.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (f) { E().buff(g, f.unit, 1, 3); f.unit.kw.guard = true; }
    },
  });
  def('field_engineer', {
    name: 'Field Engineer', type: 'unit', cost: 2, atk: 2, hp: 3, art: '👷', faction: 'ironwake', target: 'allySite',
    text: '<b>Deploy:</b> Restore 4 Integrity to a friendly location.',
    flavor: 'If the welds hold till morning, we keep the grid.',
    deploy(g, ctx) { if (ctx.target) E().heal(g, ctx.target, 4); },
  });
  def('flak_emplacement', {
    name: 'Flak Emplacement', type: 'site', cost: 2, hp: 4, art: '🎯', faction: 'ironwake', needsStaff: true, aiValue: 2, aiStaffed: 2,
    grant: { interceptor: true },
    brief: 'Unit here: Interceptor; pings Aerial',
    text: 'The unit stationed here has <b>Interceptor</b>. <b>Cycle End:</b> Deal 1 damage to a random enemy <b>Aerial</b> unit.',
    flavor: 'Keep the sky clear and the foundry runs uninterrupted.',
    turnEnd(g, ctx) {
      const fliers = g.players[1 - ctx.pid].board.filter((u) => E().alive(u) && E().hasKw(g, u, 'aerial'));
      const t = E().pick(g, fliers);
      if (t) E().damage(g, unitRef(t), 1, null);
    },
  });
  def('reactor_core', {
    name: 'Reactor Core', type: 'site', cost: 3, hp: 5, art: '⚛️', faction: 'ironwake', aiValue: 5,
    brief: '+1 Energy each turn',
    text: '<b>Cycle Start:</b> Gain 1 extra Energy this turn.',
    flavor: 'Still warm from thirty light-years of burn.',
    turnStart(g, ctx) { E().gainEnergy(g, ctx.pid, 1); },
  });
  def('salvage_hauler', {
    name: 'Salvage Hauler', type: 'unit', cost: 3, atk: 3, hp: 4, art: '🚜', faction: 'ironwake',
    text: '<b>Deploy:</b> Your colony gains 3 Armor.',
    flavor: 'Drag the bulkhead in, weld it over the vents.',
    deploy(g, ctx) { E().gainArmor(g, ctx.pid, 3); },
  });
  def('mortar_team', {
    name: 'Mortar Team', type: 'unit', cost: 3, atk: 2, hp: 4, art: '💣', faction: 'ironwake', kw: { artillery: true },
    text: '<b>Artillery.</b>',
    flavor: 'Lob iron over the ridge and let gravity finish the argument.',
  });
  def('demolition_charge', {
    name: 'Demolition Charge', type: 'order', cost: 3, art: '🧨', faction: 'ironwake', target: 'unitOrSite',
    text: 'Deal 5 damage to a unit or location.',
    flavor: 'Shape the blast, clear the lane.',
    play(g, ctx) { E().damage(g, ctx.target, 5, null, { order: true, pid: ctx.pid }); },
  });
  def('automated_crane', {
    name: 'Automated Crane', type: 'unit', cost: 3, atk: 2, hp: 3, art: '🏗️', faction: 'ironwake', aiValue: 2,
    text: 'Whenever you build a location, summon a 2/1 Scrap Bot in its lane.',
    flavor: 'One girder up, one drone out.',
    onBuild(g, ctx) { if (ctx.site) E().summon(g, ctx.pid, 'scrapbot', ctx.site.lane); },
  });
  def('foundry', {
    name: 'Foundry', type: 'site', cost: 4, hp: 5, art: '🏭', faction: 'ironwake', needsEmpty: true, aiValue: 5.5,
    brief: 'Scrap Bot if lane is empty',
    text: '<b>Cycle End:</b> If no unit is stationed here, build a 2/1 Scrap Bot in this lane.',
    flavor: 'Smelt the wreckage. Pour the future.',
    turnEnd(g, ctx) { if (!E().unitAt(g, ctx.pid, ctx.self.lane)) E().summon(g, ctx.pid, 'scrapbot', ctx.self.lane); },
  });
  def('railgun_battery', {
    name: 'Railgun Battery', type: 'unit', cost: 4, atk: 3, hp: 5, art: '⚡', faction: 'ironwake', kw: { artillery: true },
    siteBonusTech: 5,
    text: '<b>Artillery.</b> <b>Tech 5:</b> Deals +2 damage to locations.',
    flavor: 'Tungsten rods do not care about your philosophy.',
  });
  def('siege_walker', {
    name: 'Siege Walker', type: 'unit', cost: 5, atk: 5, hp: 5, art: '🦿', faction: 'ironwake', kw: { shield: true },
    text: '<b>Shielded.</b>',
    flavor: 'Sixty tons of riveted inevitability.',
  });
  def('orbital_bombardment', {
    name: 'Orbital Salvo', type: 'order', cost: 6, art: '☄️', faction: 'ironwake', target: 'column',
    text: 'Choose a lane. Deal 4 damage to enemy units and locations in it, and 2 to those in neighbouring lanes.',
    flavor: 'The stern gunnery deck still answers one last radio code.',
    play(g, ctx) {
      const c = ctx.target.lane;
      const foe = g.players[1 - ctx.pid];
      foe.board.filter((u) => E().alive(u) && near(u.lane, c))
        .forEach((u) => E().damage(g, unitRef(u), u.lane === c ? 4 : 2, null, { order: true, pid: ctx.pid }));
      foe.sites.filter((s) => E().alive(s) && near(s.lane, c))
        .forEach((s) => E().damage(g, siteRef(s), s.lane === c ? 4 : 2, null, { order: true, pid: ctx.pid }));
    },
  });
  def('bulwark_citadel', {
    name: 'The Bulwark Citadel', type: 'site', cost: 7, hp: 7, art: '🏰', faction: 'ironwake', project: true, unique: true, aiValue: 6.5,
    siteArmor: 1,
    brief: 'Sites -1 dmg; +2 Armor each turn',
    text: '<b>Secret Project.</b> All friendly locations take 1 less non-Psi damage (min 1). <b>Cycle End:</b> Your colony gains 2 Armor.',
    flavor: '“The ship is gone. The steel remains. Build until the planet breaks first.” — Foreman Dax Ortega',
    turnEnd(g, ctx) { E().gainArmor(g, ctx.pid, 2); },
  });
  def('dreadnought', {
    name: 'Dreadnought Chassis', type: 'unit', cost: 8, atk: 8, hp: 8, art: '🦾', faction: 'ironwake', kw: { guard: true, shield: true },
    text: '<b>Guard.</b> <b>Shielded.</b>',
    flavor: 'Nothing on this world was made to stop it. We checked.',
  });

  /* ============================================================ 3. Lumen Synod */
  def('acolyte', {
    name: 'Acolyte of the Core', type: 'unit', cost: 1, atk: 1, hp: 3, art: '🕯️', faction: 'synod', aiValue: 1.5,
    text: 'Whenever you play an Order, gain +1 Attack.',
    flavor: 'Every query sharpens the mind that asks it.',
    onOrder(g, ctx) { E().buff(g, ctx.self, 1, 0); },
  });
  def('data_spike', {
    name: 'Data Spike', type: 'order', cost: 1, art: '⚡', faction: 'synod', target: 'any',
    text: 'Deal 2 damage. <b>Tech 3:</b> Deal 3 instead.',
    flavor: 'A clean burst of telemetry through an unshielded bus.',
    play(g, ctx) { E().damage(g, ctx.target, E().tech(g, ctx.pid, 3) ? 3 : 2, null, { order: true, pid: ctx.pid }); },
  });
  def('archive_scribe', {
    name: 'Archive Scribe', type: 'unit', cost: 2, atk: 2, hp: 3, art: '📜', faction: 'synod',
    text: '<b>Deploy:</b> Gain 2 Research.',
    flavor: 'Transcribe the fragments before the dust claims them.',
    deploy(g, ctx) { E().gainResearch(g, ctx.pid, 2); },
  });
  def('archive_vault', {
    name: 'Archive Vault', type: 'site', cost: 2, hp: 3, art: '🏛️', faction: 'synod', needsStaff: true, aiValue: 1.5, aiStaffed: 2,
    brief: '+1 Research if staffed',
    text: '<b>Cycle Start:</b> If a unit is stationed here, gain 1 Research.',
    flavor: 'Climate-controlled memory crystal, buried beneath volcanic ash.',
    turnStart(g, ctx) { if (ctx.unit) E().gainResearch(g, ctx.pid, 1); },
  });
  def('probe_tech', {
    name: 'Synod Interceptor', type: 'unit', cost: 2, atk: 2, hp: 2, art: '💻', faction: 'synod', target: 'enemyUnitOrSite',
    text: '<b>Deploy:</b> <b>Jam</b> an enemy unit or location for 1 cycle.',
    flavor: 'Why destroy a turret when you can politely turn it off?',
    deploy(g, ctx) { if (ctx.target) E().jam(g, ctx.target, 1); },
  });
  def('neural_siphon', {
    name: 'Neural Siphon', type: 'order', cost: 2, art: '🧠', faction: 'synod', target: 'unit',
    text: 'Deal 2 <b>Psi</b> damage to a unit. <b>Tech 5:</b> If it dies, draw a card.',
    flavor: 'Even a dying circuit yields data.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().damage(g, ctx.target, 2, null, { psi: true, order: true, pid: ctx.pid });
      if (f.unit.hp <= 0 && E().tech(g, ctx.pid, 5)) E().draw(g, ctx.pid, 1);
    },
  });
  def('prism_adept', {
    name: 'Prism Adept', type: 'unit', cost: 3, atk: 2, hp: 4, art: '🔮', faction: 'synod', aiValue: 2, random: true,
    text: 'Whenever you play an Order, deal 1 damage to a random enemy unit or the enemy colony.',
    flavor: 'Refracted light cuts cleaner than steel.',
    onOrder(g, ctx) {
      const t = E().randomEnemy(g, ctx.pid);
      if (t) E().damage(g, t, 1, null);
    },
  });
  def('deep_query', {
    name: 'Deep Query', type: 'order', cost: 3, art: '💠', faction: 'synod',
    text: 'Draw 2 cards. <b>Tech 6:</b> Draw 3 instead.',
    flavor: 'Ask the right question and the ship still answers.',
    play(g, ctx) { E().draw(g, ctx.pid, E().tech(g, ctx.pid, 6) ? 3 : 2); },
  });
  def('relay_spire', {
    name: 'Relay Spire', type: 'site', cost: 3, hp: 3, art: '🗼', faction: 'synod', needsStaff: true, aiValue: 1.5, aiStaffed: 3,
    orderDiscount: 1,
    brief: 'Cheaper Orders if staffed',
    text: 'While a unit is stationed here, your Orders cost 1 less.',
    flavor: 'Line-of-sight microwave links spanning half a continent.',
  });
  def('resonance_weaver', {
    name: 'Resonance Weaver', type: 'unit', cost: 3, atk: 2, hp: 3, art: '✨', faction: 'synod', kw: { psi: true }, aiValue: 1.5,
    text: '<b>Psi.</b> Whenever you reach a Research Breakthrough, gain +1/+1 and draw a card.',
    flavor: 'Each paradigm shift leaves an echo in the lattice.',
    onMilestone(g, ctx) { E().buff(g, ctx.self, 1, 1); E().draw(g, ctx.pid, 1); },
  });
  def('stasis_field', {
    name: 'Stasis Field', type: 'order', cost: 3, art: '❄️', faction: 'synod', target: 'column',
    text: 'Choose a lane. <b>Jam</b> all enemy units and locations in it and neighbouring lanes for 1 cycle.',
    flavor: 'Time is only a local convention.',
    play(g, ctx) {
      const foe = g.players[1 - ctx.pid];
      const c = ctx.target.lane;
      foe.board.filter((u) => E().alive(u) && near(u.lane, c)).forEach((u) => E().jam(g, unitRef(u), 1));
      foe.sites.filter((s) => E().alive(s) && near(s.lane, c)).forEach((s) => E().jam(g, siteRef(s), 1));
    },
  });
  def('arc_lattice', {
    name: 'Arc Lattice', type: 'order', cost: 4, art: '🌩️', faction: 'synod', target: 'column',
    text: 'Choose a lane. Deal 2 damage to enemy units in it and in both neighbouring lanes. <b>Tech 6:</b> Deal 3 instead.',
    flavor: 'Capacitor discharge calibrated to atmospheric ion trails.',
    play(g, ctx) {
      const n = E().tech(g, ctx.pid, 6) ? 3 : 2;
      g.players[1 - ctx.pid].board.filter((u) => near(u.lane, ctx.target.lane))
        .forEach((u) => E().damage(g, unitRef(u), n, null, { order: true, pid: ctx.pid }));
    },
  });
  def('thinkers_node', {
    name: "Thinker's Node", type: 'site', cost: 4, hp: 4, art: '🖥️', faction: 'synod', needsStaff: true, aiValue: 2, aiStaffed: 3.5,
    brief: 'Draw 1 card if staffed (-1 HP)',
    text: '<b>Cycle End:</b> If staffed, draw a card and this location takes 1 damage.',
    flavor: 'Run the cores hot enough and they answer tomorrow’s questions today.',
    turnEnd(g, ctx) {
      if (ctx.unit) {
        E().draw(g, ctx.pid, 1);
        E().damage(g, siteRef(ctx.self), 1, null, { psi: true });
      }
    },
  });
  def('oracle_engine', {
    name: 'Oracle Engine', type: 'unit', cost: 5, atk: 3, hp: 6, art: '👁️', faction: 'synod', aiValue: 2.5,
    text: '<b>Cycle End:</b> Gain 1 Research and restore 2 health to your colony.',
    flavor: 'It predicts storms, mutinies, and supply shortages with equal calm.',
    turnEnd(g, ctx) { E().gainResearch(g, ctx.pid, 1); E().heal(g, leaderRef(ctx.pid), 2); },
  });
  def('quantum_cascade', {
    name: 'Quantum Cascade', type: 'order', cost: 5, art: '🌀', faction: 'synod',
    text: 'Deal 2 damage to all enemy units. <b>Tech 8:</b> Gain 2 Research.',
    flavor: 'When the wave collapses, only our equations remain.',
    play(g, ctx) {
      g.players[1 - ctx.pid].board.filter(E().alive)
        .forEach((u) => E().damage(g, unitRef(u), 2, null, { order: true, pid: ctx.pid }));
      if (E().tech(g, ctx.pid, 8)) E().gainResearch(g, ctx.pid, 2);
    },
  });
  def('singularity_lance', {
    name: 'Singularity Lance', type: 'order', cost: 6, art: '🔱', faction: 'synod', target: 'any',
    text: 'Deal 6 damage. <b>Tech 6:</b> Deal 8 instead.',
    flavor: 'Focused gravity does not negotiate.',
    play(g, ctx) { E().damage(g, ctx.target, E().tech(g, ctx.pid, 6) ? 8 : 6, null, { order: true, pid: ctx.pid }); },
  });
  def('virtual_archive', {
    name: 'The Virtual Archive', type: 'site', cost: 6, hp: 5, art: '📚', faction: 'synod', project: true, unique: true,
    needsStaff: true, aiValue: 4.5, aiStaffed: 3, techReduction: 1,
    brief: 'Tech -1; staffed Orders draw (≤3)',
    text: '<b>Secret Project.</b> Your <b>Tech</b> thresholds are reduced by 1. While staffed, playing an Order with 3 or fewer cards in hand draws a card.',
    flavor: '“Knowledge is the only cargo that survived the fall.” — Archivist Thessaly Vane',
    onOrder(g, ctx) { if (ctx.unit && g.players[ctx.pid].hand.length <= 3) E().draw(g, ctx.pid, 1); },
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

  /* ============================================================ 4. The Free Tide */
  def('deckhand', {
    name: 'Tide Deckhand', type: 'unit', cost: 1, atk: 2, hp: 1, art: '⚓', faction: 'tide', aiValue: 0.5,
    text: '<b>Last Stand:</b> Add a Reserve Cell to your hand.',
    flavor: 'Even overboard, he remembers to toss the battery dry.',
    lastStand(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('shiv', {
    name: 'Shiv', type: 'order', cost: 1, art: '🗡️', faction: 'tide', target: 'unit',
    text: 'Deal 1 damage to a unit. Draw a card.',
    flavor: 'Cheap, quiet, and always handy.',
    play(g, ctx) { E().damage(g, ctx.target, 1, null, { order: true, pid: ctx.pid }); E().draw(g, ctx.pid, 1); },
  });
  def('fence_runner', {
    name: 'Fence Runner', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🏃', faction: 'tide', kw: { mobile: true },
    text: '<b>Mobile.</b> <b>Deploy:</b> Reduce the cost of a random foreign card in your hand by 1.',
    flavor: 'Fell off a Synodal transport. Still warm.',
    deploy(g, ctx) {
      const mine = g.players[ctx.pid].faction;
      const pool = g.players[ctx.pid].hand.filter((h) => CARDS[h.id].faction !== 'neutral' && CARDS[h.id].faction !== mine && h.cost > 0);
      const pick = E().pick(g, pool);
      if (pick) pick.cost = Math.max(0, pick.cost - 1);
    },
  });
  def('leech_diver', {
    name: 'Leech Diver', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🤿', faction: 'tide', kw: { siphon: true },
    text: '<b>Siphon.</b>',
    flavor: 'Tap their fuel lines from under the silt.',
  });
  def('sabotage', {
    name: 'Sabotage', type: 'order', cost: 2, art: '💣', faction: 'tide', target: 'enemyUnitOrSite',
    text: 'Deal 3 damage to an enemy unit, or 5 damage to an enemy location.',
    flavor: 'A bent paperclip in the coolant valve does wonders.',
    play(g, ctx) { E().damage(g, ctx.target, ctx.target.k === 's' ? 5 : 3, null, { order: true, pid: ctx.pid }); },
  });
  def('smugglers_dock', {
    name: "Smuggler's Dock", type: 'site', cost: 2, hp: 3, art: '🚢', faction: 'tide', aiValue: 2.5,
    brief: 'Arrivals gain Blitz',
    text: 'Units that arrive in this lane gain <b>Blitz</b>.',
    flavor: 'Unlisted pier, fast boats, no customs.',
    onArrive(g, ctx) { ctx.unit.kw.blitz = true; ctx.unit.ready = true; },
  });
  def('grapple_line', {
    name: 'Grapple Line', type: 'order', cost: 2, art: '🪝', faction: 'tide', target: 'enemyUnit',
    text: 'Deal 1 damage to an enemy unit and pull it 1 lane sideways into an empty lane.',
    flavor: 'Drag the sentry off his turret and walk right past.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().damage(g, ctx.target, 1, null, { order: true, pid: ctx.pid });
      if (E().alive(f.unit)) E().pushUnit(g, f.unit);
    },
  });
  def('smuggled_cache', {
    name: 'Smuggled Cache', type: 'site', cost: 2, hp: 4, art: '🧰', faction: 'tide', aiValue: 3,
    brief: '+1 Cell/turn; raze draws 1',
    text: '<b>Cycle Start:</b> Add a Reserve Cell to your hand. If this location is razed, draw a card.',
    flavor: 'Buried in waterproof crates wherever the tide recedes.',
    turnStart(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); },
    onRaze(g, ctx) { E().draw(g, ctx.pid, 1); },
  });
  def('skyjack', {
    name: 'Skyjack Raider', type: 'unit', cost: 3, atk: 3, hp: 3, art: '🪂', faction: 'tide', kw: { aerial: true },
    text: '<b>Aerial.</b>',
    flavor: 'Walls only stop people who walk.',
  });
  def('skiff_hangar', {
    name: 'Skiff Hangar', type: 'site', cost: 3, hp: 3, art: '🛫', faction: 'tide', needsStaff: true, aiValue: 1.5, aiStaffed: 2.5,
    grant: { aerial: true },
    brief: 'Unit here has Aerial',
    text: 'The unit stationed here has <b>Aerial</b>.',
    flavor: 'Strap two thrusters to anything and call it a gunship.',
  });
  def('privateer_cutter', {
    name: 'Privateer Cutter', type: 'unit', cost: 3, atk: 3, hp: 2, art: '⛵', faction: 'tide', kw: { blitz: true },
    text: '<b>Blitz.</b> When it attacks a location or colony, add a Reserve Cell to your hand.',
    flavor: 'Hit the depot, pocket the cells, vanish in the fog.',
    onAttack(g, ctx) { if (ctx.target && ctx.target.k !== 'u') E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('corsair_captain', {
    name: 'Corsair Captain', type: 'unit', cost: 4, atk: 4, hp: 3, art: '🏴‍☠️', faction: 'tide', kw: { blitz: true },
    text: '<b>Blitz.</b>',
    flavor: 'First onto the deck, last to split the loot.',
  });
  def('corsair_interceptor', {
    name: 'Skyhawk Corsair', type: 'unit', cost: 4, atk: 3, hp: 4, art: '🦅', faction: 'tide', kw: { aerial: true, interceptor: true },
    text: '<b>Aerial.</b> <b>Interceptor.</b>',
    flavor: 'Owns the clouds above the shoals.',
  });
  def('hostile_salvage', {
    name: 'Hostile Salvage', type: 'order', cost: 5, art: '🧲', faction: 'tide', target: 'enemySite',
    targetFilter: (g, s) => s.hp <= 4,
    text: 'Destroy an enemy location with 4 or less Integrity and draw a card.',
    flavor: 'If you cannot guard it, you do not own it.',
    play(g, ctx) { E().destroy(g, ctx.target); E().draw(g, ctx.pid, 1); },
  });
  def('hijack', {
    name: 'Hijack', type: 'order', cost: 6, art: '🎭', faction: 'tide', target: 'enemyUnit',
    targetFilter: (g, u) => u.atk <= 3,
    text: 'Take control of an enemy unit with 3 or less Attack. It crosses to your side of its lane.',
    flavor: 'Better pay, shorter hours, fresher rum.',
    play(g, ctx) { E().steal(g, ctx.target, ctx.pid); },
  });
  def('gunship', {
    name: 'Tidecaller Gunship', type: 'unit', cost: 6, atk: 4, hp: 5, art: '🚁', faction: 'tide', kw: { aerial: true, siphon: true },
    text: '<b>Aerial.</b> <b>Siphon.</b>',
    flavor: 'Roars in low, drains the silos, climbs back into the squall.',
  });
  def('sovereign_reef', {
    name: 'The Sovereign Reef', type: 'site', cost: 6, hp: 6, art: '🏝️', faction: 'tide', project: true, unique: true,
    aiValue: 6, random: true, raiderBuff: 1,
    brief: 'Foreign card (-1E); Blitz/Air +1 Atk',
    text: '<b>Secret Project.</b> Your <b>Blitz</b> and <b>Aerial</b> units have +1 Attack. <b>Cycle Start:</b> Add a random foreign card to your hand; it costs 1 less.',
    flavor: '“No charter. No council. No refunds.” — Captain Maro Quill',
    turnStart(g, ctx) {
      const id = E().randomForeignCard(g, ctx.pid);
      if (id) E().addToHand(g, ctx.pid, id, -1);
    },
  });
  def('kingpin', {
    name: 'Kingpin of the Shoals', type: 'unit', cost: 7, atk: 6, hp: 6, art: '👑', faction: 'tide', random: true,
    text: '<b>Deploy:</b> Add 2 random cards from other factions to your hand. They cost 2 less.',
    flavor: 'Everything on Tau Ceti belongs to someone. Briefly.',
    deploy(g, ctx) {
      for (let i = 0; i < 2; i++) {
        const id = E().randomForeignCard(g, ctx.pid);
        if (id) E().addToHand(g, ctx.pid, id, -2);
      }
    },
  });

  /* ============================================================ 5. The Cinder Choir (Believers) */
  def('ash_initiate', {
    name: 'Ash Initiate', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🔥', faction: 'cinder', kw: { zeal: 1 }, aiValue: 0.8,
    text: '<b>Zeal 1.</b> <b>Last Stand:</b> Deal 1 damage to the enemy colony.',
    flavor: 'Carry the ember until your hands give out.',
    lastStand(g, ctx) { E().damage(g, leaderRef(1 - ctx.pid), 1, null); },
  });
  def('zealot_scout', {
    name: 'Fervent Runner', type: 'unit', cost: 1, atk: 2, hp: 1, art: '🏃‍♂️', faction: 'cinder', kw: { zeal: 1 },
    text: '<b>Zeal 1.</b>',
    flavor: 'Faith outruns caution every morning.',
  });
  def('anathema', {
    name: 'Anathema', type: 'order', cost: 1, art: '📜', faction: 'cinder', target: 'unitOrSite',
    text: 'Deal 2 damage to a unit or location. If the opponent has 5+ Research, deal 4 instead.',
    flavor: 'Every proud equation ends in smoke.',
    play(g, ctx) {
      const n = g.players[1 - ctx.pid].research >= 5 ? 4 : 2;
      E().damage(g, ctx.target, n, null, { order: true, pid: ctx.pid });
    },
  });
  def('pyre_bearer', {
    name: 'Pyre Bearer', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🔦', faction: 'cinder', kw: { zeal: 2 },
    text: '<b>Zeal 2.</b>',
    flavor: 'Fierce on the charge, unconcerned with tomorrow.',
  });
  def('penitent_shield', {
    name: 'Penitent Warden', type: 'unit', cost: 2, atk: 1, hp: 4, art: '🛡️', faction: 'cinder', kw: { guard: true }, aiValue: 1,
    text: '<b>Guard.</b> <b>Last Stand:</b> Give a random friendly unit +1/+1.',
    flavor: 'His fall steadies the line behind him.',
    lastStand(g, ctx) {
      const allies = g.players[ctx.pid].board.filter(E().alive);
      const t = E().pick(g, allies);
      if (t) E().buff(g, t, 1, 1);
    },
  });
  def('chapel_of_embers', {
    name: 'Chapel of Embers', type: 'site', cost: 2, hp: 5, art: '⛪', faction: 'cinder', needsStaff: true, aiValue: 2, aiStaffed: 2.5,
    brief: 'Unit here gains +1/+0 & Zeal',
    text: '<b>Cycle End:</b> Give the unit stationed here +1/+0 (and <b>Zeal 1</b> if it has none).',
    flavor: 'Built from scorched plating, lit by oil lamps.',
    turnEnd(g, ctx) {
      if (ctx.unit) {
        if (!ctx.unit.kw.zeal) ctx.unit.kw.zeal = 1;
        E().buff(g, ctx.unit, 1, 0);
      }
    },
  });
  def('vow_of_ruin', {
    name: 'Vow of Ruin', type: 'order', cost: 2, art: '🩸', faction: 'cinder', target: 'allyUnit',
    text: 'Give a friendly unit +2/+2 and <b>Zeal 1</b>.',
    flavor: 'Swear no retreat and fear dissolves.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (f) {
        E().buff(g, f.unit, 2, 2);
        f.unit.kw.zeal = (f.unit.kw.zeal || 0) + 1;
      }
    },
  });
  def('inquisitor_cell', {
    name: 'Inquisitor Cell', type: 'unit', cost: 3, atk: 2, hp: 4, art: '⚖️', faction: 'cinder', aiValue: 2,
    text: 'Whenever the enemy plays an Order, deal 2 damage to their colony.',
    flavor: 'We watch the broadcasts. We answer with fire.',
    onEnemyOrder(g, ctx) { E().damage(g, leaderRef(1 - ctx.pid), 2, null); },
  });
  def('witch_hunter', {
    name: 'Mind-Purge Zealot', type: 'unit', cost: 3, atk: 3, hp: 3, art: '🗡️', faction: 'cinder', kw: { psi: true, zeal: 1 },
    text: '<b>Psi.</b> <b>Zeal 1.</b>',
    flavor: 'Neither shield nor bunker hides a guilty mind.',
  });
  def('belfry_spire', {
    name: 'Belfry Spire', type: 'site', cost: 3, hp: 4, art: '🔔', faction: 'cinder', aiValue: 3.5,
    brief: 'Dead allies heal 1 & buff +1/+0',
    text: 'Whenever a friendly unit is destroyed, restore 1 health to your colony and give a random ally +1/+0.',
    flavor: 'Every toll names a martyr and stiffens the living.',
    onAllyDeath(g, ctx) {
      E().heal(g, leaderRef(ctx.pid), 1);
      const allies = g.players[ctx.pid].board.filter(E().alive);
      const t = E().pick(g, allies);
      if (t) E().buff(g, t, 1, 0);
    },
  });
  def('cinder_sermon', {
    name: 'Cinder Sermon', type: 'order', cost: 3, art: '📣', faction: 'cinder',
    text: 'Give all friendly units +1/+0 and <b>Zeal 1</b>. Draw a card.',
    flavor: '“Look at the sky we broke. Now march!”',
    play(g, ctx) {
      g.players[ctx.pid].board.filter(E().alive).forEach((u) => {
        E().buff(g, u, 1, 0);
        if (!u.kw.zeal) u.kw.zeal = 1;
      });
      E().draw(g, ctx.pid, 1);
    },
  });
  def('reliquary_vault', {
    name: 'Reliquary Vault', type: 'site', cost: 3, hp: 4, art: '⚱️', faction: 'cinder', aiValue: 3,
    brief: 'Heals colony; +1 Research if ally fell',
    text: '<b>Cycle End:</b> Restore 1 health to your colony. If a friendly unit died this turn, gain 1 Research and draw a card.',
    flavor: 'We keep the dog tags of the fallen, not the blueprints of machines.',
    turnEnd(g, ctx) {
      E().heal(g, leaderRef(ctx.pid), 1);
      if (g.players[ctx.pid].diedThisTurn > 0) {
        E().gainResearch(g, ctx.pid, 1);
        E().draw(g, ctx.pid, 1);
      }
    },
  });
  def('iconoclast', {
    name: 'Iconoclast', type: 'unit', cost: 4, atk: 4, hp: 3, art: '🪓', faction: 'cinder', kw: { blitz: true },
    doubleSiteDmg: true,
    text: '<b>Blitz.</b> Deals double damage to locations.',
    flavor: 'Tear down every tower that reaches for the old orbit.',
  });
  def('purge_archive', {
    name: 'Purge the Archive', type: 'order', cost: 4, art: '🔥', faction: 'cinder', target: 'enemySite',
    text: 'Deal 4 damage to an enemy location and <b>Jam</b> it for 1 cycle. If it is razed, draw 2 cards.',
    flavor: 'Burn the servers. Free the minds.',
    play(g, ctx) {
      const f = E().findSite(g, ctx.target.uid);
      if (!f) return;
      E().damage(g, ctx.target, 4, null, { order: true, pid: ctx.pid });
      if (f.site.hp <= 0) E().draw(g, ctx.pid, 2);
      else E().jam(g, ctx.target, 1);
    },
  });
  def('martyr_engine', {
    name: 'Martyr Engine', type: 'unit', cost: 5, atk: 3, hp: 5, art: '🛎️', faction: 'cinder', kw: { guard: true }, aiValue: 2,
    text: '<b>Guard.</b> <b>Last Stand:</b> Deal 2 damage to all enemy units in this lane and neighbouring lanes.',
    flavor: 'Even its wreckage burns for three days.',
    lastStand(g, ctx) {
      g.players[1 - ctx.pid].board.filter((u) => E().alive(u) && near(u.lane, ctx.self.lane))
        .forEach((u) => E().damage(g, unitRef(u), 2, null));
    },
  });
  def('fanatic_charger', {
    name: 'Crusade Rider', type: 'unit', cost: 5, atk: 4, hp: 3, art: '🐎', faction: 'cinder', kw: { blitz: true, zeal: 2 },
    text: '<b>Blitz.</b> <b>Zeal 2.</b>',
    flavor: 'Six attack on the charge, no intention of turning back.',
  });
  def('eternal_pyre', {
    name: 'The Eternal Pyre', type: 'site', cost: 6, hp: 7, art: '🌋', faction: 'cinder', project: true, unique: true, aiValue: 6,
    zealAura: 1, razeBonus: 3,
    brief: 'Allies Zeal +1; razing deals +3 dmg',
    text: '<b>Secret Project.</b> All friendly units gain <b>+1 Zeal</b>. Whenever you raze an enemy location, deal 3 extra damage to the enemy colony.',
    flavor: '“We built a god of wire and glass, and it fell out of the sky. Never again.” — Confessor Mara Solis',
  });
  def('seraph_wreck', {
    name: 'Seraph of the Wreck', type: 'unit', cost: 8, atk: 6, hp: 6, art: '👼', faction: 'cinder', kw: { aerial: true, zeal: 3 },
    text: '<b>Aerial.</b> <b>Zeal 3.</b> <b>Deploy:</b> Destroy a random enemy location with 4 or less Integrity.',
    flavor: 'Wings hammered from heat-shield tiles, descending in judgment.',
    deploy(g, ctx) {
      const sites = g.players[1 - ctx.pid].sites.filter((s) => E().alive(s) && s.hp <= 4);
      const t = E().pick(g, sites);
      if (t) E().destroy(g, siteRef(t));
    },
  });

  /* ============================================================ 6. The Auric Charter (Morgan) */
  def('courier_broker', {
    name: 'Courier Broker', type: 'unit', cost: 1, atk: 2, hp: 2, art: '💼', faction: 'auric',
    text: '<b>Deploy:</b> Add a Reserve Cell to your hand.',
    flavor: 'Never sign a contract without a deposit.',
    deploy(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('ledger_bot', {
    name: 'Ledger Bot', type: 'unit', cost: 1, atk: 2, hp: 2, art: '🧮', faction: 'auric', overcharge: 1,
    text: '<b>Overcharge 1:</b> Gain +1/+2.',
    flavor: 'Counts kilowatt-hours down to the third decimal.',
    deploy(g, ctx) { if (ctx.overcharged) E().buff(g, ctx.self, 1, 2); },
  });
  def('bribe', {
    name: 'Bribe', type: 'order', cost: 1, art: '💰', faction: 'auric', target: 'enemyUnit', overcharge: 2,
    text: '<b>Jam</b> an enemy unit for 1 cycle. <b>Overcharge 2:</b> Draw a card.',
    flavor: 'Everyone has a price; most are surprisingly modest.',
    play(g, ctx) {
      E().jam(g, ctx.target, 1);
      if (ctx.overcharged) E().draw(g, ctx.pid, 1);
    },
  });
  def('solar_array', {
    name: 'Solar Array', type: 'site', cost: 2, hp: 4, art: '☀️', faction: 'auric', aiValue: 4,
    brief: '+1 Reserve Cell each cycle',
    text: '<b>Cycle Start:</b> Add a Reserve Cell to your hand.',
    flavor: 'Sunlight is free. Selling it is an art.',
    turnStart(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('contract_guard', {
    name: 'Contract Guard', type: 'unit', cost: 2, atk: 2, hp: 4, art: '💂', faction: 'auric', kw: { guard: true }, overcharge: 1,
    text: '<b>Guard.</b> <b>Overcharge 1:</b> Gain +1/+2.',
    flavor: 'Standard rate gets a shield; overtime gets loyalty.',
    deploy(g, ctx) { if (ctx.overcharged) E().buff(g, ctx.self, 1, 2); },
  });
  def('dividend', {
    name: 'Quarterly Dividend', type: 'order', cost: 2, art: '📈', faction: 'auric', overcharge: 2,
    text: 'Draw a card and add a Reserve Cell to your hand. <b>Overcharge 2:</b> Draw an extra card.',
    flavor: 'Compound interest outlasts empires.',
    play(g, ctx) {
      E().draw(g, ctx.pid, ctx.overcharged ? 2 : 1);
      E().addToHand(g, ctx.pid, 'cell');
    },
  });
  def('mercenary_lancer', {
    name: 'Mercenary Lancer', type: 'unit', cost: 3, atk: 3, hp: 4, art: '🏇', faction: 'auric', overcharge: 1,
    text: '<b>Overcharge 1:</b> Gain <b>Blitz</b> and <b>Shielded</b>.',
    flavor: 'Pay the hazard bonus and he rides tonight.',
    deploy(g, ctx) {
      if (ctx.overcharged) { ctx.self.kw.blitz = true; ctx.self.kw.shield = true; ctx.self.ready = true; }
    },
  });
  def('collector_skiff', {
    name: 'Collector Skiff', type: 'unit', cost: 3, atk: 2, hp: 4, art: '🛸', faction: 'auric', kw: { aerial: true, siphon: true },
    text: '<b>Aerial.</b> <b>Siphon.</b>',
    flavor: 'Skims thermal drafts and unpaid debts alike.',
  });
  def('gold_barricade', {
    name: 'Aegis Vault-Guard', type: 'unit', cost: 3, atk: 3, hp: 5, art: '🏦', faction: 'auric', kw: { guard: true }, overcharge: 2,
    text: '<b>Guard.</b> <b>Overcharge 2:</b> Gain <b>Shielded</b> and your colony gains 3 Armor.',
    flavor: 'Protected by three-inch titanium and an ironclad NDA.',
    deploy(g, ctx) {
      if (ctx.overcharged) { ctx.self.kw.shield = true; E().gainArmor(g, ctx.pid, 3); }
    },
  });
  def('exchange_spire', {
    name: 'Exchange Spire', type: 'site', cost: 3, hp: 5, art: '🏢', faction: 'auric', aiValue: 4,
    brief: '1+ Energy left: draw & heal 2',
    text: '<b>Cycle End:</b> If you have 1 or more unspent Energy, draw a card and restore 2 health to your colony.',
    flavor: 'Liquidity is survival.',
    turnEnd(g, ctx) {
      if (g.players[ctx.pid].energy >= 1) {
        E().draw(g, ctx.pid, 1);
        E().heal(g, leaderRef(ctx.pid), 2);
      }
    },
  });
  def('hostile_takeover', {
    name: 'Hostile Takeover', type: 'order', cost: 3, art: '📑', faction: 'auric', target: 'unit',
    text: 'Deal 4 damage to a unit. If it is destroyed, gain 2 Energy this turn.',
    flavor: 'Liquidate the competition and pocket the overhead.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().damage(g, ctx.target, 4, null, { order: true, pid: ctx.pid });
      if (f.unit.hp <= 0) E().gainEnergy(g, ctx.pid, 2);
    },
  });
  def('thermal_lease', {
    name: 'Thermal Lease', type: 'order', cost: 3, art: '🌋', faction: 'auric', target: 'column',
    text: 'Turn a lane into a <b>Thermal Borehole</b>, deal 2 damage to the enemy unit there, and add 2 Reserve Cells to your hand.',
    flavor: 'Mineral rights filed before the lava cooled.',
    play(g, ctx) {
      E().setTerrain(g, ctx.target.lane, 'borehole');
      const foe = E().unitAt(g, 1 - ctx.pid, ctx.target.lane);
      if (foe && E().alive(foe)) E().damage(g, unitRef(foe), 2, null, { order: true, pid: ctx.pid });
      E().addToHand(g, ctx.pid, 'cell');
      E().addToHand(g, ctx.pid, 'cell');
    },
  });
  def('vault_drone', {
    name: 'Vault Drone', type: 'unit', cost: 4, atk: 3, hp: 5, art: '🤖', faction: 'auric', kw: { guard: true },
    text: '<b>Guard.</b> <b>Deploy:</b> Your colony gains 2 Armor plus Armor equal to your remaining Energy (up to 6).',
    flavor: 'Unspent capital hardens into hull plating.',
    deploy(g, ctx) {
      const a = Math.min(6, 2 + g.players[ctx.pid].energy);
      if (a > 0) E().gainArmor(g, ctx.pid, a);
    },
  });
  def('guild_enforcer', {
    name: 'Guild Enforcer', type: 'unit', cost: 5, atk: 5, hp: 5, art: '🕶️', faction: 'auric', target: 'enemyUnitOrSite', overcharge: 2,
    text: '<b>Overcharge 2:</b> Deal 4 damage to an enemy unit or location.',
    flavor: 'Handles delinquent accounts personally.',
    deploy(g, ctx) { if (ctx.overcharged && ctx.target) E().damage(g, ctx.target, 4, null); },
  });
  def('syndicate_titan', {
    name: 'Syndicate Exo-Rig', type: 'unit', cost: 6, atk: 6, hp: 6, art: '🦾', faction: 'auric', overcharge: 2,
    text: '<b>Overcharge 2:</b> Gain +2/+2, <b>Guard</b>, and <b>Shielded</b>.',
    flavor: 'Commercial chassis; military-grade financing.',
    deploy(g, ctx) { if (ctx.overcharged) { E().buff(g, ctx.self, 2, 2); ctx.self.kw.guard = true; ctx.self.kw.shield = true; } },
  });
  def('orbital_brokerage', {
    name: 'Orbital Brokerage', type: 'order', cost: 5, art: '🛰️', faction: 'auric', overcharge: 2,
    text: 'Draw 2 cards and reduce their cost by 1. <b>Overcharge 2:</b> Add 2 Reserve Cells to your hand.',
    flavor: 'Trade routes open the moment the first beacon blinks.',
    play(g, ctx) {
      const p = g.players[ctx.pid];
      const before = p.hand.length;
      E().draw(g, ctx.pid, 2);
      for (let i = before; i < p.hand.length; i++) p.hand[i].cost = Math.max(0, p.hand[i].cost - 1);
      if (ctx.overcharged) { E().addToHand(g, ctx.pid, 'cell'); E().addToHand(g, ctx.pid, 'cell'); }
    },
  });
  def('meridian_exchange', {
    name: 'The Meridian Exchange', type: 'site', cost: 6, hp: 6, art: '🏛️', faction: 'auric', project: true, unique: true, aiValue: 6.5,
    energyCap: 12,
    brief: 'Max Energy 12; +1E & +Cell/turn',
    text: '<b>Secret Project.</b> Your maximum Energy cap is 12. <b>Cycle Start:</b> Gain 1 Energy and add a Reserve Cell to your hand.',
    flavor: '“Ideology does not keep the oxygen scrubbers running. Credit does.” — Director Kofi Vance',
    turnStart(g, ctx) { E().gainEnergy(g, ctx.pid, 1); E().addToHand(g, ctx.pid, 'cell'); },
  });
  def('gilded_leviathan', {
    name: 'Gilded Leviathan', type: 'unit', cost: 8, atk: 6, hp: 7, art: '🐳', faction: 'auric', random: true,
    text: '<b>Deploy:</b> Spend all remaining Energy; gain +1/+1 and deal 1 damage to a random enemy for each Energy spent.',
    flavor: 'A walking treasury armed with capacitor cannons.',
    deploy(g, ctx) {
      const p = g.players[ctx.pid];
      const spent = p.energy;
      if (spent <= 0) return;
      p.energy = 0;
      E().buff(g, ctx.self, spent, spent);
      for (let i = 0; i < spent; i++) {
        const t = E().randomEnemy(g, ctx.pid);
        if (!t) break;
        E().damage(g, t, 1, null);
      }
    },
  });

  /* ============================================================ 7. The Redline Cadre (Spartans) */
  def('outrider_recon', {
    name: 'Outrider Recon', type: 'unit', cost: 1, atk: 2, hp: 2, art: '🏍️', faction: 'redline', kw: { mobile: true, flank: 1 },
    text: '<b>Mobile.</b> <b>Flank +1.</b>',
    flavor: 'Never hit a line where it expects you.',
  });
  def('field_spotter', {
    name: 'Field Spotter', type: 'unit', cost: 1, atk: 1, hp: 2, art: '🔭', faction: 'redline', target: 'allyUnit',
    text: '<b>Deploy:</b> Give another friendly unit +1/+1 and <b>Flank +1</b>.',
    flavor: 'Wind ten knots west, armor thin on the left.',
    deploy(g, ctx) {
      if (!ctx.target) return;
      const f = E().find(g, ctx.target.uid);
      if (f) { E().buff(g, f.unit, 1, 1); f.unit.kw.flank = (f.unit.kw.flank || 0) + 1; }
    },
  });
  def('flanking_maneuver', {
    name: 'Flanking Maneuver', type: 'order', cost: 1, art: '↪️', faction: 'redline', target: 'allyUnit',
    text: 'Give a friendly unit +1/+1 and <b>Mobile</b>. It may move again this turn.',
    flavor: 'Slide one ridge over and turn their cover into a trap.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().buff(g, f.unit, 1, 1);
      f.unit.kw.mobile = true;
      f.unit.moved = false;
    },
  });
  def('flak_battery', {
    name: 'Flak Battery', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🔫', faction: 'redline', kw: { interceptor: true },
    text: '<b>Interceptor.</b>',
    flavor: 'Skiffs learn quickly which ridges belong to the Cadre.',
  });
  def('forward_outpost', {
    name: 'Forward Outpost', type: 'site', cost: 2, hp: 4, art: '⛺', faction: 'redline', needsStaff: true, aiValue: 2, aiStaffed: 2.5,
    grant: { mobile: true, flank: 1 },
    brief: 'Unit: Mobile, Flank +1, +1/+0',
    text: 'The unit stationed here has <b>Mobile</b> and <b>Flank +1</b>. <b>Cycle End:</b> It gains +1/+0.',
    flavor: 'Pack light, strike sideways, relocate before dawn.',
    turnEnd(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 1, 0); },
  });
  def('shock_trooper', {
    name: 'Shock Trooper', type: 'unit', cost: 2, atk: 2, hp: 3, art: '🪖', faction: 'redline', kw: { veteran: true }, aiValue: 1.2,
    text: '<b>Veteran:</b> First kill grants +1/+1 and <b>Shielded</b>.',
    flavor: 'Survive one firefight and the Cadre issues composite plating.',
    onPromote(g, ctx) { E().buff(g, ctx.self, 1, 1); ctx.self.kw.shield = true; },
  });
  def('ridge_engineers', {
    name: 'Ridge Engineers', type: 'unit', cost: 2, atk: 2, hp: 3, art: '⛰️', faction: 'redline',
    text: '<b>Deploy:</b> Turn this lane into a <b>High Ridge</b> (+1 Reach).',
    flavor: 'If the ground is flat, pile rock until it isn’t.',
    deploy(g, ctx) { E().setTerrain(g, ctx.self.lane, 'ridge'); },
  });
  def('suppressive_salvo', {
    name: 'Suppressive Salvo', type: 'order', cost: 3, art: '💥', faction: 'redline', target: 'enemyUnit',
    text: 'Deal 2 damage to an enemy unit, push it 1 lane sideways, and draw a card.',
    flavor: 'Pin them, shift them, break the formation.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().damage(g, ctx.target, 2, null, { order: true, pid: ctx.pid });
      if (E().alive(f.unit)) E().pushUnit(g, f.unit);
      E().draw(g, ctx.pid, 1);
    },
  });
  def('command_post', {
    name: 'Command Post', type: 'site', cost: 3, hp: 4, art: '🎖️', faction: 'redline', aiValue: 3,
    brief: 'Arrivals & movers gain +1/+1',
    text: 'Whenever a friendly unit arrives in or moves into this lane, give it +1/+1.',
    flavor: 'Rotate squads through the bunker; send them back sharper.',
    onArrive(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 1, 1); },
    onMoveArrive(g, ctx) { if (ctx.unit) E().buff(g, ctx.unit, 1, 1); },
  });
  def('ambush_squad', {
    name: 'Ambush Squad', type: 'unit', cost: 3, atk: 3, hp: 2, art: '🎯', faction: 'redline', kw: { mobile: true, flank: 2 },
    text: '<b>Mobile.</b> <b>Flank +2.</b>',
    flavor: 'Five attack from the blind side, gone before the smoke clears.',
  });
  def('valkyrie_drop', {
    name: 'Valkyrie Drop-Pod', type: 'unit', cost: 4, atk: 3, hp: 4, art: '🪂', faction: 'redline', kw: { blitz: true, flank: 2 },
    text: '<b>Blitz.</b> <b>Flank +2.</b>',
    flavor: 'Orbital insertion directly onto the enemy flank.',
  });
  def('sniper_nest', {
    name: 'Sniper Team', type: 'unit', cost: 4, atk: 3, hp: 3, art: '🎯', faction: 'redline', kw: { artillery: true, veteran: true }, aiValue: 1.5,
    text: '<b>Artillery.</b> <b>Veteran:</b> First kill grants +2/+1.',
    flavor: 'Two lanes away, one breath, one notch.',
    onPromote(g, ctx) { E().buff(g, ctx.self, 2, 1); },
  });
  def('aa_cruiser', {
    name: 'Aegis Flak-Walker', type: 'unit', cost: 4, atk: 3, hp: 5, art: '🛡️', faction: 'redline', kw: { interceptor: true, guard: true },
    text: '<b>Guard.</b> <b>Interceptor.</b>',
    flavor: 'Blocks ground and sky in a single chassis.',
  });
  def('artillery_barrage', {
    name: 'Fire Mission', type: 'order', cost: 4, art: '🚀', faction: 'redline', target: 'column',
    text: 'Choose a lane. Deal 3 damage to the enemy unit and location there, and 1 to enemy units in neighbouring lanes.',
    flavor: 'Coordinates confirmed. Fire for effect.',
    play(g, ctx) {
      const c = ctx.target.lane;
      const foe = g.players[1 - ctx.pid];
      foe.board.filter((u) => E().alive(u) && near(u.lane, c))
        .forEach((u) => E().damage(g, unitRef(u), u.lane === c ? 3 : 1, null, { order: true, pid: ctx.pid }));
      const s = E().siteAt(g, 1 - ctx.pid, c);
      if (s && E().alive(s)) E().damage(g, siteRef(s), 3, null, { order: true, pid: ctx.pid });
    },
  });
  def('tactical_airlift', {
    name: 'Tactical Airlift', type: 'order', cost: 5, art: '🚁', faction: 'redline', target: 'allyUnit',
    text: 'Give a friendly unit +2/+2 and <b>Mobile</b>. Ready it so it can attack and move again.',
    flavor: 'Pull the veteran off the left flank and drop him through the breach.',
    play(g, ctx) {
      const f = E().find(g, ctx.target.uid);
      if (!f) return;
      E().buff(g, f.unit, 2, 2);
      f.unit.kw.mobile = true;
      f.unit.ready = true;
      f.unit.attacked = false;
      f.unit.moved = false;
      f.unit.summonedTurn = -1;
    },
  });
  def('elite_commando', {
    name: 'Elite Commando', type: 'unit', cost: 5, atk: 4, hp: 5, art: '🥷', faction: 'redline', kw: { mobile: true, veteran: true }, aiValue: 1.5,
    text: '<b>Mobile.</b> <b>Veteran:</b> First kill grants +2/+2 and <b>Shielded</b>.',
    flavor: 'Trained for zero-g, jungle rot, and bad odds.',
    onPromote(g, ctx) { E().buff(g, ctx.self, 2, 2); ctx.self.kw.shield = true; },
  });
  def('command_nexus', {
    name: 'The Command Nexus', type: 'site', cost: 6, hp: 7, art: '📡', faction: 'redline', project: true, unique: true,
    needsStaff: true, aiValue: 5.5, aiStaffed: 3.5, globalMobile: true, globalFlank: 1,
    brief: 'Staffed: all allies Mobile & Flank +1',
    text: '<b>Secret Project.</b> While staffed, all your units have <b>Mobile</b> and <b>Flank +1</b>.',
    flavor: '“Armor fails. Plans fail. Only the soldier who outmaneuvers the storm survives.” — Marshal Soren Kade',
  });
  def('marshals_vanguard', {
    name: "Marshal's Vanguard", type: 'unit', cost: 7, atk: 5, hp: 6, art: '⚔️', faction: 'redline',
    kw: { mobile: true, interceptor: true, veteran: true },
    text: '<b>Mobile.</b> <b>Interceptor.</b> <b>Veteran.</b> <b>Deploy:</b> Give friendly units in neighbouring lanes +1/+1.',
    flavor: 'Where the Marshal plants the standard, the ridge holds.',
    deploy(g, ctx) {
      g.players[ctx.pid].board.forEach((u) => {
        if (u.uid !== ctx.self.uid && near(u.lane, ctx.self.lane)) E().buff(g, u, 1, 1);
      });
    },
  });

  /* ============================================================ factions & presets */
  const FACTIONS = {
    rootbound: {
      id: 'rootbound', name: 'The Rootbound', leader: 'Matriarch Suvi Aldane', art: '🌿', color: '#5fbf6a',
      motto: 'We did not conquer this world. We married it.',
      style: 'Fill the lanes with Sprouts and Xenofungus, then outgrow everything in your path.',
      power: {
        name: 'Graft', cost: 2, target: 'allyUnit', art: '🧬',
        text: 'Give a friendly unit +1/+1.',
        run(g, ctx) { const f = E().find(g, ctx.target.uid); if (f) E().buff(g, f.unit, 1, 1); },
      },
      cards: [
        'seedcaster', 'symbiotic_bond', 'creeping_vine', 'overgrowth', 'spawning_grove', 'mycelial_weaver',
        'podling_carrier', 'symbiote_swarm', 'heartwood_bower', 'mind_root', 'bloomcaller', 'spore_launcher',
        'fungal_bloom', 'brood_matron', 'canopy_beast', 'locust_swarm', 'living_canopy', 'worldroot_titan',
      ],
      presets: {
        swarm: {
          name: 'Canopy Swarm', desc: 'Flood lanes with Sprouts, buff wide, and sustain with The Living Canopy.',
          doctrine: 'green',
          cards: [
            ['seedcaster', 2], ['symbiotic_bond', 2], ['creeping_vine', 2], ['overgrowth', 2], ['spawning_grove', 2],
            ['podling_carrier', 2], ['symbiote_swarm', 2], ['heartwood_bower', 2], ['bloomcaller', 2],
            ['brood_matron', 2], ['canopy_beast', 2], ['living_canopy', 1], ['worldroot_titan', 2],
            ['survey_drone', 1], ['aaa_sentry', 1], ['rover_scout', 1], ['hab_dome', 1], ['chrysalis_vats', 1],
          ],
        },
        fungal: {
          name: 'Fungal Psi-Bloom', desc: 'Terraform lanes into Xenofungus and pierce shields with Psi tendrils and Locusts.',
          doctrine: 'green',
          cards: [
            ['seedcaster', 2], ['symbiotic_bond', 2], ['mycelial_weaver', 2], ['overgrowth', 2], ['spawning_grove', 2],
            ['mind_root', 2], ['native_mind_worm', 2], ['spore_launcher', 2], ['fungal_bloom', 2],
            ['bloomcaller', 2], ['locust_swarm', 2], ['living_canopy', 1], ['worldroot_titan', 1],
            ['colony_former', 1], ['field_medic', 1], ['supply_drop', 1], ['manifold_former', 1], ['voice_of_tau_ceti', 1], ['probe_team', 1],
          ],
        },
      },
    },
    ironwake: {
      id: 'ironwake', name: 'Ironwake Compact', leader: 'Foreman Dax Ortega', art: '⚙️', color: '#e39a4a',
      motto: 'The ship is gone. The steel remains. Build.',
      style: 'Raise turrets, reactors and foundries, then hold the steel line in front of them.',
      power: {
        name: 'Fortify', cost: 2, target: 'emptyLane', art: '🚧',
        text: 'Summon a 0/3 Barricade with <b>Guard</b> in an empty lane.',
        run(g, ctx) { E().summon(g, ctx.pid, 'barricade', ctx.target.lane); },
      },
      cards: [
        'scrap_welder', 'hull_plating', 'bulwark_drone', 'turret_nest', 'riot_plating', 'field_engineer',
        'flak_emplacement', 'reactor_core', 'salvage_hauler', 'mortar_team', 'demolition_charge',
        'automated_crane', 'foundry', 'railgun_battery', 'siege_walker', 'orbital_bombardment',
        'bulwark_citadel', 'dreadnought',
      ],
      presets: {
        fortress: {
          name: 'Foundry Fortress', desc: 'Stack Reactors, Turrets, Foundries, and Bulwark Citadel behind armored Guards.',
          doctrine: 'police',
          cards: [
            ['scrap_welder', 2], ['hull_plating', 2], ['bulwark_drone', 2], ['turret_nest', 2], ['riot_plating', 2],
            ['field_engineer', 2], ['flak_emplacement', 2], ['reactor_core', 2], ['salvage_hauler', 2],
            ['automated_crane', 2], ['foundry', 2], ['siege_walker', 2], ['bulwark_citadel', 1], ['dreadnought', 2],
            ['bunker', 1], ['manifold_former', 1], ['aegis_algorithm', 1],
          ],
        },
        artillery: {
          name: 'Siege Artillery', desc: 'Shell the enemy line from afar with Mortars, Railguns, and Orbital Salvos.',
          doctrine: 'standard',
          cards: [
            ['scrap_welder', 2], ['bulwark_drone', 2], ['turret_nest', 2], ['reactor_core', 2], ['salvage_hauler', 2],
            ['mortar_team', 2], ['demolition_charge', 2], ['railgun_battery', 2], ['siege_walker', 2],
            ['orbital_bombardment', 2], ['bulwark_citadel', 1], ['dreadnought', 2],
            ['survey_drone', 1], ['perimeter_sentry', 1], ['aaa_sentry', 1], ['debris_rain', 1], ['colony_pod', 1], ['clean_retrofit', 1], ['planet_buster', 1],
          ],
        },
      },
    },
    synod: {
      id: 'synod', name: 'Lumen Synod', leader: 'Archivist Thessaly Vane', art: '🔆', color: '#6fb6ff',
      motto: 'Knowledge is the only cargo that survived the fall.',
      style: 'Staff your archives, chain Orders up the Research track, and unlock devastating Tech.',
      power: {
        name: 'Scan', cost: 2, target: 'any', art: '📡',
        text: 'Deal 1 damage.',
        run(g, ctx) { E().damage(g, ctx.target, 1, null); },
      },
      cards: [
        'acolyte', 'data_spike', 'archive_scribe', 'archive_vault', 'probe_tech', 'neural_siphon',
        'prism_adept', 'deep_query', 'relay_spire', 'resonance_weaver', 'stasis_field', 'arc_lattice',
        'thinkers_node', 'oracle_engine', 'quantum_cascade', 'singularity_lance', 'virtual_archive', 'voice',
      ],
      presets: {
        arcanum: {
          name: 'Order Cascade', desc: 'Discount Orders with Relay Spires and burn down foes with Tech payoffs.',
          doctrine: 'knowledge',
          cards: [
            ['acolyte', 2], ['data_spike', 2], ['archive_scribe', 2], ['archive_vault', 2], ['neural_siphon', 2],
            ['prism_adept', 2], ['deep_query', 2], ['relay_spire', 2], ['arc_lattice', 2],
            ['oracle_engine', 2], ['quantum_cascade', 2], ['singularity_lance', 2], ['virtual_archive', 1], ['voice', 2],
            ['survey_drone', 1], ['aaa_sentry', 1], ['planetary_datalinks', 1],
          ],
        },
        transcend: {
          name: 'Ascent Protocol', desc: 'Jam threats with Stasis, accelerate Research, and win via The Voice of Tau Ceti.',
          doctrine: 'knowledge',
          cards: [
            ['data_spike', 2], ['archive_scribe', 2], ['archive_vault', 2], ['probe_tech', 2], ['neural_siphon', 2],
            ['deep_query', 2], ['resonance_weaver', 2], ['stasis_field', 2], ['thinkers_node', 2],
            ['oracle_engine', 2], ['quantum_cascade', 1], ['virtual_archive', 1], ['voice', 1],
            ['survey_drone', 1], ['probe_team', 2], ['colony_pod', 1], ['planetary_datalinks', 1], ['aegis_algorithm', 1], ['voice_of_tau_ceti', 1],
          ],
        },
      },
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
      cards: [
        'deckhand', 'shiv', 'fence_runner', 'leech_diver', 'sabotage', 'smugglers_dock', 'grapple_line',
        'smuggled_cache', 'skyjack', 'skiff_hangar', 'privateer_cutter', 'corsair_captain',
        'corsair_interceptor', 'hostile_salvage', 'hijack', 'gunship', 'sovereign_reef', 'kingpin',
      ],
      presets: {
        raiders: {
          name: 'Skyjack Armada', desc: 'Dominate the air with Skiffs, Gunships, Blitz cutters, and The Orbital Tether.',
          doctrine: 'market',
          cards: [
            ['deckhand', 2], ['shiv', 2], ['leech_diver', 2], ['sabotage', 2], ['smugglers_dock', 2],
            ['skyjack', 2], ['skiff_hangar', 2], ['privateer_cutter', 2], ['corsair_captain', 2],
            ['corsair_interceptor', 2], ['gunship', 2], ['sovereign_reef', 1], ['kingpin', 1],
            ['rover_scout', 2], ['storm_skiff', 2], ['supply_drop', 1], ['orbital_tether', 1],
          ],
        },
        heist: {
          name: 'Black Market Heist', desc: 'Disrupt formations with Grapple Line, raze sites, and steal enemy aces.',
          doctrine: 'standard',
          cards: [
            ['deckhand', 2], ['shiv', 2], ['fence_runner', 2], ['leech_diver', 2], ['sabotage', 2],
            ['grapple_line', 2], ['smuggled_cache', 2], ['skyjack', 2], ['corsair_captain', 2],
            ['hostile_salvage', 2], ['hijack', 2], ['gunship', 2], ['sovereign_reef', 1], ['kingpin', 2],
            ['probe_team', 2], ['field_medic', 1],
          ],
        },
      },
    },
    cinder: {
      id: 'cinder', name: 'The Cinder Choir', leader: 'Confessor Mara Solis', art: '🔥', color: '#ef5350',
      motto: 'We built a god of wire and glass, and it fell out of the sky. Never again.',
      style: 'Strike furiously with Zeal, weaponize martyrdom, and raze enemy archives to ash.',
      power: {
        name: 'Call Faithful', cost: 2, target: 'emptyLane', art: '🕯️',
        text: 'Summon a 1/1 Pilgrim with <b>Zeal 1</b> in an empty lane.',
        run(g, ctx) { E().summon(g, ctx.pid, 'pilgrim', ctx.target.lane); },
      },
      cards: [
        'ash_initiate', 'zealot_scout', 'anathema', 'pyre_bearer', 'penitent_shield', 'chapel_of_embers',
        'vow_of_ruin', 'inquisitor_cell', 'witch_hunter', 'belfry_spire', 'cinder_sermon', 'reliquary_vault',
        'iconoclast', 'purge_archive', 'martyr_engine', 'fanatic_charger', 'eternal_pyre', 'seraph_wreck',
      ],
      presets: {
        crusade: {
          name: 'Ember Crusade', desc: 'Relentless Zeal attackers, Blitz site-breakers, and The Eternal Pyre.',
          doctrine: 'power',
          cards: [
            ['ash_initiate', 2], ['zealot_scout', 2], ['anathema', 2], ['pyre_bearer', 2], ['chapel_of_embers', 2],
            ['vow_of_ruin', 2], ['witch_hunter', 2], ['cinder_sermon', 2], ['iconoclast', 2],
            ['purge_archive', 2], ['fanatic_charger', 2], ['eternal_pyre', 1], ['seraph_wreck', 2],
            ['rover_scout', 2], ['clean_retrofit', 2], ['aaa_sentry', 1],
          ],
        },
        inquisition: {
          name: 'Martyr Inquisition', desc: 'Punish Orders and Tech while turning every fallen unit into colony fuel.',
          doctrine: 'standard',
          cards: [
            ['ash_initiate', 2], ['anathema', 2], ['penitent_shield', 2], ['chapel_of_embers', 2],
            ['inquisitor_cell', 2], ['witch_hunter', 2], ['belfry_spire', 2], ['reliquary_vault', 2],
            ['iconoclast', 2], ['purge_archive', 2], ['martyr_engine', 2], ['eternal_pyre', 1], ['seraph_wreck', 2],
            ['field_medic', 2], ['hab_dome', 1], ['chrysalis_vats', 1], ['aaa_sentry', 1],
          ],
        },
      },
    },
    auric: {
      id: 'auric', name: 'The Auric Charter', leader: 'Director Kofi Vance', art: '🪙', color: '#ffd54f',
      motto: 'Ideology does not keep the oxygen scrubbers running. Credit does.',
      style: 'Bank Reserve Cells, fund high-value Locations, and Overcharge elite mercenaries.',
      power: {
        name: 'Reserve Mint', cost: 2, target: null, art: '🔋',
        text: 'Add a Reserve Cell to your hand and gain 2 Armor.',
        run(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); E().gainArmor(g, ctx.pid, 2); },
      },
      cards: [
        'courier_broker', 'ledger_bot', 'bribe', 'solar_array', 'contract_guard', 'dividend',
        'mercenary_lancer', 'collector_skiff', 'gold_barricade', 'exchange_spire', 'hostile_takeover',
        'thermal_lease', 'vault_drone', 'guild_enforcer', 'syndicate_titan', 'orbital_brokerage',
        'meridian_exchange', 'gilded_leviathan',
      ],
      presets: {
        overcharge: {
          name: 'Overcharge Mercs', desc: 'Stockpile Reserve Cells to unleash supercharged lancers, enforcers, and Leviathans.',
          doctrine: 'market',
          cards: [
            ['courier_broker', 2], ['ledger_bot', 2], ['bribe', 2], ['solar_array', 2], ['contract_guard', 2],
            ['dividend', 2], ['mercenary_lancer', 2], ['hostile_takeover', 2], ['vault_drone', 2],
            ['guild_enforcer', 2], ['syndicate_titan', 2], ['orbital_brokerage', 2], ['meridian_exchange', 1],
            ['gilded_leviathan', 2], ['aaa_sentry', 1], ['clean_retrofit', 2],
          ],
        },
        syndicate: {
          name: 'Thermal Syndicate', desc: 'Drill Boreholes, protect your Exchange Spires, and out-value the opponent.',
          doctrine: 'standard',
          cards: [
            ['courier_broker', 2], ['bribe', 2], ['solar_array', 2], ['contract_guard', 2], ['dividend', 2],
            ['collector_skiff', 2], ['gold_barricade', 2], ['exchange_spire', 2], ['thermal_lease', 2],
            ['vault_drone', 2], ['guild_enforcer', 2], ['orbital_brokerage', 1], ['meridian_exchange', 1],
            ['gilded_leviathan', 1], ['bunker', 1], ['colony_former', 1], ['aegis_algorithm', 1], ['orbital_tether', 1], ['field_medic', 1],
          ],
        },
      },
    },
    redline: {
      id: 'redline', name: 'The Redline Cadre', leader: 'Marshal Soren Kade', art: '🎖️', color: '#4dd0e1',
      motto: 'Armor fails. Plans fail. Only the soldier who outmaneuvers the storm survives.',
      style: 'Outflank with Mobile veterans, seize High Ridges, and lock down the skies.',
      power: {
        name: 'Drill Orders', cost: 2, target: 'allyUnit', art: '⚡',
        text: 'Give a friendly unit +1/+0 and <b>Mobile</b>; it may move again.',
        run(g, ctx) {
          const f = E().find(g, ctx.target.uid);
          if (f) { E().buff(g, f.unit, 1, 0); f.unit.kw.mobile = true; f.unit.moved = false; }
        },
      },
      cards: [
        'outrider_recon', 'field_spotter', 'flanking_maneuver', 'flak_battery', 'forward_outpost',
        'shock_trooper', 'ridge_engineers', 'suppressive_salvo', 'command_post', 'ambush_squad',
        'valkyrie_drop', 'sniper_nest', 'aa_cruiser', 'artillery_barrage', 'tactical_airlift',
        'elite_commando', 'command_nexus', 'marshals_vanguard',
      ],
      presets: {
        maneuver: {
          name: 'Flanking Cadre', desc: 'Slide Mobile flankers through Command Posts to strike weak angles.',
          doctrine: 'power',
          cards: [
            ['outrider_recon', 2], ['field_spotter', 2], ['flanking_maneuver', 2], ['flak_battery', 2],
            ['forward_outpost', 2], ['shock_trooper', 2], ['suppressive_salvo', 2], ['command_post', 2],
            ['ambush_squad', 2], ['valkyrie_drop', 2], ['tactical_airlift', 2], ['elite_commando', 2],
            ['command_nexus', 1], ['marshals_vanguard', 2], ['rover_scout', 2], ['supply_drop', 1],
          ],
        },
        vanguard: {
          name: 'Ridge Vanguard', desc: 'Fortify High Ridges with Sniper Teams, Interceptors, and promoted Veterans.',
          doctrine: 'standard',
          cards: [
            ['outrider_recon', 2], ['flak_battery', 2], ['shock_trooper', 2], ['ridge_engineers', 2],
            ['suppressive_salvo', 2], ['command_post', 2], ['valkyrie_drop', 2], ['sniper_nest', 2],
            ['aa_cruiser', 2], ['artillery_barrage', 2], ['elite_commando', 2], ['command_nexus', 1],
            ['marshals_vanguard', 2], ['survey_drone', 1], ['bunker', 1], ['field_medic', 1], ['colony_former', 1], ['chrysalis_vats', 1],
          ],
        },
      },
    },
  };

  const NEUTRAL_CARDS = Object.keys(CARDS).filter((id) => !CARDS[id].token && CARDS[id].faction === 'neutral');
  const NEUTRAL_DECK = ['survey_drone', 'perimeter_sentry', 'rover_scout', 'bunker', 'field_medic', 'debris_rain', 'hab_dome', 'storm_skiff'];

  const KEYWORDS = {
    guard: { name: 'Guard', icon: '🛡', text: 'Enemy ground units in reach must attack this unit first.' },
    blitz: { name: 'Blitz', icon: '»', text: 'Can attack enemy units on the turn it arrives.' },
    shield: { name: 'Shielded', icon: '◈', text: 'Ignores the first non-Psi damage it would take.' },
    siphon: { name: 'Siphon', icon: '♥', text: 'Damage it deals also heals your colony.' },
    aerial: { name: 'Aerial', icon: '✈', text: 'Flies over ground units and Guard; only screened by Interceptors.' },
    mobile: { name: 'Mobile', icon: '⇄', text: 'Can move and attack in the same turn.' },
    artillery: { name: 'Artillery', icon: '◎', text: 'Reaches two lanes to each side, and takes no damage back when it attacks.' },
    interceptor: { name: 'Interceptor', icon: '⛨', text: 'Screens Aerial units in reach (they must attack it first) and deals +1 damage to Aerial units.' },
    psi: { name: 'Psi', icon: '✦', text: 'Damage ignores Shielded, Colony Armor, and location armor.' },
    flank: { name: 'Flank', icon: '⤢', text: 'Gains bonus Attack when attacking a target in a neighbouring lane.' },
    veteran: { name: 'Veteran', icon: '★', text: 'The first time this unit destroys an enemy unit, it permanently promotes (+1/+1 or special bonus).' },
    zeal: { name: 'Zeal', icon: '🔥', text: 'Has bonus Attack during your own turn.' },
  };

  function expandPreset(entries) {
    const out = [];
    entries.forEach(([id, n]) => { for (let i = 0; i < n; i++) out.push(id); });
    return out;
  }

  /** Build a 30-card deck for a faction (using presetKey if provided, else its first preset). */
  function buildDeck(factionId, presetKey) {
    const f = FACTIONS[factionId];
    const keys = Object.keys(f.presets);
    const key = presetKey && f.presets[presetKey] ? presetKey : keys[0];
    return expandPreset(f.presets[key].cards);
  }

  V.CARDS = CARDS;
  V.FACTIONS = FACTIONS;
  V.NEUTRAL_CARDS = NEUTRAL_CARDS;
  V.NEUTRAL_DECK = NEUTRAL_DECK;
  V.KEYWORDS = KEYWORDS;
  V.expandPreset = expandPreset;
  V.buildDeck = buildDeck;
})(typeof globalThis !== 'undefined' ? globalThis : this);
