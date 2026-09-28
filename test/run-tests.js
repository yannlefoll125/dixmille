/* Test suite for the 10,000 game engine. Run with: node test/run-tests.js */
'use strict';

const assert = require('assert');
const Scoring = require('../js/scoring.js');
const AI = require('../js/ai.js');
const { Game } = require('../js/game.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

/* ---------- Scoring ---------- */

function score(dice) {
  return Scoring.scoreSelection(dice);
}

test('single 1 scores 100', () => {
  assert.deepStrictEqual(score([1]), { valid: true, score: 100, combo: null });
});

test('single 5 scores 50', () => {
  assert.strictEqual(score([5]).score, 50);
});

test('1 and 5 score 150', () => {
  assert.strictEqual(score([1, 5]).score, 150);
});

test('single 2 is invalid', () => {
  assert.strictEqual(score([2]).valid, false);
});

test('pair of 3s is invalid', () => {
  assert.strictEqual(score([3, 3]).valid, false);
});

test('mix with a non-scoring die is invalid', () => {
  assert.strictEqual(score([1, 5, 2]).valid, false);
});

test('three 1s score 1000', () => {
  assert.strictEqual(score([1, 1, 1]).score, 1000);
});

test('three 4s score 400', () => {
  assert.strictEqual(score([4, 4, 4]).score, 400);
});

test('four 4s score 800 (doubling)', () => {
  assert.strictEqual(score([4, 4, 4, 4]).score, 800);
});

test('five 1s score 4000', () => {
  assert.strictEqual(score([1, 1, 1, 1, 1]).score, 4000);
});

test('six 6s score 4800', () => {
  assert.strictEqual(score([6, 6, 6, 6, 6, 6]).score, 4800);
});

test('triple 2s plus 1 and 5 scores 350', () => {
  assert.strictEqual(score([2, 2, 2, 1, 5]).score, 350);
});

test('straight scores 1500', () => {
  const r = score([3, 1, 6, 2, 5, 4]);
  assert.strictEqual(r.score, 1500);
  assert.strictEqual(r.combo, 'straight');
});

test('three pairs score 1500', () => {
  const r = score([2, 2, 3, 3, 6, 6]);
  assert.strictEqual(r.score, 1500);
  assert.strictEqual(r.combo, 'threePairs');
});

test('four of a kind + pair counts as three pairs', () => {
  const r = score([2, 2, 2, 2, 6, 6]);
  assert.strictEqual(r.score, 1500);
  assert.strictEqual(r.combo, 'threePairs');
});

test('three pairs is NOT used when plain scoring beats it', () => {
  // Four 1s + pair of 5s: 2000 + 100 beats the 1500 three-pairs value.
  const r = score([1, 1, 1, 1, 5, 5]);
  assert.strictEqual(r.score, 2100);
  assert.strictEqual(r.combo, null);
});

test('empty selection is invalid', () => {
  assert.strictEqual(score([]).valid, false);
});

/* ---------- Farkle detection ---------- */

test('2,3,4,6,6,3 has no score (farkle)', () => {
  assert.strictEqual(Scoring.hasAnyScore([2, 3, 4, 6, 6, 3]), false);
});

test('a lone 5 prevents a farkle', () => {
  assert.strictEqual(Scoring.hasAnyScore([2, 3, 4, 6, 6, 5]), true);
});

test('a hidden triple prevents a farkle', () => {
  assert.strictEqual(Scoring.hasAnyScore([2, 2, 2, 3, 4, 6]), true);
});

test('three pairs prevents a farkle', () => {
  assert.strictEqual(Scoring.hasAnyScore([2, 2, 3, 3, 4, 4]), true);
});

/* ---------- validSelections ---------- */

test('validSelections finds all options for [1,5,2,2]', () => {
  const opts = Scoring.validSelections([1, 5, 2, 2]);
  // Valid: {1}, {5}, {1,5} — the 2s can never contribute.
  const scores = opts.map((o) => o.score).sort((a, b) => a - b);
  assert.deepStrictEqual(scores, [50, 100, 150]);
});

test('validSelections is empty on a farkle roll', () => {
  assert.strictEqual(Scoring.validSelections([2, 3, 4, 6]).length, 0);
});

/* ---------- AI ---------- */

test('AI keeps something on every scoring roll', () => {
  const profile = AI.getProfile('balanced');
  const choice = AI.chooseKeep([1, 2, 3, 4, 6, 6], profile);
  assert.ok(choice);
  assert.ok(choice.score >= 100);
});

test('AI returns null on a farkle roll', () => {
  assert.strictEqual(
    AI.chooseKeep([2, 3, 4, 6, 6, 2], AI.getProfile('balanced')),
    null
  );
});

test('AI keeps rolling while under the opening threshold', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 300,
      diceLeft: 3,
      bankedScore: 0,
      opening: 500,
      target: 10000,
      bestRival: 0,
      finalRound: false,
    },
    AI.getProfile('cautious')
  );
  assert.strictEqual(roll, true);
});

test('AI banks a winning score', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 600,
      diceLeft: 4,
      bankedScore: 9500,
      opening: 0,
      target: 10000,
      bestRival: 8000,
      finalRound: false,
    },
    AI.getProfile('bold')
  );
  assert.strictEqual(roll, false);
});

test('AI does not bank a losing total in the final round', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 400,
      diceLeft: 2,
      bankedScore: 7000,
      opening: 0,
      target: 10000,
      bestRival: 10050,
      finalRound: true,
    },
    AI.getProfile('cautious')
  );
  assert.strictEqual(roll, true);
});

