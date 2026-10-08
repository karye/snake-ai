/* Headless boot + training check for the app (no browser).
 * Builds a fake DOM, loads engine.js + app.js, presses ▶ and runs frames.
 *   bun test/loop-test.js                                                     */

import { readFileSync } from "node:fs";

const els = {};
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
let document0;
document0 = mkEl("root", "");

// elements the HTML declares (the app also creates sliders at runtime)
for (const id of readFileSync("public/index.html", "utf8").match(/id="([^"]+)"/g).map((s) => s.slice(4, -1)))
    mkEl(id);

// defaults the browser would read from the markup
els["speed"].value = "2";
for (const id of ["board", "avg", "eps"]) { els[id].width = 432; els[id].height = 200; els[id].getContext = () => ctx2d; }
const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });

const document = { getElementById: (id) => els[id] ?? mkEl(id), body: document0 };
document.body.classList.add("locked");

function click(id) { els[id].listeners.forEach((fn) => fn({ type: "click", target: els[id] })); }

const src = readFileSync("public/engine.js", "utf8") + "\n" + readFileSync("public/app.js", "utf8");
const run = new Function("document", "fetch", "requestAnimationFrame", "setInterval", src + "\nreturn { sessions, active, level, cleared, stats, cur };");

const posted = [];
const fakeFetch = (url, opts) => {
    const sent = JSON.parse((opts && opts.body) || "{}");
    if (opts && opts.method === "POST") posted.push(url + " " + (sent.name || ""));
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

console.log("booted:", api.sessions.length, "session(s), level", api.level);

click("btn-start");
console.log("btn-start text:", JSON.stringify(els["btn-start"].textContent));

let errors = [];
for (let i = 0; i < 120 && rafQueue.length; i++) {
    const cb = rafQueue.shift();
    try { cb(); } catch (e) { errors.push(String(e)); break; }
}
console.log("errors:", errors.length ? errors.join(" | ") : "none");

const st = api.stats(api.cur());
console.log("after frames -> games:", st.episodes, "best:", st.best, "meanSteps:", st.meanSteps.toFixed(1), "aloof:", st.aloof);
console.log("posts:", posted.join(" ; ") || "none");
