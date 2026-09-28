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

test('banking exactly 10000 wins on the spot', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 1, 1, 2, 3, 4]),
  });
  game.players[0].score = 9000;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0, 1, 2]); // three 1s = 1000
  const bank = game.bank();
  assert.strictEqual(bank.won, true);
  assert.strictEqual(bank.total, 10000);
  assert.strictEqual(game.phase, 'gameOver');
  assert.strictEqual(game.winner, 0);
});

test('banking past 10000 is illegal', () => {
  const game = new Game({
    aiCount: 1,
    rng: seededRng([1, 1, 1, 2, 3, 4]),
  });
  game.players[0].score = 9500;
  game.players[0].onBoard = true;
  game.rollDice();
  game.keepDice([0, 1, 2]); // three 1s = 1000 -> 10500 would overshoot
  assert.strictEqual(game.wouldOvershoot(), true);
  assert.strictEqual(game.canBank(), false);
  assert.strictEqual(game.bank(), null);
  assert.strictEqual(game.phase, 'awaitRoll'); // forced to roll on
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
      if (ev.type === 'farkle') {
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
