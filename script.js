(() => {
  "use strict";

  const CONFIG = {
    columns: 10,
    totalRuns: 8,
    copiesPerRank: 8,
    requireFullColumnsBeforeDeal: false,
    historyLimit: 300,
    moveAnimationMs: 320
  };

  const RANK_LABELS = new Map([
    [1, "A"],
    [2, "2"],
    [3, "3"],
    [4, "4"],
    [5, "5"],
    [6, "6"],
    [7, "7"],
    [8, "8"],
    [9, "9"],
    [10, "10"],
    [11, "J"],
    [12, "Q"],
    [13, "K"]
  ]);

  const state = {
    tableau: [],
    stock: [],
    completed: 0,
    moves: 0,
    history: [],
    hint: null,
    won: false,
    timerRunning: false,
    timerStartedAt: 0,
    elapsedAtPause: 0,
    timerId: null,
    dragSource: null,
    dragJustEnded: false,
    animating: false
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindControls();
    newGame(false);
  });

  function cacheElements() {
    els.tableau = document.getElementById("tableau");
    els.moves = document.getElementById("moves");
    els.time = document.getElementById("time");
    els.completedText = document.getElementById("completedText");
    els.stockBtn = document.getElementById("stockBtn");
    els.stockVisual = document.getElementById("stockVisual");
    els.stockText = document.getElementById("stockText");
    els.newGameBtn = document.getElementById("newGameBtn");
    els.undoBtn = document.getElementById("undoBtn");
    els.hintBtn = document.getElementById("hintBtn");
  }

  function bindControls() {
    els.newGameBtn.addEventListener("click", () => {
      newGame(true);
    });

    els.undoBtn.addEventListener("click", undo);
    els.hintBtn.addEventListener("click", showHint);
    els.stockBtn.addEventListener("click", dealFromStock);
  }

  function newGame() {
    stopTimer(true);

    const deck = makeDeck();
    shuffle(deck);

    state.tableau = Array.from({ length: CONFIG.columns }, () => []);
    state.stock = [];
    state.completed = 0;
    state.moves = 0;
    state.history = [];
    state.hint = null;
    state.won = false;
    state.dragSource = null;
    state.dragJustEnded = false;
    state.animating = false;

    for (let col = 0; col < CONFIG.columns; col += 1) {
      const count = col < 4 ? 6 : 5;
      for (let i = 0; i < count; i += 1) {
        const card = deck.pop();
        card.faceUp = i === count - 1;
        state.tableau[col].push(card);
      }
    }

    state.stock = deck.map((card) => ({ ...card, faceUp: false }));
    render();
  }

  function makeDeck() {
    const deck = [];
    let id = 1;

    for (let copy = 0; copy < CONFIG.copiesPerRank; copy += 1) {
      for (let rank = 1; rank <= 13; rank += 1) {
        deck.push({ id: id, rank: rank, faceUp: false });
        id += 1;
      }
    }

    return deck;
  }

  function shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  function render() {
    els.moves.textContent = String(state.moves);
    els.completedText.textContent = `${state.completed} of ${CONFIG.totalRuns}`;
    els.newGameBtn.disabled = state.animating;
    els.undoBtn.disabled = state.animating || state.history.length === 0;
    els.hintBtn.disabled = state.animating || state.won;
    els.stockBtn.disabled = state.animating || state.stock.length === 0 || state.won;
    els.stockText.textContent = state.stock.length > 0 ? `${state.stock.length / CONFIG.columns} deals left` : "Empty";
    renderStock();
    renderTableau();
    updateTimerDisplay();
  }

  function renderStock() {
    els.stockVisual.innerHTML = "";
    const dealsLeft = Math.ceil(state.stock.length / CONFIG.columns);

    for (let i = 0; i < dealsLeft; i += 1) {
      const pack = document.createElement("span");
      pack.className = "stock-pack";
      pack.style.left = `${i * 0.32}rem`;
      pack.style.zIndex = String(i + 1);
      els.stockVisual.appendChild(pack);
    }
  }

  function renderTableau() {
    els.tableau.classList.toggle("animating", state.animating);
    els.tableau.innerHTML = "";

    state.tableau.forEach((pile, col) => {
      const column = document.createElement("div");
      column.className = "column";
      column.dataset.column = String(col);
      column.dataset.label = `Col ${col + 1}`;
      column.setAttribute("role", "list");
      column.setAttribute("aria-label", `Column ${col + 1}`);
      column.style.minHeight = `calc(var(--card-h) + ${Math.max(pile.length - 1, 0)} * var(--overlap) + 1.3rem)`;

      if (pile.length === 0) column.classList.add("empty");
      if (state.hint && state.hint.destCol === col) column.classList.add("hint-destination");

      column.addEventListener("click", onColumnClick);
      column.addEventListener("dragover", onColumnDragOver);
      column.addEventListener("dragenter", onColumnDragEnter);
      column.addEventListener("dragleave", onColumnDragLeave);
      column.addEventListener("drop", onColumnDrop);

      pile.forEach((card, index) => {
        const cardEl = buildCard(card, col, index);
        column.appendChild(cardEl);
      });

      els.tableau.appendChild(column);
    });
  }

  function buildCard(card, col, index) {
    const cardEl = document.createElement("div");
    const movable = isMovableStart(col, index);
    const isHintSource = state.hint && state.hint.srcCol === col && index >= state.hint.startIndex;

    cardEl.className = "card";
    cardEl.dataset.column = String(col);
    cardEl.dataset.index = String(index);
    cardEl.dataset.cardId = String(card.id);
    cardEl.style.top = `calc(${index} * var(--overlap))`;
    cardEl.style.zIndex = String(index + 1);
    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("aria-disabled", movable ? "false" : "true");
    cardEl.tabIndex = movable ? 0 : -1;

    if (!card.faceUp) {
      cardEl.classList.add("face-down");
      cardEl.setAttribute("aria-label", `Face-down card in column ${col + 1}`);
      return cardEl;
    }

    cardEl.classList.add("face-up");
    cardEl.classList.add(movable ? "playable" : "blocked");
    if (isHintSource) cardEl.classList.add("hint-source");

    const stackLength = state.tableau[col].length - index;
    const stackText = stackLength > 1 ? `${stackLength}-card stack starting with ${cardName(card)}` : cardName(card);
    cardEl.setAttribute("aria-label", `${stackText} in column ${col + 1}`);
    cardEl.draggable = movable;

    cardEl.innerHTML = `
      <span class="corner top"><span>${rankLabel(card.rank)}</span><span>♠</span></span>
      <span class="pip">♠</span>
      <span class="corner bottom"><span>${rankLabel(card.rank)}</span><span>♠</span></span>
    `;

    cardEl.addEventListener("click", onCardClick);
    cardEl.addEventListener("keydown", onCardKeydown);
    cardEl.addEventListener("dragstart", onCardDragStart);
    cardEl.addEventListener("dragend", onCardDragEnd);

    return cardEl;
  }

  function onCardClick(event) {
    event.stopPropagation();
    if (state.dragJustEnded || state.animating || state.won) return;

    const source = getSourceFromElement(event.currentTarget);

    if (!isMovableStart(source.col, source.index)) {
      state.hint = null;
      render();
      return;
    }

    const move = findBestMoveForSource(source.col, source.index, true);
    if (!move) {
      state.hint = null;
      render();
      return;
    }

    moveStack(source.col, source.index, move.destCol, "Moved");
  }

  function onCardKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  }

  function onColumnClick(event) {
    if (event.target !== event.currentTarget || state.animating || state.won) return;
    state.hint = null;
    render();
  }

  function onCardDragStart(event) {
    const source = getSourceFromElement(event.currentTarget);
    if (!isMovableStart(source.col, source.index) || state.animating || state.won) {
      event.preventDefault();
      return;
    }

    state.dragSource = source;
    event.currentTarget.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(source));
  }

  function onCardDragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    state.dragSource = null;
    state.dragJustEnded = true;
    document.querySelectorAll(".column.drag-ok").forEach((el) => el.classList.remove("drag-ok"));
    window.setTimeout(() => {
      state.dragJustEnded = false;
    }, 0);
  }

  function onColumnDragEnter(event) {
    const destCol = Number(event.currentTarget.dataset.column);
    if (state.dragSource && canMoveTo(state.dragSource.col, state.dragSource.index, destCol)) {
      event.currentTarget.classList.add("drag-ok");
    }
  }

  function onColumnDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove("drag-ok");
  }

  function onColumnDragOver(event) {
    const destCol = Number(event.currentTarget.dataset.column);
    if (state.dragSource && canMoveTo(state.dragSource.col, state.dragSource.index, destCol)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function onColumnDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-ok");

    let source = state.dragSource;
    if (!source) {
      try {
        source = JSON.parse(event.dataTransfer.getData("text/plain"));
      } catch (_error) {
        source = null;
      }
    }

    if (!source) return;
    const destCol = Number(event.currentTarget.dataset.column);
    moveStack(source.col, source.index, destCol, "Manual move");
  }

  function getSourceFromElement(element) {
    return {
      col: Number(element.dataset.column),
      index: Number(element.dataset.index)
    };
  }

  function dealFromStock() {
    if (state.animating || state.won) return;

    if (state.stock.length < CONFIG.columns) {
      render();
      return;
    }

    if (CONFIG.requireFullColumnsBeforeDeal && state.tableau.some((pile) => pile.length === 0)) {
      state.hint = null;
      render();
      return;
    }

    const animation = captureDealAnimation();

    saveHistory();
    startTimerIfNeeded();

    for (let col = 0; col < CONFIG.columns; col += 1) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.tableau[col].push(card);
      if (animation) animation.cards.push({ id: card.id, rect: animation.stockRect });
    }

    state.moves += 1;
    state.hint = null;
    afterPlayerAction(animation);
  }

  function moveStack(srcCol, startIndex, destCol) {
    if (!canMoveTo(srcCol, startIndex, destCol)) {
      state.hint = null;
      render();
      return false;
    }

    const animation = captureMoveAnimation(srcCol, startIndex);

    saveHistory();
    startTimerIfNeeded();

    const movedCards = state.tableau[srcCol].splice(startIndex);
    state.tableau[destCol].push(...movedCards);
    revealTopCard(srcCol);

    state.moves += 1;
    state.hint = null;
    afterPlayerAction(animation);
    return true;
  }

  function afterPlayerAction(animation) {
    if (animation && shouldAnimateMoves()) {
      state.animating = true;
      render();
      animateMovedStack(animation, finishPlayerAction);
      return;
    }

    finishPlayerAction();
  }

  function finishPlayerAction() {
    removeCompletedRuns();

    if (state.completed === CONFIG.totalRuns) {
      state.won = true;
      stopTimer(false);
    }

    render();
  }

  function undo() {
    if (state.animating || state.history.length === 0) return;

    const snapshot = state.history.pop();
    state.tableau = clonePiles(snapshot.tableau);
    state.stock = snapshot.stock.map((card) => ({ ...card }));
    state.completed = snapshot.completed;
    state.moves = snapshot.moves;
    state.won = snapshot.won;
    state.hint = null;

    if (!state.won && state.elapsedAtPause > 0 && !state.timerRunning) {
      resumeTimer();
    }

    render();
  }

  function showHint() {
    if (state.animating || state.won) return;

    const hint = findBestGlobalMove();
    if (!hint) {
      state.hint = null;
      render();
      return;
    }

    state.hint = hint;
    render();
  }

  function captureMoveAnimation(srcCol, startIndex) {
    const pile = state.tableau[srcCol];
    if (!pile || startIndex < 0 || startIndex >= pile.length) return null;

    const cards = pile.slice(startIndex).map((card) => {
      const element = els.tableau.querySelector(`[data-card-id="${card.id}"]`);
      return {
        id: card.id,
        rect: element ? element.getBoundingClientRect() : null
      };
    }).filter((item) => item.rect);

    return cards.length > 0 ? { cards } : null;
  }


  function captureDealAnimation() {
    if (!shouldAnimateMoves()) return null;
    const stockRect = els.stockBtn.getBoundingClientRect();
    return {
      stockRect: {
        left: stockRect.left + stockRect.width / 2,
        top: stockRect.top + stockRect.height / 2,
        width: 1,
        height: 1
      },
      cards: []
    };
  }

  function shouldAnimateMoves() {
    return CONFIG.moveAnimationMs > 0
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animateMovedStack(animation, onDone) {
    const runningAnimations = [];

    animation.cards.forEach((item, stackOffset) => {
      const target = els.tableau.querySelector(`[data-card-id="${item.id}"]`);
      if (!target || !item.rect) return;

      const targetRect = target.getBoundingClientRect();
      const startRect = item.rect;

      // Do nothing if the card hasn't moved.
      if (Math.abs(targetRect.left - startRect.left) < 1 && Math.abs(targetRect.top - startRect.top) < 1) {
        return;
      }

      const clone = target.cloneNode(true);
      clone.classList.add("motion-clone");
      clone.removeAttribute("id");
      clone.removeAttribute("data-column");
      clone.removeAttribute("data-index");
      clone.removeAttribute("data-card-id");

      // Position the clone exactly where the card started.
      clone.style.left = `${startRect.left}px`;
      clone.style.top = `${startRect.top}px`;
      clone.style.width = `${startRect.width}px`;
      clone.style.height = `${startRect.height}px`;
      clone.style.zIndex = String(9000 + stackOffset);

      target.classList.add("animation-hidden");
      document.body.appendChild(clone);

      // Animate the transform from the start position to the end position.
      const effect = [
        { transform: `translate(0, 0)` }, // Starts at its current position (which is the startRect)
        { transform: `translate(${targetRect.left - startRect.left}px, ${targetRect.top - startRect.top}px)` } // Translates to the target position
      ];

      const timing = {
        duration: CONFIG.moveAnimationMs,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "both"
      };

      const player = clone.animate(effect, timing);

      runningAnimations.push(player.finished.catch(() => null).then(() => {
        target.classList.remove("animation-hidden");
        clone.remove();
      }));
    });

    if (runningAnimations.length === 0) {
      state.animating = false;
      onDone();
      return;
    }

    Promise.all(runningAnimations).then(() => {
      state.animating = false;
      onDone();
    });
  }

  function saveHistory() {
    state.history.push({
      tableau: clonePiles(state.tableau),
      stock: state.stock.map((card) => ({ ...card })),
      completed: state.completed,
      moves: state.moves,
      won: state.won
    });

    if (state.history.length > CONFIG.historyLimit) {
      state.history.shift();
    }
  }

  function clonePiles(piles) {
    return piles.map((pile) => pile.map((card) => ({ ...card })));
  }

  function isMovableStart(col, index) {
    const pile = state.tableau[col];
    if (!pile || index < 0 || index >= pile.length) return false;
    if (!pile[index].faceUp) return false;

    for (let i = index; i < pile.length - 1; i += 1) {
      const current = pile[i];
      const below = pile[i + 1];
      if (!below.faceUp) return false;
      if (current.rank !== below.rank + 1) return false;
    }

    return true;
  }

  function canMoveTo(srcCol, startIndex, destCol) {
    if (srcCol === destCol) return false;
    if (!isMovableStart(srcCol, startIndex)) return false;

    const movingCard = state.tableau[srcCol][startIndex];
    const destPile = state.tableau[destCol];
    if (!destPile) return false;
    if (destPile.length === 0) return true;

    const destTop = destPile[destPile.length - 1];
    return destTop.faceUp && destTop.rank === movingCard.rank + 1;
  }

  function findBestMoveForSource(srcCol, startIndex, skipPointlessEmptyTransfer) {
    let best = null;

    for (let destCol = 0; destCol < CONFIG.columns; destCol += 1) {
      if (!canMoveTo(srcCol, startIndex, destCol)) continue;
      if (skipPointlessEmptyTransfer && isPointlessEmptyTransfer(srcCol, startIndex, destCol)) continue;

      const score = scoreMove(srcCol, startIndex, destCol);
      if (!best || score > best.score) {
        best = { srcCol, startIndex, destCol, score };
      }
    }

    return best;
  }

  function findBestGlobalMove() {
    let best = null;

    for (let srcCol = 0; srcCol < CONFIG.columns; srcCol += 1) {
      const pile = state.tableau[srcCol];
      for (let startIndex = 0; startIndex < pile.length; startIndex += 1) {
        if (!isMovableStart(srcCol, startIndex)) continue;
        const move = findBestMoveForSource(srcCol, startIndex, true);
        if (!move) continue;
        if (!best || move.score > best.score) best = move;
      }
    }

    return best;
  }

  function scoreMove(srcCol, startIndex, destCol) {
    const srcPile = state.tableau[srcCol];
    const destPile = state.tableau[destCol];
    const stack = srcPile.slice(startIndex);
    const movingLength = stack.length;
    const destEmpty = destPile.length === 0;
    const revealsHidden = startIndex > 0 && !srcPile[startIndex - 1].faceUp;
    const breaksExistingRun = startIndex > 0 && srcPile[startIndex - 1].faceUp && srcPile[startIndex - 1].rank === stack[0].rank + 1;

    let score = 0;

    if (wouldCompleteRun(srcCol, startIndex, destCol)) score += 10000;
    if (!destEmpty) {
      score += 1200;
      score += endRunLength(destPile) * 55;
    } else {
      score += 160;
    }

    if (revealsHidden) score += 900;
    if (breaksExistingRun) score -= 275;
    if (destEmpty && movingLength === 1 && !revealsHidden) score -= 180;
    if (destEmpty && startIndex === 0) score -= 10000;

    score += movingLength * 20;
    score += (13 - stack[0].rank) * 2;

    return score;
  }

  function isPointlessEmptyTransfer(srcCol, startIndex, destCol) {
    return state.tableau[destCol].length === 0 && startIndex === 0 && state.tableau[srcCol].length > 0;
  }

  function wouldCompleteRun(srcCol, startIndex, destCol) {
    const after = state.tableau[destCol].concat(state.tableau[srcCol].slice(startIndex));
    return isCompleteRunAtEnd(after);
  }

  function removeCompletedRuns() {
    let removed = 0;
    let keepLooking = true;

    while (keepLooking) {
      keepLooking = false;

      for (let col = 0; col < CONFIG.columns; col += 1) {
        const pile = state.tableau[col];
        if (!isCompleteRunAtEnd(pile)) continue;

        pile.splice(pile.length - 13, 13);
        state.completed += 1;
        removed += 1;
        revealTopCard(col);
        keepLooking = true;
        break;
      }
    }

    return removed;
  }

  function isCompleteRunAtEnd(pile) {
    if (pile.length < 13) return false;
    const start = pile.length - 13;
    if (!pile[start].faceUp || pile[start].rank !== 13) return false;

    for (let i = start; i < pile.length; i += 1) {
      const expectedRank = 13 - (i - start);
      if (!pile[i].faceUp || pile[i].rank !== expectedRank) return false;
    }

    return true;
  }

  function revealTopCard(col) {
    const pile = state.tableau[col];
    if (pile.length === 0) return false;

    const top = pile[pile.length - 1];
    if (!top.faceUp) {
      top.faceUp = true;
      return true;
    }

    return false;
  }

  function endRunLength(pile) {
    if (pile.length === 0) return 0;
    const bottomIndex = pile.length - 1;
    if (!pile[bottomIndex].faceUp) return 0;

    let length = 1;
    for (let i = bottomIndex - 1; i >= 0; i -= 1) {
      const upper = pile[i];
      const lower = pile[i + 1];
      if (!upper.faceUp || !lower.faceUp) break;
      if (upper.rank !== lower.rank + 1) break;
      length += 1;
    }

    return length;
  }

  function cardName(card) {
    return `${rankLabel(card.rank)}♠`;
  }

  function rankLabel(rank) {
    return RANK_LABELS.get(rank) || String(rank);
  }

  function startTimerIfNeeded() {
    if (state.timerRunning) return;
    state.timerRunning = true;
    state.timerStartedAt = Date.now();
    state.timerId = window.setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }

  function resumeTimer() {
    state.timerRunning = true;
    state.timerStartedAt = Date.now();
    state.timerId = window.setInterval(updateTimerDisplay, 1000);
  }

  function stopTimer(resetElapsed) {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }

    if (state.timerRunning && !resetElapsed) {
      state.elapsedAtPause = getElapsedSeconds();
    }

    state.timerRunning = false;
    state.timerStartedAt = 0;
    if (resetElapsed) state.elapsedAtPause = 0;
    updateTimerDisplay();
  }

  function getElapsedSeconds() {
    if (!state.timerRunning) return state.elapsedAtPause;
    return state.elapsedAtPause + Math.floor((Date.now() - state.timerStartedAt) / 1000);
  }

  function updateTimerDisplay() {
    if (!els.time) return;
    els.time.textContent = formatTime(getElapsedSeconds());
  }

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
})();
