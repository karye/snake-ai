/* ===========================================================================
 * engine.js — the Q-learning Snake, a faithful port of snake_ai.py.
 * No DOM here, so the same file can be tested headless (see test/engine-test.js)
 * and loaded by the browser (loaded first by index.html).
 *
 * A SESSION is one recipe + one brain + one game:
 *      const S = ENG.newSession({ mat: 60, epsDecay: 0.99 });
 *      S = { cfg, Q, G, state, eps, episodes, cause }
 *
 * What the class can now reach for (cfg):
 *   mat / krock / step   the classic three rewards
 *   toward / away        reward for closing / opening the distance to the apple
 *   epsStart / epsDecay / epsMin   ε is annealed per episode, not constant
 *   alpha / gamma        the update rule, exposed as knobs
 *
 * State  = (danger straight, danger right, danger left, dir, apple direction)
 * Actions= 0 straight, 1 turn right, 2 turn left
 * Update = Q(s,a) += α · (r + γ · max Q(s',a') − Q(s,a))
 * =========================================================================== */

const ENG = {
    ALPHA: 0.2,
    GAMMA: 0.9,
    ACTIONS: [0, 1, 2],
    CFG: {
        mat: 20, krock: -100, step: -1, toward: 0, away: 0,
        epsStart: 0.1, epsDecay: 1.0, epsMin: 0.0,
        alpha: 0.2, gamma: 0.9,
        grid: 12,
    },
};

ENG.newSession = function (cfg) {
    const S = { cfg: { ...ENG.CFG, ...(cfg || {}) }, Q: new Map(), G: null, state: null, eps: 0, episodes: 0, cause: null };
    S.eps = S.cfg.epsStart;
    ENG.reset(S);
    return S;
};

ENG.reset = function (S) {
    const g = S.cfg.grid;
    S.G = {
        head: [g >> 1, g >> 1],
        body: [[g >> 1, g >> 1], [g >> 1, (g >> 1) + 1]],
        dir: [0, -1],
        apple: null,
        score: 0,
        starve: 0,
        alive: 0,
    };
    S.G.apple = ENG.newApple(S);
    S.state = ENG.stateOf(S);
    S.cause = null;
};

ENG.newApple = function (S) {
    const g = S.cfg.grid;
    let p;
    do {
        p = [(Math.random() * g) | 0, (Math.random() * g) | 0];
    } while (S.G.body.some((s) => s[0] === p[0] && s[1] === p[1]));
    return p;
};

ENG.hit = function (S, x, y) {
    const g = S.cfg.grid;
    if (x < 0 || x >= g || y < 0 || y >= g) return true;
    return S.G.body.some((s) => s[0] === x && s[1] === y);
};

ENG.stateOf = function (S) {
    const G = S.G;
    const [dx, dy] = G.dir;
    const right = [-dy, dx], left = [dy, -dx];
    const f0 = ENG.hit(S, G.head[0] + dx, G.head[1] + dy);
    const f1 = ENG.hit(S, G.head[0] + right[0], G.head[1] + right[1]);
    const f2 = ENG.hit(S, G.head[0] + left[0], G.head[1] + left[1]);
    const adx = G.apple[0] > G.head[0] ? 1 : G.apple[0] < G.head[0] ? -1 : 0;
    const ady = G.apple[1] > G.head[1] ? 1 : G.apple[1] < G.head[1] ? -1 : 0;
    return `${f0},${f1},${f2},${dx},${dy},${adx},${ady}`;
};

ENG.qget = function (S, s, a) {
    const v = S.Q.get(s + "|" + a);
    return v === undefined ? 0.0 : v;
};

ENG.updateQ = function (S, s, a, reward, ns) {
    let maxNext = -Infinity;
    for (const act of ENG.ACTIONS) {
        const v = ENG.qget(S, ns, act);
        if (v > maxNext) maxNext = v;
    }
    const key = s + "|" + a;
    const cur = S.Q.has(key) ? S.Q.get(key) : 0.0;
    S.Q.set(key, cur + S.cfg.alpha * (reward + S.cfg.gamma * maxNext - cur));
};

// one step -> [reward, done]; S.cause says WHY the episode ended
ENG.step = function (S, action) {
    const G = S.G;
    const [dx, dy] = G.dir;
    if (action === 1) G.dir = [-dy, dx];
    else if (action === 2) G.dir = [dy, -dx];

    const d0 = Math.abs(G.apple[0] - G.head[0]) + Math.abs(G.apple[1] - G.head[1]);

    G.head = [G.head[0] + G.dir[0], G.head[1] + G.dir[1]];
    G.starve += 1;
    G.alive += 1;

    const g = S.cfg.grid;
    const out = G.head[0] < 0 || G.head[0] >= g || G.head[1] < 0 || G.head[1] >= g ||
        G.body.some((s) => s[0] === G.head[0] && s[1] === G.head[1]);
    if (out) {
        S.cause = "crash";
        return [S.cfg.krock, true];
    }
    if (G.starve > 100) {
        S.cause = "starve";
        return [S.cfg.krock, true];
    }

    G.body.unshift([G.head[0], G.head[1]]);

    if (G.head[0] === G.apple[0] && G.head[1] === G.apple[1]) {
        G.score += 1;
        G.starve = 0;
        G.apple = ENG.newApple(S);
        return [S.cfg.mat, false];
    }
    G.body.pop();

    const d1 = Math.abs(G.apple[0] - G.head[0]) + Math.abs(G.apple[1] - G.head[1]);
    const nudge = d1 < d0 ? S.cfg.toward : d1 > d0 ? S.cfg.away : 0;
    return [S.cfg.step + nudge, false];
};

ENG.pickAction = function (S) {
    if (Math.random() < S.eps) return ENG.ACTIONS[(Math.random() * 3) | 0];
    const q = ENG.ACTIONS.map((a) => ENG.qget(S, S.state, a));
    const top = Math.max(...q);
    const good = ENG.ACTIONS.filter((a, i) => q[i] === top);
    return good[(Math.random() * good.length) | 0];
};

// one game step; auto-resets on death and returns what the UI needs
ENG.tick = function (S) {
    const action = ENG.pickAction(S);
    const [reward, done] = ENG.step(S, action);
    const ns = ENG.stateOf(S);
    ENG.updateQ(S, S.state, action, reward, ns);
    S.state = ns;
    if (!done) return { done: false };
    const out = { done: true, score: S.G.score, steps: S.G.alive, cause: S.cause, eps: S.eps };
    S.episodes += 1;
    S.eps = Math.max(S.cfg.epsMin, S.cfg.epsStart * Math.pow(S.cfg.epsDecay, S.episodes));
    ENG.reset(S);
    return out;
};
