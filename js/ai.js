/* TAU CETI — AI opponent. Greedy look-ahead with positional, terrain, keyword, and project heuristics.
 * Supports difficulty tiers: 'colonist' (relaxed), 'commander' (standard), 'transcend' (sharp). */
(function (root) {
  'use strict';
  const V = (root.TauCeti = root.TauCeti || {});
  const E = V.Engine;
  const CARDS = V.CARDS;
  const FACTIONS = V.FACTIONS;

  const AI = {};
  AI.difficulty = 'commander';

  AI.TUNE = {
    foeUnit: 1.15,
    mySite: 1,
    staff: 1,
    foeSite: 1.4,
    incoming: 0.8,
    outgoing: 0.45,
    exposedMine: 0.45,
    exposedFoe: 0.25,
    moveCost: 0.4,
    actCost: 0.15,
    noRaid: 0,
  };

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
        const immune = d.native || d.faction === 'rootbound' || g.players[u.owner].doctrine === 'green';
        v += immune ? 0.35 : -0.85;
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

  function exposure(g, pid, hitters) {
    let x = 0;
    g.players[pid].sites.forEach((s) => {
      let threat = 0;
      hitters.forEach((u) => {
        if (Math.abs(u.lane - s.lane) <= E.reach(g, u)) threat += E.effectiveAtk(g, u, E.siteRef(s));
      });
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
    const myDmg = myFree.reduce((n, u) => n + E.effectiveAtk(g, u, null), 0);
    const foeDmg = foeFree.reduce((n, u) => n + E.effectiveAtk(g, u, null), 0);

    let s = hpValue(me.hp + me.armor - T.incoming * foeDmg) - hpValue(foe.hp + foe.armor - T.outgoing * myDmg);
    me.board.forEach((u) => { s += unitValue(g, u); });
    foe.board.forEach((u) => { s -= unitValue(g, u) * T.foeUnit; });
    me.sites.forEach((x) => { s += siteValue(g, x, T.staff) * T.mySite; });
    foe.sites.forEach((x) => { s -= siteValue(g, x) * T.foeSite; });
    s -= T.exposedMine * exposure(g, pid, foeFree);
    s += T.exposedFoe * exposure(g, 1 - pid, myFree);
    const hasAscent = me.sites.some((x) => E.siteActive(g, x) && CARDS[x.id].ascentProject);
    const foeAscent = foe.sites.some((x) => E.siteActive(g, x) && CARDS[x.id].ascentProject);
    let handVal = 0;
    me.hand.forEach((h) => { handVal += h.id === 'cell' ? 0.25 : 0.7; });
    s += handVal + me.research * (hasAscent ? 0.9 : 0.35) + me.energy * 0.1;
    if (foeAscent) s -= foe.research * 0.6;
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
    if (a.type === 'play') return E.playCard(g, pid, a.hand, a.target, a.lane);
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

  AI.choose = function (g, pid, T, difficulty) {
    T = T || AI.TUNE;
    const diff = difficulty || AI.difficulty || 'commander';
    let actions = AI.legalActions(g, pid);
    if (T.noRaid) actions = actions.filter((a) => !(a.type === 'attack' && a.target.k === 's'));
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

    // Proactive Reserve Cell check: if spending Cells unlocks a playable card or Overcharge right now, evaluate it!
    if (diff !== 'colonist') {
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
    const noise = diff === 'colonist' ? 3.2 : 0;

    actions.forEach((a) => {
      const samples = isRandom(g, pid, a) ? 2 : 1;
      let total = 0;
      for (let i = 0; i < samples; i++) {
        const c = E.clone(g);
        AI.apply(c, pid, a);
        let sc = AI.score(c, pid, T);
        if (diff === 'transcend' && !c.over) {
          const follow = AI.legalActions(c, pid).filter((fa) => fa.type === 'attack' || fa.type === 'power').slice(0, 5);
          let bestF = sc;
          follow.forEach((fa) => {
            const c2 = E.clone(c);
            AI.apply(c2, pid, fa);
            const s2 = AI.score(c2, pid, T) - T.actCost;
            if (s2 > bestF) bestF = s2;
          });
          sc = bestF;
        }
        total += sc;
      }
      const jitter = noise ? (Math.random() - 0.5) * noise : 0;
      const gain = total / samples - base - (a.type === 'move' ? T.moveCost : T.actCost) + jitter;
      if (gain > bestGain) { bestGain = gain; best = a; }
    });
    if (best) return best;

    // Reserve Cells: spend one if it unlocks a playable card or an Overcharge threshold!
    if (diff !== 'colonist') {
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
        if (unlock) return { type: 'play', hand: cell.uid, id: 'cell', target: null, lane: null };
      }
    }
    return null;
  };

  V.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
