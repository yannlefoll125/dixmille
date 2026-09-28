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

## Rules implemented (house rules)

- Six dice; set aside scoring dice after each roll, then either roll the
  remaining dice or bank the turn total.
- **Farkle**: a roll with no scoring dice wipes the points gathered this
  turn. If it was a **fresh throw** of all six dice (turn start or right
  after hot dice) and the player is already on the board, they also lose
  **2,000** from their banked score.
- **Hot dice**: when all six dice score, roll all six again.
- **Mandatory triples**: every complete three-of-a-kind in a roll must be
  taken and validated — it cannot be left on the table.
- Scoring: single 1 = 100, single 5 = 50, three 1s = 1,000, three of a kind =
  face × 100 (six of a face = two triples), full suite 1–6 = 2,000,
  three pairs = 1,500 (four of a kind + a pair counts). No other specials.
- **Opening**: until a player is on the board, they must score **750** in a
  single turn to bank.
- **Exact finish**: the first player to bank **exactly 10,000** wins on the
  spot. Banking a total that would pass 10,000 is illegal; the player must
  keep rolling instead.

## Computer players

Three play styles (cautious / balanced / bold) that weigh the farkle
probability for the remaining dice against the points at risk, respect the
opening threshold, and play the exact-10,000 endgame: they bank a keep that
lands exactly on the target, avoid keeps that pass it, and creep up in small
banks when close.

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
