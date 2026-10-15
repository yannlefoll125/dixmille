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

test('no doubling: four 4s cannot all be kept (4th die does not score)', () => {
  assert.strictEqual(score([4, 4, 4, 4]).valid, false);
});

test('no doubling: four 1s = triple + single = 1100', () => {
  assert.strictEqual(score([1, 1, 1, 1]).score, 1100);
});

test('no doubling: five 1s = triple + two singles = 1200', () => {
  assert.strictEqual(score([1, 1, 1, 1, 1]).score, 1200);
});

test('six of a face = two triples (six 6s = 1200, six 1s = 2000)', () => {
  assert.strictEqual(score([6, 6, 6, 6, 6, 6]).score, 1200);
  assert.strictEqual(score([1, 1, 1, 1, 1, 1]).score, 2000);
});

test('triple 2s plus 1 and 5 scores 350', () => {
  assert.strictEqual(score([2, 2, 2, 1, 5]).score, 350);
});

test('full suite scores 2000', () => {
  const r = score([3, 1, 6, 2, 5, 4]);
  assert.strictEqual(r.score, 2000);
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

test('three pairs beats the plain reading when higher', () => {
  // Four 1s + pair of 5s: plain = 1000 + 100 + 100 = 1200 < 1500.
  const r = score([1, 1, 1, 1, 5, 5]);
  assert.strictEqual(r.score, 1500);
  assert.strictEqual(r.combo, 'threePairs');
});

test('plain reading kept on a tie (three 1s + three 5s)', () => {
  const r = score([1, 1, 1, 5, 5, 5]);
  assert.strictEqual(r.score, 1500);
  assert.strictEqual(r.combo, null);
});

test('empty selection is invalid', () => {
  assert.strictEqual(score([]).valid, false);
});

/* ---------- Mandatory three-of-a-kinds ---------- */

test('mandatoryKeeps marks complete triples', () => {
  const min = Scoring.mandatoryKeeps([2, 2, 2, 4, 4, 6]);
  assert.strictEqual(min[2], 3);
  assert.strictEqual(min[4], 0);
});

test('mandatoryKeeps: four of a face forces one triple, six force two', () => {
  assert.strictEqual(Scoring.mandatoryKeeps([3, 3, 3, 3, 1, 5])[3], 3);
  assert.strictEqual(Scoring.mandatoryKeeps([3, 3, 3, 3, 3, 3])[3], 6);
});

test('satisfiesMandatory rejects a selection leaving a triple behind', () => {
  const roll = [2, 2, 2, 1, 4, 6];
  assert.strictEqual(Scoring.satisfiesMandatory(roll, [1]), false);
  assert.strictEqual(Scoring.satisfiesMandatory(roll, [2, 2, 2]), true);
  assert.strictEqual(Scoring.satisfiesMandatory(roll, [2, 2, 2, 1]), true);
});

test('validSelections only offers selections that take the triple', () => {
  const opts = Scoring.validSelections([2, 2, 2, 1, 4, 6]);
  assert.ok(opts.length > 0);
  for (const o of opts) {
    assert.ok(o.keepCounts[2] >= 3, 'every option must take the three 2s');
  }
  const scores = opts.map((o) => o.score).sort((a, b) => a - b);
  assert.deepStrictEqual(scores, [200, 300]); // {2,2,2} and {2,2,2,1}
});

test('keepNeedsValidation: plain triples yes, singles/specials no', () => {
  const counts = (dice) => Scoring.faceCounts(dice);
  assert.strictEqual(Scoring.keepNeedsValidation(counts([2, 2, 2]), null), true);
  assert.strictEqual(
    Scoring.keepNeedsValidation(counts([1, 1, 1, 5]), null),
    true
  );
  assert.strictEqual(Scoring.keepNeedsValidation(counts([1, 5]), null), false);
  assert.strictEqual(
    Scoring.keepNeedsValidation(counts([2, 2, 2, 2, 6, 6]), 'threePairs'),
    false
  );
  assert.strictEqual(
    Scoring.keepNeedsValidation(counts([1, 2, 3, 4, 5, 6]), 'straight'),
    false
  );
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

test('AI keep always includes the mandatory triple', () => {
  const choice = AI.chooseKeep([2, 2, 2, 1, 4, 6], AI.getProfile('bold'));
  assert.ok(choice.keepCounts[2] >= 3);
});

test('AI picks the keep that lands exactly on the target', () => {
  // At 9,900: keeping the lone 1 (100) allows an exact 10,000 bank; the
  // 1+5 (150) or triple-less greed would overshoot.
  const choice = AI.chooseKeep([1, 5, 3, 3, 4, 6], AI.getProfile('bold'), {
    bankedScore: 9900,
    turnScore: 0,
    target: 10000,
  });
  assert.strictEqual(choice.score, 100);
  assert.strictEqual(choice.keepCounts[1], 1);
  assert.strictEqual(choice.keepCounts[5], 0);
});

test('AI keeps rolling while under the opening threshold', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 500,
      diceLeft: 3,
      bankedScore: 0,
      opening: 750,
      target: 10000,
    },
    AI.getProfile('cautious')
  );
  assert.strictEqual(roll, true);
});

test('AI banks an exact-target total', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 500,
      diceLeft: 4,
      bankedScore: 9500,
      opening: 0,
      target: 10000,
    },
    AI.getProfile('bold')
  );
  assert.strictEqual(roll, false);
});

