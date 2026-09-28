# Dix Mille — 10,000 Dice Game

An offline-capable Progressive Web App for playing the dice game **10,000**
(Dix Mille / Farkle) against 1–3 computer players. No build step, no
dependencies — plain HTML, CSS, and JavaScript.

## Play

Host the folder on any static web server and open it. Once loaded, the
service worker caches everything and the game works fully offline. On
Android (Chrome), use **Add to Home screen** to install it as an app.

For local testing:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

> The service worker (and thus offline/install support) requires HTTPS or
> `localhost` — opening `index.html` from `file://` runs the game but skips
> offline caching.

## Deploying to GitHub Pages

A workflow (`.github/workflows/deploy-pages.yml`) publishes the repository
root to GitHub Pages on every push to `main`. One-time setup: in the
repository settings, under **Pages**, set the source to **GitHub Actions**.
The app is then served at `https://<user>.github.io/dixmille/` and can be
installed on your phone from there.

## Rules implemented

- Six dice; set aside at least one scoring die after each roll, then either
  roll the remaining dice or bank the turn total.
- **Farkle**: a roll with no scoring dice wipes the points gathered this turn.
- **Hot dice**: when all six dice score, roll all six again.
- Scoring: single 1 = 100, single 5 = 50, three 1s = 1,000, three of a kind =
  face × 100, each extra matching die doubles the value, straight 1–6 = 1,500,
  three pairs = 1,500 (four of a kind + a pair counts).
- **Opening**: until a player is on the board, they must reach the opening
  score (configurable: none / 500 / 750 / 1,000) in a single turn to bank.
- First to **10,000** triggers the final round: every other player gets one
  last turn, then the highest total wins.

## Computer players

Three play styles (cautious / balanced / bold) that weigh the farkle
probability for the remaining dice against the points at risk, respect the
opening threshold, and keep pushing in the final round until they beat the
leader.

## Development

The game engine (`js/scoring.js`, `js/ai.js`, `js/game.js`) is UI-agnostic
and runs under Node for testing:

```sh
node test/run-tests.js
```

The suite covers the scoring table, farkle detection, the turn state machine,
persistence, and 1,000 simulated end-to-end AI games.

## Project layout

```
index.html            App shell (setup, game, rules screens)
css/styles.css        Styling
js/scoring.js         Scoring rules and selection validation
js/ai.js              Computer player decisions
js/game.js            Turn/game state machine (UI-agnostic)
js/ui.js              DOM rendering, input, AI animation, persistence
sw.js                 Service worker (offline cache)
manifest.webmanifest  PWA manifest
icons/                App icons
test/run-tests.js     Node test suite
```
