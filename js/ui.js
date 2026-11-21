/* VEYRA — browser UI: screens, rendering, input, animation and the enemy turn loop. */
(function () {
  'use strict';
  const V = window.Veyra;
  const E = V.Engine, AI = V.AI, CARDS = V.CARDS, FACTIONS = V.FACTIONS, KW = V.KEYWORDS;
  const HUMAN = 0, BOT = 1;
  const $ = (s, r) => (r || document).querySelector(s);
  const fx = $('#fx');
  const logEl = $('#log');

  let g = null;            // current game state
  /* Current selection, or null. Shapes:
   *   { kind:'card', hand, slot:{row,lanes} }        choosing a lane for a unit ('mu') or location ('ms')
   *   { kind:'card', hand, lane?, targets:[refs] }   choosing a unit / location / colony target
   *   { kind:'card', hand, cols:[lanes] }            choosing a lane for a lane-wide order
   *   { kind:'card', hand, confirm:true }            untargeted order: click the card again
   *   { kind:'unit', uid, targets:[refs], moves:[lanes] }
   *   { kind:'power', targets | cols | slot } */
  let sel = null;
  let busy = false;        // true while animations or the enemy turn are running
  let seen = new Set();    // unit/location uids already drawn once (for the entrance animation)
  let hintMsg = null;      // temporary message shown in the hint bar
  let myFaction = 'rootbound';
  let oppChoice = 'random';
  let speed = 1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed));
  const locked = () => busy || !g || g.over || g.active !== HUMAN;
  const facName = (id) => (id === 'neutral' ? 'Colonist' : FACTIONS[id].name.replace(/^The /, ''));
  const laneName = (lane) => 'lane ' + (lane + 1);

  /* ============================================================ card markup */
  function cardHTML(d, o) {
    o = o || {};
    const cost = o.cost == null ? d.cost : o.cost;
    const isUnit = d.type === 'unit';
    const isSite = d.type === 'site';
    const kind = isSite ? 'Location' : isUnit ? 'Unit' : 'Order';
    const body = d.text
      ? d.text + (d.flavor && d.text.length < 50 ? `<i style="display:block;margin-top:.5em">${d.flavor}</i>` : '')
      : d.flavor ? `<i>${d.flavor}</i>` : '';
    const hp = o.hp == null ? d.hp : o.hp;
    const stats = isUnit
      ? `<div class="c-atk ${o.atkCls || ''}">${o.atk == null ? d.atk : o.atk}</div><div class="c-hp ${o.hpCls || ''}">${hp}</div>`
      : isSite ? `<div class="c-hp c-int ${o.hpCls || ''}" title="Integrity">${hp}</div>` : '';
    return `<div class="card ${isUnit ? 'unit-card' : isSite ? 'site-card' : 'order'} f-${d.faction} ${o.cls || ''}" ${o.attrs || ''}>
      <div class="c-cost ${cost < d.cost ? 'cheap' : ''}">${cost}</div>
      <div class="c-art"><span>${d.art}</span></div>
      <div class="c-name">${d.name}</div>
      <div class="c-type">${kind} · ${facName(d.faction)}</div>
      <div class="c-text"><div>${body}</div></div>${stats}${o.extra || ''}
    </div>`;
  }

  const statCls = (now, base) => (now > base ? 'buffed' : now < base ? 'hurt' : '');
  const isTarget = (ref) => !!(sel && sel.targets && sel.targets.some((t) => E.sameRef(t, ref)));
  const unitKws = (u) => Object.keys(KW).filter((k) => (k === 'shield' || k === 'blitz' ? u.kw[k] : E.hasKw(g, u, k)));

  function unitHTML(u) {
    const d = CARDS[u.id];
    const cls = ['unit', 'f-' + d.faction];
    if (u.immobile) cls.push('fixed');
    if (E.hasKw(g, u, 'guard')) cls.push('guard');
    if (u.kw.shield) cls.push('shielded');
    if (!seen.has(u.uid)) cls.push('enter');
    if (g.active === u.owner && !u.immobile && (!u.ready || (u.attacked && u.moved) || (u.attacked && !E.hasKw(g, u, 'mobile')))) cls.push('asleep');
    if (u.owner === HUMAN && !locked()) {
      if (E.attackTargets(g, u).length) cls.push('ready');
      else if (E.moveTargets(g, u).length) cls.push('can-move');
    }
    if (sel && sel.kind === 'unit' && sel.uid === u.uid) cls.push('selected');
    if (isTarget({ k: 'u', uid: u.uid })) cls.push('targetable', u.owner === HUMAN ? 'friendly' : 'hostile');
    const kws = unitKws(u).map((k) => `<span title="${KW[k].name}">${KW[k].icon}</span>`);
    if (d.lastStand) kws.push('<span title="Last Stand">✝</span>');
    if (d.turnEnd || d.turnStart) kws.push('<span title="Every cycle">⟳</span>');
    if (d.onOrder) kws.push('<span title="Triggers on Orders">✦</span>');
    const hpCls = u.hp < u.maxHp ? 'hurt' : u.maxHp > d.hp ? 'buffed' : '';
    return `<div class="${cls.join(' ')}" data-uid="${u.uid}" data-card="${u.id}">
      <div class="u-name">${d.name}</div>
      <div class="u-art">${d.art}</div>
      <div class="u-kw">${kws.join('')}</div>
      <div class="c-atk ${statCls(u.atk, d.atk)}">${u.atk}</div>
      <div class="c-hp ${hpCls}">${u.hp}</div>
    </div>`;
  }

  function siteHTML(s) {
    const d = CARDS[s.id];
    const cls = ['site', 'f-' + d.faction];
    const staffed = !!E.stationed(g, s);
    if (d.needsStaff) cls.push(staffed ? 'working' : 'idle');
    if (d.needsEmpty && staffed) cls.push('idle');
    if (!seen.has(s.uid)) cls.push('enter');
    if (isTarget({ k: 's', uid: s.uid })) cls.push('targetable', s.owner === HUMAN ? 'friendly' : 'hostile');
    return `<div class="${cls.join(' ')}" data-site="${s.uid}" data-card="${s.id}">
      <div class="s-art">${d.art}</div>
      <div class="s-body"><div class="s-name">${d.name}</div><div class="s-brief">${d.brief || ''}</div></div>
      <div class="c-hp c-int ${s.hp < s.maxHp ? 'hurt' : ''}" title="Integrity">${s.hp}</div>
    </div>`;
  }

  /* ============================================================ rendering */
  function elFor(ref) {
    if (!ref) return null;
    if (ref.k === 'u') return $(`#lanes .unit[data-uid="${ref.uid}"]`);
    if (ref.k === 's') return $(`#lanes .site[data-site="${ref.uid}"]`);
    if (ref.k === 'c') return $(`#lanes .lane[data-lane="${ref.lane}"]`);
    return $(`#screen-game .portrait[data-leader="${ref.pid}"]`);
  }

  function renderLeader(pid) {
    const p = g.players[pid];
    const f = FACTIONS[p.faction];
    const pw = f.power;
    let pips = '';
    for (let i = 0; i < E.MAX_ENERGY; i++) pips += `<span class="pip ${i < p.energy ? 'have' : i < p.maxEnergy ? 'spent' : ''}"></span>`;
    const top = E.MILESTONES[E.MILESTONES.length - 1];
    const ticks = E.MILESTONES.map((m, i) =>
      `<span class="r-tick ${p.research >= m ? 'on' : ''}" style="left:${(100 * m) / top}%">${['I', 'II', 'III'][i]}</span>`).join('');
    const usable = pid === HUMAN && !locked() && E.canUsePower(g, pid);
    const pcls = ['power'];
    if (usable) pcls.push('usable');
    if (p.powerUsed) pcls.push('used');
    if (sel && sel.kind === 'power' && pid === HUMAN) pcls.push('selected');
    const tcls = isTarget({ k: 'l', pid }) ? 'targetable ' + (pid === HUMAN ? 'friendly' : 'hostile') : '';
    $('#leader-' + pid).innerHTML = `
      <div class="leader f-${p.faction} ${g.active === pid && !g.over ? 'active' : ''}">
        <div class="portrait ${tcls}" data-leader="${pid}" data-insp="leader">
          <span>${f.art}</span>
          ${p.armor > 0 ? `<div class="armor" title="Armor">${p.armor}</div>` : ''}
          <div class="hp ${p.hp < p.maxHp ? 'hurt' : ''}" title="Colony integrity">${Math.max(0, p.hp)}</div>
        </div>
        <div class="l-info">
          <div>
            <div class="l-name">${f.leader}</div>
            <div class="l-fac">${f.name}${pid === HUMAN ? ' · you' : ' · enemy'}</div>
          </div>
          <div class="energy" title="Energy">${pips}<span class="num">${p.energy}/${p.maxEnergy}</span></div>
          <div class="research" data-insp="research" data-pid="${pid}">
            <span class="num">🔬 ${p.research}</span>
            <div class="r-bar"><div class="r-fill" style="width:${Math.min(100, (100 * p.research) / top)}%"></div>${ticks}</div>
          </div>
          <div class="counts">Deck ${p.deck.length} · Hand ${p.hand.length}</div>
        </div>
        <button class="${pcls.join(' ')}" data-power="${pid}" data-insp="power">
          <span class="p-cost">${E.powerCost(g, pid)}</span>
          <span class="p-art">${pw.art}</span>
          <span class="p-name">${pw.name}</span>
        </button>
      </div>`;
  }

  function renderField() {
    const selUnit = sel && sel.kind === 'unit' ? E.find(g, sel.uid) : null;
    const reach = selUnit ? E.reach(g, selUnit.unit) : 0;
    let html = '';
    for (let lane = 0; lane < E.LANES; lane++) {
      const eu = E.unitAt(g, BOT, lane), es = E.siteAt(g, BOT, lane);
      const mu = E.unitAt(g, HUMAN, lane), ms = E.siteAt(g, HUMAN, lane);
      const lcls = ['lane'];
      if (selUnit && Math.abs(lane - selUnit.unit.lane) <= reach) lcls.push('reach');
      if (sel && sel.cols && sel.cols.includes(lane)) lcls.push('coltarget');
      const slotOpen = (row) => sel && sel.slot && sel.slot.row === row && sel.slot.lanes.includes(lane);
      let slot = '<div class="slot"></div>';
      if (!mu) {
        if (slotOpen('mu')) slot = `<div class="slot slot-target">${sel.kind === 'power' ? 'Place' : 'Deploy'}</div>`;
        else if (sel && sel.kind === 'unit' && sel.moves.includes(lane)) slot = '<div class="slot slot-move">Move</div>';
      }
      const plot = !ms && slotOpen('ms') ? '<div class="plot slot-target">Build</div>' : '<div class="plot"></div>';
      html += `<div class="${lcls.join(' ')}" data-lane="${lane}">
        <div class="cell site-cell enemy" data-row="es">${es ? siteHTML(es) : '<div class="plot"></div>'}</div>
        <div class="cell unit-cell enemy" data-row="eu">${eu ? unitHTML(eu) : '<div class="slot"></div>'}</div>
        <div class="lane-gap">${lane + 1}</div>
        <div class="cell unit-cell mine" data-row="mu">${mu ? unitHTML(mu) : slot}</div>
        <div class="cell site-cell mine" data-row="ms">${ms ? siteHTML(ms) : plot}</div>
      </div>`;
    }
    $('#lanes').innerHTML = html;
  }

  function renderHand() {
    const el = $('#hand-0');
    const p = g.players[HUMAN];
    el.innerHTML = p.hand.map((hc) => {
      const cls = [];
      if (!locked() && E.canPlay(g, HUMAN, hc)) cls.push('playable');
      if (sel && sel.kind === 'card' && sel.hand === hc.uid) cls.push('selected');
      return cardHTML(CARDS[hc.id], { cost: E.cost(g, HUMAN, hc), cls: cls.join(' '), attrs: `data-hand="${hc.uid}" data-card="${hc.id}"` });
    }).join('');
    const cards = el.children;
    const n = cards.length;
    if (n > 1) {
      const cw = cards[0].offsetWidth;
      const W = el.clientWidth - 16;
      const gap = Math.round(cw * 0.05);
      let ml = gap;
      if (n * cw + (n - 1) * gap > W) ml = (W - n * cw) / (n - 1);
      for (let i = 1; i < n; i++) cards[i].style.marginLeft = ml + 'px';
    }
    $('#hand-1').innerHTML = g.players[BOT].hand.map(() => '<div class="card-back">✦</div>').join('');
  }

  function defaultHint() {
    if (g.over) return '';
    if (g.active !== HUMAN) return 'The enemy is acting…';
    if (busy) return '';
    if (!sel) return 'Your turn. Click a card to play it, or a glowing unit to attack or move.';
    if (sel.kind === 'unit') {
      const name = CARDS[E.find(g, sel.uid).unit.id].name;
      if (sel.targets.length && sel.moves.length) return `${name}: click a red target to attack, or a blue slot to move.`;
      if (sel.targets.length) return `${name}: click a red target to attack.`;
      return `${name}: click a blue slot to move one lane.`;
    }
    const name = sel.kind === 'power'
      ? FACTIONS[g.players[HUMAN].faction].power.name
      : CARDS[g.players[HUMAN].hand.find((h) => h.uid === sel.hand).id].name;
    if (sel.slot) return sel.slot.row === 'ms' ? `Choose a plot to build ${name} on.` : `Choose a lane for ${name}.`;
    if (sel.cols) return `Choose a lane for ${name}.`;
    if (sel.confirm) return `Click the card again to play ${name}.`;
    return `Choose a target for ${name}.`;
  }

  function renderMid() {
    const h = $('#hint');
    h.textContent = hintMsg ? hintMsg.text : defaultHint();
    h.classList.toggle('warn', !!(hintMsg && hintMsg.warn));
    const btn = $('#end-turn');
    btn.disabled = locked();
    btn.textContent = g.active === HUMAN ? 'End Turn' : 'Enemy Turn';
    const p = g.players[HUMAN];
    const idle = !locked() && !p.hand.some((hc) => E.canPlay(g, HUMAN, hc))
      && !p.board.some((u) => E.attackTargets(g, u).length) && !E.canUsePower(g, HUMAN);
    btn.classList.toggle('nudge', idle);
  }

  function render() {
    if (!g) return;
    renderLeader(0);
    renderLeader(1);
    renderField();
    renderHand();
    renderMid();
    g.players.forEach((p) => { p.board.forEach((u) => seen.add(u.uid)); p.sites.forEach((s) => seen.add(s.uid)); });
  }

  function warn(text) {
    hintMsg = { text, warn: true };
    renderMid();
  }

  /* ============================================================ inspector */
  const GLOSSARY = [
    [/Deploy:/, 'Deploy', 'Happens when the unit is played from your hand.'],
    [/Last Stand:/, 'Last Stand', 'Happens when the unit is destroyed.'],
    [/Cycle End:/, 'Cycle End', 'Happens at the end of each of your turns.'],
    [/Cycle Start:/, 'Cycle Start', 'Happens at the start of each of your turns.'],
    [/Tech \d+:/, 'Tech', 'Active while your Research is at least that number.'],
    [/stationed/, 'Stationed', 'A unit is stationed at a location while it stands in the same lane.'],
    [/Reserve Cell/, 'Reserve Cell', 'A free Order that gives 1 Energy this turn.'],
    [/Armor/, 'Armor', 'Absorbs damage to your colony before its integrity.'],
    [/neighbouring/, 'Neighbouring lanes', 'The lanes directly left and right.'],
  ];

  function inspectCard(id, o) {
    const d = CARDS[id];
    const opt = {};
    let kws = Object.keys(KW).filter((k) => d.kw && d.kw[k]);
    const notes = [];
    if (o.uid != null && g) {
      const f = E.find(g, o.uid);
      if (f) {
        const u = f.unit;
        opt.atk = u.atk; opt.hp = u.hp;
        opt.atkCls = statCls(u.atk, d.atk);
        opt.hpCls = u.hp < u.maxHp ? 'hurt' : u.maxHp > d.hp ? 'buffed' : '';
        kws = unitKws(u);
      }
    }
    if (o.site != null && g) {
      const f = E.findSite(g, o.site);
      if (f) {
        opt.hp = f.site.hp;
        opt.hpCls = f.site.hp < f.site.maxHp ? 'hurt' : '';
        const u = E.stationed(g, f.site);
        notes.push(`<div><b>${u ? 'Staffed' : 'Unstaffed'}</b> — ${u ? CARDS[u.id].name + ' is stationed here.' : 'No unit is stationed in this lane.'}</div>`);
      }
    }
    if (o.hand != null && g) {
      const hc = g.players[HUMAN].hand.find((h) => h.uid === o.hand);
      if (hc) opt.cost = E.cost(g, HUMAN, hc);
    }
    kws.forEach((k) => notes.push(`<div><b>${KW[k].name}</b> — ${KW[k].text}</div>`));
    GLOSSARY.forEach(([re, name, text]) => { if (re.test(d.text)) notes.push(`<div><b>${name}</b> — ${text}</div>`); });
    if (d.type === 'site') notes.push(`<div><b>Location</b> — Built behind a lane. If it is destroyed, its colony takes ${E.RAZE_DAMAGE} damage.</div>`);
    if (d.type === 'order' && !d.noResearch) notes.push('<div><b>Order</b> — Playing it gives you 1 Research.</div>');
    $('#inspector').innerHTML = cardHTML(d, opt) + `<div class="insp-notes">${[...new Set(notes)].join('')}</div>`;
  }

  function inspectLeader(pid, what) {
    const p = g.players[pid];
    const f = FACTIONS[p.faction];
    let html;
    if (what === 'power') {
      html = `<div class="big">${f.power.art}</div><div class="nm">${f.power.name}</div>
        <div class="sub">Leader power · costs ${E.powerCost(g, pid)} Energy · once per turn</div>
        <div>${f.power.text}</div>`;
    } else if (what === 'research') {
      html = `<div class="big">🔬</div><div class="nm">Research ${p.research}</div>
        <div class="sub">Every Order you play gives 1 Research. So does a staffed Landing Site, each turn.</div>
        <div class="insp-notes">${E.MILESTONES.map((m, i) =>
          `<div><b>${m} Research</b> — ${E.MILESTONE_TEXT[i]} ${p.research >= m ? '✔' : ''}</div>`).join('')}</div>`;
    } else {
      html = `<div class="big">${f.art}</div><div class="nm">${f.leader}</div>
        <div class="sub">${f.name}<br>“${f.motto}”</div>
        <div>Colony integrity ${Math.max(0, p.hp)} / ${p.maxHp}${p.armor ? ` · Armor ${p.armor}` : ''}</div>
        <div class="sub">${f.style}</div>`;
    }
    $('#inspector').innerHTML = `<div class="insp-leader f-${p.faction}">${html}</div>`;
  }

  document.addEventListener('mouseover', (e) => {
    if (!g || !e.target.closest('#screen-game')) return;
    const t = e.target.closest('[data-card],[data-insp]');
    if (!t) return;
    if (t.dataset.card) {
      inspectCard(t.dataset.card, {
        uid: t.dataset.uid ? +t.dataset.uid : null,
        site: t.dataset.site ? +t.dataset.site : null,
        hand: t.dataset.hand ? +t.dataset.hand : null,
      });
    } else {
      const holder = t.closest('[data-pid],[data-leader],[data-power]');
      const pid = +(holder.dataset.pid || holder.dataset.leader || holder.dataset.power);
      inspectLeader(pid, t.dataset.insp);
    }
  });

  /* ============================================================ log + effects */
  function logLine(html, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.innerHTML = html;
    logEl.appendChild(d);
    while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  const who = (pid) => (pid === HUMAN ? 'You' : 'The enemy');
  const whose = (pid) => (pid === HUMAN ? 'Your' : 'Enemy');
  function refName(ref) {
    if (ref.k === 'l') return ref.pid === HUMAN ? 'your colony' : 'the enemy colony';
    if (ref.k === 'c') return laneName(ref.lane);
    if (ref.k === 's') {
      const f = E.findSite(g, ref.uid);
      return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + CARDS[f.site.id].name : 'a location';
    }
    const f = E.find(g, ref.uid);
    return f ? (f.pid === HUMAN ? 'your ' : 'the enemy ') + CARDS[f.unit.id].name : 'a unit';
  }

  function floater(rect, e, i) {
    const d = document.createElement('div');
    d.className = 'floater ' + e.t;
    d.textContent = e.t === 'dmg' ? '-' + e.n : e.t === 'heal' ? '+' + e.n : e.t === 'armor' ? '🛡+' + e.n : 'BLOCKED';
    d.style.left = rect.left + rect.width / 2 + ((i % 3) - 1) * rect.width * 0.22 * Math.min(1, i) + 'px';
    d.style.top = rect.top + rect.height / 2 + 'px';
    d.style.animationDelay = i * 90 * speed + 'ms';
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1300 + i * 90);
  }

  function ghost(el) {
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true);
    c.classList.remove('enter', 'selected', 'ready', 'can-move', 'targetable', 'flagged');
    c.classList.add('ghost-unit');
    c.style.left = r.left + 'px';
    c.style.top = r.top + 'px';
    c.style.width = r.width + 'px';
    c.style.height = r.height + 'px';
    c.removeAttribute('data-uid');
    c.removeAttribute('data-site');
    fx.appendChild(c);
    setTimeout(() => c.remove(), 520);
  }

  async function banner(text, foe) {
    const d = document.createElement('div');
    d.className = 'banner' + (foe ? ' foe' : '');
    d.textContent = text;
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1150);
    await sleep(850);
  }

  async function flash(html, target, label) {
    const d = document.createElement('div');
    d.className = 'flash';
    d.innerHTML = `<div class="who">${label}</div>${html}`;
    fx.appendChild(d);
    const t = elFor(target);
    if (t) t.classList.add('flagged');
    await sleep(1150);
    d.remove();
    if (t) t.classList.remove('flagged');
  }

  async function lunge(from, to) {
    if (!from || !to || !from.animate || speed === 0) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    from.style.zIndex = 60;
    try {
      await from.animate([
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${-dx * 0.06}px, ${-dy * 0.14}px) scale(1.1)`, offset: 0.35 },
        { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1.05)` },
      ], { duration: 340, easing: 'ease-in', fill: 'forwards' }).finished;
    } catch (err) { /* animation cancelled */ }
  }

  /** Turn the engine's event queue into log lines, floating numbers, slides and death ghosts, then redraw. */
  function flush() {
    const evs = g.events.splice(0);
    const pend = [];
    const slides = [];
    evs.forEach((e) => {
      const foe = e.pid === BOT ? 'foe' : '';
      if (e.t === 'dmg' || e.t === 'heal' || e.t === 'block' || e.t === 'armor') {
        const el = elFor(e.ref);
        pend.push({ e, rect: el ? el.getBoundingClientRect() : null });
      } else if (e.t === 'death') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        logLine(`${whose(e.pid)} ${CARDS[e.id].name} is destroyed.`, foe);
      } else if (e.t === 'raze') {
        const el = elFor(e.ref);
        if (el) ghost(el);
        logLine(`${whose(e.pid)} ${CARDS[e.id].name} is razed — the colony takes ${E.RAZE_DAMAGE} damage.`, foe);
      } else if (e.t === 'move') {
        const el = elFor(e.ref);
        if (el) slides.push({ ref: e.ref, rect: el.getBoundingClientRect() });
      } else if (e.t === 'turn') {
        logLine(`Cycle ${Math.ceil(e.turn / 2)} — ${e.pid === HUMAN ? 'your turn' : 'enemy turn'}`, 'turn');
      } else if (e.t === 'milestone') {
        logLine(`${who(e.pid)} reached ${E.MILESTONE_TEXT[e.level]}`, 'sys');
      } else if (e.t === 'fatigue') {
        logLine(`${e.pid === HUMAN ? 'Your' : "The enemy's"} deck is empty — the colony takes ${e.n} damage.`, 'sys');
      } else if (e.t === 'burn') {
        logLine(`${e.pid === HUMAN ? 'Your' : "The enemy's"} hand is full — ${e.pid === HUMAN ? CARDS[e.id].name : 'a card'} is lost.`, 'sys');
      } else if (e.t === 'gain' && e.pid === HUMAN) {
        logLine(`You receive <b>${CARDS[e.id].name}</b>.`);
      } else if (e.t === 'steal') {
        logLine(`${who(e.pid)} seized control of a unit.`, foe);
      }
    });
    render();
    slides.forEach((sl) => {
      const el = elFor(sl.ref);
      if (!el || !el.animate || speed === 0) return;
      const r = el.getBoundingClientRect();
      el.animate([{ transform: `translate(${sl.rect.left - r.left}px, ${sl.rect.top - r.top}px)` }, { transform: 'translate(0,0)' }],
        { duration: 260, easing: 'ease-out' });
    });
    const count = {};
    pend.forEach((p) => {
      let rect = p.rect;
      if (!rect) { const el = elFor(p.e.ref); if (el) rect = el.getBoundingClientRect(); }
      if (!rect) return;
      const key = p.e.ref.k + (p.e.ref.k === 'l' ? p.e.ref.pid : p.e.ref.uid);
      count[key] = (count[key] || 0) + 1;
      floater(rect, p.e, count[key] - 1);
    });
  }

  /* ============================================================ actions */
  async function act(pid, a) {
    const foe = pid === BOT ? 'foe' : '';
    if (a.type === 'attack') {
      const f = E.find(g, a.uid);
      logLine(`${whose(pid)} ${CARDS[f.unit.id].name} attacks ${refName(a.target)}.`, foe);
      await lunge(elFor({ k: 'u', uid: a.uid }), elFor(a.target));
      E.attack(g, pid, a.uid, a.target);
    } else if (a.type === 'move') {
      const f = E.find(g, a.uid);
      logLine(`${whose(pid)} ${CARDS[f.unit.id].name} moves to ${laneName(a.lane)}.`, foe);
      E.move(g, pid, a.uid, a.lane);
    } else if (a.type === 'play') {
      const hc = g.players[pid].hand.find((h) => h.uid === a.hand);
      const d = CARDS[hc.id];
      const verb = d.type === 'unit' ? ['deploy', 'deploys'] : d.type === 'site' ? ['build', 'builds'] : ['play', 'plays'];
      const where = a.lane != null ? ' in ' + laneName(a.lane) : '';
      logLine(`${who(pid)} ${verb[pid === HUMAN ? 0 : 1]} <b>${d.name}</b>${where}${a.target ? (where ? ', targeting ' : ' on ') + refName(a.target) : ''}.`, foe);
      if (pid === BOT) await flash(cardHTML(d, { cost: E.cost(g, pid, hc) }), a.target || (a.lane != null ? { k: 'c', lane: a.lane } : null), 'Enemy plays');
      E.playCard(g, pid, a.hand, a.target, a.lane);
    } else if (a.type === 'power') {
      const f = FACTIONS[g.players[pid].faction];
      logLine(`${who(pid)} ${pid === HUMAN ? 'use' : 'uses'} <b>${f.power.name}</b>${a.target ? ' on ' + refName(a.target) : ''}.`, foe);
      if (pid === BOT) {
        await flash(`<div class="power-card f-${f.id}"><div class="big">${f.power.art}</div><div class="nm">${f.power.name}</div><div>${f.power.text}</div></div>`,
          a.target, 'Enemy leader power');
      }
      E.usePower(g, pid, a.target);
    }
    flush();
  }

  async function humanAct(a) {
    busy = true;
    sel = null;
    hintMsg = null;
    renderMid(); // greys out End Turn while the action animates
    await act(HUMAN, a);
    busy = false;
    if (g.over) return gameOver();
    render();
  }

  async function botTurn() {
    busy = true;
    render();
    await sleep(450);
    let n = 0;
    while (!g.over && g.active === BOT && n++ < 80) {
      const a = AI.choose(g, BOT);
      if (!a) break;
      await act(BOT, a);
      await sleep(a.type === 'move' ? 520 : 420);
    }
    if (!g.over) { E.endTurn(g, BOT); flush(); }
    if (g.over) { busy = false; return gameOver(); }
    await banner('Your Turn');
    busy = false;
    render();
  }

  async function endTurn() {
    if (locked()) return;
    busy = true;
    sel = null;
    hintMsg = null;
    E.endTurn(g, HUMAN);
    flush();
    if (g.over) { busy = false; return gameOver(); }
    await banner('Enemy Turn', true);
    await botTurn();
  }

  /* ============================================================ input */
  /** Shape a selection around the kind of target a card or power asks for. */
  function withTargets(base, spec, ts) {
    if (spec === 'column') base.cols = ts.map((t) => t.lane);
    else if (spec === 'emptyLane') base.slot = { row: 'mu', lanes: ts.map((t) => t.lane) };
    else base.targets = ts;
    return base;
  }

  function clickHand(uid) {
    const p = g.players[HUMAN];
    const hc = p.hand.find((h) => h.uid === uid);
    if (!hc) return;
    const d = CARDS[hc.id];
    if (sel && sel.kind === 'card' && sel.hand === uid) {
      if (sel.confirm) return humanAct({ type: 'play', hand: uid, target: null, lane: null });
      sel = null;
      return render();
    }
    if (!E.canPlay(g, HUMAN, hc)) {
      sel = null;
      render();
      const el = $(`#hand-0 [data-hand="${uid}"]`);
      if (el) el.classList.add('shake');
      const cost = E.cost(g, HUMAN, hc);
      if (cost > p.energy) return warn(`Not enough Energy for ${d.name} (${cost} needed, ${p.energy} available).`);
      if (d.type === 'unit') return warn('Every lane already holds one of your units.');
      if (d.type === 'site') return warn('Every plot already holds one of your locations.');
      return warn(`${d.name} has no valid target right now.`);
    }
    if (d.type === 'unit') sel = { kind: 'card', hand: uid, slot: { row: 'mu', lanes: E.emptyLanes(g, HUMAN) } };
    else if (d.type === 'site') sel = { kind: 'card', hand: uid, slot: { row: 'ms', lanes: E.emptyPlots(g, HUMAN) } };
    else if (d.target) sel = withTargets({ kind: 'card', hand: uid }, d.target, E.cardTargets(g, HUMAN, d));
    else sel = { kind: 'card', hand: uid, confirm: true };
    render();
  }

  function clickPower() {
    if (sel && sel.kind === 'power') { sel = null; return render(); }
    const p = g.players[HUMAN];
    const pw = FACTIONS[p.faction].power;
    if (!E.canUsePower(g, HUMAN)) {
      sel = null;
      render();
      if (p.powerUsed) return warn(`${pw.name} has already been used this turn.`);
      if (p.energy < E.powerCost(g, HUMAN)) return warn(`Not enough Energy for ${pw.name}.`);
      return warn(`${pw.name} cannot be used right now.`);
    }
    if (!pw.target) return humanAct({ type: 'power', target: null });
    sel = withTargets({ kind: 'power' }, pw.target, E.targets(g, HUMAN, pw.target));
    render();
  }

  function resolveSelection(ref) {
    if (sel.kind === 'card') return humanAct({ type: 'play', hand: sel.hand, target: ref, lane: sel.lane == null ? null : sel.lane });
    if (sel.kind === 'unit') return humanAct({ type: 'attack', uid: sel.uid, target: ref });
    return humanAct({ type: 'power', target: ref });
  }

  /** A lane was picked for the selected unit card, location card or lane-placing power. */
  function chooseLane(lane) {
    if (sel.kind === 'power') return resolveSelection({ k: 'c', lane });
    const hc = g.players[HUMAN].hand.find((h) => h.uid === sel.hand);
    const d = CARDS[hc.id];
    if (d.type === 'order') return resolveSelection({ k: 'c', lane });
    if (E.needsTarget(g, HUMAN, hc)) {
      sel = { kind: 'card', hand: sel.hand, lane, targets: E.cardTargets(g, HUMAN, d) };
      return render();
    }
    return humanAct({ type: 'play', hand: sel.hand, target: null, lane });
  }

  function explainBadAttack(ref) {
    const u = E.find(g, sel.uid).unit;
    const near = E.inReach(g, u);
    if (!E.canAttack(g, u)) return warn('That unit can still move, but it cannot attack this turn.');
    if (ref.k === 'u') {
      const t = E.find(g, ref.uid).unit;
      if (Math.abs(t.lane - u.lane) > E.reach(g, u)) return warn('Out of reach — a unit attacks its own lane and the lanes beside it.');
      return warn('An enemy Guard in reach must be attacked first.');
    }
    if (u.summonedTurn === g.turn) return warn('On the turn it arrives, a Blitz unit can only attack units.');
    if (near.length && !E.hasKw(g, u, 'aerial')) return warn('An enemy unit is in reach — it screens the locations and colony behind it.');
    return warn('That location is out of reach.');
  }

  function clickRef(ref) {
    if (sel && isTarget(ref)) return resolveSelection(ref);
    const f = ref.k === 'u' ? E.find(g, ref.uid) : null;
    if (f && f.pid === HUMAN) {
      const u = f.unit;
      const ts = E.attackTargets(g, u);
      const mv = E.moveTargets(g, u);
      if (ts.length || mv.length) { sel = { kind: 'unit', uid: u.uid, targets: ts, moves: mv }; return render(); }
      sel = null;
      render();
      if (u.immobile) return warn(`${CARDS[u.id].name} holds its lane: it cannot move or attack.`);
      if (u.summonedTurn === g.turn) return warn(u.ready ? 'Nothing is in reach, and units cannot move on the turn they arrive.' : 'Units cannot act on the turn they arrive.');
      if (u.attacked || u.moved) return warn('That unit has already acted this turn.');
      return warn('That unit has nothing in reach and no empty lane beside it.');
    }
    const hostile = f ? true : ref.k === 's' ? E.findSite(g, ref.uid).pid === BOT : ref.pid === BOT;
    if (sel && sel.kind === 'unit' && hostile) return explainBadAttack(ref);
    if (sel && sel.targets) return warn('That is not a valid target.');
    if (sel) { sel = null; render(); }
  }

  $('#screen-game').addEventListener('click', (e) => {
    if (e.target.closest('#side')) return;
    if (e.target.closest('#end-turn')) return endTurn();
    if (locked()) return;
    hintMsg = null;
    const hand = e.target.closest('[data-hand]');
    if (hand) return clickHand(+hand.dataset.hand);
    const power = e.target.closest('[data-power]');
    if (power) { if (+power.dataset.power === HUMAN) clickPower(); return; }

    const laneEl = e.target.closest('.lane');
    const cell = e.target.closest('.cell');
    if (sel && laneEl) {
      const lane = +laneEl.dataset.lane;
      const row = cell ? cell.dataset.row : null;
      if (sel.cols && sel.cols.includes(lane)) return resolveSelection({ k: 'c', lane });
      if (sel.slot && row === sel.slot.row && sel.slot.lanes.includes(lane)) return chooseLane(lane);
      if (sel.kind === 'unit' && row === 'mu' && sel.moves.includes(lane) && !E.unitAt(g, HUMAN, lane)) {
        return humanAct({ type: 'move', uid: sel.uid, lane });
      }
    }
    const unit = e.target.closest('.unit[data-uid]');
    if (unit) return clickRef({ k: 'u', uid: +unit.dataset.uid });
    const site = e.target.closest('.site[data-site]');
    if (site) return clickRef({ k: 's', uid: +site.dataset.site });
    const leader = e.target.closest('[data-leader]');
    if (leader) return clickRef({ k: 'l', pid: +leader.dataset.leader });
    if (sel) sel = null;
    render();
  });

  function cancel() {
    if (!$('#modal').classList.contains('hidden')) { if (modalClosable) closeModal(); return; }
    if (sel || hintMsg) { sel = null; hintMsg = null; render(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
  $('#screen-game').addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); });
  window.addEventListener('resize', () => { if (g && !$('#screen-game').classList.contains('hidden')) render(); });

  /* ============================================================ modals */
  let modalClosable = true;
  function openModal(html, closable) {
    modalClosable = closable !== false;
    $('#modal-box').innerHTML = html;
    $('#modal').classList.remove('hidden');
    $('#modal-box').scrollTop = 0;
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && modalClosable) return closeModal();
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const what = b.dataset.do;
    closeModal();
    if (what === 'rematch') startGame();
    if (what === 'title') showTitle();
  });

  function showHelp() {
    const kws = Object.keys(KW).map((k) => `<span>${KW[k].icon} ${KW[k].name}</span><span>${KW[k].text}</span>`).join('');
    openModal(`<div class="help">
      <h2>How to play</h2>
      <div class="cols">
        <div>
          <h3>Goal</h3>
          <p>Reduce the enemy colony's integrity from ${E.START_HP} to 0 before they do the same to yours.</p>
          <h3>The board</h3>
          <ul>
            <li>Each side has <b>${E.LANES} lanes</b>. A lane holds one <b>unit</b> in front and one <b>location</b> behind it.</li>
            <li>A unit <b>reaches</b> its own lane and the lane on either side.</li>
            <li>If any enemy unit is in reach, your unit must attack a unit. If none is, it may attack an enemy
              location in reach, or the enemy colony itself.</li>
            <li>So a unit standing in front of a location protects it. When a location is destroyed, its colony takes ${E.RAZE_DAMAGE} damage.</li>
            <li>Instead of attacking, a unit may <b>move</b> one lane sideways into an empty slot.</li>
          </ul>
          <h3>Your turn</h3>
          <ul>
            <li>You draw a card and your <b>Energy</b> refills. Maximum Energy grows by 1 each turn, up to ${E.MAX_ENERGY}.</li>
            <li>Play units and locations into a lane of your choice. <b>Orders</b> take effect once and can target anywhere.</li>
            <li>Units cannot attack or move on the turn they arrive. Attacker and defender damage each other.</li>
            <li>Your <b>leader power</b> can be used once per turn.</li>
          </ul>
          <h3>Research</h3>
          <p>Each Order gives 1 Research, and so does your <b>Landing Site</b> every turn a unit is stationed in its lane.
          Reaching ${E.MILESTONES.join(', ').replace(/, ([^,]*)$/, ' and $1')} Research grants a permanent Breakthrough, and cards marked <b>Tech N</b> grow stronger at that level.</p>
        </div>
        <div>
          <h3>Controls</h3>
          <ul>
            <li>Click a card, then a glowing lane or target, to play it.</li>
            <li>Click one of your units: red marks what it can attack, blue marks where it can move.</li>
            <li>Esc or right-click cancels a selection.</li>
            <li>Hover anything to read it in the left panel.</li>
          </ul>
          <h3>Keywords</h3>
          <div class="kw-list">${kws}
            <span>Deploy</span><span>Happens when the unit is played from hand.</span>
            <span>Last Stand</span><span>Happens when the unit is destroyed.</span>
            <span>Cycle End</span><span>Happens at the end of each of your turns.</span>
            <span>Stationed</span><span>A unit is stationed at the location in its own lane.</span>
          </div>
        </div>
      </div>
      <div class="modal-actions"><button class="btn primary" data-do="close">Got it</button></div>
    </div>`);
  }

  function showDeck(fid) {
    const f = FACTIONS[fid];
    const one = (id, qty) => cardHTML(CARDS[id], { extra: `<div class="qty">${qty}</div>` });
    const sorted = (ids) => ids.slice().sort((a, b) => CARDS[a].cost - CARDS[b].cost);
    openModal(`<div class="f-${fid}">
      <h2 style="color:var(--fc)">${f.art} ${f.name}</h2>
      <p>${f.style} Every deck is 30 cards: two of each faction card and one of each colonist card.
        Both sides also begin with a Landing Site already built in the centre lane.</p>
      <h3>Faction cards</h3>
      <div class="gallery">${sorted(f.cards).map((id) => one(id, '×2')).join('')}</div>
      <h3>Colonist cards</h3>
      <div class="gallery">${sorted(V.NEUTRAL_DECK).map((id) => one(id, '×1')).join('')}${one('landing', 'start')}</div>
      <div class="modal-actions"><button class="btn primary" data-do="close">Close</button></div>
    </div>`);
  }

  function gameOver() {
    render();
    const win = g.winner === HUMAN;
    const tie = g.winner === -1;
    const f = FACTIONS[g.players[HUMAN].faction];
    const title = tie ? 'Mutual Ruin' : win ? 'Victory' : 'Defeat';
    const text = tie
      ? 'Both colonies fall silent in the same hour. Veyra keeps what is left.'
      : win
        ? `${f.name} will decide what Veyra becomes. The other survivors can only watch.`
        : `The enemy banner rises over your last habitat. ${f.leader} is led away in silence.`;
    setTimeout(() => openModal(`<div class="result ${win ? 'win' : 'lose'}">
      <div class="big">${tie ? '🌑' : win ? f.art : '💥'}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      <p style="color:var(--muted)">The duel lasted ${Math.ceil(g.turn / 2)} cycles.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-do="title">Change faction</button>
        <button class="btn primary" data-do="rematch">Play again</button>
      </div>
    </div>`, false), 900 * speed);
  }

  /* ============================================================ screens */
  function renderTitle() {
    $('#faction-list').innerHTML = Object.values(FACTIONS).map((f) => `
      <div class="faction f-${f.id} ${f.id === myFaction ? 'chosen' : ''}" data-faction="${f.id}">
        <div class="f-glyph">${f.art}</div>
        <div class="f-name">${f.name}</div>
        <div class="f-leader">${f.leader}</div>
        <div class="f-motto">“${f.motto}”</div>
        <div class="f-style">${f.style}</div>
        <div class="f-power"><span>${f.power.art} ${f.power.name} (${f.power.cost})</span> — ${f.power.text}</div>
        <button class="btn ghost small f-deck" data-deck="${f.id}">View deck</button>
      </div>`).join('');
    const opts = [{ id: 'random', name: 'Random' }].concat(Object.values(FACTIONS).map((f) => ({ id: f.id, name: facName(f.id) })));
    $('#opp-chips').innerHTML = opts.map((o) =>
      `<span class="chip f-${o.id === 'random' ? 'neutral' : o.id} ${o.id === oppChoice ? 'on' : ''}" data-opp="${o.id}">${o.name}</span>`).join('');
  }

  function showTitle() {
    g = null;
    $('#screen-game').classList.add('hidden');
    $('#screen-title').classList.remove('hidden');
    renderTitle();
  }

  $('#screen-title').addEventListener('click', (e) => {
    const deck = e.target.closest('[data-deck]');
    if (deck) return showDeck(deck.dataset.deck);
    const fac = e.target.closest('[data-faction]');
    if (fac) { myFaction = fac.dataset.faction; return renderTitle(); }
    const opp = e.target.closest('[data-opp]');
    if (opp) { oppChoice = opp.dataset.opp; return renderTitle(); }
  });
  $('#btn-start').addEventListener('click', () => startGame());
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-help2').addEventListener('click', showHelp);
  $('#btn-quit').addEventListener('click', () => {
    openModal(`<div class="result"><h2 style="font-size:3.6rem">Abandon the colony?</h2>
      <p>This duel will be lost.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-do="close">Keep fighting</button>
        <button class="btn primary" data-do="title">Concede</button>
      </div></div>`);
  });

  function startGame(o) {
    o = o || {};
    const ids = Object.keys(FACTIONS);
    const opp = oppChoice === 'random' ? ids[Math.floor(Math.random() * ids.length)] : oppChoice;
    const seed = o.seed || ((Math.random() * 0x7fffffff) | 0) + 1;
    const first = o.first != null ? o.first : Math.random() < 0.5 ? 0 : 1;
    g = E.newGame(myFaction, opp, seed, first);
    sel = null;
    hintMsg = null;
    seen = new Set();
    logEl.innerHTML = '';
    $('#inspector').innerHTML = '<div class="insp-empty">Hover a card, unit or location to inspect it.</div>';
    $('#screen-title').classList.add('hidden');
    $('#screen-game').classList.remove('hidden');
    logLine(`${FACTIONS[myFaction].name} versus ${FACTIONS[opp].name}.`, 'sys');
    if (g.active === BOT) logLine('The enemy moves first. You start with an extra card and a Reserve Cell.', 'sys');
    else logLine('You move first. The enemy starts with an extra card and a Reserve Cell.', 'sys');

    if (o.auto) fastForward(o.auto);
    busy = true;
    flush();
    if (g.over) { busy = false; return gameOver(); }
    (async () => {
      if (g.active === HUMAN) {
        await banner('Your Turn');
        busy = false;
        render();
      } else {
        await banner('Enemy Turn', true);
        await botTurn();
      }
    })();
  }

  /** Debug aid (?auto=N): let the AI play both sides, without animation, until turn N on the human's move. */
  function fastForward(n) {
    let guard = 0;
    while (!g.over && (g.turn < n || g.active !== HUMAN) && guard++ < 400) {
      const pid = g.active;
      let a, k = 0;
      while (!g.over && (a = AI.choose(g, pid)) && k++ < 80) AI.apply(g, pid, a);
      if (!g.over) E.endTurn(g, pid);
    }
    g.events.length = 0;
  }

  /* ============================================================ boot */
  renderTitle();
  const q = new URLSearchParams(location.search);
  if (q.get('f') && FACTIONS[q.get('f')]) {
    myFaction = q.get('f');
    if (q.get('o') && FACTIONS[q.get('o')]) oppChoice = q.get('o');
    startGame({
      seed: +q.get('seed') || undefined,
      first: q.get('first') != null ? +q.get('first') : undefined,
      auto: +q.get('auto') || 0,
    });
  }
  if (q.get('modal') === 'help') showHelp();
  if (q.get('modal') === 'deck') showDeck(myFaction);
  window.VeyraUI = { get game() { return g; }, startGame, showTitle };
})();
