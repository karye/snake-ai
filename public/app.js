/* ===========================================================================
 * app.js — UI + wiring to the server. The learning itself lives in engine.js.
 *
 * Progression is gated on BEHAVIOUR, never on a high score: a worm that drives
 * straight into the wall is a perfectly correct answer when the reward function
 * is built wrong, and that is the point of the lesson. Each level unlocks a
 * different part of the algorithm and asks for a specific, measurable behaviour.
 * =========================================================================== */

const $ = (id) => document.getElementById(id);
const MAX_EPISODES = 2000;      // per session, memory guard

/* ------------------------------------------------------------- the knobs -- */
const KNOBS = [
    { id: "mat", label: "🍎 Apple", min: -100, max: 100, step: 1, fmt: "int", lvl: 1 },
    { id: "krock", label: "💥 Crash", min: -300, max: 300, step: 5, fmt: "int", lvl: 1 },
    { id: "toward", label: "🎯 Step toward apple", min: -20, max: 20, step: 1, fmt: "int", lvl: 1 },
    { id: "away", label: "🎯 Step away from apple", min: -20, max: 20, step: 1, fmt: "int", lvl: 1 },
    { id: "step", label: "⏱ Life cost", min: -10, max: 0, step: 1, fmt: "int", lvl: 1 },
    { id: "epsStart", label: "🎲 Curiosity ε (start)", min: 0, max: 1, step: 0.01, fmt: "f2", lvl: 2 },
    { id: "epsDecay", label: "📉 ε decay per game", min: 0.9, max: 1, step: 0.001, fmt: "f3", lvl: 2 },
    { id: "epsMin", label: "⛔ ε floor", min: 0, max: 0.5, step: 0.01, fmt: "f2", lvl: 2 },
    { id: "alpha", label: "🐛 Learning rate α", min: 0.01, max: 1, step: 0.01, fmt: "f2", lvl: 3 },
    { id: "gamma", label: "🔭 Future sight γ", min: 0, max: 1, step: 0.01, fmt: "f2", lvl: 3 },
];

const fmt = (v, f) => f === "int" ? String(Math.round(v)) : f === "f3" ? v.toFixed(3) : v.toFixed(2);

/* The targets below were calibrated headless (test/calibrate.js): every gate is
 * reachable, and the obvious wrong answer stays clearly below it. */
const LEVELS = [
    {
        n: 1,
        title: "Level 1 · The reward function",
        text: "The reward function is the objective. Write it wrong and the algorithm will faithfully do the wrong thing. Prove you can steer it — both ways.",
        knobs: ["mat", "krock", "toward", "away"],
        fixed: { epsStart: 0.1, epsDecay: 1.0, epsMin: 0.0, alpha: 0.2, gamma: 0.9 },
        goals: [
            {
                id: "suicide",
                text: "Make it crash on purpose, as fast as it can",
                hint: "Reward the crash, punish the apple.",
                need: "≥ 30 of the last 50 games end in a crash within 14 steps",
                test: (st) => st.crashFast >= 30,
            },
            {
                id: "aloof",
                text: "Make it dodge death but refuse apples — a safe circle",
                hint: "Punish the apple and keep the crash punishment high.",
                need: "≥ 8 of the last 50 games end with 0 apples and at least 40 steps",
                test: (st) => st.aloof >= 8,
            },
        ],
    },
    {
        n: 2,
        title: "Level 2 · Exploration vs exploitation",
        text: "The recipe is locked to a sane one. Now only ε is yours: the agent must test new things early and stop doing it late. A curve that stays flat means ε never annealed; a curve that never leaves the floor means it guessed forever.",
        knobs: ["epsStart", "epsDecay", "epsMin"],
        fixed: { mat: 20, krock: -100, step: -1, toward: 0, away: 0, alpha: 0.2, gamma: 0.9 },
        goals: [
            {
                id: "anneal",
                text: "Anneal ε so the learning curve settles inside 500 games",
                hint: "Start curious (ε ≥ 0.20), decay just below 1.000, floor near 0.",
                need: "ε_start ≥ 0.20 · decay ≤ 0.999 · avg of last 50 games ≥ 10 at game 500",
                test: (st) => st.epsStart >= 0.2 && st.epsDecay <= 0.999 && st.avgAt500 >= 10,
            },
        ],
    },
    {
        n: 3,
        title: "Level 3 · Learning rate and foresight",
        text: "ε is fixed to what you found. Now α and γ are yours: how hard each update pushes, and how much the future is worth. Push too hard and the brain forgets; look too far and it chases ghosts.",
        knobs: ["alpha", "gamma"],
        fixed: { mat: 20, krock: -100, step: -1, toward: 0, away: 0, epsStart: 0.3, epsDecay: 0.98, epsMin: 0.0 },
        goals: [
            {
                id: "length",
                text: "Optimise: average worm length ≥ 13 apples inside 1000 games",
                hint: "α in the middle, γ high — but not both at the extreme.",
                need: "avg of last 50 games ≥ 13 at game 1000",
                test: (st) => st.avgAt1000 >= 13,
            },
        ],
    },
];

