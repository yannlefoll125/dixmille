/*
 * Scoring engine for the dice game 10,000 (Dix Mille, 6 dice) — house rules:
 *
 *  - Single 1 ........... 100
 *  - Single 5 ........... 50
 *  - Three 1s ........... 1000
 *  - Three of a kind .... face x 100 (e.g. three 4s = 400)
 *  - Six of a face ...... two separate three-of-a-kinds (no doubling rule)
 *  - Straight 1-6 ....... 2000 (six dice, "full suite")
 *  - Three pairs ........ 1500 (six dice; four of a kind + a pair counts)
 *  - No other special combinations.
 *
 * A selection of dice is only valid if EVERY selected die contributes to the
 * score. On top of that, every complete three-of-a-kind present in a roll is
 * MANDATORY: it must be part of the selection (see mandatoryKeeps /
 * satisfiesMandatory), which game.keepDice and validSelections enforce.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Scoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STRAIGHT_SCORE = 2000;
  const THREE_PAIRS_SCORE = 1500;

  /** Count occurrences of each face. Returns array indexed 1..6. */
  function faceCounts(dice) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) {
      counts[d]++;
    }
    return counts;
  }

  /** Score of one three-of-a-kind of a face. */
  function tripleScore(face) {
    return face === 1 ? 1000 : face * 100;
  }

  /**
   * Score a plain decomposition (no straight / three pairs): complete
   * triples score tripleScore each, leftover dice only score as single
   * 1s or 5s. Returns { valid, score }.
   */
  function scorePlain(counts) {
    let score = 0;
    for (let face = 1; face <= 6; face++) {
      const c = counts[face];
      if (c === 0) {
        continue;
      }
      const triples = Math.floor(c / 3);
      const rest = c % 3;
      score += triples * tripleScore(face);
      if (rest > 0) {
        if (face === 1) {
          score += rest * 100;
        } else if (face === 5) {
          score += rest * 50;
        } else {
          return { valid: false, score: 0 };
        }
      }
    }
    return { valid: true, score };
  }

  function isStraight(counts, total) {
    if (total !== 6) {
      return false;
    }
    for (let face = 1; face <= 6; face++) {
      if (counts[face] !== 1) {
        return false;
      }
    }
    return true;
  }

  function isThreePairs(counts, total) {
    if (total !== 6) {
      return false;
    }
    let pairs = 0;
    for (let face = 1; face <= 6; face++) {
      const c = counts[face];
      if (c === 2) {
        pairs += 1;
      } else if (c === 4) {
        pairs += 2;
      } else if (c !== 0) {
        return false;
      }
    }
    return pairs === 3;
  }

  /**
   * Best score for a selection of dice. Every die must contribute.
   * Returns { valid, score, combo } where combo names the special pattern
   * used ('straight', 'threePairs', or null for plain scoring).
   */
  function scoreSelection(dice) {
    if (!dice || dice.length === 0) {
      return { valid: false, score: 0, combo: null };
    }
    const counts = faceCounts(dice);
    const total = dice.length;
    let best = { valid: false, score: 0, combo: null };

    const plain = scorePlain(counts);
    if (plain.valid) {
      best = { valid: true, score: plain.score, combo: null };
    }
    if (isStraight(counts, total) && STRAIGHT_SCORE > best.score) {
      best = { valid: true, score: STRAIGHT_SCORE, combo: 'straight' };
    }
    if (isThreePairs(counts, total) && THREE_PAIRS_SCORE > best.score) {
      best = { valid: true, score: THREE_PAIRS_SCORE, combo: 'threePairs' };
    }
    return best;
  }

  /**
   * Per-face minimum keep counts for a roll: every complete three-of-a-kind
   * must be taken and validated (four or five of a face force one triple,
   * six force two). Returns an array indexed 1..6.
   */
  function mandatoryKeeps(rollDice) {
    const counts = faceCounts(rollDice);
    const min = [0, 0, 0, 0, 0, 0, 0];
    for (let face = 1; face <= 6; face++) {
      min[face] = Math.floor(counts[face] / 3) * 3;
    }
    return min;
  }

  /** True when the selection takes every mandatory triple from the roll. */
  function satisfiesMandatory(rollDice, selectedDice) {
    const min = mandatoryKeeps(rollDice);
    const sel = faceCounts(selectedDice);
    for (let face = 1; face <= 6; face++) {
      if (sel[face] < min[face]) {
        return false;
      }
    }
    return true;
  }

  /** True when a roll contains at least one scoring option. */
  function hasAnyScore(dice) {
    const counts = faceCounts(dice);
    if (counts[1] > 0 || counts[5] > 0) {
      return true;
    }
    for (let face = 2; face <= 6; face++) {
      if (counts[face] >= 3) {
        return true;
      }
    }
    return isStraight(counts, dice.length) || isThreePairs(counts, dice.length);
  }

  /**
   * Enumerate every LEGAL selection from a roll (valid score AND all
   * mandatory triples taken), as per-face keep counts.
   * Returns a list of { keepCounts, score, used } sorted by descending score.
   * keepCounts is indexed 1..6; used is the number of dice kept.
   */
  function validSelections(dice) {
    const counts = faceCounts(dice);
    const min = mandatoryKeeps(dice);
    const results = [];
    const keep = [0, 0, 0, 0, 0, 0, 0];

    function recurse(face) {
      if (face > 6) {
        const selected = [];
        for (let f = 1; f <= 6; f++) {
          for (let i = 0; i < keep[f]; i++) {
            selected.push(f);
          }
        }
        if (selected.length === 0) {
          return;
        }
        const res = scoreSelection(selected);
        if (res.valid) {
          results.push({
            keepCounts: keep.slice(),
            score: res.score,
            used: selected.length,
          });
        }
        return;
      }
      for (let k = min[face]; k <= counts[face]; k++) {
        keep[face] = k;
        recurse(face + 1);
      }
      keep[face] = 0;
    }

    recurse(1);
    results.sort((a, b) => b.score - a.score || a.used - b.used);
    return results;
  }

  return {
    faceCounts,
    scoreSelection,
    hasAnyScore,
    validSelections,
    tripleScore,
    mandatoryKeeps,
    satisfiesMandatory,
  };
});
