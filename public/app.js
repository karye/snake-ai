/* ===========================================================================
 * app.js — UI + wiring to the server. The learning itself lives in engine.js.
 *
 * A SESSION = one recipe + one brain + one chart. The tabs under the arena
 * switch between them, "＋ New session" starts a fresh brain with whatever
 * recipe the panel shows — that is how the class compares two recipes.
 * =========================================================================== */

const $ = (id) => document.getElementById(id);
const GAMES_PER_ATTEMPT = 100;      // the number that counts on the leaderboard
const MAX_SESSIONS = 6;

let sessions = [];                  // each: { eng, scores, best, stepsBest, gamesDone, finished, running }
let active = 0;
let me = null;
let logLines = [], lastCode = "", slowTick = 0;

const board = $("board");
const curve = $("curve");
const logEl = $("log");
const GATE = $("gate");
const TABS = $("sessions");

/* canvas colours live here so they can match app.css (light theme) */
const THEME = {
    boardBg: "#fbfaf4", grid: "#e2dfd4", apple: "#c03a3a", head: "#2f8f2f", body: "#1f6b1f",
    chartBg: "#fbfaf4", axis: "#c6c4bb", dots: "#7d8a7d", avg: "#9a6b12", best: "#2f8f2f", text: "#5f686d",
};

function gateIsOpen() {
    return !GATE.classList.contains("off");
}

function cur() {
    return sessions[active];
}

/* ----------------------------------------------------------- sessions --- */
function sliderCfg() {
    return {
        mat: Number($("sl-mat").value),
        krock: Number($("sl-krock").value),
        step: Number($("sl-step").value),
        eps: Number($("sl-eps").value),
        grid: Number($("grid-size").value),
    };
}

function addSession(announce = true) {
    if (sessions.length >= MAX_SESSIONS) {
        note(`Six sessions is the limit — pick one with the tabs, or wipe a brain.`);
        return;
    }
    sessions.push({
        eng: ENG.newSession(sliderCfg()),
        scores: [],
        best: 0,
        stepsBest: 0,
        gamesDone: 0,
        finished: false,
        running: false,
    });
    active = sessions.length - 1;
    logLines = [];
    renderTabs();
    showCode();
    draw();
    drawCurve();
    statusLine();
    if (announce) note(`Session ${sessions.length} has its own fresh brain. Press ▶ and watch the curve.`, true);
}

function selectSession(i) {
    if (i < 0 || i >= sessions.length || i === active) return;
    active = i;
    logLines = [];
    renderTabs();
    showCode();
    draw();
    drawCurve();
    statusLine();
    logEl.textContent = sessions[i].scores.length
        ? `[learning] switched to session ${i + 1} — record ${sessions[i].best}`
        : `[learning] session ${i + 1} has not played yet`;
    note(`Now on Session ${i + 1} · record ${sessions[i].best} · brain ${sessions[i].eng.Q.size}.`);
}

function renderTabs() {
    TABS.innerHTML =
        sessions.map((s, i) =>
            `<button class="btn tab${i === active ? " on" : ""}" data-i="${i}">S${i + 1} · ${s.best} 🍎</button>`
        ).join("") +
        `<button class="btn new" data-new="1">＋ New session</button>`;
}

/* --------------------------------------------------------- control panel --- */
function readSliders() {
    const S = cur().eng;
    const gridWas = S.cfg.grid;
    S.cfg.mat = Number($("sl-mat").value);
    S.cfg.krock = Number($("sl-krock").value);
    S.cfg.step = Number($("sl-step").value);
    S.cfg.eps = Number($("sl-eps").value);
    S.cfg.grid = Number($("grid-size").value);

    $("v-mat").textContent = String(S.cfg.mat);
    $("v-krock").textContent = String(S.cfg.krock);
    $("v-step").textContent = String(S.cfg.step);
    $("v-eps").textContent = S.cfg.eps.toFixed(2);

    showCode();

    if (gridWas !== S.cfg.grid) {
        ENG.reset(S);      // new board -> start a fresh game
        draw();
        statusLine();
    }
}

function showCode() {
    const c = cur().eng.cfg;
    const code =
        `MAT_REWARD    = ${c.mat}\nCRASH_PENALTY = ${c.krock}\n` +
        `STEP_COST     = ${c.step}\nEXPLORATION   = ${c.eps.toFixed(2)}`;
    if (code !== lastCode) {
        lastCode = code;
        $("code").textContent = code;
    }
}

const PRESETS = {
    "p-plain": { mat: 20, krock: -100, step: -1, eps: 0.1 },
    "p-fast": { mat: 60, krock: -40, step: -4, eps: 0.05 },
    "p-turtle": { mat: 15, krock: -250, step: 0, eps: 0.05 },
    "p-chaos": { mat: 30, krock: -100, step: -1, eps: 0.3 },
};

