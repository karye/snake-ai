/* Headless reproduction of the arena: fake DOM, click ▶, run frames.
   bun test/loop-test.js                                                      */

import { readFileSync } from "node:fs";

const ids = readFileSync("public/index.html", "utf8").match(/id="([^"]+)"/g)
    .map((s) => s.slice(4, -1));

const els = {};
for (const id of ids) {
    const el = { id, value: "", textContent: "", innerHTML: "", listeners: [] };
    const set = new Set();
    el.classList = {
        add: (c) => set.add(c), remove: (c) => set.delete(c),
        toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
        contains: (c) => set.has(c),
    };
    el.addEventListener = (type, fn) => el.listeners.push(fn);
    els[id] = el;
}
// defaults the browser would give from the HTML attributes
els["sl-mat"].value = "20"; els["sl-krock"].value = "-100";
els["sl-step"].value = "-1"; els["sl-eps"].value = "0.1";
els["grid-size"].value = "12"; els["speed"].value = "2";
for (const id of ["board", "curve"]) els[id].width = 432, els[id].height = 432;
const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });
for (const id of ["board", "curve"]) els[id].getContext = () => ctx2d;

const document = { getElementById: (id) => els[id] ?? null, body: els["app"] };
document.body = { classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false } };

function click(id) { els[id].listeners.forEach((fn) => fn({ type: "click", target: els[id] })); }

const src = readFileSync("public/engine.js", "utf8") + "\n" + readFileSync("public/app.js", "utf8");
const run = new Function("document", "fetch", "requestAnimationFrame", "setInterval", src + "\nreturn { sessions, active, ENG, cur, readSliders, draw, drawCurve, statusLine, showCode };");

const board = { ok: true, updatedAt: "now", studentCount: 0, classRecord: 0, training: [], exam: [] };
const fakeFetch = (url, opts) => Promise.resolve({ json: () => Promise.resolve(board) });

let rafQueue = [];
const raf = (cb) => rafQueue.push(cb);

const api = run(document, fakeFetch, raf, () => {});
console.log("sessions:", api.sessions.length, "active:", api.active, "eng?", api.sessions.map((s) => s.eng && !!s.eng.cfg));

console.log("frames queued at load:", rafQueue.length);

click("btn-start");
console.log("btn-start text after click:", JSON.stringify(els["btn-start"].textContent));

let errors = [];
for (let i = 0; i < 40 && rafQueue.length; i++) {
    const cb = rafQueue.shift();
    try { cb(); } catch (e) { errors.push((e.stack || String(e))); break; }
}

console.log("errors:", errors.length ? errors.join("\n") : "none");
function probe(name, fn) {
    try { fn(); console.log("  ok   " + name); }
    catch (e) { console.log("  THROW " + name + " -> " + String(e)); }
}
console.log("--- calling each arena function on its own ---");
probe("readSliders", api.readSliders);
probe("draw", api.draw);
probe("drawCurve", api.drawCurve);
probe("statusLine", api.statusLine);
probe("showCode", api.showCode);
probe("ENG.tick", () => api.ENG.tick(api.cur().eng));
const s0 = api.sessions[api.active];
console.log("after frames -> gamesDone:", s0.gamesDone, "scores:", s0.scores.length, "best:", s0.best, "running:", s0.running);
