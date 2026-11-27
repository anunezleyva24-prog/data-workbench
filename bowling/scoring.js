/* Bowling scoring and statistics: pure functions, no DOM.
 * Works in the browser (window.BowlingScoring) and in Node (module.exports).
 *
 * Notation: "X" strike, "/" spare, "-" zero pins, digit = pins knocked down.
 * Frames 1-9 have 1 or 2 balls; frame 10 has 2 or 3 balls.
 */
(function (root) {
  'use strict';

  var FRAMES = 10;

  function pinsOf(ch) {
    if (ch === '-') return 0;
    if (/^[1-9]$/.test(ch)) return Number(ch);
    return NaN;
  }

  // Parse one frame string into {raw, chars, balls, kind}. Throws on impossible notation.
  function parseFrame(str, idx) {
    var label = 'frame ' + (idx + 1) + ' "' + str + '"';
    if (typeof str !== 'string' || str.length === 0) throw new Error('empty ' + label);
    var chars = str.split('');
    var balls = [];
    var i;

    if (idx < FRAMES - 1) {
      if (str === 'X') {
        balls = [10];
      } else if (str.length === 2) {
        var a = pinsOf(chars[0]);
        if (isNaN(a)) throw new Error('bad first ball in ' + label);
        if (chars[1] === '/') {
          balls = [a, 10 - a];
        } else {
          var b = pinsOf(chars[1]);
          if (isNaN(b)) throw new Error('bad second ball in ' + label);
          if (a + b > 9) throw new Error('open frame cannot reach 10 pins in ' + label);
          balls = [a, b];
        }
      } else {
        throw new Error('invalid ' + label);
      }
    } else {
      var standing = 10;
      for (i = 0; i < chars.length; i++) {
        var c = chars[i], p;
        if (c === 'X') {
          if (standing !== 10) throw new Error('strike on a partial rack in ' + label);
          p = 10;
        } else if (c === '/') {
          if (standing === 10 || i === 0) throw new Error('spare without a first ball in ' + label);
          p = standing;
        } else {
          p = pinsOf(c);
          if (isNaN(p)) throw new Error('bad ball "' + c + '" in ' + label);
          if (p > standing) throw new Error('more pins than standing in ' + label);
          if (p === standing) throw new Error('clearing the rack must be written X or / in ' + label);
        }
        balls.push(p);
        standing = (p === standing) ? 10 : standing - p;
      }
      var hasMark = balls[0] === 10 || balls[0] + balls[1] === 10;
      if (balls.length < 2 || balls.length > 3) throw new Error('10th frame needs 2 or 3 balls: ' + label);
      if (hasMark && balls.length !== 3) throw new Error('10th frame mark earns a 3rd ball: ' + label);
      if (!hasMark && balls.length !== 2) throw new Error('10th frame open has only 2 balls: ' + label);
    }

    var kind;
    if (balls[0] === 10) kind = 'strike';
    else if (balls[0] + balls[1] === 10) kind = 'spare';
    else kind = 'open';
    return { index: idx, number: idx + 1, raw: str, chars: chars, balls: balls, kind: kind };
  }

  function parseGame(frames) {
    if (!Array.isArray(frames) || frames.length !== FRAMES) throw new Error('a game needs exactly 10 frames');
    return frames.map(parseFrame);
  }

  // Standard ten-pin scoring. Returns parsed frames (each with .score), running totals and total.
  function scoreGame(frames) {
    var parsed = parseGame(frames);
    var rolls = [];
    parsed.forEach(function (f) { f.balls.forEach(function (b) { rolls.push(b); }); });
    var pos = 0, running = [], sum = 0;
    parsed.forEach(function (f, n) {
      var s;
      if (n < FRAMES - 1) {
        if (f.kind === 'strike') { s = 10 + rolls[pos + 1] + rolls[pos + 2]; pos += 1; }
        else if (f.kind === 'spare') { s = 10 + rolls[pos + 2]; pos += 2; }
        else { s = rolls[pos] + rolls[pos + 1]; pos += 2; }
      } else {
        s = f.balls.reduce(function (a, b) { return a + b; }, 0);
      }
      f.score = s;
      sum += s;
      f.running = sum;
      running.push(sum);
    });
    return { frames: parsed, running: running, total: sum };
  }

  function longestRun(flags) {
    var best = 0, cur = 0;
    flags.forEach(function (f) { cur = f ? cur + 1 : 0; if (cur > best) best = cur; });
    return best;
  }

  /* Per-game statistics. Definitions (see README):
   *  strikes        every ball written X (10th-frame bonus balls included)
   *  spares         every ball written / (10th-frame bonus balls included)
   *  strikeFrames   frames 1-10 whose FIRST ball is a strike
   *  spareFrames    frames 1-10 whose first ball is not a strike and second ball is /
   *  spareChances   10 - strikeFrames (frames where a spare was possible)
   *  opens          frames 1-10 with neither a strike nor a spare
   *  zeroBalls      balls written "-" (0 pins)
   *  firstBallSum   pins on the first ball of frames 1-10 (strike = 10); bonus balls excluded
   *  cleanFrames    strikeFrames + spareFrames
   *  strikeStreak   longest run of consecutive strike balls (bonus balls included)
   *  markStreak     longest run of consecutive frames 1-10 that are a strike or spare
   */
  function gameStats(frames) {
    var sc = scoreGame(frames), fr = sc.frames;
    var st = {
      total: sc.total, running: sc.running, frameScores: fr.map(function (f) { return f.score; }),
      firstBalls: fr.map(function (f) { return f.balls[0]; }),
      strikes: 0, spares: 0, strikeFrames: 0, spareFrames: 0, opens: 0, zeroBalls: 0, firstBallSum: 0
    };
    var strikeBalls = [];
    fr.forEach(function (f) {
      f.chars.forEach(function (c) {
        if (c === 'X') st.strikes++;
        if (c === '/') st.spares++;
        if (c === '-') st.zeroBalls++;
        strikeBalls.push(c === 'X');
      });
      if (f.kind === 'strike') st.strikeFrames++;
      else if (f.kind === 'spare') st.spareFrames++;
      else st.opens++;
      st.firstBallSum += f.balls[0];
    });
    st.spareChances = FRAMES - st.strikeFrames;
    st.cleanFrames = st.strikeFrames + st.spareFrames;
    st.strikeStreak = longestRun(strikeBalls);
    st.markStreak = longestRun(fr.map(function (f) { return f.kind !== 'open'; }));
    return st;
  }

  function sumKeys(list, keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = 0; });
    list.forEach(function (s) { keys.forEach(function (k) { o[k] += s[k]; }); });
    return o;
  }
  function pct(a, b) { return b > 0 ? (a / b) * 100 : null; }

  var AGG_KEYS = ['strikes', 'spares', 'strikeFrames', 'spareFrames', 'spareChances', 'opens',
    'zeroBalls', 'firstBallSum', 'cleanFrames'];

  // Aggregated stats over a list of per-game stats.
  function aggregate(statList) {
    var a = sumKeys(statList, AGG_KEYS);
    a.games = statList.length;
    a.frames = statList.length * FRAMES;
    a.strikePct = pct(a.strikeFrames, a.frames);
    a.spareConv = pct(a.spareFrames, a.spareChances);
    a.firstBallAvg = a.frames ? a.firstBallSum / a.frames : null;
    a.cleanPct = pct(a.cleanFrames, a.frames);
    a.strikeStreak = Math.max.apply(null, [0].concat(statList.map(function (s) { return s.strikeStreak; })));
    a.markStreak = Math.max.apply(null, [0].concat(statList.map(function (s) { return s.markStreak; })));
    return a;
  }

  // All games of a player, ordered by round. Each: {id, round, lane, boardName, total, stats, row, game}
  function playerGames(data, player) {
    var out = [];
    data.games.forEach(function (g) {
      g.rows.forEach(function (r) {
        if (r.player === player) {
          out.push({ id: g.id, round: g.round, lane: g.lane, boardName: r.boardName || null,
            total: r.total, stats: gameStats(r.frames), row: r, game: g });
        }
      });
    });
    out.sort(function (a, b) { return a.round - b.round; });
    return out;
  }

  function mean(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; }
  // Population standard deviation (divides by n, not n - 1).
  function stdev(list) {
    if (!list.length) return null;
    var m = mean(list);
    return Math.sqrt(mean(list.map(function (v) { return (v - m) * (v - m); })));
  }
  function median(list) {
    if (!list.length) return null;
    var a = list.slice().sort(function (x, y) { return x - y; }), n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function roundCount(data) { return Math.max.apply(null, [0].concat(data.games.map(function (g) { return g.round; }))); }

  function playerSummary(data, player) {
    var games = playerGames(data, player);
    var scores = games.map(function (g) { return g.total; });
    var series = scores.reduce(function (a, b) { return a + b; }, 0);
    var agg = aggregate(games.map(function (g) { return g.stats; }));
    var first = games[0], last = games[games.length - 1];
    var canCompare = games.length >= 2;
    return {
      player: player, games: games, scores: scores, series: series,
      average: games.length ? series / games.length : null,
      best: Math.max.apply(null, scores),
      stats: agg,
      // Last game minus first game (final round minus round 1), in pins.
      improvement: canCompare ? last.total - first.total : null,
      improvementPct: (canCompare && first.total) ? (last.total - first.total) / first.total * 100 : null,
      consistency: stdev(scores)
    };
  }

  // Competition ranking ("1,2,2,4") by series total. Returns summaries with .rank and .tied.
  function leaderboard(data) {
    var rows = data.players.map(function (p) { return playerSummary(data, p); });
    rows.sort(function (a, b) { return b.series - a.series || data.players.indexOf(a.player) - data.players.indexOf(b.player); });
    rows.forEach(function (r, i) {
      r.rank = (i > 0 && rows[i - 1].series === r.series) ? rows[i - 1].rank : i + 1;
    });
    rows.forEach(function (r) {
      r.tied = rows.filter(function (o) { return o.series === r.series; }).length > 1;
    });
    return rows;
  }

  // Flat list of every game row with context.
  function allRows(data) {
    var out = [];
    data.games.forEach(function (g) {
      g.rows.forEach(function (r) {
        out.push({ game: g, row: r, player: r.player, round: g.round, lane: g.lane, total: r.total, stats: gameStats(r.frames) });
      });
    });
    return out;
  }

  function allFrames(data) {
    var out = [];
    allRows(data).forEach(function (x) {
      var sc = scoreGame(x.row.frames);
      sc.frames.forEach(function (f) {
        out.push({ player: x.player, round: x.round, lane: x.lane, gameId: x.game.id, frame: f.number,
          raw: f.raw, kind: f.kind, score: f.score });
      });
    });
    return out;
  }

  // Histogram of first-ball pins (0..10) for frames 1-10 over the given rows.
  function firstBallHistogram(rows) {
    var h = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    rows.forEach(function (x) { x.stats.firstBalls.forEach(function (p) { h[p]++; }); });
    return h;
  }

  // Histogram of game scores in bins of `size` pins (30-39, 40-49, ...), covering min..max.
  function scoreHistogram(scores, size) {
    size = size || 10;
    if (!scores.length) return [];
    var lo = Math.floor(Math.min.apply(null, scores) / size) * size;
    var hi = Math.floor(Math.max.apply(null, scores) / size) * size;
    var bins = [];
    for (var s = lo; s <= hi; s += size) bins.push({ from: s, to: s + size - 1, count: 0 });
    scores.forEach(function (v) { bins[Math.floor((v - lo) / size)].count++; });
    return bins;
  }

  // Average points scored by frame number (index 0 = frame 1) over the given rows.
  function frameAverages(rows) {
    var sums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    rows.forEach(function (x) { x.stats.frameScores.forEach(function (s, i) { sums[i] += s; }); });
    return sums.map(function (s) { return rows.length ? s / rows.length : 0; });
  }

  function maxBy(list, fn) {
    var m = -Infinity;
    list.forEach(function (x) { var v = fn(x); if (v > m) m = v; });
    return { value: m, items: list.filter(function (x) { return fn(x) === m; }) };
  }
  var avg = mean;

  function eventSummary(data) {
    var rows = allRows(data);
    var totals = rows.map(function (r) { return r.total; });
    var hi = maxBy(rows, function (r) { return r.total; });
    var lo = maxBy(rows, function (r) { return -r.total; });
    var agg = aggregate(rows.map(function (r) { return r.stats; }));
    return {
      players: data.players.length, games: rows.length, rounds: roundCount(data),
      lanes: data.games.map(function (g) { return g.lane; }).filter(function (l, i, a) { return a.indexOf(l) === i; }).sort(),
      totalPins: totals.reduce(function (a, b) { return a + b; }, 0),
      average: avg(totals), median: median(totals), sd: stdev(totals), highest: hi.items, highestScore: hi.value,
      lowest: lo.items, lowestScore: -lo.value, stats: agg
    };
  }

  function highlights(data) {
    var rows = allRows(data), frames = allFrames(data), board = leaderboard(data);
    var bestFrame = maxBy(frames, function (f) { return f.score; });
    var improved = maxBy(board.filter(function (b) { return b.improvement !== null; }), function (b) { return b.improvement; });
    var steady = maxBy(board, function (b) { return -Math.round(b.consistency * 1000); });
    var strikes = maxBy(board, function (b) { return b.stats.strikes; });
    var strikeStreak = maxBy(rows, function (r) { return r.stats.strikeStreak; });
    var markStreak = maxBy(rows, function (r) { return r.stats.markStreak; });
    var firstBall = maxBy(board, function (b) { return Math.round(b.stats.firstBallAvg * 1000); });
    var fewestZero = maxBy(board, function (b) { return -b.stats.zeroBalls; });

    function groupAvg(pred) {
      var rs = rows.filter(pred);
      var s = rs.map(function (r) { return r.total; });
      return { games: rs.length, average: avg(s), total: s.reduce(function (a, b) { return a + b; }, 0),
        strikes: rs.reduce(function (a, r) { return a + r.stats.strikes; }, 0),
        best: Math.max.apply(null, s) };
    }
    var lanes = {};
    data.games.forEach(function (g) { lanes[g.lane] = true; });
    var laneStats = Object.keys(lanes).sort().map(function (l) {
      var o = groupAvg(function (r) { return r.lane === Number(l); }); o.lane = Number(l); return o;
    });
    var roundStats = [];
    for (var n = 1; n <= roundCount(data); n++) {
      var o = groupAvg(function (r) { return r.round === n; }); o.round = n; roundStats.push(o);
    }
    return {
      bestFrame: bestFrame, mostImproved: improved, mostConsistent: steady, mostStrikes: strikes,
      strikeStreak: strikeStreak, markStreak: markStreak, bestFirstBall: firstBall, fewestZero: fewestZero,
      lanes: laneStats, rounds: roundStats
    };
  }

  /* Re-score every scoreboard and compare with the printed numbers. */
  function verifyData(data) {
    var mismatches = [], checked = 0, cardsOk = 0, runningTotals = 0, laneTotals = 0;
    var rounds = roundCount(data);
    var perPlayer = {};
    data.games.forEach(function (g) {
      var laneSum = 0;
      g.rows.forEach(function (r) {
        checked++;
        var before = mismatches.length, sc;
        var tag = g.id + ' ' + r.player;
        try {
          sc = scoreGame(r.frames);
        } catch (e) {
          mismatches.push(tag + ': ' + e.message);
          return;
        }
        if (!Array.isArray(r.shown) || r.shown.length !== FRAMES) mismatches.push(tag + ': shown must have 10 values');
        sc.running.forEach(function (v, i) {
          if (r.shown && r.shown[i] !== v) mismatches.push(tag + ' frame ' + (i + 1) + ': computed ' + v + ' but board shows ' + r.shown[i]);
        });
        if (sc.total !== r.total) mismatches.push(tag + ': computed total ' + sc.total + ' but board total is ' + r.total);
        if (r.shown && r.shown[FRAMES - 1] !== r.total) mismatches.push(tag + ': last running total ' + r.shown[FRAMES - 1] + ' differs from total ' + r.total);
        laneSum += sc.total;
        if (mismatches.length === before) runningTotals += sc.running.length;
        perPlayer[r.player] = (perPlayer[r.player] || 0) + 1;
        if (mismatches.length === before) cardsOk++;
      });
      laneTotals++;
      if (laneSum !== g.laneTotal) mismatches.push(g.id + ': lane total computed ' + laneSum + ' but board shows ' + g.laneTotal);
    });
    data.players.forEach(function (p) {
      if (perPlayer[p] !== rounds) mismatches.push(p + ' has ' + (perPlayer[p] || 0) + ' games, expected ' + rounds + ' (one per round)');
    });
    return { ok: mismatches.length === 0, checked: checked, cardsOk: cardsOk, rounds: rounds,
      runningTotals: runningTotals, laneTotals: laneTotals, mismatches: mismatches };
  }

  var api = {
    parseFrame: parseFrame, parseGame: parseGame, scoreGame: scoreGame, gameStats: gameStats,
    aggregate: aggregate, playerGames: playerGames, playerSummary: playerSummary, leaderboard: leaderboard,
    allRows: allRows, allFrames: allFrames, firstBallHistogram: firstBallHistogram,
    frameAverages: frameAverages, mean: mean, median: median, stdev: stdev, roundCount: roundCount,
    scoreHistogram: scoreHistogram, eventSummary: eventSummary, highlights: highlights, verifyData: verifyData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BowlingScoring = api;
})(typeof window !== 'undefined' ? window : this);
