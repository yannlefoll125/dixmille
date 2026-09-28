/*
 * Computer players for 10,000.
 *
 * Each AI turn is a sequence of decisions:
 *   1. Which dice to keep from the current roll.
 *   2. Whether to bank the turn total or roll the remaining dice.
 *
 * Decisions use the farkle probability for the number of dice that would be
 * rolled next, plus a per-difficulty banking threshold. The exact-10,000
 * rule shapes the endgame: a keep that lands exactly on the target is a win
 * — unless it holds a triple, which must be validated by rolling on and so
 * can never be the finishing keep — one that passes the target dooms the
 * turn, and near the target the AI banks small amounts to creep to an
 * exact finish.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./scoring.js'));
  } else {
    root.AI = factory(root.Scoring);
  }
})(typeof self !== 'undefined' ? self : this, function (Scoring) {
  'use strict';

  // Probability of scoring nothing when rolling k dice (index = k).
  const FARKLE_P = [1, 0.667, 0.444, 0.278, 0.157, 0.077, 0.024];

  // Rough expected gain of one further roll with k dice (index = k),
  // given the roll scores at all.
  const ROLL_GAIN = [0, 100, 140, 210, 290, 380, 480];

  const PROFILES = {
    cautious: { bankAt: 300, riskFactor: 0.8 },
    balanced: { bankAt: 450, riskFactor: 1.0 },
    bold: { bankAt: 700, riskFactor: 1.25 },
  };

  /**
   * Pick the dice to keep from a roll. Only legal selections are considered
   * (every mandatory three-of-a-kind taken).
   *
   * @param ctx optional { bankedScore, turnScore, target } for exact-target
   *            awareness; without it the AI just maximizes points.
   * @returns one entry from Scoring.validSelections(roll), or null on farkle.
   */
  function chooseKeep(roll, profile, ctx) {
    const options = Scoring.validSelections(roll);
    if (options.length === 0) {
      return null;
    }
    const banked = ctx ? ctx.bankedScore : 0;
    const turn = ctx ? ctx.turnScore : 0;
    const target = ctx ? ctx.target : Infinity;

    let best = null;
    let bestValue = -Infinity;
    for (const opt of options) {
      let remaining = roll.length - opt.used;
      if (remaining === 0) {
        remaining = 6; // hot dice: everything scored, roll all six again
      }
      // Value = points now + discounted upside of the dice still rolling.
      const upside =
        (1 - FARKLE_P[remaining]) * ROLL_GAIN[remaining] * profile.riskFactor;
      let value = opt.score + upside;
      const totalAfter = banked + turn + opt.score;
      const needsValidation = Scoring.keepNeedsValidation(
        opt.keepCounts,
        opt.combo
      );
      if (totalAfter > target) {
        value -= 100000; // past the target: this turn can no longer bank
      } else if (totalAfter === target) {
        // Exact hit: instant win — unless the keep holds a triple, which
        // forces a validation roll whose scoring dice would overshoot.
        value += needsValidation ? -100000 : 100000;
      }
      if (value > bestValue) {
        bestValue = value;
        best = opt;
      }
    }
    return best;
  }

  /**
   * Decide whether to keep rolling after setting dice aside.
   *
   * @param ctx {
   *   turnScore:   points accumulated this turn (including the last keep),
   *   diceLeft:    dice that would be rolled next (1..6),
   *   bankedScore: the player's total on the scoreboard,
   *   opening:     minimum turn score required to get on the board (0 if none
   *                or already on the board),
   *   target:      winning score (must be reached exactly),
   * }
   * @returns true to roll again, false to bank.
   */
  function shouldRoll(ctx, profile) {
    const bankedTotal = ctx.bankedScore + ctx.turnScore;
    // Past the target: banking is illegal, the only move is to roll on.
    if (bankedTotal > ctx.target) {
      return true;
    }
    // Banking now lands exactly on the target: instant win.
    if (bankedTotal === ctx.target) {
      return false;
    }
    // Not on the board yet: banking below the opening threshold is illegal.
    if (ctx.turnScore < ctx.opening) {
      return true;
    }
    // Close to the target: bank small amounts and creep to an exact finish
    // rather than risk overshooting on the next keep.
    if (ctx.target - bankedTotal <= 300) {
      return false;
    }

    const pFarkle = FARKLE_P[ctx.diceLeft];
    const gain = (1 - pFarkle) * ROLL_GAIN[ctx.diceLeft] * profile.riskFactor;
    const loss = pFarkle * ctx.turnScore;
    if (gain > loss) {
      return true;
    }
    return ctx.turnScore < profile.bankAt * profile.riskFactor;
  }

  function getProfile(difficulty) {
    return PROFILES[difficulty] || PROFILES.balanced;
  }

  return { chooseKeep, shouldRoll, getProfile, FARKLE_P, PROFILES };
});
