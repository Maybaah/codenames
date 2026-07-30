/* Codenames rooms: Cloudflare Worker + Durable Objects.

   Same referee model as tictactoe-match and chess-match, with one extra job.
   There the object owns the board because two clients cannot agree on one; here
   it owns the board because half the table is not allowed to see it. The key
   never leaves this object except down the sockets of the two spymasters, so an
   operative with the developer tools open has nothing to open them on.

   Nothing is ranked, so nothing is stored past the life of a room. There is no
   D1 binding and no board. When a room goes quiet an alarm wipes it. */
"use strict";

import { DECKS } from "./words.js";

const ALLOWED_ORIGINS = [
  "https://maybaah.github.io",
  "http://localhost:8621",
  "http://127.0.0.1:8621",
];

const PROTOCOL = 1;
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;
const IDLE_MS = 60 * 60 * 1000;
const MAX_FRAME = 2048;
const MAX_PLAYERS = 24;
const LOG_MAX = 60;
const CHAT_MAX = 50;
const CHAT_TEXT_MAX = 200;

const CLUE_RE = /^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u;
const NAME_STRIP = /[^\p{L}\p{N} ._-]/gu;

const RED = "red";
const BLUE = "blue";
const other = (team) => (team === RED ? BLUE : RED);

function freshRoom(lang) {
  return {
    lang: lang === "ru" ? "ru" : "en",
    status: "lobby",
    words: [],
    key: [],
    revealed: [],
    starter: RED,
    turn: RED,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    guessesMade: 0,
    winner: null,
    endReason: null,
    penalty: null,
    players: {},
    order: [],
    host: null,
    round: 0,
    log: [],
    chat: { all: [], red: [], blue: [] },
    votes: {},
  };
}

function rand(n) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

/* The starting team gets nine cards and the second eight, which is the whole
   handicap for moving first. Seven bystanders and one assassin fill the rest. */
function deal(lang) {
  const deck = DECKS[lang] || DECKS.en;
  const words = shuffle(deck.slice()).slice(0, 25);
  const starter = rand(2) === 0 ? RED : BLUE;
  const key = [];
  for (let i = 0; i < 9; i++) key.push(starter);
  for (let i = 0; i < 8; i++) key.push(other(starter));
  for (let i = 0; i < 7; i++) key.push("neutral");
  key.push("assassin");
  return { words, key: shuffle(key), starter };
}

/* Ё and Е are the same letter as far as a table is concerned, and a hyphen or
   an apostrophe is decoration. Clues are compared after both are gone. */
