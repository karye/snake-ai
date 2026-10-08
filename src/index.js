#!/usr/bin/env bun
/**
 * Snake AI Lab — Bun web app (zero external dependencies).
 *
 * The server only knows about:
 *   GET  /                     -> public/index.html
 *   GET  /app.css /app.js      -> static assets
 *   GET  /api/leaderboard      -> leaderboard (JSON)
 *   POST /api/register         -> {name}                        registration
 *   POST /api/level            -> {name, level, evidence}       behaviour gate cleared
 *   POST /api/submit           -> {name, config, record, ...}   training result
 *   POST /api/exam             -> {name, config, matches[3]}    final exam (3 games, eps = 0)
 *
 * State lives next to the app in data/records.json.
 */

import { serve } from "bun";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.SNAKE_ROOT || process.cwd();
const PORT = Number(process.env.SNAKE_PORT || 3020);
const PUBLIC = join(ROOT, "public");
const DATA_FILE = join(ROOT, "data", "records.json");

// ------------------------------------------------------------------ records --
function loadRecords() {
    try {
        return JSON.parse(readFileSync(DATA_FILE, "utf8"));
    } catch {
        return { students: {} };
    }
}

let records = loadRecords();

function saveRecords() {
    try {
        mkdirSync(join(ROOT, "data"), { recursive: true });
        writeFileSync(DATA_FILE, JSON.stringify(records, null, 2));
    } catch (e) {
        console.log("could not write records: " + e);
    }
}

// ------------------------------------------------------------- name/config --
function cleanName(raw) {
    let n = String(raw ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (n.length > 40) n = n.slice(0, 40).trim();
    return n;
}

function cleanLabel(raw) {
    let n = String(raw ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (n.length > 24) n = n.slice(0, 24).trim();
    return n;
}

function clampNum(raw, min, max, def) {
    const v = Number(raw);
    if (!isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
}

function cleanConfig(c) {
    c = c || {};
    return {
        mat: clampNum(c.mat, 0, 100, 20),
        krock: clampNum(c.krock, -300, 0, -100),
        step: clampNum(c.step, -10, 0, -1),
        eps: clampNum(c.eps, 0, 1, 0.1),
        grid: clampNum(c.grid, 4, 16, 12),
    };
}

// ------------------------------------------------------------------ handlers --
function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
        },
    });
}

async function readJsonBody(req) {
    try {
        return JSON.parse(await req.text() || "{}");
    } catch {
        return {};
    }
}

function touchStudent(name) {
    if (!records.students[name]) {
        records.students[name] = {
            name,
            registeredAt: new Date().toISOString(),
            attempts: 0,
            best: null,
            exam: null,
            levels: {},
        };
    }
    return records.students[name];
}

function levelReached(s) {
    const got = Object.keys(s.levels || {}).map(Number).filter((n) => n >= 1 && n <= 3);
    return got.length ? Math.max(...got) : 0;
}

function handleRegister(body) {
    const name = cleanName(body && body.name);
    if (!name) return json({ ok: false, error: "Send a `name`." }, 400);
    touchStudent(name);
    saveRecords();
    return json({ ok: true, name });
}

function handleLevel(body) {
    const name = cleanName(body && body.name);
    if (!name) return json({ ok: false, error: "Send a `name`." }, 400);
    const n = Math.round(clampNum(body && body.level, 1, 3, 0));
    if (n < 1) return json({ ok: false, error: "Send `level` (1..3)." }, 400);
    const s = touchStudent(name);
    const evidence = (Array.isArray(body && body.evidence) ? body.evidence : [])
        .slice(0, 4)
        .map((g) => cleanLabel(g));
    s.levels[n] = { at: new Date().toISOString(), evidence };
    saveRecords();
    return json({ ok: true, name, level: n, reached: levelReached(s) });
}

