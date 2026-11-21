/* Headless AI-vs-AI simulation: checks the rules engine for crashes, stuck games and broken
 * invariants, and prints balance and board-usage figures.
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
let total = 0, draws = 0, turnSum = 0, firstWins = 0, problems = 0, longest = 0;
const played = {};
const matrix = {};
const stat = { moves: 0, attacksUnit: 0, attacksSite: 0, attacksFace: 0, built: 0, razed: 0, research: 0, landingAlive: 0, staffedTurns: 0, siteTurns: 0, fatigue: 0 };

function check(g, where) {
  g.players.forEach((p) => {
    const bad = (m) => { problems++; if (problems < 30) console.error(`INVARIANT (${where}): ${m}`); };
    if (p.hand.length > E.MAX_HAND) bad('hand overflow');
    if (p.energy < 0) bad('negative energy');
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
}

for (const a of ids) for (const b of ids) {
  for (let n = 0; n < N; n++) {
    const first = n % 2;
    const g = E.newGame(a, b, 1000 + total * 7919, first);
    const starter = g.active;
    let steps = 0;
    while (!g.over && g.turn < 160) {
      const pid = g.active;
      let acts = 0;
      for (;;) {
        const act = AI.choose(g, pid);
        if (!act || acts++ > 80) break;
        const sitesBefore = g.players[1 - pid].sites.length;
        if (!AI.apply(g, pid, act)) { problems++; console.error('AI chose illegal action', act); break; }
        if (act.type === 'play') { played[act.id] = (played[act.id] || 0) + 1; if (CARDS[act.id].type === 'site') stat.built++; }
        if (act.type === 'move') stat.moves++;
        if (act.type === 'attack') stat[act.target.k === 'u' ? 'attacksUnit' : act.target.k === 's' ? 'attacksSite' : 'attacksFace']++;
        stat.razed += Math.max(0, sitesBefore - g.players[1 - pid].sites.length);
        check(g, 'after ' + act.type);
        if (g.over) break;
        if (++steps > 8000) break;
      }
      if (!g.over) {
        g.players[pid].sites.forEach((s) => { if (CARDS[s.id].needsStaff) { stat.siteTurns++; if (E.stationed(g, s)) stat.staffedTurns++; } });
        E.endTurn(g, pid);
        check(g, 'end turn');
      }
      g.events.length = 0;
    }
    total++;
    turnSum += g.turn;
    longest = Math.max(longest, g.turn);
    games[a]++; games[b]++;
    g.players.forEach((p) => { stat.research += p.research; stat.fatigue += p.fatigue > 0 ? 1 : 0; if (p.sites.some((s) => s.id === 'landing')) stat.landingAlive++; });
    if (!g.over) { problems++; console.error(`game did not finish: ${a} vs ${b}`); continue; }
    if (g.winner === -1) { draws++; continue; }
    wins[g.winner === 0 ? a : b]++;
    if (a !== b) { const k = a + ' vs ' + b; matrix[k] = (matrix[k] || 0) + (g.winner === 0 ? 1 : 0); }
    if (g.winner === starter) firstWins++;
  }
}

const per = (x) => (x / total).toFixed(1);
console.log(`${total} games, avg ${(turnSum / total).toFixed(1)} turns (longest ${longest}), ${draws} draws, first player won ${(100 * firstWins / total).toFixed(0)}%`);
ids.forEach((a) => console.log(`  ${a.padEnd(10)} ${(100 * wins[a] / games[a]).toFixed(1)}% wins`));
Object.keys(matrix).forEach((k) => console.log(`    ${k.padEnd(24)} ${(100 * matrix[k] / N).toFixed(0)}%`));
console.log(`per game: ${per(stat.moves)} moves, attacks ${per(stat.attacksUnit)} on units / ${per(stat.attacksSite)} on locations / ${per(stat.attacksFace)} on colony`);
console.log(`per game: ${per(stat.built)} locations built, ${per(stat.razed)} razed; landing site survived ${(100 * stat.landingAlive / (2 * total)).toFixed(0)}%; staffed ${(100 * stat.staffedTurns / Math.max(1, stat.siteTurns)).toFixed(0)}% of the time`);
console.log(`avg final research ${(stat.research / (2 * total)).toFixed(1)}; decks ran out in ${(100 * stat.fatigue / (2 * total)).toFixed(0)}% of player-games`);
const never = Object.keys(CARDS).filter((id) => !CARDS[id].token && !played[id]);
if (never.length) console.log('never played:', never.join(', '));
console.log(problems ? `${problems} PROBLEMS` : 'no problems found');
process.exit(problems ? 1 : 0);