let level = 1;
let cleared = {};

/* ------------------------------------------------------------- sessions --- */
let sessions = [];
let active = 0;
let me = null;
let logLines = [], lastCode = "", slowTick = 0, frameNo = 0;

const board = $("board");
const avgCv = $("avg");
const epsCv = $("eps");
const logEl = $("log");
const GATE = $("gate");
const TABS = $("sessions");

function gateIsOpen() {
    return !GATE.classList.contains("off");
}
function cur() {
    return sessions[active];
}
function levelDef() {
    return LEVELS[level - 1];
}

/* ---------------------------------------------------------- the control --- */
function buildKnobs() {
    $("knobs").innerHTML = KNOBS.map((k) =>
        `<label class="knob" data-knob="${k.id}"><span class="dim">${k.label}</span>` +
        `<input id="sl-${k.id}" type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${fixedFor(k)}">` +
        `<span class="val" id="v-${k.id}">${fmt(fixedFor(k), k.fmt)}</span></label>`
    ).join("");
}
function fixedFor(k) {
    const f = levelDef().fixed;
    return f[k.id] !== undefined ? f[k.id] : (k.min + k.max) / 2;
}

function applyLevelLocks() {
    const open = levelDef().knobs;
    for (const k of KNOBS) {
        const el = $(`sl-${k.id}`).parentElement;
        const on = open.includes(k.id);
        el.classList.toggle("locked", !on);
        el.classList.toggle("open", on);
        if (!on) {
            const v = fixedFor(k);
            if ($(`sl-${k.id}`).value != String(v)) {
                $(`sl-${k.id}`).value = v;
                readSliders();
            }
        }
    }
}

function readSliders() {
    const S = cur().eng;
    for (const k of KNOBS) {
        const v = Number($(`sl-${k.id}`).value);
        if (k.id === "epsStart") S.cfg.epsStart = v;
        else if (k.id === "epsDecay") S.cfg.epsDecay = v;
        else if (k.id === "epsMin") S.cfg.epsMin = v;
        else if (k.id === "alpha") S.cfg.alpha = v;
        else if (k.id === "gamma") S.cfg.gamma = v;
        else S.cfg[k.id] = v;
        $(`v-${k.id}`).textContent = fmt(v, k.fmt);
    }
    S.eps = Math.max(S.cfg.epsMin, S.cfg.epsStart * Math.pow(S.cfg.epsDecay, S.episodes));
    showCode();
}

function showCode() {
    const c = cur().eng.cfg;
    const code =
        `MAT_REWARD  = ${fmt(c.mat, "int")}   CRASH = ${fmt(c.krock, "int")}   STEP = ${fmt(c.step, "int")}\n` +
        `TOWARD      = ${fmt(c.toward, "int")}   AWAY  = ${fmt(c.away, "int")}\n` +
        `EPS_START   = ${fmt(c.epsStart, "f2")}  EPS_DECAY = ${fmt(c.epsDecay, "f3")}  EPS_MIN = ${fmt(c.epsMin, "f2")}\n` +
        `ALPHA       = ${fmt(c.alpha, "f2")}   GAMMA  = ${fmt(c.gamma, "f2")}`;
    if (code !== lastCode) {
        lastCode = code;
        $("code").textContent = code;
    }
}

