/* Calibration: what the app's behaviour detectors actually see for candidate
 * recipes. Every gate in app.js must sit between the "broken" and the "good"
 * line below.                                          bun test/calibrate.js  */

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/engine.js", import.meta.url), "utf8");
const ENG = new Function(`${src}\nreturn ENG;`)();

function train(cfg, n) {
    const S = ENG.newSession(cfg);
    const o = [];
    let g = 0;
    while (o.length < n && g++ < 3_000_000) {
        const r = ENG.tick(S);
        if (r.done) o.push(r);
    }
    return o;
}

// the same three detectors app.js uses
const det = (eps) => {
    const last50 = eps.slice(-50);
    return {
        crashFast: last50.filter((e) => e.cause === "crash" && e.score === 0 && e.steps <= 14).length,
        meanSteps: last50.reduce((a, e) => a + e.steps, 0) / Math.max(1, last50.length),
        aloof: last50.filter((e) => e.score === 0 && e.steps >= 40).length,
        avgAt500: eps.length < 500 ? 0 : eps.slice(450, 500).reduce((a, e) => a + e.score, 0) / 50,
        avgAt1000: eps.length < 1000 ? 0 : eps.slice(950, 1000).reduce((a, e) => a + e.score, 0) / 50,
    };
};

const L1 = { epsStart: 0.1, epsDecay: 1.0, epsMin: 0.0, alpha: 0.2, gamma: 0.9, grid: 12 };
const L2 = { mat: 20, krock: -100, step: -1, toward: 0, away: 0, alpha: 0.2, gamma: 0.9, grid: 12 };
const L3 = { ...L2, epsStart: 0.3, epsDecay: 0.98, epsMin: 0.0 };

const TRIALS = [
    // Level 1 — gate ①: all last 10 crash, mean length ≤ 12
    ["L1  default (should FAIL ①)", { ...L1, mat: 20, krock: -100, step: -1, toward: 0, away: 0 }, 60],
    ["L1  suicide recipe (should PASS ①)", { ...L1, mat: -50, krock: 100, step: -1, toward: 0, away: 0 }, 60],
    // Level 1 — gate ②: ≥ 5 of last 10 with 0 apples and ≥ 40 steps
    ["L1  default (should FAIL ②)", { ...L1, mat: 20, krock: -100, step: -1, toward: 0, away: 0 }, 60],
    ["L1  aloof recipe (should PASS ②)", { ...L1, mat: -50, krock: -300, step: -1, toward: 0, away: 0 }, 60],
    // Level 2 — ε_start ≥ .2, decay ≤ .999, avg20@500 ≥ 8
    ["L2  ε 1.0 never decayed (FAIL)", { ...L2, epsStart: 1.0, epsDecay: 1.0, epsMin: 1.0 }, 1000],
    ["L2  ε 0.1 no decay (weak)", { ...L2, epsStart: 0.1, epsDecay: 1.0, epsMin: 0.0 }, 1000],
    ["L2  ε 0.3 decay 0.98 (PASS)", { ...L2, epsStart: 0.3, epsDecay: 0.98, epsMin: 0.0 }, 1000],
    // Level 3 — avg20@1000 ≥ 14
    ["L3  α 0.8 γ 0.99 (FAIL)", { ...L3, alpha: 0.8, gamma: 0.99 }, 1000],
    ["L3  α 0.2 γ 0.9 (PASS)", { ...L3, alpha: 0.2, gamma: 0.9 }, 1000],
];

for (const [label, cfg, n] of TRIALS) {
    const runs = [train(cfg, n), train(cfg, n)];
    const a = runs.map(det);
    console.log(
        label.padEnd(34),
        `crashFast ${a.map((d) => d.crashFast).join("/")} of 50`,
        `aloof ${a.map((d) => d.aloof).join("/")} of 50`,
        `avg20@500 ${a.map((d) => d.avgAt500.toFixed(1)).join("/")}`,
        `avg20@1000 ${a.map((d) => d.avgAt1000.toFixed(1)).join("/")}`,
    );
}
