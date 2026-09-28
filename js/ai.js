/*
 * Computer players for 10,000.
 *
 * Each AI turn is a sequence of decisions:
 *   1. Which dice to keep from the current roll.
 *   2. Whether to bank the turn total or roll the remaining dice.
 *
 * Decisions use the farkle probability for the number of dice that would be
 * rolled next, plus a per-difficulty banking threshold.
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
   * Pick the dice to keep from a roll.
   *
   * Strategy: prefer the highest-scoring selection, but when plenty of dice
   * remain, drop lone 5s (worth only 50) to keep more dice rolling. Selections
   * that use every die (hot dice) are always attractive.
   *
   * @returns one entry from Scoring.validSelections(roll), or null on farkle.
   */
  function chooseKeep(roll, profile) {
    const options = Scoring.validSelections(roll);
    if (options.length === 0) {
      return null;
    }

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
      const value = opt.score + upside;
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
   *   target:      winning score (e.g. 10000),
   *   bestRival:   highest score among the other players,
   *   finalRound:  true when someone already reached the target,
   * }
   * @returns true to roll again, false to bank.
   */
  function shouldRoll(ctx, profile) {
    // Not on the board yet: banking below the opening threshold is illegal.
    if (ctx.turnScore < ctx.opening) {
      return true;
    }
    // Banking now would win: take it.
    const bankedTotal = ctx.bankedScore + ctx.turnScore;
    if (bankedTotal >= ctx.target && (!ctx.finalRound || bankedTotal > ctx.bestRival)) {
      return false;
    }
    // Final round: banking is pointless unless it beats the leader.
    if (ctx.finalRound && bankedTotal <= ctx.bestRival) {
      return true;
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
