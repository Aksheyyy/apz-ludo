# APZ Ludo — Architecture & Implementation Guide

A small, real-time, online Ludo game for **you + up to 3 friends (4 players max)**.

> Design philosophy for this project: **simplest thing that works for 4 players.**
> No Docker, no Kubernetes, no Redis, no queues, no microservices. One Express
> process, one Postgres database, one Vue SPA. Live game state lives in server
> memory; Postgres stores users and room metadata.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Database Schema](#2-database-schema)
3. [Folder Structure](#3-folder-structure)
4. [API Design (REST)](#4-api-design-rest)
5. [Socket.IO Event Design](#5-socketio-event-design)
6. [Vue Component Hierarchy](#6-vue-component-hierarchy)
7. [State Management (Pinia)](#7-state-management-pinia)
8. [Authentication Flow](#8-authentication-flow)
9. [Room Lifecycle Flow](#9-room-lifecycle-flow)
10. [Game Engine & Anti-Cheat](#10-game-engine--anti-cheat)
11. [PostgreSQL on Render — Setup Guide](#11-postgresql-on-render--setup-guide)
12. [Connecting with DBeaver](#12-connecting-with-dbeaver)
13. [Migrations & Seed Data](#13-migrations--seed-data)
14. [Render Backend Deployment](#14-render-backend-deployment)
15. [Netlify Frontend Deployment](#15-netlify-frontend-deployment)
16. [Step-by-Step Implementation Plan](#16-step-by-step-implementation-plan)

---

## 1. High-Level Architecture

```
                          ┌─────────────────────────────────────┐
                          │            Browser (SPA)             │
                          │  Vue 3 + Composition API + Pug       │
                          │  Tailwind · Pinia · Vue Router       │
                          │  Socket.IO client                    │
                          └───────────────┬─────────────────────┘
                                          │
                  HTTPS (REST: auth,      │   WebSocket (Socket.IO:
                  rooms)                  │   game events, real-time)
                                          │
                          ┌───────────────▼─────────────────────┐
                          │      Render Web Service (Node)        │
                          │  Express  ──────────  Socket.IO srv   │
                          │  ┌────────────┐    ┌───────────────┐  │
                          │  │ REST API   │    │ Game Manager  │  │
                          │  │ /auth /room│    │ (in-memory)   │  │
                          │  └─────┬──────┘    │ rooms: Map<>  │  │
                          │        │           │ ludo engine   │  │
                          │        │           └───────┬───────┘  │
                          │        │  JWT verify       │ snapshot │
                          └────────┼───────────────────┼──────────┘
                                   │                    │
                          ┌────────▼────────────────────▼──────────┐
                          │     Render PostgreSQL (managed)         │
                          │  users · rooms · room_players · games   │
                          └─────────────────────────────────────────┘

Frontend host: Netlify   →   https://apz-ludo.netlify.app
Backend host:  Render     →   https://apz-ludo-api.onrender.com
Database host: Render PostgreSQL (private + external connection string)
```

**Why this shape**

| Decision | Choice | Reason |
|---|---|---|
| Live game state | In server memory (`Map`) | 4 players, a handful of rooms. No need for Redis. Snapshot to Postgres so a restart can recover an in-progress game. |
| Transport | REST for auth/rooms, Socket.IO for gameplay | REST is simplest for request/response; Socket.IO for push. |
| Dice / move validation | Server only | Anti-cheat requirement. Client never computes dice or legality. |
| Room expiry | `expires_at` column + in-memory timer + periodic sweep | Survives restarts (sweep) and is instant in the happy path (timer). |
| Auth | JWT in `localStorage`, bcrypt password hash | Simplest stateless auth for a friend group. |

> ⚠️ **Render free tier note:** free web services sleep after ~15 min idle and
> cold-start in ~30–60s. In-memory games are lost on sleep/restart, but the
> Postgres snapshot lets you resume. For a hobby app this is acceptable. If you
> want zero cold starts, use Render's cheapest paid instance.

---

## 2. Database Schema

Postgres stores **durable** data only: accounts and room/game metadata. The
moment-to-moment board state lives in memory and is periodically snapshotted into
`games.state` (JSONB) for crash recovery.

```sql
-- ============ users ============
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      VARCHAR(20)  NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============ rooms ============
-- id is a short, human-shareable code used in the join link, e.g. /join/AB12CD
CREATE TYPE room_status AS ENUM ('waiting', 'playing', 'finished', 'expired');

CREATE TABLE rooms (
  id           VARCHAR(8)   PRIMARY KEY,             -- short code, app-generated
  creator_id   BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       room_status  NOT NULL DEFAULT 'waiting',
  max_players  SMALLINT     NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ  NOT NULL,               -- created_at + 5 min while 'waiting'
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX idx_rooms_status_expires ON rooms (status, expires_at);

-- ============ room_players ============
-- which users sit in which room, and their assigned color / seat order
CREATE TYPE player_color AS ENUM ('red', 'green', 'yellow', 'blue');

CREATE TABLE room_players (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id    VARCHAR(8)  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color      player_color NOT NULL,
  seat_order SMALLINT    NOT NULL CHECK (seat_order BETWEEN 0 AND 3),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id),   -- a user joins a room only once
  UNIQUE (room_id, color),     -- one color per room
  UNIQUE (room_id, seat_order) -- one seat per room
);

-- ============ games ============
-- one row per room that actually starts. state is the authoritative snapshot.
CREATE TABLE games (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id      VARCHAR(8)  NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  state        JSONB       NOT NULL,             -- board, tokens, turn, last dice
  current_turn SMALLINT    NOT NULL DEFAULT 0,   -- seat_order whose turn it is
  winner_id    BIGINT      REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `games.state` JSONB shape (in-memory mirror)

```jsonc
{
  "phase": "rolling",            // "rolling" | "moving" | "finished"
  "currentSeat": 0,              // seat_order to act
  "lastDice": null,              // number 1..6 or null
  "rollsThisTurn": 0,            // consecutive 6s handling
  "players": [
    {
      "seat": 0, "userId": 12, "color": "red",
      "tokens": [-1, -1, -1, -1],   // -1=home base; 0..51=main track; 100..105=home column; 999=finished
      "finished": 0                 // count of tokens that reached center
    }
    // ... up to 4
  ],
  "winnerSeat": null,
  "version": 7                   // increments each applied move (optimistic concurrency)
}
```

---

## 3. Folder Structure

Two top-level apps already exist in the repo: **`apz-ludo/`** (frontend) and
**`server/`** (backend).

```
apz-ludo/                          # ── FRONTEND (Vue 3, Netlify) ──
├─ index.html
├─ package.json
├─ vite.config.js                  # Vite + Pug + Tailwind plugins
├─ tailwind.config.js
├─ postcss.config.js
├─ netlify.toml                    # SPA redirect + build settings
├─ .env                            # VITE_API_URL, VITE_SOCKET_URL
└─ src/
   ├─ main.js                      # createApp, Pinia, Router, mount
   ├─ App.vue
   ├─ assets/
   │  └─ styles/
   │     ├─ main.css               # @tailwind base/components/utilities
   │     └─ animations.css         # custom keyframes (dice roll, token hop)
   ├─ router/
   │  └─ index.js                  # routes + auth guard
   ├─ stores/                      # Pinia
   │  ├─ auth.js
   │  ├─ room.js
   │  └─ game.js
   ├─ services/
   │  ├─ api.js                    # axios instance (JWT interceptor)
   │  └─ socket.js                 # Socket.IO client singleton
   ├─ composables/
   │  ├─ useSocket.js              # wire socket events → game store
   │  └─ useCountdown.js           # 5-min room timer display
   ├─ components/
   │  ├─ ui/                       # generic, reusable
   │  │  ├─ BaseButton.vue
   │  │  ├─ BaseInput.vue
   │  │  ├─ BaseCard.vue
   │  │  └─ BaseModal.vue
   │  ├─ board/
   │  │  ├─ LudoBoard.vue          # the 15×15 grid
   │  │  ├─ BoardCell.vue
   │  │  ├─ Token.vue
   │  │  ├─ HomeBase.vue
   │  │  └─ DiceRoller.vue
   │  └─ room/
   │     ├─ PlayerList.vue
   │     ├─ PlayerSlot.vue
   │     ├─ ShareLink.vue
   │     └─ TurnIndicator.vue
   ├─ views/                       # route-level pages
   │  ├─ LoginView.vue
   │  ├─ LobbyView.vue             # create / list / enter room code
   │  ├─ RoomView.vue              # waiting room (5-min countdown)
   │  ├─ GameView.vue              # the actual game
   │  └─ JoinView.vue              # /join/:roomId → auto-join → redirect
   └─ utils/
      └─ boardMap.js               # cell-index → grid (row,col) lookup tables

server/                            # ── BACKEND (Node, Express, Render) ──
├─ package.json
├─ .env                            # DATABASE_URL, JWT_SECRET, CLIENT_ORIGIN, PORT
├─ render.yaml                     # (optional) IaC for Render
└─ src/
   ├─ index.js                     # boots http + express + socket.io
   ├─ app.js                       # express app, middleware, routes
   ├─ config/
   │  ├─ env.js                    # reads & validates env vars
   │  └─ db.js                     # pg Pool
   ├─ middleware/
   │  ├─ auth.js                   # requireAuth (REST)
   │  └─ error.js                  # central error handler
   ├─ routes/
   │  ├─ auth.routes.js            # /api/auth/register, /login, /me
   │  └─ room.routes.js            # /api/rooms ...
   ├─ controllers/
   │  ├─ auth.controller.js
   │  └─ room.controller.js
   ├─ services/
   │  ├─ user.service.js           # db queries for users
   │  ├─ room.service.js           # db queries for rooms/players
   │  └─ token.service.js          # JWT sign/verify, bcrypt
   ├─ sockets/
   │  ├─ index.js                  # io setup, auth handshake, namespaces
   │  ├─ socketAuth.js             # JWT verify on connection
   │  └─ gameHandlers.js           # join/roll/move/leave events
   ├─ game/
   │  ├─ GameManager.js            # in-memory Map<roomId, Game>, lifecycle
   │  ├─ LudoEngine.js             # pure rules: legalMoves, applyMove, dice
   │  └─ board.js                  # track layout, start/safe/home constants
   ├─ jobs/
   │  └─ roomSweeper.js            # setInterval: expire stale 'waiting' rooms
   └─ db/
      ├─ migrate.js                # tiny SQL migration runner
      ├─ seed.js                   # inserts sample data
      ├─ migrations/
      │  ├─ 001_init.sql
      │  └─ 002_indexes.sql
      └─ seeds/
         └─ seed.sql
```

---

## 4. API Design (REST)

Base URL: `${VITE_API_URL}` → `https://apz-ludo-api.onrender.com/api`

All gameplay happens over Socket.IO. REST handles **auth** and **room creation /
membership** only.

| Method | Path | Auth | Body | Purpose |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | – | `{username, password}` | Create account, returns JWT + user |
| `POST` | `/api/auth/login` | – | `{username, password}` | Returns JWT + user |
| `GET`  | `/api/auth/me` | ✅ | – | Current user from token |
| `POST` | `/api/rooms` | ✅ | – | Create room (creator auto-seated red). Returns `{roomId, joinUrl}` |
| `GET`  | `/api/rooms/:id` | ✅ | – | Room details + players + status |
| `POST` | `/api/rooms/:id/join` | ✅ | – | Join room (assigns next free color/seat). Used by the share link. |
| `POST` | `/api/rooms/:id/leave` | ✅ | – | Leave room before game start |

### Representative responses

```jsonc
// POST /api/auth/login  → 200
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": { "id": 12, "username": "apoorv" }
}

// POST /api/rooms  → 201
{
  "roomId": "AB12CD",
  "joinUrl": "https://apz-ludo.netlify.app/join/AB12CD",
  "expiresAt": "2026-06-23T17:25:00.000Z"
}

// GET /api/rooms/AB12CD  → 200
{
  "id": "AB12CD",
  "status": "waiting",
  "creatorId": 12,
  "expiresAt": "2026-06-23T17:25:00.000Z",
  "players": [
    { "userId": 12, "username": "apoorv", "color": "red",   "seat": 0 },
    { "userId": 19, "username": "riya",   "color": "green", "seat": 1 }
  ]
}
```

### Error shape (consistent)

```jsonc
{ "error": { "code": "ROOM_FULL", "message": "This room already has 4 players." } }
```

Common codes: `INVALID_CREDENTIALS`, `USERNAME_TAKEN`, `ROOM_NOT_FOUND`,
`ROOM_FULL`, `ROOM_EXPIRED`, `ALREADY_JOINED`, `GAME_ALREADY_STARTED`,
`UNAUTHORIZED`.

> **Note on joining:** the join link points to the *frontend* route
> `/join/:roomId`. The `JoinView` calls `POST /api/rooms/:id/join` and then
> redirects into the room. There is no OTP and no acceptance flow — clicking the
> link joins directly (requirement satisfied).

---

## 5. Socket.IO Event Design

Single default namespace. The JWT is sent in the connection handshake
(`auth.token`) and verified once on connect; `socket.data.user` is then trusted
for all subsequent events. The client joins a Socket.IO **room** equal to the
Ludo room id, so the server can broadcast to exactly those players.

### Client → Server

| Event | Payload | Notes |
|---|---|---|
| `room:join` | `{ roomId }` | Subscribe socket to the room; server emits current state to caller |
| `room:leave` | `{ roomId }` | Leave (pre-game) |
| `game:start` | `{ roomId }` | Creator only; needs ≥2 players; transitions `waiting → playing` |
| `dice:roll` | `{ roomId }` | Server generates the dice. Only valid on your turn in `rolling` phase |
| `token:move` | `{ roomId, tokenIndex }` | Server validates against legal moves and applies |
| `game:leave` | `{ roomId }` | Forfeit / disconnect intent |

### Server → Client (broadcast to room unless noted)

| Event | Payload | When |
|---|---|---|
| `room:state` | full room+player snapshot | on join, and whenever membership changes |
| `room:expired` | `{ roomId }` | sweeper deleted an unstarted room |
| `game:started` | `{ state }` | creator started; initial board |
| `dice:rolled` | `{ seat, value }` | after server rolls |
| `moves:available` | `{ seat, tokenIndexes }` *(to current player only)* | legal moves for the roll |
| `game:state` | `{ state }` | after every applied move (authoritative) |
| `turn:changed` | `{ currentSeat }` | turn advances |
| `token:captured` | `{ bySeat, victimSeat, tokenIndex }` | a capture happened (for animation) |
| `game:over` | `{ winnerSeat, winnerUserId }` | someone won |
| `player:disconnected` / `player:reconnected` | `{ seat }` | presence |
| `error` | `{ code, message }` *(to caller only)* | invalid action (e.g. not your turn) |

### Turn sequence (server-authoritative)

```
Client: dice:roll ─────────────▶ Server rolls (crypto RNG)
                                  ├─ broadcast  dice:rolled {seat, value}
                                  ├─ compute legal moves
                                  ├─ if none → auto-advance turn → turn:changed
                                  └─ else → emit moves:available (to roller only)
Client: token:move {tokenIndex} ▶ Server validates tokenIndex ∈ legal moves
                                  ├─ apply move, maybe capture
                                  ├─ broadcast game:state (+ token:captured)
                                  ├─ if rolled 6 (and <3 in a row) → same player rolls again
                                  ├─ if token reached center & all 4 finished → game:over
                                  └─ else → advance turn → turn:changed
                                  └─ snapshot state → games.state (throttled)
```

If a player who isn't the current actor emits `dice:roll`/`token:move`, the
server replies `error {code:"NOT_YOUR_TURN"}` and changes nothing.

---

## 6. Vue Component Hierarchy

```
App.vue
└─ <RouterView>
   ├─ LoginView.vue
   │  └─ BaseCard › BaseInput ×2 · BaseButton           (register / login toggle)
   │
   ├─ LobbyView.vue
   │  ├─ BaseButton  "Create Room"
   │  └─ BaseInput + BaseButton  "Join by code"
   │
   ├─ JoinView.vue        (/join/:roomId — no UI, auto-joins then redirects)
   │
   ├─ RoomView.vue        (waiting room)
   │  ├─ ShareLink.vue            (copyable join URL + copy button)
   │  ├─ PlayerList.vue
   │  │  └─ PlayerSlot.vue ×4     (filled / empty seat)
   │  ├─ useCountdown → 5:00 timer to expiry
   │  └─ BaseButton "Start Game"  (creator only, enabled when ≥2 players)
   │
   └─ GameView.vue
      ├─ TurnIndicator.vue        (whose turn, color chip)
      ├─ LudoBoard.vue
      │  ├─ BoardCell.vue ×(15×15)
      │  ├─ HomeBase.vue ×4
      │  └─ Token.vue ×16         (4 per player; animated)
      ├─ DiceRoller.vue           (animated die; disabled unless your turn)
      ├─ PlayerList.vue           (scores / finished counts)
      └─ BaseModal.vue            (game-over / "you win" overlay)
```

**Reusable UI primitives** (`components/ui/`) are dumb and styled with Tailwind.
**Board components** receive state via props from `GameView` (which reads the
`game` Pinia store) and emit intents (`@roll`, `@move`) upward — they never mutate
state directly.

> **Pug + Tailwind** example (`DiceRoller.vue`):
> ```vue
> <template lang="pug">
> button.relative.h-16.w-16.rounded-xl.bg-slate-800.text-white.shadow-md(
>   :disabled="!isMyTurn || rolling"
>   :class="{ 'opacity-40 cursor-not-allowed': !isMyTurn, 'animate-dice': rolling }"
>   @click="$emit('roll')"
> )
>   span.text-2xl.font-semibold {{ value ?? '–' }}
> </template>
> ```

---

## 7. State Management (Pinia)

Three small stores. Composition (`setup`) style.

### `stores/auth.js`
```js
state:   { token: localStorage.token || null, user: null }
getters: { isAuthenticated }
actions: { register(), login(), fetchMe(), logout() }
// On login: persist token to localStorage, set axios header, connect socket.
```

### `stores/room.js`
```js
state:   { current: null, players: [], expiresAt: null, loading }
getters: { isCreator, isFull, freeSeats }
actions: { createRoom(), joinRoom(id), leaveRoom(), loadRoom(id), applyServerState(snapshot) }
```

### `stores/game.js`  (driven almost entirely by socket events)
```js
state:   { state: null, mySeat: null, lastDice: null, availableMoves: [], phase, winnerSeat }
getters: { isMyTurn, currentColor, myPlayer, tokensFor(color) }
actions: {
  bindSocket(),          // register socket listeners → mutations
  rollDice(),            // emit 'dice:roll'
  moveToken(i),          // emit 'token:move'
  startGame(),           // emit 'game:start'
  _onState(s), _onDice(d), _onMoves(m), _onOver(w)  // internal handlers
}
```

The **server is the single source of truth.** Stores hold a *mirror* of server
state and only optimistically render animations; the authoritative `game:state`
always overwrites local state.

---

## 8. Authentication Flow

```
┌ Register / Login ────────────────────────────────────────────────┐
│ 1. User submits {username, password} → POST /api/auth/(register|  │
│    login)                                                          │
│ 2. Server: bcrypt.hash on register / bcrypt.compare on login      │
│ 3. Server signs JWT  { sub: userId, username }  exp 7d            │
│ 4. Client stores token in localStorage; axios sets                │
│    Authorization: Bearer <token>                                   │
│ 5. Client opens socket with auth:{ token }                         │
└───────────────────────────────────────────────────────────────────┘

REST guard (middleware/auth.js):
   verify Bearer token → req.user = { id, username }  | else 401

Socket guard (sockets/socketAuth.js):
   io.use((socket, next) => verify(socket.handshake.auth.token)
        → socket.data.user = {...} ; next()  | else next(new Error('UNAUTHORIZED')))

Router guard (frontend):
   routes with meta.requiresAuth → if !auth.isAuthenticated → redirect /login
   (preserve intended path, incl. /join/:id, so the link still works after login)
```

**Password rules (kept minimal):** 3–20 char username, ≥6 char password,
bcrypt cost 10. No email, no reset flow — it's a friend group; reset by asking you.

---

## 9. Room Lifecycle Flow

```
                 create
   [no room] ───────────────▶ WAITING ──────── start (creator, ≥2 players) ──▶ PLAYING
                               │  ▲                                              │
                expires_at =   │  │ join / leave update room:state               │ winner reached
                now()+5min     │  │                                              ▼
                               │  └──────────────────────────────────────▶  FINISHED
                  nobody/      │
                  not started  │
                  in 5 min     ▼
                            EXPIRED  →  row deleted (CASCADE removes players)
```

**Expiry implementation (two layers, both simple):**

1. **In-memory timer** — on room create, `setTimeout(5 min)`. When it fires, if
   the room is still `waiting`, mark `expired`, emit `room:expired`, delete the
   row. Cleared if the game starts.
2. **Periodic sweeper** (`jobs/roomSweeper.js`) — every 60s:
   ```sql
   DELETE FROM rooms
   WHERE status = 'waiting' AND expires_at < now();
   ```
   This is the safety net that survives a server restart (when the in-memory
   timer is gone). Belt and suspenders, both trivial.

> Once a game starts (`status = 'playing'`), `expires_at` is ignored — only
> *unjoined / unstarted* rooms expire, exactly as required.

**Color/seat assignment:** seats fill in order `red(0) → green(1) → yellow(2) →
blue(3)`. Creator always takes `red / seat 0`. The `UNIQUE(room_id, color)` and
`UNIQUE(room_id, seat_order)` constraints guarantee no collisions even under a
race.

---

## 10. Game Engine & Anti-Cheat

`game/LudoEngine.js` is a **pure module** (no I/O) so it's easy to reason about
and unit-test. The server owns it; the client never runs game rules.

**Board model (standard Ludo):**
- Main track: 52 cells, indices `0..51`.
- Each color has a fixed **entry** cell and an **exit** cell where it turns into
  its 6-cell **home column** (`100..105`), then the **center** (`999` = finished).
- Start offsets (entry cells): red `0`, green `13`, yellow `26`, blue `39`.
- **Safe cells:** each color's entry cell + the 4 star cells. Tokens on safe
  cells cannot be captured.
- Token positions: `-1` = in base; `0..51` = on track; `100..105` = home column;
  `999` = home/finished.

**Core rules enforced server-side:**
1. Need a **6** to move a token out of base.
2. Rolling a **6 grants another roll**; three 6s in a row = forfeit the turn.
3. A token landing on an opponent (non-safe cell) **captures** it back to base.
4. Must roll the **exact** number to enter the center.
5. First player to bring **all 4 tokens** to center **wins**.

**Anti-cheat guarantees:**
- **Dice are server-generated** with `crypto.randomInt(1, 7)` — the client sends
  only "I want to roll", never a value.
- Every `token:move` is checked against the server's computed `legalMoves(state,
  seat, dice)`. An illegal `tokenIndex` is rejected with `error`.
- The server enforces **turn ownership** (`socket.data.user.id` must match the
  current seat's `userId`) and **phase** (`rolling` vs `moving`).
- The optimistic `version` counter prevents stale/duplicate move application.
- Clients receive only the authoritative `game:state`; any local prediction is
  cosmetic and overwritten.

```js
// LudoEngine.js (shape)
export function rollDice() { return crypto.randomInt(1, 7); }   // 1..6

export function legalMoves(state, seat, dice) {
  // returns array of tokenIndex (0..3) that can legally move with `dice`
}

export function applyMove(state, seat, tokenIndex) {
  // returns { state, captured?: {seat, tokenIndex}, finishedToken?, won?: seat }
  // throws if illegal — caller (gameHandlers) maps to error event
}

export function nextTurn(state) { /* advance currentSeat, reset dice/phase */ }
```

---

## 11. PostgreSQL on Render — Setup Guide

> You create the database **before** the web service so you have a
> `DATABASE_URL` to give the backend.

1. **Sign in** at <https://dashboard.render.com> (GitHub login is easiest).
2. Click **New +** → **PostgreSQL**.
3. Fill in:
   - **Name:** `apz-ludo-db`
   - **Database:** `apz_ludo` · **User:** `apz_ludo_user` (auto is fine)
   - **Region:** pick the one nearest you (and use the *same* region for the web
     service to keep them on the private network).
   - **Plan:** **Free** is enough for 4 players. (Note: Render's free Postgres
     is deleted after ~90 days — fine for a hobby project; back up the seed/
     migrations, which you have in git.)
4. Click **Create Database**. Wait ~1 min until status is **Available**.
5. Open the database page → **Connections** / **Info**. Note these:
   - **Internal Database URL** — use this for the backend *if it's hosted on
     Render in the same region* (faster, no egress).
   - **External Database URL** — use this from your laptop / DBeaver. Looks like:
     ```
     postgresql://apz_ludo_user:PASSWORD@dpg-xxxx.oregon-postgres.render.com/apz_ludo
     ```
6. Render external connections **require SSL**. In the backend `pg` config:
   ```js
   new Pool({
     connectionString: process.env.DATABASE_URL,
     ssl: { rejectUnauthorized: false }   // Render uses a managed cert
   });
   ```

---

## 12. Connecting with DBeaver

1. Install **DBeaver Community** (<https://dbeaver.io>).
2. **Database → New Database Connection → PostgreSQL**.
3. Easiest path — paste the URL: click **"Connect by → URL"** and paste the
   **External Database URL** from Render. Or fill fields manually from that URL:
   | Field | Value (from External URL) |
   |---|---|
   | Host | `dpg-xxxx.oregon-postgres.render.com` |
   | Port | `5432` |
   | Database | `apz_ludo` |
   | Username | `apz_ludo_user` |
   | Password | (from the URL) |
4. **SSL tab** → check **Use SSL**, set **SSL mode = `require`**. (Render needs
   SSL for external connections; no client cert required.)
5. Click **Test Connection** → **Finish**.
6. Browse under **apz_ludo → Schemas → public → Tables**. Run the migration SQL
   here directly if you prefer GUI over the Node runner.

---

## 13. Migrations & Seed Data

Kept deliberately simple: **plain `.sql` files** + a ~30-line runner. No
migration framework needed for a project this size. The runner tracks applied
files in a `_migrations` table so re-running is safe.

### `server/src/db/migrations/001_init.sql`
```sql
BEGIN;

CREATE TYPE room_status  AS ENUM ('waiting','playing','finished','expired');
CREATE TYPE player_color AS ENUM ('red','green','yellow','blue');

CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      VARCHAR(20) NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id          VARCHAR(8)  PRIMARY KEY,
  creator_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      room_status NOT NULL DEFAULT 'waiting',
  max_players SMALLINT    NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE room_players (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id    VARCHAR(8)   NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color      player_color NOT NULL,
  seat_order SMALLINT     NOT NULL CHECK (seat_order BETWEEN 0 AND 3),
  joined_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id),
  UNIQUE (room_id, color),
  UNIQUE (room_id, seat_order)
);

CREATE TABLE games (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id      VARCHAR(8)  NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  state        JSONB       NOT NULL,
  current_turn SMALLINT    NOT NULL DEFAULT 0,
  winner_id    BIGINT      REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
```

### `server/src/db/migrations/002_indexes.sql`
```sql
BEGIN;
CREATE INDEX idx_rooms_status_expires ON rooms (status, expires_at);
CREATE INDEX idx_room_players_room    ON room_players (room_id);
CREATE INDEX idx_games_room           ON games (room_id);
COMMIT;
```

### `server/src/db/migrate.js` (the whole runner)
```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

const done = new Set((await pool.query('SELECT name FROM _migrations')).rows.map(r => r.name));
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  if (done.has(file)) continue;
  console.log('Running', file);
  await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  await pool.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
}
console.log('Migrations complete'); process.exit(0);
```

Run with: `node src/db/migrate.js` (add as `npm run migrate`).

### `server/src/db/seeds/seed.sql` (sample data)
```sql
-- Passwords below are bcrypt hashes of "password123" (cost 10).
-- Regenerate with: node -e "console.log(require('bcryptjs').hashSync('password123',10))"
INSERT INTO users (username, password_hash) VALUES
  ('apoorv', '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq4eL0r1k7Pp7Qe7xK1d9fZC5VnYC'),
  ('riya',   '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq4eL0r1k7Pp7Qe7xK1d9fZC5VnYC'),
  ('kabir',  '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq4eL0r1k7Pp7Qe7xK1d9fZC5VnYC'),
  ('mira',   '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrq4eL0r1k7Pp7Qe7xK1d9fZC5VnYC')
ON CONFLICT (username) DO NOTHING;

-- A sample waiting room created by apoorv, expiring 5 min out, with 2 players.
INSERT INTO rooms (id, creator_id, status, expires_at)
SELECT 'DEMO01', u.id, 'waiting', now() + interval '5 minutes'
FROM users u WHERE u.username = 'apoorv'
ON CONFLICT (id) DO NOTHING;

INSERT INTO room_players (room_id, user_id, color, seat_order)
SELECT 'DEMO01', u.id, 'red', 0 FROM users u WHERE u.username = 'apoorv'
ON CONFLICT DO NOTHING;
INSERT INTO room_players (room_id, user_id, color, seat_order)
SELECT 'DEMO01', u.id, 'green', 1 FROM users u WHERE u.username = 'riya'
ON CONFLICT DO NOTHING;
```

> ⚠️ The hash above is a placeholder — generate your own real hash with the
> one-liner in the comment so `password123` actually logs in.

Run with: `node src/db/seed.js` (which just executes `seeds/seed.sql`).

---

## 14. Render Backend Deployment

**Prereqs:** code pushed to GitHub; database from §11 exists.

1. Dashboard → **New +** → **Web Service** → connect your GitHub repo.
2. Configure:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`  (which runs `node src/index.js`)
   - **Region:** same as the database.
   - **Plan:** Free (sleeps when idle) or cheapest paid (no cold start).
3. **Environment** → add variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the **Internal** Database URL from Render |
   | `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `CLIENT_ORIGIN` | `https://apz-ludo.netlify.app` |
   | `NODE_VERSION` | `20` |
4. **First deploy:** after it goes live, run migrations once. Either:
   - add a one-off **Render Shell** command `npm run migrate && npm run seed`, or
   - temporarily set Start Command to `npm run migrate && npm start`, deploy,
     then revert.
5. **CORS / Socket.IO origin** — in `app.js` and the Socket.IO server, allow
   `process.env.CLIENT_ORIGIN`:
   ```js
   app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
   const io = new Server(httpServer, {
     cors: { origin: process.env.CLIENT_ORIGIN }
   });
   ```
6. **Health check** — add `GET /health → 200 'ok'`; set it as Render's health
   check path so deploys verify cleanly.
7. Note the service URL (`https://apz-ludo-api.onrender.com`) for the frontend.

> Render terminates TLS and proxies WebSockets transparently — Socket.IO works
> over the standard `https://...` URL with no extra config.

---

## 15. Netlify Frontend Deployment

1. Build locally once to confirm: `npm run build` in `apz-ludo/`.
2. **`apz-ludo/netlify.toml`:**
   ```toml
   [build]
     base    = "apz-ludo"
     command = "npm run build"
     publish = "apz-ludo/dist"

   # SPA fallback so /join/:roomId and other deep links resolve to index.html
   [[redirects]]
     from = "/*"
     to   = "/index.html"
     status = 200
   ```
3. Netlify dashboard → **Add new site → Import from Git** → pick the repo.
   - **Base directory:** `apz-ludo`
   - **Build command:** `npm run build`
   - **Publish directory:** `apz-ludo/dist`
4. **Environment variables** (Site settings → Environment):
   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://apz-ludo-api.onrender.com/api` |
   | `VITE_SOCKET_URL` | `https://apz-ludo-api.onrender.com` |
5. Deploy. Your app is at `https://<site-name>.netlify.app` (rename to
   `apz-ludo` in Site settings → Domain to match the share links).
6. **Verify the loop:** create a room on the live site → copy the share link →
   open it in an incognito window → it should land on `/join/:id`, prompt login
   if needed, then auto-join.

> The SPA redirect in step 2 is essential — without it, refreshing or directly
> opening `/join/ROOM_ID` returns Netlify's 404.

---

## 16. Step-by-Step Implementation Plan

Build in vertical slices; you have a playable loop by Phase 4.

**Phase 0 — Scaffolding (½ day)**
- `server/`: `npm init`, install `express socket.io pg bcryptjs jsonwebtoken cors dotenv`. ESM (`"type":"module"`).
- `apz-ludo/`: `npm create vite@latest` (Vue), add `pinia vue-router socket.io-client axios`, Tailwind (`tailwindcss postcss autoprefixer`), and Pug (`pug @vue/compiler-sfc`). Configure `vite.config.js`, `tailwind.config.js`.
- Commit the folder structure from §3.

**Phase 1 — Database (½ day)**
- Create Render Postgres (§11). Write `001_init.sql`, `002_indexes.sql`, `migrate.js`, `seed.sql`. Run migrate + seed. Verify in DBeaver (§12).

**Phase 2 — Auth (1 day)**
- Backend: `token.service` (bcrypt + JWT), `auth.controller/routes`, `requireAuth` middleware.
- Frontend: `auth` store, `api.js` interceptor, `LoginView`, router guard. Confirm register/login round-trip.

**Phase 3 — Rooms (1–1.5 days)**
- Backend: `room.service/controller/routes` (create/join/leave/get), short-code generator, `expires_at` logic, `roomSweeper` job, in-memory expiry timer.
- Frontend: `room` store, `LobbyView`, `RoomView` with `ShareLink` + `useCountdown`, `JoinView` (auto-join → redirect). Test the full share-link flow.

**Phase 4 — Realtime skeleton (1 day)**
- Backend: Socket.IO server + JWT handshake (`socketAuth`), `room:join`/`leave`, broadcast `room:state`, `game:start`. `GameManager` creates an in-memory game.
- Frontend: `socket.js` singleton, `useSocket` composable, wire `RoomView` presence updates live.

**Phase 5 — Ludo engine (2 days)**
- `LudoEngine.js` + `board.js`: dice, `legalMoves`, `applyMove`, captures, home column, win. Unit-test the engine in isolation (no sockets).
- `gameHandlers.js`: `dice:roll`, `token:move` with full validation; emit `dice:rolled`, `moves:available`, `game:state`, `turn:changed`, `game:over`. Throttled snapshot to `games.state`.

**Phase 6 — Game UI (2–3 days)**
- `GameView`, `LudoBoard` + `BoardCell` + `HomeBase`, `Token` (animated), `DiceRoller`, `TurnIndicator`, game-over `BaseModal`. Map engine token positions → grid cells via `utils/boardMap.js`. `game` store binds all socket events.

**Phase 7 — Polish (1–2 days)**
- Custom CSS animations (`animations.css`): dice tumble, token hop, capture flash. Disconnect/reconnect handling, error toasts, empty/edge states. Responsive layout.

**Phase 8 — Deploy (½ day)**
- Backend to Render (§14), frontend to Netlify (§15). Set env vars, run migrations on Render, smoke-test the live share-link → join → play loop with a friend.

---

### Design language (UI tokens — minimal & professional)

| Token | Value | Use |
|---|---|---|
| Surface | `slate-50` / `white` | page & cards |
| Ink | `slate-800` / `slate-500` | text / muted |
| Accent | `indigo-600` | primary buttons, active turn |
| Lines | `slate-200` | borders, board grid |
| Player colors | muted `rose-500 / emerald-500 / amber-500 / sky-500` | tokens only (not UI chrome) |
| Radius | `rounded-xl` | cards, buttons |
| Shadow | `shadow-sm` / `shadow-md` | subtle elevation |

Keep the chrome neutral (slate + one indigo accent); reserve saturated color for
the four player tokens only — that's what makes it read as *elegant* rather than
*arcade*.
```
