/* End-to-end pedagogy check: can Level 1 actually be cleared from the UI?
 * Drives the real app.js through a fake DOM: two sessions, one that crashes on
 * purpose, one that circles and refuses apples — then expects the level post.
 *   bun test/levels-test.js                                                   */

import { readFileSync } from "node:fs";

const els = {};
let document0;
function mkEl(id, cls = "") {
    const el = { id, value: "", textContent: "", innerHTML: "", listeners: [], dataset: {} };
    const set = new Set(cls.split(" ").filter(Boolean));
    el.classList = {
        add: (c) => set.add(c), remove: (c) => set.delete(c),
        toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
        contains: (c) => set.has(c),
    };
    el.addEventListener = (type, fn) => el.listeners.push(fn);
    el.parentElement = document0 || el;
    els[id] = el;
    return el;
}
document0 = mkEl("root", "");

for (const id of readFileSync("public/index.html", "utf8").match(/id="([^"]+)"/g).map((s) => s.slice(4, -1)))
    mkEl(id);
for (const id of ["board", "avg", "eps"]) { els[id].width = 432; els[id].height = 200; els[id].getContext = () => ctx2d; }
const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });

const document = { getElementById: (id) => els[id] ?? mkEl(id), body: document0 };

const src = readFileSync("public/engine.js", "utf8") + "\n" + readFileSync("public/app.js", "utf8");
const run = new Function("document", "fetch", "requestAnimationFrame", "setInterval",
    src + "\nreturn { sessions, active, level, cleared, goalHits, checkProgress, stats, cur, addSession, LEVELS };");

const posted = [];
const fakeFetch = (url, opts) => {
    const sent = JSON.parse((opts && opts.body) || "{}");
    if (opts && opts.method === "POST") posted.push(`${url} ${sent.name || ""} lv${sent.level || "-"}`);
    const out = url.includes("level")
        ? { ok: true, name: sent.name, level: sent.level, reached: sent.level }
        : url.includes("leaderboard")
            ? { ok: true, updatedAt: "now", studentCount: 0, classRecord: 0, training: [], exam: [] }
            : { ok: true, name: sent.name, attempts: 1, best: { record: 9, avg: 2.5, config: {} } };
    return Promise.resolve({ json: () => Promise.resolve(out) });
};

let rafQueue = [];
const raf = (cb) => rafQueue.push(cb);
const api = run(document, fakeFetch, raf, () => {});

function setKnobs(cfg) {
    for (const [k, v] of Object.entries(cfg)) document.getElementById(`sl-${k}`).value = String(v);
}
function frames(n) {
    for (let i = 0; i < n && rafQueue.length; i++) { const cb = rafQueue.shift(); cb(); }
}

// sign in, blitz speed, then the two Level 1 experiments
els["speed"].value = "4";
els["reg-name"].value = "Test Person";
els["reg-btn"].listeners.forEach((fn) => fn({ type: "click" }));
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
await tick();
frames(2);

setKnobs({ mat: -50, krock: 100, toward: 0, away: 0 });
els["btn-start"].listeners.forEach((fn) => fn({ type: "click" }));
frames(60);
const suicide = api.goalHits(api.LEVELS[0].goals[0]) >= 0;
console.log("suicide goal met in some session:", suicide);

api.addSession();
setKnobs({ mat: -50, krock: -300, step: -1, toward: 0, away: 0 });
els["btn-start"].listeners.forEach((fn) => fn({ type: "click" }));
frames(60);
const aloof = api.goalHits(api.LEVELS[0].goals[1]) >= 0;
console.log("aloof goal met in some session:", aloof);

frames(30);
await tick();
api.checkProgress();      // the UI runs this every 10th frame
await tick();
for (let i = 0; i < api.sessions.length; i++) { const st = api.stats(api.sessions[i]); console.log(`  S${i+1}: games ${st.episodes} best ${st.best} mean ${st.meanSteps.toFixed(1)} crashAll ${st.crashAll} aloof ${st.aloof}`); }
console.log("level now:", api.level, "cleared:", JSON.stringify(api.cleared));
console.log("posts:", posted.join(" ; "));

// Level 2: only ε is yours — anneal it and the curve settles inside 500 games
setKnobs({ epsStart: 0.3, epsDecay: 0.98, epsMin: 0 });
api.addSession();
els["btn-start"].listeners.forEach((fn) => fn({ type: "click" }));
frames(40);
await tick();
api.checkProgress();
await tick();
const l2 = api.stats(api.sessions[api.sessions.length - 1]);
console.log("level 2 · avg20 at game 500:", l2.avgAt500.toFixed(1), "· cleared:", JSON.stringify(api.cleared));

// Level 3: α and γ — optimise length inside 1000 games
setKnobs({ alpha: 0.2, gamma: 0.9 });
api.addSession();
els["btn-start"].listeners.forEach((fn) => fn({ type: "click" }));
frames(60);
await tick();
api.checkProgress();
await tick();
const l3 = api.stats(api.sessions[api.sessions.length - 1]);
console.log("level 3 · avg20 at game 1000:", l3.avgAt1000.toFixed(1), "· cleared:", JSON.stringify(api.cleared));
console.log("posts:", posted.join(" ; "));
