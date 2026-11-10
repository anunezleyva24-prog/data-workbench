/* Data Workbench core: parsing, formula engine, statistics, fitting, Origin script.
   Pure functions; runs in the browser (window.Core) and in Node (module.exports). */
(function (root) {
  "use strict";
  const C = {};
  const J = () => root.jStat || (typeof require !== "undefined" ? require("jstat") : null);

  /* ---------- helpers ---------- */
  C.letter = function (i) {
    let s = "";
    i += 1;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };
  C.fmt = function (v) {
    if (typeof v !== "number" || !isFinite(v)) return "\u2014";
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-3) return v.toExponential(3).replace(/\.?0+e/, "e");
    return String(Number(v.toPrecision(5)));
  };
  C.pfmt = function (p) {
    if (!isFinite(p)) return "\u2014";
    if (p < 1e-4) return "< 0.0001";
    return String(Number(p.toPrecision(3)));
  };
  const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
  C.toValue = function (s) {
    if (s === null || s === undefined) return null;
    if (typeof s === "number") return isFinite(s) ? s : null;
    s = String(s).trim();
    if (s === "") return null;
    if (NUM_RE.test(s)) return Number(s);
    return s;
  };
  C.numeric = (values) => values.map((v) => (typeof v === "number" ? v : NaN));
  const clean = (a) => a.filter((v) => typeof v === "number" && isFinite(v));
  C.clean = clean;

  /* ---------- import ---------- */
  function splitLine(line, d) {
    if (d === " ") return line.trim().split(/\s+/);
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }
  function detectDelimiter(lines) {
    const sample = lines.slice(0, 12);
    for (const d of ["\t", ";", ","]) {
      const counts = sample.map((l) => l.split(d).length - 1);
      if (Math.min.apply(null, counts) > 0) return d;
    }
    for (const d of ["\t", ";", ","]) if (sample.some((l) => l.indexOf(d) >= 0)) {
      if (d !== "," ) return d;
      // commas present only in some lines: prefer whitespace if it splits every line
      if (!sample.every((l) => /\S\s+\S/.test(l.trim()))) return d;
    }
    return " ";
  }
  C.parseText = function (text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) throw new Error("No data found. Paste or drop text with rows and columns.");
    const d = detectDelimiter(lines);
    let rows = lines.map((l) => splitLine(l, d));
    if (d !== ",") {
      const flat = [].concat.apply([], rows.slice(0, 200));
      const hasDecComma = flat.some((c) => /^[+-]?\d+,\d+(e[+-]?\d+)?$/i.test(c));
      const hasDecPoint = flat.some((c) => /^[+-]?\d*\.\d+(e[+-]?\d+)?$/i.test(c));
      if (hasDecComma && !hasDecPoint) rows = rows.map((r) => r.map((c) => (/^[+-]?\d+,\d+(e[+-]?\d+)?$/i.test(c) ? c.replace(",", ".") : c)));
    }
    return C.parseRows(rows);
  };
  function splitNameUnit(s) {
    s = String(s).trim();
    let m = s.match(/^(.*\S)\s*[(\[]([^()\[\]]*)[)\]]$/);
    if (m) return { name: m[1], unit: m[2].trim() };
    m = s.match(/^(.*\S)\s+\/\s+(\S.*)$/);
    if (m) return { name: m[1], unit: m[2] };
    return { name: s, unit: "" };
  }
  /* rows: array of arrays of raw cells (strings or numbers) */
  C.parseRows = function (rows) {
    rows = rows.filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
    if (!rows.length) throw new Error("No data found.");
    const ncol = Math.max.apply(null, rows.map((r) => r.length));
    const vals = rows.map((r) => { const o = []; for (let j = 0; j < ncol; j++) o.push(C.toValue(r[j])); return o; });
    const numCount = (r) => r.filter((v) => typeof v === "number").length;
    const strCount = (r) => r.filter((v) => typeof v === "string").length;
    let header = null, units = null, start = 0;
    if (vals.length > 1 && strCount(vals[0]) > 0 && numCount(vals[0]) < numCount(vals[1]) + strCount(vals[0])
        && numCount(vals[0]) <= ncol / 2) {
      header = vals[0]; start = 1;
      if (vals.length > 2 && numCount(vals[1]) === 0 && numCount(vals[2]) > 0) { units = vals[1]; start = 2; }
    }
    const cols = [];
    for (let j = 0; j < ncol; j++) {
      let name = C.letter(j), unit = "";
      if (header && header[j] !== null) { const nu = splitNameUnit(header[j]); name = nu.name || name; unit = nu.unit; }
      if (units && units[j] !== null) unit = String(units[j]);
      cols.push({ name: name, unit: unit, values: vals.slice(start).map((r) => r[j]), formula: null });
    }
    return cols;
  };
  C.toTSV = function (cols, n, headers, sep) {
    sep = sep || "\t";
    const esc = (s) => (sep === "," && /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const out = [];
    if (headers) out.push(cols.map((c) => esc(c.unit ? c.name + " (" + c.unit + ")" : c.name)).join(sep));
    for (let i = 0; i < n; i++) out.push(cols.map((c) => { const v = c.values[i]; return v === null || v === undefined ? "" : esc(String(v)); }).join(sep));
    return out.join("\n");
  };

  /* ---------- formula engine ---------- */
  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i)))) { t.push({ k: "num", v: Number(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_\u00b5\u03b1-\u03c9][A-Za-z0-9_\u00b5\u03b1-\u03c9]*/.exec(src.slice(i)))) { t.push({ k: "id", v: m[0] }); i += m[0].length; continue; }
      if (ch === '"' || ch === "'") {
        const j = src.indexOf(ch, i + 1);
        if (j < 0) throw new Error("Missing closing quote.");
        t.push({ k: "str", v: src.slice(i + 1, j) }); i = j + 1; continue;
      }
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "==", "!=", "**"].indexOf(two) >= 0) { t.push({ k: "op", v: two === "**" ? "^" : two }); i += 2; continue; }
      if ("+-*/^(),<>".indexOf(ch) >= 0) { t.push({ k: "op", v: ch }); i++; continue; }
      throw new Error('Unexpected character "' + ch + '".');
    }
    return t;
  }
  C.compile = function (src) {
    if (!src || !src.trim()) throw new Error("Type a formula, for example  B / mean(B)");
    const t = tokenize(src.replace(/^\s*=/, ""));
    let p = 0;
    const peek = () => t[p];
    const isOp = (v) => t[p] && t[p].k === "op" && t[p].v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error('Expected "' + v + '"' + (t[p] ? ' before "' + t[p].v + '"' : " at the end") + "."); p++; };
    function expr() { return cmp(); }
    function cmp() {
      let l = add();
      while (t[p] && t[p].k === "op" && ["<", ">", "<=", ">=", "==", "!="].indexOf(t[p].v) >= 0) { const op = t[p++].v; l = { t: "bin", op: op, l: l, r: add() }; }
      return l;
    }
    function add() { let l = mul(); while (isOp("+") || isOp("-")) { const op = t[p++].v; l = { t: "bin", op: op, l: l, r: mul() }; } return l; }
    function mul() { let l = unary(); while (isOp("*") || isOp("/")) { const op = t[p++].v; l = { t: "bin", op: op, l: l, r: unary() }; } return l; }
    function unary() { if (isOp("-")) { p++; return { t: "neg", a: unary() }; } if (isOp("+")) { p++; return unary(); } return pow(); }
    function pow() { const b = primary(); if (isOp("^")) { p++; return { t: "bin", op: "^", l: b, r: unary() }; } return b; }
    function primary() {
      const k = peek();
      if (!k) throw new Error("The formula ends too early.");
      if (k.k === "num") { p++; return { t: "num", v: k.v }; }
      if (k.k === "str") { p++; return { t: "col", name: k.v }; }
      if (k.k === "id") {
        p++;
        if (isOp("(")) {
          p++;
          if (k.v === "col") {
            const a = t[p++];
            if (!a || a.k === "op") throw new Error('Use col(A) or col("Column name").');
            expect(")");
            return { t: "col", name: String(a.v) };
          }
          const args = [];
          if (!isOp(")")) { args.push(expr()); while (isOp(",")) { p++; args.push(expr()); } }
          expect(")");
          return { t: "call", name: k.v, args: args };
        }
        return { t: "id", name: k.v };
      }
      if (isOp("(")) { p++; const e = expr(); expect(")"); return e; }
      throw new Error('Unexpected "' + k.v + '".');
    }
    const ast = expr();
    if (p < t.length) throw new Error('Unexpected "' + t[p].v + '".');
    return ast;
  };
  const isArr = Array.isArray;
  const lift1 = (f) => (a) => (isArr(a) ? a.map(f) : f(a));
  const lift2 = (f) => (a, b) => {
    const A = isArr(a), B = isArr(b);
    if (A && B) { const n = Math.max(a.length, b.length), o = new Array(n); for (let i = 0; i < n; i++) o[i] = f(i < a.length ? a[i] : NaN, i < b.length ? b[i] : NaN); return o; }
    if (A) return a.map((v) => f(v, b));
    if (B) return b.map((v) => f(a, v));
    return f(a, b);
  };
  const BIN = {
    "+": lift2((a, b) => a + b), "-": lift2((a, b) => a - b), "*": lift2((a, b) => a * b), "/": lift2((a, b) => a / b),
    "^": lift2((a, b) => Math.pow(a, b)),
    "<": lift2((a, b) => +(a < b)), ">": lift2((a, b) => +(a > b)), "<=": lift2((a, b) => +(a <= b)), ">=": lift2((a, b) => +(a >= b)),
    "==": lift2((a, b) => +(a === b)), "!=": lift2((a, b) => +(a !== b)),
  };
  const arr = (a) => (isArr(a) ? a : [a]);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : NaN);
  const variance = (a) => { if (a.length < 2) return NaN; const m = mean(a); return sum(a.map((v) => (v - m) * (v - m))) / (a.length - 1); };
  const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); if (!s.length) return NaN; const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h); return s[lo] + (s[hi] - s[lo]) * (h - lo); };
  const agg = (f) => (a) => f(clean(arr(a)));
  const needArr = (a, name) => { if (!isArr(a)) throw new Error(name + "() needs a column."); return a; };
  const FN = {
    sqrt: lift1(Math.sqrt), abs: lift1(Math.abs), exp: lift1(Math.exp), ln: lift1(Math.log), log: lift1(Math.log10), log10: lift1(Math.log10), log2: lift1(Math.log2),
    sin: lift1(Math.sin), cos: lift1(Math.cos), tan: lift1(Math.tan), asin: lift1(Math.asin), acos: lift1(Math.acos), atan: lift1(Math.atan),
    floor: lift1(Math.floor), ceil: lift1(Math.ceil), sign: lift1(Math.sign),
    round: (a, d) => { const k = Math.pow(10, d === undefined ? 0 : d); return lift1((v) => Math.round(v * k) / k)(a); },
    mean: agg(mean), avg: agg(mean), sum: agg(sum), sd: agg((a) => Math.sqrt(variance(a))), stdev: agg((a) => Math.sqrt(variance(a))), "var": agg(variance),
    median: agg((a) => quantile(a, 0.5)), count: agg((a) => a.length),
    min: function (a, b) { return arguments.length > 1 ? lift2(Math.min)(a, b) : agg((v) => Math.min.apply(null, v))(a); },
    max: function (a, b) { return arguments.length > 1 ? lift2(Math.max)(a, b) : agg((v) => Math.max.apply(null, v))(a); },
    "if": (c, a, b) => { const n = [c, a, b].reduce((m, v) => (isArr(v) ? Math.max(m, v.length) : m), 0); const g = (v, i) => (isArr(v) ? v[i] : v); if (!n) return c ? a : b; const o = []; for (let i = 0; i < n; i++) o.push(g(c, i) ? g(a, i) : g(b, i)); return o; },
    cumsum: (a) => { let s = 0; return needArr(a, "cumsum").map((v) => (isFinite(v) ? (s += v) : NaN)); },
    diff: (a) => needArr(a, "diff").map((v, i) => (i ? v - a[i - 1] : NaN)),
    norm: (a) => { const m = Math.max.apply(null, clean(needArr(a, "norm")).map(Math.abs)); return a.map((v) => v / m); },
    norm01: (a) => { const c = clean(needArr(a, "norm01")), lo = Math.min.apply(null, c), hi = Math.max.apply(null, c); return a.map((v) => (v - lo) / (hi - lo)); },
    zscore: (a) => { const c = clean(needArr(a, "zscore")), m = mean(c), s = Math.sqrt(variance(c)); return a.map((v) => (v - m) / s); },
    smooth: (a, w) => { needArr(a, "smooth"); const h = Math.max(1, Math.floor((w === undefined ? 5 : w) / 2)); return a.map((_, i) => mean(clean(a.slice(Math.max(0, i - h), i + h + 1)))); },
    deriv: (y, x) => { needArr(y, "deriv"); needArr(x, "deriv"); const n = y.length; return y.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return (y[b] - y[a]) / (x[b] - x[a]); }); },
    integ: (y, x) => { needArr(y, "integ"); needArr(x, "integ"); let s = 0; return y.map((_, i) => (i ? (s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1])) : 0)); },
  };
  C.functionNames = Object.keys(FN);
  const CONST = { pi: Math.PI, e: Math.E };
  /* env: { resolve(name) -> number|array|undefined, col(name) -> array } */
  C.evaluate = function ev(n, env) {
    switch (n.t) {
      case "num": return n.v;
      case "neg": return lift1((v) => -v)(ev(n.a, env));
      case "bin": return BIN[n.op](ev(n.l, env), ev(n.r, env));
      case "col": { const v = env.col ? env.col(n.name) : undefined; if (v === undefined) throw new Error('No column called "' + n.name + '".'); return v; }
      case "id": {
        const v = env.resolve(n.name);
        if (v !== undefined) return v;
        if (n.name in CONST) return CONST[n.name];
        throw new Error('"' + n.name + '" is not a column or a known name.');
      }
      case "call": {
        const f = Object.prototype.hasOwnProperty.call(FN, n.name) ? FN[n.name] : FN[n.name.toLowerCase()];
        if (!f) throw new Error("Unknown function " + n.name + "().");
        return f.apply(null, n.args.map((a) => ev(a, env)));
      }
    }
  };
  C.freeNames = function (ast) {
    const out = [];
    (function walk(n) {
      if (!n) return;
      if (n.t === "id" && out.indexOf(n.name) < 0) out.push(n.name);
      if (n.t === "bin") { walk(n.l); walk(n.r); }
      if (n.t === "neg") walk(n.a);
      if (n.t === "call") n.args.forEach(walk);
    })(ast);
    return out;
  };
  /* Find a column by exact name, case-insensitive name, or letter. */
  C.findColumn = function (cols, name, skip) {
    let i = cols.findIndex((c, k) => k !== skip && c.name === name);
    if (i < 0) i = cols.findIndex((c, k) => k !== skip && c.name.toLowerCase() === String(name).toLowerCase());
    if (i < 0) i = cols.findIndex((c, k) => k !== skip && C.letter(k) === name);
    return i;
  };
  /* Recompute every formula column in order. Sets col.error on failure. */
  C.recompute = function (cols, n) {
    cols.forEach((c, idx) => {
      if (!c.formula) { c.error = null; return; }
      try {
        const get = (name) => { const i = C.findColumn(cols, name, idx); return i < 0 ? undefined : C.numeric(cols[i].values); };
        const env = {
          resolve: (name) => { const v = get(name); if (v !== undefined) return v; if (name === "i") return Array.from({ length: n }, (_, k) => k + 1); return undefined; },
          col: get,
        };
        let r = C.evaluate(C.compile(c.formula), env);
        if (!isArr(r)) r = Array.from({ length: n }, () => r);
        c.values = Array.from({ length: n }, (_, k) => (typeof r[k] === "number" && isFinite(r[k]) ? r[k] : null));
        c.error = null;
      } catch (e) {
        c.error = e.message;
        c.values = Array.from({ length: n }, () => null);
      }
    });
  };

  /* ---------- linear algebra ---------- */
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (!(Math.abs(M[piv][c]) > 1e-300)) throw new Error("The fit is not determined by these data (singular matrix).");
      const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }
  function inverse(A) {
    const n = A.length, cols = [];
    for (let j = 0; j < n; j++) cols.push(solve(A, A.map((_, i) => +(i === j))));
    return A.map((_, i) => cols.map((c) => c[i]));
  }

  /* ---------- statistics ---------- */
  const tP = (t, df) => 2 * (1 - J().studentt.cdf(Math.abs(t), df));
  const tCrit = (df) => J().studentt.inv(0.975, df);
  C.describe = function (values) {
    const a = clean(values), n = a.length, m = mean(a), sd = Math.sqrt(variance(a)), sem = sd / Math.sqrt(n);
    return { n: n, mean: m, sd: sd, sem: sem, ci95: n > 1 ? tCrit(n - 1) * sem : NaN, min: n ? Math.min.apply(null, a) : NaN, q1: quantile(a, 0.25), median: quantile(a, 0.5), q3: quantile(a, 0.75), max: n ? Math.max.apply(null, a) : NaN, sum: sum(a), cv: (sd / m) * 100 };
  };
  C.pairs = function (xv, yv) {
    const x = [], y = [];
    for (let i = 0; i < Math.min(xv.length, yv.length); i++) if (typeof xv[i] === "number" && typeof yv[i] === "number" && isFinite(xv[i]) && isFinite(yv[i])) { x.push(xv[i]); y.push(yv[i]); }
    return { x: x, y: y };
  };
  function finishFit(res, x, y, yhat, p) {
    const n = y.length, ybar = mean(y);
    let rss = 0, tss = 0;
    for (let i = 0; i < n; i++) { rss += (y[i] - yhat[i]) * (y[i] - yhat[i]); tss += (y[i] - ybar) * (y[i] - ybar); }
    res.n = n; res.dof = n - p; res.rss = rss;
    res.r2 = 1 - rss / tss;
    res.adjR2 = 1 - (rss / (n - p)) / (tss / (n - 1));
    res.sigma = Math.sqrt(rss / (n - p));
    return res;
  }
  const SUP = ["", "", "\u00b2", "\u00b3", "\u2074", "\u2075", "\u2076"];
  C.polyfit = function (x, y, order) {
    const p = order + 1, n = x.length;
    if (n <= p) throw new Error("A polynomial of order " + order + " needs at least " + (p + 1) + " data points; there are " + n + ".");
    const s = Math.max.apply(null, x.map(Math.abs)) || 1;
    const X = x.map((v) => { const r = [1]; for (let k = 1; k < p; k++) r.push(r[k - 1] * (v / s)); return r; });
    const XtX = [], Xty = [];
    for (let a = 0; a < p; a++) { XtX.push([]); let t = 0; for (let i = 0; i < n; i++) t += X[i][a] * y[i]; Xty.push(t); for (let b = 0; b < p; b++) { let q = 0; for (let i = 0; i < n; i++) q += X[i][a] * X[i][b]; XtX[a].push(q); } }
    const bz = solve(XtX, Xty), inv = inverse(XtX);
    const beta = bz.map((b, k) => b / Math.pow(s, k));
    const predict = (xs) => xs.map((v) => { let r = 0; for (let k = p - 1; k >= 0; k--) r = r * v + beta[k]; return r; });
    const res = finishFit({ kind: "poly", order: order, predict: predict }, x, y, predict(x), p);
    const names = order === 1 ? ["Intercept", "Slope"] : beta.map((_, k) => "b" + k);
    res.params = beta.map((b, k) => { const se = Math.sqrt(inv[k][k]) * res.sigma / Math.pow(s, k), t = b / se; return { name: names[k], value: b, se: se, t: t, p: tP(t, res.dof), ci: tCrit(res.dof) * se }; });
    res.label = order === 1 ? "Linear fit" : "Polynomial fit (order " + order + ")";
    res.equation = "y = " + beta.map((b, k) => (k ? (b < 0 ? "\u2212 " : "+ ") + C.fmt(Math.abs(b)) + "\u00b7x" + SUP[k] : C.fmt(b))).join(" ");
    return res;
  };

  const byX = (x, y) => x.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]);
  C.models = [
    { id: "expdec", label: "Exponential decay", eq: "y = y0 + A\u00b7exp(\u2212x/\u03c4)", params: ["y0", "A", "tau"], f: (x, p) => p[0] + p[1] * Math.exp(-x / p[2]),
      guess: (x, y) => { const s = byX(x, y), y0 = s[s.length - 1][1]; return [y0, s[0][1] - y0, (s[s.length - 1][0] - s[0][0]) / 3 || 1]; } },
    { id: "expgrow", label: "Exponential growth", eq: "y = y0 + A\u00b7exp(x/\u03c4)", params: ["y0", "A", "tau"], f: (x, p) => p[0] + p[1] * Math.exp(x / p[2]),
      guess: (x, y) => { const s = byX(x, y); return [s[0][1], (s[s.length - 1][1] - s[0][1]) / 20 || 1, (s[s.length - 1][0] - s[0][0]) / 3 || 1]; } },
    { id: "power", label: "Power law", eq: "y = a\u00b7x^b", params: ["a", "b"], f: (x, p) => p[0] * Math.pow(x, p[1]),
      guess: (x, y) => { const lx = [], ly = []; x.forEach((v, i) => { if (v > 0 && y[i] > 0) { lx.push(Math.log(v)); ly.push(Math.log(y[i])); } }); if (lx.length < 3) return [1, 1]; const f = C.polyfit(lx, ly, 1); return [Math.exp(f.params[0].value), f.params[1].value]; } },
    { id: "gauss", label: "Gaussian peak", eq: "y = y0 + A\u00b7exp(\u2212(x\u2212xc)\u00b2 / 2w\u00b2)", params: ["y0", "A", "xc", "w"], f: (x, p) => p[0] + p[1] * Math.exp(-((x - p[2]) * (x - p[2])) / (2 * p[3] * p[3])),
      guess: (x, y) => { const lo = Math.min.apply(null, y), hi = Math.max.apply(null, y); return [lo, hi - lo, x[y.indexOf(hi)], (Math.max.apply(null, x) - Math.min.apply(null, x)) / 6 || 1]; } },
    { id: "boltz", label: "Sigmoid (Boltzmann)", eq: "y = A2 + (A1 \u2212 A2) / (1 + exp((x \u2212 x0)/dx))", params: ["A1", "A2", "x0", "dx"], f: (x, p) => p[1] + (p[0] - p[1]) / (1 + Math.exp((x - p[2]) / p[3])),
      guess: (x, y) => { const s = byX(x, y), a = s[0][0], b = s[s.length - 1][0]; return [s[0][1], s[s.length - 1][1], (a + b) / 2, (b - a) / 10 || 1]; } },
    { id: "hill", label: "Hill / dose\u2013response", eq: "y = bottom + (top \u2212 bottom)\u00b7x\u207f / (K\u207f + x\u207f)", params: ["bottom", "top", "K", "n"], f: (x, p) => p[0] + ((p[1] - p[0]) * Math.pow(x, p[3])) / (Math.pow(p[2], p[3]) + Math.pow(x, p[3])),
      guess: (x, y) => [Math.min.apply(null, y), Math.max.apply(null, y), quantile(x.filter((v) => v > 0), 0.5) || 1, 1] },
    { id: "mm", label: "Saturation (Michaelis\u2013Menten / Langmuir)", eq: "y = Vmax\u00b7x / (Km + x)", params: ["Vmax", "Km"], f: (x, p) => (p[0] * x) / (p[1] + x),
      guess: (x, y) => [Math.max.apply(null, y), quantile(x, 0.5) || 1] },
  ];
  /* Build a model from a user expression in x, e.g. "a*exp(-x/b)+c". */
  C.customModel = function (expr) {
    const ast = C.compile(expr);
    const names = C.freeNames(ast).filter((n) => n !== "x" && !(n in CONST));
    if (!names.length) throw new Error("The model has no parameters to fit. Use letters for them, for example  a*exp(-x/b) + c");
    if (C.freeNames(ast).indexOf("x") < 0) throw new Error("The model must contain x.");
    return { id: "custom", label: "Custom model", eq: "y = " + expr.trim(), params: names, guess: () => names.map(() => 1),
      fv: (xs, p) => { const r = C.evaluate(ast, { resolve: (n) => (n === "x" ? xs : names.indexOf(n) >= 0 ? p[names.indexOf(n)] : undefined) }); return isArr(r) ? r : xs.map(() => r); } };
  };
  /* Levenberg-Marquardt. start: optional {name: value} overrides. */
  C.nlfit = function (model, x, y, start) {
    const m = model.params.length, n = x.length;
    if (n <= m) throw new Error("This model has " + m + " parameters and needs more than " + m + " data points; there are " + n + ".");
    const fv = model.fv || ((xs, p) => xs.map((v) => model.f(v, p)));
    let p = model.guess(x, y);
    if (start) model.params.forEach((nm, k) => { if (typeof start[nm] === "number" && isFinite(start[nm])) p[k] = start[nm]; });
    const p0 = p.slice();
    const ssr = (q) => { const yh = fv(x, q); let s = 0; const r = new Array(n); for (let i = 0; i < n; i++) { r[i] = y[i] - yh[i]; s += r[i] * r[i]; } return { r: r, s: s }; };
    const jac = (q) => {
      const Jm = [];
      for (let k = 0; k < m; k++) {
        const h = 1e-6 * Math.max(Math.abs(q[k]), 1e-4), a = q.slice(), b = q.slice();
        a[k] += h; b[k] -= h;
        const fa = fv(x, a), fb = fv(x, b);
        Jm.push(fa.map((v, i) => (v - fb[i]) / (2 * h)));
      }
      return Jm; // m x n
    };
    let cur = ssr(p);
    if (!isFinite(cur.s)) throw new Error("The model cannot be evaluated at the starting values (" + model.params.map((nm, k) => nm + " = " + C.fmt(p[k])).join(", ") + "). Set different initial values.");
    let lambda = 1e-3, converged = false, iter = 0;
    const normal = (Jm, r) => {
      const A = [], g = [];
      for (let a = 0; a < m; a++) { A.push([]); let t = 0; for (let i = 0; i < n; i++) t += Jm[a][i] * r[i]; g.push(t); for (let b = 0; b < m; b++) { let q = 0; for (let i = 0; i < n; i++) q += Jm[a][i] * Jm[b][i]; A[a].push(q); } }
      return { A: A, g: g };
    };
    for (; iter < 300 && !converged; iter++) {
      const N = normal(jac(p), cur.r);
      let improved = false;
      for (let tries = 0; tries < 25; tries++) {
        const A = N.A.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v || 1e-12) : v)));
        let d;
        try { d = solve(A, N.g); } catch (e) { lambda *= 10; continue; }
        const pn = p.map((v, k) => v + d[k]), nx = ssr(pn);
        if (isFinite(nx.s) && nx.s <= cur.s) {
          const gain = cur.s - nx.s;
          p = pn; cur = nx; lambda = Math.max(lambda / 10, 1e-12); improved = true;
          if (gain <= 1e-12 * (cur.s + 1e-300)) converged = true;
          break;
        }
        lambda *= 10;
      }
      if (!improved) { converged = true; }
    }
    const predict = (xs) => fv(xs, p);
    const res = finishFit({ kind: "nl", model: model.id, label: model.label, equation: model.eq, predict: predict, iterations: iter, start: p0 }, x, y, predict(x), m);
    let cov = null;
    try { cov = inverse(normal(jac(p), cur.r).A); } catch (e) { cov = null; }
    res.params = model.params.map((nm, k) => {
      const se = cov && cov[k][k] >= 0 ? Math.sqrt(cov[k][k]) * res.sigma : NaN, t = p[k] / se;
      return { name: nm, value: p[k], se: se, t: t, p: isFinite(t) ? tP(t, res.dof) : NaN, ci: isFinite(se) ? tCrit(res.dof) * se : NaN };
    });
    res.wellDetermined = !!cov && res.params.every((q) => isFinite(q.se));
    return res;
  };

  C.ttest = function (a, b, paired) {
    a = C.numeric(a); b = C.numeric(b);
    if (paired) {
      const pr = C.pairs(a, b), d = pr.x.map((v, i) => v - pr.y[i]), n = d.length;
      if (n < 2) throw new Error("A paired test needs at least 2 complete pairs.");
      const md = mean(d), sd = Math.sqrt(variance(d)), se = sd / Math.sqrt(n), t = md / se, df = n - 1;
      return { test: "Paired t-test", t: t, df: df, p: tP(t, df), diff: md, ci: tCrit(df) * se, n: n };
    }
    a = clean(a); b = clean(b);
    if (a.length < 2 || b.length < 2) throw new Error("Each group needs at least 2 values.");
    const va = variance(a) / a.length, vb = variance(b) / b.length, se = Math.sqrt(va + vb), diff = mean(a) - mean(b), t = diff / se;
    const df = ((va + vb) * (va + vb)) / ((va * va) / (a.length - 1) + (vb * vb) / (b.length - 1));
    return { test: "Welch two-sample t-test", t: t, df: df, p: tP(t, df), diff: diff, ci: tCrit(df) * se };
  };
  C.anova = function (groups) {
    groups = groups.map(clean);
    if (groups.some((g) => g.length < 2)) throw new Error("Each group needs at least 2 values.");
    const all = [].concat.apply([], groups), gm = mean(all), k = groups.length, N = all.length;
    let ssb = 0, ssw = 0;
    groups.forEach((g) => { const m = mean(g); ssb += g.length * (m - gm) * (m - gm); g.forEach((v) => (ssw += (v - m) * (v - m))); });
    const df1 = k - 1, df2 = N - k, F = ssb / df1 / (ssw / df2);
    return { test: "One-way ANOVA", F: F, df1: df1, df2: df2, p: 1 - J().centralF.cdf(F, df1, df2), ssb: ssb, ssw: ssw, msb: ssb / df1, msw: ssw / df2 };
  };
  C.pearson = function (xv, yv) {
    const pr = C.pairs(xv, yv), n = pr.x.length;
    if (n < 3) return { r: NaN, p: NaN, n: n };
    const mx = mean(pr.x), my = mean(pr.y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (pr.x[i] - mx) * (pr.y[i] - my); sxx += (pr.x[i] - mx) * (pr.x[i] - mx); syy += (pr.y[i] - my) * (pr.y[i] - my); }
    const r = sxy / Math.sqrt(sxx * syy), t = r * Math.sqrt((n - 2) / (1 - r * r));
    return { r: r, p: Math.abs(r) >= 1 ? 0 : tP(t, n - 2), n: n };
  };

  /* ---------- Origin (originpro) script ---------- */
  C.originScript = function (cols, n, plot) {
    const py = (v) => (v === null || v === undefined ? "nan" : typeof v === "number" ? String(v) : JSON.stringify(v));
    const q = (s) => JSON.stringify(String(s));
    const L = [
      "# Sends this worksheet" + (plot ? " and graph" : "") + " to Origin through the originpro package.",
      "# Run it inside Origin (Python console or Code Builder, Origin 2021 or later), or from",
      "# external Python on Windows with Origin installed:  pip install originpro",
      "import originpro as op",
      "",
      "nan = float('nan')",
      "if op.oext:  # only true when run from external Python",
      "    op.set_show(True)",
      "",
      "wks = op.new_sheet('w', lname='Data Workbench export')",
      "wks.cols = " + cols.length,
    ];
    cols.forEach((c, j) => {
      const axis = plot && j === plot.x ? "X" : plot && j === plot.err ? "E" : "Y";
      L.push("wks.from_list(" + j + ", [" + Array.from({ length: n }, (_, i) => py(c.values[i])).join(", ") + "], lname=" + q(c.name) + ", units=" + q(c.unit || "") + ", axis='" + axis + "')");
    });
    const T = { scatter: ["scatter", "s"], line: ["line", "l"], linesym: ["linesymb", "y"], bar: ["column", "c"] };
    if (plot && T[plot.type] && plot.ys.length) {
      const right = (plot.right || []).filter((y) => plot.ys.indexOf(y) >= 0), dbl = right.length > 0;
      L.push("", "graph = op.new_graph(template='" + (dbl ? "doubley" : T[plot.type][0]) + "')", "layer = graph[0]");
      if (dbl) L.push("layer2 = graph[1]  # second layer of the Double-Y template: right Y axis");
      plot.ys.forEach((y, k) => L.push((right.indexOf(y) >= 0 ? "layer2" : "layer") + ".add_plot(wks, coly=" + y + ", colx=" + plot.x + ", type='" + T[plot.type][1] + "'" + (plot.err >= 0 && k === 0 ? ", colyerr=" + plot.err : "") + ")"));
      if (plot.ys.length - right.length > 1) L.push("layer.group()");
      if (right.length > 1) L.push("layer2.group()");
      if (plot.logx) L.push("layer.xscale = 'log10'" + (dbl ? "; layer2.xscale = 'log10'" : ""));
      if (plot.logy) L.push("layer.yscale = 'log10'");
      if (dbl && plot.logy2) L.push("layer2.yscale = 'log10'");
      L.push("layer.rescale()");
      if (dbl) L.push("layer2.rescale()");
      if (plot.xlabel) L.push("layer.axis('x').title = " + q(plot.xlabel));
      if (plot.ylabel) L.push("layer.axis('y').title = " + q(plot.ylabel));
      if (dbl && plot.y2label) L.push("layer2.axis('y').title = " + q(plot.y2label));
    } else if (plot) {
      L.push("", "# Histograms and box plots: select the Y columns in Origin and use the Plot menu.");
    }
    L.push("", "# To save the project:  op.save(r'C:\\path\\to\\project.opju')");
    return L.join("\n");
  };

  if (typeof module !== "undefined" && module.exports) module.exports = C;
  else root.Core = C;
})(typeof window !== "undefined" ? window : globalThis);