function handleSubmit(body) {
    const name = cleanName(body && body.name);
    if (!name) return json({ ok: false, error: "Send a `name`." }, 400);
    const s = touchStudent(name);
    const cfg = cleanConfig(body && body.config);
    const record = Math.round(clampNum(body && body.record, 0, 999, 0));
    const games = Math.round(clampNum(body && body.games, 0, 1000, 0));
    const avg = Number(clampNum(body && body.avg, -999, 999, 0).toFixed(2));
    const brain = Math.round(clampNum(body && body.brain, 0, 100000, 0));
    const bestSteps = Math.round(clampNum(body && body.bestSteps, 0, 100000, 0));
    const lvl = Math.round(clampNum(body && body.level, 0, 3, 0));
    const label = cleanLabel(body && body.label);

    s.attempts += 1;
    if (!s.best || record > s.best.record || (record === s.best.record && avg > s.best.avg)) {
        s.best = { record, avg, games, brain, bestSteps, label, level: lvl, config: cfg, at: new Date().toISOString() };
    }
    saveRecords();
    return json({ ok: true, name, best: s.best, attempts: s.attempts });
}

function handleExam(body) {
    const name = cleanName(body && body.name);
    if (!name) return json({ ok: false, error: "Send a `name`." }, 400);
    const s = touchStudent(name);
    const cfg = cleanConfig(body && body.config);
    const raw = Array.isArray(body && body.matches) ? body.matches.slice(0, 3) : [];
    if (raw.length < 1) return json({ ok: false, error: "Send `matches` (3 games)." }, 400);
    const matches = raw.map((m) => Math.round(clampNum(m, 0, 999, 0)));
    const total = matches.reduce((a, b) => a + b, 0);
    if (!s.exam || total > s.exam.total) {
        s.exam = { total, matches, config: cfg, at: new Date().toISOString() };
    }
    saveRecords();
    return json({ ok: true, name, exam: s.exam });
}

function leaderboard() {
    const list = Object.values(records.students);
    const training = list
        .filter((s) => s.best)
        .sort((a, b) => b.best.record - a.best.record || b.best.avg - a.best.avg)
        .map((s, i) => ({ rank: i + 1, name: s.name, level: levelReached(s), attempts: s.attempts, ...s.best }));
    const exam = list
        .filter((s) => s.exam)
        .sort((a, b) => b.exam.total - a.exam.total)
        .map((s, i) => ({ rank: i + 1, name: s.name, ...s.exam }));
    return json({
        ok: true,
        updatedAt: new Date().toISOString(),
        studentCount: list.length,
        classRecord: training.length ? training[0].record : 0,
        training,
        exam,
    });
}

// -------------------------------------------------------------------- static --
const ASSETS = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.css": "app.css",
    "/engine.js": "engine.js",
    "/app.js": "app.js",
};

function serveStatic(url) {
    const file = ASSETS[url];
    if (!file) return new Response("not found", { status: 404 });
    const body = readFileSync(join(PUBLIC, file));
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html";
    return new Response(body, {
        headers: {
            "Content-Type": `${type}; charset=utf-8`,
            // the class edits these files during the lesson: never hand back a cached copy,
            // otherwise an old app.js runs against a new engine.js and the loop dies
            "Cache-Control": "no-store",
        },
    });
}

// --------------------------------------------------------------------- serve --
serve({
    port: PORT,
    async fetch(req) {
        const raw = req.url || "/";
        const url = raw.startsWith("http") ? new URL(raw).pathname : raw.split("?")[0];

        if (req.method === "GET" || req.method === "HEAD") {
            if (url.startsWith("/api/")) {
                if (url === "/api/leaderboard") return leaderboard();
                if (url === "/api/health") return json({ ok: true, port: PORT });
                return json({ ok: false, error: `unknown api ${url}` }, 404);
            }

            const resp = serveStatic(url);
            if (req.method === "HEAD") {
                return new Response(null, {
                    status: resp.status,
                    headers: resp.headers,
                });
            }
            return resp;
        }

        if (url.startsWith("/api/")) {
            if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

            const body = await readJsonBody(req);
            if (url === "/api/register") return handleRegister(body);
            if (url === "/api/level") return handleLevel(body);
            if (url === "/api/submit") return handleSubmit(body);
            if (url === "/api/exam") return handleExam(body);
            return json({ ok: false, error: `unknown api ${url}` }, 404);
        }

        return new Response("nope", { status: 405 });
    },
});

console.log(`🐍 Snake AI Lab ready at http://localhost:${PORT}/  (data: ${DATA_FILE})`);