test('AI must keep rolling when the total passes the target', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 300,
      diceLeft: 4,
      bankedScore: 9800,
      opening: 0,
      target: 10000,
    },
    AI.getProfile('cautious')
  );
  assert.strictEqual(roll, true);
});

test('AI banks small amounts when close to the target', () => {
  const roll = AI.shouldRoll(
    {
      turnScore: 200,
      diceLeft: 5,
      bankedScore: 9500,
      opening: 0,
      target: 10000,
    },
    AI.getProfile('bold')
  );
  assert.strictEqual(roll, false);
});

/* ---------- Game state machine ---------- */

function seededRng(values) {
  // Returns dice faces from `values` (1..6) via the rng interface.
  let i = 0;
  return () => (values[i++ % values.length] - 1) / 6 + 0.001;
}

test('opening threshold defaults to 750', () => {
  const game = new Game({ aiCount: 1 });
  assert.strictEqual(game.opening, 750);
});

test('keep + bank updates the score and advances the turn', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([1, 5, 2, 3, 4, 6]),
  });
  const roll = game.rollDice();
  assert.strictEqual(roll.type, 'roll');
  assert.deepStrictEqual(roll.roll, [1, 5, 2, 3, 4, 6]);
  const keep = game.keepDice([0, 1]);
  assert.strictEqual(keep.score, 150);
  assert.strictEqual(keep.needsValidation, false);
  assert.strictEqual(game.diceLeft, 4);
  const bank = game.bank();
  assert.strictEqual(bank.banked, 150);
  assert.strictEqual(game.players[0].score, 150);
  assert.strictEqual(game.currentPlayer, 1);
});

test('cannot bank under the 750 opening threshold', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 1, 2, 3, 4, 6]),
  });
  game.rollDice();
  game.keepDice([0, 1]); // two 1s = 200 < 750
  assert.strictEqual(game.canBank(), false);
  assert.strictEqual(game.bank(), null);
});

test('invalid keep is rejected', () => {
  const game = new Game({ aiCount: 1, rng: seededRng([1, 2, 3, 4, 4, 6]) });
  game.rollDice();
  assert.strictEqual(game.keepDice([1]), null); // a lone 2 does not score
  assert.strictEqual(game.turnScore, 0);
});