function applyPreset(cfg) {
    $("sl-mat").value = cfg.mat;
    $("sl-krock").value = cfg.krock;
    $("sl-step").value = cfg.step;
    $("sl-eps").value = cfg.eps;
    readSliders();
    note(`Recipe ${cfg.mat} / ${cfg.krock} / ${cfg.step} / ${cfg.eps} is on the panel — press ＋ New session to give a brain its own copy.`);
}

function wipeBrain() {
    const s = cur();
    s.eng.Q.clear();
    s.scores = [];
    s.best = 0;
    s.stepsBest = 0;
    s.gamesDone = 0;
    s.finished = false;
    ENG.reset(s.eng);
    logLines = [];
    logEl.textContent = `[learning] brain of session ${active + 1} wiped — watch it climb from 0`;
    draw();
    drawCurve();
    statusLine();
    note(`Brain of Session ${active + 1} wiped. The other sessions kept their brains.`);
}

/* ------------------------------------------------------------- learning --- */
function avgOf(s) {
    const last = s.scores.slice(-10);
    return last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
}

function logLearning(s) {
    logLines.push(`S${sessions.indexOf(s) + 1} · game ${s.gamesDone}: avg last 10 = ${avgOf(s).toFixed(1)} | best = ${s.best} | brain = ${s.eng.Q.size}`);
    if (logLines.length > 12) logLines = logLines.slice(-12);
    logEl.textContent = "[learning] " + logLines.join("\n[learning] ");
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
    $("notice").textContent = "The lab is open — Session 1 is already training-ready. Tune the four numbers and press ▶.";
    $("notice").classList.add("ok");
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

function drawCurve() {
    const ctx = curve.getContext("2d");
    const s = cur();
    const W = curve.width, H = curve.height, pad = 8;
    ctx.fillStyle = THEME.chartBg;
    ctx.fillRect(0, 0, W, H);

    const maxY = Math.max(10, s.best);
    const x = (i) => pad + (W - 2 * pad) * (i / GAMES_PER_ATTEMPT);
    const y = (v) => H - pad - (H - 2 * pad) * (v / maxY);

    ctx.strokeStyle = THEME.axis;
    ctx.beginPath();
    ctx.moveTo(pad, y(0));
    ctx.lineTo(W - pad, y(0));
    ctx.stroke();

    ctx.fillStyle = THEME.dots;
    s.scores.forEach((v, i) => ctx.fillRect(x(i) - 1, y(v) - 1, 3, 3));

    ctx.strokeStyle = THEME.avg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 9; i < s.scores.length; i++) {
        const win = s.scores.slice(i - 9, i + 1);
        const avg = win.reduce((a, b) => a + b, 0) / win.length;
        if (i === 9) ctx.moveTo(x(i), y(avg));
        else ctx.lineTo(x(i), y(avg));
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.strokeStyle = THEME.best;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let run = 0;
    s.scores.forEach((v, i) => {
        run = Math.max(run, v);
        if (i === 0) ctx.moveTo(x(i), y(run));
        else ctx.lineTo(x(i), y(run));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = THEME.text;
    ctx.font = "11px monospace";
    ctx.fillText(`S${active + 1} avg ${avgOf(s).toFixed(1)}`, W - 100, 14);
    ctx.fillText(`best ${s.best}`, 8, 14);
}

function statusLine() {
    const s = cur();
    $("status").textContent =
        `Session ${active + 1}: Game ${s.gamesDone + 1} | Score: ${s.eng.G.score} | Best: ${s.best} | Brain: ${s.eng.Q.size}`;
}

/* --------------------------------------------------------------- actions --- */
$("btn-start").addEventListener("click", () => {
    const s = cur();
    if (s.finished) {                       // new attempt, the brain stays trained
        s.finished = false;
        s.gamesDone = 0;
        s.scores = [];
    }
    s.running = !s.running;
    $("btn-start").classList.toggle("on", s.running);
    $("btn-start").textContent = s.running ? "⏸ Pause training" : "▶ Start training";
});

["p-plain", "p-fast", "p-turtle", "p-chaos"].forEach((id) => {
    $(id).addEventListener("click", () => applyPreset(PRESETS[id]));
});
$("p-clear").addEventListener("click", wipeBrain);
$("btn-save").addEventListener("click", saveResult);
$("btn-exam").addEventListener("click", runExam);
$("btn-signin").addEventListener("click", openGate);

TABS.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.new) return addSession();
    if (t.dataset.i) return selectSession(Number(t.dataset.i));
});

