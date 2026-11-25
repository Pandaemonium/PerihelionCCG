/* TAU CETI — planetary world data: lane terrain, biomes, supply pods, colony doctrines, campaign. */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});

  /* ------------------------------------------------------------ lane terrain */
  const TERRAIN = {
    fungus: {
      id: 'fungus', name: 'Xenofungus', icon: '🟣', color: '#a865e8',
      brief: 'Fungus',
      text: '<b>Cycle End:</b> Non-native units here take 1 damage. Stepdaughter and Native units heal 1 instead.',
    },
    ridge: {
      id: 'ridge', name: 'High Ridge', icon: '⛰️', color: '#c8a97e',
      brief: 'Ridge (+1 Reach)',
      text: 'Units in this lane have <b>+1 Reach</b> (can attack two lanes away).',
    },
    borehole: {
      id: 'borehole', name: 'Thermal Borehole', icon: '🌋', color: '#ff7043',
      brief: 'Borehole (+1E)',
      text: '<b>Cycle Start:</b> If you have a unit here, gain 1 Energy this turn, and your Location here takes 1 damage.',
    },
    monolith: {
      id: 'monolith', name: 'Alien Monolith', icon: '🗿', color: '#4fd1c5',
      brief: 'Monolith',
      text: '<b>Cycle End:</b> The first time each unit ends a cycle here, it gains +1/+1 and restores 2 health.',
    },
    sensor: {
      id: 'sensor', name: 'Sensor Array', icon: '📡', color: '#64b5f6',
      brief: 'Sensor (AA)',
      text: 'Units in this lane gain <b>Interceptor</b> (blocks Aerial units).',
    },
    wreck: {
      id: 'wreck', name: 'Perihelion Wreckage', icon: '🛸', color: '#90a4ae',
      brief: 'Wreckage (Guard)',
      text: 'Units in this lane gain <b>Guard</b>. Locations here take 1 less non-Psi damage (min 1).',
    },
  };

  /* ------------------------------------------------------------ map biomes */
  const BIOMES = {
    tau_ceti: {
      id: 'tau_ceti', name: 'Tau Ceti Frontier', icon: '🪐',
      desc: 'Symmetrical planetary terrain and two orbital Supply Pods on the flanks.',
      generate(rand) {
        const pool = ['fungus', 'ridge', 'borehole', 'monolith', 'sensor', 'wreck'];
        const t1 = pool[rand(pool.length)];
        let t2 = pool[rand(pool.length)];
        if (t2 === t1) t2 = pool[(pool.indexOf(t1) + 1) % pool.length];
        const lanes = Array.from({ length: 7 }, () => ({ terrain: null, pod: false }));
        lanes[1].terrain = t1;
        lanes[5].terrain = t1;
        lanes[2].terrain = t2;
        lanes[4].terrain = t2;
        lanes[0].pod = true;
        lanes[6].pod = true;
        return lanes;
      },
    },
    monsoon: {
      id: 'monsoon', name: 'Monsoon Jungle', icon: '🌿',
      desc: 'Dense Xenofungus thickets surrounding two ancient Monoliths.',
      generate() {
        const lanes = Array.from({ length: 7 }, () => ({ terrain: null, pod: false }));
        lanes[0].terrain = 'fungus'; lanes[0].pod = true;
        lanes[1].terrain = 'monolith';
        lanes[2].terrain = 'fungus';
        lanes[4].terrain = 'fungus';
        lanes[5].terrain = 'monolith';
        lanes[6].terrain = 'fungus'; lanes[6].pod = true;
        return lanes;
      },
    },
    rift: {
      id: 'rift', name: 'Geothermal Rift', icon: '🌋',
      desc: 'High Ridges overlook volatile Thermal Boreholes. Fast, lethal skirmishes.',
      generate() {
        const lanes = Array.from({ length: 7 }, () => ({ terrain: null, pod: false }));
        lanes[0].pod = true;
        lanes[1].terrain = 'borehole';
        lanes[2].terrain = 'ridge';
        lanes[4].terrain = 'ridge';
        lanes[5].terrain = 'borehole';
        lanes[6].pod = true;
        return lanes;
      },
    },
    debris: {
      id: 'debris', name: 'Perihelion Wreckage', icon: '🛸',
      desc: 'Shattered colony ship hull plating, surviving Sensor Arrays, and abundant Supply Pods.',
      generate() {
        const lanes = Array.from({ length: 7 }, () => ({ terrain: null, pod: false }));
        lanes[0].terrain = 'sensor'; lanes[0].pod = true;
        lanes[1].terrain = 'wreck';
        lanes[2].pod = true;
        lanes[4].pod = true;
        lanes[5].terrain = 'wreck';
        lanes[6].terrain = 'sensor'; lanes[6].pod = true;
        return lanes;
      },
    },
    classic: {
      id: 'classic', name: 'Uranium Flats (Classic)', icon: '🏜️',
      desc: 'Flat, featureless dust plain with no terrain modifiers or Supply Pods.',
      generate() {
        return Array.from({ length: 7 }, () => ({ terrain: null, pod: false }));
      },
    },
  };

  /* ------------------------------------------------------------ Social Engineering policies
   * `rules` holds the numbers the engine applies, so the text beside them has to be kept in step by hand:
   *   hp           change to the colony's starting Integrity
   *   cells        Energy Cells added to the opening hand
   *   cards        change to the number of cards in the opening hand
   *   research     Research the player starts with
   *   orderVuln    extra damage enemy Orders deal to the player's units, locations and colony
   *   zeal         Zeal every unit of the player has
   *   milestones   added to each Research Breakthrough threshold
   *   fungusSafe   Xenofungus does not damage the player's units
   *   fungusLanes  lanes (0-based) that start as Xenofungus, replacing the map's terrain there
   *   guardAtk     Attack a Guard unit gains when it arrives
   *   hand         change to the maximum hand size
   * The six are priced to be worth about the same: `node test/meta.js 40 1 --doctrines all` shows what each adds
   * to every preset over a deck with no doctrine at all. Re-run it after changing any of these numbers.
   */
  const DOCTRINES = {
    standard: {
      id: 'standard', name: 'Frontier', icon: '⚖️', rules: { hp: 5 },
      benefit: 'Your colony starts at 35 Integrity instead of 30.',
      drawback: 'None.',
      quote: 'We wrote the charter in orbit, before anyone had smelled the dust.',
    },
    market: {
      id: 'market', name: 'Free Market', icon: '💹', rules: { cells: 1, cards: -1 },
      benefit: 'Start with an Energy Cell in hand.',
      drawback: 'Your opening hand is one card smaller.',
      quote: 'Efficiency is merely greed that remembers to balance its ledgers.',
    },
    knowledge: {
      id: 'knowledge', name: 'Knowledge', icon: '🔬', rules: { research: 3, orderVuln: 1 },
      benefit: 'Start at 3 Research (faster Breakthroughs and Tech).',
      drawback: 'Enemy Orders deal +1 damage to your units, locations, and colony.',
      quote: 'Every open archive is a target. We leave the doors unlocked anyway.',
    },
    power: {
      id: 'power', name: 'Power', icon: '⚔️', rules: { zeal: 1, milestones: 2, cards: -1 },
      benefit: 'All your units gain Zeal 1 (+1 Attack on your turn).',
      drawback: 'Your opening hand is one card smaller, and Research Breakthroughs need +2 Research (6 / 10 / 15).',
      quote: 'Philosophy belongs to whoever is still standing at dawn.',
    },
    green: {
      id: 'green', name: 'Green', icon: '🌱', rules: { hp: -2, fungusSafe: true, fungusLanes: [1, 5] },
      benefit: 'Lanes 2 & 6 start as Xenofungus, and Xenofungus does not harm your units.',
      drawback: 'Your colony starts at 28 Integrity instead of 30.',
      quote: 'Listen to the soil before you pour concrete over it.',
    },
    police: {
      id: 'police', name: 'Police State', icon: '🛡️', rules: { guardAtk: 1, hand: -1 },
      benefit: 'Your Guard units gain +1/+0 on arrival.',
      drawback: 'Your maximum hand size is 8 instead of 9.',
      quote: 'Order is expensive. Chaos is fatal.',
    },
  };

  /* ------------------------------------------------------------ Planetary Conquest campaign */
  const CAMPAIGN = [
    {
      id: 'c1', num: 1, title: 'The First Perimeter', region: 'Rustline Basin',
      opp: 'ironwake', oppPreset: 'fortress', oppDoctrine: 'police', biome: 'debris',
      oppHp: 26,
      brief: 'Chairman Dax Ortega has barricaded the Perihelion stern section and is stripping the reactors for his Hive. Break his perimeter before his foundries drown the valley.',
      victory: 'The stern reactors fall silent. Salvage crews recover enough energy cells to push inland.',
    },
    {
      id: 'c2', num: 2, title: 'Shoals of the Privateer', region: 'Shattered Archipelago',
      opp: 'tide', oppPreset: 'raiders', oppDoctrine: 'market', biome: 'tau_ceti',
      oppHp: 28,
      brief: 'Captain Maro Quill controls the coastal supply drops. Expect aerial raiders and Needlejets bypassing your front line — secure Sensor Arrays or Interceptors.',
      victory: 'Quill’s raiders scatter into the storm clouds. The supply corridors are yours.',
    },
    {
      id: 'c3', num: 3, title: 'Sermon of the Wreckage', region: 'Cinder Wastes',
      opp: 'cinder', oppPreset: 'crusade', oppDoctrine: 'power', biome: 'rift',
      oppHp: 30,
      brief: 'Sister Mara Solis preaches that the ship’s science brought ruin. Her Believers hit brutally hard on the offensive — weather the storm and strike back while they are exposed.',
      victory: 'The pyres dim across the rift. Even the faithful cannot argue with an unbroken line.',
    },
    {
      id: 'c4', num: 4, title: 'Hostile Acquisition', region: 'Meridian Terrace',
      opp: 'auric', oppPreset: 'overcharge', oppDoctrine: 'market', biome: 'rift',
      oppHp: 30,
      brief: 'CEO Kofi Vance has tapped the Thermal Boreholes to bank huge reserves of Energy. Raid his economic Locations before his Overcharged mercenaries overwhelm you.',
      victory: 'The Vance vaults open. CEO Vance signs a temporary truce — and bills you for the ink.',
    },
    {
      id: 'c5', num: 5, title: 'The Flank at Redline', region: 'Twin Ridges',
      opp: 'redline', oppPreset: 'maneuver', oppDoctrine: 'power', biome: 'tau_ceti',
      oppHp: 32,
      brief: 'Colonel Soren Kade’s veterans dominate the High Ridges with Mobile flankers and precision artillery. Deny them Monoliths and punish isolated units.',
      victory: 'Colonel Kade salutes from the burning Command Center. The ridge line belongs to your banners.',
    },
    {
      id: 'c6', num: 6, title: 'The Open Datalinks', region: 'Lumen Spire',
      opp: 'synod', oppPreset: 'transcend', oppDoctrine: 'knowledge', biome: 'debris',
      oppHp: 32,
      brief: 'Academician Thessaly Vane is racing toward The Voice of Planet and 22 Research. Shut down her Network Nodes and raze her Secret Projects before she achieves Transcendence.',
      victory: 'The Spire’s relays cool. Inside the memory cores lies something older than humanity.',
    },
    {
      id: 'c7', num: 7, title: 'The Voice of Planet', region: 'Heart of the Mycelium',
      opp: 'rootbound', oppPreset: 'fungal', oppDoctrine: 'green', biome: 'monsoon',
      oppHp: 35,
      bossName: 'The Planetmind', bossArt: '🧠',
      bossFlavor: 'The world beneath the spores has learned to speak with human voices.',
      brief: 'Planet’s neural web has awakened inside the Monsoon Jungle. Psi-born Mind Worms and surging Xenofungus ignore Armor and Shields alike. End the bloom — or transcend it.',
      victory: 'Silence settles over the fungal sea. Planet no longer fights your colony; it listens. Tau Ceti is yours.',
    },
  ];

  V.TERRAIN = TERRAIN;
  V.BIOMES = BIOMES;
  V.DOCTRINES = DOCTRINES;
  V.CAMPAIGN = CAMPAIGN;
})(typeof globalThis !== 'undefined' ? globalThis : this);