test('a keep that leaves a three-of-a-kind on the table is rejected', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([2, 2, 2, 1, 3, 4]),
  });
  game.rollDice();
  assert.strictEqual(game.keepDice([3]), null); // the lone 1 ignores the 2s
  const keep = game.keepDice([0, 1, 2, 3]); // triple 2s + the 1
  assert.strictEqual(keep.score, 300);
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
  assert.strictEqual(ev.penalty, 0); // only three dice: not a fresh throw
  game.resolveFarkle();
  assert.strictEqual(game.players[0].score, 0);
  assert.strictEqual(game.currentPlayer, 1);
});

test('fresh-throw farkle costs 2000 once the player is on the board', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([2, 3, 4, 6, 6, 3]),
  });
  game.players[0].score = 3000;
  game.players[0].onBoard = true;
  const ev = game.rollDice(); // all six dice, scores nothing
  assert.strictEqual(ev.type, 'farkle');
  assert.strictEqual(ev.penalty, 2000);
  assert.strictEqual(ev.total, 1000);
  assert.strictEqual(game.players[0].score, 1000);
});

test('no fresh-throw penalty before the player has started scoring', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([2, 3, 4, 6, 6, 3]),
  });
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'farkle');
  assert.strictEqual(ev.penalty, 0);
  assert.strictEqual(game.players[0].score, 0);
});

test('no fresh-throw penalty on a hot-dice re-roll of six', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 1, 1, 5, 5, 5, /* hot-dice roll: */ 2, 3, 4, 6, 6, 3]),
  });
  game.players[0].score = 3000;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0, 1, 2, 3, 4, 5]); // hot dice, +1500
  const ev = game.rollDice(); // six dice again, but NOT the turn's fresh throw
  assert.strictEqual(ev.type, 'farkle');
  assert.strictEqual(ev.lost, 1500);
  assert.strictEqual(ev.penalty, 0);
  assert.strictEqual(game.players[0].score, 3000);
});

test('the score can go negative from fresh-throw penalties', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([2, 3, 4, 6, 6, 3]),
  });
  game.players[0].score = 1000;
  game.players[0].onBoard = true;
  const ev = game.rollDice();
  assert.strictEqual(ev.penalty, 2000);
  assert.strictEqual(game.players[0].score, -1000);
});

test('banking exactly 10000 wins on the spot', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 2, 2, 3, 4, 6]),
  });
  game.players[0].score = 9900;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0]); // the lone 1 = 100 -> exactly 10000
  const bank = game.bank();
  assert.strictEqual(bank.won, true);
  assert.strictEqual(bank.total, 10000);
  assert.strictEqual(game.phase, 'gameOver');
  assert.strictEqual(game.winner, 0);
});

/* ---------- Bust: the hand counts for its maximalist score ---------- */

test('maximalKeep values a roll at its best score', () => {
  assert.deepStrictEqual(Scoring.maximalKeep([1, 5, 2, 2]), {
    score: 150,
    forcedRoll: false,
  });
  // The mandatory triple is the only score: validation is forced.
  assert.deepStrictEqual(Scoring.maximalKeep([2, 2, 2, 3, 4, 6]), {
    score: 200,
    forcedRoll: true,
  });
  // A straight is its own combination, no validation.
  assert.deepStrictEqual(Scoring.maximalKeep([1, 2, 3, 4, 5, 6]), {
    score: 2000,
    forcedRoll: false,
  });
  assert.strictEqual(Scoring.maximalKeep([2, 3, 4, 6]), null);
});

test('at 9900, rolling a 1 and a 5 busts (the hand must be marked as 150)', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 5, 2, 3, 4, 4]),
  });
  game.players[0].score = 9900;
  game.players[0].onBoard = true;
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'bust'); // keeping only the 5 is no escape
  assert.strictEqual(ev.handScore, 150);
  assert.strictEqual(ev.lost, 0);
  assert.strictEqual(game.players[0].score, 9900); // no fresh-throw penalty
  game.resolveFarkle();
  assert.strictEqual(game.currentPlayer, 1);
});

