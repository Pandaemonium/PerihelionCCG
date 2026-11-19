/* Headless AI-vs-AI simulation: checks the rules engine for crashes, stuck games and
 * broken invariants, and prints faction win rates as a rough balance check.
 * Usage: node test/sim.js [gamesPerMatchup]
 */
require('../js/cards.js');
require('../js/engine.js');
require('../js/ai.js');
const { Engine: E, AI, FACTIONS, CARDS } = globalThis.Veyra;

const N = parseInt(process.argv[2] || '40', 10);
const ids = Object.keys(FACTIONS);
const wins = {}, games = {};
ids.forEach((a) => { wins[a] = 0; games[a] = 0; });
let total = 0, draws = 0, turnSum = 0, firstWins = 0, problems = 0;
const played = {};
const matrix = {};

function check(g, where) {
  g.players.forEach((p) => {
    const bad = (m) => { problems++; console.error(`INVARIANT (${where}): ${m}`); };
    if (p.board.length > E.MAX_BOARD) bad('board overflow');
    if (p.hand.length > E.MAX_HAND) bad('hand overflow');
    if (p.energy < 0) bad('negative energy');
    p.board.forEach((u) => {
      if (u.owner !== p.id) bad('unit owner mismatch ' + u.id);
      if (!g.over && u.hp <= 0) bad('dead unit left on board ' + u.id);
      if (Number.isNaN(u.atk) || Number.isNaN(u.hp)) bad('NaN stats ' + u.id);
    });
    p.hand.forEach((h) => { if (!CARDS[h.id]) bad('unknown card ' + h.id); });
  });
}

for (const a of ids) for (const b of ids) {
  for (let n = 0; n < N; n++) {
    const first = n % 2;
    const g = E.newGame(a, b, 1000 + total * 7919, first);
    const starter = g.active;
    let steps = 0;
    while (!g.over && g.turn < 120) {
      const pid = g.active;
      let acts = 0;
      for (;;) {
        const act = AI.choose(g, pid);
        if (!act || acts++ > 60) break;
        if (!AI.apply(g, pid, act)) { problems++; console.error('AI chose illegal action', act); break; }
        if (act.type === 'play') played[act.id] = (played[act.id] || 0) + 1;
        check(g, 'after ' + act.type);
        if (g.over) break;
        if (++steps > 5000) break;
      }
      if (!g.over) { E.endTurn(g, pid); check(g, 'end turn'); }
      g.events.length = 0;
    }
    total++;
    turnSum += g.turn;
    games[a]++; games[b]++;
    if (!g.over) { problems++; console.error(`game did not finish: ${a} vs ${b}`); continue; }
    if (g.winner === -1) { draws++; continue; }
    wins[g.winner === 0 ? a : b]++;
    if (a !== b) { const k = a + ' vs ' + b; matrix[k] = (matrix[k] || 0) + (g.winner === 0 ? 1 : 0); }
    if (g.winner === starter) firstWins++;
  }
}

console.log(`${total} games, avg ${(turnSum / total).toFixed(1)} turns, ${draws} draws, first player won ${(100 * firstWins / total).toFixed(0)}%`);
ids.forEach((a) => console.log(`  ${a.padEnd(10)} ${(100 * wins[a] / games[a]).toFixed(1)}% wins`));
Object.keys(matrix).forEach((k) => console.log(`    ${k.padEnd(24)} ${(100 * matrix[k] / N).toFixed(0)}%`));
const never = Object.keys(CARDS).filter((id) => !CARDS[id].token && !played[id]);
if (never.length) console.log('never played:', never.join(', '));
console.log(problems ? `${problems} PROBLEMS` : 'no problems found');
process.exit(problems ? 1 : 0);
