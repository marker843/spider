# One-Suit Spider Solitaire

A dependency-free, static Spider Solitaire game for GitHub Pages.

## Features

- One suit only: all cards are black spades.
- 104-card Spider deck: eight copies of A through K.
- Standard Spider tableau deal: 54 cards dealt into 10 columns, with 50 cards left in the stock.
- Smart click to move: click any bright movable card or ordered stack and the game chooses a legal destination.
- Smooth slide animation after card and stack moves, especially smart-click moves.
- Manual drag-and-drop: drag a bright card/stack when you want to choose the destination yourself.
- Empty columns accept any card or ordered stack.
- Blocked cards are grayed out, not transparent, when the cards below them do not form a descending run.
- Moves and time tracking only. No score.
- New Game starts immediately without a confirmation prompt.
- Undo and Hint buttons sit beside the draw pile.
- Hint button highlights the source stack and destination column without moving anything.
- Complete K-Q-J-10-9-8-7-6-5-4-3-2-A runs are automatically removed.
- Smart-clicked and dragged moves slide into place so the destination is clearer.

## Files

- `index.html` - page structure
- `style.css` - layout and card styling
- `script.js` - game logic

## Local play on macOS

Open `index.html` in a modern browser, or serve the folder locally:

```bash
cd spider-solitaire-one-suit
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages deployment

1. Create a new GitHub repository, for example `spider-solitaire-one-suit`.
2. Put these files at the repository root:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
3. Commit and push to `main`.
4. In GitHub, open the repository and go to **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
6. Select branch **main** and folder **/(root)**, then click **Save**.
7. Visit `https://YOUR-GITHUB-USERNAME.github.io/spider-solitaire-one-suit/` after the Pages deployment finishes.

## Optional rule tweak

By default, the game uses the standard Spider rule that you cannot deal from the stock while a tableau column is empty. To allow dealing even with empty columns, open `script.js` and change:

```js
requireFullColumnsBeforeDeal: true,
```

to:

```js
requireFullColumnsBeforeDeal: false,
```
