/* TAU CETI — Planet Mode rules engine (prototype, phase A: cards). Seven factions share one radial
 * map, and everyone acts at once: all orders are collected, then P.resolve() carries them out together.
 * Same house rules as engine.js: no DOM access, plain-JSON state, all rules randomness from g.seed.
 * Cards are defined in planet_cards.js (V.PCARDS); the state only ever stores card ids.
 *
 * Map: rings of P.RINGS sectors (outermost first) around a single core sector. Sector ids run
 * ring by ring from 0; the core is the last id. A sector touches its ring neighbours (rings wrap)
 * and any sector in the next ring in or out whose arc overlaps its own.
 *
 * Sector capacity: at most P.CAPACITY cards (cities + units, every player's together). A unit may
 * move into a full sector only as an assault, i.e. into a sector that holds enemy cards, and even
 * then each player can bring at most P.CAPACITY of their own. A winner can be left over capacity
 * after a battle; nothing more gets in until it drops back.
 *
 * Orders, one object per player:
 *   landfall phase:  { land: sectorId }
 *   orders phase:    { moves: { unitUid: sectorId }, plays: [{ hand: handCardUid, sector }],
 *                      found: [unitUid], scrap: [handCardUid] }
 * Every play is face down until the reveal. A pod listed in `found` founds a city where it ends
 * the turn, if it can. Scrapped cards are discarded for P.SCRAP_ENERGY each, before plays are paid.
 *
 * Resolution, in order:
 *   1. reveal: scraps pay out, then plays are checked against the board as it stood and paid for
 *   2. movement, fastest initiative first
 *   3. events, fastest initiative first
 *   4. battles in every sector with two or more players, then captures
 *   5. founding, then deployment of played units, structures, buildings and citizens
 *      (a deployment that no longer fits goes back to its owner's hand with a refund)
 *   6. spies and terraformers act; income, healing; everyone draws
 *   7. eliminations and the victory check
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const PC = V.PCARDS;

  const P = {};
  P.RINGS = [21, 14, 7];
  P.CLOCK = 20;              // the singularity: the game ends after this turn
  P.CAPACITY = 4;            // cards per sector, all players together
  P.CAPITAL_HP = 8;
  P.COLONY_HP = 8;
  P.CAPTURE_HP = 4;
  P.CONQUEST_CAPITALS = 3;   // hold this many capitals (your own included) for a conquest win. 3 and
                             // 8-HP capitals gave ~1 conquest in 4 games in test/planet_sim.js; 4 gave ~1 in 25.
  P.START_ENERGY = 3;
  P.HAND_START = 5;
  P.DRAW = 3;                // cards drawn each turn. 3 spread faction win rates over 11-20% in the sim, 2 over 7-22%
  P.HAND_MAX = 8;            // no draws past this
  P.SCRAP_ENERGY = 1;        // energy for discarding a card from hand: keeps dead cards from clogging it
  P.EVENT_RANGE = 2;         // events reach this many sectors from your units and cities
  P.CITY_SLOTS = 2;          // slots for buildings and citizens; capitals get one more
  P.LANDING_RINGS = [0, 1];  // rings a colony may land in on turn 0
  P.TECH = [
    { at: 8, id: 'flight', name: 'Doctrine: Flight', text: 'Unlocks the Needlejet.' },
    { at: 16, id: 'graviton', name: 'Graviton Boost', text: 'Your aircraft get +2 initiative.' },
  ];

  P.TERRAIN = {
    plains:   { id: 'plains', name: 'Silt Plains', icon: '', color: '#56653f', energy: 2, research: 0, text: '' },
    garden:   { id: 'garden', name: 'Fertile Basin', icon: '🌾', color: '#3f9a4a', energy: 3, research: 1, text: 'Rich land.' },
    fungus:   { id: 'fungus', name: 'Xenofungus', icon: '🟣', color: '#7d45c0', energy: 0, research: 2, slow: true,
      text: 'Ground units must stop here (natives and the Rootbound pass freely).' },
    ridge:    { id: 'ridge', name: 'High Ridge', icon: '⛰️', color: '#93784f', energy: 1, research: 0, high: true,
      text: 'Units that hold here strike 1 initiative sooner. Cities here are tougher.' },
    desert:   { id: 'desert', name: 'Dust Barrens', icon: '🏜️', color: '#7c6c45', energy: 1, research: 0, text: 'Poor land.' },
    borehole: { id: 'borehole', name: 'Thermal Borehole', icon: '🌋', color: '#c45632', energy: 4, research: 0, text: 'Rich in energy.' },
    monolith: { id: 'monolith', name: 'Alien Monolith', icon: '🗿', color: '#34a39a', energy: 1, research: 3, heal: true,
      text: 'Units here heal fully each turn.' },
    ocean:    { id: 'ocean', name: 'Ocean', icon: '🌊', color: '#173f63', energy: 1, research: 0, water: true,
      text: 'Only aircraft and naval units can enter. Only sea pods can settle it.' },
    core:     { id: 'core', name: "Planet's Heart", icon: '🌀', color: '#a548b8', energy: 2, research: 3,
      text: 'Holding it is worth 8 points when the singularity comes.' },
  };
  // 42 ring sectors: how many of each terrain.
  const TERRAIN_BAG = { ocean: 8, desert: 6, ridge: 5, fungus: 7, plains: 9, garden: 3, borehole: 2, monolith: 2 };

  const BASE_NAMES = ['Landing', 'Second', 'Haven', 'Reach', 'Hold', 'Spire', 'Watch', 'Deep', 'Crossing', 'Rise'];

  /* ------------------------------------------------------------ randomness */
  function rngFrom(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  P.rngFrom = rngFrom;
  function rnd(g) {
    g.seed = (g.seed + 0x6d2b79f5) | 0;
    let t = g.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(r, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function ev(g, e) { g.events.push(e); }

  /* ------------------------------------------------------------ map */
  function buildSectors() {
    const sectors = [];
    P.RINGS.forEach((n, ring) => {
      for (let idx = 0; idx < n; idx++) sectors.push({ id: sectors.length, ring, idx, terrain: 'plains', adj: [] });
    });
    const core = { id: sectors.length, ring: P.RINGS.length, idx: 0, terrain: 'core', adj: [] };
    sectors.push(core);
    const link = (a, b) => { if (!a.adj.includes(b.id)) { a.adj.push(b.id); b.adj.push(a.id); } };
    const inRing = (r) => sectors.filter((s) => s.ring === r);
    P.RINGS.forEach((n, r) => {
      const ring = inRing(r);
      ring.forEach((s) => link(s, ring[(s.idx + 1) % n]));
      if (r + 1 < P.RINGS.length) {
        const m = P.RINGS[r + 1];
        inRing(r + 1).forEach((t) => ring.forEach((s) => {
          const overlap = Math.min((s.idx + 1) / n, (t.idx + 1) / m) - Math.max(s.idx / n, t.idx / m);
          if (overlap > 1e-9) link(s, t);
        }));
      } else ring.forEach((s) => link(s, core));
    });
    return sectors;
  }

  function landConnected(sectors) {
    const land = sectors.filter((s) => !P.TERRAIN[s.terrain].water);
    const seen = new Set([land[0].id]);
    const q = [land[0].id];
    while (q.length) {
      const s = sectors[q.shift()];
      s.adj.forEach((a) => {
        if (!seen.has(a) && !P.TERRAIN[sectors[a].terrain].water) { seen.add(a); q.push(a); }
      });
    }
    return seen.size === land.length;
  }

  function generateMap(seed) {
    const r = rngFrom(seed ^ 0x5eed);
    for (let attempt = 0; attempt < 200; attempt++) {
      const sectors = buildSectors();
      const ringSectors = sectors.filter((s) => s.terrain !== 'core');
      // Oceans: favour the outer ring and cluster next to other ocean.
      const free = new Set(ringSectors.map((s) => s.id));
      for (let k = 0; k < TERRAIN_BAG.ocean; k++) {
        const opts = [...free].map((id) => {
          const s = sectors[id];
          let w = [3, 1.2, 0.3][s.ring];
          if (s.adj.some((a) => sectors[a].terrain === 'ocean')) w *= 3;
          return { id, w };
        });
        let pick = r() * opts.reduce((t, o) => t + o.w, 0);
        const o = opts.find((x) => (pick -= x.w) <= 0) || opts[opts.length - 1];
        sectors[o.id].terrain = 'ocean';
        free.delete(o.id);
      }
      // Monoliths sit in the inner rings.
      const inner = shuffle(r, [...free].filter((id) => sectors[id].ring >= 1));
      for (let k = 0; k < TERRAIN_BAG.monolith; k++) { sectors[inner[k]].terrain = 'monolith'; free.delete(inner[k]); }
      const rest = [];
      Object.keys(TERRAIN_BAG).forEach((t) => {
        if (t === 'ocean' || t === 'monolith') return;
        for (let k = 0; k < TERRAIN_BAG[t]; k++) rest.push(t);
      });
      shuffle(r, rest);
      [...free].forEach((id, i) => { sectors[id].terrain = rest[i]; });
      const landable = sectors.filter((s) => P.LANDING_RINGS.includes(s.ring) && !P.TERRAIN[s.terrain].water);
      if (landConnected(sectors) && landable.length >= 16) return sectors;
    }
    throw new Error('Planet: could not generate a connected map');
  }

  /* Distances between sectors, by unit kind. Cached outside the state, keyed by map. */
  const distCache = {};
  P.dist = function (g, air) {
    const key = g.mapKey + (air ? 'a' : 'g');
    if (distCache[key]) return distCache[key];
    const n = g.sectors.length;
    const D = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(n).fill(99);
      row[i] = 0;
      const q = [i];
      while (q.length) {
        const s = q.shift();
        g.sectors[s].adj.forEach((a) => {
          if (row[a] !== 99) return;
          if (!air && P.TERRAIN[g.sectors[a].terrain].water) return;
          row[a] = row[s] + 1;
          q.push(a);
        });
      }
      D.push(row);
    }
    distCache[key] = D;
    return D;
  };

  /* ------------------------------------------------------------ lookups */
  P.card = (id) => PC[id];
  P.def = (u) => PC[u.card];
  P.unitsAt = (g, sid) => g.units.filter((u) => u.sector === sid);
  P.colonyAt = (g, sid) => g.colonies.find((c) => c.sector === sid) || null;
  P.findUnit = (g, uid) => g.units.find((u) => u.uid === uid) || null;
  P.findColony = (g, uid) => g.colonies.find((c) => c.uid === uid) || null;
  P.coloniesOf = (g, pid) => g.colonies.filter((c) => c.owner === pid);
  P.unitsOf = (g, pid) => g.units.filter((u) => u.owner === pid);
  P.cardsIn = (g, sid) => P.unitsAt(g, sid).length + (P.colonyAt(g, sid) ? 1 : 0);
  P.hasTech = (g, pid, id) => {
    const t = P.TECH.find((x) => x.id === id);
    return !!t && g.players[pid].research >= t.at;
  };
  P.canLand = (g, sid) => {
    const s = g.sectors[sid];
    return !!s && P.LANDING_RINGS.includes(s.ring) && !P.TERRAIN[s.terrain].water;
  };
  P.canFoundAt = (g, sid, u) => {
    if (P.colonyAt(g, sid)) return false;
    const water = P.TERRAIN[g.sectors[sid].terrain].water;
    return !water || !!(u && P.def(u).seaSettler);
  };
  /** Does pid have anything in sector sid other than its own cards? */
  P.hostileTo = (g, pid, sid) => P.unitsAt(g, sid).some((x) => x.owner !== pid) ||
    !!(P.colonyAt(g, sid) && P.colonyAt(g, sid).owner !== pid);

  /* ------------------------------------------------------------ cities */
  P.slots = (c) => P.CITY_SLOTS + (c.capital ? 1 : 0) +
    c.attached.reduce((a, id) => a + (PC[id].slots || 0), 0);
  P.freeSlots = (c) => P.slots(c) - c.attached.length;
  P.cityAtk = (c) => (c.capital ? 2 : 1) + c.attached.reduce((a, id) => a + (PC[id].cityAtk || 0), 0);
  P.maxHp = (c) => c.baseHp + c.attached.reduce((a, id) => a + (PC[id].hp || 0), 0);

  P.initiative = function (g, u) {
    const d = P.def(u);
    let n = d.init;
    if (d.air && P.hasTech(g, u.owner, 'graviton')) n += 2;
    // Holding the high ground lets defenders strike first. Holding elsewhere gives no edge:
    // with a stack cap, a universal hold bonus made full garrisons impossible to break.
    if (u.dug && P.TERRAIN[g.sectors[u.sector].terrain].high) n += 1;
    return n;
  };

  P.income = function (g, pid) {
    let energy = 0, research = 0;
    P.coloniesOf(g, pid).forEach((c) => {
      const t = P.TERRAIN[g.sectors[c.sector].terrain];
      energy += 1 + t.energy + (c.capital && c.founder === pid ? 2 : 0);
      research += 1 + t.research;
      c.attached.forEach((id) => { energy += PC[id].energy || 0; research += PC[id].research || 0; });
    });
    return { energy: Math.max(0, energy), research };
  };

  /** Who controls a sector: the city's owner, else the only player with units there, else -1. */
  P.controller = function (g, sid) {
    const c = P.colonyAt(g, sid);
    if (c) return c.owner;
    const owners = new Set(P.unitsAt(g, sid).map((u) => u.owner));
    return owners.size === 1 ? [...owners][0] : -1;
  };

  P.score = function (g, pid) {
    const p = g.players[pid];
    const cols = P.coloniesOf(g, pid);
    let sectors = 0;
    g.sectors.forEach((s) => { if (P.controller(g, s.id) === pid) sectors++; });
    const coreHeld = P.controller(g, g.sectors.length - 1) === pid ? 8 : 0;
    return p.research + 6 * cols.length + 4 * cols.filter((c) => c.capital).length + sectors + coreHeld;
  };

  /* ------------------------------------------------------------ movement */
  /** Sectors a unit could end its move in this turn (not counting staying put). A sector that's
   * full and holds no enemy is left out; you can only push into a full sector as an assault. */
  P.legalMoves = function (g, u) {
    const d = P.def(u);
    if (!d.move) return [];
    const freeOfFungus = d.air || d.native || g.players[u.owner].faction === 'rootbound';
    const canEnter = (sid) => {
      const water = P.TERRAIN[g.sectors[sid].terrain].water;
      return !water || d.air || d.naval;
    };
    const best = {};
    best[u.sector] = 0;
    const q = [u.sector];
    const out = [];
    while (q.length) {
      const s = q.shift();
      const steps = best[s];
      if (steps >= d.move) continue;
      if (s !== u.sector) {
        if (P.hostileTo(g, u.owner, s)) continue; // you may enter an enemy-held sector but not pass through it
        if (!freeOfFungus && P.TERRAIN[g.sectors[s].terrain].slow) continue;
      }
      g.sectors[s].adj.forEach((a) => {
        if (best[a] != null || !canEnter(a)) return;
        best[a] = steps + 1;
        q.push(a);
        if (P.hostileTo(g, u.owner, a) || P.cardsIn(g, a) < P.CAPACITY) out.push(a);
      });
    }
    return out;
  };

  /* ------------------------------------------------------------ playing cards */
  function inEventRange(g, pid, sid) {
    const D = P.dist(g, true);
    return g.units.some((u) => u.owner === pid && D[u.sector][sid] <= P.EVENT_RANGE) ||
      g.colonies.some((c) => c.owner === pid && D[c.sector][sid] <= P.EVENT_RANGE);
  }

  /** Can pid play card `id` at sector `sid` on the board as it stands? (Hand and energy aside.)
   * `reserved` counts attachments already promised to each city this turn. */
  P.canPlayAt = function (g, pid, id, sid, reserved) {
    const d = PC[id];
    if (!d || d.token) return false;
    if (d.faction && d.faction !== g.players[pid].faction) return false;
    if (d.tech && !P.hasTech(g, pid, d.tech)) return false;
    if (d.type === 'event' && !d.target) return sid == null;
    if (sid == null || !g.sectors[sid]) return false;
    const col = P.colonyAt(g, sid);
    switch (d.type) {
      case 'unit':
        return !!col && col.owner === pid;
      case 'structure':
        if (P.TERRAIN[g.sectors[sid].terrain].water) return false;
        return (!!col && col.owner === pid) || P.unitsAt(g, sid).some((u) => u.owner === pid);
      case 'building':
      case 'populace':
        if (!col || col.owner !== pid) return false;
        // A building that adds slots fits even in a full city; otherwise it could never be played.
        return !!d.slots || P.freeSlots(col) - ((reserved && reserved[col.uid]) || 0) > 0;
      case 'event':
        if (!inEventRange(g, pid, sid)) return false;
        if (d.target === 'enemyCity') return !!col && col.owner !== pid;
        return true;
      default:
        return false;
    }
  };

  /** Where pid could play card `id`: a list of sector ids, or null for an untargeted event. */
  P.playTargets = function (g, pid, id) {
    const d = PC[id];
    if (d.type === 'event' && !d.target) return P.canPlayAt(g, pid, id, null) ? null : [];
    return g.sectors.filter((s) => P.canPlayAt(g, pid, id, s.id)).map((s) => s.id);
  };

  P.draw = function (g, pid, n) {
    const p = g.players[pid];
    for (let i = 0; i < n; i++) {
      if (p.hand.length >= P.HAND_MAX) return;
      if (!p.deck.length) {
        if (!p.discard.length) return;
        p.deck = shuffle(() => rnd(g), p.discard);
        p.discard = [];
        ev(g, { t: 'reshuffle', pid });
      }
      p.hand.push({ uid: g.nextUid++, id: p.deck.pop() });
    }
  };

  /* ------------------------------------------------------------ damage (also used by card effects) */
  P.note = ev;
  P.hurtUnit = function (g, u, n, src) {
    u.hp -= n;
    ev(g, { t: 'hit', sector: u.sector, pid: src, kind: 'u', target: u.uid, n });
  };
  P.hurtColony = function (g, c, n, src) {
    c.hp -= n;
    ev(g, { t: 'hit', sector: c.sector, pid: src, kind: 'c', target: c.uid, n });
  };
  function removeDead(g) {
    g.units.slice().forEach((u) => {
      if (u.hp > 0) return;
      g.units.splice(g.units.indexOf(u), 1);
      g.stats.killed++;
      if (!PC[u.card].token) g.players[u.owner].discard.push(u.card);
      ev(g, { t: 'death', sector: u.sector, pid: u.owner, uid: u.uid, card: u.card });
    });
  }

  /* ------------------------------------------------------------ setup */
  P.newGame = function (opts) {
    opts = opts || {};
    const seed = (opts.seed == null ? 12345 : opts.seed) | 0;
    const factions = opts.factions || Object.keys(V.FACTIONS);
    const sectors = generateMap(seed);
    const g = {
      mode: 'planet', seed, mapKey: 'm' + seed, turn: 0, phase: 'landfall',
      sectors, nextUid: 1, units: [], colonies: [], events: [], result: null,
      players: factions.map((f, pid) => ({
        pid, faction: f, energy: P.START_ENERGY, research: 0, alive: true, elimTurn: null,
        human: (opts.humans || []).includes(pid), basesFounded: 0,
        deck: V.PDECKS.deckList(f), hand: [], discard: [],
      })),
      stats: { collisions: 0, captures: 0, razed: 0, founded: 0, battles: 0, played: 0, scrapped: 0, bounced: 0, killed: 0, takeovers: 0 },
    };
    g.players.forEach((p) => { shuffle(() => rnd(g), p.deck); P.draw(g, p.pid, P.HAND_START); });
    g.events = [];
    return g;
  };

  function addUnit(g, pid, card, sid) {
    const u = { uid: g.nextUid++, card, owner: pid, sector: sid, hp: PC[card].hp, dug: false, work: 0 };
    g.units.push(u);
    return u;
  }
  function addColony(g, pid, sid, capital) {
    const p = g.players[pid];
    const fname = V.FACTIONS[p.faction].name.replace(/^The /, '').split(' ')[0];
    const hp = (capital ? P.CAPITAL_HP : P.COLONY_HP) + (P.TERRAIN[g.sectors[sid].terrain].high ? 4 : 0);
    const c = {
      uid: g.nextUid++, owner: pid, founder: pid, sector: sid, hp, baseHp: hp, capital: !!capital, attached: [],
      name: `${fname} ${BASE_NAMES[p.basesFounded % BASE_NAMES.length]}`,
    };
    p.basesFounded++;
    g.colonies.push(c);
    return c;
  }

  /** Turn 0. choices[pid] = sectorId. Ties for one sector go to a random winner; the rest scatter. */
  P.landfall = function (g, choices) {
    if (g.phase !== 'landfall') throw new Error('not the landfall phase');
    g.events = [];
    const r = () => rnd(g);
    const D = P.dist(g, true);
    const want = {};
    g.players.forEach((p) => {
      let sid = choices[p.pid];
      if (sid == null || !P.canLand(g, sid)) {
        const opts = g.sectors.filter((s) => P.canLand(g, s.id));
        sid = opts[Math.floor(r() * opts.length)].id;
      }
      (want[sid] = want[sid] || []).push(p.pid);
    });
    const losers = [];
    Object.keys(want).map(Number).forEach((sid) => {
      const pids = shuffle(r, want[sid].slice());
      addColony(g, pids[0], sid, true);
      ev(g, { t: 'land', pid: pids[0], sector: sid, contested: pids.length > 1 });
      if (pids.length > 1) {
        g.stats.collisions++;
        pids.slice(1).forEach((pid) => losers.push({ pid, from: sid }));
      }
    });
    shuffle(r, losers).forEach(({ pid, from }) => {
      const free = g.sectors.filter((s) => P.canLand(g, s.id) && !P.colonyAt(g, s.id));
      const near = Math.min(...free.map((s) => D[from][s.id]));
      const opts = free.filter((s) => D[from][s.id] === near);
      const sid = opts[Math.floor(r() * opts.length)].id;
      addColony(g, pid, sid, true);
      ev(g, { t: 'scatter', pid, from, sector: sid });
    });
    g.colonies.forEach((c) => addUnit(g, c.owner, 'scout_rover', c.sector));
    g.phase = 'orders';
    g.turn = 1;
  };

  /* ------------------------------------------------------------ resolution */
  P.resolve = function (g, orders) {
    if (g.phase !== 'orders') throw new Error('not the orders phase');
    g.events = [];
    const r = () => rnd(g);
    const alive = g.players.filter((p) => p.alive);
    const ord = (pid) => orders[pid] || {};

    // 1. Reveal and pay. Scraps first, so their energy can pay for this turn's plays. Plays are
    // judged on the board as it stood.
    alive.forEach((p) => {
      (ord(p.pid).scrap || []).forEach((uid) => {
        const h = p.hand.find((x) => x.uid === uid);
        if (!h || (ord(p.pid).plays || []).some((pl) => pl.hand === uid)) return;
        p.hand.splice(p.hand.indexOf(h), 1);
        p.discard.push(h.id);
        p.energy += P.SCRAP_ENERGY;
        g.stats.scrapped++;
        ev(g, { t: 'scrap', pid: p.pid, card: h.id });
      });
    });
    const pending = [];
    alive.forEach((p) => {
      const reserved = {};
      (ord(p.pid).plays || []).forEach((pl) => {
        const h = p.hand.find((x) => x.uid === pl.hand);
        if (!h) return;
        const d = PC[h.id];
        const sid = d.type === 'event' && !d.target ? null : pl.sector;
        if (p.energy < d.cost || !P.canPlayAt(g, p.pid, h.id, sid, reserved)) return;
        if (d.type === 'building' || d.type === 'populace') {
          const c = P.colonyAt(g, sid);
          reserved[c.uid] = (reserved[c.uid] || 0) + 1;
        }
        p.energy -= d.cost;
        p.hand.splice(p.hand.indexOf(h), 1);
        pending.push({ pid: p.pid, card: h.id, sector: sid, hand: h.uid });
        g.stats.played++;
        ev(g, { t: 'reveal', pid: p.pid, card: h.id, sector: sid });
      });
    });

    // 2. Movement, fastest initiative first. Legality is judged on the board as it stood; a
    // peaceful move into a sector that has filled up in the meantime doesn't happen.
    const moves = [];
    alive.forEach((p) => {
      const m = ord(p.pid).moves || {};
      Object.keys(m).forEach((k) => {
        const u = P.findUnit(g, +k);
        const dest = m[k];
        if (!u || u.owner !== p.pid || dest === u.sector) return;
        if (!P.legalMoves(g, u).includes(dest)) return;
        const d = P.def(u);
        moves.push({ u, from: u.sector, dest, init: d.init + (d.air && P.hasTech(g, p.pid, 'graviton') ? 2 : 0) });
      });
    });
    const moved = new Set();
    [...new Set(moves.map((m) => m.init))].sort((a, b) => b - a).forEach((init) => {
      shuffle(r, moves.filter((m) => m.init === init)).forEach((m) => {
        const full = P.hostileTo(g, m.u.owner, m.dest)
          ? P.unitsAt(g, m.dest).filter((x) => x.owner === m.u.owner).length >= P.CAPACITY
          : P.cardsIn(g, m.dest) >= P.CAPACITY;
        if (full) {
          ev(g, { t: 'blocked', uid: m.u.uid, pid: m.u.owner, from: m.from, to: m.dest });
          return;
        }
        m.u.sector = m.dest;
        moved.add(m.u.uid);
        ev(g, { t: 'move', uid: m.u.uid, pid: m.u.owner, from: m.from, to: m.dest, init });
      });
    });
    g.units.forEach((u) => { u.dug = !moved.has(u.uid); });

    // 3. Events, fastest first.
    const events = shuffle(r, pending.filter((x) => PC[x.card].type === 'event'));
    events.sort((a, b) => PC[b.card].init - PC[a.card].init);
    events.forEach((x) => {
      ev(g, { t: 'event', pid: x.pid, card: x.card, sector: x.sector });
      PC[x.card].run(g, { pid: x.pid, sector: x.sector });
      g.players[x.pid].discard.push(x.card);
      removeDead(g);
    });

    // 4. Battles, then captures.
    g.sectors.forEach((s) => battle(g, s.id, r));
    g.colonies.slice().forEach((c) => {
      if (c.hp > 0) return;
      const attackers = [...new Set(P.unitsAt(g, c.sector).filter((u) => u.owner !== c.owner).map((u) => u.owner))];
      if (attackers.length === 1) {
        ev(g, { t: 'capture', colony: c.uid, name: c.name, from: c.owner, pid: attackers[0], sector: c.sector, capital: c.capital });
        c.owner = attackers[0];
        c.hp = Math.min(P.CAPTURE_HP, P.maxHp(c));
        g.stats.captures++;
      } else if (attackers.length > 1) {
        ev(g, { t: 'razed', colony: c.uid, name: c.name, from: c.owner, sector: c.sector, capital: c.capital });
        g.colonies.splice(g.colonies.indexOf(c), 1);
        g.stats.razed++;
      } else c.hp = 1;
    });

    // 5. Founding, then deployment.
    alive.forEach((p) => {
      (ord(p.pid).found || []).forEach((uid) => {
        const u = P.findUnit(g, uid);
        if (!u || u.owner !== p.pid || !P.def(u).settler) return;
        if (!P.canFoundAt(g, u.sector, u)) return;
        if (P.unitsAt(g, u.sector).some((x) => x.owner !== p.pid)) return;
        g.units.splice(g.units.indexOf(u), 1);
        p.discard.push(u.card);
        const c = addColony(g, p.pid, u.sector, false);
        g.stats.founded++;
        ev(g, { t: 'found', pid: p.pid, colony: c.uid, name: c.name, sector: c.sector });
      });
    });
    shuffle(r, pending.filter((x) => PC[x.card].type !== 'event')).forEach((x) => {
      const d = PC[x.card];
      const p = g.players[x.pid];
      const col = P.colonyAt(g, x.sector);
      let ok;
      if (d.type === 'unit') ok = col && col.owner === x.pid && P.cardsIn(g, x.sector) < P.CAPACITY;
      else if (d.type === 'structure') {
        ok = P.cardsIn(g, x.sector) < P.CAPACITY && ((col && col.owner === x.pid) || P.unitsAt(g, x.sector).some((u) => u.owner === x.pid)) &&
          !P.hostileTo(g, x.pid, x.sector);
      } else ok = col && col.owner === x.pid && (d.slots || P.freeSlots(col) > 0);
      if (!ok) {
        p.energy += d.cost;
        p.hand.push({ uid: x.hand, id: x.card });
        g.stats.bounced++;
        ev(g, { t: 'bounced', pid: x.pid, card: x.card, sector: x.sector });
        return;
      }
      if (d.type === 'unit' || d.type === 'structure') {
        const u = addUnit(g, x.pid, x.card, x.sector);
        ev(g, { t: 'deploy', pid: x.pid, uid: u.uid, card: x.card, sector: x.sector });
      } else {
        col.attached.push(x.card);
        if (d.hp) col.hp += d.hp;
        ev(g, { t: 'attach', pid: x.pid, colony: col.uid, card: x.card, sector: x.sector });
      }
    });

    // 6. Spies and terraformers, income, healing, draws.
    g.units.forEach((u) => {
      const d = P.def(u);
      if (d.probe) {
        const c = P.colonyAt(g, u.sector);
        const wreckable = c && c.owner !== u.owner ? c.attached.filter((id) => !PC[id].token) : [];
        if (wreckable.length) {
          const id = wreckable[Math.floor(r() * wreckable.length)];
          c.attached.splice(c.attached.indexOf(id), 1);
          g.players[c.owner].discard.push(id);
          ev(g, { t: 'sabotage', pid: u.owner, victim: c.owner, card: id, name: c.name, sector: c.sector });
          // Losing a Hab Complex can leave more attachments than slots: the newest ones go.
          while (P.freeSlots(c) < 0) {
            const lost = c.attached.pop();
            if (!PC[lost].token) g.players[c.owner].discard.push(lost);
            ev(g, { t: 'sabotage', pid: u.owner, victim: c.owner, card: lost, name: c.name, sector: c.sector });
          }
          c.hp = Math.min(c.hp, P.maxHp(c));
        }
      }
      if (d.former) {
        if (!u.dug || P.hostileTo(g, u.owner, u.sector)) { u.work = 0; return; }
        u.work++;
        const s = g.sectors[u.sector];
        const next = { desert: 'plains', fungus: 'plains', plains: 'garden' }[s.terrain];
        if (u.work >= 2 && next) {
          s.terrain = next;
          u.work = 0;
          ev(g, { t: 'terrain', pid: u.owner, sector: s.id, terrain: next });
        }
      }
    });
    alive.forEach((p) => {
      const inc = P.income(g, p.pid);
      const before = p.research;
      p.energy += inc.energy;
      p.research += inc.research;
      P.TECH.forEach((t) => { if (before < t.at && p.research >= t.at) ev(g, { t: 'tech', pid: p.pid, tech: t.id, name: t.name }); });
    });
    g.colonies.forEach((c) => {
      if (P.hostileTo(g, c.owner, c.sector)) return;
      const extra = c.attached.reduce((a, id) => a + (PC[id].heals || 0), 0);
      c.hp = Math.min(P.maxHp(c), c.hp + 1 + extra);
    });
    g.units.forEach((u) => {
      if (P.hostileTo(g, u.owner, u.sector)) return;
      const max = P.def(u).hp;
      const c = P.colonyAt(g, u.sector);
      if (P.TERRAIN[g.sectors[u.sector].terrain].heal) u.hp = max;
      else if (c && c.owner === u.owner) u.hp = Math.min(max, u.hp + 2);
      else u.hp = Math.min(max, u.hp + 1);
    });
    alive.forEach((p) => P.draw(g, p.pid, P.DRAW));

    // 7. Eliminations: no cities left means you're out.
    alive.forEach((p) => {
      if (P.coloniesOf(g, p.pid).length) return;
      p.alive = false;
      p.elimTurn = g.turn;
      g.units = g.units.filter((u) => u.owner !== p.pid);
      ev(g, { t: 'eliminated', pid: p.pid });
    });
    checkVictory(g);
    if (!g.result) g.turn++;
  };

  function battle(g, sid, r) {
    const units = P.unitsAt(g, sid);
    const col = P.colonyAt(g, sid);
    const owners = new Set(units.map((u) => u.owner));
    if (col) owners.add(col.owner);
    if (owners.size < 2) return;
    g.stats.battles++;
    ev(g, { t: 'battle', sector: sid, pids: [...owners] });
    const fighters = units.map((u) => ({ kind: 'u', ref: u, owner: u.owner, atk: P.def(u).atk, cityAtk: P.def(u).cityAtk || 0, init: P.initiative(g, u) }));
    if (col) fighters.push({ kind: 'c', ref: col, owner: col.owner, atk: P.cityAtk(col), cityAtk: 0, init: 0 });
    const tiers = [...new Set(fighters.map((f) => f.init))].sort((a, b) => b - a);
    tiers.forEach((init) => {
      const pending = new Map();
      const strikers = shuffle(r, fighters.filter((f) => f.init === init && f.atk > 0 && f.ref.hp > 0));
      const hits = [];
      strikers.forEach((f) => {
        const foes = g.units.filter((u) => u.sector === sid && u.owner !== f.owner && u.hp > 0);
        const left = (u) => u.hp - (pending.get(u.uid) || 0);
        const live = foes.filter((u) => left(u) > 0);
        if (live.length) {
          // Prefer a kill on the most valuable unit; otherwise wear down the weakest.
          const kills = live.filter((u) => left(u) <= f.atk).sort((a, b) => P.def(b).cost - P.def(a).cost);
          const target = kills[0] || live.sort((a, b) => left(a) - left(b))[0];
          pending.set(target.uid, (pending.get(target.uid) || 0) + f.atk);
          hits.push({ f, kind: 'u', target, n: f.atk });
        } else if (f.kind === 'u' && col && col.owner !== f.owner && col.hp > 0) {
          hits.push({ f, kind: 'c', target: col, n: f.atk + f.cityAtk });
        }
      });
      hits.forEach((h) => {
        if (h.kind === 'u') P.hurtUnit(g, h.target, h.n, h.f.owner);
        else P.hurtColony(g, h.target, h.n, h.f.owner);
      });
      removeDead(g);
    });
  }

  function checkVictory(g) {
    const alive = g.players.filter((p) => p.alive);
    let winner = null, kind = null;
    if (alive.length === 1) { winner = alive[0].pid; kind = 'conquest'; }
    if (winner == null) {
      alive.forEach((p) => {
        const caps = P.coloniesOf(g, p.pid).filter((c) => c.capital).length;
        if (caps >= P.CONQUEST_CAPITALS && winner == null) { winner = p.pid; kind = 'conquest'; }
      });
    }
    if (winner == null && g.turn >= P.CLOCK) kind = 'singularity';
    if (!kind) return;
    const scored = alive.map((p) => ({ pid: p.pid, score: P.score(g, p.pid) }))
      .sort((a, b) => (b.pid === winner) - (a.pid === winner) || b.score - a.score);
    const out = g.players.filter((p) => !p.alive).sort((a, b) => b.elimTurn - a.elimTurn).map((p) => ({ pid: p.pid, score: 0 }));
    const ranking = scored.concat(out);
    g.result = { kind, winner: ranking[0].pid, ranking: ranking.map((x) => x.pid), scores: ranking };
    g.phase = 'over';
    ev(g, { t: 'over', kind, winner: ranking[0].pid });
  }

  V.Planet = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
