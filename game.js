/* Codenames for Maybaah's Arcade.

   The page is deliberately dumb. It never deals a table, never decides whose
   turn it is and never learns which word belongs to whom unless the referee
   decides it is allowed to: the key arrives only in a spymaster's own frame,
   and only while they are seated as one. Everything here draws the last state
   the server sent and sends intents back.

   Two languages, two axes. The interface language is per person and lives in
   the URL, so a link carries it. The deck language belongs to the room and the
   host picks it before the game starts. */
(function () {
  "use strict";

  /* the deployed referee, or the one `wrangler dev` puts on 8787 when the page
     is being served from a laptop */
  var LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var API = LOCAL ? "http://localhost:8787" : "https://codenames-room.maybeez.workers.dev";
  var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // no I, O, 0, 1
  var CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

  /* ── words ── */

  var T = {
    en: {
      "nav.arcade": "← Arcade",
      "nav.board": "Leaderboard",
      "room.create": "Create lobby",
      "room.or": "or",
      "room.join": "Join",
      "room.you": "you",
      "room.copy": "Copy link",
      "room.copied": "Copied",
      "room.leave": "Leave",
      "room.deck": "deck",
      "room.hint": "Create a lobby and send the link. Four players at least: a spymaster and an operative on each side. The key lives on the server and only the two spymasters are ever sent it.",
      "room.code": "CODE",
      "room.name": "your name",
      "team.red": "Red",
      "team.blue": "Blue",
      "role.spymaster": "spymaster",
      "role.operatives": "operatives",
      "role.watching": "watching",
      "seat.spymaster": "Be spymaster",
      "seat.operative": "Join team",
      "seat.watch": "Sit out",
      "seat.start": "Start game",
      "seat.locked": "Seats are locked while a game is running.",
      "seat.ready": "Both teams are seated. The host starts the game.",
      "seat.waiting": "Each team needs a spymaster and at least one operative.",
      "clue.give": "Give clue",
      "clue.word": "clue",
      "clue.pass": "Pass",
      "clue.illegal": "Illegal clue",
      "clue.unlimited": "any number of words",
      "tool.reset": "New game",
      "tool.arcade": "Arcade",
      "st.noroom": "create a lobby or join one with a code",
      "st.connecting": "connecting…",
      "st.reconnecting": "reconnecting…",
      "st.lost": "connection lost, retrying…",
      "st.unreachable": "could not reach the room",
      "st.lobby": "pick a side and a role, then the host starts the game",
      "st.watching": "you are watching this one",
      "log.assassin": "the assassin",
      "log.cards": "all its words found",
      "color.red": "a red agent",
      "color.blue": "a blue agent",
      "color.neutral": "a bystander",
      "color.assassin": "the assassin",
      "warn.root": function (w) { return "careful: that looks like the same root as " + w + " on the table. Only a meaning link makes it legal."; },
      "warn.inside": function (w) { return "careful: " + w + " is on the table and your clue sounds like it. Legal only if the meaning really is shared."; },
      "warn.self": "that word is on the table",
      "penalty.mine": "Your team was owed a card. Turn over one of your own words before giving a clue.",
      "penalty.theirs": function (team) { return "The " + team + " spymaster turns over one of their own words before the next clue."; },
      "turn.clue.mine": "your clue",
      "turn.clue": function (team) { return team + " spymaster is thinking"; },
      "turn.guess": function (team) { return team + " is guessing"; },
      "turn.over": function (team, reason) { return team + " wins · " + reason; },
      "meta.guesses": function (n) { return n === 1 ? "one guess left" : n + " guesses left"; },
      "meta.unlimited": "guess as long as you keep hitting your own",
      "meta.mustguess": "name at least one word before you pass",
      "log.start": function (team) { return "new table dealt, " + team + " starts"; },
      "log.clue": function (name, team, word, count) { return name + " (" + team + ") · " + word + " " + count; },
      "log.reveal": function (name, word, color) { return name + " named " + word + " · " + color; },
      "log.pass": function (name) { return name + " passed the turn"; },
      "log.illegal": function (by, team) { return by + " called an illegal clue, " + team + " loses the turn"; },
      "log.free": function (name, word) { return name + " turned over " + word + " in compensation"; },
      "log.end": function (team, reason) { return team + " wins · " + reason; },
      err: {},
    },

    ru: {
      "nav.arcade": "← Аркада",
      "nav.board": "Таблица",
      "room.create": "Создать лобби",
      "room.or": "или",
      "room.join": "Войти",
      "room.you": "вы",
      "room.copy": "Копировать",
      "room.copied": "Скопировано",
      "room.leave": "Выйти",
      "room.deck": "колода",
      "room.hint": "Создайте лобби и отправьте ссылку. Игроков нужно минимум четверо: руководитель и хотя бы один игрок в каждой команде. Ключ хранится на сервере, и его получают только двое руководителей.",
      "room.code": "КОД",
      "room.name": "ваше имя",
      "team.red": "Красные",
      "team.blue": "Синие",
      "role.spymaster": "руководитель",
      "role.operatives": "игроки",
      "role.watching": "наблюдают",
      "seat.spymaster": "Стать руководителем",
      "seat.operative": "В команду",
      "seat.watch": "Наблюдать",
      "seat.start": "Начать игру",
      "seat.locked": "Пока идёт игра, места закреплены.",
      "seat.ready": "Обе команды собраны. Игру начинает хост.",
      "seat.waiting": "В каждой команде нужен руководитель и хотя бы один игрок.",
      "clue.give": "Дать шифр",
      "clue.word": "шифр",
      "clue.pass": "Передать ход",
      "clue.illegal": "Шифр не по правилам",
      "clue.unlimited": "любое количество слов",
      "tool.reset": "Новая игра",
      "tool.arcade": "Аркада",
      "st.noroom": "создайте лобби или войдите по коду",
      "st.connecting": "соединение…",
      "st.reconnecting": "переподключение…",
      "st.lost": "связь потеряна, пробуем снова…",
      "st.unreachable": "комната недоступна",
      "st.lobby": "выберите команду и роль, дальше игру начинает хост",
      "st.watching": "вы наблюдаете за этой партией",
      "log.assassin": "убийца",
      "log.cards": "все слова открыты",
      "color.red": "красный агент",
      "color.blue": "синий агент",
      "color.neutral": "нейтральное слово",
      "color.assassin": "убийца",
      "warn.root": function (w) { return "осторожно: похоже на однокоренное со словом " + w + " на столе. Такой шифр допустим только по смыслу."; },
      "warn.inside": function (w) { return "осторожно: на столе есть " + w + ", и шифр с ним созвучен. Допустимо, только если связь по смыслу."; },
      "warn.self": "это слово лежит на столе",
      "penalty.mine": "Вашей команде причитается слово. Откройте одно своё слово, прежде чем давать шифр.",
      "penalty.theirs": function (team) { return "Руководитель команды " + team + " открывает одно своё слово перед шифром."; },
      "turn.clue.mine": "ваш шифр",
      "turn.clue": function (team) { return "руководитель (" + team + ") думает"; },
      "turn.guess": function (team) { return "отгадывают " + team; },
      "turn.over": function (team, reason) { return "победа: " + team + " · " + reason; },
      "meta.guesses": function (n) { return "осталось попыток: " + n; },
      "meta.unlimited": "отгадывайте, пока открываете свои слова",
      "meta.mustguess": "перед передачей хода нужно назвать хотя бы одно слово",
      "log.start": function (team) { return "новый стол, первыми ходят " + team; },
      "log.clue": function (name, team, word, count) { return name + " (" + team + ") · " + word + " " + count; },
      "log.reveal": function (name, word, color) { return name + " называет " + word + " · " + color; },
      "log.pass": function (name) { return name + " передаёт ход"; },
      "log.illegal": function (by, team) { return by + " объявляет шифр неправильным, ход команды " + team + " закончен"; },
      "log.free": function (name, word) { return name + " открывает " + word + " в качестве компенсации"; },
      "log.end": function (team, reason) { return "побеждают " + team + " · " + reason; },

      /* The referee speaks one language. Its refusals are matched here so the
         player is told off in the language they chose. */
      err: {
        "no room with that code": "комнаты с таким кодом нет",
        "this room is full": "комната заполнена",
        "join first": "сначала войдите в комнату",
        "bad player id": "неверный идентификатор игрока",
        "bad frame": "испорченный пакет",
        "unknown message": "неизвестная команда",
        "seats are locked while a game is running": "пока идёт игра, места закреплены",
        "pick a team and a role": "выберите и команду, и роль",
        "that team already has a spymaster": "в этой команде уже есть руководитель",
        "only the host picks the deck": "колоду выбирает хост",
        "a game is already running": "игра уже идёт",
        "only the host starts the game": "игру начинает хост",
        "each team needs a spymaster and at least one operative": "в каждой команде нужен руководитель и хотя бы один игрок",
        "no game is running": "игра не идёт",
        "it is not your clue to give": "сейчас шифр даёте не вы",
        "your team is still guessing": "ваша команда ещё отгадывает",
        "turn over one of your own words first": "сначала откройте одно своё слово",
        "a clue is one word": "шифр это одно слово",
        "the number is 0 to 9": "число от 0 до 9",
        "that word is on the table": "это слово лежит на столе",
        "it is not your turn": "сейчас не ваш ход",
        "wait for your spymaster": "дождитесь шифра от руководителя",
        "no such card": "такой карты нет",
        "that card is already face up": "эта карта уже открыта",
        "there is nothing to pass on yet": "передавать пока нечего",
        "your team owes at least one guess": "нужно назвать хотя бы одно слово",
        "only a spymaster can call a clue": "объявить нарушение может только руководитель",
        "you gave that clue": "это ваш собственный шифр",
        "there is no clue on the table": "шифра на столе нет",
        "not your card to turn": "это не ваша карта",
        "nothing is owed to your team": "вашей команде ничего не причитается",
        "it has to be one of your own words": "открыть нужно своё слово",
        "only the host can reset the room": "сбросить комнату может только хост",
      },
    },
  };

  var lang = initialLang();

  function t(key) {
    var v = T[lang][key];
    if (v === undefined) v = T.en[key];
    return v === undefined ? key : v;
  }

  function tf(key) {
    var f = t(key);
    return typeof f === "function" ? f.apply(null, [].slice.call(arguments, 1)) : f;
  }

  function teamName(team) {
    return team === "red" ? t("team.red") : t("team.blue");
  }

  function serverError(reason) {
    var map = T[lang].err || {};
    return map[reason] || reason;
  }

  function initialLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "ru" || q === "en") return q;
    return (navigator.language || "en").toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  }

  /* ── state ── */
  var S = null;              // last frame from the referee
  var roomCode = null, roomIntent = "join";
  var ws = null, wantOpen = false, retry = 0, retryTimer = null;
  var seenRevealed = [];
  var cells = [];

  var el = {};
  ["board", "status", "log", "score", "teams", "bench", "share", "share-link", "join-code",
   "name-input", "deck-row", "deck-pills", "btn-start", "btn-reset", "clue-bar", "clue-form",
   "clue-view", "clue-text", "clue-meta", "clue-word", "clue-count", "clue-warn", "btn-pass",
   "btn-illegal", "penalty-note", "left-red", "left-blue", "turn-label", "count-red",
   "count-blue", "bench-hint", "spectators", "room-hint"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  for (var i = 0; i < 25; i++) {
    var b = document.createElement("button");
    b.className = "word";
    b.dataset.cell = String(i);
    b.setAttribute("role", "gridcell");
    el.board.appendChild(b);
    cells.push(b);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function me() { return S && S.you ? S.you : null; }
  function iAmHost() { return !!(S && me() && S.host === me().id); }

  /* ── static copy ── */
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var v = t(node.getAttribute("data-i18n"));
      if (typeof v === "string") node.textContent = v;
    });
    document.querySelectorAll("[data-rules]").forEach(function (node) {
      node.hidden = node.getAttribute("data-rules") !== lang;
    });
    document.querySelectorAll("#lang-switch .pill").forEach(function (p) {
      p.setAttribute("aria-pressed", String(p.dataset.lang === lang));
    });
    el["join-code"].placeholder = t("room.code");
    el["name-input"].placeholder = t("room.name");
    el["clue-word"].placeholder = t("clue.word");
    render();
  }

  function setLanguage(next) {
    if (next === lang) return;
    lang = next;
    var q = new URLSearchParams(location.search);
    q.set("lang", lang);
    history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash);
    applyLanguage();
  }

  /* ── render ── */
  function render() {
    var inRoom = !!roomCode;
    el.teams.hidden = !inRoom;
    el.bench.hidden = !inRoom;
    el.share.hidden = !inRoom;

    var live = !!(S && S.words && S.words.length);
    el.score.hidden = !live;
    el["clue-bar"].hidden = !live;
    el.log.hidden = !(S && S.log && S.log.length);
    el.board.style.display = live ? "grid" : "none";

    el["deck-row"].hidden = !(inRoom && iAmHost() && S && S.status !== "live");
    el["btn-start"].hidden = !(inRoom && iAmHost() && S && S.status !== "live");
    el["btn-reset"].hidden = !(inRoom && iAmHost() && S && S.status !== "lobby");

    if (S) {
      document.querySelectorAll("#deck-pills .pill").forEach(function (p) {
        p.setAttribute("aria-pressed", String(p.dataset.deck === S.lang));
      });
      el["btn-start"].disabled = !S.ready;
      renderTeams();
      renderBoard();
      renderClue();
      renderLog();
      el["left-red"].textContent = S.left.red;
      el["left-blue"].textContent = S.left.blue;
      el["turn-label"].textContent = turnText();
      el["count-red"].textContent = S.status === "lobby" ? "" : S.left.red;
      el["count-blue"].textContent = S.status === "lobby" ? "" : S.left.blue;
      el["bench-hint"].textContent = S.status === "live"
        ? t("seat.locked")
        : (S.ready ? t("seat.ready") : t("seat.waiting"));
    }
    el.status.textContent = statusText();
  }

  function turnText() {
    if (!S) return "";
    if (S.status === "over") {
      return tf("turn.over", teamName(S.winner), S.endReason === "assassin" ? t("log.assassin") : t("log.cards"));
    }
    if (S.status !== "live") return "";
    var mine = me() && me().team === S.turn;
    if (S.phase === "clue") {
      return mine && me().role === "spymaster" ? t("turn.clue.mine") : tf("turn.clue", teamName(S.turn));
    }
    return tf("turn.guess", teamName(S.turn));
  }

  function statusText() {
    if (!roomCode) return t("st.noroom");
    if (!S) return t("st.connecting");
    if (S.status === "lobby") return t("st.lobby");
    if (S.status === "live" && me() && !me().team) return t("st.watching");
    return "";
  }

  function renderTeams() {
    var groups = {
      "red-spymaster": [], "red-operatives": [], "blue-spymaster": [], "blue-operatives": [], spectators: [],
    };
    S.players.forEach(function (p) {
      if (p.team && p.role === "spymaster") groups[p.team + "-spymaster"].push(p);
      else if (p.team) groups[p.team + "-operatives"].push(p);
      else groups.spectators.push(p);
    });
    Object.keys(groups).forEach(function (id) {
      var node = document.getElementById(id);
      node.innerHTML = groups[id].map(function (p) {
        return '<li class="' + (p.here ? "here" : "") + (me() && p.id === me().id ? " mine" : "") + '">' +
          '<span class="dot"></span>' + esc(p.name) +
          (p.id === S.host ? ' <span class="crown">host</span>' : "") + "</li>";
      }).join("");
    });
    document.querySelectorAll("[data-seat]").forEach(function (btn) {
      btn.disabled = S.status === "live";
    });
  }

  function renderBoard() {
    var free = freeRevealMode();
    for (var i = 0; i < 25; i++) {
      var c = cells[i];
      var word = S.words[i] || "";
      c.textContent = word;
      var cls = "word";
      if (S.revealed[i]) {
        cls += " up " + S.colors[i];
        if (seenRevealed.length && !seenRevealed[i]) cls += " fresh";
      } else if (S.key) {
        cls += " peek-" + S.key[i];
      }
      var clickable = free
        ? S.key && S.key[i] === me().team && !S.revealed[i]
        : canGuess() && !S.revealed[i];
      if (clickable) cls += " live";
      c.className = cls;
      c.disabled = !clickable;
      c.setAttribute("aria-label", word + (S.revealed[i] ? ", " + t("color." + S.colors[i]) : ""));
    }
    seenRevealed = S.revealed.slice();
  }

  function canGuess() {
    var p = me();
    return !!(S && S.status === "live" && S.phase === "guess" && p && p.role === "operative" && p.team === S.turn);
  }

  /* the free card the referee owes a team after the other side gave an illegal
     clue: their spymaster turns it over themselves, so the board is briefly
     theirs to click */
  function freeRevealMode() {
    var p = me();
    return !!(S && S.status === "live" && p && p.role === "spymaster" &&
              S.penalty === p.team && S.turn === p.team);
  }

  function renderClue() {
    var p = me();
    var giving = !!(S.status === "live" && S.phase === "clue" && p && p.role === "spymaster" &&
                    p.team === S.turn && S.penalty !== p.team);
    el["clue-form"].hidden = !giving;
    el["clue-view"].hidden = !S.clue;
    el["btn-pass"].hidden = !canGuess();
    el["btn-pass"].disabled = !!(S.guessesMade === 0);
    el["btn-illegal"].hidden = !(S.status === "live" && S.phase === "guess" && p &&
                                 p.role === "spymaster" && p.team !== S.turn);

    if (S.clue) {
      el["clue-text"].innerHTML = esc(S.clue.word) + ' <span class="count">' +
        (S.clue.count === 0 ? "∞" : S.clue.count) + "</span>";
      el["clue-meta"].textContent = S.clue.count === 0
        ? t("meta.unlimited")
        : tf("meta.guesses", Math.max(0, S.guessesLeft)) +
          (S.guessesMade === 0 ? " · " + t("meta.mustguess") : "");
    }

    var note = "";
    if (S.penalty) {
      note = p && p.role === "spymaster" && S.penalty === p.team
        ? t("penalty.mine")
        : tf("penalty.theirs", teamName(S.penalty));
    }
    el["penalty-note"].textContent = note;
    el["penalty-note"].hidden = !note;
  }

  function renderLog() {
    if (!S.log) return;
    el.log.innerHTML = S.log.slice().reverse().map(function (e) {
      var team = e.team ? teamName(e.team) : "";
      var cls = e.team === "red" ? "red" : e.team === "blue" ? "blue" : "";
      var line;
      switch (e.t) {
        case "start": line = tf("log.start", team); break;
        case "clue": line = tf("log.clue", e.name, team, e.word, e.count === 0 ? "∞" : e.count); break;
        case "reveal":
          line = tf("log.reveal", e.name, e.word, t("color." + e.color));
          if (e.color === "assassin") cls = "kill";
          else if (e.color === "neutral") cls = "miss";
          else cls = e.color;
          break;
        case "pass": line = tf("log.pass", e.name); break;
        case "illegal": line = tf("log.illegal", teamName(e.by), team); break;
        case "free": line = tf("log.free", e.name, e.word); break;
        case "end":
          line = tf("log.end", team, e.reason === "assassin" ? t("log.assassin") : t("log.cards"));
          break;
        default: return "";
      }
      return '<div class="' + cls + '">' + esc(line) + "</div>";
    }).join("");
  }

  /* ── the clue the referee cannot judge ──
     Roots, rhymes and near misses are a human call, so the page only warns.
     A clue that is literally a word on the table is refused by the referee. */
  function checkClue() {
    var raw = el["clue-word"].value.trim();
    var warn = "";
    if (raw && S && S.words.length) {
      var clue = flat(raw);
      for (var i = 0; i < 25 && !warn; i++) {
        if (S.revealed[i]) continue;
        var w = flat(S.words[i]);
        if (!w) continue;
        if (w === clue) warn = t("warn.self");
        else if (shareRoot(clue, w)) warn = tf("warn.root", S.words[i]);
        else if (clue.length > 2 && w.length > 2 && (w.indexOf(clue) !== -1 || clue.indexOf(w) !== -1)) {
          warn = tf("warn.inside", S.words[i]);
        }
      }
    }
    el["clue-warn"].textContent = warn;
    el["clue-warn"].hidden = !warn;
  }

  function flat(s) {
    return String(s).toLowerCase().replace(/ё/g, "е").replace(/[\s'-]/g, "");
  }

  function shareRoot(a, b) {
    var n = Math.min(a.length, b.length, 5);
    if (n < 4) return false;
    return a.slice(0, n) === b.slice(0, n);
  }

  /* ── the socket ── */
  function randomCode() {
    var out = "";
    var buf = new Uint32Array(4);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    for (var i = 0; i < 4; i++) {
      var n = buf[i] || Math.floor(Math.random() * 4294967296);
      out += CODE_ALPHABET[n % CODE_ALPHABET.length];
    }
    return out;
  }

  function connect(code, intent) {
    disconnect();
    roomCode = code;
    roomIntent = intent || "join";
    wantOpen = true;
    location.hash = code;
    el["share-link"].textContent = shareLink(code);
    el["join-code"].value = code;
    openSocket();
    render();
  }

  function shareLink(code) {
    return location.origin + location.pathname + "?lang=" + lang + "#" + code;
  }

  function openSocket() {
    if (!wantOpen || !roomCode) return;
    el.status.textContent = retry ? t("st.reconnecting") : t("st.connecting");
    ws = new WebSocket(API.replace(/^http/, "ws") + "/room/" + roomCode);

    ws.onopen = function () {
      retry = 0;
      sendJoin();
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "error") { el.status.textContent = serverError(msg.reason); return; }
      if (msg.type !== "state") return;
      if (!S || !S.words || S.words.length !== msg.words.length) seenRevealed = [];
      S = msg;
      render();
    };

    /* The socket is the only way to reach the referee, so a drop has to be
       retried rather than silently ending the game. Backs off so a room that
       is genuinely gone stops being hammered. */
    ws.onclose = function () {
      ws = null;
      if (!wantOpen) return;
      retry = Math.min(retry + 1, 5);
      el.status.textContent = t("st.lost");
      retryTimer = setTimeout(openSocket, retry * 1000);
    };

    ws.onerror = function () { el.status.textContent = t("st.unreachable"); };
  }

  function sendJoin() {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({
      type: "join",
      intent: roomIntent,
      player: Arcade.playerId(),
      name: Arcade.getPlayer(),
    }));
  }

  function disconnect() {
    wantOpen = false;
    clearTimeout(retryTimer);
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
    else el.status.textContent = t("st.lost");
  }

  function leaveRoom() {
    disconnect();
    roomCode = null;
    S = null;
    seenRevealed = [];
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    el["join-code"].value = "";
    el.log.innerHTML = "";
    render();
  }

  /* ── input ── */
  document.getElementById("lang-switch").addEventListener("click", function (e) {
    var next = e.target.getAttribute("data-lang");
    if (next) setLanguage(next);
  });

  el["deck-pills"].addEventListener("click", function (e) {
    var deck = e.target.getAttribute("data-deck");
    if (deck) send({ type: "deck", lang: deck });
  });

  document.getElementById("btn-create").addEventListener("click", function () {
    connect(randomCode(), "create");
  });

  document.getElementById("btn-join").addEventListener("click", function () {
    var code = el["join-code"].value.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      el.status.textContent = t("room.code") + " · 4";
      return;
    }
    connect(code);
  });

  el["join-code"].addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("btn-join").click();
  });

  el["name-input"].addEventListener("change", function () {
    Arcade.setPlayer(el["name-input"].value);
    el["name-input"].value = Arcade.getPlayer();
    sendJoin();
  });

  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = document.getElementById("btn-copy");
    var link = el["share-link"].textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        btn.textContent = t("room.copied");
        setTimeout(function () { btn.textContent = t("room.copy"); }, 1400);
      }, function () {});
    }
  });

  document.getElementById("btn-leave").addEventListener("click", leaveRoom);

  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-seat]") : null;
    if (!btn) return;
    var seat = btn.getAttribute("data-seat");
    if (seat === "none") send({ type: "seat", team: null, role: null });
    else send({ type: "seat", team: seat.split(":")[0], role: seat.split(":")[1] });
  });

  el["btn-start"].addEventListener("click", function () { send({ type: "start" }); });
  el["btn-reset"].addEventListener("click", function () { send({ type: "reset" }); });
  el["btn-pass"].addEventListener("click", function () { send({ type: "pass" }); });
  el["btn-illegal"].addEventListener("click", function () { send({ type: "illegal" }); });

  document.getElementById("btn-clue").addEventListener("click", giveClue);
  el["clue-word"].addEventListener("input", checkClue);
  el["clue-word"].addEventListener("keydown", function (e) {
    if (e.key === "Enter") giveClue();
  });

  function giveClue() {
    var word = el["clue-word"].value.trim();
    if (!word) return;
    send({ type: "clue", word: word, count: Number(el["clue-count"].value) });
    el["clue-word"].value = "";
    checkClue();
  }

  el.board.addEventListener("click", function (e) {
    var t2 = e.target.closest(".word");
    if (!t2 || t2.disabled) return;
    var cell = Number(t2.dataset.cell);
    send({ type: freeRevealMode() ? "free" : "guess", cell: cell });
  });

  window.addEventListener("hashchange", function () {
    var code = (location.hash || "").slice(1).toUpperCase();
    if (CODE_RE.test(code) && code !== roomCode) connect(code);
  });

  window.addEventListener("beforeunload", disconnect);

  /* ── boot ── */
  el["name-input"].value = Arcade.getPlayer();
  applyLanguage();

  var initial = (location.hash || "").slice(1).toUpperCase();
  if (CODE_RE.test(initial)) connect(initial);

  /* exposed for the staging checks */
  window.__codenames = {
    state: function () { return S; },
    room: function () { return roomCode; },
    connect: connect,
    send: send,
    lang: function (next) { if (next) setLanguage(next); return lang; },
  };
})();
