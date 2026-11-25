/* TAU CETI — AI opponent.
 *
 * AI.score rates a position for one player: colony health, units, locations, Research, cards in hand, with
 * weights in AI.TUNE. AI.choose returns the next action to take, or null to end the turn. At full strength it
 * plans the whole turn (planTurn): a beam search over lines of play, each tried on a copy of the game, then a
 * second look at the best lines after the Cycle End effects have fired. The rest of the plan is remembered per
 * game object and followed for as long as the game goes the way the plan expected.
 *
 * Difficulty levels (AI.LEVELS): 'transcend' is the full AI, 'commander' picks one action at a time, and
 * 'colonist' does that with random mistakes. The tests and balance tools use the full AI. */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const E = V.Engine;
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const AI = {};
  // The level used when AI.choose is not told one. Under Node, AI_LEVEL=commander makes the test tools play with
  // the quick one-action AI: several times faster, for when a run only has to hunt for crashes.
  const envLevel = typeof process !== 'undefined' && process.env ? process.env.AI_LEVEL : null;
  AI.difficulty = envLevel || 'transcend';

  AI.TUNE = {
    foeUnit: 1.15,
    mySite: 1,
    staff: 1,
    foeSite: 0.8,
    incoming: 0.8,
    outgoing: 0.45,
    exposedMine: 0.45,
    exposedFoe: 0.25,
    moveCost: 0.4,
    actCost: 0.15,
    noRaid: 0,   // test switch: never attack locations
    noBuild: 0,  // test switch: never build locations
    myHp: 1,             // my colony's health
    foeHp: 1,            // the enemy colony's health
    hand: 0.7,           // a card in hand
    cellHand: 0.25,      // an Energy Cell in hand
    energy: 0.1,         // a point of unspent Energy
    research: 0.35,      // a point of Research
    researchAscent: 0.9, // the same while my Ascent project stands
    foeAscent: 0.6,      // a point of enemy Research while theirs stands
    // skills (0 = off)
    beam: 12,    // whole-turn planning: how many lines of play to keep (0 = pick one action at a time)
    depth: 12,   // the longest line of play it will plan
    endEval: 1,  // judge the best lines after my Cycle End effects have fired
    plans: 1,    // follow the deck's game plan: its own weights and its hold rules
    holdScale: 1, // multiplies every hold value (0 = never hold a card back)
    unitRisk: 0.25, // how much to mark down my units that enemy units in reach could destroy
    noise: 0,    // random error added to every action's value (the Colonist level's mistakes)
  };

  // Difficulty levels are overrides on top of the weights in use. Transcend is the full AI, and is what the
  // tests and balance tools play with. Commander picks one action at a time; Colonist does that with mistakes.
  AI.LEVELS = {
    colonist: { beam: 0, noise: 3.2 },
    commander: { beam: 0 },
    transcend: {},
  };
  const levelMemo = new WeakMap();
  function forLevel(T, level) {
    const over = AI.LEVELS[level];
    if (!over) return T;
    let m = levelMemo.get(T);
    if (!m) levelMemo.set(T, (m = {}));
    return m[level] || (m[level] = Object.assign({}, T, over));
  }

  /* ------------------------------------------------------------ deck game plans */
  /**
   * A deck's game plan is plain data that tells the AI how to pilot it. Presets carry theirs in cards.js; a custom
   * deck can be given one through E.newGame's plan0 / plan1. All fields are optional:
   *   keystones  [card id, …]   the cards the deck is built around (read by test/meta.js)
   *   weights    { key: value } AI.TUNE values this deck plays with, e.g. { foeHp: 1.3 } for a deck that races
   *   hold       { card id: n } the score a play of this card must earn before the AI will make it. A plain unit
   *                             earns about its Attack plus its Health, so a hold just above that waits for a bonus.
   *   value      { card id: n } extra worth of the card while it is on my side of the board, in the same points
   * A card definition may carry `aiHold: n` as its default hold in any deck.
   *
   * Measured so far (test/meta.js --ab, November 2026):
   * - unitRisk (protecting units) is worth about 2 points of win rate at its default. Decks differ: against none
   *   at all, swarm and flanking decks gain 3–8 points from 0.4–0.5, while the artillery and Order-heavy decks
   *   lose 2–3 points to any of it. Setting it per deck measured about 1 point over the default: small, but in the
   *   same direction for all seven decks that have one.
   * - Hold rules on nine conditional cards (Canopy Beast, Gilded Leviathan, Works Foreman and others) cost the AI
   *   about 2 points: playing on curve beat waiting. Add a hold only with a trial that shows it helps.
   * - No preset uses `hold` or `value` yet. They are here for build-around decks; try them with
   *   `node test/meta.js --plan`.
   */
  AI.planOf = function (g, pid) {
    const p = g.players[pid];
    if (p.plan) return p.plan;
    const f = FACTIONS[p.faction];
    const pre = p.preset && f && f.presets[p.preset];
    return (pre && pre.plan) || null;
  };
  const planMemo = new WeakMap();
  function forPlan(T, plan) {
    if (!plan || !T.plans) return T;
    let m = planMemo.get(T);
    if (!m) planMemo.set(T, (m = new WeakMap()));
    let out = m.get(plan);
    if (!out) {
      out = Object.assign({}, T);
      Object.keys(plan.weights || {}).forEach((k) => { if (k in AI.TUNE) out[k] = plan.weights[k]; });
      out.hold = plan.hold || null;
      out.value = plan.value || null;
      m.set(plan, out);
    }
    return out;
  }

  /** What a card is worth while it stays in hand. A hold value makes the AI wait for a better moment to play it. */
  function handValue(T, id) {
    if (id === 'cell') return T.cellHand;
    const hold = T.hold && T.hold[id] != null ? T.hold[id] : CARDS[id].aiHold || 0;
    return T.hand + T.holdScale * hold;
  }

  function unitValue(g, u) {
    const d = CARDS[u.id];
    const atk = u.atk + (u.tempAtk || 0);
    const zeal = E.kwVal(g, u, 'zeal');
    const effAtk = atk + zeal * 0.55;
    let v = effAtk > 0 ? effAtk * 1.1 + u.hp * 0.9 : 0.5 + u.hp * 0.5;
    if (E.hasKw(g, u, 'guard')) v += 0.6 + u.hp * 0.15;
    if (u.kw.shield) v += 1 + effAtk * 0.25;
    if (E.hasKw(g, u, 'siphon')) v += effAtk * 0.3;
    if (E.hasKw(g, u, 'aerial')) v += effAtk * 0.4;
    if (E.hasKw(g, u, 'mobile')) v += 0.55;
    if (E.hasKw(g, u, 'artillery')) v += 1 + effAtk * 0.3;
    if (E.hasKw(g, u, 'interceptor')) v += 0.7 + u.hp * 0.12;
    if (E.hasKw(g, u, 'psi')) v += 0.45 + effAtk * 0.15;
    const flank = E.kwVal(g, u, 'flank');
    if (flank > 0) v += flank * 0.45;
    if (E.hasKw(g, u, 'veteran') && !u.promoted) v += 0.55;
    if (u.jammed > 0) v -= 1.4 + effAtk * 0.3;

    // Terrain positioning value
    const ln = g.lanes && g.lanes[u.lane];
    if (ln) {
      if (ln.terrain === 'monolith' && !u.monolithUsed) v += 1.25;
      else if (ln.terrain === 'borehole') v += 0.75;
      else if (ln.terrain === 'ridge' && effAtk > 0) v += 0.45;
      else if (ln.terrain === 'fungus') {
        const immune = d.native || d.faction === 'rootbound';
        v += immune ? 0.35 : E.doctrine(g, u.owner).fungusSafe ? 0 : -0.85;
      }
    }
    return v + (d.aiValue || 0);
  }

  function siteValue(g, s, staffW) {
    const d = CARDS[s.id];
    let base = d.aiValue || 2;
    if (d.ascentProject) base += Math.max(0, g.players[s.owner].research - 10) * 0.6;
    let v = base * (0.4 + 0.6 * s.hp / s.maxHp) + s.hp * 0.12;
    if (s.jammed > 0) v *= 0.45;
    const staffed = !!E.stationed(g, s);
    if (d.aiStaffed && staffed && !(s.jammed > 0)) v += d.aiStaffed * (staffW == null ? 1 : staffW);
    if (d.needsEmpty && staffed) v -= base * 0.35;
    return v;
  }

  const hpValue = (h) => (h > 0 ? 5.5 * Math.sqrt(h) : -12 + h * 1.5);

  function freeHitters(g, pid) {
    return g.players[pid].board.filter((u) => E.alive(u) && !(u.jammed > 0) && E.effectiveAtk(g, u, null) > 0 && E.unscreened(g, u));
  }

  /** How much of player pid's location value the enemy's units could strike as things stand. */
  function exposure(g, pid) {
    const hitters = g.players[1 - pid].board.filter((u) => E.alive(u) && !(u.jammed > 0) && E.effectiveAtk(g, u, null) > 0);
    let x = 0;
    g.players[pid].sites.forEach((s) => {
      let threat = 0;
      hitters.forEach((u) => {
        if (E.siteOpen(g, u, s)) threat += E.effectiveAtk(g, u, E.siteRef(s));
      });
      if (threat > 0) x += siteValue(g, s) * Math.min(1, threat / s.hp);
    });
    return x;
  }

  /** How much of player pid's unit value the enemy's units in reach could destroy as things stand. */
  function atRisk(g, pid) {
    const foes = g.players[1 - pid].board.filter((x) => E.alive(x) && !(x.jammed > 0));
    if (!foes.length) return 0;
    const reach = foes.map((x) => E.reach(g, x));
    // Zeal only counts on its owner's turn, which is when these units would strike
    const atk = foes.map((x) => E.effectiveAtk(g, x, null) + (g.active === x.owner ? 0 : E.kwVal(g, x, 'zeal')));
    let r = 0;
    g.players[pid].board.forEach((u) => {
      if (!E.alive(u)) return;
      let threat = 0;
      for (let i = 0; i < foes.length; i++) if (Math.abs(foes[i].lane - u.lane) <= reach[i]) threat += atk[i];
      if (threat > 0) r += unitValue(g, u) * Math.min(1, threat / u.hp);
    });
    return r;
  }

  AI.score = function (g, pid, T) {
    T = T || AI.TUNE;
    const me = g.players[pid];
    const foe = g.players[1 - pid];
    if (g.over) return g.winner === pid ? 100000 : g.winner === -1 ? -500 : -100000;
    const myFree = freeHitters(g, pid);
    const foeFree = freeHitters(g, 1 - pid);
    const myDmg = myFree.reduce((n, u) => n + E.effectiveAtk(g, u, null), 0);
    const foeDmg = foeFree.reduce((n, u) => n + E.effectiveAtk(g, u, null), 0);

    let s = T.myHp * hpValue(me.hp + me.armor - T.incoming * foeDmg) - T.foeHp * hpValue(foe.hp + foe.armor - T.outgoing * myDmg);
    const worth = T.value; // the plan's extra value for some of my cards while they are on the board
    me.board.forEach((u) => { s += unitValue(g, u) + ((worth && worth[u.id]) || 0); });
    foe.board.forEach((u) => { s -= unitValue(g, u) * T.foeUnit; });
    me.sites.forEach((x) => { s += (siteValue(g, x, T.staff) + ((worth && worth[x.id]) || 0)) * T.mySite; });
    foe.sites.forEach((x) => { s -= siteValue(g, x) * T.foeSite; });
    s -= T.exposedMine * exposure(g, pid);
    s += T.exposedFoe * exposure(g, 1 - pid);
    if (T.unitRisk) s -= T.unitRisk * atRisk(g, pid);
    const hasAscent = me.sites.some((x) => E.siteActive(g, x) && CARDS[x.id].ascentProject);
    const foeAscent = foe.sites.some((x) => E.siteActive(g, x) && CARDS[x.id].ascentProject);
    let handVal = 0;
    me.hand.forEach((h) => { handVal += handValue(T, h.id); });
    s += handVal + me.research * (hasAscent ? T.researchAscent : T.research) + me.energy * T.energy;
    if (foeAscent) s -= foe.research * T.foeAscent;
    return s;
  };

  /* ------------------------------------------------------------ Design Workshop */
  /** What a design is worth to the AI before it is on the board: the unitValue weights, without a position. */
  function designValue(x, need) {
    const kw = {};
    let extra = 0;
    x.parts.forEach((p) => { if (p.kw) kw[p.kw] = p.val || 1; if (p.aiValue) extra += p.aiValue; });
    const effAtk = x.atk + (kw.zeal || 0) * 0.55;
    let v = effAtk * 1.1 + x.hp * 0.9 + extra;
    // lopsided bodies trade badly: a 6/1 dies to anything, a 1/7 threatens nothing
    v -= 0.3 * Math.max(0, x.atk - x.hp - 1) + 0.15 * Math.max(0, x.hp - x.atk - 3);
    if (kw.guard) v += 0.6 + x.hp * 0.15 + (need.guard ? 0.8 : 0);
    if (kw.shield) v += 1 + effAtk * 0.25;
    if (kw.siphon) v += effAtk * 0.3 + (need.guard ? 0.4 : 0);
    if (kw.aerial) v += effAtk * 0.4;
    if (kw.mobile) v += 0.55;
    if (kw.artillery) v += 1 + effAtk * 0.3;
    if (kw.interceptor) v += need.flak ? 1.6 + x.hp * 0.12 : 0.2;
    if (kw.psi) v += 0.45 + effAtk * 0.15 + (need.psi ? 0.6 : 0);
    if (kw.flank) v += kw.flank * 0.45;
    if (kw.veteran) v += 0.55;
    if (kw.blitz) v += need.blitz ? 0.5 + x.atk * 0.15 : 0.15;
    return v;
  }

  // a stable pseudo-random number in [0, 1) from a string: variety between designs without touching the game's RNG
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return ((h >>> 0) % 10007) / 10007;
  }

  AI.designValue = designValue;
  const designMemo = new Map();
  /** Forget remembered design picks (after a rule experiment changes part prices). */
  AI.resetDesigns = () => designMemo.clear();
  /**
   * The design the AI would build with the Workshop: the best-valued legal one it can pay for. If enough Energy is
   * left after the Order to deploy at once it builds for now, otherwise for next turn's Energy. Returns a choice.
   */
  AI.pickDesign = function (g, pid, orderCost) {
    const D = V.Design;
    const p = g.players[pid], foe = g.players[1 - pid];
    const left = p.energy - orderCost;
    const budget = left >= 2 && E.emptyLanes(g, pid).length
      ? left
      : Math.min(D.MAX_COST, E.maxEnergyCap(g, pid), p.maxEnergy + 1);
    const need = {
      flak: foe.board.some((u) => E.alive(u) && E.hasKw(g, u, 'aerial')),
      psi: foe.armor > 0 || foe.board.some((u) => E.alive(u) && u.kw.shield),
      guard: p.hp <= 15,
      blitz: foe.board.some(E.alive),
    };
    // which parts are open depends only on the faction, the Pact and the Tech tiers reached
    const tiers = D.TIERS.map((t) => (E.tech(g, pid, t) ? 1 : 0)).join('');
    const slots = D.abilitySlots(g, pid);
    const key = [budget, slots, g.turn, pid, need.flak, need.psi, need.guard, need.blitz, p.faction, p.pact, tiers].join('|');
    if (designMemo.has(key)) return designMemo.get(key);

    const open = {};
    D.SLOTS.forEach((slot) => D.PARTS[slot].forEach((part) => { if (!D.locked(g, pid, part)) open[slot + ':' + part.id] = true; }));
    let best = null, bestV = -Infinity;
    D.all().forEach((x) => {
      if (x.cost > budget || x.choice.abilities.length > slots) return;
      if (!x.parts.every((part) => open[part.slot + ':' + part.id])) return;
      const v = designValue(x, need) + hash01(x.id + ':' + g.turn + ':' + pid) * 0.5;
      if (v > bestV) { bestV = v; best = x; }
    });
    const choice = best ? best.choice : null;
    if (designMemo.size > 400) designMemo.clear();
    designMemo.set(key, choice);
    return choice;
  };

  AI.legalActions = function (g, pid) {
    const out = [];
    const p = g.players[pid];
    if (g.over || g.active !== pid) return out;
    const seen = {};
    p.hand.forEach((hc) => {
      if (!E.canPlay(g, pid, hc)) return;
      const key = hc.id + ':' + hc.cost;
      if (seen[key]) return;
      seen[key] = true;
      const d = CARDS[hc.id];
      if (d.design) {
        // one design, picked by rule: the one-step look-ahead cannot tell two cards in hand apart
        const choice = AI.pickDesign(g, pid, E.cost(g, pid, hc));
        if (choice) out.push({ type: 'play', hand: hc.uid, id: hc.id, target: null, lane: null, choice });
        return;
      }
      const lanes = E.deployLanes(g, pid, d) || [null];
      const needTgt = E.needsTarget(g, pid, hc);
      const ts = needTgt ? E.cardTargets(g, pid, d) : null;
      const tlist = ts && ts.length ? ts : [null];
      lanes.forEach((lane) => tlist.forEach((t) => out.push({ type: 'play', hand: hc.uid, id: hc.id, target: t, lane })));
    });
    p.board.forEach((u) => {
      E.attackTargets(g, u).forEach((t) => out.push({ type: 'attack', uid: u.uid, target: t }));
      E.moveTargets(g, u).forEach((lane) => out.push({ type: 'move', uid: u.uid, lane }));
    });
    if (E.canUsePower(g, pid)) {
      const pw = FACTIONS[p.faction].power;
      const ts = E.targets(g, pid, pw.target);
      if (ts) ts.forEach((t) => out.push({ type: 'power', target: t }));
      else out.push({ type: 'power', target: null });
    }
    return out;
  };

  AI.apply = function (g, pid, a) {
    if (a.type === 'play') return E.playCard(g, pid, a.hand, a.target, a.lane, a.choice);
    if (a.type === 'attack') return E.attack(g, pid, a.uid, a.target);
    if (a.type === 'move') return E.move(g, pid, a.uid, a.lane);
    if (a.type === 'power') return E.usePower(g, pid, a.target);
    if (a.type === 'end') return E.endTurn(g, pid);
    return false;
  };

  function isRandom(g, pid, a) {
    if (a.type === 'power') return !!FACTIONS[g.players[pid].faction].power.random;
    if (a.type === 'move') return !!(g.lanes[a.lane] && g.lanes[a.lane].pod);
    if (a.type !== 'play') return false;
    const d = CARDS[a.id];
    if (a.lane != null && d.type === 'unit' && g.lanes[a.lane] && g.lanes[a.lane].pod) return true;
    if (d.random) return true;
    return d.type === 'order' && g.players[pid].board.some((u) => CARDS[u.id].random && CARDS[u.id].onOrder);
  }

  function allowed(actions, T) {
    if (T.noRaid) actions = actions.filter((a) => !(a.type === 'attack' && a.target.k === 's'));
    if (T.noBuild) actions = actions.filter((a) => !(a.type === 'play' && CARDS[a.id].type === 'site'));
    return actions;
  }

  /* ------------------------------------------------------------ whole-turn planning */
  const cellPlay = (hc) => ({ type: 'play', hand: hc.uid, id: 'cell', target: null, lane: null });
  const stepCost = (T, a) => (a.type === 'move' ? T.moveCost : T.actCost);

  /** Tells two actions apart, including whether a card would be played Overcharged. */
  function actKey(g, pid, a) {
    let mode = '';
    if (a.type === 'play' && CARDS[a.id].overcharge) {
      const p = g.players[pid], hc = p.hand.find((h) => h.uid === a.hand);
      if (hc && p.energy >= E.cost(g, pid, hc) + CARDS[a.id].overcharge) mode = '+';
    }
    const t = a.target;
    const tk = t ? t.k + (t.uid || '') + (t.lane == null ? '' : 'L' + t.lane) + (t.pid == null ? '' : 'P' + t.pid) : '';
    return a.type + ':' + (a.hand || a.uid || '') + ':' + tk + ':' + (a.lane == null ? '' : a.lane) + mode;
  }

  /**
   * The next steps open from a position. A step is usually one action. Energy Cells are folded in: for every card
   * (or leader power, or Overcharge) that only becomes payable by cashing Cells, the step is "cash that many Cells,
   * then play it". Returns [{ from, acts }]: `from` is the position the last action of `acts` applies to.
   */
  function steps(g, pid, T) {
    const out = [];
    const acts = allowed(AI.legalActions(g, pid), T);
    acts.forEach((a) => out.push({ from: g, acts: [a] }));
    const cells = g.players[pid].hand.filter((h) => h.id === 'cell');
    if (!cells.length) return out;
    const have = new Set(acts.map((a) => actKey(g, pid, a)));
    const spent = [];
    let cur = g;
    for (let k = 0; k < cells.length && k < 3; k++) {
      cur = E.clone(cur);
      const ca = cellPlay(cells[k]);
      AI.apply(cur, pid, ca);
      spent.push(ca);
      const pre = spent.slice();
      const from = cur;
      allowed(AI.legalActions(cur, pid), T).forEach((a) => {
        const key = actKey(from, pid, a);
        if (a.id === 'cell' || have.has(key)) return;
        have.add(key);
        out.push({ from, acts: pre.concat([a]) });
      });
    }
    return out;
  }

  /** A cheap identity for "the position I expected": my score, Energy and the exact cards in hand. */
  function fingerprint(g, pid, T) {
    const p = g.players[pid];
    return AI.score(g, pid, T).toFixed(3) + '|' + p.energy + '|' + p.hand.map((h) => h.uid + ':' + h.id + ':' + h.cost).join(',');
  }

  /**
   * Plan the rest of the turn: a beam search over lines of play, each position scored with AI.score less the
   * running cost of its actions. Returns the chosen line as [{ a, fp }], where fp is the fingerprint expected
   * after the action (undefined = not checked, null = the action was random, so plan again).
   */
  function planTurn(g, pid, T) {
    const root = { g, val: AI.score(g, pid, T), cost: 0, parent: null, acts: [], random: false };
    let frontier = [root], best = root, stale = 0, last = frontier;
    for (let depth = 1; depth <= T.depth; depth++) {
      const next = [];
      frontier.forEach((node) => {
        if (node.g.over) return;
        steps(node.g, pid, T).forEach((st) => {
          const a = st.acts[st.acts.length - 1];
          const random = isRandom(st.from, pid, a);
          const c = E.clone(st.from);
          AI.apply(c, pid, a);
          let sc = AI.score(c, pid, T);
          if (random) { const c2 = E.clone(st.from); AI.apply(c2, pid, a); sc = (sc + AI.score(c2, pid, T)) / 2; }
          const cost = node.cost + st.acts.reduce((n, x) => n + stepCost(T, x), 0);
          next.push({ g: c, val: sc - cost, cost, parent: node, acts: st.acts, random });
        });
      });
      if (!next.length) break;
      next.sort((x, y) => y.val - x.val);
      // different orders of the same actions reach the same position: keep one of each
      const seen = new Set();
      frontier = [];
      for (const n of next) {
        const p = n.g.players[pid];
        const key = n.val.toFixed(4) + ':' + p.energy + ':' + p.hand.length;
        if (seen.has(key)) continue;
        seen.add(key);
        frontier.push(n);
        if (frontier.length >= T.beam) break;
      }
      last = frontier;
      if (frontier[0].val > best.val + 1e-9) { best = frontier[0]; stale = 0; } else if (++stale >= 2) break;
      if (best.g.over) break;
    }

    if (T.endEval && !best.g.over) {
      // Cycle End effects are invisible to AI.score, so let them fire for the candidates and compare again:
      // every point along the best line (stopping early may be right), and the other lines still alive.
      const cands = last.slice();
      for (let n = best; n; n = n.parent) if (!cands.includes(n)) cands.push(n);
      let top = -Infinity;
      cands.forEach((n) => {
        let v;
        if (n.g.over) v = n.val;
        else { const c = E.clone(n.g); E.endTurn(c, pid); v = AI.score(c, pid, T) - n.cost; }
        if (v > top + 1e-9) { top = v; best = n; }
      });
    }

    const line = [];
    for (let n = best; n && n.parent; n = n.parent) {
      for (let i = n.acts.length - 1; i >= 0; i--) {
        const lastAct = i === n.acts.length - 1;
        line.unshift({ a: n.acts[i], fp: !lastAct ? undefined : n.random ? null : fingerprint(n.g, pid, T) });
      }
    }
    return line;
  }

  function stillLegal(g, pid, a) {
    const p = g.players[pid];
    const hit = (list, t) => !!list && list.some((x) => x.k === t.k && x.uid === t.uid && x.lane === t.lane && x.pid === t.pid);
    if (a.type === 'play') {
      const hc = p.hand.find((h) => h.uid === a.hand);
      if (!hc || hc.id !== a.id || !E.canPlay(g, pid, hc)) return false;
      const d = CARDS[hc.id], lanes = E.deployLanes(g, pid, d);
      if (lanes && !lanes.includes(a.lane)) return false;
      return !E.needsTarget(g, pid, hc) || (!!a.target && hit(E.cardTargets(g, pid, d), a.target));
    }
    if (a.type === 'power') {
      if (!E.canUsePower(g, pid)) return false;
      const spec = FACTIONS[p.faction].power.target;
      return !spec || (!!a.target && hit(E.targets(g, pid, spec), a.target));
    }
    const f = E.find(g, a.uid);
    if (!f || f.pid !== pid) return false;
    return a.type === 'attack' ? hit(E.attackTargets(g, f.unit), a.target) : E.moveTargets(g, f.unit).includes(a.lane);
  }

  const plans = new WeakMap(); // game object -> what is left of this turn's plan
  function choosePlanned(g, pid, T) {
    let plan = plans.get(g);
    if (plan && (plan.turn !== g.turn || plan.pid !== pid || plan.T !== T)) plan = null;
    if (plan && plan.expect !== undefined && (plan.expect === null || plan.expect !== fingerprint(g, pid, T))) plan = null;
    if (plan && plan.queue.length && !stillLegal(g, pid, plan.queue[0].a)) plan = null;
    if (!plan) {
      plan = { turn: g.turn, pid, T, queue: planTurn(g, pid, T), expect: undefined };
      plans.set(g, plan);
    }
    const next = plan.queue.shift();
    if (next) { plan.expect = next.fp; return next.a; }
    // nothing left worth doing: a nearly full hand would burn the next draw, so cash a Cell rather than lose a card
    const p = g.players[pid];
    const cell = p.hand.find((h) => h.id === 'cell');
    if (cell && p.hand.length >= E.maxHand(g, pid) - 1) { plan.expect = undefined; return cellPlay(cell); }
    return null;
  }

  /* ------------------------------------------------------------ choosing an action */
  AI.choose = function (g, pid, T, difficulty) {
    T = forLevel(T || AI.TUNE, difficulty || AI.difficulty);
    const colonist = T.noise > 0;
    if (!colonist) T = forPlan(T, AI.planOf(g, pid));
    const actions = allowed(AI.legalActions(g, pid), T);
    if (!actions.length) return null;
    const foe = g.players[1 - pid];

    // Lethal check: if direct face attacks finish the enemy colony (accounting for Psi ignoring Armor)
    const face = actions.filter((a) => a.type === 'attack' && a.target.k === 'l');
    if (face.length) {
      let psiReach = 0, stdReach = 0;
      face.forEach((a) => {
        const u = E.find(g, a.uid).unit;
        const dmg = E.effectiveAtk(g, u, a.target);
        if (E.hasKw(g, u, 'psi')) psiReach += dmg;
        else stdReach += dmg;
      });
      if (psiReach >= foe.hp || (psiReach + Math.max(0, stdReach - foe.armor)) >= foe.hp) return face[0];
    }

    if (T.beam > 0) return choosePlanned(g, pid, T);

    // From here on: one action at a time (the Commander and Colonist levels).
    // Proactive Reserve Cell check: if spending Cells unlocks a playable card or Overcharge right now, evaluate it!
    if (!colonist) {
      const p = g.players[pid];
      const cell = p.hand.find((h) => h.id === 'cell');
      if (cell) {
        const cells = p.hand.filter((h) => h.id === 'cell').length;
        const canUnlockOvercharge = p.hand.some((h) => {
          if (h.id === 'cell') return false;
          const d = CARDS[h.id];
          if (!d.overcharge) return false;
          const oc = E.cost(g, pid, h) + d.overcharge;
          return oc > p.energy && oc <= p.energy + cells;
        });
        const canUnlockHigher = p.hand.some((h) => {
          if (h.id === 'cell') return false;
          const c = E.cost(g, pid, h);
          return c > p.energy && c <= p.energy + cells && c >= 3;
        });
        if (canUnlockOvercharge || (canUnlockHigher && p.hand.length >= 6)) {
          return { type: 'play', hand: cell.uid, id: 'cell', target: null, lane: null };
        }
      }
    }

    const base = AI.score(g, pid, T);
    let best = null;
    let bestGain = 0;
    const noise = T.noise;

    actions.forEach((a) => {
      const samples = isRandom(g, pid, a) ? 2 : 1;
      let total = 0;
      for (let i = 0; i < samples; i++) {
        const c = E.clone(g);
        AI.apply(c, pid, a);
        total += AI.score(c, pid, T);
      }
      const jitter = noise ? (Math.random() - 0.5) * noise : 0;
      const gain = total / samples - base - (a.type === 'move' ? T.moveCost : T.actCost) + jitter;
      if (gain > bestGain) { bestGain = gain; best = a; }
    });
    if (best) return best;

    // Reserve Cells: spend one if it unlocks a playable card or an Overcharge threshold!
    if (!colonist) {
      const p = g.players[pid];
      const cell = p.hand.find((h) => h.id === 'cell');
      if (cell) {
        const cells = p.hand.filter((h) => h.id === 'cell').length;
        const unlock = p.hand.some((h) => {
          if (h.id === 'cell') return false;
          const d = CARDS[h.id];
          const c = E.cost(g, pid, h);
          const oc = d.overcharge ? c + d.overcharge : 999;
          return (c > p.energy && c <= p.energy + cells) || (oc > p.energy && oc <= p.energy + cells);
        });
        // a nearly full hand would burn the next draw, so cash a Cell in rather than lose a card
        const crowded = p.hand.length >= E.maxHand(g, pid) - 1;
        if (unlock || crowded) return { type: 'play', hand: cell.uid, id: 'cell', target: null, lane: null };
      }
    }
    return null;
  };

  V.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
