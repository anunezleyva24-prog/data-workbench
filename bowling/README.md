# Bowling Night Stats

Static, dependency-free stats site (plain HTML/CSS/JS, hand-drawn SVG charts). Open `index.html` or serve the folder; all paths are relative.

- `data.js` – ground truth transcribed from 4 scoreboard photos (do not edit numbers)
- `scoring.js` – pure scoring + statistics (browser and Node)
- `app.js`, `styles.css`, `index.html` – the UI
- `verify.js` – `node verify.js` re-scores every frame and checks `shown`, `total`, `laneTotal`; exits 1 on mismatch. The app runs the same check at load and shows a badge.

## Metric definitions
- Strikes / Spares / Zero balls: every ball marked X / `/` / `-`, including 10th-frame bonus balls.
- Strike %: frames 1-10 with a strike on the first ball / frames bowled.
- Spare conversion %: frames with a spare / frames whose first ball was not a strike.
- Opens: frames 1-10 with neither strike nor spare.
- First-ball average: mean pins on the first ball of frames 1-10 (strike = 10); bonus balls excluded.
- Clean frames %: (strike frames + spare frames) / frames bowled.
- Improvement: round 2 score minus round 1 score.
- Rank: by series (sum of 2 games); ties share a rank (T2, T2, 4).
