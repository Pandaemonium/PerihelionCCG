/* TAU CETI — Planet Mode screen (prototype, phase A). Three parts:
 *   - the planet map: political colours, and each sector's cards as small unreadable tiles;
 *   - the sector panel: a "zoom" on the selected sector, with its cards readable and its neighbours;
 *   - the hand: your cards, played face down onto the map during planning.
 * After everyone commits, a playback steps through the turn: the reveal, movement tier by tier,
 * events, battles, then what got founded, captured and deployed.
 * Kept apart from ui.js on purpose: the lane game doesn't know this mode exists, apart from the
 * menu button and the script tags in index.html.
 */
(function (root) {
  'use strict';
  const V = root.TauCeti;
  const P = V.Planet, PA = V.PlanetAI, PC = V.PCARDS, FACTIONS = V.FACTIONS;
  const $ = (s) => document.querySelector(s);

  // Ring radii in SVG units, outermost ring first; the core fills the middle.
  const RADII = [[360, 500], [230, 360], [110, 230]];
  const CORE_R = 110;
  // Where a sector's (up to four) card tiles sit, relative to its centre.
  const TILE_W = 28, TILE_H = 36;
  const SLOTS = [[-15, -12], [15, -12], [-15, 28], [15, 28]];

  const ui = {
    g: null, me: -1, sel: null, picked: new Set(), handSel: null, orders: null, land: null,
    busy: false, auto: null, log: [], hint: null, view: null, skip: false,
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (n) => { try { if (V.SFX && V.SFX[n]) V.SFX[n](); } catch (e) { /* sound is optional */ } };
  const fac = (pid) => FACTIONS[ui.g.players[pid].faction];
  const fcol = (pid) => fac(pid).color;
  const fname = (pid) => fac(pid).name;
  const isCore = (s) => s.ring === P.RINGS.length;
  const board = () => ui.view || ui.g; // what the map shows: a snapshot during playback, else the live game
  const sname = (sid, g) => {
    g = g || board();
    const s = g.sectors[sid];
    const c = P.colonyAt(g, sid);
    return c ? c.name : `${P.TERRAIN[s.terrain].name} ${sid}`;
  };
  const playing = () => ui.me >= 0 && ui.g.players[ui.me].alive && ui.g.phase !== 'over';
  const freshOrders = () => ({ moves: {}, plays: [], found: [], scrap: [] });
  const hasArt = (id) => !!(V.ART && id && V.ART[id]);

  /* ------------------------------------------------------------ geometry */
  function polar(r, deg) { const a = (deg * Math.PI) / 180; return [r * Math.cos(a), r * Math.sin(a)]; }
  const geoCache = {};
  function geom(s) {
    if (geoCache[s.id]) return geoCache[s.id];
    let out;
    if (isCore(s)) out = { d: null, cx: 0, cy: 0 };
    else {
      const n = P.RINGS[s.ring];
      const [ri, ro] = RADII[s.ring];
      const a0 = -90 + (360 * s.idx) / n, a1 = -90 + (360 * (s.idx + 1)) / n;
      const p = [polar(ro, a0), polar(ro, a1), polar(ri, a1), polar(ri, a0)].map((q) => q.map((v) => v.toFixed(1)));
      const [cx, cy] = polar((ri + ro) / 2, (a0 + a1) / 2);
      out = { d: `M${p[0]} A${ro},${ro} 0 0 1 ${p[1]} L${p[2]} A${ri},${ri} 0 0 0 ${p[3]} Z`, cx, cy };
    }
    geoCache[s.id] = out;
    return out;
  }

  /* ------------------------------------------------------------ orders helpers */
  function queuedCost() {
    const p = ui.g.players[ui.me];
    return ui.orders.plays.reduce((a, pl) => {
      const h = p.hand.find((x) => x.uid === pl.hand);
      return a + (h ? PC[h.id].cost : 0);
    }, 0);
  }
  function energyLeft() {
    if (ui.me < 0 || !ui.orders) return 0;
    return ui.g.players[ui.me].energy + ui.orders.scrap.length * P.SCRAP_ENERGY - queuedCost();
  }
  const queuedFor = (uid) => ui.orders && ui.orders.plays.find((pl) => pl.hand === uid);
  const scrapped = (uid) => ui.orders && ui.orders.scrap.includes(uid);
  function reservedSlots() {
    const r = {};
    const p = ui.g.players[ui.me];
    ui.orders.plays.forEach((pl) => {
      const d = PC[p.hand.find((h) => h.uid === pl.hand).id];
      if (d.type === 'building' || d.type === 'populace') {
        const c = P.colonyAt(ui.g, pl.sector);
        if (c) r[c.uid] = (r[c.uid] || 0) + 1;
      }
    });
    return r;
  }
  /** Sectors the selected hand card could go to, given what's already queued. */
  function cardTargets() {
    if (ui.handSel == null) return new Set();
    const h = ui.g.players[ui.me].hand.find((x) => x.uid === ui.handSel);
    if (!h) return new Set();
    const res = reservedSlots();
    return new Set(ui.g.sectors.filter((s) => P.canPlayAt(ui.g, ui.me, h.id, s.id, res)).map((s) => s.id));
  }
  function legalUnion() {
    const set = new Set();
    ui.picked.forEach((uid) => {
      const u = P.findUnit(ui.g, uid);
      if (u) P.legalMoves(ui.g, u).forEach((s) => set.add(s));
    });
    return set;
  }
  function orderMoves() {
    return Object.keys(ui.orders.moves).map((uid) => {
      const u = P.findUnit(ui.g, +uid);
      return u ? { from: u.sector, to: ui.orders.moves[uid], pid: u.owner } : null;
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------ cards */
  const TYPE_LABEL = { unit: 'Unit', structure: 'Structure', building: 'Building', populace: 'Citizen', event: 'Event' };
  function statsLine(d, hp) {
    if (d.type === 'unit' || d.type === 'structure') {
      return `⚔${d.atk} ❤${hp == null ? d.hp : `${hp}/${d.hp}`} ⏱${d.init}${d.move ? ` ➜${d.move}` : ''}`;
    }
    if (d.type === 'event') return `⏱${d.init}`;
    const bits = [];
    if (d.energy) bits.push(`⚡${d.energy > 0 ? '+' : ''}${d.energy}`);
    if (d.research) bits.push(`🔬+${d.research}`);
    if (d.hp) bits.push(`❤+${d.hp}`);
    if (d.slots) bits.push(`+${d.slots} slots`);
    return bits.join(' ');
  }
  /** A readable card. opts: { pid (owner colour), hp, cls, attrs, badge } */
  function cardHTML(id, opts) {
    opts = opts || {};
    const d = PC[id];
    const col = opts.pid != null ? fcol(opts.pid) : (d.faction ? FACTIONS[d.faction].color : '#7dffbd');
    const art = hasArt(d.art) ? `<img src="art/${d.art}.webp" alt="" loading="lazy">` : `<span class="pl-cicon2">${d.icon}</span>`;
    return `<div class="pl-card t-${d.type} ${opts.cls || ''}" style="--fc:${col}" ${opts.attrs || ''} title="${esc(d.name)}: ${esc(d.text)}">` +
      `<div class="pl-ctop"><span class="pl-cost">${d.cost}</span><span class="pl-cname">${esc(d.name)}</span></div>` +
      `<div class="pl-cart">${art}</div>` +
      `<div class="pl-ctype">${TYPE_LABEL[d.type]}${d.faction ? ` · ${esc(FACTIONS[d.faction].name.replace(/^The /, ''))}` : ''}</div>` +
      `<div class="pl-cstats">${statsLine(d, opts.hp)}</div>` +
      `<div class="pl-ctext">${esc(d.text)}</div>${opts.badge ? `<div class="pl-badge">${opts.badge}</div>` : ''}</div>`;
  }

  /* ------------------------------------------------------------ map */
  function arrow(from, to, color, width) {
    const g = board();
    const a = geom(g.sectors[from]), b = geom(g.sectors[to]);
    const dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const sx = a.cx + ux * 18, sy = a.cy + uy * 18, ex = b.cx - ux * 22, ey = b.cy - uy * 22;
    const h = 13, w = 8;
    const tip = `${ex + ux * h},${ey + uy * h}`;
    const l = `${ex - uy * w},${ey + ux * w}`, r = `${ex + uy * w},${ey - ux * w}`;
    return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="0.9"/>` +
      `<polygon points="${tip} ${l} ${r}" fill="${color}"/>`;
  }

  function tile(x, y, kind, attrs) {
    const { fill, stroke, icon, sub, dashed, uid } = attrs;
    return `<g class="pl-tile ${kind}" ${uid != null ? `data-uid="${uid}"` : ''} transform="translate(${x - TILE_W / 2},${y - TILE_H / 2})">` +
      `<rect width="${TILE_W}" height="${TILE_H}" rx="4" fill="${fill}" stroke="${stroke}" ${dashed ? 'stroke-dasharray="4 3"' : ''}/>` +
      `<text x="${TILE_W / 2}" y="${TILE_H / 2 - 2}" class="pl-tico">${icon}</text>` +
      (sub != null ? `<text x="${TILE_W / 2}" y="${TILE_H - 4}" class="pl-tsub">${sub}</text>` : '') + `</g>`;
  }

  /** extra: { backs: {sid: [pid...]}, faces: {sid: [{pid, card}]}, arrows: [...], flash: Set } for playback. */
  function renderMap(extra) {
    extra = extra || {};
    const g = board();
    const live = !ui.view;
    const legal = live && g.phase === 'orders' && playing() ? legalUnion() : new Set();
    const targets = live && playing() ? cardTargets() : new Set();
    let defs = '', base = '', marks = '', pieces = '';
    // Borders and highlights are drawn in their own layer above every sector, each clipped to its
    // own sector's shape. Drawing them on the sectors themselves let the next sector cover half the
    // outline, and scaling the borders inward shifted them off their sectors.
    base += `<circle r="505" class="pl-rim"/>`;
    const myPlays = {};
    if (live && playing() && ui.orders && !ui.busy) {
      const p = g.players[ui.me];
      ui.orders.plays.forEach((pl) => {
        const h = p.hand.find((x) => x.uid === pl.hand);
        // Buildings and citizens attach to the city rather than take a sector slot, so no tile for them.
        if (pl.sector == null || !h || !['unit', 'structure'].includes(PC[h.id].type)) return;
        (myPlays[pl.sector] = myPlays[pl.sector] || []).push(h.id);
      });
    }
    g.sectors.forEach((s) => {
      const t = P.TERRAIN[s.terrain];
      const gm = geom(s);
      const ctrl = P.controller(g, s.id);
      const shape = (a) => (gm.d ? `<path d="${gm.d}" ${a}/>` : `<circle r="${CORE_R}" ${a}/>`);
      const cls = ['pl-sector'];
      if (live && g.phase === 'landfall' && playing() && P.canLand(g, s.id)) cls.push('landable');
      base += (gm.d ? `<path d="${gm.d}"` : `<circle r="${CORE_R}"`) +
        ` class="${cls.join(' ')}" data-sid="${s.id}" fill="${t.color}"><title>${esc(sname(s.id, g))}</title></${gm.d ? 'path' : 'circle'}>`;
      defs += `<clipPath id="pl-clip-${s.id}">${shape('')}</clipPath>`;
      const clip = `clip-path="url(#pl-clip-${s.id})"`;
      if (ctrl >= 0) marks += shape(`class="pl-ctrl" stroke="${fcol(ctrl)}" ${clip}`);
      const hl = [];
      if (legal.has(s.id)) hl.push('legal');
      if (targets.has(s.id)) hl.push('target');
      if (extra.flash && extra.flash.has(s.id)) hl.push('hot');
      if (live && g.phase === 'landfall' && ui.land === s.id) hl.push('chosen');
      if (ui.sel === s.id) hl.push('sel');
      hl.forEach((h) => { marks += shape(`class="pl-hl ${h}" ${clip}`); });

      // Contents: the terrain icon, then up to four card tiles.
      const { cx, cy } = gm;
      if (t.icon) pieces += `<text x="${cx}" y="${cy - 44}" class="pl-ticon">${t.icon}</text>`;
      const tiles = [];
      const col = P.colonyAt(g, s.id);
      if (col) {
        tiles.push(['city', { fill: fcol(col.owner), stroke: '#fff', icon: col.capital ? '★' : '⌂', sub: col.hp }]);
      }
      P.unitsAt(g, s.id).sort((a, b) => a.owner - b.owner).forEach((u) => {
        tiles.push(['utile', { fill: '#0b1a12', stroke: fcol(u.owner), icon: PC[u.card].icon, sub: u.hp, uid: u.uid }]);
      });
      (myPlays[s.id] || []).forEach((id) => {
        tiles.push(['plan', { fill: 'rgba(255,209,102,0.15)', stroke: '#ffd166', icon: PC[id].icon, dashed: true }]);
      });
      ((extra.backs || {})[s.id] || []).forEach((pid) => {
        tiles.push(['back', { fill: '#16241c', stroke: fcol(pid), icon: '?', dashed: true }]);
      });
      ((extra.faces || {})[s.id] || []).forEach((x) => {
        tiles.push(['face', { fill: fcol(x.pid), stroke: '#fff', icon: PC[x.card].icon }]);
      });
      tiles.slice(0, 4).forEach(([kind, a], i) => { pieces += tile(cx + SLOTS[i][0], cy + SLOTS[i][1], kind, a); });
      if (tiles.length > 4) pieces += `<text x="${cx + 34}" y="${cy + 8}" class="pl-more">+${tiles.length - 4}</text>`;
    });
    let arrows = '';
    const list = extra.arrows || (live && playing() ? orderMoves() : []);
    const seen = {};
    list.forEach((m) => {
      const k = m.pid + ':' + m.from + ':' + m.to;
      if (seen[k]) return;
      seen[k] = 1;
      arrows += arrow(m.from, m.to, fcol(m.pid), 4);
    });
    $('#pl-map').innerHTML = `<defs>${defs}</defs><g>${base}</g><g class="pl-marks">${marks}</g>` +
      `<g class="pl-pieces">${pieces}</g><g class="pl-arrows">${arrows}</g><g class="pl-floats"></g>`;
  }

  /* ------------------------------------------------------------ side panel */
  function renderHead() {
    const g = ui.g;
    const clock = Math.min(g.turn, P.CLOCK);
    let h = `<div class="pl-clock"><span>${g.phase === 'landfall' ? 'Landfall' : `Turn ${clock} / ${P.CLOCK}`}</span>` +
      `<span class="pl-sub">${g.phase === 'over' ? 'Game over' : `Singularity in ${Math.max(0, P.CLOCK - g.turn + 1)}`}</span></div>` +
      `<div class="pl-bar"><i style="width:${(100 * clock) / P.CLOCK}%"></i></div>`;
    if (ui.me >= 0) {
      const p = g.players[ui.me];
      const inc = P.income(g, ui.me);
      const next = P.TECH.find((t) => p.research < t.at);
      h += `<div class="pl-me" style="--fc:${fcol(ui.me)}"><b>${fac(ui.me).art} ${esc(fname(ui.me))}</b>` +
        `${p.alive ? '' : ' <span class="pl-out">eliminated</span>'}<br>` +
        `⚡ ${energyLeft()} <span class="pl-sub">(+${inc.energy}/turn)</span> &nbsp; 🔬 ${p.research} <span class="pl-sub">(+${inc.research})</span>` +
        ` &nbsp; 🂠 ${p.deck.length} <span class="pl-sub">deck</span>` +
        `${next ? `<br><span class="pl-sub">Next: ${esc(next.name)} at ${next.at} research</span>` : ''}</div>`;
    } else h += `<div class="pl-me"><b>Spectating</b> seven AIs</div>`;
    $('#pl-head').innerHTML = h;
  }

  function renderSector() {
    const g = ui.g;
    const box = $('#pl-sector');
    if (g.phase === 'landfall' && playing()) {
      box.innerHTML = `<h3>Landfall</h3><p>Choose where your colony comes down: any land sector in the outer two rings. ` +
        `If another faction picks the same sector, one of you lands there and the rest scatter to the nearest free spot.</p>` +
        (ui.land != null ? sectorInfo(ui.land) : '<p class="pl-sub">Click a sector on the map.</p>');
      return;
    }
    if (ui.handSel != null && playing()) {
      const h = g.players[ui.me].hand.find((x) => x.uid === ui.handSel);
      if (h) {
        const n = cardTargets().size;
        box.innerHTML = `<h3>Playing ${esc(PC[h.id].name)}</h3>${cardHTML(h.id, { cls: 'zoom' })}` +
          `<p class="pl-sub">${n ? `Click one of the ${n} highlighted sectors. It goes down face down; rivals see only a card back until the reveal.` : 'Nowhere to play this right now.'}</p>` +
          (ui.hint ? `<p class="pl-warn">${esc(ui.hint)}</p>` : '');
        return;
      }
    }
    if (ui.sel == null) {
      box.innerHTML = `<p class="pl-sub">Click a sector to zoom in on its cards${playing() ? ', or a card in your hand to play it' : ''}.</p>`;
      return;
    }
    const sid = ui.sel;
    let h = sectorInfo(sid);
    const col = P.colonyAt(g, sid);
    const units = P.unitsAt(g, sid);
    h += `<div class="pl-zoom">`;
    if (col) {
      h += `<div class="pl-citycard" style="--fc:${fcol(col.owner)}"><div class="pl-cityhead">${col.capital ? '★' : '⌂'} ${esc(col.name)}</div>` +
        `<div class="pl-sub">${esc(fname(col.owner))}${col.founder !== col.owner ? ` (taken from ${esc(fname(col.founder))})` : ''}</div>` +
        `<div>❤ ${col.hp}/${P.maxHp(col)} · ⚔ ${P.cityAtk(col)} · slots ${col.attached.length}/${P.slots(col)}</div>` +
        `<div class="pl-attached">${col.attached.map((id) => `<span title="${esc(PC[id].name)}: ${esc(PC[id].text)}">${PC[id].icon} ${esc(PC[id].name)}</span>`).join('') || '<span class="pl-sub">no buildings or citizens yet</span>'}</div></div>`;
    }
    units.sort((a, b) => (b.owner === ui.me) - (a.owner === ui.me)).forEach((u) => {
      const mine = u.owner === ui.me && playing();
      const dest = ui.orders && ui.orders.moves[u.uid];
      const founding = ui.orders && ui.orders.found.includes(u.uid);
      let badge = '';
      if (mine) badge = dest != null ? `→ ${esc(sname(dest))}` : 'holds';
      if (mine && founding) badge += ' · founds city';
      h += cardHTML(u.card, {
        pid: u.owner, hp: u.hp, cls: `zoom${mine ? ' mine' : ''}${ui.picked.has(u.uid) ? ' picked' : ''}`,
        attrs: mine ? `data-pick="${u.uid}"` : '', badge,
      });
      if (mine && PC[u.card].settler && P.canFoundAt(g, dest != null ? dest : u.sector, u)) {
        h += `<a class="pl-found" data-found="${u.uid}">${founding ? 'cancel founding' : 'found a city here'}</a>`;
      }
    });
    h += `</div>`;
    if (playing() && units.some((u) => u.owner === ui.me && PC[u.card].move)) {
      h += `<div class="pl-actions"><button class="btn small" data-act="all">Select all mine</button> ` +
        `<button class="btn small ghost" data-act="hold">All hold</button></div>` +
        (ui.hint ? `<p class="pl-warn">${esc(ui.hint)}</p>` : '') +
        `<p class="pl-sub">${ui.picked.size ? `${ui.picked.size} selected. Click a dashed sector to move there.` : 'Click your unit cards to select them, then click a dashed sector.'}</p>`;
    }
    const s = g.sectors[sid];
    h += `<div class="pl-neigh"><span class="pl-sub">Neighbours:</span>` + s.adj.map((a) => {
      const c = P.controller(g, a);
      return `<a class="pl-nchip" data-goto="${a}" style="--fc:${c >= 0 ? fcol(c) : '#3c5c4a'}">${P.TERRAIN[g.sectors[a].terrain].icon || '▫️'} ${P.cardsIn(g, a)}/${P.CAPACITY}</a>`;
    }).join('') + `</div>`;
    box.innerHTML = h;
  }

  function sectorInfo(sid) {
    const g = ui.g;
    const s = g.sectors[sid];
    const t = P.TERRAIN[s.terrain];
    return `<h3>${t.icon || '▫️'} ${esc(sname(sid, g))} <span class="pl-cap">${P.cardsIn(g, sid)}/${P.CAPACITY} cards</span></h3>` +
      `<p class="pl-terrain">${esc(t.name)} · ⚡${t.energy} 🔬${t.research}${t.text ? ` — ${esc(t.text)}` : ''}</p>`;
  }

  function renderStandings() {
    const g = ui.g;
    const rows = g.players.map((p) => ({ p, score: p.alive ? P.score(g, p.pid) : -1 })).sort((a, b) => b.score - a.score);
    $('#pl-standings').innerHTML = rows.map(({ p, score }) => {
      const cols = P.coloniesOf(g, p.pid);
      return `<div class="pl-row${p.alive ? '' : ' dead'}${p.pid === ui.me ? ' me' : ''}" style="--fc:${fcol(p.pid)}">` +
        `<span class="pl-dot"></span><span class="pl-rname">${FACTIONS[p.faction].art} ${esc(FACTIONS[p.faction].name)}</span>` +
        (p.alive ? `<span>★${cols.filter((c) => c.capital).length} ⌂${cols.length} ⚔${P.unitsOf(g, p.pid).length} 🂠${p.hand.length} 🔬${p.research}</span><b>${score}</b>`
          : `<span>out on turn ${p.elimTurn}</span><b>—</b>`) + `</div>`;
    }).join('');
  }

  function renderLog() {
    const box = $('#pl-log');
    box.innerHTML = ui.log.slice(-150).map((l) => `<div class="pl-logline">${l}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  }

  function renderHand() {
    const g = ui.g;
    const box = $('#pl-hand');
    if (ui.me < 0) { box.innerHTML = '<p class="pl-sub">Spectating: no hand.</p>'; return; }
    const p = g.players[ui.me];
    if (!p.alive) { box.innerHTML = '<p class="pl-sub">Eliminated. You can keep watching.</p>'; return; }
    box.innerHTML = p.hand.map((h) => {
      const q = queuedFor(h.uid);
      const sc = scrapped(h.uid);
      const d = PC[h.id];
      const cls = ['inhand'];
      if (ui.handSel === h.uid) cls.push('picked');
      if (q) cls.push('queued');
      if (sc) cls.push('scrapped');
      if (!q && !sc && d.cost > energyLeft()) cls.push('dear');
      const badge = q ? `queued${q.sector != null ? ` → ${esc(sname(q.sector, g))}` : ''}` : sc ? `scrapped (+${P.SCRAP_ENERGY}⚡)` : '';
      return `<div class="pl-handslot">${cardHTML(h.id, { cls: cls.join(' '), attrs: `data-hand="${h.uid}"`, badge })}` +
        (g.phase === 'orders' && !q ? `<a class="pl-scrap" data-scrap="${h.uid}">${sc ? 'keep' : `scrap +${P.SCRAP_ENERGY}⚡`}</a>` : '') + `</div>`;
    }).join('') || '<p class="pl-sub">Your hand is empty.</p>';
  }

  function renderButtons() {
    const g = ui.g;
    const btn = $('#pl-commit');
    if (g.phase === 'over') { btn.textContent = 'Results'; btn.disabled = false; }
    else if (!playing()) { btn.textContent = g.phase === 'landfall' ? 'Watch landfall' : 'Next turn'; btn.disabled = ui.busy; }
    else if (g.phase === 'landfall') { btn.textContent = 'Land here'; btn.disabled = ui.busy || ui.land == null; }
    else { btn.textContent = 'Commit orders'; btn.disabled = ui.busy; }
    $('#pl-auto').classList.toggle('hidden', playing() || g.phase === 'over');
    $('#pl-auto').textContent = ui.auto ? 'Pause' : 'Auto-play';
  }

  function render() {
    if (!ui.g) return;
    renderMap(); renderHead(); renderSector(); renderStandings(); renderLog(); renderHand(); renderButtons();
  }

  /* ------------------------------------------------------------ log */
  const tag = (pid) => `<b style="color:${fcol(pid)}">${esc(fname(pid))}</b>`;
  function logEvents(events, label, before) {
    ui.log.push(`<span class="pl-turn">${label}</span>`);
    const losses = {};
    events.forEach((e) => { if (e.t === 'death') { (losses[e.sector] = losses[e.sector] || {})[e.pid] = (losses[e.sector][e.pid] || 0) + 1; } });
    const where = (sid) => esc(sname(sid, before || ui.g));
    const reveals = {};
    events.forEach((e) => { if (e.t === 'reveal') (reveals[e.pid] = reveals[e.pid] || []).push(e); });
    Object.keys(reveals).forEach((pid) => {
      ui.log.push(`🂠 ${tag(+pid)} played ${reveals[pid].map((e) => `${PC[e.card].icon} ${esc(PC[e.card].name)}`).join(', ')}`);
    });
    events.forEach((e) => {
      const L = (s) => ui.log.push(s);
      if (e.t === 'land') L(`🚀 ${tag(e.pid)} lands at ${where(e.sector)}${e.contested ? ' — beating rivals to the spot' : ''}`);
      else if (e.t === 'scatter') L(`💨 ${tag(e.pid)} was crowded out and scattered to ${where(e.sector)}`);
      else if (e.t === 'event') L(`${PC[e.card].icon} ${tag(e.pid)}'s ${esc(PC[e.card].name)}${e.sector != null ? ` hits ${where(e.sector)}` : ''}`);
      else if (e.t === 'battle') {
        const l = losses[e.sector] || {};
        L(`⚔️ Battle at ${where(e.sector)}: ${e.pids.map((pid) => `${tag(pid)} lost ${l[pid] || 0}`).join(', ')}`);
      } else if (e.t === 'capture') L(`🏴 ${tag(e.pid)} captured ${esc(e.name)}${e.capital ? ' (a capital!)' : ''} from ${tag(e.from)}`);
      else if (e.t === 'razed') L(`🔥 ${esc(e.name)} was razed in the crossfire`);
      else if (e.t === 'takeover') L(`💼 ${tag(e.pid)} bought out ${esc(e.name)} from ${tag(e.from)}`);
      else if (e.t === 'riot') L(`📢 Riots in ${esc(e.name)} (${tag(e.victim)})`);
      else if (e.t === 'sabotage') L(`🕵️ ${tag(e.pid)}'s spies wrecked ${esc(PC[e.card].name)} in ${esc(e.name)}`);
      else if (e.t === 'terrain') L(`🌱 ${where(e.sector)} is now ${esc(P.TERRAIN[e.terrain].name)}`);
      else if (e.t === 'found') L(`🏕️ ${tag(e.pid)} founded ${esc(e.name)}`);
      else if (e.t === 'bounced' && e.pid === ui.me) L(`↩️ Your ${esc(PC[e.card].name)} had no room and came back to your hand`);
      else if (e.t === 'blocked' && e.pid === ui.me) L(`⛔ One of your units found ${where(e.to)} full and stayed put`);
      else if (e.t === 'fizzle' && e.pid === ui.me) L(`💨 Your ${esc(PC[e.card].name)} fizzled`);
      else if (e.t === 'tech') L(`🔬 ${tag(e.pid)} discovered ${esc(e.name)}`);
      else if (e.t === 'eliminated') L(`☠️ ${tag(e.pid)} has been eliminated`);
      else if (e.t === 'over') L(`🌀 ${e.kind === 'conquest' ? 'Conquest' : 'The singularity'}: ${tag(e.winner)} takes first place`);
    });
  }

  /* ------------------------------------------------------------ playback */
  function wait(ms) {
    return new Promise((res) => {
      if (ui.skip) return res();
      const t = setTimeout(res, ms * (ui.auto ? 0.6 : 1));
      ui.wake = () => { clearTimeout(t); res(); };
    });
  }
  function banner(text) {
    const b = $('#pl-banner');
    if (!text) { b.classList.add('hidden'); return; }
    b.innerHTML = text;
    b.classList.remove('hidden');
  }
  function floats(list) {
    const layer = document.querySelector('#pl-map .pl-floats');
    if (!layer) return;
    layer.innerHTML = list.map((f, i) => `<text x="${f.x}" y="${f.y}" class="pl-float ${f.cls || ''}" style="animation-delay:${(i % 6) * 60}ms">${f.text}</text>`).join('');
  }

  async function playback(before, events) {
    ui.skip = false;
    $('#pl-skip').classList.remove('hidden');
    ui.view = before;
    const reveals = events.filter((e) => e.t === 'reveal');
    // 1. Card backs go down, then flip.
    if (reveals.length) {
      const backs = {}, faces = {};
      reveals.forEach((e) => {
        const sid = e.sector != null ? e.sector : P.coloniesOf(before, e.pid)[0] ? P.coloniesOf(before, e.pid)[0].sector : null;
        if (sid == null) return;
        (backs[sid] = backs[sid] || []).push(e.pid);
        (faces[sid] = faces[sid] || []).push({ pid: e.pid, card: e.card });
      });
      banner(`Reveal: ${reveals.length} card${reveals.length > 1 ? 's' : ''} played face down`);
      renderMap({ backs });
      await wait(900);
      banner('Cards flip');
      renderMap({ faces });
      sfx('play');
      await wait(1000);
    }
    // 2. Movement, tier by tier: tiles slide to their new sectors.
    const moves = events.filter((e) => e.t === 'move');
    const tiers = [...new Set(moves.map((m) => m.init))].sort((a, b) => b - a);
    if (moves.length) {
      renderMap({ arrows: moves.map((m) => ({ from: m.from, to: m.to, pid: m.pid })) });
      for (const init of tiers) {
        const tier = moves.filter((m) => m.init === init);
        banner(`Movement · initiative ${init}: ${tier.length} unit${tier.length > 1 ? 's' : ''}`);
        tier.forEach((m) => {
          const el = document.querySelector(`#pl-map .pl-tile[data-uid="${m.uid}"]`);
          if (!el) return;
          const a = geom(before.sectors[m.from]), b = geom(before.sectors[m.to]);
          // CSS transitions can't animate the SVG transform attribute, so slide with the CSS
          // transform property (which overrides the attribute) from the tile's own position.
          const [bx, by] = el.getAttribute('transform').match(/-?[\d.]+/g).map(Number);
          el.style.transform = `translate(${bx}px,${by}px)`;
          el.getBoundingClientRect();
          el.style.transition = 'transform 0.55s ease-in-out';
          el.style.transform = `translate(${bx + b.cx - a.cx}px,${by + b.cy - a.cy}px)`;
        });
        sfx('move');
        await wait(700);
      }
    }
    // From here on, show the board as it ended up.
    ui.view = null;
    const at = (sid) => geom(ui.g.sectors[sid]);
    // 3. Events.
    for (const e of events.filter((x) => x.t === 'event')) {
      banner(`${PC[e.card].icon} ${esc(fname(e.pid))}: ${esc(PC[e.card].name)}${e.sector != null ? ` → ${esc(sname(e.sector))}` : ''}`);
      renderMap({ flash: new Set(e.sector != null ? [e.sector] : []) });
      if (e.sector != null) {
        const hits = events.filter((h) => h.t === 'hit' && h.sector === e.sector && h.pid === e.pid);
        floats(hits.map((h, i) => ({ x: at(e.sector).cx + (i % 3 - 1) * 22, y: at(e.sector).cy - 10 - Math.floor(i / 3) * 16, text: `-${h.n}` })));
      }
      await wait(900);
    }
    // 4. Battles.
    const battles = events.filter((x) => x.t === 'battle');
    for (const b of battles) {
      const dead = events.filter((x) => x.t === 'death' && x.sector === b.sector);
      const by = {};
      dead.forEach((d) => { by[d.pid] = (by[d.pid] || 0) + 1; });
      banner(`⚔️ Battle at ${esc(sname(b.sector))}: ${b.pids.map((pid) => `<span style="color:${fcol(pid)}">${esc(fname(pid))} −${by[pid] || 0}</span>`).join(' · ')}`);
      renderMap({ flash: new Set([b.sector]) });
      const dmg = events.filter((x) => x.t === 'hit' && x.sector === b.sector).reduce((a, x) => a + x.n, 0);
      floats([{ x: at(b.sector).cx, y: at(b.sector).cy - 20, text: `💥 ${dmg}`, cls: 'large' }]);
      sfx('attack');
      await wait(battles.length > 4 ? 650 : 900);
    }
    // 5. What changed hands, got founded or deployed.
    const big = events.filter((x) => ['capture', 'razed', 'found', 'takeover', 'eliminated'].includes(x.t));
    const deployed = events.filter((x) => x.t === 'deploy' || x.t === 'attach').length;
    if (big.length || deployed) {
      const bits = big.map((x) => {
        if (x.t === 'capture') return `🏴 ${esc(fname(x.pid))} takes ${esc(x.name)}`;
        if (x.t === 'razed') return `🔥 ${esc(x.name)} razed`;
        if (x.t === 'found') return `🏕️ ${esc(fname(x.pid))} founds ${esc(x.name)}`;
        if (x.t === 'takeover') return `💼 ${esc(fname(x.pid))} buys ${esc(x.name)}`;
        return `☠️ ${esc(fname(x.pid))} is out`;
      });
      if (deployed) bits.push(`${deployed} card${deployed > 1 ? 's' : ''} deployed`);
      banner(bits.slice(0, 4).join(' · ') + (bits.length > 4 ? ` · +${bits.length - 4} more` : ''));
      renderMap({ flash: new Set(big.filter((x) => x.sector != null).map((x) => x.sector)) });
      if (big.some((x) => x.t === 'capture' || x.t === 'eliminated')) sfx('raze');
      await wait(1100);
    }
    banner(null);
    $('#pl-skip').classList.add('hidden');
    ui.skip = false;
  }

  /* ------------------------------------------------------------ turn flow */
  async function commit() {
    const g = ui.g;
    if (ui.busy) return;
    if (g.phase === 'over') return showResult();
    ui.busy = true;
    renderButtons();
    sfx('click');
    if (g.phase === 'landfall') {
      const choices = {};
      g.players.forEach((p) => { choices[p.pid] = p.pid === ui.me ? ui.land : PA.landfall(g, p.pid); });
      P.landfall(g, choices);
      logEvents(g.events, 'Landfall');
      const cap = ui.me >= 0 ? P.coloniesOf(g, ui.me)[0] : null;
      ui.sel = cap ? cap.sector : null;
    } else {
      const orders = {};
      g.players.forEach((p) => {
        if (!p.alive) return;
        orders[p.pid] = p.pid === ui.me && playing() ? ui.orders : PA.orders(g, p.pid);
      });
      const before = JSON.parse(JSON.stringify(g));
      const turn = g.turn;
      ui.handSel = null; ui.picked.clear();
      P.resolve(g, orders);
      try {
        await playback(before, g.events);
      } catch (err) {
        // The playback is only a show: if it breaks, carry on with the resolved board.
        console.error(err);
        ui.view = null;
        banner(null);
        $('#pl-skip').classList.add('hidden');
      }
      logEvents(g.events, `Turn ${turn}`, before);
    }
    ui.orders = freshOrders();
    ui.picked.clear();
    ui.handSel = null;
    ui.busy = false;
    render();
    if (g.phase === 'over') { stopAuto(); setTimeout(showResult, 500); }
  }

  function stopAuto() { if (ui.auto) { clearInterval(ui.auto); ui.auto = null; } }
  function toggleAuto() {
    if (ui.auto) stopAuto();
    else ui.auto = setInterval(() => { if (!ui.busy && ui.g && ui.g.phase !== 'over') commit(); }, 400);
    renderButtons();
  }

  function showResult() {
    const g = ui.g;
    const r = g.result;
    const rows = r.scores.map((x, i) => {
      const p = g.players[x.pid];
      return `<div class="pl-row${p.pid === ui.me ? ' me' : ''}${p.alive ? '' : ' dead'}" style="--fc:${fcol(p.pid)}">` +
        `<b>${i + 1}.</b><span class="pl-rname">${FACTIONS[p.faction].art} ${esc(FACTIONS[p.faction].name)}</span>` +
        `<span>${p.alive ? `${x.score} pts` : `out on turn ${p.elimTurn}`}</span></div>`;
    }).join('');
    const mine = ui.me >= 0 ? r.ranking.indexOf(ui.me) + 1 : 0;
    $('#pl-overlay').innerHTML = `<div class="pl-panel"><h2>${r.kind === 'conquest' ? 'Conquest' : 'The Singularity'}</h2>` +
      `<p>${r.kind === 'conquest' ? `${esc(fname(r.winner))} holds ${P.CONQUEST_CAPITALS} capitals. The planet is theirs.`
        : 'The planet awakens. Every surviving faction is judged by research, cities, capitals and territory.'}</p>` +
      `${mine ? `<p><b>You placed ${mine} of 7.</b></p>` : ''}<div class="pl-standings">${rows}</div>` +
      `<div class="pl-buttons"><button class="btn primary" data-act="again">New game</button> <button class="btn ghost" data-act="menu">Main menu</button> <button class="btn ghost" data-act="close">View map</button></div></div>`;
    $('#pl-overlay').classList.remove('hidden');
  }

  /* ------------------------------------------------------------ setup */
  function showSetup() {
    stopAuto();
    const list = Object.keys(FACTIONS).map((f) => {
      const F = FACTIONS[f];
      return `<button class="pl-fac" data-fac="${f}" style="--fc:${F.color}"><span class="pl-fart">${F.art}</span>` +
        `<b>${esc(F.name)}</b><span class="pl-sub">${esc(F.leader)}</span></button>`;
    }).join('');
    $('#pl-overlay').innerHTML = `<div class="pl-panel"><h2>Planet Mode <span class="pl-proto">prototype</span></h2>` +
      `<p>All seven factions share one world, and everyone plans at the same time. Play cards from your hand face down ` +
      `onto your cities and the map, and order your units to move. When everyone commits, every card flips at once and ` +
      `the turn plays out: fastest initiative first. Each sector holds at most <b>${P.CAPACITY} cards</b>, shared by everyone. ` +
      `Hold <b>${P.CONQUEST_CAPITALS} capitals</b> for a conquest win, or have the best score when the <b>singularity</b> ` +
      `arrives after turn ${P.CLOCK}.</p><h3>Choose your faction</h3><div class="pl-facs">${list}</div>` +
      `<div class="pl-buttons"><button class="btn ghost" data-act="spectate">Watch seven AIs</button> <button class="btn ghost" data-act="menu">Back to menu</button></div></div>`;
    $('#pl-overlay').classList.remove('hidden');
  }

  function startGame(me) {
    stopAuto();
    const seed = (Math.random() * 0x7fffffff) | 0;
    ui.g = P.newGame({ seed, humans: me >= 0 ? [me] : [] });
    ui.me = me;
    ui.sel = null; ui.land = null; ui.picked.clear(); ui.handSel = null; ui.orders = freshOrders(); ui.log = []; ui.view = null;
    ui.busy = false; ui.skip = false;
    banner(null);
    $('#pl-skip').classList.add('hidden');
    for (const k in geoCache) delete geoCache[k];
    ui.log.push(`<span class="pl-turn">Map ${seed}</span>`);
    $('#pl-overlay').classList.add('hidden');
    render();
  }

  function open() {
    sfx('click');
    $('#screen-title').classList.add('hidden');
    $('#screen-planet').classList.remove('hidden');
    if (!ui.g) $('#pl-map').innerHTML = '';
    showSetup();
  }
  function close() {
    stopAuto();
    $('#screen-planet').classList.add('hidden');
    $('#screen-title').classList.remove('hidden');
  }

  /* ------------------------------------------------------------ input */
  function onSector(sid) {
    const g = ui.g;
    if (!g || ui.busy) return;
    ui.hint = null;
    if (g.phase === 'landfall') {
      if (playing() && P.canLand(g, sid)) { ui.land = sid; sfx('click'); }
      render();
      return;
    }
    if (playing() && ui.handSel != null) {
      if (cardTargets().has(sid)) {
        ui.orders.plays.push({ hand: ui.handSel, sector: sid });
        ui.handSel = null;
        ui.sel = sid;
        sfx('play');
      } else {
        ui.hint = 'That card can\'t go there. Pick a highlighted sector, or click the card again to cancel.';
      }
      render();
      return;
    }
    if (playing() && ui.picked.size && sid !== ui.sel && legalUnion().has(sid)) {
      let short = 0;
      ui.picked.forEach((uid) => {
        const u = P.findUnit(g, uid);
        if (!u) return;
        if (!P.legalMoves(g, u).includes(sid)) { short++; return; }
        ui.orders.moves[uid] = sid;
        const f = ui.orders.found.indexOf(uid);
        if (PC[u.card].settler && P.canFoundAt(g, sid, u)) { if (f < 0) ui.orders.found.push(uid); }
        else if (f >= 0) ui.orders.found.splice(f, 1);
      });
      ui.picked.clear();
      ui.hint = short ? `${short} selected unit${short > 1 ? 's' : ''} can't reach ${sname(sid)} this turn and will hold.` : null;
      sfx('move');
      render();
      ui.hint = null;
      return;
    }
    ui.sel = sid;
    ui.picked.clear();
    render();
  }

  function onHand(e) {
    if (!ui.g || ui.busy || !playing() || ui.g.phase !== 'orders') return;
    const p = ui.g.players[ui.me];
    const sc = e.target.closest('[data-scrap]');
    if (sc) {
      const uid = +sc.dataset.scrap;
      const i = ui.orders.scrap.indexOf(uid);
      if (i >= 0) ui.orders.scrap.splice(i, 1); else ui.orders.scrap.push(uid);
      if (ui.handSel === uid) ui.handSel = null;
      sfx('click');
      return render();
    }
    const el = e.target.closest('[data-hand]');
    if (!el) return;
    const uid = +el.dataset.hand;
    const q = queuedFor(uid);
    ui.hint = null;
    if (q) { ui.orders.plays.splice(ui.orders.plays.indexOf(q), 1); sfx('click'); return render(); }
    if (scrapped(uid)) return;
    const h = p.hand.find((x) => x.uid === uid);
    const d = PC[h.id];
    if (d.cost > energyLeft()) { ui.handSel = null; ui.hint = null; render(); return; }
    if (d.type === 'event' && !d.target) {
      // Untargeted events are queued straight away.
      ui.orders.plays.push({ hand: uid, sector: null });
      ui.handSel = null;
      sfx('play');
      return render();
    }
    ui.handSel = ui.handSel === uid ? null : uid;
    ui.picked.clear();
    sfx('click');
    render();
  }

  function bind() {
    $('#btn-planet').addEventListener('click', open);
    $('#pl-map').addEventListener('click', (e) => {
      const el = e.target.closest('[data-sid]');
      if (el) onSector(+el.dataset.sid);
    });
    $('#pl-map').addEventListener('contextmenu', (e) => { e.preventDefault(); ui.picked.clear(); ui.handSel = null; render(); });
    $('#pl-hand').addEventListener('click', onHand);
    $('#pl-commit').addEventListener('click', commit);
    $('#pl-auto').addEventListener('click', toggleAuto);
    $('#pl-skip').addEventListener('click', () => { ui.skip = true; if (ui.wake) ui.wake(); });
    $('#pl-quit').addEventListener('click', () => { stopAuto(); showSetup(); });
    $('#pl-sector').addEventListener('click', (e) => {
      if (!ui.g || ui.busy) return;
      const g = ui.g;
      const t = e.target;
      const go = t.closest('[data-goto]');
      if (go) { ui.sel = +go.dataset.goto; ui.picked.clear(); return render(); }
      if (!playing()) return;
      const pick = t.closest('[data-pick]');
      const found = t.closest('[data-found]');
      const act = t.closest('[data-act]');
      if (found) {
        const uid = +found.dataset.found;
        const i = ui.orders.found.indexOf(uid);
        if (i >= 0) ui.orders.found.splice(i, 1); else ui.orders.found.push(uid);
      } else if (pick) {
        const uid = +pick.dataset.pick;
        if (!PC[P.findUnit(g, uid).card].move) return;
        if (ui.picked.has(uid)) ui.picked.delete(uid); else ui.picked.add(uid);
        ui.handSel = null;
      } else if (act && act.dataset.act === 'all') {
        P.unitsAt(g, ui.sel).filter((u) => u.owner === ui.me && PC[u.card].move).forEach((u) => ui.picked.add(u.uid));
        ui.handSel = null;
      } else if (act && act.dataset.act === 'hold') {
        P.unitsAt(g, ui.sel).filter((u) => u.owner === ui.me).forEach((u) => {
          delete ui.orders.moves[u.uid];
          const i = ui.orders.found.indexOf(u.uid);
          if (i >= 0 && !P.canFoundAt(g, u.sector, u)) ui.orders.found.splice(i, 1);
        });
        ui.picked.clear();
      } else return;
      sfx('click');
      render();
    });
    $('#pl-overlay').addEventListener('click', (e) => {
      const f = e.target.closest('[data-fac]');
      const act = e.target.closest('[data-act]');
      if (f) return startGame(Object.keys(FACTIONS).indexOf(f.dataset.fac));
      if (!act) return;
      if (act.dataset.act === 'spectate') startGame(-1);
      else if (act.dataset.act === 'menu') close();
      else if (act.dataset.act === 'again') showSetup();
      else if (act.dataset.act === 'close') $('#pl-overlay').classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if ($('#screen-planet').classList.contains('hidden') || !ui.g) return;
      if (!$('#pl-overlay').classList.contains('hidden')) return;
      if (e.key === 'Enter' && !ui.busy) commit();
      else if (e.key === 'Escape') {
        if (ui.busy) { ui.skip = true; if (ui.wake) ui.wake(); return; }
        ui.picked.clear(); ui.handSel = null; render();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
  V.PlanetUI = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this);