/* ---------- Game state machine ---------- */

function seededRng(values) {
  // Returns dice faces from `values` (1..6) via the rng interface.
  let i = 0;
  return () => (values[i++ % values.length] - 1) / 6 + 0.001;
}

test('keep + bank updates the score and advances the turn', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([1, 1, 1, 2, 3, 4]),
  });
  const roll = game.rollDice();
  assert.strictEqual(roll.type, 'roll');
  assert.deepStrictEqual(roll.roll, [1, 1, 1, 2, 3, 4]);
  const keep = game.keepDice([0, 1, 2]);
  assert.strictEqual(keep.score, 1000);
  assert.strictEqual(game.diceLeft, 3);
  const bank = game.bank();
  assert.strictEqual(bank.banked, 1000);
  assert.strictEqual(game.players[0].score, 1000);
  assert.strictEqual(game.currentPlayer, 1);
});

test('cannot bank under the opening threshold', () => {
  const game = new Game({
    aiCount: 1,
    opening: 500,
    rng: seededRng([1, 2, 3, 4, 4, 6]),
  });
  game.rollDice();
  game.keepDice([0]); // a single 1 = 100 < 500
  assert.strictEqual(game.canBank(), false);
  assert.strictEqual(game.bank(), null);
});

test('invalid keep is rejected', () => {
  const game = new Game({ aiCount: 1, rng: seededRng([1, 2, 3, 4, 4, 6]) });
  game.rollDice();
  assert.strictEqual(game.keepDice([1]), null); // a lone 2 does not score
  assert.strictEqual(game.turnScore, 0);
});

test('hot dice reset to six dice', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([1, 1, 1, 5, 5, 5]),
  });
  game.rollDice();
  const keep = game.keepDice([0, 1, 2, 3, 4, 5]);
  assert.strictEqual(keep.hotDice, true);
  assert.strictEqual(keep.turnScore, 1500);
  assert.strictEqual(game.diceLeft, 6);
});

test('farkle wipes the turn score', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([1, 1, 1, 2, 3, 4, /* next roll: */ 2, 3, 4]),
  });
  game.rollDice();
  game.keepDice([0, 1, 2]); // +1000, three dice left
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'farkle');
  assert.strictEqual(ev.lost, 1000);
  game.resolveFarkle();
  assert.strictEqual(game.players[0].score, 0);
  assert.strictEqual(game.currentPlayer, 1);
});

test('reaching the target triggers the final round, then the game ends', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([1, 1, 1, 1, 1, 1]),
  });
  game.players[0].score = 9500;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0, 1, 2]); // three 1s = 1000
  const bank = game.bank();
  assert.strictEqual(bank.finalRound, true);
  assert.strictEqual(game.finalRound, true);
  assert.strictEqual(game.currentPlayer, 1);
  // AI takes its last turn and banks whatever it has.
  game.rollDice();
  game.keepDice([0, 1, 2]);
  game.bank();
  assert.strictEqual(game.phase, 'gameOver');
  assert.strictEqual(game.winner, 0);
  assert.strictEqual(game.players[0].score, 10500);
});

test('serialization round-trips', () => {
  const game = new Game({ aiCount: 2, rng: seededRng([1, 5, 2, 3, 4, 6]) });
  game.rollDice();
  game.keepDice([0, 1]);
  const copy = Game.fromJSON(JSON.parse(JSON.stringify(game.toJSON())));
  assert.strictEqual(copy.turnScore, 150);
  assert.strictEqual(copy.players.length, 3);
  assert.strictEqual(copy.diceLeft, 4);
  assert.strictEqual(copy.phase, 'awaitRoll');
});

/* ---------- Full-game simulation (AI vs AI, random dice) ---------- */

test('1000 simulated AI games always finish legally', () => {
  for (let g = 0; g < 1000; g++) {
    const game = new Game({ aiCount: 2, opening: 500 });
    // Make every player an AI for the simulation.
    game.players[0].isAI = true;
    const profile = AI.getProfile(['cautious', 'balanced', 'bold'][g % 3]);
    let safety = 100000;

    while (game.phase !== 'gameOver' && safety-- > 0) {
      const ev = game.rollDice();
      if (ev.type === 'farkle') {
        game.resolveFarkle();
        continue;
      }
      const choice = AI.chooseKeep(game.roll, profile);
      assert.ok(choice, 'AI must find a keep on a scoring roll');
      const indexes = [];
      const need = choice.keepCounts.slice();
      game.roll.forEach((v, i) => {
        if (need[v] > 0) {
          need[v]--;
          indexes.push(i);
        }
      });
      const keep = game.keepDice(indexes);
      assert.ok(keep, 'AI keep must be legal');
      const player = game.player;
      const wantRoll = AI.shouldRoll(
        {
          turnScore: game.turnScore,
          diceLeft: game.diceLeft,
          bankedScore: player.score,
          opening: game.openingFor(player),
          target: game.target,
          bestRival: game.bestRivalScore(game.currentPlayer),
          finalRound: game.finalRound,
        },
        profile
      );
      if (!wantRoll && game.canBank()) {
        game.bank();
      }
    }
    assert.ok(safety > 0, 'game must terminate');
    assert.ok(game.winner >= 0);
    const winnerScore = game.players[game.winner].score;
    assert.ok(winnerScore >= game.target, 'winner must reach the target');
    for (const p of game.players) {
      assert.ok(p.score <= winnerScore, 'winner must have the top score');
    }
  }
});

console.log(`\n${passed} tests passed`);
