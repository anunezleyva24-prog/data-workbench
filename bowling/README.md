# Bowling Night Stats

Static, dependency-free stats site (plain HTML/CSS/JS, hand-drawn SVG charts). Open `index.html` or serve the folder; all paths are relative.

- `data.js` – ground truth transcribed from the scoreboard photos (every player has one game per round) (do not edit numbers)
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
- Last − first: score of the final round minus score of round 1. Trend: the game scores in round order (e.g. 84 → 136 → 83).
- Consistency: population standard deviation (divides by n) of a player's game scores; lower = steadier.
- Rank: by series (sum of all games); ties share a rank (T2, T2, 4). Average = series / number of games.
- All games section: every game on one sortable board plus global stats (mean, median, population SD, strike %, spare conversion, open frame %, score histogram in 10-pin bins, mean per round), all computed from the balls.
