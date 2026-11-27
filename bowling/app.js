(function () {
  'use strict';
  var S = window.BowlingScoring, DATA = window.BOWLING_DATA;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Round half up on the decimal value (toFixed rounds on the binary value, so 6.85 became 6.8 but 5.45 became 5.5).
  function rnd(n, d) { var k = Math.pow(10, d || 0); return (Math.round(n * k + 1e-9) / k).toFixed(d || 0); }
  function f1(n) { return n === null || n === undefined || isNaN(n) ? '–' : rnd(n, 1); }
  function pc(n) { return n === null || n === undefined ? '–' : rnd(n, 0) + '%'; }
  function frac(a, b) { return ' <span class="muted small">(' + a + '/' + b + ')</span>'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function sgn(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
  function playerIdx(p) { return DATA.players.indexOf(p); }
  function pcol(p) { return 'var(--c' + (playerIdx(p) % 8) + ')'; }
  function plink(p) { return '<button type="button" class="link" data-player="' + esc(p) + '">' + esc(p) + '</button>'; }
  function names(list) { return list.map(function (x) { return x.player || x; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); }
  function joinNames(arr) { return arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1]; }
  function where(x) { return 'R' + x.round + ' · Lane ' + x.lane; }

  var verification = S.verifyData(DATA);
  var board = S.leaderboard(DATA);
  var event = S.eventSummary(DATA);
  var hl = S.highlights(DATA);
  var rowsAll = S.allRows(DATA);
  var summaries = {};
  board.forEach(function (b) { summaries[b.player] = b; });

  /* ---------- SVG charts (hand-drawn, no libraries) ---------- */
  function niceMax(max) {
    var steps = [5, 10, 20, 25, 50, 100, 200];
    for (var i = 0; i < steps.length; i++) if (Math.ceil(max / steps[i]) <= 6) return { step: steps[i], max: Math.max(1, Math.ceil(max / steps[i])) * steps[i] };
    return { step: 200, max: Math.ceil(max / 200) * 200 };
  }
  function svgOpen(w, h, label) { return '<svg class="ch" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">'; }

  function lineChart(o) { // o: {series:[{label,color,values}], xLabels, label}
    var W = 400, H = 250, L = 46, R = 12, T = 12, B = 30;
    var max = 0; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    var ny = niceMax(max), n = o.series[0].values.length;
    var pw = W - L - R, ph = H - T - B;
    function x(i) { return L + pw * i / (n - 1); }
    function y(v) { return T + ph - ph * v / ny.max; }
    var out = svgOpen(W, H, o.label), v;
    for (v = 0; v <= ny.max; v += ny.step) out += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    o.xLabels.forEach(function (lab, i) { if (lab !== '') out += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + lab + '</text>'; });
    out += '<text x="' + (L + pw / 2) + '" y="' + (H - 1) + '" text-anchor="middle">frame</text>';
    if (o.yTitle) out += '<text transform="translate(11 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(o.yTitle) + '</text>';
    o.series.forEach(function (s) {
      var pts = s.values.map(function (val, i) { return x(i).toFixed(1) + ',' + y(val).toFixed(1); }).join(' ');
      out += '<polyline fill="none" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="stroke:' + s.color + '" points="' + pts + '"/>';
      s.values.forEach(function (val, i) {
        if (i === 0) return;
        out += '<circle r="3.6" cx="' + x(i).toFixed(1) + '" cy="' + y(val).toFixed(1) + '" style="fill:' + s.color + '"><title>' + esc(s.label + ', frame ' + i + ': ' + val) + '</title></circle>';
      });
      var last = s.values[n - 1];
      if (o.endLabels) out += '<text class="vl" x="' + (x(n - 1) + 0) + '" y="' + (y(last) - 7) + '" text-anchor="end">' + last + '</text>';
    });
    return out + '</svg>';
  }

  function colChart(o) { // o: {cats, series:[{label,color,values}], decimals, showValues, label, xTitle}
    var W = 400, H = 230, L = 44, R = 8, T = 16, B = 34;
    var max = 0; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    var ny = niceMax(max <= 0 ? 1 : max);
    if (max <= 10 && max > 0) { var st = max <= 5 ? 1 : 2; ny = { step: st, max: Math.ceil(max / st) * st }; }
    var pw = W - L - R, ph = H - T - B, n = o.cats.length, k = o.series.length;
    var gw = pw / n, bw = gw * 0.78 / k;
    function y(v) { return T + ph - ph * v / ny.max; }
    var out = svgOpen(W, H, o.label), v;
    for (v = 0; v <= ny.max + 1e-9; v += ny.step) out += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 5) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    o.cats.forEach(function (c, i) {
      var gx = L + gw * i;
      out += '<text x="' + (gx + gw / 2) + '" y="' + (H - 17) + '" text-anchor="middle">' + esc(c) + '</text>';
      o.series.forEach(function (s, j) {
        var val = s.values[i], bx = gx + gw * 0.11 + bw * j, bh = ph * val / ny.max;
        out += '<rect rx="2" x="' + bx.toFixed(1) + '" y="' + (T + ph - bh).toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' + Math.max(bh, 0).toFixed(1) + '" style="fill:' + s.color + '"><title>' + esc(s.label + ' – ' + o.cats[i] + ': ' + (o.decimals ? rnd(val, o.decimals) : val)) + '</title></rect>';
        if (o.showValues && val > 0) out += '<text class="vl" x="' + (bx + (bw - 1) / 2).toFixed(1) + '" y="' + (T + ph - bh - 3).toFixed(1) + '" text-anchor="middle">' + (o.decimals ? rnd(val, o.decimals) : val) + '</text>';
      });
    });
    out += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '"/>';
    if (o.xTitle) out += '<text x="' + (L + pw / 2) + '" y="' + (H - 2) + '" text-anchor="middle">' + esc(o.xTitle) + '</text>';
    if (o.yTitle) out += '<text transform="translate(11 ' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(o.yTitle) + '</text>';
    return out + '</svg>';
  }

  function hbarChart(o) { // o: {groups:[{label, bars:[{value,color,tip}]}], label}
    var W = 400, LBL = 62, RT = 34, rowH = 14, gap = 12, T = 4;
    var max = 0; o.groups.forEach(function (g) { g.bars.forEach(function (b) { if (b.value > max) max = b.value; }); });
    var ny = niceMax(max), pw = W - LBL - RT;
    var H = T + o.groups.length * (o.groups[0].bars.length * rowH + gap) + 34;
    var out = svgOpen(W, H, o.label), v, yy = T;
    for (v = 0; v <= ny.max; v += ny.step) {
      var gx = LBL + pw * v / ny.max;
      out += '<line class="grid" x1="' + gx + '" x2="' + gx + '" y1="0" y2="' + (H - 34) + '"/><text x="' + gx + '" y="' + (H - 20) + '" text-anchor="middle">' + v + '</text>';
    }
    out += '<text x="' + (LBL + pw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.xTitle || '') + '</text>';
    o.groups.forEach(function (g) {
      out += '<text x="' + (LBL - 8) + '" y="' + (yy + (g.bars.length * rowH) / 2 + 4) + '" text-anchor="end" style="fill:var(--ink);font-weight:600">' + esc(g.label) + '</text>';
      g.bars.forEach(function (b, j) {
        var w = pw * b.value / ny.max, by = yy + j * rowH;
        out += '<rect rx="2" x="' + LBL + '" y="' + by + '" width="' + w.toFixed(1) + '" height="' + (rowH - 2) + '" style="fill:' + b.color + '"><title>' + esc(b.tip) + '</title></rect>';
        out += '<text class="vl" x="' + (LBL + w + 4).toFixed(1) + '" y="' + (by + rowH - 4) + '">' + b.value + '</text>';
      });
      yy += g.bars.length * rowH + gap;
    });
    return out + '</svg>';
  }

  function legend(items) {
    return '<div class="legend">' + items.map(function (i) { return '<span><i style="background:' + i.color + '"></i>' + esc(i.label) + '</span>'; }).join('') + '</div>';
  }
  var R1 = 'var(--c0)', R2 = 'var(--c1)';
  var FR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  /* ---------- Header ---------- */
  function renderHeader() {
    $('subtitle').textContent = DATA.event + ' · ' + event.players + ' players · ' + event.rounds + ' rounds · lanes ' + event.lanes.join(' & ');
    var b = $('badge');
    if (verification.ok) {
      b.className = 'badge ok';
      b.textContent = 'All ' + verification.cardsOk + ' scorecards match the scoreboard photos ✓';
    } else {
      b.className = 'badge bad';
      b.innerHTML = '<strong>Scorecard check failed (' + verification.mismatches.length + ' mismatch' + (verification.mismatches.length === 1 ? '' : 'es') + '):</strong><ul>' +
        verification.mismatches.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    }
    var hi = event.highlights, hiTxt = event.highest.map(function (x) { return x.player + ' (' + where(x) + ')'; }).join(', ');
    var lo = event.lowest.map(function (x) { return x.player + ' (' + where(x) + ')'; }).join(', ');
    var st = event.stats;
    function card(k, v, n) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + (n || '&nbsp;') + '</div></div>'; }
    $('summary').innerHTML = '<div class="cards">' +
      card('Players', event.players) + card('Player games', event.games, event.players + ' players × ' + event.rounds + ' rounds') +
      card('Total pins', event.totalPins, 'across all games') + card('Average game', f1(event.average)) +
      card('Highest game', event.highestScore, esc(hiTxt)) + card('Lowest game', event.lowestScore, esc(lo)) +
      card('Strikes', st.strikes, 'all balls marked X') + card('Spares', st.spares, 'all balls marked /') + '</div>';
  }

  /* ---------- Leaderboard ---------- */
  function renderLeaderboard() {
    var maxS = Math.max.apply(null, board.map(function (b) { return b.series; }));
    var anyTie = board.some(function (b) { return b.tied; });
    var rows = board.map(function (b) {
      var g1 = b.games[0], g2 = b.games[1];
      return '<tr><td class="rank">' + (b.tied ? 'T' : '') + b.rank + (b.rank === 1 ? ' <span class="gold" title="Highest series">★</span>' : '') + '</td>' +
        '<td class="l sticky">' + plink(b.player) + '</td>' +
        '<td>' + g1.total + '<span class="tag">L' + g1.lane + '</span></td><td>' + g2.total + '<span class="tag">L' + g2.lane + '</span></td>' +
        '<td><strong>' + b.series + '</strong><span class="bar" style="width:' + Math.round(b.series / maxS * 60) + 'px"></span></td>' +
        '<td>' + f1(b.average) + '</td><td>' + b.best + '</td></tr>';
    }).join('');
    $('leaderboard').innerHTML = '<h2>Leaderboard</h2><p class="lede">Ranked by series total (game 1 + game 2). ' +
      (anyTie ? 'Players with equal series share a rank, shown as T (tied); the next rank is skipped.' : 'No ties in the series totals this time; equal series would share a rank (shown as T) and the next rank would be skipped.') +
      ' Game 1 = round 1, game 2 = round 2. Click a name for the player view.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Rank</th><th class="l sticky">Player</th><th>Game 1</th><th>Game 2</th><th>Series</th><th>Average</th><th>Best game</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- Highlights ---------- */
  function renderHighlights() {
    var bf = hl.bestFrame, ms = hl.mostImproved, st = hl.mostStrikes, ss = hl.strikeStreak, mk = hl.markStreak;
    function item(t, h, d) { return '<div class="item"><div class="t">' + t + '</div><div class="h">' + h + '</div><div class="d">' + d + '</div></div>'; }
    var bfTxt = bf.items.map(function (x) { return x.player + ' · ' + where(x) + ' · frame ' + x.frame + ' (' + x.raw + ')'; }).join('; ');
    var lane = hl.lanes, round = hl.rounds;
    var laneDiff = lane.length === 2 ? +rnd(lane[1].average, 1) - +rnd(lane[0].average, 1) : 0;
    var rdDiff = round.length === 2 ? +rnd(round[1].average, 1) - +rnd(round[0].average, 1) : 0;
    var html = '<h2>Highlights</h2><p class="lede">All computed from the balls.</p><div class="hl" style="display:grid">' +
      item('Best single frame', bf.value + ' points', esc(bfTxt) + '. A strike scores 10 plus the next two balls, so a frame can be worth up to 30.') +
      item('Most improved', ms.items.length ? esc(joinNames(names(ms.items))) + ' ' + sgn(ms.value) : '–', ms.items.map(function (x) { return esc(x.player) + ': ' + x.games[0].total + ' → ' + x.games[1].total + ' (' + (x.improvementPct >= 0 ? '+' : '') + x.improvementPct.toFixed(0) + '%)'; }).join('; ') + '. Round 2 score minus round 1 score (only two games each, so a big swing can just be a good or bad night).') +
      item('Most strikes', esc(joinNames(names(st.items))) + ' · ' + st.value, 'Strike count over both games' + (st.items.length > 1 ? ' (tie)' : '') + '.') +
      item('Longest strike streak', ss.value + ' in a row', ss.items.map(function (x) { return esc(x.player) + ' (' + where(x) + ')'; }).join(', ') + '. Consecutive strike balls in one game.') +
      item('Longest mark streak', mk.value + ' frames', mk.items.map(function (x) { return esc(x.player) + ' (' + where(x) + ')'; }).join(', ') + '. Consecutive frames ending in a strike or spare.') +
      item('Best first ball', esc(joinNames(names(hl.bestFirstBall.items))) + ' · ' + f1(summaries[hl.bestFirstBall.items[0].player].stats.firstBallAvg), 'Highest average pins on the first ball of each frame.') +
      item('Fewest zero balls', esc(joinNames(names(hl.fewestZero.items))) + ' · ' + (-hl.fewestZero.value), 'Balls that knocked down nothing (“-”) over both games. Players who throw strikes throw fewer balls, so this slightly favours strikers.') +
      item('Lane 25 vs lane 26', lane.map(function (l) { return 'L' + l.lane + ' ' + f1(l.average); }).join(' · '),
        lane.map(function (l) { return 'Lane ' + l.lane + ': ' + l.games + ' games, ' + l.total + ' pins, ' + l.strikes + ' strikes'; }).join('. ') + '. Lane ' + (laneDiff >= 0 ? lane[1].lane : lane[0].lane) + ' averaged ' + Math.abs(laneDiff).toFixed(1) + ' pins more per game. Different players bowled each lane (and each round), so this is not a pure lane effect; with only 8 games per lane the gap is within normal game-to-game swings.') +
      item('Round 1 vs round 2', round.map(function (r) { return 'R' + r.round + ' ' + f1(r.average); }).join(' · '),
        round.map(function (r) { return 'Round ' + r.round + ': ' + r.games + ' games, ' + r.total + ' pins, ' + r.strikes + ' strikes'; }).join('. ') + '. Round ' + (rdDiff >= 0 ? round[1].round : round[0].round) + ' averaged ' + Math.abs(rdDiff).toFixed(1) + ' pins more per game. Same eight players in both rounds, but with only 8 games each the gap is small next to normal game-to-game swings.') +
      '</div>';
    $('highlights').innerHTML = html;
  }

  /* ---------- Scorecards ---------- */
  function ballCells(f) {
    var cells = f.chars.slice();
    if (f.number < 10 && f.kind === 'strike') cells = ['', 'X'];
    return cells.map(function (c) {
      var cls = c === 'X' ? 'x' : c === '/' ? 'sp' : c === '-' ? 'z' : '';
      return '<span class="' + cls + '">' + (c === '' ? '&nbsp;' : c) + '</span>';
    }).join('');
  }
  function cardRows(g, rows) {
    return rows.map(function (r) {
      var sc = S.scoreGame(r.frames);
      var nm = '<div class="pname"><span>' + plink(r.player) + '</span>' + (r.boardName ? '<small>board: ' + esc(r.boardName) + '</small>' : '') + '</div>';
      var frs = sc.frames.map(function (f) {
        return '<div class="fr' + (f.number === 10 ? ' last' : '') + '"><div class="balls">' + ballCells(f) + '</div><div class="run">' + sc.running[f.index] + '</div></div>';
      }).join('');
      return '<div class="crow">' + nm + frs + '<div class="ctot">' + sc.total + '</div></div>';
    }).join('');
  }
  function renderScorecards() {
    var head = '<div class="crow head"><div>Player</div>' + FR.map(function (n) { return '<div>' + n + '</div>'; }).join('') + '<div>Total</div></div>';
    var order = DATA.games.slice().sort(function (a, b) { return a.round - b.round || a.lane - b.lane; });
    var out = '<h2>Scorecards</h2><p class="lede">The four scoreboards, rebuilt from the balls. Each box shows the balls (X strike, / spare, - zero) above the running total. Scroll sideways inside a card on small screens.</p>';
    order.forEach(function (g) {
      out += '<div class="board"><div class="board-head"><strong>Round ' + g.round + ' · Lane ' + g.lane + '</strong><span class="muted small">photo ' + esc(g.photo) + ' · lane total ' + g.laneTotal + '</span></div>' +
        '<div class="scroll"><div class="card">' + head + cardRows(g, g.rows) + '</div></div></div>';
    });
    $('scorecards').innerHTML = out;
  }

  /* ---------- Charts ---------- */
  function lineFor(sel) {
    var series = [], title;
    if (sel === 'R1' || sel === 'R2') {
      var rn = sel === 'R1' ? 1 : 2;
      title = 'Everyone – round ' + rn;
      DATA.players.forEach(function (p) {
        var g = summaries[p].games.filter(function (x) { return x.round === rn; })[0];
        series.push({ label: p + ' R' + rn, color: pcol(p), values: [0].concat(g.stats.running) });
      });
    } else {
      title = sel;
      summaries[sel].games.forEach(function (g) {
        series.push({ label: sel + ' R' + g.round + ' (lane ' + g.lane + ')', color: g.round === 1 ? R1 : R2, values: [0].concat(g.stats.running) });
      });
    }
    return { series: series, title: title };
  }
  function lineHtml(sel) {
    var l = lineFor(sel);
    return legend(l.series.map(function (s) { return { label: s.label, color: s.color }; })) +
      lineChart({ yTitle: 'running total (pins)', series: l.series, xLabels: [''].concat(FR), label: 'Running total by frame: ' + l.title });
  }
  function barsHtml() {
    var groups = board.slice().sort(function (a, b) { return DATA.players.indexOf(a.player) - DATA.players.indexOf(b.player); }).map(function (b) {
      return { label: b.player, bars: b.games.map(function (g) { return { value: g.total, color: g.round === 1 ? R1 : R2, tip: b.player + ' game ' + g.round + ' (lane ' + g.lane + '): ' + g.total }; }) };
    });
    return legend([{ label: 'Game 1 (round 1)', color: R1 }, { label: 'Game 2 (round 2)', color: R2 }]) + hbarChart({ groups: groups, label: 'Game 1 versus game 2 score per player', xTitle: 'game score (pins)' });
  }
  function histHtml(rows, nm) {
    var h = S.firstBallHistogram(rows);
    return colChart({ cats: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], series: [{ label: nm + ' first balls', color: 'var(--c0)', values: h }], showValues: true, label: 'First-ball pin histogram', yTitle: 'number of frames', xTitle: 'pins knocked down with the first ball' });
  }
  function frameAvgHtml() {
    var a = S.frameAverages(rowsAll);
    return colChart({ cats: FR, series: [{ label: 'Average points', color: 'var(--c2)', values: a }], decimals: 1, showValues: true, label: 'Average points per frame across all games', xTitle: 'frame', yTitle: 'avg points' });
  }
  function renderCharts() {
    var opts = '<option value="R1">Everyone – round 1</option><option value="R2">Everyone – round 2</option>' +
      DATA.players.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + ' (both games)</option>'; }).join('');
    $('charts').innerHTML = '<h2>Charts</h2><p class="lede">Hover or tap a mark for exact values.</p><div class="chart-grid">' +
      '<figure class="chart"><figcaption>Running total by frame</figcaption><div class="controls"><label for="lineSel" class="small muted">Show</label><select id="lineSel">' + opts + '</select></div><div id="lineBox"></div></figure>' +
      '<figure class="chart"><figcaption>Game 1 vs game 2 per player</figcaption><div class="cap">Final score of each game.</div>' + barsHtml() + '</figure>' +
      '<figure class="chart"><figcaption>First-ball pins histogram</figcaption><div class="cap">Everyone, all 160 frames: how many pins the first ball knocked down (10 = strike).</div>' + histHtml(rowsAll, 'Everyone') + '</figure>' +
      '<figure class="chart"><figcaption>Average points by frame</figcaption><div class="cap">Mean frame score over all 16 games. A strike or spare frame includes its bonus balls, so it is worth more than the pins it knocked down.</div>' + frameAvgHtml() + '</figure>' +
      '</div>';
    var sel = $('lineSel');
    function upd() { $('lineBox').innerHTML = lineHtml(sel.value); }
    sel.addEventListener('change', upd); upd();
  }

  /* ---------- Player stats ---------- */
  var COLS = [
    ['strikes', 'Strikes', 'Number of balls that were strikes (X), including strikes thrown as 10th-frame bonus balls.'],
    ['spares', 'Spares', 'Number of balls that picked up a spare (/), including 10th-frame bonus-ball spares.'],
    ['strikePct', 'Strike %', 'Frames 1-10 whose first ball was a strike, divided by frames bowled (20 per player).'],
    ['spareConv', 'Spare conv. %', 'Spares made divided by spare chances. A chance is a frame (1-10) where the first ball was not a strike. Strike frames are excluded.'],
    ['opens', 'Opens', 'Frames 1-10 with neither a strike nor a spare (an open frame).'],
    ['zeroBalls', 'Zero balls', 'Balls that knocked down no pins, shown as "-" on the board (gutter balls and misses).'],
    ['firstBallAvg', '1st-ball avg', 'Average pins on the first ball of frames 1-10 (a strike counts 10). Bonus balls in frame 10 are not included.'],
    ['cleanPct', 'Clean frames %', 'Frames 1-10 ending in a strike or spare (a "mark"), divided by frames bowled.'],
    ['impr', 'R1 → R2', 'Round 2 score minus round 1 score, in pins. Positive means improved.']
  ];
  function cell(key, b) {
    var s = b.stats;
    switch (key) {
      case 'strikes': case 'spares': case 'opens': case 'zeroBalls': return s[key];
      case 'strikePct': return pc(s.strikePct) + frac(s.strikeFrames, s.frames);
      case 'spareConv': return pc(s.spareConv) + frac(s.spareFrames, s.spareChances);
      case 'cleanPct': return pc(s.cleanPct) + frac(s.cleanFrames, s.frames);
      case 'firstBallAvg': return f1(s.firstBallAvg);
      case 'impr': return b.improvement === null ? '–' : '<span class="delta ' + (b.improvement > 0 ? 'up' : b.improvement < 0 ? 'down' : '') + '">' + sgn(b.improvement) + '</span>';
    }
  }
  function statsTable(list, withTotal) {
    var th = COLS.map(function (c) { return '<th><span class="tip" title="' + esc(c[2]) + '">' + c[1] + '</span></th>'; }).join('');
    var tr = list.map(function (b) {
      return '<tr><td class="l sticky">' + plink(b.player) + '</td>' + COLS.map(function (c) { return '<td>' + cell(c[0], b) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="data"><thead><tr><th class="l sticky">Player</th>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></div>';
  }
  function renderStats() {
    var list = board.slice().sort(function (a, b) { return playerIdx(a.player) - playerIdx(b.player); });
    var ev = { player: 'Everyone', stats: event.stats, improvement: null };
    $('stats').innerHTML = '<h2>Player stats</h2><p class="lede">Each player, both games combined (20 frames). Hover a column title for its definition, or see the glossary below. All frame-based percentages use frames 1–10 only.</p>' +
      statsTable(list) +
      '<h3>Whole field</h3><div class="table-wrap"><table class="data"><tbody><tr><td class="l">Everyone (16 games, 160 frames)</td>' + COLS.slice(0, 8).map(function (c) { return '<td><span class="muted small">' + c[1] + '</span><br>' + cell(c[0], ev) + '</td>'; }).join('') + '</tr></tbody></table></div>';
  }

  function renderGlossary() {
    $('glossary').innerHTML = '<h2>Glossary and method</h2><dl class="gloss">' +
      COLS.map(function (c) { return '<dt>' + c[1] + '</dt><dd>' + esc(c[2]) + '</dd>'; }).join('') +
      '<dt>Frame 10 rule</dt><dd>Strikes, spares and zero balls are counted on every ball thrown, including the up-to-two bonus balls of the 10th frame. Frame-based measures (strike %, spare conversion, opens, first ball, clean frames) look at frames 1–10 only, using the first ball of the 10th frame and its first two balls to decide strike, spare or open. A spare made on a 10th-frame bonus ball after a strike counts in Spares but not in spare conversion.</dd>' +
      '<dt>Frame score</dt><dd>Points a frame adds to the running total: pins plus the strike or spare bonus.</dd>' +
      '<dt>Best single frame</dt><dd>Largest frame score in any game, including strike and spare bonuses (max 30 in frames 1-9). Ties are all listed.</dd>' +
      '<dt>Best first ball / Most strikes / Fewest zero balls</dt><dd>Compared across both games per player. Ties are all listed. 1st-ball avg is compared on the unrounded value.</dd>' +
      '<dt>Lane and round averages</dt><dd>Mean score of all games bowled on that lane or in that round. Different players bowled each lane, so this is only a rough comparison.</dd>' +
      '<dt>Percentages</dt><dd>Shown as a rounded percentage with the count behind it, e.g. 24% (4/17). With 20 frames per player, one frame moves strike % and clean % by 5 points, so treat small gaps as noise.</dd>' +
      '<dt>Series</dt><dd>Sum of a player’s two games. Average = series / 2.</dd>' +
      '<dt>Mark streak</dt><dd>Consecutive frames (1–10) each closed with a strike or spare.</dd>' +
      '<dt>Strike streak</dt><dd>Consecutive strike balls in one game, bonus balls included.</dd></dl>';
  }

  /* ---------- Player detail ---------- */
  function renderDetail(player) {
    var el = $('detail');
    if (!player || !summaries[player]) { el.hidden = true; el.innerHTML = ''; return; }
    var b = summaries[player], s = b.stats;
    var head = '<div class="crow head"><div>Game</div>' + FR.map(function (n) { return '<div>' + n + '</div>'; }).join('') + '<div>Total</div></div>';
    var cards = b.games.map(function (g) {
      return '<div class="board"><div class="board-head"><strong>Game ' + g.round + ' (round ' + g.round + ', lane ' + g.lane + ')</strong>' + (g.boardName ? '<span class="muted small">board name: ' + esc(g.boardName) + '</span>' : '') + '<span class="muted small">' + plural(g.stats.strikes, 'strike') + ', ' + plural(g.stats.spares, 'spare') + ', ' + plural(g.stats.opens, 'open') + '</span></div>' +
        '<div class="scroll"><div class="card">' + head + cardRows(g.game, [g.row]).replace(/<div class="pname">[\s\S]*?<\/div>/, '<div class="pname"><span>Game ' + g.round + '</span></div>') + '</div></div></div>';
    }).join('');
    var prow = rowsAll.filter(function (r) { return r.player === player; });
    var perFrame = {
      cats: FR, yTitle: 'points', xTitle: 'frame', label: player + ' points per frame, game 1 versus game 2',
      series: b.games.map(function (g) { return { label: player + ' game ' + g.round, color: g.round === 1 ? R1 : R2, values: g.stats.frameScores }; })
    };
    var kv = [
      ['Rank', (b.tied ? 'T' : '') + b.rank + ' of ' + board.length], ['Series', b.series], ['Average', f1(b.average)], ['Best game', b.best],
      ['Round 1 → 2', b.improvement === null ? '–' : sgn(b.improvement) + ' pins']
    ].concat(COLS.slice(0, 8).map(function (c) { return [c[1], cell(c[0], b)]; }));
    el.innerHTML = '<div class="detail-head"><div><h2>' + esc(player) + '</h2><p class="muted">Player view · ' + b.games.map(function (g) { return 'game ' + g.round + ': ' + g.total; }).join(' · ') + '</p></div><button type="button" class="btn" data-close="1">Close ✕</button></div>' +
      '<div class="kv">' + kv.map(function (x) { return '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('') + '</div>' +
      cards +
      '<div class="chart-grid">' +
      '<figure class="chart"><figcaption>Running total</figcaption>' + lineHtml(player) + '</figure>' +
      '<figure class="chart"><figcaption>Points per frame</figcaption><div class="cap">Frame score including strike and spare bonuses.</div>' + legend(perFrame.series.map(function (x) { return { label: x.label, color: x.color }; })) + colChart(perFrame) + '</figure>' +
      '<figure class="chart"><figcaption>First-ball pins</figcaption><div class="cap">Both games, 20 frames.</div>' + histHtml(prow, player) + '</figure>' +
      '</div>';
    el.hidden = false;
  }

  function route(scroll) {
    var m = /^#player=(.+)$/.exec(location.hash);
    var p = m ? decodeURIComponent(m[1]) : null;
    renderDetail(p);
    if (p && scroll && summaries[p]) $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-player],[data-close]') : null;
    if (!t) return;
    if (t.hasAttribute('data-close')) { history.replaceState(null, '', location.pathname + location.search); route(false); return; }
    var hash = '#player=' + encodeURIComponent(t.getAttribute('data-player'));
    if (location.hash === hash) route(true); else location.hash = hash;
  });
  window.addEventListener('hashchange', function () { route(/^#player=/.test(location.hash)); });

  renderHeader(); renderLeaderboard(); renderHighlights(); renderScorecards(); renderCharts(); renderStats(); renderGlossary();
  route(false);
})();
