// Headless check of the exact engine the browser runs.
//   bun test/engine-test.js      (or: node test/engine-test.js)
// Mirrors test_headless.py: train 100 games per config, print records.
// Each run gets its own session (its own brain), like the app does.

import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/engine.js", import.meta.url), "utf8");
const ENG = new Function(`${src}\nreturn ENG;`)();

function train(rounds, cfg) {
    const S = ENG.newSession({ ...cfg, grid: 12 });
    let best = 0, games = 0, guard = 0;
    const scores = [];
    while (games < rounds && guard++ < 200_000) {
        const r = ENG.tick(S);
        if (r.done) {
            scores.push(r.score);
            if (r.score > best) best = r.score;
            games += 1;
        }
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { best, avg, brain: S.Q.size };
}

const CONFIGS = [
    ["default", { mat: 20, krock: -100, step: -1, eps: 0.1 }],
    ["no crash penalty", { mat: 20, krock: 0, step: -1, eps: 0.1 }],
    ["life crisis", { mat: 10, krock: -100, step: -50, eps: 0.1 }],
    ["eps 1.0", { mat: 20, krock: -100, step: -1, eps: 1.0 }],
    ["eps 0.0", { mat: 20, krock: -100, step: -1, eps: 0.0 }],
    ["safety driver", { mat: 15, krock: -250, step: 0, eps: 0.05 }],
    ["speed demon", { mat: 60, krock: -40, step: -4, eps: 0.05 }],
];

console.log("engine loaded:", Object.keys(ENG).join(" "));
for (const [label, cfg] of CONFIGS) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(train(100, cfg));
    const best = Math.max(...runs.map((r) => r.best));
    const avg = runs.reduce((a, r) => a + r.avg, 0) / runs.length;
    console.log(`${label.padEnd(16)} best ${best}  avg ${avg.toFixed(1)}  brain ${runs[2].brain}`);
}