/* ------------------------------------------------------------- evidence --- */
function stats(s) {
    const e = s.episodes;
    const last50 = e.slice(-50);
    const avgAt = (n) => {
        if (e.length < n) return 0;
        const w = e.slice(n - 50, n);
        return w.reduce((a, x) => a + x.score, 0) / w.length;
    };
    return {
        episodes: e.length,
        crashFast: last50.filter((x) => x.cause === "crash" && x.score === 0 && x.steps <= 14).length,
        meanSteps: last50.length ? last50.reduce((a, x) => a + x.steps, 0) / last50.length : 999,
        aloof: last50.filter((x) => x.score === 0 && x.steps >= 40).length,
        avgAt500: avgAt(Math.min(500, e.length)),
        avgAt1000: avgAt(Math.min(1000, e.length)),
        epsStart: s.eng.cfg.epsStart,
        epsDecay: s.eng.cfg.epsDecay,
        best: e.reduce((a, x) => Math.max(a, x.score), 0),
    };
}

function goalHits(goal) {
    for (let i = 0; i < sessions.length; i++) {
        if (goal.test(stats(sessions[i]))) return i;
    }
    return -1;
}

function updateEvidence() {
    const def = levelDef();
    const chips = def.goals.map((g) => {
        const at = goalHits(g);
        const st = at >= 0 ? stats(sessions[at]) : null;
        const cls = at >= 0 ? "ok" : "no";
        const where = at >= 0 ? ` · proved in S${at + 1}` : "";
        return `<div class="chip ${cls}">${at >= 0 ? "✔" : "✘"} ${g.text}<span class="dim">${g.need}${where}</span></div>`;
    });
    $("evidence").innerHTML = chips.join("");
    return def.goals.every((g) => goalHits(g) >= 0);
}

function renderLevelCard() {
    const def = levelDef();
    $("level-card").innerHTML =
        `<h3>${def.title}</h3><p class="dim">${def.text}</p>` +
        `<p class="dim">Unlocked: ${def.knobs.map((k) => KNOBS.find((x) => x.id === k).label).join(" · ")}</p>` +
        def.goals.map((g) => `<p class="goal">▸ ${g.text}<br><span class="dim">${g.need}</span><br><span class="dim">hint: ${g.hint}</span></p>`).join("");
}

/* ---------------------------------------------------------- level up ------ */
let levelPending = {};

function checkProgress() {
    if (levelPending[level] || cleared[level]) return;
    if (!updateEvidence()) return;
    if (!me) {
        note(`Behaviour for level ${level} proven — sign in to bank it.`);
        return;
    }
    levelPending[level] = true;
    fetch("api/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: me, level, evidence: levelDef().goals.map((g) => g.id) }),
    })
        .then((r) => r.json())
        .then((d) => {
            if (!d.ok) {
                levelPending[level] = false;
                note(d.error || "server said no");
                return;
            }
            cleared[level] = true;
            const reached = d.reached || d.level;
            level = Math.min(LEVELS.length, reached + 1);
            applyLevelLocks();
            buildKnobs();
            renderLevelCard();
            if (reached < LEVELS.length) {
                note(`Level ${reached} cleared — the next panel is unlocked. New session, new brain, go again.`, true);
            } else {
                note("All three behaviours demonstrated. The lab is yours to run.", true);
            }
            refreshBoard();
        })
        .catch(() => {
            levelPending[level] = false;
            note("Server unreachable — is the app running?");
        });
}

/* ------------------------------------------------------------- drawing --- */
function draw() {
    const ctx = board.getContext("2d");
    const S = cur().eng;
    const tile = board.width / S.cfg.grid;
    ctx.fillStyle = THEME.boardBg;
    ctx.fillRect(0, 0, board.width, board.height);

    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < S.cfg.grid; i++) {
        ctx.moveTo(i * tile, 0);
        ctx.lineTo(i * tile, board.height);
        ctx.moveTo(0, i * tile);
        ctx.lineTo(board.width, i * tile);
    }
    ctx.stroke();

    ctx.fillStyle = THEME.apple;
    ctx.fillRect(S.G.apple[0] * tile + 1, S.G.apple[1] * tile + 1, tile - 3, tile - 3);
    for (let i = 0; i < S.G.body.length; i++) {
        const p = S.G.body[i];
        ctx.fillStyle = i === 0 ? THEME.head : THEME.body;
        ctx.fillRect(p[0] * tile + 1, p[1] * tile + 1, tile - 3, tile - 3);
    }
}

