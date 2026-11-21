/* VEYRA — AI opponent. Greedy one-step look-ahead: try every legal action on a cloned game,
 * keep the one that improves the board evaluation the most, repeat until nothing helps.
 * The evaluation carries the positional knowledge a one-step search cannot see for itself:
 * which attackers are unscreened, which locations are exposed, which locations are staffed. */
(function (root) {
  'use strict';
  const V = (root.Veyra = root.Veyra || {});
  const E = V.Engine;
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const AI = {};

  /* Evaluation weights. test/tune.js plays variants of these against each other. */
  AI.TUNE = {
    foeUnit: 1.15,     // enemy unit value relative to our own
    mySite: 1,         // value of our own locations (0 = never builds)
    staff: 1,          // weight of the bonus for stationing a unit at a location
    foeSite: 1.4,      // enemy location value relative to our own
    incoming: 0.8,     // share of unscreened enemy damage counted against our colony
    outgoing: 0.45,    // share of our unscreened damage counted against theirs
    exposedMine: 0.45, // penalty for our locations that enemy free hitters can reach
    exposedFoe: 0.25,  // bonus for enemy locations our free hitters can reach
    moveCost: 0.45,    // a move must gain at least this much
    actCost: 0.15,     // any other action must gain at least this much
    noRaid: 0,         // test hook: 1 = never attack locations
  };

  function unitValue(g, u) {
    const d = CARDS[u.id];
    let v = u.atk > 0 ? u.atk * 1.1 + u.hp * 0.9 : 0.5 + u.hp * 0.5;
    if (E.hasKw(g, u, 'guard')) v += 0.6 + u.hp * 0.15;
    if (u.kw.shield) v += 1 + u.atk * 0.25;
    if (u.kw.siphon) v += u.atk * 0.3;
    if (u.kw.aerial) v += u.atk * 0.4;
    if (u.kw.mobile) v += 0.4;
    if (u.kw.artillery) v += 1 + u.atk * 0.3;
    return v + (d.aiValue || 0);
  }

  function siteValue(g, s, staffW) {
    const d = CARDS[s.id];
    let v = (d.aiValue || 2) * (0.4 + 0.6 * s.hp / s.maxHp) + s.hp * 0.1;
    const staffed = !!E.stationed(g, s);
    if (d.aiStaffed && staffed) v += d.aiStaffed * (staffW == null ? 1 : staffW);
    if (d.needsEmpty && staffed) v -= d.aiValue * 0.35;
    return v;
  }

  const hpValue = (h) => (h > 0 ? 5.5 * Math.sqrt(h) : -12 + h * 1.5);

  /** Units of `pid` that nothing is holding up: next turn they hit locations or the colony. */
  function freeHitters(g, pid) {
    return g.players[pid].board.filter((u) => E.alive(u) && u.atk > 0 && E.unscreened(g, u));
  }

  /** How badly a side's locations are exposed to the other side's free hitters. */
  function exposure(g, pid, hitters) {
    let x = 0;
    g.players[pid].sites.forEach((s) => {
      let threat = 0;
      hitters.forEach((u) => { if (Math.abs(u.lane - s.lane) <= E.reach(g, u)) threat += u.atk; });
      if (threat > 0) x += siteValue(g, s) * Math.min(1, threat / s.hp);
    });
    return x;
  }

  AI.score = function (g, pid, T) {
    T = T || AI.TUNE;
    const me = g.players[pid];
    const foe = g.players[1 - pid];
    if (g.over) return g.winner === pid ? 100000 : g.winner === -1 ? -500 : -100000;
    const myFree = freeHitters(g, pid);
    const foeFree = freeHitters(g, 1 - pid);
    const myDmg = myFree.reduce((n, u) => n + u.atk, 0);
    const foeDmg = foeFree.reduce((n, u) => n + u.atk, 0);

    // Colony health, discounted by the damage each side is lined up to take next turn.
    let s = hpValue(me.hp + me.armor - T.incoming * foeDmg) - hpValue(foe.hp + foe.armor - T.outgoing * myDmg);
    me.board.forEach((u) => { s += unitValue(g, u); });
    foe.board.forEach((u) => { s -= unitValue(g, u) * T.foeUnit; });
    me.sites.forEach((x) => { s += siteValue(g, x, T.staff) * T.mySite; });
    foe.sites.forEach((x) => { s -= siteValue(g, x) * T.foeSite; });
    s -= T.exposedMine * exposure(g, pid, foeFree);
    s += T.exposedFoe * exposure(g, 1 - pid, myFree);
    s += me.hand.length * 0.7 + me.research * 0.35 + me.energy * 0.05;
    return s;
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
      const lanes = E.deployLanes(g, pid, d) || [null];
      const ts = E.cardTargets(g, pid, d);
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
    if (a.type === 'play') return E.playCard(g, pid, a.hand, a.target, a.lane);
    if (a.type === 'attack') return E.attack(g, pid, a.uid, a.target);
    if (a.type === 'move') return E.move(g, pid, a.uid, a.lane);
    if (a.type === 'power') return E.usePower(g, pid, a.target);
    if (a.type === 'end') return E.endTurn(g, pid);
    return false;
  };

  /** True when the outcome of an action depends on a dice roll, so it is worth sampling twice. */
  function isRandom(g, pid, a) {
    if (a.type === 'power') return !!FACTIONS[g.players[pid].faction].power.random;
    if (a.type !== 'play') return false;
    const d = CARDS[a.id];
    if (d.random) return true;
    return d.type === 'order' && g.players[pid].board.some((u) => CARDS[u.id].random && CARDS[u.id].onOrder);
  }

  /** Returns the next action to take, or null when the turn should end. */
  AI.choose = function (g, pid, T) {
    T = T || AI.TUNE;
    let actions = AI.legalActions(g, pid);
    if (T.noRaid) actions = actions.filter((a) => !(a.type === 'attack' && a.target.k === 's')); // test hook
    if (!actions.length) return null;
    const foe = g.players[1 - pid];

    // Lethal check: if the damage that can reach the enemy colony finishes it, go for it.
    const face = actions.filter((a) => a.type === 'attack' && a.target.k === 'l');
    const reach = face.reduce((n, a) => n + E.find(g, a.uid).unit.atk, 0);
    if (face.length && reach >= foe.hp + foe.armor) return face[0];

    const base = AI.score(g, pid, T);
    let best = null;
    let bestGain = 0;
    actions.forEach((a) => {
      const samples = isRandom(g, pid, a) ? 2 : 1;
      let total = 0;
      for (let i = 0; i < samples; i++) {
        const c = E.clone(g);
        AI.apply(c, pid, a);
        total += AI.score(c, pid, T);
      }
      // A move spends the unit's attack, so it has to earn its keep.
      const gain = total / samples - base - (a.type === 'move' ? T.moveCost : T.actCost);
      if (gain > bestGain) { bestGain = gain; best = a; }
    });
    if (best) return best;

    // Reserve Cells look worthless to the evaluator; spend one if it unlocks a play.
    const p = g.players[pid];
    const cell = p.hand.find((h) => h.id === 'cell');
    if (cell) {
      const cells = p.hand.filter((h) => h.id === 'cell').length;
      const unlock = p.hand.some((h) => {
        const c = E.cost(g, pid, h);
        return h.id !== 'cell' && c > p.energy && c <= p.energy + cells;
      });
      if (unlock) return { type: 'play', hand: cell.uid, id: 'cell', target: null, lane: null };
    }
    return null;
  };

  V.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
