/*
 * UI layer: renders game state, drives human input and animates AI turns.
 */
(function () {
  'use strict';

  const SETTINGS_KEY = 'dixmille.settings';
  const GAME_KEY = 'dixmille.game';

  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  const $ = (id) => document.getElementById(id);

  const el = {
    screenSetup: $('screen-setup'),
    screenGame: $('screen-game'),
    scoreboard: $('scoreboard'),
    keptDice: $('kept-dice'),
    rollDice: $('roll-dice'),
    status: $('status'),
    selectionScore: $('selection-score'),
    btnRoll: $('btn-roll'),
    btnBank: $('btn-bank'),
    log: $('log'),
    overlayGameover: $('overlay-gameover'),
    gameoverTitle: $('gameover-title'),
    gameoverScores: $('gameover-scores'),
    overlayRules: $('overlay-rules'),
  };

  let game = null;
  let selection = new Set(); // indexes into game.roll (human selection)
  let aiRunning = false;
  let aiToken = 0; // invalidates a running AI loop when a new game starts

  /* ---------- Settings ---------- */

  function readSegmented(id) {
    const btn = document.querySelector(`#${id} button.selected`);
    return btn ? btn.dataset.value : null;
  }

  function setSegmented(id, value) {
    document.querySelectorAll(`#${id} button`).forEach((b) => {
      b.classList.toggle('selected', b.dataset.value === String(value));
    });
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return;
      }
      const s = JSON.parse(raw);
      if (s.name) {
        $('opt-name').value = s.name;
      }
      setSegmented('opt-ai-count', s.aiCount || 1);
      setSegmented('opt-difficulty', s.difficulty || 'balanced');
      setSegmented('opt-opening', s.opening != null ? s.opening : 500);
    } catch (e) {
      /* corrupted settings: keep defaults */
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      /* storage unavailable: play without persistence */
    }
  }

  /* ---------- Game persistence ---------- */

  function saveGame() {
    try {
      if (game && game.phase !== 'gameOver') {
        localStorage.setItem(GAME_KEY, JSON.stringify(game.toJSON()));
      } else {
        localStorage.removeItem(GAME_KEY);
      }
    } catch (e) {
      /* storage unavailable */
    }
  }

  function loadSavedGame() {
    try {
      const raw = localStorage.getItem(GAME_KEY);
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.players) || data.phase === 'gameOver') {
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Rendering ---------- */

  function makeDie(value, small) {
    const die = document.createElement('button');
    die.className = 'die' + (small ? ' small' : '');
    die.setAttribute('aria-label', `Die showing ${value}`);
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip' + (PIPS[value].includes(i) ? ' on' : '');
      die.appendChild(pip);
    }
    return die;
  }

  function renderScoreboard() {
    el.scoreboard.innerHTML = '';
    game.players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'player-card' + (i === game.currentPlayer ? ' active' : '');
      const turn =
        i === game.currentPlayer && game.turnScore > 0
          ? `+${game.turnScore}`
          : '';
      card.innerHTML =
        `<div class="name">${escapeHtml(p.name)}${p.isAI ? ' 🤖' : ''}</div>` +
        `<div class="score">${p.score}</div>` +
        `<div class="turn">${turn}</div>` +
        (!p.onBoard && game.opening > 0
          ? `<div class="off-board">needs ${game.opening}</div>`
          : '');
      el.scoreboard.appendChild(card);
    });
  }

  function renderDice(options) {
    const opts = options || {};
    el.keptDice.innerHTML = '';
    game.kept.forEach((v) => el.keptDice.appendChild(makeDie(v, true)));

    el.rollDice.innerHTML = '';
    game.roll.forEach((v, i) => {
      const die = makeDie(v, false);
      if (opts.animate) {
        die.classList.add('rolling');
        die.style.animationDelay = `${i * 45}ms`;
      }
      if (selection.has(i)) {
        die.classList.add('selected');
      }
      if (opts.highlight && opts.highlight.has(i)) {
        die.classList.add('selected');
      }
      if (isHumanTurn() && game.phase === 'awaitKeep') {
        die.addEventListener('click', () => toggleDie(i));
      } else {
        die.disabled = true;
      }
      el.rollDice.appendChild(die);
    });
  }

  function setStatus(text, cls) {
    el.status.textContent = text || '';
    el.status.className = 'status' + (cls ? ' ' + cls : '');
  }

  function logLine(text) {
    const div = document.createElement('div');
    div.textContent = text;
    el.log.prepend(div);
    while (el.log.children.length > 40) {
      el.log.removeChild(el.log.lastChild);
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function isHumanTurn() {
    return game && !game.player.isAI && game.phase !== 'gameOver';
  }

  function selectedDice() {
    return [...selection].map((i) => game.roll[i]);
  }

  function updateControls() {
    const human = isHumanTurn() && !aiRunning;
    if (!human) {
      el.btnRoll.disabled = true;
      el.btnBank.disabled = true;
      el.btnRoll.textContent = 'Roll';
      el.selectionScore.textContent = '';
      return;
    }

    if (game.phase === 'awaitRoll') {
      el.btnRoll.disabled = false;
      el.btnRoll.textContent = `Roll ${game.diceLeft} ${game.diceLeft === 1 ? 'die' : 'dice'}`;
      el.btnBank.disabled = !game.canBank();
      el.selectionScore.textContent = '';
      return;
    }

    if (game.phase === 'awaitKeep') {
      const sel = selectedDice();
      const res = Scoring.scoreSelection(sel);
      const left = game.roll.length - sel.length;
      const nextCount = left === 0 ? 6 : left;
      el.btnRoll.disabled = !res.valid;
      el.btnRoll.textContent = res.valid
        ? `Keep & roll ${nextCount}`
        : 'Select scoring dice';
      const wouldHave = game.turnScore + (res.valid ? res.score : 0);
      el.btnBank.disabled =
        !res.valid || wouldHave < game.openingFor(game.player);
      if (sel.length === 0) {
        el.selectionScore.textContent = 'Tap dice to set them aside';
      } else if (res.valid) {
        const comboName =
          res.combo === 'straight'
            ? ' — straight!'
            : res.combo === 'threePairs'
              ? ' — three pairs!'
              : '';
        el.selectionScore.textContent = `Selected: +${res.score}${comboName}`;
      } else {
        el.selectionScore.textContent = 'Selection does not score';
      }
      return;
    }

    // farkled or between turns
    el.btnRoll.disabled = true;
    el.btnBank.disabled = true;
  }

  function renderAll(diceOpts) {
    renderScoreboard();
    renderDice(diceOpts);
    updateControls();
  }

  /* ---------- Human actions ---------- */

  function toggleDie(index) {
    if (!isHumanTurn() || game.phase !== 'awaitKeep') {
      return;
    }
    if (selection.has(index)) {
      selection.delete(index);
    } else {
      selection.add(index);
    }
    renderAll();
  }

  function humanRoll() {
    if (!isHumanTurn()) {
      return;
    }
    if (game.phase === 'awaitKeep') {
      const keep = game.keepDice([...selection]);
      if (!keep) {
        return;
      }
      selection.clear();
      afterKeep(keep, game.player.name);
    }
    if (game.phase !== 'awaitRoll') {
      return;
    }
    const ev = game.rollDice();
    if (!ev) {
      return;
    }
    if (ev.type === 'farkle') {
      handleFarkle(ev);
      return;
    }
    setStatus('Set aside scoring dice');
    renderAll({ animate: true });
    saveGame();
  }

  function humanBank() {
    if (!isHumanTurn()) {
      return;
    }
    if (game.phase === 'awaitKeep') {
      const keep = game.keepDice([...selection]);
      if (!keep) {
        return;
      }
      selection.clear();
      afterKeep(keep, game.player.name);
    }
    const ev = game.bank();
    if (!ev) {
      renderAll();
      return;
    }
    handleBank(ev);
  }

  /* ---------- Shared event handling ---------- */

  function afterKeep(keep, playerName) {
    const diceText = keep.kept.join(' ');
    const comboText =
      keep.combo === 'straight'
        ? ' (straight)'
        : keep.combo === 'threePairs'
          ? ' (three pairs)'
          : '';
    logLine(`${playerName} keeps ${diceText}${comboText} for +${keep.score}`);
    if (keep.hotDice) {
      setStatus('Hot dice! All six scored — roll again', 'hot');
      logLine(`${playerName} has hot dice!`);
    }
  }

  function handleFarkle(ev) {
    setStatus(
      `Farkle! ${ev.lost > 0 ? `${ev.lost} points lost` : 'No score'}`,
      'farkle'
    );
    logLine(`${game.player.name} farkles${ev.lost > 0 ? ` and loses ${ev.lost}` : ''}`);
    renderAll({ animate: true });
    const wasHuman = !game.player.isAI;
    const token = aiToken; // a new game invalidates this pending timeout
    window.setTimeout(() => {
      if (!game || token !== aiToken) {
        return;
      }
      game.resolveFarkle();
      saveGame();
      startTurn();
    }, wasHuman ? 1800 : 1400);
  }

  function handleBank(ev) {
    const p = game.players[ev.playerIndex];
    logLine(`${p.name} banks ${ev.banked} → ${ev.total}`);
    if (ev.finalRound) {
      logLine(`${p.name} reached ${game.target}! Last round for everyone else.`);
    }
    saveGame();
    if (game.phase === 'gameOver') {
      showGameOver();
      return;
    }
    startTurn();
  }

  function startTurn() {
    selection.clear();
    if (game.phase === 'gameOver') {
      showGameOver();
      return;
    }
    const p = game.player;
    if (p.isAI) {
      setStatus(`${p.name} is playing…`);
      renderAll();
      runAITurn();
    } else {
      let msg = 'Your turn — roll the dice';
      if (game.finalRound) {
        const rival = game.bestRivalScore(game.currentPlayer);
        msg = `Last chance! Beat ${rival} to win`;
      } else if (!p.onBoard && game.opening > 0) {
        msg = `Your turn — score ${game.opening} in one turn to get on the board`;
      }
      setStatus(msg);
      renderAll();
    }
    saveGame();
  }

  /* ---------- AI turn ---------- */

  function sleep(ms) {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  async function runAITurn() {
    if (aiRunning) {
      return;
    }
    aiRunning = true;
    const token = ++aiToken;
    const profile = AI.getProfile(game.difficulty);

    try {
      while (token === aiToken && game.player.isAI && game.phase !== 'gameOver') {
        const player = game.player;
        const ev = game.rollDice();
        if (!ev) {
          break;
        }
        renderAll({ animate: true });
        await sleep(900);
        if (token !== aiToken) {
          return;
        }

        if (ev.type === 'farkle') {
          aiRunning = false;
          handleFarkle(ev);
          return;
        }

        const choice = AI.chooseKeep(game.roll, profile);
        if (!choice) {
          break; // defensive: rollDice() already detects farkles
        }
        // Map keepCounts back to dice indexes for display + keepDice().
        const indexes = [];
        const need = choice.keepCounts.slice();
        game.roll.forEach((v, i) => {
          if (need[v] > 0) {
            need[v]--;
            indexes.push(i);
          }
        });
        renderDice({ highlight: new Set(indexes) });
        await sleep(800);
        if (token !== aiToken) {
          return;
        }

        const keep = game.keepDice(indexes);
        if (!keep) {
          break;
        }
        afterKeep(keep, player.name);
        renderAll();
        saveGame();
        await sleep(500);
        if (token !== aiToken) {
          return;
        }

        const roll = AI.shouldRoll(
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
        if (!roll && game.canBank()) {
          const bankEv = game.bank();
          aiRunning = false;
          handleBank(bankEv);
          return;
        }
        setStatus(`${player.name} rolls again…`);
      }
    } finally {
      if (token === aiToken) {
        aiRunning = false;
      }
    }
    if (token === aiToken) {
      renderAll();
    }
  }

  /* ---------- Game lifecycle ---------- */

  function newGame() {
    const settings = {
      name: $('opt-name').value.trim() || 'You',
      aiCount: parseInt(readSegmented('opt-ai-count'), 10) || 1,
      difficulty: readSegmented('opt-difficulty') || 'balanced',
      opening: parseInt(readSegmented('opt-opening'), 10) || 0,
    };
    saveSettings(settings);

    aiToken++; // cancel any running AI loop
    aiRunning = false;
    game = new Game.Game({
      playerName: settings.name,
      aiCount: settings.aiCount,
      difficulty: settings.difficulty,
      opening: settings.opening,
    });
    selection.clear();
    el.log.innerHTML = '';
    el.overlayGameover.classList.add('hidden');
    el.screenSetup.classList.add('hidden');
    el.screenGame.classList.remove('hidden');
    logLine(`New game: first to ${game.target} wins.`);
    startTurn();
  }

  function resumeGame(data) {
    aiToken++;
    aiRunning = false;
    game = Game.Game.fromJSON(data);
    selection.clear();
    el.log.innerHTML = '';
    el.overlayGameover.classList.add('hidden');
    el.screenSetup.classList.add('hidden');
    el.screenGame.classList.remove('hidden');
    logLine('Game resumed.');

    if (game.phase === 'farkled') {
      game.resolveFarkle();
    }
    if (game.phase === 'awaitKeep' && !game.player.isAI) {
      setStatus('Set aside scoring dice');
      renderAll();
      saveGame();
      return;
    }
    // AI mid-roll state is not replayed; restart the decision from here.
    if (game.phase === 'awaitKeep' && game.player.isAI) {
      game.roll = [];
      game.phase = 'awaitRoll';
      game.diceLeft = game.kept.length ? 6 - game.kept.length : 6;
      if (game.diceLeft <= 0) {
        game.diceLeft = 6;
      }
    }
    startTurn();
  }

  function showSetup() {
    aiToken++;
    aiRunning = false;
    el.screenGame.classList.add('hidden');
    el.overlayGameover.classList.add('hidden');
    el.screenSetup.classList.remove('hidden');
    const saved = loadSavedGame();
    $('btn-resume').classList.toggle('hidden', !saved);
  }

  function showGameOver() {
    saveGame(); // clears storage since phase is gameOver
    const winner = game.players[game.winner];
    el.gameoverTitle.textContent = winner.isAI
      ? `${winner.name} wins!`
      : 'You win! 🎉';
    el.gameoverScores.innerHTML = '';
    const sorted = game.players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.score - a.p.score);
    sorted.forEach(({ p, i }) => {
      const row = document.createElement('div');
      row.className = 'gameover-row' + (i === game.winner ? ' winner' : '');
      row.innerHTML = `<span>${escapeHtml(p.name)}</span><span>${p.score}</span>`;
      el.gameoverScores.appendChild(row);
    });
    el.overlayGameover.classList.remove('hidden');
    renderAll();
  }

  /* ---------- Wiring ---------- */

  document.querySelectorAll('.segmented').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) {
        return;
      }
      group
        .querySelectorAll('button')
        .forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  $('btn-start').addEventListener('click', newGame);
  $('btn-resume').addEventListener('click', () => {
    const saved = loadSavedGame();
    if (saved) {
      resumeGame(saved);
    }
  });
  el.btnRoll.addEventListener('click', humanRoll);
  el.btnBank.addEventListener('click', humanBank);
  $('btn-again').addEventListener('click', showSetup);
  $('btn-menu').addEventListener('click', () => {
    if (
      !game ||
      game.phase === 'gameOver' ||
      window.confirm('Abandon the current game?')
    ) {
      if (game && game.phase !== 'gameOver') {
        try {
          localStorage.removeItem(GAME_KEY);
        } catch (e) {
          /* ignore */
        }
      }
      game = null;
      showSetup();
    }
  });
  $('btn-rules').addEventListener('click', () =>
    el.overlayRules.classList.remove('hidden')
  );
  $('btn-rules-close').addEventListener('click', () =>
    el.overlayRules.classList.add('hidden')
  );

  loadSettings();
  showSetup();

  /* ---------- Service worker ---------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline install unavailable (e.g. served from file://) */
      });
    });
  }
})();
