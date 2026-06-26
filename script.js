(() => {
    "use strict";

    const CONFIG = {
        columns: 10,
        totalRuns: 8,
        allowedSuitCounts: [1, 2, 4],
        defaultSuitCount: 1,
        requireFullColumnsBeforeDeal: false,
        historyLimit: 300,
        moveAnimationMs: 320,
        winModalDelayMs: 2000
    };

    const PB_KEYS = {
        moves: "spiderBestMoves",
        time: "spiderBestTime",
        suitCount: "spiderSuitCount"
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

    const SUITS = ["\u2660", "\u2665", "\u2663", "\u2666"];
    const RED_SUITS = new Set(["\u2665", "\u2666"]);

    const state = {
        tableau: [],
        stock: [],
        suitCount: CONFIG.defaultSuitCount,
        completed: 0,
        moves: 0,
        history: [],
        hint: null,
        won: false,
        timerRunning: false,
        timerStartedAt: 0,
        elapsedAtPause: 0,
        timerId: null,
        winModalTimerId: null,
        dragSource: null,
        dragJustEnded: false,
        animating: false
    };

    const els = {};

    document.addEventListener("DOMContentLoaded", () => {
        cacheElements();
        restoreSuitPreference();
        bindControls();
        migrateLegacyPBs();
        loadPBs();
        newGame();
    });

    function cacheElements() {
        const ids = [
            "tableau",
            "moves",
            "time",
            "completedText",
            "stockBtn",
            "stockVisual",
            "stockText",
            "suitModeSelect",
            "completedSuitIcon",
            "newGameBtn",
            "clearPBsBtn",
            "undoBtn",
            "hintBtn",
            "bestMoves",
            "bestTime",
            "winModal",
            "finalMoves",
            "finalTime",
            "newRecordBadges",
            "movesRecordBadge",
            "timeRecordBadge",
            "modalNextGameBtn"
        ];

        ids.forEach((id) => {
            els[id] = document.getElementById(id);
        });
    }

    function bindControls() {
        els.newGameBtn.addEventListener("click", newGame);
        els.clearPBsBtn.addEventListener("click", clearPBs);
        els.undoBtn.addEventListener("click", undo);
        els.hintBtn.addEventListener("click", showHint);
        els.stockBtn.addEventListener("click", dealFromStock);
        els.modalNextGameBtn.addEventListener("click", newGame);
        if (els.suitModeSelect) els.suitModeSelect.addEventListener("change", onSuitModeChange);
    }

    function restoreSuitPreference() {
        const savedSuitCount = parseSuitCount(localStorage.getItem(PB_KEYS.suitCount));
        state.suitCount = savedSuitCount || CONFIG.defaultSuitCount;
        if (els.suitModeSelect) els.suitModeSelect.value = String(state.suitCount);
    }

    function onSuitModeChange(event) {
        if (state.animating) {
            event.currentTarget.value = String(state.suitCount);
            return;
        }

        const nextSuitCount = parseSuitCount(event.currentTarget.value) || CONFIG.defaultSuitCount;
        if (nextSuitCount === state.suitCount) return;

        if (hasGameInProgress() && !window.confirm("Changing suits starts a new game. Continue?")) {
            event.currentTarget.value = String(state.suitCount);
            return;
        }

        state.suitCount = nextSuitCount;
        localStorage.setItem(PB_KEYS.suitCount, String(state.suitCount));
        loadPBs();
        newGame();
    }

    function parseSuitCount(value) {
        const parsed = Number.parseInt(value, 10);
        return CONFIG.allowedSuitCounts.includes(parsed) ? parsed : null;
    }

    function hasGameInProgress() {
        return !state.won && (state.moves > 0 || state.timerRunning || state.history.length > 0);
    }

    function suitModeLabel(suitCount = state.suitCount) {
        return `${suitCount} ${suitCount === 1 ? "Suit" : "Suits"}`;
    }

    function completedSuitIconText() {
        return SUITS.slice(0, state.suitCount).join("");
    }

    function newGame() {
        hideWinModal();
        stopTimer(true);
        resetGameState();

        const deck = makeDeck();
        shuffle(deck);

        for (let col = 0; col < CONFIG.columns; col += 1) {
            const count = col < 4 ? 6 : 5;
            for (let i = 0; i < count; i += 1) {
                const card = deck.pop();
                card.faceUp = i === count - 1;
                state.tableau[col].push(card);
            }
        }

        state.stock = deck.map((card) => ({...card, faceUp: false}));
        render();
    }

    function resetGameState() {
        Object.assign(state, {
            tableau: Array.from({length: CONFIG.columns}, () => []),
            stock: [],
            completed: 0,
            moves: 0,
            history: [],
            hint: null,
            won: false,
            dragSource: null,
            dragJustEnded: false,
            animating: false
        });
    }

    function makeDeck() {
        const deck = [];
        const activeSuits = SUITS.slice(0, state.suitCount);
        const copiesPerSuit = CONFIG.totalRuns / state.suitCount;
        let id = 1;

        activeSuits.forEach((suit) => {
            for (let copy = 0; copy < copiesPerSuit; copy += 1) {
                for (let rank = 1; rank <= 13; rank += 1) {
                    deck.push({id, rank, suit, faceUp: false});
                    id += 1;
                }
            }
        });

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
        els.clearPBsBtn.disabled = state.animating;
        if (els.suitModeSelect) els.suitModeSelect.disabled = state.animating;
        if (els.completedSuitIcon) {
            els.completedSuitIcon.textContent = completedSuitIconText();
            els.completedSuitIcon.classList.toggle("multi-suit", state.suitCount > 1);
        }
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
            const column = buildColumn(pile, col);
            pile.forEach((card, index) => column.appendChild(buildCard(card, col, index)));
            els.tableau.appendChild(column);
        });
    }

    function buildColumn(pile, col) {
        const column = document.createElement("div");
        column.className = "column";
        column.dataset.column = String(col);
        column.dataset.label = `Col ${col + 1}`;
        column.setAttribute("role", "list");
        column.setAttribute("aria-label", `Column ${col + 1}`);
        column.style.minHeight = `calc(var(--card-h) + ${Math.max(pile.length - 1, 0)} * var(--overlap) + 1.3rem)`;
        column.classList.toggle("empty", pile.length === 0);
        column.classList.toggle("hint-destination", Boolean(state.hint && state.hint.destCol === col));
        column.addEventListener("click", onColumnClick);
        column.addEventListener("dragover", onColumnDragOver);
        column.addEventListener("dragenter", onColumnDragEnter);
        column.addEventListener("dragleave", onColumnDragLeave);
        column.addEventListener("drop", onColumnDrop);
        return column;
    }

    function buildCard(card, col, index) {
        const cardEl = document.createElement("div");
        const movable = isMovableStart(col, index);
        const isHintSource = state.hint && state.hint.srcCol === col && index >= state.hint.startIndex;

        cardEl.className = "card";
        cardEl.dataset.column = String(col);
        cardEl.dataset.index = String(index);
        cardEl.dataset.cardId = String(card.id);
        cardEl.dataset.suit = card.suit;
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

        cardEl.classList.add("face-up", suitColorClass(card), movable ? "playable" : "blocked");
        cardEl.draggable = movable;
        if (isHintSource) cardEl.classList.add("hint-source");

        const stackLength = state.tableau[col].length - index;
        const stackText = stackLength > 1 ? `${stackLength}-card stack starting with ${cardName(card)}` : cardName(card);
        cardEl.setAttribute("aria-label", `${stackText} in column ${col + 1}`);
        cardEl.innerHTML = `
            <span class="corner top"><span>${rankLabel(card.rank)}</span><span>${card.suit}</span></span>
            <span class="pip">${card.suit}</span>
            <span class="corner bottom"><span>${rankLabel(card.rank)}</span><span>${card.suit}</span></span>
        `;

        cardEl.addEventListener("click", onCardClick);
        cardEl.addEventListener("keydown", onCardKeydown);
        cardEl.addEventListener("dragstart", onCardDragStart);
        cardEl.addEventListener("dragend", onCardDragEnd);
        return cardEl;
    }

    function onCardClick(event) {
        event.stopPropagation();
        if (state.dragJustEnded || state.won) return;

        const source = getSourceFromElement(event.currentTarget);
        if (!isMovableStart(source.col, source.index)) {
            clearHintAndRender();
            return;
        }

        const move = findBestMoveForSource(source.col, source.index, true);
        if (move) moveStack(source.col, source.index, move.destCol);
        else clearHintAndRender();
    }

    function onCardKeydown(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.currentTarget.click();
    }

    function onColumnClick(event) {
        if (event.target !== event.currentTarget || state.animating || state.won) return;
        clearHintAndRender();
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

        const source = state.dragSource || getDragSourceFromEvent(event);
        if (!source) return;

        const destCol = Number(event.currentTarget.dataset.column);
        moveStack(source.col, source.index, destCol);
    }

    function getDragSourceFromEvent(event) {
        try {
            return JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (_error) {
            return null;
        }
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
            clearHintAndRender();
            return;
        }

        const animation = captureDealAnimation();
        saveHistory();
        startTimerIfNeeded();

        for (let col = 0; col < CONFIG.columns; col += 1) {
            const card = state.stock.pop();
            card.faceUp = true;
            state.tableau[col].push(card);
            if (animation) animation.cards.push({id: card.id, rect: animation.stockRect});
        }

        state.moves += 1;
        state.hint = null;
        afterPlayerAction(animation);
    }

    function moveStack(srcCol, startIndex, destCol) {
        if (!canMoveTo(srcCol, startIndex, destCol)) {
            clearHintAndRender();
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
            const elapsedSeconds = getElapsedSeconds();
            state.won = true;
            stopTimer(false);
            const records = checkAndSavePBs(state.moves, elapsedSeconds);
            queueWinModal(records, elapsedSeconds);
        }

        render();
    }

    function undo() {
        if (state.animating || state.history.length === 0) return;

        const undoMoveCount = state.moves + 1;
        const snapshot = state.history.pop();
        state.tableau = clonePiles(snapshot.tableau);
        state.stock = snapshot.stock.map(cloneCard);
        state.completed = snapshot.completed;
        state.moves = undoMoveCount;
        state.won = snapshot.won;
        state.hint = null;
        hideWinModal();

        if (!state.won && state.elapsedAtPause > 0 && !state.timerRunning) resumeTimer();
        render();
    }

    function showHint() {
        if (state.animating || state.won) return;
        state.hint = findBestGlobalMove();
        render();
    }

    function clearHintAndRender() {
        state.hint = null;
        render();
    }

    function captureMoveAnimation(srcCol, startIndex) {
        const pile = state.tableau[srcCol];
        if (!pile || startIndex < 0 || startIndex >= pile.length) return null;

        const cards = pile.slice(startIndex)
            .map((card) => ({
                id: card.id,
                rect: getCardRect(card.id)
            }))
            .filter((item) => item.rect);

        return cards.length > 0 ? {cards} : null;
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

    function getCardRect(cardId) {
        const element = els.tableau.querySelector(`[data-card-id="${cardId}"]`);
        return element ? element.getBoundingClientRect() : null;
    }

    function shouldAnimateMoves() {
        return CONFIG.moveAnimationMs > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function animateMovedStack(animation, onDone) {
        const runningAnimations = [];

        animation.cards.forEach((item, stackOffset) => {
            const target = els.tableau.querySelector(`[data-card-id="${item.id}"]`);
            if (!target || !item.rect) return;

            const targetRect = target.getBoundingClientRect();
            const startRect = item.rect;
            if (Math.abs(targetRect.left - startRect.left) < 1 && Math.abs(targetRect.top - startRect.top) < 1) return;

            const clone = makeMotionClone(target, startRect, 9000 + stackOffset);
            target.classList.add("animation-hidden");

            const player = clone.animate([
                {transform: "translate(0, 0)"},
                {transform: `translate(${targetRect.left - startRect.left}px, ${targetRect.top - startRect.top}px)`}
            ], {
                duration: CONFIG.moveAnimationMs,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                fill: "both"
            });

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

    function makeMotionClone(element, rect, zIndex) {
        const clone = element.cloneNode(true);
        clone.classList.add("motion-clone");
        ["id", "data-column", "data-index", "data-card-id"].forEach((attr) => clone.removeAttribute(attr));
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.zIndex = String(zIndex);
        document.body.appendChild(clone);
        return clone;
    }

    function saveHistory() {
        state.history.push({
            tableau: clonePiles(state.tableau),
            stock: state.stock.map(cloneCard),
            completed: state.completed,
            won: state.won
        });

        if (state.history.length > CONFIG.historyLimit) state.history.shift();
    }

    function clonePiles(piles) {
        return piles.map((pile) => pile.map(cloneCard));
    }

    function cloneCard(card) {
        return {...card};
    }

    function isMovableStart(col, index) {
        const pile = state.tableau[col];
        if (!pile || index < 0 || index >= pile.length || !pile[index].faceUp) return false;

        for (let i = index; i < pile.length - 1; i += 1) {
            const current = pile[i];
            const below = pile[i + 1];
            if (!isSameSuitSequence(current, below)) return false;
        }

        return true;
    }

    function canMoveTo(srcCol, startIndex, destCol) {
        if (srcCol === destCol || !isMovableStart(srcCol, startIndex)) return false;

        const movingCard = state.tableau[srcCol][startIndex];
        const destPile = state.tableau[destCol];
        if (!destPile) return false;
        if (destPile.length === 0) return true;

        const destTop = destPile[destPile.length - 1];
        return canPlaceOn(destTop, movingCard);
    }

    function findBestMoveForSource(srcCol, startIndex, skipLowValueMoves) {
        let best = null;

        for (let destCol = 0; destCol < CONFIG.columns; destCol += 1) {
            if (!canMoveTo(srcCol, startIndex, destCol)) continue;
            if (skipLowValueMoves && isLowValueHintMove(srcCol, startIndex, destCol)) continue;

            const score = scoreMove(srcCol, startIndex, destCol);
            if (!best || score > best.score) best = {srcCol, startIndex, destCol, score};
        }

        return best;
    }

    function findBestGlobalMove() {
        let best = null;

        for (let srcCol = 0; srcCol < CONFIG.columns; srcCol += 1) {
            state.tableau[srcCol].forEach((_card, startIndex) => {
                if (!isMovableStart(srcCol, startIndex)) return;
                const move = findBestMoveForSource(srcCol, startIndex, true);
                if (move && (!best || move.score > best.score)) best = move;
            });
        }

        return best;
    }

    function scoreMove(srcCol, startIndex, destCol) {
        const srcPile = state.tableau[srcCol];
        const destPile = state.tableau[destCol];
        const stack = srcPile.slice(startIndex);
        const destEmpty = destPile.length === 0;
        const revealsHidden = startIndex > 0 && !srcPile[startIndex - 1].faceUp;
        const breaksRun = startIndex > 0 && isSameSuitSequence(srcPile[startIndex - 1], stack[0]);

        let score = 0;
        if (wouldCompleteRun(srcCol, startIndex, destCol)) score += 10000;

        score += destEmpty ? 160 : 1200 + endRunLength(destPile) * 55;
        if (revealsHidden) score += 900;
        if (breaksRun) score -= 275;
        if (destEmpty && stack.length === 1 && !revealsHidden) score -= 180;
        if (destEmpty && startIndex === 0) score -= 10000;

        score += stack.length * 20;
        score += (13 - stack[0].rank) * 2;
        return score;
    }

    function isLowValueHintMove(srcCol, startIndex, destCol) {
        return isPointlessEmptyTransfer(srcCol, startIndex, destCol) || isRedundantTailTransfer(srcCol, startIndex, destCol);
    }

    function isPointlessEmptyTransfer(srcCol, startIndex, destCol) {
        return state.tableau[destCol].length === 0 && startIndex === 0 && state.tableau[srcCol].length > 0;
    }

    function isRedundantTailTransfer(srcCol, startIndex, destCol) {
        const srcPile = state.tableau[srcCol];
        const destPile = state.tableau[destCol];
        if (startIndex === 0 || destPile.length === 0 || wouldCompleteRun(srcCol, startIndex, destCol)) return false;

        const sourceAnchor = srcPile[startIndex - 1];
        const movingCard = srcPile[startIndex];
        const destTop = destPile[destPile.length - 1];
        if (!sourceAnchor.faceUp || !destTop.faceUp || sourceAnchor.rank !== destTop.rank) return false;
        if (sourceAnchor.suit !== destTop.suit || !isSameSuitSequence(sourceAnchor, movingCard)) return false;

        return runLengthEndingAt(srcPile, startIndex - 1) >= endRunLength(destPile);
    }

    function runLengthEndingAt(pile, index) {
        if (index < 0 || index >= pile.length || !pile[index].faceUp) return 0;

        let length = 1;
        for (let i = index - 1; i >= 0; i -= 1) {
            const upper = pile[i];
            const lower = pile[i + 1];
            if (!isSameSuitSequence(upper, lower)) break;
            length += 1;
        }

        return length;
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

                const runCards = pile.slice(pile.length - 13);
                const runElements = runCards.map((card) => els.tableau.querySelector(`[data-card-id="${card.id}"]`));
                animateCompletedRun(runElements);
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

    function animateCompletedRun(elements) {
        if (!shouldAnimateMoves()) return;

        elements.forEach((element, index) => {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const clone = makeMotionClone(element, rect, 10000 + index);
            const fallDirection = Math.random() > 0.5 ? 1 : -1;
            const destX = Math.random() * 400 * fallDirection;
            const destY = window.innerHeight - rect.top + 300;

            const player = clone.animate([
                {transform: "translate(0, 0) rotate(0deg)"},
                {
                    transform: `translate(${destX / 2}px, -150px) rotate(${Math.random() * 90 * fallDirection}deg)`,
                    offset: 0.3
                },
                {transform: `translate(${destX}px, ${destY}px) rotate(${Math.random() * 720 * fallDirection}deg)`}
            ], {
                duration: 1200 + Math.random() * 600,
                delay: index * 100,
                easing: "cubic-bezier(0.4, 0, 0.8, 0.2)",
                fill: "forwards"
            });

            player.finished.catch(() => null).then(() => clone.remove());
        });
    }

    function isCompleteRunAtEnd(pile) {
        if (pile.length < 13) return false;
        const start = pile.length - 13;
        const suit = pile[start].suit;
        if (!pile[start].faceUp || pile[start].rank !== 13) return false;

        for (let i = start; i < pile.length; i += 1) {
            if (!pile[i].faceUp || pile[i].rank !== 13 - (i - start) || pile[i].suit !== suit) return false;
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
        return runLengthEndingAt(pile, pile.length - 1);
    }

    function cardName(card) {
        return `${rankLabel(card.rank)}${card.suit}`;
    }

    function canPlaceOn(destTop, movingCard) {
        return destTop.faceUp && destTop.rank === movingCard.rank + 1;
    }

    function isSameSuitSequence(upperCard, lowerCard) {
        return upperCard.faceUp
            && lowerCard.faceUp
            && upperCard.rank === lowerCard.rank + 1
            && upperCard.suit === lowerCard.suit;
    }

    function suitColorClass(card) {
        return RED_SUITS.has(card.suit) ? "red-suit" : "black-suit";
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

        if (state.timerRunning && !resetElapsed) state.elapsedAtPause = getElapsedSeconds();
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
        if (els.time) els.time.textContent = formatTime(getElapsedSeconds());
    }

    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        return hours > 0 ? `${hours}:${mmss}` : mmss;
    }

    function loadPBs() {
        const bestMoves = readPB("moves");
        const bestTime = readPB("time");
        els.bestMoves.textContent = bestMoves === null ? "--" : String(bestMoves);
        els.bestTime.textContent = bestTime === null ? "--:--" : formatTime(bestTime);
    }

    function checkAndSavePBs(currentMoves, currentTimeSecs) {
        const bestMoves = readPB("moves");
        const bestTime = readPB("time");
        const records = {
            moves: bestMoves === null || currentMoves < bestMoves,
            time: bestTime === null || currentTimeSecs < bestTime
        };

        if (records.moves) localStorage.setItem(pbKey("moves"), String(currentMoves));
        if (records.time) localStorage.setItem(pbKey("time"), String(currentTimeSecs));
        loadPBs();
        return records;
    }

    function migrateLegacyPBs() {
        migrateLegacyPB("moves");
        migrateLegacyPB("time");
    }

    function migrateLegacyPB(type) {
        const legacyValue = readStoredNumber(PB_KEYS[type]);
        const oneSuitKey = pbKey(type, 1);
        const oneSuitValue = readStoredNumber(oneSuitKey);

        if (legacyValue !== null && (oneSuitValue === null || legacyValue < oneSuitValue)) {
            localStorage.setItem(oneSuitKey, String(legacyValue));
        }

        localStorage.removeItem(PB_KEYS[type]);
    }

    function readPB(type) {
        return readStoredNumber(pbKey(type));
    }

    function readStoredNumber(key) {
        const value = localStorage.getItem(key);
        if (value === null) return null;
        const number = Number.parseInt(value, 10);
        return Number.isFinite(number) ? number : null;
    }

    function pbKey(type, suitCount = state.suitCount) {
        return `${PB_KEYS[type]}:${suitCount}`;
    }

    function clearPBs() {
        if (readPB("moves") === null && readPB("time") === null) return;
        if (!window.confirm(`Clear your ${suitModeLabel().toLowerCase()} personal best moves and time?`)) return;

        localStorage.removeItem(pbKey("moves"));
        localStorage.removeItem(pbKey("time"));
        setRecordBadges({moves: false, time: false});
        loadPBs();
    }

    function queueWinModal(records, elapsedSeconds) {
        const finalMoves = state.moves;
        clearWinModalTimer();
        state.winModalTimerId = window.setTimeout(() => {
            state.winModalTimerId = null;
            if (state.won) showWinModal(records, elapsedSeconds, finalMoves);
        }, CONFIG.winModalDelayMs);
    }

    function clearWinModalTimer() {
        if (!state.winModalTimerId) return;
        window.clearTimeout(state.winModalTimerId);
        state.winModalTimerId = null;
    }

    function showWinModal(records, elapsedSeconds, finalMoves) {
        els.finalMoves.textContent = String(finalMoves);
        els.finalTime.textContent = formatTime(elapsedSeconds);
        setRecordBadges(records);
        els.winModal.classList.remove("hidden");
        els.winModal.setAttribute("aria-hidden", "false");
    }

    function hideWinModal() {
        clearWinModalTimer();
        els.winModal.classList.add("hidden");
        els.winModal.setAttribute("aria-hidden", "true");
        setRecordBadges({moves: false, time: false});
    }

    function setRecordBadges(records) {
        els.movesRecordBadge.hidden = !records.moves;
        els.timeRecordBadge.hidden = !records.time;
        els.newRecordBadges.hidden = !records.moves && !records.time;
    }
})();
