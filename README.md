# Codenames

Two teams, twenty five words, one word clues. Cabinet 09 of
[Maybaah's Arcade](https://maybaah.github.io/arcade/), live at
[maybaah.github.io/codenames/](https://maybaah.github.io/codenames/).

English and Russian decks. The interface language is per person and lives in
the URL (`?lang=ru`), so a shared link carries it; the deck language belongs to
the room and the host picks it before the game starts.

## How a room works

Create a lobby, send the link. Four players at least: a spymaster and at least
one operative on each side. Everyone else can sit out and watch. Seats are
locked once a game starts, because an operative who could promote themselves
would be one click away from the key.

A spymaster gives one word and one number. Their team names words by clicking
them: their own colour keeps the turn alive, a bystander or an enemy word ends
it, the assassin ends the game. Turn over all your own words first and you win.

## Why the server deals

Every other cabinet in the arcade proves a run after the fact: the page submits
a seed and a move tape and a Worker replays it. That model has nothing to say
here. Half the table is not allowed to see the board, and there is no tape.

So this is a referee, like `tictactoe-match` and `chess-match`, with one extra
job. A Durable Object per room owns the words, the key and whose turn it is.
Every socket gets its own frame, and the key rides along only for the two
spymasters, and for everybody once the game is finished. An operative reading
the page source, the network tab or the console gets exactly as far as reading
the back of a card.

Nothing here is ranked, so nothing is stored. There is no database and no
leaderboard. An idle room is wiped by an alarm an hour later.

## The one rule a machine can enforce

The referee refuses a clue that is literally a word still face up on the table,
comparing with Ё folded into Е and hyphens dropped. It cannot judge roots,
rhymes or near misses, so the page only warns about them, and the call belongs
to the other spymaster: their **Illegal clue** button ends the offending team's
turn on the spot and owes their own team one free card, which their spymaster
turns over before giving the next clue.

## Files

| Path | What it is |
| :-- | :-- |
| `index.html` | The page. Design system loaded from `/assets/`, rules in both languages |
| `game.js` | Client: the interface dictionary, the socket, the renderer |
| `worker/src/index.js` | Worker plus the `Room` Durable Object, the referee |
| `worker/src/words.js` | The two decks, server side only |

## Running it

The page is static, so any server rooted at the site will do. The referee:

```bash
cd worker && npx wrangler dev
```

The client points at `localhost:8787` whenever the page itself is served from
localhost, so nothing has to be edited to try a change. Deploying is separate
from the Pages deploy:

```bash
cd worker && npx wrangler deploy
```

No build step, no framework, no dependencies on the page.