test('at 9800, rolling three 2s and nothing else busts (validation forces +50)', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([2, 2, 2, 3, 4, 6]),
  });
  game.players[0].score = 9800;
  game.players[0].onBoard = true;
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'bust'); // 200 lands on 10000, but +50 is forced
  assert.strictEqual(ev.handScore, 200);
  assert.strictEqual(ev.forcedRoll, true);
  assert.strictEqual(game.players[0].score, 9800);
});

test('a mid-turn bust loses the points gathered this turn', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([5, 5, 2, 3, 4, 6, /* next roll: */ 1, 1, 1, 1]),
  });
  game.players[0].score = 9000;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0, 1]); // two 5s = 100 -> 9100
  const ev = game.rollDice(); // four 1s: max 1100 -> 10200
  assert.strictEqual(ev.type, 'bust');
  assert.strictEqual(ev.lost, 100);
  game.resolveFarkle();
  assert.strictEqual(game.players[0].score, 9000);
});

test('no bust when the maximal hand lands exactly on 10000 without a triple', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 1, 2, 3, 4, 6]),
  });
  game.players[0].score = 9800;
  game.players[0].onBoard = true;
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'roll'); // two 1s = 200 -> exactly 10000
  game.keepDice([0, 1]);
  const bank = game.bank();
  assert.strictEqual(bank.won, true);
  assert.strictEqual(game.winner, 0);
});

test('no bust while the maximal hand stays under the target', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([5, 2, 3, 4, 6, 6]),
  });
  game.players[0].score = 9900;
  game.players[0].onBoard = true;
  const ev = game.rollDice();
  assert.strictEqual(ev.type, 'roll'); // max is the lone 5 -> 9950
  game.keepDice([0]);
  assert.strictEqual(game.canBank(), true);
});

test('a kept triple is validated by a later triple-free keep', () => {
  const game = new Game({
    aiCount: 1,
    opening: 0,
    rng: seededRng([2, 2, 2, 1, 3, 4, /* next roll: */ 5, 3]),
  });
  game.rollDice();
  game.keepDice([0, 1, 2, 3]); // triple 2s + the 1 = 300
  assert.strictEqual(game.mustValidate, true);
  assert.strictEqual(game.canBank(), false);
  game.rollDice(); // the two remaining dice: 5, 3
  const keep = game.keepDice([0]); // the 5
  assert.strictEqual(keep.score, 50);
  assert.strictEqual(keep.needsValidation, false);
  assert.strictEqual(game.mustValidate, false);
  assert.strictEqual(game.canBank(), true);
  assert.strictEqual(game.bank().banked, 350);
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
  assert.strictEqual(copy.opening, 750);
});

/* ---------- Full-game simulation (AI vs AI, random dice) ---------- */

test('1000 simulated AI games always finish legally', () => {
  for (let g = 0; g < 1000; g++) {
    const game = new Game({ aiCount: 2 });
    // Make every player an AI for the simulation.
    game.players[0].isAI = true;
    const profile = AI.getProfile(['cautious', 'balanced', 'bold'][g % 3]);
    let safety = 200000;

    while (game.phase !== 'gameOver' && safety-- > 0) {
      const ev = game.rollDice();
      if (ev.type === 'farkle' || ev.type === 'bust') {
        game.resolveFarkle();
        continue;
      }
      const player = game.player;
      const choice = AI.chooseKeep(game.roll, profile, {
        bankedScore: player.score,
        turnScore: game.turnScore,
        target: game.target,
      });
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
      assert.ok(keep, 'AI keep must be legal (mandatory triples taken)');
      const wantRoll = AI.shouldRoll(
        {
          turnScore: game.turnScore,
          diceLeft: game.diceLeft,
          bankedScore: player.score,
          opening: game.openingFor(player),
          target: game.target,
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
    assert.strictEqual(winnerScore, game.target, 'winner is at exactly 10000');
    game.players.forEach((p, i) => {
      if (i !== game.winner) {
        assert.ok(p.score < game.target, 'losers never pass the target');
      }
    });
  }
});

console.log(`\n${passed} tests passed`);
