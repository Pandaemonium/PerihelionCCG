/* TAU CETI — Planet Mode cards and faction decks (prototype, phase A).
 *
 * Card types and where they're played:
 *   unit       on one of your cities; appears in that city's sector and takes a sector slot.
 *   structure  in your city's sector or a sector where you have a unit; an immobile unit.
 *   building   attached to one of your cities; takes a city slot.
 *   populace   attached to one of your cities; takes a city slot.
 *   event      aimed at a sector within EVENT_RANGE of your units or cities (or untargeted),
 *              resolved after movement in initiative order, fastest first.
 * Sector slots are shared by every player: P.CAPACITY cards per sector (cities and units count).
 *
 * Fields: cost (energy), init (initiative), atk/hp/move for units, tech (needed to play),
 * art (an id in art/*.webp, borrowed from the lane game), energy/research/hp/slots/cityAtk for
 * attachments. Events have run(g, ctx) with ctx = { pid, sector }, called through P's helpers.
 * Plain data plus functions; game state only ever stores card ids.
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});

  const PC = {};
  const def = (id, c) => { c.id = id; c.faction = c.faction || null; PC[id] = c; };
  const P = () => V.Planet;

  /* ------------------------------------------------------------ units */
  def('colony_pod', {
    name: 'Colony Pod', type: 'unit', cost: 5, atk: 0, hp: 3, init: 1, move: 1, settler: true, icon: '🏕️', art: 'colony_pod',
    text: 'Founds a city where it ends its move, if the sector has no city.',
  });
  def('scout_rover', {
    name: 'Scout Rover', type: 'unit', cost: 2, atk: 1, hp: 2, init: 3, move: 2, icon: '🚙', art: 'rover_scout',
    text: 'Fast and cheap. Good for claiming ground.',
  });
  def('shock_trooper', {
    name: 'Shock Trooper', type: 'unit', cost: 3, atk: 2, hp: 4, init: 1, move: 1, icon: '🪖', art: 'shock_trooper',
    text: 'The backbone of any army.',
  });
  def('garrison', {
    name: 'Sentinel Garrison', type: 'unit', cost: 2, atk: 1, hp: 5, init: 2, move: 1, icon: '🛡️', art: 'perimeter_sentry',
    text: 'Sturdy and slow to anger.',
  });
  def('needlejet', {
    name: 'Needlejet', type: 'unit', cost: 5, atk: 3, hp: 3, init: 5, move: 3, air: true, tech: 'flight', icon: '🛩️', art: 'gunship',
    text: 'Aircraft: flies over ocean and strikes first. Needs Doctrine: Flight.',
  });
  def('former', {
    name: 'Terraformer', type: 'unit', cost: 3, atk: 0, hp: 3, init: 1, move: 1, former: true, icon: '🚜', art: 'colony_former',
    text: 'After holding 2 turns in a sector, improves it: barrens or fungus become plains, plains become a fertile basin.',
  });
  def('probe_team', {
    name: 'Probe Team', type: 'unit', cost: 4, atk: 1, hp: 2, init: 4, move: 2, probe: true, icon: '🕵️', art: 'probe_team',
    text: 'Spy: each turn it survives in an enemy city\'s sector, it wrecks one of that city\'s buildings or citizens.',
  });

  /* ------------------------------------------------------------ structures */
  def('bunker', {
    name: 'Bunker', type: 'structure', cost: 2, atk: 1, hp: 6, init: 0, move: 0, icon: '🧱', art: 'bunker',
    text: 'Immobile. Build it in your city\'s sector or where you have a unit.',
  });

  /* ------------------------------------------------------------ buildings */
  def('recycling_tanks', {
    name: 'Recycling Tanks', type: 'building', cost: 2, energy: 1, icon: '♻️', art: 'solar_array',
    text: '+1 energy each turn.',
  });
  def('network_node', {
    name: 'Network Node', type: 'building', cost: 3, research: 2, icon: '🖧', art: 'thinkers_node',
    text: '+2 research each turn.',
  });
  def('perimeter_defense', {
    name: 'Perimeter Defense', type: 'building', cost: 3, hp: 6, cityAtk: 1, icon: '🏯', art: 'turret_nest',
    text: 'The city gets +6 HP and strikes 1 harder.',
  });
  def('hab_complex', {
    name: 'Hab Complex', type: 'building', cost: 3, slots: 2, icon: '🏘️', art: 'hab_dome',
    text: 'The city gets 2 more slots for buildings and citizens.',
  });

  /* ------------------------------------------------------------ populace */
  def('technician', {
    name: 'Technician', type: 'populace', cost: 1, energy: 1, icon: '🔧', art: 'field_engineer',
    text: '+1 energy each turn.',
  });
  def('scientist', {
    name: 'Scientist', type: 'populace', cost: 1, research: 1, icon: '🔬', art: 'archive_scribe',
    text: '+1 research each turn.',
  });
  def('doctor', {
    name: 'Doctor', type: 'populace', cost: 1, heals: 2, noDrones: true, icon: '⛑️', art: 'field_medic',
    text: 'The city heals 2 extra HP each turn, and riots can\'t take hold there.',
  });
  def('drone', {
    name: 'Drone', type: 'populace', cost: 0, energy: -1, icon: '😠', art: 'riot_plating', token: true,
    text: 'An unhappy citizen: -1 energy each turn, and it takes up a slot.',
  });

  /* ------------------------------------------------------------ events */
  def('orbital_strike', {
    name: 'Orbital Strike', type: 'event', cost: 5, init: 6, target: 'sector', icon: '☄️', art: 'orbital_bombardment',
    text: 'Deals 3 damage to every enemy unit in the sector and 2 to an enemy city there.',
    run(g, ctx) {
      P().unitsAt(g, ctx.sector).filter((u) => u.owner !== ctx.pid).forEach((u) => P().hurtUnit(g, u, 3, ctx.pid));
      const c = P().colonyAt(g, ctx.sector);
      if (c && c.owner !== ctx.pid) P().hurtColony(g, c, 2, ctx.pid);
    },
  });
  def('requisition', {
    name: 'Requisition', type: 'event', cost: 1, init: 9, target: null, icon: '📦', art: 'supply_drop',
    text: 'Draw 2 cards.',
    run(g, ctx) { P().draw(g, ctx.pid, 2); },
  });
  def('incite_riots', {
    name: 'Incite Riots', type: 'event', cost: 2, init: 3, target: 'enemyCity', icon: '📢', art: 'sabotage',
    text: 'Plant a Drone in an enemy city there, if it has a free slot and no Doctor.',
    run(g, ctx) {
      const c = P().colonyAt(g, ctx.sector);
      if (!c || c.owner === ctx.pid) return;
      if (c.attached.some((id) => PC[id].noDrones) || P().freeSlots(c) < 1) return P().note(g, { t: 'fizzle', pid: ctx.pid, card: 'incite_riots', sector: ctx.sector });
      c.attached.push('drone');
      P().note(g, { t: 'riot', pid: ctx.pid, victim: c.owner, colony: c.uid, name: c.name, sector: c.sector });
    },
  });

  /* ------------------------------------------------------------ faction cards */
  def('mind_worm', {
    name: 'Mind Worm Boil', type: 'unit', cost: 4, atk: 2, hp: 4, init: 3, move: 2, native: true, cityAtk: 2, faction: 'rootbound', icon: '🪱', art: 'native_mind_worm',
    text: 'Native: crosses xenofungus freely. Strikes cities 2 harder.',
  });
  def('fungal_bloom', {
    name: 'Fungal Bloom', type: 'event', cost: 2, init: 2, target: 'sector', faction: 'rootbound', icon: '🍄', art: 'fungal_bloom',
    text: 'The sector becomes xenofungus. Ground units must stop there (the Rootbound pass freely).',
    run(g, ctx) {
      const s = g.sectors[ctx.sector];
      if (s.terrain === 'core' || P().TERRAIN[s.terrain].water) return;
      s.terrain = 'fungus';
      P().note(g, { t: 'terrain', pid: ctx.pid, sector: ctx.sector, terrain: 'fungus' });
    },
  });
  def('scrap_bot', {
    name: 'Scrap Bot', type: 'unit', cost: 1, atk: 2, hp: 1, init: 2, move: 1, faction: 'ironwake', icon: '🤖', art: 'scrapbot',
    text: 'Cheap, angry, disposable.',
  });
  def('foundry', {
    name: 'Foundry', type: 'building', cost: 3, energy: 2, faction: 'ironwake', icon: '🏭', art: 'foundry',
    text: '+2 energy each turn.',
  });
  def('knowledge_archive', {
    name: 'Knowledge Archive', type: 'building', cost: 4, research: 3, faction: 'synod', icon: '📚', art: 'virtual_archive',
    text: '+3 research each turn.',
  });
  def('foil_raider', {
    name: 'Foil Raider', type: 'unit', cost: 4, atk: 2, hp: 3, init: 3, move: 3, naval: true, faction: 'tide', icon: '🚤', art: 'corsair_interceptor',
    text: 'Naval: moves through ocean as well as land.',
  });
  def('sea_colony_pod', {
    name: 'Sea Colony Pod', type: 'unit', cost: 5, atk: 0, hp: 3, init: 1, move: 2, naval: true, settler: true, seaSettler: true, faction: 'tide', icon: '⚓', art: 'smugglers_dock',
    text: 'Naval. Founds a city on land or on the open ocean.',
  });
  def('fanatic', {
    name: 'Fanatic', type: 'unit', cost: 3, atk: 3, hp: 2, init: 4, move: 1, faction: 'cinder', icon: '🔥', art: 'fanatic_charger',
    text: 'Strikes fast and hard, and doesn\'t last.',
  });
  def('energy_bank', {
    name: 'Energy Bank', type: 'building', cost: 3, energy: 2, faction: 'auric', icon: '🏦', art: 'dividend',
    text: '+2 energy each turn.',
  });
  def('hostile_takeover', {
    name: 'Hostile Takeover', type: 'event', cost: 9, init: 1, target: 'enemyCity', faction: 'auric', icon: '💼', art: 'hostile_takeover',
    text: 'Buy an enemy city that isn\'t a capital, if its owner has no units in that sector when this resolves.',
    run(g, ctx) {
      const c = P().colonyAt(g, ctx.sector);
      if (!c || c.owner === ctx.pid || c.capital || P().unitsAt(g, ctx.sector).some((u) => u.owner === c.owner)) {
        return P().note(g, { t: 'fizzle', pid: ctx.pid, card: 'hostile_takeover', sector: ctx.sector });
      }
      P().note(g, { t: 'takeover', pid: ctx.pid, from: c.owner, colony: c.uid, name: c.name, sector: c.sector });
      c.owner = ctx.pid;
    },
  });
  def('elite_commando', {
    name: 'Elite Commandos', type: 'unit', cost: 5, atk: 3, hp: 5, init: 2, move: 1, faction: 'redline', icon: '🎖️', art: 'elite_commando',
    text: 'The best soldiers on the planet.',
  });

  /* ------------------------------------------------------------ decks */
  // Every faction runs the shared core, then adds its own four cards.
  const CORE = {
    colony_pod: 3, scout_rover: 3, shock_trooper: 4, garrison: 1, needlejet: 2, former: 1, probe_team: 1, bunker: 1,
    recycling_tanks: 2, network_node: 1, perimeter_defense: 1, hab_complex: 1,
    technician: 1, scientist: 1, doctor: 1, orbital_strike: 1, requisition: 1,
  };
  const FACTION_EXTRA = {
    rootbound: { mind_worm: 2, fungal_bloom: 1, former: 1 },
    ironwake:  { scrap_bot: 2, foundry: 1, incite_riots: 1 },
    synod:     { knowledge_archive: 1, network_node: 2, scientist: 1 },
    tide:      { foil_raider: 2, sea_colony_pod: 1, requisition: 1 },
    cinder:    { fanatic: 3, incite_riots: 1 },
    auric:     { energy_bank: 1, hostile_takeover: 1, former: 1, recycling_tanks: 1 },
    redline:   { elite_commando: 2, shock_trooper: 1, bunker: 1 },
  };
  const DECKS = { DECK_SIZE: 30 };
  DECKS.deckList = function (faction) {
    const counts = Object.assign({}, CORE);
    Object.entries(FACTION_EXTRA[faction] || {}).forEach(([k, n]) => { counts[k] = (counts[k] || 0) + n; });
    const out = [];
    Object.entries(counts).forEach(([k, n]) => { for (let i = 0; i < n; i++) out.push(k); });
    return out;
  };

  V.PCARDS = PC;      // card id -> card
  V.PDECKS = DECKS;   // deck lists
})(typeof globalThis !== 'undefined' ? globalThis : this);