function drawAvg() {
    const ctx = avgCv.getContext("2d");
    const W = avgCv.width, H = avgCv.height, pad = 10;
    ctx.fillStyle = THEME.chartBg;
    ctx.fillRect(0, 0, W, H);

    const s = cur();
    const e = s.episodes;
    const budget = level === 1 ? 0 : level === 2 ? 500 : 1000;
    const target = level === 1 ? 0 : level === 2 ? 10 : 13;
    const span = Math.max(500, budget, e.length);

    const series = [];
    let sum = 0;
    for (let i = 0; i < e.length; i++) {
        sum += e[i].score;
        if (i >= 50) sum -= e[i - 50].score;
        if (i >= 49) series.push([i + 1, sum / 50]);
    }
    const maxY = Math.max(target * 1.6, 10, series.reduce((a, p) => Math.max(a, p[1]), 0));
    const x = (i) => pad + (W - 2 * pad) * (i / span);
    const y = (v) => H - pad - (H - 2 * pad) * (v / maxY);

    ctx.strokeStyle = THEME.axis;
    ctx.beginPath();
    ctx.moveTo(pad, y(0));
    ctx.lineTo(W - pad, y(0));
    ctx.stroke();

    if (target) {
        ctx.strokeStyle = THEME.goal;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(pad, y(target));
        ctx.lineTo(W - pad, y(target));
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (budget) {
        ctx.strokeStyle = THEME.axis;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x(budget), pad);
        ctx.lineTo(x(budget), H - pad);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.strokeStyle = THEME.avg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo)(x(p[0]), y(p[1])));
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = THEME.text;
    ctx.font = "11px monospace";
    ctx.fillText(`avg last 50 · target ${target || "—"} · budget ${budget || "—"}`, 8, 12);
    ctx.fillText(`games ${e.length}`, W - 70, 12);
}

function drawEps() {
    const ctx = epsCv.getContext("2d");
    const W = epsCv.width, H = epsCv.height, pad = 10;
    ctx.fillStyle = THEME.chartBg;
    ctx.fillRect(0, 0, W, H);

    const e = cur().episodes;
    const span = Math.max(500, e.length);
    const x = (i) => pad + (W - 2 * pad) * (i / span);
    const y = (v) => H - pad - (H - 2 * pad) * v;

    ctx.strokeStyle = THEME.axis;
    ctx.beginPath();
    ctx.moveTo(pad, y(0));
    ctx.lineTo(W - pad, y(0));
    ctx.stroke();

    ctx.strokeStyle = THEME.eps;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    e.forEach((ep, i) => ctx.lineTo(x(i + 1), y(ep.eps)));
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = THEME.text;
    ctx.font = "11px monospace";
    ctx.fillText(`ε now ${cur().eng.eps.toFixed(3)}`, 8, 12);
}

function statusLine() {
    const s = cur();
    $("status").textContent =
        `S${active + 1} · game ${s.episodes.length + 1} | this game: ${s.eng.G.score} 🍎 in ${s.eng.G.alive} steps | brain ${s.eng.Q.size} | ε ${s.eng.eps.toFixed(3)}`;
}

function logLearning(s) {
    const st = stats(s);
    logLines.push(`S${active + 1} · game ${st.episodes}: avg50 ${st.avgAt1000.toFixed(1)} | best ${st.best} | ε ${s.eng.eps.toFixed(3)} | brain ${s.eng.Q.size}`);
    if (logLines.length > 12) logLines = logLines.slice(-12);
    logEl.textContent = "[learning] " + logLines.join("\n[learning] ");
}

