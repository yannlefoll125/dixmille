/*
 * Game state machine for 10,000.
 *
 * The Game class is UI-agnostic: it mutates state and returns event objects
 * that the UI layer renders. Human and AI players share the same transitions
 * (roll -> keep -> roll again | bank), which keeps the rules in one place.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./scoring.js'));
  } else {
    root.Game = factory(root.Scoring);
  }
})(typeof self !== 'undefined' ? self : this, function (Scoring) {
  'use strict';

  const TARGET = 10000;

  const AI_NAMES = ['Ada', 'Blaise', 'Curie'];

  function rollDie(rng) {
    return 1 + Math.floor(rng() * 6);
  }

  class Game {
    /**
     * @param options {
     *   aiCount:    number of computer players (1..3),
     *   difficulty: 'cautious' | 'balanced' | 'bold',
     *   opening:    minimum first-bank score (0 disables),
     *   playerName: display name for the human,
     *   rng:        optional random source (for tests),
     * }
     */
    constructor(options) {
      const opts = options || {};
      this.rng = opts.rng || Math.random;
      this.target = opts.target || TARGET;
      this.opening = opts.opening != null ? opts.opening : 500;
      this.difficulty = opts.difficulty || 'balanced';

      this.players = [
        { name: opts.playerName || 'You', isAI: false, score: 0, onBoard: false },
      ];
      const aiCount = Math.min(3, Math.max(1, opts.aiCount || 1));
      for (let i = 0; i < aiCount; i++) {
        this.players.push({
          name: AI_NAMES[i],
          isAI: true,
          score: 0,
          onBoard: false,
        });
      }

      this.currentPlayer = 0;
      this.turnScore = 0;
      this.diceLeft = 6;
      this.roll = []; // dice currently on the table, awaiting selection
      this.kept = []; // dice set aside this turn (for display)
      this.phase = 'awaitRoll'; // awaitRoll | awaitKeep | gameOver
      this.finalRoundStarter = -1; // index of first player to reach target
      this.winner = -1;
      this.round = 1;
    }

    get player() {
      return this.players[this.currentPlayer];
    }

    get finalRound() {
      return this.finalRoundStarter >= 0;
    }

    /** Highest banked score among players other than `index`. */
    bestRivalScore(index) {
      let best = 0;
      this.players.forEach((p, i) => {
        if (i !== index && p.score > best) {
          best = p.score;
        }
      });
      return best;
    }

    /** Opening threshold still applying to the current player. */
    openingFor(player) {
      return player.onBoard ? 0 : this.opening;
    }

    /** Roll the dice left in hand. Returns a 'roll' or 'farkle' event. */
    rollDice() {
      if (this.phase !== 'awaitRoll' || this.winner >= 0) {
        return null;
      }
      this.roll = [];
      for (let i = 0; i < this.diceLeft; i++) {
        this.roll.push(rollDie(this.rng));
      }
      if (!Scoring.hasAnyScore(this.roll)) {
        const lost = this.turnScore;
        this.phase = 'farkled';
        return { type: 'farkle', roll: this.roll.slice(), lost };
      }
      this.phase = 'awaitKeep';
      return { type: 'roll', roll: this.roll.slice() };
    }

    /**
     * Set aside the dice at the given indexes of the current roll.
     * Returns a 'keep' event, or null when the selection is invalid.
     */
    keepDice(indexes) {
      if (this.phase !== 'awaitKeep') {
        return null;
      }
      const unique = [...new Set(indexes)].filter(
        (i) => i >= 0 && i < this.roll.length
      );
      const selected = unique.map((i) => this.roll[i]);
      const res = Scoring.scoreSelection(selected);
      if (!res.valid) {
        return null;
      }
      this.turnScore += res.score;
      this.kept = this.kept.concat(selected);
      this.roll = this.roll.filter((_, i) => !unique.includes(i));
      this.diceLeft = this.roll.length;
      let hotDice = false;
      if (this.diceLeft === 0) {
        this.diceLeft = 6; // hot dice: all six scored, roll them all again
        this.kept = [];
        hotDice = true;
      }
      this.phase = 'awaitRoll';
      return {
        type: 'keep',
        kept: selected,
        score: res.score,
        combo: res.combo,
        turnScore: this.turnScore,
        hotDice,
      };
    }

    /** True when the current player may bank right now. */
    canBank() {
      return (
        this.phase === 'awaitRoll' &&
        this.turnScore > 0 &&
        this.turnScore >= this.openingFor(this.player)
      );
    }

    /** Bank the turn total. Returns a 'bank' event (possibly ending the game). */
    bank() {
      if (!this.canBank()) {
        return null;
      }
      const player = this.player;
      player.score += this.turnScore;
      player.onBoard = true;
      const event = {
        type: 'bank',
        playerIndex: this.currentPlayer,
        banked: this.turnScore,
        total: player.score,
      };
      if (player.score >= this.target && this.finalRoundStarter < 0) {
        this.finalRoundStarter = this.currentPlayer;
        event.finalRound = true;
      }
      this.endTurn();
      return event;
    }

    /** Called after a farkle event has been shown. Advances to next player. */
    resolveFarkle() {
      if (this.phase !== 'farkled') {
        return null;
      }
      this.endTurn();
      return { type: 'nextTurn', playerIndex: this.currentPlayer };
    }

    endTurn() {
      this.turnScore = 0;
      this.diceLeft = 6;
      this.roll = [];
      this.kept = [];
      const next = (this.currentPlayer + 1) % this.players.length;
      // The game ends once the turn passes back to whoever opened the final
      // round: every other player has had exactly one last turn.
      if (this.finalRound && next === this.finalRoundStarter) {
        this.finishGame();
        return;
      }
      if (next === 0) {
        this.round += 1;
      }
      this.currentPlayer = next;
      this.phase = 'awaitRoll';
    }

    finishGame() {
      this.phase = 'gameOver';
      let best = -1;
      let bestScore = -1;
      this.players.forEach((p, i) => {
        if (p.score > bestScore) {
          bestScore = p.score;
          best = i;
        }
      });
      this.winner = best;
    }

    /** Serializable snapshot for persistence. */
    toJSON() {
      return {
        target: this.target,
        opening: this.opening,
        difficulty: this.difficulty,
        players: this.players,
        currentPlayer: this.currentPlayer,
        turnScore: this.turnScore,
        diceLeft: this.diceLeft,
        roll: this.roll,
        kept: this.kept,
        phase: this.phase,
        finalRoundStarter: this.finalRoundStarter,
        winner: this.winner,
        round: this.round,
      };
    }

    static fromJSON(data, rng) {
      const game = new Game({
        aiCount: 1,
        difficulty: data.difficulty,
        opening: data.opening,
        target: data.target,
        rng,
      });
      game.players = data.players;
      game.currentPlayer = data.currentPlayer;
      game.turnScore = data.turnScore;
      game.diceLeft = data.diceLeft;
      game.roll = data.roll || [];
      game.kept = data.kept || [];
      game.phase = data.phase;
      game.finalRoundStarter = data.finalRoundStarter;
      game.winner = data.winner;
      game.round = data.round || 1;
      return game;
    }
  }

  return { Game, TARGET, AI_NAMES };
});