function saveResult() {
    const s = cur();
    if (!me) return note("Sign in first — the name is what the leaderboard sorts by.");
    if (!s.scores.length) return note("Train a few games first, then save.");
    post("api/submit", {
        name: me,
        label: `Session ${active + 1}`,
        config: s.eng.cfg,
        record: s.best,
        avg: avgOf(s),
        games: s.gamesDone,
        brain: s.eng.Q.size,
        bestSteps: s.stepsBest,
    }, (d) => {
        const c = d.best.config;
        note(`Saved! Attempt ${d.attempts} · your best is now ${d.best.record} points (recipe ${c.mat} / ${c.krock} / ${c.step} / ${c.eps}).`, true);
        refreshBoard();
    });
}

/* ------------------------------------------------------- final exam ------ */
function runExam() {
    const s = cur();
    if (!me) return note("Sign in first.");
    if (s.running) {
        s.running = false;
        $("btn-start").classList.remove("on");
        $("btn-start").textContent = "▶ Start training";
    }
    const S = s.eng;
    const epsWas = S.cfg.eps;
    S.cfg.eps = 0;                                  // the rules of the final
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
        if (matches.length < m + 1) matches.push(S.G.score);   // survived 5000 steps
    }
    S.cfg.eps = epsWas;
    const total = matches.reduce((a, b) => a + b, 0);
    $("status").textContent = `Final exam (session ${active + 1}): ${matches.join(" + ")} = ${total} points`;
    draw();
    post("api/exam", { name: me, config: S.cfg, matches }, (d) => {
        note(`Final exam saved: ${d.exam.matches.join(" + ")} = ${d.exam.total} points.`, true);
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

/* ---------------------------------------------------------- registration --- */
$("reg-btn").addEventListener("click", () => {
    const name = $("reg-name").value.trim();
    if (!name) return note("Write your name in the box.");
    post("api/register", { name }, (d) => {
        me = d.name;
        closeGate();          // the modal closes and the lab opens
        refreshBoard();
    });
});

$("reg-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("reg-btn").click();
});

["sl-mat", "sl-krock", "sl-step", "sl-eps", "grid-size"].forEach((id) => {
    $(id).addEventListener("input", readSliders);
});

/* ---------------------------------------------------------- leaderboard --- */
function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBoard(data) {
    $("class-record").textContent =
        `Class record: ${data.classRecord} 🏆 · ${data.studentCount} signed in`;

    const rows = data.training.map((s) => {
        const c = s.config;
        const cls = s.name === me ? "me" : s.rank === 1 ? "gold" : "";
        const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : s.rank;
        return `<tr class="${cls}"><td>${medal}</td><td>${esc(s.name)}</td><td>${s.record}</td>` +
            `<td>${s.avg}</td><td>${s.attempts}</td><td>${s.brain}</td>` +
            `<td>${esc(s.label || "–")}</td>` +
            `<td>${c.mat} / ${c.krock} / ${c.step} / ${c.eps}</td></tr>`;
    });
    $("lb-training").innerHTML = rows.length
        ? `<table><tr><th>#</th><th>Trainer</th><th>Record</th><th>Avg</th><th>Attempts</th><th>Brain</th><th>Session</th><th>Recipe (mat / crash / step / ε)</th></tr>${rows.join("")}</table>`
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
addSession(false);      // Session 1 exists from the start
draw();
drawCurve();
statusLine();
refreshBoard();
setInterval(refreshBoard, 5000);   // live updates from classmates in the room

function frame() {
    readSliders();
    const s = cur();
    if (s.running) {
        const speed = Number($("speed").value);
        const skip = speed === 1 && slowTick++ % 4 !== 0;      // 🐰 one step every 4 frames
        if (!skip) {
            const n = speed === 3 ? 250 : 1;
            for (let i = 0; i < n && s.gamesDone < GAMES_PER_ATTEMPT; i++) {
                const r = ENG.tick(s.eng);
                if (r.done) {
                    s.scores.push(r.score);
                    if (r.score > s.best) s.best = r.score;
                    if (r.steps > s.stepsBest) s.stepsBest = r.steps;
                    s.gamesDone += 1;
                    if (s.gamesDone % 10 === 0) logLearning(s);
                }
            }
            draw();
            drawCurve();
            statusLine();
            if (s.gamesDone >= GAMES_PER_ATTEMPT) {
                s.finished = true;
                s.running = false;
                $("btn-start").classList.remove("on");
                $("btn-start").textContent = "▶ Start training";
                note(`Session ${active + 1} done: ${s.best} points in 100 games. Save it, tweak one number, press ＋ New session.`);
            }
        }
    }
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