/* --------------------------------------------------------------- actions --- */
$("btn-start").addEventListener("click", () => {
    const s = cur();
    s.running = !s.running;
    $("btn-start").classList.toggle("on", s.running);
    $("btn-start").textContent = s.running ? "⏸ Pause training" : "▶ Start training";
});
$("btn-new").addEventListener("click", addSession);
$("btn-save").addEventListener("click", saveResult);
$("btn-exam").addEventListener("click", runExam);
$("btn-signin").addEventListener("click", openGate);
$("p-clear").addEventListener("click", wipeBrain);

TABS.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.i) selectSession(Number(t.dataset.i));
});

function sliderCfg() {
    const c = { grid: 12 };
    for (const k of KNOBS) c[k.id] = Number($(`sl-${k.id}`).value);
    return c;
}

function addSession() {
    if (sessions.length >= 6) {
        note("Six sessions is the limit — pick one with the tabs.");
        return;
    }
    sessions.push({ eng: ENG.newSession(sliderCfg()), episodes: [], running: false });
    active = sessions.length - 1;
    logLines = [];
    renderTabs();
    draw();
    drawAvg();
    drawEps();
    statusLine();
    note(`Session ${sessions.length} has its own fresh brain with the recipe on the panel.`, true);
}

function selectSession(i) {
    if (i < 0 || i >= sessions.length || i === active) return;
    active = i;
    logLines = [];
    renderTabs();
    showCode();
    draw();
    drawAvg();
    drawEps();
    statusLine();
    note(`Now on Session ${i + 1} · ${sessions[i].episodes.length} games · best ${stats(sessions[i]).best}.`);
}

function renderTabs() {
    TABS.innerHTML =
        sessions.map((s, i) =>
            `<button class="btn tab${i === active ? " on" : ""}" data-i="${i}">S${i + 1} · ${stats(s).best} 🍎</button>`
        ).join("");
}

function wipeBrain() {
    const s = cur();
    s.eng.Q.clear();
    s.eng.episodes = 0;
    s.eng.eps = s.eng.cfg.epsStart;
    s.episodes = [];
    ENG.reset(s.eng);
    logLines = [];
    logEl.textContent = "[learning] brain wiped";
    draw();
    drawAvg();
    drawEps();
    statusLine();
    note(`Brain of Session ${active + 1} wiped. The other sessions kept their brains.`);
}

function saveResult() {
    const s = cur();
    if (!me) return note("Sign in first — the name is what the leaderboard sorts by.");
    if (!s.episodes.length) return note("Train a few games first, then save.");
    const st = stats(s);
    post("api/submit", {
        name: me,
        label: `Session ${active + 1} · level ${level}`,
        config: s.eng.cfg,
        record: st.best,
        avg: Number(st.avgAt1000.toFixed(2)),
        games: st.episodes,
        brain: s.eng.Q.size,
        level,
    }, (d) => {
        note(`Saved! Attempt ${d.attempts} · your best is now ${d.best.record} apples.`, true);
        refreshBoard();
    });
}

function runExam() {
    const s = cur();
    if (!me) return note("Sign in first.");
    if (s.running) {
        s.running = false;
        $("btn-start").classList.remove("on");
        $("btn-start").textContent = "▶ Start training";
    }
    const S = s.eng;
    const epsWas = S.eps;
    S.eps = 0;                                  // the rules of the final
    ENG.reset(S);
    const matches = [];
    for (let m = 0; m < 3; m++) {
        let guard = 0;
        while (guard++ < 5000) {
            const r = ENG.tick(S);
            if (r.done) {
                matches.push(r.score);
                break;
            }
        }
        if (matches.length < m + 1) matches.push(S.G.score);
    }
    S.eps = epsWas;
    const total = matches.reduce((a, b) => a + b, 0);
    $("status").textContent = `Final exam: ${matches.join(" + ")} = ${total} apples`;
    draw();
    post("api/exam", { name: me, config: S.cfg, matches }, (d) => {
        note(`Final exam saved: ${d.exam.matches.join(" + ")} = ${d.exam.total} apples.`, true);
        refreshBoard();
    });
}

function post(url, body, onOk) {
    fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
        .then((r) => r.json())
        .then((d) => {
            if (d.ok) onOk(d);
            else note(d.error || "server said no");
        })
        .catch(() => note("Server unreachable — is the app running?"));
}

