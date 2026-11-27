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
    var W = 400, H = o.rotate ? 262 : 230, L = 44, R = 8, T = 16, B = o.rotate ? 54 : 34;
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
      if (o.rotate) out += '<text transform="translate(' + (gx + gw / 2 + 3) + ' ' + (T + ph + 14) + ') rotate(-40)" text-anchor="end">' + esc(c) + '</text>';
      else out += '<text x="' + (gx + gw / 2) + '" y="' + (H - 17) + '" text-anchor="middle">' + esc(c) + '</text>';
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
  function rcol(r) { return 'var(--c' + ((r - 1) % 8) + ')'; }
  var FR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  var NR = event.rounds, FPG = FR.length, FPP = NR * FPG;           // rounds, frames per game, frames per player
  var ROUNDS = []; for (var ri = 1; ri <= NR; ri++) ROUNDS.push(ri);
  var NGAMES = event.games, NPHOTOS = DATA.games.length;
  var LANES = event.lanes;
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function word(n) { return WORDS[n] || String(n); }
  function sparkline(scores) {
    var w = 64, h = 20, lo = event.lowestScore, hi = event.highestScore, span = Math.max(1, hi - lo);
    var pts = scores.map(function (v, i) { return [scores.length > 1 ? 3 + (w - 6) * i / (scores.length - 1) : w / 2, 3 + (h - 6) * (1 - (v - lo) / span)]; });
    var last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Trend ' + esc(scores.join(' to ')) + '"><polyline fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="' +
      pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/><circle r="2.4" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" fill="currentColor"/></svg>';
  }
  function seq(scores) { return scores.join(' → '); }

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
    $('foot').textContent = 'All numbers are computed in your browser from the individual balls transcribed from ' + word(NPHOTOS) + ' scoreboard photos.';
    var hiTxt = event.highest.map(function (x) { return x.player + ' (' + where(x) + ')'; }).join(', ');
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
      return '<tr><td class="rank">' + (b.tied ? 'T' : '') + b.rank + (b.rank === 1 ? ' <span class="gold" title="Highest series">★</span>' : '') + '</td>' +
        '<td class="l sticky">' + plink(b.player) + '</td>' +
        b.games.map(function (g) { return '<td>' + g.total + '<span class="tag">L' + g.lane + '</span></td>'; }).join('') +
        '<td><strong>' + b.series + '</strong><span class="bar" style="width:' + Math.round(b.series / maxS * 60) + 'px"></span></td>' +
        '<td>' + f1(b.average) + '</td><td>' + b.best + '</td></tr>';
    }).join('');
    var gameHeads = ROUNDS.map(function (r) { return '<th>Game ' + r + '</th>'; }).join('');
    $('leaderboard').innerHTML = '<h2>Leaderboard</h2><p class="lede">Ranked by series total (' + ROUNDS.map(function (r) { return 'game ' + r; }).join(' + ') + '). ' +
      (anyTie ? 'Players with equal series share a rank, shown as T (tied); the next rank is skipped.' : 'No ties in the series totals this time; equal series would share a rank (shown as T) and the next rank would be skipped.') +
      ' Game N = round N; the small tag is the lane. Average = series / ' + NR + '. Click a name for the player view.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Rank</th><th class="l sticky">Player</th>' + gameHeads + '<th>Series</th><th>Average</th><th>Best game</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- Highlights ---------- */
  function renderHighlights() {
    var bf = hl.bestFrame, ms = hl.mostImproved, st = hl.mostStrikes, ss = hl.strikeStreak, mk = hl.markStreak;
    function item(t, h, d) { return '<div class="item"><div class="t">' + t + '</div><div class="h">' + h + '</div><div class="d">' + d + '</div></div>'; }
    var bfTxt = bf.items.map(function (x) { return x.player + ' · ' + where(x) + ' · frame ' + x.frame + ' (' + x.raw + ')'; }).join('; ');
    var lane = hl.lanes, round = hl.rounds, sd = event.sd;
    function byAvg(list) { return list.slice().sort(function (x, y) { return y.average - x.average; }); }
    var lanesSorted = byAvg(lane), roundsSorted = byAvg(round);
    var laneDiff = lanesSorted.length >= 2 ? +rnd(lanesSorted[0].average, 1) - +rnd(lanesSorted[lanesSorted.length - 1].average, 1) : 0;
    var rdDiff = roundsSorted.length >= 2 ? +rnd(roundsSorted[0].average, 1) - +rnd(roundsSorted[roundsSorted.length - 1].average, 1) : 0;
    function vsSd(d) { return d < sd ? 'smaller' : 'larger'; }
    var sc = hl.mostConsistent;
    var html = '<h2>Highlights</h2><p class="lede">All computed from the balls.</p><div class="hl" style="display:grid">' +
      item('Best single frame', bf.value + ' points', esc(bfTxt) + '. A strike scores 10 plus the next two balls, so a frame can be worth up to 30.') +
      item('Most improved', ms.items.length ? esc(joinNames(names(ms.items))) + ' ' + sgn(ms.value) : '–', ms.items.map(function (x) { return esc(x.player) + ': ' + seq(x.scores) + ' (' + (x.improvementPct >= 0 ? '+' : '') + rnd(x.improvementPct, 0) + '%)'; }).join('; ') + '. Last game (round ' + NR + ') minus first game (round 1). With only ' + word(NR) + ' games each, a big swing can just be a good or bad night, and it ignores what happened in between.') +
      item('Most consistent', esc(joinNames(names(sc.items))) + ' · SD ' + f1(sc.items[0].consistency), sc.items.map(function (x) { return esc(x.player) + ': ' + seq(x.scores); }).join('; ') + '. Lowest standard deviation of game scores (lower = steadier). With ' + word(NR) + ' games each this is a rough guide only.') +
      item('Most strikes', esc(joinNames(names(st.items))) + ' · ' + st.value, 'Strike count over all ' + NR + ' games' + (st.items.length > 1 ? ' (tie)' : '') + '.') +
      item('Longest strike streak', ss.value + ' in a row', ss.items.map(function (x) { return esc(x.player) + ' (' + where(x) + ')'; }).join(', ') + '. Consecutive strike balls in one game.') +
      item('Longest mark streak', mk.value + ' frames', mk.items.map(function (x) { return esc(x.player) + ' (' + where(x) + ')'; }).join(', ') + '. Consecutive frames ending in a strike or spare.') +
      item('Best first ball', esc(joinNames(names(hl.bestFirstBall.items))) + ' · ' + f1(summaries[hl.bestFirstBall.items[0].player].stats.firstBallAvg), 'Highest average pins on the first ball of each frame.') +
      item('Fewest zero balls', esc(joinNames(names(hl.fewestZero.items))) + ' · ' + (-hl.fewestZero.value), 'Balls that knocked down nothing (“-”) over all ' + NR + ' games. Players who throw strikes throw fewer balls, so this slightly favours strikers.') +
      item('Lane ' + LANES.join(' vs lane '), lane.map(function (l) { return 'L' + l.lane + ' ' + f1(l.average); }).join(' · '),
        lane.map(function (l) { return 'Lane ' + l.lane + ': ' + l.games + ' games, ' + l.total + ' pins, ' + l.strikes + ' strikes'; }).join('. ') + '. Lane ' + lanesSorted[0].lane + ' averaged ' + rnd(laneDiff, 1) + ' pins more per game' + (lanesSorted.length > 2 ? ' than the lowest lane' : '') + '. Players were not all on the same lane in each round, so this is not a pure lane effect; with only ' + lane[0].games + ' games per lane the gap is ' + vsSd(laneDiff) + ' than the standard deviation of single games (' + f1(sd) + ' pins).') +
      item(ROUNDS.map(function (r) { return 'Round ' + r; }).join(' vs '), round.map(function (r) { return 'R' + r.round + ' ' + f1(r.average); }).join(' · '),
        round.map(function (r) { return 'Round ' + r.round + ': ' + r.games + ' games, ' + r.total + ' pins, ' + r.strikes + ' strikes'; }).join('. ') + '. Round ' + roundsSorted[0].round + ' averaged highest, round ' + roundsSorted[roundsSorted.length - 1].round + ' lowest, ' + rnd(rdDiff, 1) + ' pins apart. Same ' + word(event.players) + ' players in every round, but with only ' + round[0].games + ' games per round the spread is ' + vsSd(rdDiff) + ' than the standard deviation of single games (' + f1(sd) + ' pins).') +
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
    var out = '<h2>Scorecards</h2><p class="lede">The ' + word(NPHOTOS) + ' scoreboards, rebuilt from the balls. Each box shows the balls (X strike, / spare, - zero) above the running total. Scroll sideways inside a card on small screens.</p>';
    order.forEach(function (g) {
      out += '<div class="board"><div class="board-head"><strong>Round ' + g.round + ' · Lane ' + g.lane + '</strong><span class="muted small">photo ' + esc(g.photo) + ' · lane total ' + g.laneTotal + '</span></div>' +
        '<div class="scroll"><div class="card">' + head + cardRows(g, g.rows) + '</div></div></div>';
    });
    $('scorecards').innerHTML = out;
  }

  /* ---------- Charts ---------- */
  // sel is 'round:N' (everyone in round N) or 'player:Name' (all of that player's games)
  function lineFor(sel) {
    var series = [], title, m = /^round:(\d+)$/.exec(sel);
    if (m) {
      var rn = Number(m[1]);
      title = 'Everyone – round ' + rn;
      DATA.players.forEach(function (p) {
        var g = summaries[p].games.filter(function (x) { return x.round === rn; })[0];
        series.push({ label: p + ' R' + rn, color: pcol(p), values: [0].concat(g.stats.running) });
      });
    } else {
      var pl = sel.replace(/^player:/, '');
      title = pl;
      summaries[pl].games.forEach(function (g) {
        series.push({ label: pl + ' R' + g.round + ' (lane ' + g.lane + ')', color: rcol(g.round), values: [0].concat(g.stats.running) });
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
      return { label: b.player, bars: b.games.map(function (g) { return { value: g.total, color: rcol(g.round), tip: b.player + ' game ' + g.round + ' (lane ' + g.lane + '): ' + g.total }; }) };
    });
    return legend(ROUNDS.map(function (r) { return { label: 'Game ' + r + ' (round ' + r + ')', color: rcol(r) }; })) + hbarChart({ groups: groups, label: 'Game score per round for each player', xTitle: 'game score (pins)' });
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
    var opts = ROUNDS.map(function (r) { return '<option value="round:' + r + '">Everyone – round ' + r + '</option>'; }).join('') +
      DATA.players.map(function (p) { return '<option value="player:' + esc(p) + '">' + esc(p) + ' (all ' + NR + ' games)</option>'; }).join('');
    $('charts').innerHTML = '<h2>Charts</h2><p class="lede">Hover or tap a mark for exact values.</p><div class="chart-grid">' +
      '<figure class="chart"><figcaption>Running total by frame</figcaption><div class="controls"><label for="lineSel" class="small muted">Show</label><select id="lineSel">' + opts + '</select></div><div id="lineBox"></div></figure>' +
      '<figure class="chart"><figcaption>Game scores by round, per player</figcaption><div class="cap">Final score of each game.</div>' + barsHtml() + '</figure>' +
      '<figure class="chart"><figcaption>First-ball pins histogram</figcaption><div class="cap">Everyone, all ' + (NGAMES * FPG) + ' frames: how many pins the first ball knocked down (10 = strike).</div>' + histHtml(rowsAll, 'Everyone') + '</figure>' +
      '<figure class="chart"><figcaption>Average points by frame</figcaption><div class="cap">Mean frame score over all ' + NGAMES + ' games. A strike or spare frame includes its bonus balls, so it is worth more than the pins it knocked down.</div>' + frameAvgHtml() + '</figure>' +
      '</div>';
    var sel = $('lineSel');
    function upd() { $('lineBox').innerHTML = lineHtml(sel.value); }
    sel.addEventListener('change', upd); upd();
  }

  /* ---------- All games ---------- */
  var rankedGames = (function () {
    var list = rowsAll.map(function (x, i) {
      var st = x.stats;
      return { player: x.player, round: x.round, lane: x.lane, score: x.total, strikes: st.strikes, spares: st.spares, opens: st.opens,
        zeroBalls: st.zeroBalls, firstBallAvg: st.firstBallSum / FPG, cleanPct: st.cleanFrames / FPG * 100, cleanFrames: st.cleanFrames,
        bestFrame: Math.max.apply(null, st.frameScores), order: i };
    });
    list.sort(function (a, b) { return b.score - a.score || playerIdx(a.player) - playerIdx(b.player) || a.round - b.round; });
    list.forEach(function (g, i) { g.rank = i > 0 && list[i - 1].score === g.score ? list[i - 1].rank : i + 1; });
    list.forEach(function (g) { g.tied = list.filter(function (o) { return o.score === g.score; }).length > 1; });
    var pbs = {};
    list.forEach(function (g) { if (!(g.player in pbs) || g.score > pbs[g.player]) pbs[g.player] = g.score; });
    list.forEach(function (g) { g.pb = g.score === pbs[g.player]; g.top = g.score === event.highestScore; });
    return list;
  })();
  var AG_COLS = [
    ['rank', 'Rank', 'num', 'Rank by game score (ties share a rank).'],
    ['player', 'Player', 'text', 'Player'],
    ['round', 'Round', 'num', 'Round (game number) of this game.'],
    ['lane', 'Lane', 'num', 'Lane bowled on.'],
    ['score', 'Score', 'num', 'Final score of the game.'],
    ['strikes', 'Strikes', 'num', 'Balls that were strikes (X), 10th-frame bonus balls included.'],
    ['spares', 'Spares', 'num', 'Balls that were spares (/), 10th-frame bonus balls included.'],
    ['opens', 'Opens', 'num', 'Frames 1-10 with neither a strike nor a spare.'],
    ['zeroBalls', 'Zero balls', 'num', 'Balls that knocked down nothing (-).'],
    ['firstBallAvg', '1st-ball avg', 'num', 'Average pins on the first ball of frames 1-10 (strike = 10).'],
    ['cleanPct', 'Clean frames %', 'num', 'Frames 1-10 ending in a strike or spare, divided by ' + FPG + '.'],
    ['bestFrame', 'Best frame', 'num', 'Highest single frame score in the game, bonuses included.']
  ];
  var agSort = { key: 'score', dir: 'desc' };
  function agCell(key, g) {
    switch (key) {
      case 'rank': return (g.tied ? 'T' : '') + g.rank;
      case 'player': return plink(g.player);
      case 'round': return 'R' + g.round;
      case 'lane': return g.lane;
      case 'score': return '<strong>' + g.score + '</strong>' + (g.top ? ' <span class="gold" title="Highest game" aria-label="highest game">★</span>' : '') + (g.pb ? ' <span class="pb" title="Personal best" aria-label="personal best">PB</span>' : '');
      case 'firstBallAvg': return f1(g.firstBallAvg);
      case 'cleanPct': return pc(g.cleanPct) + frac(g.cleanFrames, FPG);
      default: return g[key];
    }
  }
  function agTable() {
    var key = agSort.key, mul = agSort.dir === 'asc' ? 1 : -1;
    var list = rankedGames.slice().sort(function (a, b) {
      var x = a[key], y = b[key], c = typeof x === 'string' ? (x === y ? 0 : playerIdx(x) - playerIdx(y)) : x - y;
      return c * mul || a.rank - b.rank || playerIdx(a.player) - playerIdx(b.player) || a.round - b.round;
    });
    var th = AG_COLS.map(function (c) {
      var on = key === c[0], text = c[2] === 'text';
      return '<th class="' + (text ? 'l ' : '') + 'sortable" ' + (on ? 'aria-sort="' + (agSort.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '><button type="button" class="sortbtn" data-sort="' + c[0] + '" title="' + esc(c[3]) + '">' + c[1] +
        ' <span class="arrow" aria-hidden="true">' + (on ? (agSort.dir === 'asc' ? '▲' : '▼') : '↕') + '</span></button></th>';
    }).join('');
    var tr = list.map(function (g) {
      return '<tr' + (g.top ? ' class="top"' : '') + '>' + AG_COLS.map(function (c) { return '<td' + (c[2] === 'text' ? ' class="l"' : '') + '>' + agCell(c[0], g) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="data" id="agTbl"><caption class="sr">All ' + NGAMES + ' games, sorted by ' + esc(AG_COLS.filter(function (c) { return c[0] === key; })[0][1]) + ' ' + (agSort.dir === 'asc' ? 'ascending' : 'descending') + '</caption><thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></div>';
  }
  function renderAllGames() {
    var scores = rowsAll.map(function (r) { return r.total; }), st = event.stats, frames = st.frames;
    function card(k, v, n) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + (n || '&nbsp;') + '</div></div>'; }
    var hiTxt = event.highest.map(function (x) { return x.player + ' (' + where(x) + ')'; }).join(', ');
    var loTxt = event.lowest.map(function (x) { return x.player + ' (' + where(x) + ')'; }).join(', ');
    var cards = '<div class="cards">' +
      card('Games', event.games, event.players + ' players × ' + NR + ' rounds') + card('Total pins', event.totalPins) +
      card('Mean score', f1(event.average)) + card('Median score', f1(event.median)) +
      card('Std deviation', f1(event.sd), 'population SD of game scores') +
      card('Highest game', event.highestScore, esc(hiTxt)) + card('Lowest game', event.lowestScore, esc(loTxt)) +
      card('Strikes', st.strikes, 'balls marked X') + card('Spares', st.spares, 'balls marked /') +
      card('Strike %', pc(st.strikePct), st.strikeFrames + ' of ' + frames + ' frames') +
      card('Spare conversion', pc(st.spareConv), st.spareFrames + ' of ' + st.spareChances + ' chances') +
      card('Open frames', pc(st.opens / frames * 100), st.opens + ' of ' + frames + ' frames') +
      card('Zero balls', st.zeroBalls, 'balls with no pins') + card('Avg first ball', f1(st.firstBallAvg), 'pins, frames 1-10') + '</div>';
    var bins = S.scoreHistogram(scores, 10);
    var hist = colChart({ cats: bins.map(function (b) { return b.from + '–' + b.to; }), rotate: bins.length > 7, series: [{ label: 'Games', color: 'var(--c0)', values: bins.map(function (b) { return b.count; }) }],
      showValues: true, label: 'Distribution of game scores in 10-pin bins', yTitle: 'number of games', xTitle: 'game score (pins)' });
    var rAvg = colChart({ cats: ROUNDS.map(function (r) { return 'Round ' + r; }), series: [{ label: 'Mean score', color: 'var(--c2)', values: hl.rounds.map(function (r) { return r.average; }) }],
      decimals: 1, showValues: true, label: 'Mean game score per round, all players', yTitle: 'mean score (pins)' });
    $('allgames').innerHTML = '<h2>All games</h2><p class="lede">Every one of the ' + NGAMES + ' games on one board, and statistics for all of them combined. All values are computed from the balls.</p>' + cards +
      '<div class="chart-grid" style="margin-top:16px"><figure class="chart"><figcaption>Score distribution</figcaption><div class="cap">Number of games per 10-pin score band (' + bins[0].from + '–' + bins[bins.length - 1].to + ').</div>' + hist + '</figure>' +
      '<figure class="chart"><figcaption>Mean score per round</figcaption><div class="cap">All ' + event.players + ' players, ' + hl.rounds[0].games + ' games per round.</div>' + rAvg + '</figure></div>' +
      '<h3>Every game</h3><p class="lede">Ranked by score. Click a column title to sort; click again to reverse. ★ marks the highest game, PB a player’s personal best.</p><div id="agWrap">' + agTable() + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!b) return;
    var k = b.getAttribute('data-sort'), col = AG_COLS.filter(function (c) { return c[0] === k; })[0];
    if (agSort.key === k) agSort.dir = agSort.dir === 'asc' ? 'desc' : 'asc';
    else agSort = { key: k, dir: (col[2] === 'text' || k === 'rank') ? 'asc' : 'desc' };
    $('agWrap').innerHTML = agTable();
    var nb = $('agWrap').querySelector('[data-sort="' + k + '"]'); if (nb) nb.focus();
  });

  /* ---------- Player stats ---------- */
  var COLS = [
    ['strikes', 'Strikes', 'Number of balls that were strikes (X), including strikes thrown as 10th-frame bonus balls.'],
    ['spares', 'Spares', 'Number of balls that picked up a spare (/), including 10th-frame bonus-ball spares.'],
    ['strikePct', 'Strike %', 'Frames 1-10 whose first ball was a strike, divided by frames bowled (' + FPP + ' per player).'],
    ['spareConv', 'Spare conv. %', 'Spares made divided by spare chances. A chance is a frame (1-10) where the first ball was not a strike. Strike frames are excluded.'],
    ['opens', 'Opens', 'Frames 1-10 with neither a strike nor a spare (an open frame).'],
    ['zeroBalls', 'Zero balls', 'Balls that knocked down no pins, shown as "-" on the board (gutter balls and misses).'],
    ['firstBallAvg', '1st-ball avg', 'Average pins on the first ball of frames 1-10 (a strike counts 10). Bonus balls in frame 10 are not included.'],
    ['cleanPct', 'Clean frames %', 'Frames 1-10 ending in a strike or spare (a "mark"), divided by frames bowled.'],
    ['impr', 'Last − first', 'Last game (round ' + NR + ') minus first game (round 1), in pins. Positive means the player finished higher than they started.'],
    ['trend', 'Trend', 'The game scores in round order, with a small line drawn on one shared scale for all players.'],
    ['consistency', 'Consistency (SD)', 'Population standard deviation of the player\u2019s game scores: how far games typically sit from the player\u2019s own average. Lower = steadier. With only ' + NR + ' games it is a rough guide.']
  ];
  function cell(key, b) {
    var s = b.stats;
    switch (key) {
      case 'strikes': case 'spares': case 'opens': case 'zeroBalls': return s[key];
      case 'strikePct': return pc(s.strikePct) + frac(s.strikeFrames, s.frames);
      case 'spareConv': return pc(s.spareConv) + frac(s.spareFrames, s.spareChances);
      case 'cleanPct': return pc(s.cleanPct) + frac(s.cleanFrames, s.frames);
      case 'firstBallAvg': return f1(s.firstBallAvg);
      case 'trend': return '<span class="trend">' + sparkline(b.scores) + ' <span class="muted small">' + esc(seq(b.scores)) + '</span></span>';
      case 'consistency': return b.consistency === null || b.consistency === undefined ? '–' : f1(b.consistency);
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
    $('stats').innerHTML = '<h2>Player stats</h2><p class="lede">Each player, all ' + NR + ' games combined (' + FPP + ' frames). Hover a column title for its definition, or see the glossary below. All frame-based percentages use frames 1–10 only.</p>' +
      statsTable(list) +
      '<h3>Whole field</h3><div class="table-wrap"><table class="data"><tbody><tr><td class="l">Everyone (' + NGAMES + ' games, ' + (NGAMES * FPG) + ' frames)</td>' + COLS.slice(0, 8).map(function (c) { return '<td><span class="muted small">' + c[1] + '</span><br>' + cell(c[0], ev) + '</td>'; }).join('') + '</tr></tbody></table></div>';
  }

  function renderGlossary() {
    $('glossary').innerHTML = '<h2>Glossary and method</h2><dl class="gloss">' +
      COLS.map(function (c) { return '<dt>' + c[1] + '</dt><dd>' + esc(c[2]) + '</dd>'; }).join('') +
      '<dt>Frame 10 rule</dt><dd>Strikes, spares and zero balls are counted on every ball thrown, including the up-to-two bonus balls of the 10th frame. Frame-based measures (strike %, spare conversion, opens, first ball, clean frames) look at frames 1–10 only, using the first ball of the 10th frame and its first two balls to decide strike, spare or open. A spare made on a 10th-frame bonus ball after a strike counts in Spares but not in spare conversion.</dd>' +
      '<dt>Frame score</dt><dd>Points a frame adds to the running total: pins plus the strike or spare bonus.</dd>' +
      '<dt>Best single frame</dt><dd>Largest frame score in any game, including strike and spare bonuses (max 30 in frames 1-9). Ties are all listed.</dd>' +
      '<dt>Best first ball / Most strikes / Fewest zero balls</dt><dd>Compared across all ' + NR + ' games per player. Ties are all listed. 1st-ball avg is compared on the unrounded value.</dd>' +
      '<dt>Lane and round averages</dt><dd>Mean score of all games bowled on that lane or in that round. Different players bowled each lane, so this is only a rough comparison.</dd>' +
      '<dt>Percentages</dt><dd>Shown as a rounded percentage with the count behind it, e.g. 24% (4/17). With ' + FPP + ' frames per player, one frame moves strike % and clean % by 5 points, so treat small gaps as noise.</dd>' +
      '<dt>Series</dt><dd>Sum of a player’s ' + word(NR) + ' games. Average = series / ' + NR + '.</dd>' +
      '<dt>Median</dt><dd>The middle game score when all scores are sorted (the mean of the two middle scores when the count is even).</dd>' +
      '<dt>Standard deviation (SD)</dt><dd>Population standard deviation: the square root of the average squared distance of each score from the mean (divides by n). For a player it is the Consistency column; for the All games board it is taken over every game. Lower = steadier.</dd>' +
      '<dt>Personal best (PB)</dt><dd>A player’s highest game score; ties mark every game with that score.</dd>' +
      '<dt>Score distribution</dt><dd>Games counted in bins of 10 pins (for example 90–99).</dd>' +
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
      cats: FR, yTitle: 'points', xTitle: 'frame', label: player + ' points per frame, one series per game',
      series: b.games.map(function (g) { return { label: player + ' game ' + g.round, color: rcol(g.round), values: g.stats.frameScores }; })
    };
    var kv = [
      ['Rank', (b.tied ? 'T' : '') + b.rank + ' of ' + board.length], ['Series', b.series], ['Average', f1(b.average)], ['Best game', b.best],
      ['Last − first', b.improvement === null ? '–' : sgn(b.improvement) + ' pins'], ['Trend', esc(seq(b.scores))], ['Consistency (SD)', f1(b.consistency)]
    ].concat(COLS.slice(0, 8).map(function (c) { return [c[1], cell(c[0], b)]; }));
    el.innerHTML = '<div class="detail-head"><div><h2>' + esc(player) + '</h2><p class="muted">Player view · ' + b.games.map(function (g) { return 'game ' + g.round + ': ' + g.total; }).join(' · ') + '</p></div><button type="button" class="btn" data-close="1">Close ✕</button></div>' +
      '<div class="kv">' + kv.map(function (x) { return '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('') + '</div>' +
      cards +
      '<div class="chart-grid">' +
      '<figure class="chart"><figcaption>Running total</figcaption>' + lineHtml('player:' + player) + '</figure>' +
      '<figure class="chart"><figcaption>Points per frame</figcaption><div class="cap">Frame score including strike and spare bonuses.</div>' + legend(perFrame.series.map(function (x) { return { label: x.label, color: x.color }; })) + colChart(perFrame) + '</figure>' +
      '<figure class="chart"><figcaption>First-ball pins</figcaption><div class="cap">All ' + NR + ' games, ' + FPP + ' frames.</div>' + histHtml(prow, player) + '</figure>' +
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

  renderHeader(); renderLeaderboard(); renderAllGames(); renderHighlights(); renderScorecards(); renderCharts(); renderStats(); renderGlossary();
  route(false);
})();
