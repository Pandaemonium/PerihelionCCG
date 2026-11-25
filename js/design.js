/* TAU CETI — the Design Workshop: unit parts, and turning a choice of parts into a unit card.
 *
 * A design is a choice { chassis, weapon, armor, abilities: [...] } of part ids. Its card id spells the parts out
 * ('dz-rover-w3-a4-guard'), so the id alone fully determines the card. That keeps game state plain JSON: a designed
 * card in a hand or on the board is just its id, like any other card, and Design.ensure(id) rebuilds its definition.
 * Definitions are registered in CARDS as non-enumerable properties, so CARDS[id] works everywhere while every
 * listing of the card pool (Object.keys(CARDS)) never sees them.
 *
 * Pricing: a design's points are Attack + Health + the chassis and ability prices; a price that is a function
 * scales with Attack. Energy cost = ceil((points - FREE_POINTS) / 2), at least 1 and at most MAX_COST.
 * Gating: a part needs `tech` Research (checked with Engine.tech) and, if it has a `faction`, a deck of that
 * faction or a Pact with it. A second ability needs SECOND_SLOT_TECH.
 *
 * Pricing lessons from AI-vs-AI tests (swap 8 units of a preset for designs of the same cost, mirror match):
 *   - At these prices a design performs like a random premade unit of its cost. One point on every design moves
 *     that test by roughly 12 points of win rate, so change prices one point at a time.
 *   - Shielded at 2 points was far too cheap (58% against a 43% baseline); 3 is level.
 *   - Do not sell a discount for "cannot move": an immobile chassis at -1 point was pure profit.
 *   - The AI gets little from Mobile and Aerial, so they test weak; they are priced for human play.
 *
 * Load after cards.js. The engine and the AI look this module up when they need it.
 */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const CARDS = V.CARDS;
  const KW = V.KEYWORDS;
  const FACTIONS = V.FACTIONS;
  const E = () => V.Engine;

  const D = {};
  D.PREFIX = 'dz-';
  D.MAX_COST = 10;
  D.FREE_POINTS = 1;  // points a design gets for nothing: a plain N-cost unit is an N/N+1
  D.SECOND_SLOT_TECH = 13;
  D.TIERS = [0, 4, 8, 13];
  D.SLOTS = ['chassis', 'weapon', 'armor', 'ability'];
  D.SLOT_NAMES = { chassis: 'Chassis', weapon: 'Weapon', armor: 'Armor', ability: 'Ability' };

  /* Part ids must not contain '-' (it separates the parts in a card id).
   * word: the part's contribution to the unit's name.  pts: price in points, a number or a function of Attack. */
  D.PARTS = {
    chassis: [
      { id: 'inf', name: 'Infantry', word: 'Squad', art: '🪖', tech: 0, pts: 0, brief: 'No special movement' },
      { id: 'rover', name: 'Rover', word: 'Rover', art: '🚙', tech: 4, pts: 1, kw: 'mobile' },
      { id: 'gun', name: 'Gun Carriage', word: 'Battery', art: '🎯', tech: 8, pts: (atk) => 2 + Math.ceil(atk / 2), kw: 'artillery' },
      { id: 'skim', name: 'Skimmer', word: 'Skimmer', art: '🛩️', tech: 8, pts: (atk) => Math.ceil(atk / 2), kw: 'aerial' },
      { id: 'drop', name: 'Drop Pod', word: 'Drop-Unit', art: '🪂', tech: 8, pts: (atk) => 1 + Math.ceil(atk / 3), kw: 'blitz', kw2: 'flank', val2: 1, brief: 'Blitz, Flank +1' },
    ],
    weapon: [
      { id: 'w1', name: 'Sidearms', word: 'Sidearm', tech: 0, atk: 1 },
      { id: 'w2', name: 'Carbines', word: 'Carbine', tech: 0, atk: 2 },
      { id: 'w3', name: 'Coilguns', word: 'Coil', tech: 4, atk: 3 },
      { id: 'w4', name: 'Rail Lances', word: 'Rail', tech: 4, atk: 4 },
      { id: 'w5', name: 'Plasma Cutters', word: 'Plasma', tech: 8, atk: 5 },
      { id: 'w6', name: 'Fusion Lances', word: 'Fusion', tech: 8, atk: 6 },
      { id: 'w7', name: 'Singularity Cannon', word: 'Singularity', tech: 13, atk: 7 },
    ],
    armor: [
      { id: 'a1', name: 'Fatigues', tech: 0, hp: 1 },
      { id: 'a2', name: 'Flak Vests', tech: 0, hp: 2 },
      { id: 'a3', name: 'Composite Plate', tech: 0, hp: 3 },
      { id: 'a4', name: 'Ceramic Plate', tech: 4, hp: 4 },
      { id: 'a5', name: 'Alloy Carapace', tech: 4, hp: 5 },
      { id: 'a6', name: 'Reactive Hull', tech: 8, hp: 6 },
      { id: 'a7', name: 'Lattice Hull', tech: 8, hp: 7 },
      { id: 'a8', name: 'Monolith Weave', tech: 13, hp: 8 },
      { id: 'bast', name: 'Bastion Plate', word: 'Bastion', tech: 0, hp: 6, pts: 5, faction: 'ironwake', brief: 'Health 6 for the price of 5' },
    ],
    ability: [
      { id: 'guard', name: 'Sentinel Drill', word: 'Sentinel', tech: 0, pts: 1, kw: 'guard' },
      { id: 'blitz', name: 'Assault Boosters', word: 'Assault', tech: 0, pts: (atk) => Math.ceil(atk / 4), kw: 'blitz' },
      { id: 'sensor', name: 'Telemetry Mast', word: 'Recon', tech: 0, pts: 1, aiValue: 0.35,
        text: '<b>Deploy:</b> <b>Forecast 2.</b>',
        deploy(g, ctx) { E().forecast(g, ctx.pid, 2); } },
      { id: 'flak', name: 'Flak Mount', word: 'Flak', tech: 4, pts: 1, kw: 'interceptor' },
      { id: 'vet', name: 'Combat Recorder', word: 'Veteran', tech: 4, pts: 1, kw: 'veteran' },
      { id: 'overrun', name: 'Ramming Prow', word: 'Ram', tech: 4, pts: (atk) => Math.ceil(atk / 4), kw: 'overrun' },
      { id: 'disrupt', name: 'Shield Disruptor', word: 'Disruptor', tech: 4, pts: 2, aiValue: 0.65,
        text: '<b>Deploy:</b> Deal 1 <b>Psi</b> damage to a random enemy unit and remove its Shield.',
        deploy(g, ctx) {
          const foes = g.players[1 - ctx.pid].board.filter(E().alive);
          const t = E().pick(g, foes);
          if (t) { t.kw.shield = false; E().damage(g, E().unitRef(t), 1, null, { psi: true }); }
        } },
      { id: 'shield', name: 'Aegis Field', word: 'Aegis', tech: 8, pts: 3, kw: 'shield' },
      { id: 'siphon', name: 'Leech Coils', word: 'Leech', tech: 8, pts: (atk) => Math.ceil(atk / 3), kw: 'siphon' },
      { id: 'regen', name: 'Nano-Repair', word: 'Nano', tech: 8, pts: 2, aiValue: 0.75,
        text: '<b>Cycle End:</b> Restore 2 health to this unit.',
        turnEnd(g, ctx) { E().heal(g, E().unitRef(ctx.self), 2); } },
      // signature parts: one per faction (the Iron Hive's is the Bastion Plate above)
      { id: 'psi', name: 'Psi Lattice', word: 'Psi', tech: 0, pts: 1, kw: 'psi', faction: 'rootbound' },
      { id: 'lab', name: 'Field Lab', word: 'Survey', tech: 0, pts: 1, faction: 'synod', aiValue: 0.4,
        text: '<b>Deploy:</b> Gain 1 Research.',
        deploy(g, ctx) { E().gainResearch(g, ctx.pid, 1); } },
      { id: 'salvage', name: 'Salvage Rig', word: 'Salvage', tech: 0, pts: 1, faction: 'tide', aiValue: 0.3,
        text: '<b>Last Stand:</b> Add an Energy Cell to your hand.',
        lastStand(g, ctx) { E().addToHand(g, ctx.pid, 'cell'); } },
      { id: 'zeal', name: 'Zealot Cadre', word: 'Zealot', tech: 0, pts: 1, kw: 'zeal', val: 2, faction: 'cinder' },
      { id: 'escort', name: 'Bonded Escort', word: 'Bonded', tech: 0, pts: 1, faction: 'auric', aiValue: 0.5,
        text: '<b>Deploy:</b> Your colony gains 3 Armor.',
        deploy(g, ctx) { E().gainArmor(g, ctx.pid, 3); } },
      { id: 'flank', name: 'Shock Doctrine', word: 'Shock', tech: 0, pts: 1, kw: 'flank', val: 2, faction: 'redline' },
    ],
  };

  const index = {};
  D.SLOTS.forEach((slot) => { index[slot] = {}; D.PARTS[slot].forEach((p, i) => { p.slot = slot; p.order = i; index[slot][p.id] = p; }); });
  D.part = (slot, id) => index[slot][id] || null;

  /** What a part does, in a few words (for the picker). */
  D.partBrief = function (p) {
    if (p.brief) return p.brief;
    if (p.slot === 'weapon') return 'Attack ' + p.atk;
    if (p.slot === 'armor') return 'Health ' + p.hp;
    if (p.kw) return KW[p.kw].name + (p.val ? ' ' + p.val : '');
    return (p.text || '').replace(/<[^>]+>/g, '');
  };

  /** A part's price in points for a unit with the given Attack. */
  D.partPts = function (p, atk) {
    if (p.slot === 'weapon') return p.atk;
    if (p.slot === 'armor') return p.pts == null ? p.hp : p.pts;
    return typeof p.pts === 'function' ? p.pts(atk) : p.pts;
  };

  /** Canonical form of a choice (abilities de-duplicated and in table order), or null if any part id is unknown. */
  D.normalize = function (choice) {
    if (!choice || typeof choice !== 'object') return null;
    const ch = D.part('chassis', choice.chassis), w = D.part('weapon', choice.weapon), a = D.part('armor', choice.armor);
    if (!ch || !w || !a) return null;
    const raw = Array.isArray(choice.abilities) ? choice.abilities : [];
    const abs = [];
    for (const id of raw) {
      const p = D.part('ability', id);
      if (!p) return null;
      if (!abs.includes(p)) abs.push(p);
    }
    if (abs.length > 2) return null;
    abs.sort((x, y) => x.order - y.order);
    return { chassis: ch.id, weapon: w.id, armor: a.id, abilities: abs.map((p) => p.id) };
  };

  D.idOf = function (choice) {
    const c = D.normalize(choice);
    return c ? D.PREFIX + [c.chassis, c.weapon, c.armor].concat(c.abilities).join('-') : null;
  };

  D.isDesign = (id) => typeof id === 'string' && id.startsWith(D.PREFIX);

  /** The choice a design id spells out, or null. Only canonical ids parse, so a design has exactly one id. */
  D.parse = function (id) {
    if (!D.isDesign(id)) return null;
    const bits = id.slice(D.PREFIX.length).split('-');
    if (bits.length < 3) return null;
    const c = D.normalize({ chassis: bits[0], weapon: bits[1], armor: bits[2], abilities: bits.slice(3) });
    return c && D.idOf(c) === id ? c : null;
  };

  /** Stats and price of a choice: { atk, hp, points, cost, lines: [{ slot, part, pts }] }, or null. */
  D.breakdown = function (choice) {
    const c = D.normalize(choice);
    if (!c) return null;
    const parts = [D.part('chassis', c.chassis), D.part('weapon', c.weapon), D.part('armor', c.armor)].concat(c.abilities.map((id) => D.part('ability', id)));
    const atk = parts[1].atk, hp = parts[2].hp;
    const lines = parts.map((p) => ({ slot: p.slot, part: p, pts: D.partPts(p, atk) }));
    const points = lines.reduce((n, l) => n + l.pts, 0);
    return { atk, hp, points, cost: Math.max(1, Math.ceil((points - D.FREE_POINTS) / 2)), lines };
  };

  D.cost = (choice) => { const b = D.breakdown(choice); return b ? b.cost : null; };

  function facShort(fid) { const f = FACTIONS[fid]; return f ? (f.short || f.name.replace(/^The /, '')) : fid; }

  /** Why player pid cannot use this part right now (a short label), or null if it is unlocked. */
  D.locked = function (g, pid, p) {
    const pl = g.players[pid];
    if (p.faction && pl.faction !== p.faction && pl.pact !== p.faction) return facShort(p.faction) + ' only';
    if (p.tech && !E().tech(g, pid, p.tech)) return 'Tech ' + p.tech;
    return null;
  };

  /** How many abilities player pid may fit. */
  D.abilitySlots = (g, pid) => (E().tech(g, pid, D.SECOND_SLOT_TECH) ? 2 : 1);

  /** Why player pid cannot build this design right now (a sentence), or null if it is legal. */
  D.why = function (g, pid, choice) {
    const c = D.normalize(choice);
    if (!c) return 'That is not a complete design.';
    const b = D.breakdown(c);
    for (const l of b.lines) {
      const lock = D.locked(g, pid, l.part);
      if (lock) return `${l.part.name} is locked (${lock}).`;
    }
    if (c.abilities.length > D.abilitySlots(g, pid)) return `A second ability needs Tech ${D.SECOND_SLOT_TECH}.`;
    if (b.cost > D.MAX_COST) return `This design would cost ${b.cost} Energy; the limit is ${D.MAX_COST}.`;
    return null;
  };
  D.valid = (g, pid, choice) => !D.why(g, pid, choice);

  /* ------------------------------------------------------------ card definitions */
  function chain(fns) { return fns.length === 1 ? fns[0] : (g, ctx) => fns.forEach((f) => f(g, ctx)); }

  /** Build the card definition for a choice (pure: the same choice always gives the same card). */
  D.build = function (choice) {
    const c = D.normalize(choice);
    if (!c) return null;
    const b = D.breakdown(c);
    const ch = b.lines[0].part, w = b.lines[1].part, a = b.lines[2].part;
    const abs = b.lines.slice(3).map((l) => l.part);
    const kw = {};
    if (ch.kw) kw[ch.kw] = true;
    if (ch.kw2) kw[ch.kw2] = ch.val2 || true;
    abs.forEach((p) => { if (p.kw) kw[p.kw] = p.val || true; });

    const kwText = Object.keys(KW).filter((k) => kw[k]).map((k) => `<b>${KW[k].name}${typeof kw[k] === 'number' ? ' ' + kw[k] : ''}.</b>`);
    const text = kwText.concat(abs.filter((p) => p.text).map((p) => p.text)).join(' ');

    const words = abs.map((p) => p.word).concat(a.word ? [a.word] : []);
    const name = words.concat(words.length >= 2 ? [] : [w.word], [ch.word]).join(' ');
    const signature = [a].concat(abs).find((p) => p.faction);

    const def = {
      id: D.idOf(c), name, type: 'unit', cost: b.cost, atk: b.atk, hp: b.hp, art: ch.art,
      faction: signature ? signature.faction : 'neutral', kw, text,
      flavor: `Workshop design: ${[ch, w, a].concat(abs).map((p) => p.name).join(', ')}.`,
      designed: true, parts: c,
    };
    const aiValue = abs.reduce((n, p) => n + (p.aiValue || 0), 0);
    if (aiValue) def.aiValue = aiValue;
    ['deploy', 'lastStand', 'turnEnd'].forEach((hook) => {
      const fns = abs.filter((p) => p[hook]).map((p) => p[hook]);
      if (fns.length) def[hook] = chain(fns);
    });
    return def;
  };

  const registered = [];
  /** Make sure the card for a design id exists in CARDS; returns its definition (null if the id is not a design). */
  D.ensure = function (id) {
    if (Object.prototype.hasOwnProperty.call(CARDS, id)) return CARDS[id];
    const c = D.parse(id);
    if (!c) return null;
    const def = D.build(c);
    Object.defineProperty(CARDS, id, { value: def, enumerable: false, configurable: true, writable: false });
    registered.push(id);
    return def;
  };

  let allCache = null;
  /** Every well-formed design within the cost limit, as { id, choice, cost, atk, hp, parts: [part...] }. */
  D.all = function () {
    if (allCache) return allCache;
    const out = [];
    const abil = D.PARTS.ability;
    const combos = [[]];
    abil.forEach((p) => combos.push([p.id]));
    abil.forEach((p, i) => abil.slice(i + 1).forEach((q) => combos.push([p.id, q.id])));
    D.PARTS.chassis.forEach((ch) => D.PARTS.weapon.forEach((w) => D.PARTS.armor.forEach((a) => combos.forEach((abs) => {
      const choice = { chassis: ch.id, weapon: w.id, armor: a.id, abilities: abs };
      const b = D.breakdown(choice);
      if (b.cost > D.MAX_COST) return;
      out.push({ id: D.idOf(choice), choice, cost: b.cost, atk: b.atk, hp: b.hp, parts: b.lines.map((l) => l.part) });
    }))));
    allCache = out;
    return out;
  };

  /** Forget cached designs and unregister their cards. For rule experiments that change part prices. */
  D.reset = function () {
    allCache = null;
    registered.splice(0).forEach((id) => { delete CARDS[id]; });
  };

  V.Design = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
