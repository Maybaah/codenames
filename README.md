# Codenames

Two teams, twenty five words, one word clues. Cabinet 09 of
[Maybaah's Arcade](https://maybaah.github.io/arcade/), live at
[maybaah.github.io/codenames/](https://maybaah.github.io/codenames/).

English and Russian decks. The interface language is per person and lives in
the URL (`?lang=ru`), so a shared link carries it; the deck language belongs to
the room and the host picks it before the game starts.

## How a room works

Create a lobby, send the link. Four players at least: a spymaster and at least
one operative on each side. Everyone else can sit out and watch.

Seats move in the lobby and nowhere else. Once a game is live an operative who
could promote themselves would be one click away from the key. Once it is over
the key is public and the winner is known, so a seat change is either somebody
joining the side that just won or the table quietly reshuffling itself between
rounds. The host opens the seats again with a reset.

Two chat channels. The room channel takes anyone who joined, spectators and
spymasters included, and a spymaster's name is stamped so the table knows the
person typing is looking at the key. The team channel takes a seated operative
only, and the referee sends it back out to that team's operatives alone: the
spymaster is walled off, because the clue is the only thing they are allowed to
say to their operatives. A new game clears the team channels and keeps the room
one.

A spymaster gives one word and one number. Their team names words by clicking
them: their own colour keeps the turn alive, a bystander or an enemy word ends
it, the assassin ends the game. Turn over all your own words first and you win.

A click is a vote rather than a guess. Each card shows how many operatives on
the guessing team have picked it, and the referee turns it over only when all
of them have picked the same card; clicking your own pick again takes it back.
Operatives who drop out stop being counted, so one closed tab cannot freeze a
turn, and a team of one plays exactly as it did before.

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

## Watching a room

`/codenames/admin/` is unlinked and `noindex`, and asks for a token before it
shows anything. With one it lists the live rooms and will attach to any of
them: the whole key, both team channels, the room channel, who voted for what
and the full log.

The token is a Worker secret, not a row in a database. `codenames-room` has no
database binding by design, and giving it one so it could read a password would
hand the room referee a connection to the arcade's scores for no other reason.
Secrets are encrypted at rest, set out of band and never in this repository:

```bash
cd worker && npx wrangler secret put ADMIN_TOKEN     # deployed
echo 'ADMIN_TOKEN=...' > worker/.dev.vars            # wrangler dev, gitignored
```

Without it the page is refused rather than open.

Watching is a socket, not a role. It carries no player id, so it never appears
in the roster, never takes a seat and never votes, and a room with one attached
says so on the page. An owner can watch a game or play in it, not both down the
same connection.

Five wrong tokens shut the gate for five minutes. The count lives in the
directory object rather than in a room, so it is five in total and not five per
four-character code, and the comparison reads both strings to the end so a
refusal does not say how much of the guess was right.

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