function note(text, ok = false) {
    const el = gateIsOpen() ? $("reg-state") : $("notice");
    el.textContent = text;
    el.classList.toggle("ok", ok);
}

function openGate() {
    GATE.classList.remove("off");
    $("reg-name").value = "";
    $("reg-state").textContent = "Not signed in yet.";
    $("reg-state").classList.remove("ok");
}

function closeGate() {
    GATE.classList.add("off");
    document.body.classList.remove("locked");
    $("who").textContent = `Signed in as ${me}.`;
    $("who").classList.add("ok");
    $("notice").textContent = "Level 1 is open: make the worm crash on purpose, then make it refuse apples.";
    $("notice").classList.add("ok");
}

/* ---------------------------------------------------------- registration --- */
$("reg-btn").addEventListener("click", () => {
    const name = $("reg-name").value.trim();
    if (!name) return note("Write your name in the box.");
    post("api/register", { name }, (d) => {
        me = d.name;
        closeGate();
        refreshBoard();
    });
});

$("reg-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("reg-btn").click();
});

/* ---------------------------------------------------------- leaderboard --- */
function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBoard(data) {
    $("class-record").textContent =
        `Class record: ${data.classRecord} 🏆 · ${data.studentCount} signed in`;

    const rows = data.training.map((s) => {
        const cls = s.name === me ? "me" : s.rank === 1 ? "gold" : "";
        const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : s.rank;
        return `<tr class="${cls}"><td>${medal}</td><td>${esc(s.name)}</td><td>${s.record}</td>` +
            `<td>${s.avg}</td><td>${s.attempts}</td><td>${s.brain}</td>` +
            `<td>Lv ${s.level || 0}/3</td><td>${esc(s.label || "–")}</td></tr>`;
    });
    $("lb-training").innerHTML = rows.length
        ? `<table><tr><th>#</th><th>Trainer</th><th>Best</th><th>Avg</th><th>Attempts</th><th>Brain</th><th>Levels</th><th>Session</th></tr>${rows.join("")}</table>`
        : "No results yet — be the first!";

    const examRows = data.exam.map((s) =>
        `<tr class="${s.name === me ? "me" : s.rank === 1 ? "gold" : ""}"><td>${s.rank}</td>` +
        `<td>${esc(s.name)}</td><td>${s.matches.join(" + ")} = <b>${s.total}</b></td></tr>`);
    $("lb-exam").innerHTML = examRows.length
        ? `<table><tr><th>#</th><th>Trainer</th><th>Final (3 games)</th></tr>${examRows.join("")}</table>`
        : "No final runs yet.";
}

function refreshBoard() {
    fetch("api/leaderboard").then((r) => r.json()).then(renderBoard);
}

/* -------------------------------------------------------------- game loop -- */
const THEME = {
    boardBg: "#fbfaf4", grid: "#e2dfd4", apple: "#c03a3a", head: "#2f8f2f", body: "#1f6b1f",
    chartBg: "#fbfaf4", axis: "#c6c4bb", avg: "#9a6b12", eps: "#2f8f2f", goal: "#c03a3a", text: "#5f686d",
};

buildKnobs();
renderLevelCard();
addSession();
draw();
drawAvg();
drawEps();
statusLine();
refreshBoard();
setInterval(refreshBoard, 5000);

function frame() {
    frameNo++;
    applyLevelLocks();
    readSliders();
    const s = cur();
    if (s.running) {
        const speed = Number($("speed").value) || 2;
        const blitz = speed >= 4;
        const skip = speed === 1 && slowTick++ % 4 !== 0;
        if (!skip) {
            const n = blitz ? 4000 : speed === 3 ? 250 : 1;
            for (let i = 0; i < n && s.episodes.length < MAX_EPISODES; i++) {
                const r = ENG.tick(s.eng);
                if (r.done && s.episodes.length < MAX_EPISODES) s.episodes.push(r);
            }
            if (!blitz) draw();
            if (frameNo % 3 === 0) {
                drawAvg();
                drawEps();
                statusLine();
                logLearning(s);
            }
            if (frameNo % 10 === 0) checkProgress();
        }
    }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
