#!/usr/bin/env node
// Re-scores every scorecard from the raw balls with standard ten-pin rules and compares
// with the numbers printed on the scoreboard photos (shown / total / laneTotal).
'use strict';
const path = require('path');
global.window = {};
require(path.join(__dirname, 'data.js'));
const S = require(path.join(__dirname, 'scoring.js'));
const data = global.window.BOWLING_DATA;

const res = S.verifyData(data);
let lines = 0;
data.games.forEach(g => {
  g.rows.forEach(r => {
    const sc = S.scoreGame(r.frames);
    const ok = sc.running.every((v, i) => v === r.shown[i]) && sc.total === r.total;
    console.log((ok ? 'PASS ' : 'FAIL ') + g.id.padEnd(7) + r.player.padEnd(8) + 'computed ' + String(sc.total).padStart(3) + '  board ' + String(r.total).padStart(3));
    lines++;
  });
  const sum = g.rows.reduce((a, r) => a + S.scoreGame(r.frames).total, 0);
  console.log((sum === g.laneTotal ? 'PASS ' : 'FAIL ') + g.id.padEnd(7) + 'lane total computed ' + sum + '  board ' + g.laneTotal);
});

console.log('');
const expectedCards = data.players.length * res.rounds;
if (res.ok && lines === expectedCards) {
  console.log('PASS: all ' + res.cardsOk + ' of ' + res.checked + ' scorecards (' + res.runningTotals + ' running totals, ' + res.checked + ' totals, ' + res.laneTotals + ' lane totals) match the scoreboards.');
  process.exit(0);
}
console.log('FAIL: ' + res.mismatches.length + ' mismatch(es)' + (lines !== expectedCards ? ' (expected ' + expectedCards + ' scorecards, found ' + lines + ')' : '') + ':');
res.mismatches.forEach(m => console.log('  - ' + m));
process.exit(1);