function normalize(word) {
  return String(word).toLowerCase().replace(/ё/g, "е").replace(/[\s'-]/g, "");
}

function remaining(room, team) {
  let n = 0;
  for (let i = 0; i < room.key.length; i++) {
    if (room.key[i] === team && !room.revealed[i]) n++;
  }
  return n;
}

function rosterOf(room) {
  const t = {
    red: { spymaster: null, operatives: 0 },
    blue: { spymaster: null, operatives: 0 },
  };
  for (const id of room.order) {
    const p = room.players[id];
    if (!p || !p.team) continue;
    if (p.role === "spymaster") t[p.team].spymaster = id;
    else if (p.role === "operative") t[p.team].operatives++;
  }
  return t;
}

function teamsReady(room) {
  const t = rosterOf(room);
  return !!t.red.spymaster && !!t.blue.spymaster && t.red.operatives >= 1 && t.blue.operatives >= 1;
}

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;
  }

  async load() {
    if (!this.room) {
      this.room = (await this.state.storage.get("room")) || freshRoom("en");
    }
    /* rooms saved before the room channel existed have a two-key chat */
    const c = this.room.chat;
    if (!c || !Array.isArray(c.all)) {
      this.room.chat = {
        all: [],
        red: c && Array.isArray(c.red) ? c.red : [],
        blue: c && Array.isArray(c.blue) ? c.blue : [],
      };
    }
    if (!this.room.votes) this.room.votes = {};
    return this.room;
  }

  async save() {
    await this.state.storage.put("room", this.room);
    await this.state.storage.setAlarm(Date.now() + IDLE_MS);
  }

  /* an abandoned room forgets itself, so a four-character code is never held
     hostage by a game nobody came back to */
  async alarm() {
    if (this.state.getWebSockets().length === 0) {
      await this.state.storage.deleteAll();
      this.room = null;
    } else {
      await this.state.storage.setAlarm(Date.now() + IDLE_MS);
    }
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /* The one frame in this game that is not the same for everybody. Operatives
     get the words and whatever has already been turned over; the key rides
     along only for the two spymasters, and for everyone once the game is
     finished and there is nothing left to protect.

     `closing` is the socket a close handler is running for. It is still in
     getWebSockets() at that point, so without excluding it the room is told
     someone who just left is still present. */
  onlineIds(closing) {
    const online = new Set();
    for (const ws of this.state.getWebSockets()) {
      if (ws === closing) continue;
      const att = ws.deserializeAttachment();
      if (att && att.id) online.add(att.id);
    }
    return online;
  }

  push(closing) {
    const m = this.room;
    const live = this.state.getWebSockets().filter((s) => s !== closing);
    const online = this.onlineIds(closing);
    const voters = this.voters(m, online);
    const tally = new Array(25).fill(0);
    for (const v of voters) {
      const cell = m.votes[v];
      if (Number.isInteger(cell) && cell >= 0 && cell < 25) tally[cell]++;
    }

    const shared = {
      type: "state",
      v: PROTOCOL,
      lang: m.lang,
      status: m.status,
      words: m.words,
      revealed: m.revealed,
      colors: m.key.map((c, i) => (m.revealed[i] ? c : null)),
      turn: m.turn,
      phase: m.phase,
      clue: m.clue,
      guessesLeft: m.guessesLeft,
      guessesMade: m.guessesMade,
      starter: m.starter,
      winner: m.winner,
      endReason: m.endReason,
      penalty: m.penalty,
      left: { red: remaining(m, RED), blue: remaining(m, BLUE) },
      votes: tally,
      need: voters.length,
      host: m.host,
      round: m.round,
      ready: teamsReady(m),
      players: m.order.map((id) => {
        const p = m.players[id];
        return { id, name: p.name, team: p.team, role: p.role, here: online.has(id) };
      }),
      log: m.log.slice(-LOG_MAX),
    };

    for (const ws of live) {
      const att = ws.deserializeAttachment() || {};
      const p = att.id ? m.players[att.id] : null;
      const showKey = m.status === "over" || (p && p.role === "spymaster");
      /* Two channels. The room channel goes to everyone who joined, spectators
         and spymasters included, because otherwise half the table has no way to
         say anything. The team channel is for an operative and their teammates
         only: the spymaster is walled off so they cannot nudge a guess, and the
         other team never sees it. */
      const chat = {
        all: m.chat.all,
        team: p && p.role === "operative" && p.team ? m.chat[p.team] : null,
      };
      let frame;
      try {
        frame = JSON.stringify(Object.assign({
          you: p ? { id: att.id, name: p.name, team: p.team, role: p.role } : null,
          key: showKey && m.key.length ? m.key : null,
          chat,
          vote: att.id && Number.isInteger(m.votes[att.id]) ? m.votes[att.id] : null,
        }, shared));
      } catch { continue; }
      try { ws.send(frame); } catch { /* socket already gone; webSocketClose tidies up */ }
    }
  }

  fail(ws, reason) {
    try { ws.send(JSON.stringify({ type: "error", reason })); } catch {}
  }

  note(m, entry) {
    m.log.push(entry);
    if (m.log.length > LOG_MAX) m.log.splice(0, m.log.length - LOG_MAX);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_FRAME) return this.fail(ws, "bad frame");
    let msg;
    try { msg = JSON.parse(raw); } catch { return this.fail(ws, "bad frame"); }
    if (!msg || typeof msg !== "object") return this.fail(ws, "bad frame");

    const m = await this.load();
    if (msg.type === "join") return this.onJoin(ws, msg, m);

    const att = ws.deserializeAttachment();
    if (!att || !att.id || !m.players[att.id]) return this.fail(ws, "join first");
    const id = att.id;

    switch (msg.type) {
      case "seat": return this.onSeat(ws, msg, m, id);
      case "deck": return this.onDeck(ws, msg, m, id);
      case "start": return this.onStart(ws, m, id);
      case "clue": return this.onClue(ws, msg, m, id);
      case "guess": return this.onGuess(ws, msg, m, id);
      case "pass": return this.onPass(ws, m, id);
      case "chat": return this.onChat(ws, msg, m, id);
      case "illegal": return this.onIllegal(ws, m, id);
      case "free": return this.onFree(ws, msg, m, id);
      case "reset": return this.onReset(ws, m, id);
      default: return this.fail(ws, "unknown message");
    }
  }

  async onJoin(ws, msg, m) {
    const id = typeof msg.player === "string" ? msg.player.slice(0, 64) : "";
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return this.fail(ws, "bad player id");
    const name = String(msg.name || "").replace(NAME_STRIP, "").trim().slice(0, 16) || "player";

    if (!m.players[id]) {
      /* Rooms are addressed by name, so every code names a room whether or not
         anyone made one. Without this a typo would quietly seat you alone in
         WXYZ and look identical to waiting for your friends. */
      if (msg.intent === "join" && m.order.length === 0) {
        return this.fail(ws, "no room with that code");
      }
      if (m.order.length >= MAX_PLAYERS) return this.fail(ws, "this room is full");
      m.players[id] = { name, team: null, role: null };
      m.order.push(id);
      if (!m.host) m.host = id;
    } else {
      m.players[id].name = name;
    }

    ws.serializeAttachment({ id });
    await this.save();
    this.push();
  }

  /* Seats move in the lobby and nowhere else. Once a game is live an operative
     who could promote themselves would be one click away from the key, and a
     spymaster who could change teams would carry it across the table. Once it
     is over the key is public and the winner is known, so a seat change is
     either someone joining the side that just won or the table quietly
     reshuffling itself between rounds. The host opens the seats again with a
     reset. */
  async onSeat(ws, msg, m, id) {
    if (m.status === "live") return this.fail(ws, "seats are locked while a game is running");
    if (m.status === "over") return this.fail(ws, "seats stay as they were until the host resets the room");
    const team = msg.team === RED || msg.team === BLUE ? msg.team : null;
    const role = msg.role === "spymaster" || msg.role === "operative" ? msg.role : null;
    if (!team !== !role) return this.fail(ws, "pick a team and a role");

    if (team && role === "spymaster") {
      const taken = rosterOf(m)[team].spymaster;
      if (taken && taken !== id) return this.fail(ws, "that team already has a spymaster");
    }
    m.players[id].team = team;
    m.players[id].role = role;
    await this.save();
    this.push();
  }

  async onDeck(ws, msg, m, id) {
    if (m.host !== id) return this.fail(ws, "only the host picks the deck");
    if (m.status === "live") return this.fail(ws, "a game is already running");
    m.lang = msg.lang === "ru" ? "ru" : "en";
    await this.save();
    this.push();
  }

  async onStart(ws, m, id) {
    if (m.host !== id) return this.fail(ws, "only the host starts the game");
    if (m.status === "live") return this.fail(ws, "a game is already running");
    if (!teamsReady(m)) return this.fail(ws, "each team needs a spymaster and at least one operative");

    const d = deal(m.lang);
    m.words = d.words;
    m.key = d.key;
    m.revealed = new Array(25).fill(false);
    m.starter = d.starter;
    m.turn = d.starter;
    m.phase = "clue";
    m.clue = null;
    m.guessesLeft = 0;
    m.guessesMade = 0;
    m.winner = null;
    m.endReason = null;
    m.penalty = null;
    m.status = "live";
    m.round++;
    m.log = [];
    /* the team channels argued about a board that no longer exists; the room
       channel is the table talking to itself and outlives the game */
    m.chat.red = [];
    m.chat.blue = [];
    m.votes = {};
    this.note(m, { t: "start", team: d.starter, lang: m.lang });
    await this.save();
    this.push();
  }

  async onClue(ws, msg, m, id) {
    const p = m.players[id];
    if (m.status !== "live") return this.fail(ws, "no game is running");
    if (p.role !== "spymaster" || p.team !== m.turn) return this.fail(ws, "it is not your clue to give");
    if (m.phase !== "clue") return this.fail(ws, "your team is still guessing");
    if (m.penalty === p.team) return this.fail(ws, "turn over one of your own words first");

    const word = String(msg.word || "").trim();
    const count = msg.count;
    if (!word || word.length > 24 || !CLUE_RE.test(word)) return this.fail(ws, "a clue is one word");
    if (!Number.isInteger(count) || count < 0 || count > 9) return this.fail(ws, "the number is 0 to 9");

    /* The only rule a machine can settle. Roots, rhymes and near misses are
       for the other spymaster to call, which is what the illegal button is. */
    const flat = normalize(word);
    for (let i = 0; i < 25; i++) {
      if (!m.revealed[i] && normalize(m.words[i]) === flat) {
        return this.fail(ws, "that word is on the table");
      }
    }

    m.clue = { word: word.slice(0, 24), count, team: p.team };
    m.guessesLeft = count === 0 ? 25 : count + 1;
    m.guessesMade = 0;
    m.phase = "guess";
    m.votes = {};
    this.note(m, { t: "clue", team: p.team, name: p.name, word: m.clue.word, count });
    await this.save();
    this.push();
  }

  /* A click is a vote, not a guess. The card turns over only once every
     operative on the guessing team is pointing at the same one, so nobody can
     burn their team's turn on a card the rest of the table was still arguing
     about. Clicking your own vote again takes it back. A team of one is
     unanimous on its own, which is the old behaviour. */
  async onGuess(ws, msg, m, id) {
    const p = m.players[id];
    if (m.status !== "live") return this.fail(ws, "no game is running");
    if (p.role !== "operative" || p.team !== m.turn) return this.fail(ws, "it is not your turn");
    if (m.phase !== "guess") return this.fail(ws, "wait for your spymaster");

    const cell = msg.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 24) return this.fail(ws, "no such card");
    if (m.revealed[cell]) return this.fail(ws, "that card is already face up");

    if (m.votes[id] === cell) delete m.votes[id];
    else m.votes[id] = cell;

    const agreed = this.consensus(m, this.onlineIds());
    if (agreed !== -1) this.reveal(m, agreed, p.name);
    await this.save();
    this.push();
  }

  /* who the vote is waiting on: the seated operatives of the guessing team who
     are still connected. A teammate whose laptop slept does not get a veto. */
  voters(m, online) {
    if (m.status !== "live" || m.phase !== "guess") return [];
    const out = [];
    for (const id of m.order) {
      const p = m.players[id];
      if (p && p.role === "operative" && p.team === m.turn && online.has(id)) out.push(id);
    }
    return out;
  }

  consensus(m, online) {
    const voters = this.voters(m, online);
    if (!voters.length) return -1;
    const first = m.votes[voters[0]];
    if (!Number.isInteger(first) || m.revealed[first]) return -1;
    for (const id of voters) if (m.votes[id] !== first) return -1;
    return first;
  }

  reveal(m, cell, name) {
    m.votes = {};
    m.revealed[cell] = true;
    m.guessesMade++;
    m.guessesLeft--;
    const color = m.key[cell];
    this.note(m, { t: "reveal", team: m.turn, name, word: m.words[cell], color });

    if (color === "assassin") {
      this.finish(m, other(m.turn), "assassin");
    } else {
      const cleared = this.clearedTeam(m);
      if (cleared) this.finish(m, cleared, "cards");
      else if (color !== m.turn || m.guessesLeft <= 0) this.endTurn(m);
    }
  }

  /* Official rule, kept: a team has to name at least one word before it can
     hand the turn back. */
  async onPass(ws, m, id) {
    const p = m.players[id];
    if (m.status !== "live") return this.fail(ws, "no game is running");
    if (p.role !== "operative" || p.team !== m.turn) return this.fail(ws, "it is not your turn");
    if (m.phase !== "guess") return this.fail(ws, "there is nothing to pass on yet");
    if (m.guessesMade === 0) return this.fail(ws, "your team owes at least one guess");
    this.note(m, { t: "pass", team: m.turn, name: p.name });
    this.endTurn(m);
    await this.save();
    this.push();
  }

  /* Two channels, one handler. The room channel takes anyone who joined. The
     team channel takes a seated operative only, and the frame carrying it back
     out goes to that team's operatives alone (see push). The spymaster giving
     the clue never sees it, which is the whole point: the clue is the only
     thing they are allowed to say to their operatives.

     A spymaster can still talk in the room channel, so their name is stamped
     with the seat they hold: a table reading it knows the person typing is
     looking at the key. */
  async onChat(ws, msg, m, id) {
    const p = m.players[id];
    const room = msg.channel !== "team";
    if (!room && (p.role !== "operative" || !p.team)) {
      return this.fail(ws, "only seated operatives have a team chat");
    }
    const raw = String(msg.text || "");
    let text = "";
    for (const ch of raw) { const c = ch.codePointAt(0); if (c >= 32 && c !== 127) text += ch; }
    text = text.trim().slice(0, CHAT_TEXT_MAX);
    if (!text) return;

    const entry = { name: p.name, text };
    if (room) {
      if (p.team) entry.team = p.team;
      if (p.role === "spymaster") entry.sm = 1;
    }
    const line = room ? m.chat.all : m.chat[p.team];
    line.push(entry);
    if (line.length > CHAT_MAX) line.splice(0, line.length - CHAT_MAX);
    await this.save();
    this.push();
  }

  /* Only a human can judge a clue, so only a human calls it: the spymaster on
     the other side of the table. Their team's turn starts owing them one free
     card, which their spymaster turns over before giving a clue. */
  async onIllegal(ws, m, id) {
    const p = m.players[id];
    if (m.status !== "live") return this.fail(ws, "no game is running");
    if (p.role !== "spymaster") return this.fail(ws, "only a spymaster can call a clue");
    if (p.team === m.turn) return this.fail(ws, "you gave that clue");
    if (m.phase !== "guess") return this.fail(ws, "there is no clue on the table");

    this.note(m, { t: "illegal", team: m.turn, by: p.team, word: m.clue ? m.clue.word : "" });
    m.penalty = p.team;
    this.endTurn(m);
    await this.save();
    this.push();
  }

  async onFree(ws, msg, m, id) {
    const p = m.players[id];
    if (m.status !== "live") return this.fail(ws, "no game is running");
    if (p.role !== "spymaster" || p.team !== m.turn) return this.fail(ws, "not your card to turn");
    if (m.penalty !== p.team) return this.fail(ws, "nothing is owed to your team");

    const cell = msg.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 24) return this.fail(ws, "no such card");
    if (m.revealed[cell]) return this.fail(ws, "that card is already face up");
    if (m.key[cell] !== p.team) return this.fail(ws, "it has to be one of your own words");

    m.revealed[cell] = true;
    m.penalty = null;
    this.note(m, { t: "free", team: p.team, name: p.name, word: m.words[cell] });
    const cleared = this.clearedTeam(m);
    if (cleared) this.finish(m, cleared, "cards");
    await this.save();
    this.push();
  }

  async onReset(ws, m, id) {
    if (m.host !== id) return this.fail(ws, "only the host can reset the room");
    m.status = "lobby";
    m.words = [];
    m.key = [];
    m.revealed = [];
    m.clue = null;
    m.guessesLeft = 0;
    m.guessesMade = 0;
    m.winner = null;
    m.endReason = null;
    m.penalty = null;
    m.phase = "clue";
    m.chat.red = [];
    m.chat.blue = [];
    m.votes = {};
    await this.save();
    this.push();
  }

  clearedTeam(m) {
    if (remaining(m, RED) === 0) return RED;
    if (remaining(m, BLUE) === 0) return BLUE;
    return null;
  }

  endTurn(m) {
    m.turn = other(m.turn);
    m.phase = "clue";
    m.clue = null;
    m.guessesLeft = 0;
    m.guessesMade = 0;
    m.votes = {};
  }

  finish(m, winner, reason) {
    m.votes = {};
    m.status = "over";
    m.winner = winner;
    m.endReason = reason;
    m.clue = null;
    m.phase = "clue";
    m.guessesLeft = 0;
    this.note(m, { t: "end", team: winner, reason });
  }

  /* The host is whoever is still here. Losing the only person who can start a
     game because their laptop slept would end the room. */
  async handoff(closing) {
    const m = await this.load();
    const online = this.onlineIds(closing);
    let dirty = false;

    if (m.host && !online.has(m.host)) {
      const next = m.order.find((id) => online.has(id));
      if (next) {
        m.host = next;
        dirty = true;
      }
    }

    /* Someone leaving mid-vote drops their say, and the table they left behind
       may already agree, so the tally is settled here too rather than waiting
       for a teammate to click something twice. */
    for (const id of Object.keys(m.votes)) {
      if (!online.has(id)) { delete m.votes[id]; dirty = true; }
    }
    const agreed = this.consensus(m, online);
    if (agreed !== -1) {
      const who = this.voters(m, online).find((id) => m.votes[id] === agreed);
      this.reveal(m, agreed, who ? m.players[who].name : "");
      dirty = true;
    }

    if (dirty) await this.save();
    this.push(closing);
  }

  async webSocketClose(ws) { await this.handoff(ws); }
  async webSocketError(ws) { await this.handoff(ws); }
}

function allowed(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("origin") || "";

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, v: PROTOCOL }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": allowed(origin) ? origin : ALLOWED_ORIGINS[0],
        },
      });
    }

    const hit = url.pathname.match(/^\/room\/([A-Za-z0-9]{1,8})$/);
    if (!hit) return new Response("not found", { status: 404 });

    const code = hit[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response("bad room code", { status: 400 });

    /* A WebSocket handshake never gets a CORS preflight, so the browser will
       not stop a page on another origin from opening one. This check is the
       only gate there is. */
    if (!allowed(origin)) return new Response("forbidden origin", { status: 403 });
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
  },
};
