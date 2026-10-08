# Snake AI Lab — web app

The classroom version of `snake-ai-pygame/snake_ai.py`. The Q-learning engine is the
same code, ported to JavaScript and run **in the browser**, so a projector screen is
the only thing the class needs — no Thonny, no venv, no pygame.

Students sign in through a **modal gate** (the lab stays closed until a name is in),
tune the four reward numbers, train one or more **sessions** side by side, watch the
learning curves climb, and their best attempt lands on the class leaderboard.
They can train as many times as they like.

---

## Layout

```text
snake-ai/
├── src/index.js      # Bun server: static files + the leaderboard API (no npm deps)
├── public/
│   ├── index.html    # the page: sign-in modal · control panel · arena · leaderboard
│   ├── app.css
│   ├── engine.js     # the Q-learning snake — one session = one recipe + one brain
│   └── app.js        # UI, sliders, learning curve, calls to the API
├── test/engine-test.js  # headless training, like test_headless.py
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

## What the class does

1. **Sign in** — a modal covers the page until a name is typed and `Register` is pressed.
   Nothing is saved without a name, and nothing else is even visible. `🪪 Sign in as
   someone else` re-opens the modal for the next student.
2. **Control panel** — the only four numbers students may change:
   `MAT_REWARD` (carrot), `CRASH_PENALTY` (whip), `STEP_COST` (life cost),
   `EXPLORATION` (ε). Plus board size (12×12 or 6×6) and speed.
3. **Sessions** — the arena has tabs `S1 · S2 · …`. A session is one recipe + one brain
   + one chart, so two recipes can be trained and their curves compared. `＋ New session`
   starts a fresh brain with whatever recipe the panel shows (up to 6 per page).
4. **Arena** — press `▶ Start / pause training`. The worm plays, the chart draws the
   rolling average of the last 10 games, and the log prints the same lines the Python
   version printed in the terminal. Training stops at 100 games — that is the number
   that counts. Only the session under the tabs trains.
5. **Save my result** — posts the attempt to the server (with the session label). Attempts
   are counted, the best one is kept, so a student can train again and again.
6. **Final exam** — the lab's "uppkörning": ε is forced to `0`, the trained brain plays
   3 games, the points are summed and posted as a separate ranking.

Four preset buttons load the recipes from the cookbook (Everyday hero, Speed demon,
Safety driver, Chaos pilot), and `🧠 Wipe the brain` clears the brain of the **current
session only**.

## API

| Call | Body |
| :--- | :--- |
| `POST /api/register` | `{ "name": "Ada Lovelace" }` |
| `POST /api/submit` | `{ "name", "label", "config", "record", "avg", "games", "brain", "bestSteps" }` |
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

## Tuning notes (100 games, several runs)

| Config | Record | Avg |
| :--- | :---: | :---: |
| default `20, -100, -1, 0.1` | 9–14 | ~2.5 |
| `CRASH_PENALTY = 0` | 3–7 | ~1.5 |
| `STEP_COST = -50` | 2–4 | ~0.5 |
| `EXPLORATION = 1.0` | 1–2 | ~0.2 |
| `EXPLORATION = 0.0` | 12–23 | ~2.5 |

Records move with the random seed — run `test/engine-test.js` a few times before
quoting a number to the class.
