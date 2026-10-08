/* ===========================================================================
 * test/gate-test.js — headless check of the sign-in modal (no browser needed).
 *
 * engine.js + app.js are loaded into a tiny fake DOM, then the flow is walked:
 * fresh load -> empty name -> real name -> save before training -> re-open gate.
 * Run: bun test/gate-test.js
 * =========================================================================== */

import { readFileSync } from "node:fs";

const ctx2d = new Proxy({}, { get: (k) => (k === "canvas" ? null : () => undefined), set: () => true });

const els = {};
let body = null;
function mkEl(id, cls = "") {
    const el = { id, value: "", textContent: "", innerHTML: "", listeners: [] };
    const set = new Set(cls.split(" ").filter(Boolean));
    el.classList = {
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
        contains: (c) => set.has(c),
    };
    el.addEventListener = (type, fn) => el.listeners.push(fn);
    el.parentElement = body || el;
    if (id === "board" || id === "curve") el.getContext = () => ctx2d;
    els[id] = el;
    return el;
}

for (const id of readFileSync("public/index.html", "utf8").match(/id="([^"]+)"/g).map((s) => s.slice(4, -1)))
    mkEl(id);
for (const id of ["board", "avg", "eps"]) { els[id].width = 432; els[id].height = 200; els[id].getContext = () => ctx2d; }

body = mkEl("body", "locked");
const document = { getElementById: (id) => els[id] ?? mkEl(id), body };

function click(id) {
    els[id].listeners.forEach((fn) => fn({ type: "click" }));
}

const src = readFileSync("public/engine.js", "utf8") + "\n" + readFileSync("public/app.js", "utf8");
const run = new Function("document", "fetch", "requestAnimationFrame", "setInterval", src);

const fakeFetch = (url, opts) => {
    const sent = JSON.parse((opts && opts.body) || "{}");
    const out = url.includes("register")
        ? { ok: true, name: sent.name }
        : url.includes("leaderboard")
            ? { ok: true, updatedAt: "now", studentCount: 1, classRecord: 42, training: [], exam: [] }
            : { ok: true, name: sent.name, best: { record: 9, avg: 2.5, config: { mat: 20, krock: -100, step: -1, eps: 0.1 } }, attempts: 1 };
    return Promise.resolve({ json: () => Promise.resolve(out) });
};

let frames = 0;
const fakeRAF = (cb) => (frames++ < 3 ? cb() : null);

run(document, fakeFetch, fakeRAF, () => {});

const tick = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

const gateOpen = () => !els.gate.classList.contains("off");
const locked = () => body.classList.contains("locked");

function show(label) {
    console.log(
        label.padEnd(16),
        "locked:", locked(), "| gate:", gateOpen(),
        "| modal msg:", JSON.stringify(els["reg-state"].textContent),
        "| notice:", JSON.stringify(els.notice.textContent),
        "| who:", JSON.stringify(els.who.textContent),
    );
}

const expect = (label, wantLocked, wantGate) => {
    const ok = locked() === wantLocked && gateOpen() === wantGate;
    console.log((ok ? "PASS " : "FAIL ") + label + "  (locked=" + wantLocked + ", gate=" + wantGate + ")");
    show(label);
    return ok;
};

let allOk = true;

console.log("--- fresh page load ---");
allOk &= expect("fresh load", true, true);

console.log("\n--- Register with an empty name ---");
els["reg-name"].value = "   ";
click("reg-btn");
await tick();
allOk &= expect("empty name", true, true);

console.log("\n--- Register with a name ---");
els["reg-name"].value = "  Ada Lovelace  ";
click("reg-btn");
await tick();
allOk &= expect("signed in", false, false);

console.log("\n--- Save my result before training ---");
click("btn-save");
await tick();
allOk &= expect("save blocked", false, false);

console.log("\n--- Sign in as someone else ---");
click("btn-signin");
allOk &= expect("gate reopened", false, true);

console.log("\ngate open again -> messages go back to the modal:",
    JSON.stringify(els["reg-state"].textContent));

process.exit(allOk ? 0 : 1);
