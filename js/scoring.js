/*
 * Scoring engine for the dice game 10,000 (Dix Mille / Farkle-style, 6 dice).
 *
 * Scoring rules implemented:
 *  - Single 1 ........... 100
 *  - Single 5 ........... 50
 *  - Three 1s ........... 1000
 *  - Three of a kind .... face x 100 (e.g. three 4s = 400)
 *  - Four/Five/Six of a kind: double the three-of-a-kind value per extra die
 *      (four 1s = 2000, five 1s = 4000, six 1s = 8000; four 4s = 800, ...)
 *  - Straight 1-6 ....... 1500 (six dice)
 *  - Three pairs ........ 1500 (six dice; four of a kind + a pair counts)
 *
 * A selection of dice is only valid if EVERY selected die contributes to the
 * score.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Scoring = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Count occurrences of each face. Returns array indexed 1..6. */
  function faceCounts(dice) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) {
      counts[d]++;
    }
    return counts;
  }

  /** Score for n-of-a-kind of a face (n >= 3), doubling per extra die. */
  function ofAKindScore(face, n) {
    const base = face === 1 ? 1000 : face * 100;
    return base * Math.pow(2, n - 3);
  }

  /**
   * Score a plain decomposition (no straight / three pairs).
   * Returns { valid, score }. Invalid when a selected die cannot score.
   */
  function scorePlain(counts) {
    let score = 0;
    for (let face = 1; face <= 6; face++) {
      const c = counts[face];
      if (c === 0) {
        continue;
      }
      if (c >= 3) {
        score += ofAKindScore(face, c);
      } else if (face === 1) {
        score += c * 100;
      } else if (face === 5) {
        score += c * 50;
      } else {
        return { valid: false, score: 0 };
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
    if (isStraight(counts, total) && 1500 > best.score) {
      best = { valid: true, score: 1500, combo: 'straight' };
    }
    if (isThreePairs(counts, total) && 1500 > best.score) {
      best = { valid: true, score: 1500, combo: 'threePairs' };
    }
    return best;
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
   * Enumerate every valid selection from a roll, as per-face keep counts.
   * Returns a list of { keepCounts, score, used } sorted by descending score.
   * keepCounts is indexed 1..6; used is the number of dice kept.
   */
  function validSelections(dice) {
    const counts = faceCounts(dice);
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
      for (let k = 0; k <= counts[face]; k++) {
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
    ofAKindScore,
  };
});
