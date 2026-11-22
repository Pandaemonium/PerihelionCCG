/* Board-state invariants shared by the simulation tests. Load the game scripts before requiring this. */
const { Engine: E, CARDS, TERRAIN } = globalThis.TauCeti;

/**
 * Check a game state; calls report(message) once per broken invariant and returns how many were found.
 */
function checkState(g, where, report) {
  let n = 0;
  const bad = (m) => { n++; report(`INVARIANT (${where}): ${m}`); };
  g.players.forEach((p) => {
    if (p.hand.length > E.maxHand(g, p.id)) bad('hand overflow ' + p.hand.length);
    if (p.energy < 0) bad('negative energy ' + p.energy);
    const lanes = {}, plots = {};
    p.board.forEach((u) => {
      if (u.owner !== p.id) bad('unit owner mismatch ' + u.id);
      if (!(u.lane >= 0 && u.lane < E.LANES)) bad('unit lane out of range ' + u.id + ' ' + u.lane);
      if (lanes[u.lane]) bad('two units in lane ' + u.lane);
      lanes[u.lane] = true;
      if (!g.over && u.hp <= 0) bad('dead unit left on board ' + u.id);
      if (Number.isNaN(u.atk) || Number.isNaN(u.hp)) bad('NaN stats ' + u.id);
    });
    p.sites.forEach((s) => {
      if (s.owner !== p.id) bad('site owner mismatch ' + s.id);
      if (!(s.lane >= 0 && s.lane < E.LANES)) bad('site lane out of range ' + s.id);
      if (plots[s.lane]) bad('two locations in lane ' + s.lane);
      plots[s.lane] = true;
      if (CARDS[s.id].type !== 'site') bad('non-location in plot ' + s.id);
      if (!g.over && s.hp <= 0) bad('razed location left on board ' + s.id);
    });
    p.hand.forEach((h) => { if (!CARDS[h.id]) bad('unknown card ' + h.id); });
  });
  g.lanes.forEach((l, i) => { if (l.terrain && !TERRAIN[l.terrain]) bad(`bad terrain ${l.terrain} at ${i}`); });
  return n;
}

module.exports = { checkState };
