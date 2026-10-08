# Snake AI Lab — web app

The classroom version of `snake-ai-pygame/snake_ai.py`. The Q-learning engine is the
same code, ported to JavaScript and run **in the browser**, so a projector screen is
the only thing the class needs — no Thonny, no venv, no pygame.

Students sign in through a **modal gate** (the lab stays closed until a name is in),
work through **three levels** that each unlock a different part of the algorithm, and
pass a level by **making the worm do something provable** — crash on purpose, circle
and refuse apples — never by scoring high. Sessions let two recipes be trained side
by side; results land on the class leaderboard. They can train as many times as they
like.

---

## Layout

```text
snake-ai/
├── src/index.js      # Bun server: static files + the leaderboard API (no npm deps)
├── public/
│   ├── index.html    # the page: sign-in modal · 3 columns · leaderboard
│   ├── app.css
│   ├── engine.js     # the Q-learning snake — one session = one recipe + one brain
│   └── app.js        # levels, knobs, charts, behaviour detectors, calls to the API
├── test/engine-test.js  # headless training, like test_headless.py
├── test/loop-test.js    # the app boots and the arena loop ticks
├── test/gate-test.js    # the sign-in modal opens/closes correctly
├── test/levels-test.js  # drives the UI and clears all three levels
├── test/calibrate.js    # what the detectors see, for candidate recipes
├── data/records.json # classroom results (gitignored)
└── Dockerfile
```

## Run it

```bash
cd /var/www/snake-ai
bun run src/index.js          # or: /home/karim/.bun/bin/bun run src/index.js
# → 🐍 Snake AI Lab ready at http://localhost:3020/
```

`SNAKE_PORT` changes the port, `SNAKE_ROOT` moves the app (the server reads
`public/` and `data/` relative to the root, so run it from the app folder).

Headless sanity check (no browser needed):

```bash
bun test/engine-test.js
```

## The three columns

| Column | What it holds |
| :--- | :--- |
| **Left · Control panel** | only the knobs the current level unlocks; everything else is greyed with 🔒 and pinned to the level's value |
| **Middle · The engine** | the worm, the session tabs, and the speed dial: 🐰 slow → ▶ normal → 🚀 turbo → ⚡ **blitz** (thousands of games, no drawing) |
| **Right · Analysis** | two live charts — the rolling average of the last 20 games (with the level's target line and its episode budget) and ε over games — plus the evidence chips that say which behaviour has been demonstrated |

## Progression: behaviour, not points

A worm that drives straight into the wall is a **correct** answer when the reward
function is built wrong, so nothing is gated on a high score — that would just send
students back to blind trial and error. Each level asks for a specific, measurable
behaviour instead.

| Level | Unlocked knobs | The demand | Gate (calibrated) |
| :--- | :--- | :--- | :--- |
| **1 · The reward function** | `mat`, `krock`, `step`, `toward`, `away` | ① make it crash on purpose, as fast as it can ② make it dodge death but refuse apples — a safe circle | ① ≥ 30 of the last 50 games end in a crash within 14 steps ② ≥ 8 of the last 50 end with 0 apples and ≥ 40 steps |
| **2 · Exploration vs exploitation** | `epsStart`, `epsDecay`, `epsMin` (recipe locked to a sane one) | anneal ε so the learning curve settles inside 500 games | ε_start ≥ 0.20 · decay ≤ 0.999 · avg of last 50 games ≥ 10 at game 500 |
| **3 · Learning rate and foresight** | `alpha`, `gamma` (ε locked to what level 2 found) | optimise: average worm length ≥ 13 apples inside 1000 games | avg of last 50 games ≥ 13 at game 1000 |

Sessions are the unit of proof: Level 1 needs **two** sessions, one per behaviour —
that is what the tabs are for. `＋ New session` gives a fresh brain with the recipe
the panel shows (up to 6 per page).

`💾 Save my result` posts the session (record, avg, games, brain, level) — attempts
are counted, the best kept. `🏫 Final exam` forces ε = 0 for 3 games on the current
brain and posts a separate ranking. `🧠 Wipe the brain` clears the current session only.

## Calibration

The gates were checked without a browser: `test/levels-test.js` drives the real
`app.js` through a fake DOM and clears all three levels; `test/calibrate.js` prints
what the detectors see for candidate recipes.

| Recipe | crashFast /50 | aloof /50 | avg50 at game 500 | avg50 at game 1000 |
| :--- | :---: | :---: | :---: | :---: |
| default (ε 0.1, no decay) | 4–7 | 1–3 | 6.4–8.4 | 7.9–8.0 |
| suicide `mat −50, crash +100` | 37–39 | 0–2 | — | — |
| aloof `mat −50, crash −300` | 9–11 | 9–11 | — | — |
| ε 1.0 never decayed | — | — | 0.1 | 0.2 |
| ε 0.1, no decay (weak) | — | — | 6.4–8.4 | 7.9–8.0 |
| ε 0.3 · decay 0.98 · floor 0 | — | — | 14.2–19.2 | 20.0–22.4 |
| α 0.8, γ 0.99 | — | — | 7.6–13.0 | 9.5–11.6 |
| α 0.1–0.2, γ 0.8–0.9 | — | — | 20.4–22.1 | 18.3–20.9 |

## API

| Call | Body |
| :--- | :--- |
| `POST /api/register` | `{ "name": "Ada Lovelace" }` |
| `POST /api/level` | `{ "name", "level": 1..3, "evidence": ["suicide","aloof"] }` |
| `POST /api/submit` | `{ "name", "label", "config", "record", "avg", "games", "brain", "level" }` |
| `POST /api/exam` | `{ "name", "config", "matches": [9,10,8] }` |
| `GET /api/leaderboard` | rankings for training + final |
| `GET /api/health` | `{ "ok": true, "port": 3020 }` |

Names are trimmed, control characters stripped and capped at 40 chars; config numbers
are clamped server-side, so a student cannot post a 900-point run.

## Serving it in the class (Nginx)

The app is routed through nginx on **port 8083** (`/etc/nginx/sites-available/snake-ai`):

```nginx
server {
    listen 8083;
    listen [::]:8083;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Students can navigate directly to:
```
http://10.151.168.5:8083/
```

## Tuning notes

Numbers move with the random seed — run `test/calibrate.js` and `test/engine-test.js`
a few times before quoting a number to the class. The level gates are set well below
what a good recipe reaches and well above what a broken one reaches, so a small
change in a threshold will not silently break a gate.
