/* Data Workbench UI */
(function () {
  "use strict";
  const C = window.Core;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PAGE = 200;
  const SYMBOLS = ["circle", "square", "diamond", "triangle-up", "cross", "triangle-down", "x", "star"];

  const S = {
    cols: [], n: 0, page: 0, example: true, editFormula: -1,
    plot: { type: "scatter", x: 0, ys: [1], err: -1, logx: false, logy: false, showFit: true, title: "", xl: "", yl: "", yr: "", right: [], logy2: false },
    stat: { type: "desc", x: 0, y: 1, order: 1, model: "expdec", expr: "a*exp(-x/b) + c", init: "", groups: [], paired: false },
    fit: null, statText: "",
  };

  /* ---------- small utilities ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function openDialog(o) {
    $("dlgTitle").textContent = o.title;
    $("dlgText").textContent = o.text || "";
    const a = $("dlgArea"), inp = $("dlgInput");
    inp.hidden = o.input === undefined; inp.value = o.input || ""; inp.placeholder = o.placeholder || "";
    a.hidden = o.area === undefined;
    a.value = o.area || ""; a.readOnly = !!o.readonly; a.placeholder = o.placeholder || "";
    const b = $("dlgBtns");
    b.innerHTML = "";
    (o.actions || []).concat([{ label: o.closeLabel || "Cancel" }]).forEach((act) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn" + (act.primary ? " primary" : ""); btn.textContent = act.label;
      btn.addEventListener("click", () => { $("dlg").close(); if (act.fn) act.fn(o.input !== undefined ? inp.value : a.value); });
      b.appendChild(btn);
    });
    $("dlg").showModal();
    if (!a.hidden) { a.focus(); if (o.readonly) a.select(); }
    if (!inp.hidden) { inp.focus(); inp.select(); inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); b.querySelector(".primary").click(); } }; }
  }
  async function copyText(text, what) {
    try { await navigator.clipboard.writeText(text); toast(what + " copied."); return; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) { toast(what + " copied."); return; }
    } catch (e) { /* fall through */ }
    openDialog({ title: "Copy " + what.toLowerCase(), text: "Automatic copying is blocked here. The text is selected: press Ctrl+C (Cmd+C on Mac).", area: text, readonly: true, closeLabel: "Close" });
  }
  let DL = null;
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("downloads").then((d) => { DL = d; if (d) document.body.classList.add("can-save"); }).catch(() => {});
  }
  if (!(window.claude && typeof window.claude.use === "function")) document.body.classList.add("can-save");
  function browserDownload(filename, data) {
    const types = { csv: "text/csv", svg: "image/svg+xml", txt: "text/plain", png: "image/png" };
    const ext = filename.split(".").pop().toLowerCase();
    const blob = data instanceof Blob ? data : new Blob([data], { type: (types[ext] || "application/octet-stream") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Saved " + filename + ".");
  }
  async function saveFile(filename, data) {
    if (!DL) { try { return browserDownload(filename, data); } catch (e) { return toast("Saving files is not available in this view."); } }
    try { await DL.save({ filename: filename, data: data }); toast("Saved " + filename + "."); }
    catch (e) { if (!e || e.code !== "declined") toast("The file could not be saved" + (e && e.message ? ": " + e.message : ".")); }
  }
  const disp = (v) => (v === null || v === undefined ? "" : typeof v === "number" ? (String(v).length <= 12 ? String(v) : String(Number(v.toPrecision(10)))) : v);
  const dispCalc = (v) => (typeof v === "number" ? String(Number(v.toPrecision(6))) : disp(v));
  const label = (i) => C.letter(i) + " · " + S.cols[i].name;
  const axisName = (c) => (c.unit ? c.name + " (" + c.unit + ")" : c.name);
  const isNumCol = (c) => c.values.some((v) => typeof v === "number");
  const numCols = () => S.cols.map((c, i) => (isNumCol(c) ? i : -1)).filter((i) => i >= 0);
  const inBench = () => document.body.classList.contains("view-bench");
  const valid = (i) => i >= 0 && i < S.cols.length;

  /* ---------- data model ---------- */
  function setData(cols, example) {
    S.n = Math.max.apply(null, cols.map((c) => c.values.length).concat([1]));
    cols.forEach((c) => { while (c.values.length < S.n) c.values.push(null); });
    S.cols = cols; S.page = 0; S.example = !!example; S.fit = null; S.editFormula = -1;
    C.recompute(S.cols, S.n);
    const nc = numCols();
    S.plot.x = nc.length > 1 ? nc[0] : -1;
    S.plot.ys = nc.length > 1 ? [nc[1]] : nc.slice(0, 1);
    S.plot.err = -1; S.plot.logx = S.plot.logy = S.plot.logy2 = false; S.plot.title = S.plot.xl = S.plot.yl = S.plot.yr = ""; S.plot.right = [];
    if (["hist", "box"].indexOf(S.plot.type) >= 0) S.plot.type = "scatter";
    S.stat.x = nc.length ? nc[0] : 0; S.stat.y = nc.length > 1 ? nc[1] : 0; S.stat.groups = nc.slice(1, 4);
    renderAll();
  }
  function remapAfterDelete(d) {
    const m = (i) => (i === d ? -1 : i > d ? i - 1 : i);
    const P = S.plot, T = S.stat;
    P.x = m(P.x); P.err = m(P.err); P.ys = P.ys.map(m).filter((i) => i >= 0); P.right = P.right.map(m).filter((i) => i >= 0);
    T.x = Math.max(0, m(T.x)); T.y = Math.max(0, m(T.y)); T.groups = T.groups.map(m).filter((i) => i >= 0);
    S.fit = null; S.editFormula = -1;
  }
  function changed() { S.example = false; C.recompute(S.cols, S.n); }

  /* ---------- worksheet ---------- */
  function renderTable() {
    const g = $("grid");
    let h = '<thead><tr><th class="corner"></th>';
    S.cols.forEach((c, j) => {
      h += '<th><div class="colhead"><div class="line1"><span class="ltr">' + C.letter(j) + '</span><span class="sp"></span>' +
        '<button class="iconbtn" type="button" data-act="copycol" data-c="' + j + '" title="Copy this column">copy</button>' +
        '<button class="iconbtn" type="button" data-act="delcol" data-c="' + j + '" title="Delete this column" aria-label="Delete column ' + C.letter(j) + '">×</button></div>' +
        '<input id="cn' + j + '" data-f="name" data-c="' + j + '" value="' + esc(c.name) + '" aria-label="Name of column ' + C.letter(j) + '">' +
        '<input id="cu' + j + '" class="unit" data-f="unit" data-c="' + j + '" value="' + esc(c.unit || "") + '" placeholder="unit" aria-label="Unit of column ' + C.letter(j) + '">' +
        (c.formula ? '<button class="iconbtn fx" type="button" data-act="editfx" data-c="' + j + '" title="Edit formula">= ' + esc(c.formula) + "</button>" : "") +
        (c.error ? '<span class="err">' + esc(c.error) + "</span>" : "") + "</div></th>";
    });
    h += "</tr></thead><tbody>";
    const a = S.page * PAGE, b = Math.min(S.n, a + PAGE);
    for (let i = a; i < b; i++) {
      h += '<tr><th class="rn">' + (i + 1) + '<button type="button" data-act="delrow" data-r="' + i + '" title="Delete row ' + (i + 1) + '" aria-label="Delete row ' + (i + 1) + '">×</button></th>';
      S.cols.forEach((c, j) => {
        const v = c.values[i];
        h += "<td" + (c.formula ? ' class="calc"' : ' contenteditable="true"' + (typeof v === "string" ? ' class="txt"' : "")) + ' data-r="' + i + '" data-c="' + j + '">' + esc(c.formula ? dispCalc(v) : disp(v)) + "</td>";
      });
      h += "</tr>";
    }
    g.innerHTML = h + "</tbody>";
    $("dims").textContent = S.n + " rows × " + S.cols.length + " columns";
    $("dsChip").hidden = !S.example;
    const pages = Math.ceil(S.n / PAGE), pg = $("pager");
    pg.innerHTML = pages > 1 ? '<button class="btn small" type="button" data-pg="-1"' + (S.page ? "" : " disabled") + '>Previous</button><span>Rows ' + (a + 1) + "–" + b + " of " + S.n + '</span><button class="btn small" type="button" data-pg="1"' + (S.page < pages - 1 ? "" : " disabled") + ">Next</button>" : "";
  }
  function refreshCalcCells() {
    $("grid").querySelectorAll("td.calc").forEach((td) => { td.textContent = dispCalc(S.cols[+td.dataset.c].values[+td.dataset.r]); });
  }
  function commitCell(td) {
    const r = +td.dataset.r, c = +td.dataset.c, col = S.cols[c];
    if (!col || col.formula) return;
    let text = td.textContent.replace(/ /g, " ").trim();
    if (text === disp(col.values[r])) return;
    if (/^[+-]?\d+,\d+(e[+-]?\d+)?$/i.test(text)) text = text.replace(",", ".");
    const v = C.toValue(text);
    col.values[r] = v;
    td.textContent = disp(v);
    td.classList.toggle("txt", typeof v === "string");
    changed(); refreshCalcCells(); $("dsChip").hidden = true; scheduleSide();
  }
  function pasteBlock(r0, c0, text) {
    const rows = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    rows.forEach((row, dr) => {
      const r = r0 + dr;
      while (r >= S.n) { S.cols.forEach((c) => c.values.push(null)); S.n++; }
      row.forEach((cell, dc) => {
        const c = c0 + dc;
        while (c >= S.cols.length) S.cols.push({ name: C.letter(S.cols.length), unit: "", formula: null, values: Array.from({ length: S.n }, () => null) });
        if (S.cols[c].formula) return;
        let s = cell.trim();
        if (/^[+-]?\d+,\d+(e[+-]?\d+)?$/i.test(s)) s = s.replace(",", ".");
        S.cols[c].values[r] = C.toValue(s);
      });
    });
    changed(); renderAll();
  }
  function cellAt(r, c) { return $("grid").querySelector('td[data-r="' + r + '"][data-c="' + c + '"]'); }

  $("grid").addEventListener("focusout", (e) => { if (e.target.matches && e.target.matches("td[contenteditable]")) commitCell(e.target); });
  $("grid").addEventListener("keydown", (e) => {
    const td = e.target;
    if (!td.matches || !td.matches("td[contenteditable]")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const r = +td.dataset.r + (e.shiftKey ? -1 : 1), nx = cellAt(r, td.dataset.c);
      if (nx) nx.focus(); else td.blur();
    } else if (e.key === "Escape") { td.textContent = disp(S.cols[+td.dataset.c].values[+td.dataset.r]); td.blur(); }
  });
  $("grid").addEventListener("paste", (e) => {
    const td = e.target.closest ? e.target.closest("td[contenteditable]") : null;
    if (!td) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    e.preventDefault(); e.stopPropagation();
    if (/[\t\n]/.test(text.replace(/[\r\n]+$/, ""))) pasteBlock(+td.dataset.r, +td.dataset.c, text);
    else { td.textContent = text.trim(); commitCell(td); }
  });
  $("grid").addEventListener("change", (e) => {
    const f = e.target.dataset && e.target.dataset.f;
    if (!f) return;
    const c = S.cols[+e.target.dataset.c];
    c[f] = e.target.value.trim() || (f === "name" ? C.letter(+e.target.dataset.c) : "");
    changed(); renderAll();
  });
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, c = +b.dataset.c;
    if (act === "copycol") copyText(C.toTSV([S.cols[c]], S.n, $("copyHeaders").checked), "Column " + C.letter(c));
    if (act === "delcol") {
      if (S.cols.length < 2) return toast("A table needs at least one column.");
      S.cols.splice(c, 1); remapAfterDelete(c); changed(); renderAll();
    }
    if (act === "delrow") {
      if (S.n < 2) return toast("A table needs at least one row.");
      S.cols.forEach((col) => col.values.splice(+b.dataset.r, 1)); S.n--;
      S.page = Math.min(S.page, Math.max(0, Math.ceil(S.n / PAGE) - 1));
      changed(); renderAll();
    }
    if (act === "editfx") { startEditFormula(c); showTab("formula"); }
  });
  $("pager").addEventListener("click", (e) => { const b = e.target.closest("[data-pg]"); if (b) { S.page += +b.dataset.pg; renderTable(); } });
  $("btnAddRow").addEventListener("click", () => {
    S.cols.forEach((c) => c.values.push(null)); S.n++; S.page = Math.ceil(S.n / PAGE) - 1;
    changed(); renderAll();
    const first = S.cols.findIndex((c) => !c.formula), td = first >= 0 && cellAt(S.n - 1, first);
    if (td) td.focus();
  });
  $("btnAddCol").addEventListener("click", () => {
    S.cols.push({ name: C.letter(S.cols.length), unit: "", formula: null, values: Array.from({ length: S.n }, () => null) });
    changed(); renderAll();
    const w = document.querySelector(".tablewrap"); w.scrollLeft = w.scrollWidth;
  });
  $("btnCopy").addEventListener("click", () => copyText(C.toTSV(S.cols, S.n, $("copyHeaders").checked), "Table"));
  $("btnCsv").addEventListener("click", () => saveFile("data.csv", C.toTSV(S.cols, S.n, true, ",")));
  $("oCopyData").addEventListener("click", () => copyText(C.toTSV(S.cols, S.n, false), "Data"));

  /* ---------- import ---------- */
  function importText(text) {
    try { setData(C.parseText(text), false); toast("Imported " + S.n + " rows × " + S.cols.length + " columns."); }
    catch (e) { toast(e.message); }
  }
  function importSheet(wb, name) {
    try {
      setData(C.parseRows(window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })), false);
      toast('Imported sheet "' + name + '": ' + S.n + " rows × " + S.cols.length + " columns.");
    } catch (e) { toast(e.message); }
  }
  function handleFile(file) {
    if (!file) return;
    const rd = new FileReader();
    rd.onerror = () => toast("The file could not be read.");
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      if (!window.XLSX) return toast("The spreadsheet reader did not load. Save the sheet as CSV and import that.");
      rd.onload = () => {
        let wb;
        try { wb = window.XLSX.read(new Uint8Array(rd.result), { type: "array" }); } catch (e) { return toast("This file is not a readable spreadsheet."); }
        if (wb.SheetNames.length === 1) return importSheet(wb, wb.SheetNames[0]);
        openDialog({ title: "Which sheet?", text: file.name + " has " + wb.SheetNames.length + " sheets.", actions: wb.SheetNames.slice(0, 12).map((nm) => ({ label: nm, fn: () => importSheet(wb, nm) })) });
      };
      rd.readAsArrayBuffer(file);
    } else {
      rd.onload = () => importText(String(rd.result));
      rd.readAsText(file);
    }
  }
  $("fileInput").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });
  $("btnPaste").addEventListener("click", () => openDialog({
    title: "Paste data", text: "Paste rows copied from Excel, Origin or a text file. A first row of names is used as column headers; a second row of units is recognised too.",
    area: "", placeholder: "Time (s)\tSignal (mV)\n0\t1.02\n1\t0.87", actions: [{ label: "Import", primary: true, fn: (v) => (v.trim() ? importText(v) : toast("Nothing was pasted.")) }],
  }));
  const emptyCols = () => ["A", "B", "C"].map((nm) => ({ name: nm, unit: "", formula: null, values: Array.from({ length: 12 }, () => null) }));
  $("btnNew").addEventListener("click", () => setData(emptyCols(), false));
  document.addEventListener("paste", (e) => {
    const t = e.target;
    if (!inBench()) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && text.trim()) { e.preventDefault(); importText(text); }
  });
  let dragDepth = 0;
  document.addEventListener("dragenter", (e) => { if (inBench() && e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") >= 0) { dragDepth++; document.body.classList.add("drag"); } });
  document.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove("drag"); });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove("drag"); if (inBench() && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

  /* ---------- tabs ---------- */
  function showTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    ["plot", "formula", "stats", "origin"].forEach((t) => { $("tab-" + t).hidden = t !== name; });
    if (name === "plot") drawPlot();
  }
  document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });

  /* ---------- plot ---------- */
  const opts = (list, sel, extra) => (extra || "") + list.map((i) => '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + esc(label(i)) + "</option>").join("");
  function renderPlotControls() {
    const P = S.plot, nc = numCols(), all = S.cols.map((_, i) => i);
    if (!valid(P.x)) P.x = -1;
    if (!valid(P.err)) P.err = -1;
    P.ys = P.ys.filter(valid);
    $("pType").value = P.type;
    $("pX").innerHTML = opts(all, P.x, '<option value="-1"' + (P.x < 0 ? " selected" : "") + ">Row number</option>");
    $("pErr").innerHTML = opts(nc, P.err, '<option value="-1"' + (P.err < 0 ? " selected" : "") + ">None</option>");
    $("pYs").innerHTML = nc.map((i) => {
      const k = P.ys.indexOf(i);
      return '<label><input type="checkbox" id="py' + i + '" value="' + i + '"' + (k >= 0 ? " checked" : "") + ">" + (k >= 0 ? '<span class="sw" style="background:var(--s' + ((k % 8) + 1) + ')"></span>' : "") + esc(label(i)) + "</label>";
    }).join("") || '<span class="note">No numeric columns yet.</span>';
    const canRight = P.ys.length > 1 && ["hist", "box"].indexOf(P.type) < 0;
    P.right = canRight ? P.right.filter((i) => P.ys.indexOf(i) >= 0) : [];
    $("pRightRow").hidden = !canRight;
    $("pRight").innerHTML = P.ys.map((i) => '<label><input type="checkbox" id="pr' + i + '" value="' + i + '"' + (P.right.indexOf(i) >= 0 ? " checked" : "") + '><span class="sw" style="background:var(--s' + ((P.ys.indexOf(i) % 8) + 1) + ')"></span>' + esc(label(i)) + "</label>").join("");
    $("pLogY2").checked = P.logy2; $("pLogY2").parentElement.hidden = !P.right.length; $("pYRWrap").hidden = !P.right.length;
    $("pLogX").checked = P.logx; $("pLogY").checked = P.logy; $("pFit").checked = P.showFit;
    $("pTitle").value = P.title; $("pXL").value = P.xl; $("pYL").value = P.yl; $("pYR").value = P.yr;
  }
  function plotLabels() {
    const P = S.plot;
    const auto = (idx) => { const ys = idx.map((i) => S.cols[i]), units = ys.map((c) => c.unit || ""), same = units.every((u) => u === units[0]); return ys.length === 1 ? axisName(ys[0]) : ys.length && same && units[0] ? units[0] : ""; };
    const yAuto = auto(P.ys.filter((i) => P.right.indexOf(i) < 0));
    const y2 = P.right.length ? P.yr || auto(P.right) : "";
    if (P.type === "hist") return { x: P.xl || yAuto || "Value", y: P.yl || "Count" };
    if (P.type === "box") return { x: P.xl, y: P.yl || yAuto };
    return { x: P.xl || (P.x >= 0 ? axisName(S.cols[P.x]) : "Row number"), y: P.yl || yAuto, y2: y2 };
  }
  function drawPlot() {
    const el = $("chartIn");
    if ($("tab-plot").hidden || !inBench()) return;
    if (!window.Plotly) { el.innerHTML = '<p class="note bad" style="padding:12px">The plotting library did not load. Check the connection and reload the page.</p>'; return; }
    const P = S.plot, css = getComputedStyle(document.documentElement), tok = (n) => css.getPropertyValue(n).trim();
    const surface = tok("--surface"), ink = tok("--ink"), muted = tok("--muted");
    const traces = [], xy = P.type !== "hist" && P.type !== "box";
    P.ys.slice(0, 8).forEach((yi, k) => {
      const col = S.cols[yi], color = tok("--s" + (k + 1)), onRight = xy && P.right.indexOf(yi) >= 0, name = col.name + (onRight ? " (right axis)" : "");
      if (P.type === "hist") { traces.push({ type: "histogram", x: C.clean(col.values), name: name, opacity: P.ys.length > 1 ? 0.7 : 1, marker: { color: color, line: { color: surface, width: 2 } } }); return; }
      if (P.type === "box") { traces.push({ type: "box", y: C.clean(col.values), name: name, boxpoints: "outliers", marker: { color: color }, line: { width: 2 } }); return; }
      const x = [], y = [], err = [];
      for (let i = 0; i < S.n; i++) {
        const yv = col.values[i], xv = P.x >= 0 ? S.cols[P.x].values[i] : i + 1;
        if (typeof yv !== "number" || xv === null || xv === undefined) continue;
        x.push(xv); y.push(yv);
        if (P.err >= 0) { const ev = S.cols[P.err].values[i]; err.push(typeof ev === "number" ? ev : 0); }
      }
      const tr = { x: x, y: y, name: name, hovertemplate: "%{x}<br><b>%{y}</b><extra>" + esc(name) + "</extra>" };
      if (onRight) tr.yaxis = "y2";
      if (P.type === "bar") { tr.type = "bar"; tr.offsetgroup = String(k); tr.marker = { color: color, line: { color: surface, width: 2 } }; }
      else {
        tr.type = "scatter";
        tr.mode = P.type === "scatter" ? "markers" : P.type === "line" ? "lines" : "lines+markers";
        tr.marker = { color: color, size: 9, symbol: SYMBOLS[k], line: { color: surface, width: 1.5 } };
        tr.line = { color: color, width: 2 };
      }
      if (P.err >= 0 && k === 0) tr.error_y = { type: "data", array: err, visible: true, color: color, thickness: 1.2, width: 3 };
      traces.push(tr);
    });
    const F = S.fit;
    if (P.showFit && F && xy && P.type !== "bar" && F.xi === P.x && P.ys.indexOf(F.yi) >= 0 && F.x.length) {
      const lo = Math.min.apply(null, F.x), hi = Math.max.apply(null, F.x), xs = [];
      for (let i = 0; i <= 200; i++) xs.push(P.logx && lo > 0 ? lo * Math.pow(hi / lo, i / 200) : lo + ((hi - lo) * i) / 200);
      traces.push({ type: "scatter", mode: "lines", x: xs, y: F.predict(xs), name: F.label, yaxis: P.right.indexOf(F.yi) >= 0 ? "y2" : "y", line: { color: ink, width: 2 }, hovertemplate: "%{x:.4g}<br><b>%{y:.4g}</b><extra>" + esc(F.label) + "</extra>" });
    }
    const L = plotLabels();
    const axis = (title, log) => ({ title: { text: title || "", font: { color: muted, size: 13 }, standoff: 8 }, type: log ? "log" : "-", gridcolor: tok("--grid"), linecolor: tok("--line"), showline: true, zeroline: false, ticks: "outside", tickcolor: tok("--line"), tickfont: { color: muted }, automargin: true });
    const layout = {
      paper_bgcolor: surface, plot_bgcolor: surface, font: { family: '"IBM Plex Sans", system-ui, sans-serif', color: ink, size: 13 },
      margin: { l: 60, r: 18, t: P.title ? 48 : 30, b: 52 },
      title: P.title ? { text: esc(P.title), font: { size: 16 }, x: 0.01, xanchor: "left" } : { text: "" },
      xaxis: axis(esc(L.x || ""), xy && P.logx), yaxis: axis(esc(L.y || ""), xy && P.logy),
      showlegend: traces.length > 1, legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: muted } },
      hovermode: "closest", barmode: P.type === "hist" ? "overlay" : "group", bargap: 0.18,
      hoverlabel: { bgcolor: surface, bordercolor: tok("--line"), font: { color: ink } },
    };
    if (xy && P.right.length) {
      layout.yaxis2 = Object.assign(axis(esc(L.y2 || ""), P.logy2), { overlaying: "y", side: "right", showgrid: false });
      layout.margin.r = 60;
    }
    if (!traces.length) layout.annotations = [{ text: "Choose at least one Y column", showarrow: false, font: { color: muted, size: 14 } }];
    window.Plotly.react(el, traces, layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"] });
  }
  function readPlotControls() {
    const P = S.plot;
    P.type = $("pType").value; P.x = +$("pX").value; P.err = +$("pErr").value;
    P.logx = $("pLogX").checked; P.logy = $("pLogY").checked; P.showFit = $("pFit").checked;
    P.title = $("pTitle").value; P.xl = $("pXL").value; P.yl = $("pYL").value; P.yr = $("pYR").value; P.logy2 = $("pLogY2").checked;
  }
  $("tab-plot").addEventListener("change", (e) => {
    if (e.target.closest("#pYs")) {
      const i = +e.target.value;
      if (e.target.checked) { if (S.plot.ys.length >= 8) { e.target.checked = false; return toast("A plot shows at most 8 series. Remove one first."); } S.plot.ys.push(i); }
      else S.plot.ys = S.plot.ys.filter((v) => v !== i);
    } else if (e.target.closest("#pRight")) {
      const i = +e.target.value;
      S.plot.right = e.target.checked ? S.plot.right.concat([i]) : S.plot.right.filter((v) => v !== i);
    } else readPlotControls();
    renderPlotControls(); drawPlot(); renderOrigin();
  });
  ["pTitle", "pXL", "pYL", "pYR"].forEach((id) => $(id).addEventListener("input", () => { readPlotControls(); drawPlot(); renderOrigin(); }));
  async function plotImage(format, id) {
    const el = $(id || "chartIn");
    return window.Plotly.toImage(el, { format: format, width: el.clientWidth, height: el.clientHeight, scale: format === "png" ? 3 : 1 });
  }
  function dataUrlToBlob(url) {
    const bin = atob(url.split(",")[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: "image/png" });
  }
  $("btnPng").addEventListener("click", async () => { try { saveFile("plot.png", dataUrlToBlob(await plotImage("png"))); } catch (e) { toast("The plot could not be exported."); } });
  $("btnSvg").addEventListener("click", async () => { try { const u = await plotImage("svg"); saveFile("plot.svg", decodeURIComponent(u.slice(u.indexOf(",") + 1))); } catch (e) { toast("The plot could not be exported."); } });
  $("btnCopyImg").addEventListener("click", async () => {
    try {
      const blob = dataUrlToBlob(await plotImage("png"));
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      toast("Plot image copied.");
    } catch (e) { toast(DL ? "Copying images is blocked here. Use Save PNG instead." : "Copying images is blocked in this view."); }
  });

  /* ---------- formulas ---------- */
  function previewFormula() {
    const expr = $("fExpr").value, el = $("fPrev");
    el.classList.remove("bad");
    if (!expr.trim()) { el.textContent = "Refer to columns by letter (A, B, C) or by name. The column recalculates whenever the data change."; return null; }
    const tmp = S.cols.map((c) => Object.assign({}, c));
    const probe = { name: "\u0000preview", unit: "", formula: expr, values: [] };
    if (S.editFormula >= 0) tmp[S.editFormula] = probe; else tmp.push(probe);
    C.recompute(tmp, S.n);
    if (probe.error) { el.textContent = probe.error; el.classList.add("bad"); return null; }
    const shown = probe.values.slice(0, 5).map((v) => (v === null ? "—" : C.fmt(v)));
    el.textContent = "First values: " + shown.join(",  ") + (S.n > 5 ? ", …" : "");
    return probe;
  }
  function startEditFormula(j) {
    S.editFormula = j;
    $("fName").value = S.cols[j].name; $("fUnit").value = S.cols[j].unit || ""; $("fExpr").value = S.cols[j].formula;
    renderFormulaTab(); previewFormula(); $("fExpr").focus();
  }
  function renderFormulaTab() {
    const ed = S.editFormula >= 0 && S.cols[S.editFormula];
    $("fHead").textContent = ed ? "Edit column " + C.letter(S.editFormula) : "New calculated column";
    $("fAdd").textContent = ed ? "Update column" : "Add column";
    $("fCancel").hidden = !ed;
    const items = S.cols.map((c, j) => (c.formula ? '<div class="item"><span class="ltr chip">' + C.letter(j) + "</span><b>" + esc(c.name) + "</b><code>= " + esc(c.formula) + '</code><button class="btn small" type="button" data-fx="edit" data-c="' + j + '">Edit</button><button class="btn small" type="button" data-fx="freeze" data-c="' + j + '" title="Keep the values, drop the formula">Keep values only</button></div>' : "")).join("");
    $("fList").innerHTML = items ? "<h2>Calculated columns</h2>" + items : "";
  }
  function resetFormulaForm() { S.editFormula = -1; $("fName").value = $("fUnit").value = $("fExpr").value = ""; previewFormula(); }
  $("fExpr").addEventListener("input", previewFormula);
  $("fExpr").addEventListener("keydown", (e) => { if (e.key === "Enter") $("fAdd").click(); });
  $("fAdd").addEventListener("click", () => {
    if (!previewFormula()) { if (!$("fExpr").value.trim()) toast("Type a formula first."); return; }
    const name = $("fName").value.trim(), unit = $("fUnit").value.trim(), expr = $("fExpr").value.trim();
    if (S.editFormula >= 0) Object.assign(S.cols[S.editFormula], { name: name || S.cols[S.editFormula].name, unit: unit, formula: expr });
    else S.cols.push({ name: name || C.letter(S.cols.length), unit: unit, formula: expr, values: [] });
    resetFormulaForm(); changed(); renderAll();
    toast("Column calculated.");
  });
  $("fCancel").addEventListener("click", () => { resetFormulaForm(); renderFormulaTab(); });
  $("fList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fx]");
    if (!b) return;
    const j = +b.dataset.c;
    if (b.dataset.fx === "edit") startEditFormula(j);
    else { S.cols[j].formula = null; S.cols[j].error = null; if (S.editFormula === j) resetFormulaForm(); changed(); renderAll(); }
  });

  /* ---------- statistics ---------- */
  function table(head, rows) {
    S.statText += head.join("\t") + "\n" + rows.map((r) => r.join("\t")).join("\n") + "\n\n";
    return '<div class="scroll"><table class="res"><thead><tr>' + head.map((h) => "<th>" + esc(h) + "</th>").join("") + "</tr></thead><tbody>" +
      rows.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
  }
  function kv(pairs) {
    S.statText += pairs.map((p) => p[0] + "\t" + p[1]).join("\n") + "\n\n";
    return '<div class="kv">' + pairs.map((p) => "<div><span>" + esc(p[0]) + "</span> <b>" + esc(p[1]) + "</b></div>").join("") + "</div>";
  }
  function renderStatControls() {
    const T = S.stat, nc = numCols();
    if (!valid(T.x)) T.x = nc[0] || 0;
    if (!valid(T.y)) T.y = nc[1] || nc[0] || 0;
    T.groups = T.groups.filter(valid);
    $("sType").value = T.type;
    let h = "";
    const xy = '<label class="field">X column <select id="sX">' + opts(nc, T.x) + '</select></label><label class="field">Y column <select id="sY">' + opts(nc, T.y) + "</select></label>";
    if (T.type === "poly") h = xy + '<label class="field">Order <select id="sOrder">' + [1, 2, 3, 4, 5].map((k) => '<option value="' + k + '"' + (k === T.order ? " selected" : "") + ">" + (k === 1 ? "1 (straight line)" : k) + "</option>").join("") + "</select></label>";
    if (T.type === "nl") {
      h = xy + '<label class="field">Model <select id="sModel">' + C.models.map((m) => '<option value="' + m.id + '"' + (m.id === T.model ? " selected" : "") + ">" + esc(m.label) + "</option>").join("") + '<option value="custom"' + (T.model === "custom" ? " selected" : "") + ">Custom formula…</option></select></label>" +
        (T.model === "custom" ? '<label class="field wide">y = <input type="text" class="mono" id="sExpr" value="' + esc(T.expr) + '" spellcheck="false" autocomplete="off"></label>' : "") +
        '<label class="field wide">Initial values (optional) <input type="text" class="mono" id="sInit" value="' + esc(T.init) + '" placeholder="' + (T.model === "custom" ? "a=1, b=10, c=0" : "set by the model, e.g. tau=5") + '" spellcheck="false" autocomplete="off"></label>';
    }
    if (T.type === "cmp") {
      h = '<div class="field">Groups (one column each)<div class="ychips" id="sGroups">' + nc.map((i) => '<label><input type="checkbox" id="sg' + i + '" value="' + i + '"' + (T.groups.indexOf(i) >= 0 ? " checked" : "") + ">" + esc(label(i)) + "</label>").join("") + "</div></div>" +
        '<label class="check"><input type="checkbox" id="sPaired"' + (T.paired ? " checked" : "") + "> paired rows (two groups only)</label>";
    }
    $("sCtl").innerHTML = h;
  }
  function parseInit(s) {
    const o = {};
    s.split(/[,;]/).forEach((part) => { const m = part.match(/^\s*([^=\s]+)\s*=\s*(\S+)\s*$/); if (m && isFinite(Number(m[2]))) o[m[1]] = Number(m[2]); });
    return o;
  }
  function fitOutput(f, xi, yi, pr) {
    S.fit = { xi: xi, yi: yi, x: pr.x, predict: f.predict, label: f.label };
    let h = "<h2>" + esc(f.label) + ": " + esc(S.cols[yi].name) + " against " + esc(S.cols[xi].name) + "</h2>";
    S.statText += f.label + "\n" + f.equation + "\n";
    h += '<div class="eq">' + esc(f.equation) + "</div>";
    h += table(["Parameter", "Value", "Std. error", "95% CI ±", "t", "p"], f.params.map((p) => [p.name, C.fmt(p.value), C.fmt(p.se), C.fmt(p.ci), C.fmt(p.t), C.pfmt(p.p)]));
    h += kv([["R²", C.fmt(f.r2)], ["Adjusted R²", C.fmt(f.adjR2)], ["Residual SD", C.fmt(f.sigma)], ["Points", String(f.n)], ["Degrees of freedom", String(f.dof)]]);
    if (f.kind === "nl" && !f.wellDetermined) h += '<p class="note bad">The data do not pin down every parameter, so some standard errors are missing. Try other initial values or a simpler model.</p>';
    h += '<div class="row"><button class="btn small primary" type="button" data-st="show">Show on plot</button><button class="btn small" type="button" data-st="fitcol">Add fitted values as column</button><button class="btn small" type="button" data-st="rescol">Add residuals as column</button><button class="btn small" type="button" data-st="copy">Copy results</button></div>';
    return h;
  }
  function runStats() {
    const T = S.stat, out = $("sOut"), nc = numCols();
    S.statText = "";
    const prevFit = S.fit;
    let h = "";
    try {
      if (!nc.length) throw new Error("The table has no numeric columns yet.");
      if (T.type === "desc") {
        h = table(["Column", "N", "Mean", "SD", "SEM", "95% CI ±", "Min", "Q1", "Median", "Q3", "Max", "CV %"],
          nc.map((i) => { const d = C.describe(S.cols[i].values); return [label(i), String(d.n)].concat([d.mean, d.sd, d.sem, d.ci95, d.min, d.q1, d.median, d.q3, d.max, d.cv].map(C.fmt)); }));
        h += '<div class="row"><button class="btn small" type="button" data-st="copy">Copy results</button></div>';
      } else if (T.type === "poly" || T.type === "nl") {
        if (T.x === T.y) throw new Error("Choose different columns for X and Y.");
        const pr = C.pairs(S.cols[T.x].values, S.cols[T.y].values);
        let f;
        if (T.type === "poly") f = C.polyfit(pr.x, pr.y, T.order);
        else {
          const model = T.model === "custom" ? C.customModel(T.expr) : C.models.find((m) => m.id === T.model);
          f = C.nlfit(model, pr.x, pr.y, parseInit(T.init));
        }
        h = fitOutput(f, T.x, T.y, pr);
      } else if (T.type === "cmp") {
        const g = T.groups;
        if (g.length < 2) throw new Error("Choose at least two columns to compare.");
        h = table(["Group", "N", "Mean", "SD", "SEM"], g.map((i) => { const d = C.describe(S.cols[i].values); return [label(i), String(d.n), C.fmt(d.mean), C.fmt(d.sd), C.fmt(d.sem)]; }));
        if (g.length === 2) {
          const r = C.ttest(S.cols[g[0]].values, S.cols[g[1]].values, T.paired);
          h += "<h2>" + r.test + "</h2>" + kv([["t", C.fmt(r.t)], ["Degrees of freedom", C.fmt(r.df)], ["p (two-sided)", C.pfmt(r.p)], ["Mean difference", C.fmt(r.diff) + " ± " + C.fmt(r.ci) + " (95% CI)"]]);
        } else {
          const r = C.anova(g.map((i) => S.cols[i].values));
          h += "<h2>One-way ANOVA</h2>" + table(["Source", "Sum of squares", "df", "Mean square", "F", "p"], [["Between groups", C.fmt(r.ssb), String(r.df1), C.fmt(r.msb), C.fmt(r.F), C.pfmt(r.p)], ["Within groups", C.fmt(r.ssw), String(r.df2), C.fmt(r.msw), "", ""]]) +
            '<p class="note">ANOVA tests whether any group mean differs. Pairwise post-hoc tests are not included.</p>';
        }
        h += '<div class="row"><button class="btn small" type="button" data-st="copy">Copy results</button></div>';
      } else if (T.type === "corr") {
        if (nc.length < 2) throw new Error("Correlation needs at least two numeric columns.");
        h = "<h2>Pearson correlation, r (p)</h2>" + table([""].concat(nc.map((i) => C.letter(i) + " " + S.cols[i].name)), nc.map((i) => [label(i)].concat(nc.map((j) => { if (i === j) return "1"; const r = C.pearson(S.cols[i].values, S.cols[j].values); return C.fmt(r.r) + " (" + C.pfmt(r.p) + ")"; })))) +
          '<div class="row"><button class="btn small" type="button" data-st="copy">Copy results</button></div>';
      }
    } catch (e) {
      h = '<p class="note bad">' + esc(e.message) + "</p>";
      if (T.type === "poly" || T.type === "nl") S.fit = null;
    }
    if (T.type !== "poly" && T.type !== "nl") S.fit = prevFit;
    out.innerHTML = h;
    drawPlot(); markDirty();
  }
  $("sType").addEventListener("change", () => { S.stat.type = $("sType").value; renderStatControls(); runStats(); });
  $("sCtl").addEventListener("change", (e) => {
    const T = S.stat, id = e.target.id;
    if (id === "sX") T.x = +e.target.value;
    if (id === "sY") T.y = +e.target.value;
    if (id === "sOrder") T.order = +e.target.value;
    if (id === "sModel") { T.model = e.target.value; T.init = ""; renderStatControls(); }
    if (id === "sPaired") T.paired = e.target.checked;
    if (e.target.closest("#sGroups")) { const i = +e.target.value; T.groups = e.target.checked ? T.groups.concat([i]) : T.groups.filter((v) => v !== i); }
    runStats();
  });
  let statTimer;
  $("sCtl").addEventListener("input", (e) => {
    if (e.target.id === "sExpr") S.stat.expr = e.target.value; else if (e.target.id === "sInit") S.stat.init = e.target.value; else return;
    clearTimeout(statTimer); statTimer = setTimeout(runStats, 350);
  });
  $("sOut").addEventListener("click", (e) => {
    const b = e.target.closest("[data-st]");
    if (!b) return;
    const act = b.dataset.st, F = S.fit;
    if (act === "copy") return copyText(S.statText.trim(), "Results");
    if (!F) return;
    if (act === "show") {
      const P = S.plot;
      P.x = F.xi; if (P.ys.indexOf(F.yi) < 0) P.ys = [F.yi];
      if (["hist", "box", "bar"].indexOf(P.type) >= 0) P.type = "scatter";
      P.showFit = true; renderPlotControls(); showTab("plot"); renderOrigin();
      return;
    }
    const xv = C.numeric(S.cols[F.xi].values), yh = F.predict(xv.map((v) => (isFinite(v) ? v : 0)));
    const vals = xv.map((v, i) => { if (!isFinite(v)) return null; const r = act === "fitcol" ? yh[i] : S.cols[F.yi].values[i] - yh[i]; return typeof r === "number" && isFinite(r) ? Number(r.toPrecision(8)) : null; });
    S.cols.push({ name: (act === "fitcol" ? "Fit " : "Residual ") + S.cols[F.yi].name, unit: S.cols[F.yi].unit || "", formula: null, values: vals });
    changed(); renderAll(); toast("Column added to the table.");
  });

  /* ---------- Origin ---------- */
  function renderOrigin() {
    const P = S.plot, L = plotLabels();
    $("oScript").textContent = C.originScript(S.cols, S.n, { type: P.type, x: P.x, ys: P.ys, err: P.err, logx: P.logx, logy: P.logy, xlabel: L.x, ylabel: L.y, right: P.right, logy2: P.logy2, y2label: L.y2 });
    markDirty();
  }
  $("oCopyScript").addEventListener("click", () => copyText($("oScript").textContent, "Script"));
  $("oSaveScript").addEventListener("click", () => saveFile("origin_export.txt", $("oScript").textContent));

  /* ---------- orchestration ---------- */
  function renderSide() { renderPlotControls(); renderFormulaTab(); renderStatControls(); runStats(); renderOrigin(); }
  function renderAll() { renderTable(); renderSide(); }
  let sideTimer;
  function scheduleSide() { clearTimeout(sideTimer); sideTimer = setTimeout(renderSide, 200); }
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawPlot);
  new MutationObserver(drawPlot).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------- example data: first-order decay, three replicate runs ---------- */
  function exampleCols() {
    const t = [], runs = [[], [], []], A = [1.02, 0.97, 1.05], tau = [7.8, 8.4, 8.0];
    for (let i = 0; i <= 15; i++) {
      t.push(i * 2);
      runs.forEach((r, k) => r.push(Number((0.12 + A[k] * Math.exp(-(i * 2) / tau[k]) + 0.018 * Math.sin(i * 12.9898 + k * 78.233) * Math.cos(i * 3.7 + k)).toFixed(3))));
    }
    const cols = [{ name: "Time", unit: "min", formula: null, values: t }].concat(runs.map((r, k) => ({ name: "Run " + (k + 1), unit: "a.u.", formula: null, values: r })));
    cols.push({ name: "Mean", unit: "a.u.", formula: "(B + C + D) / 3", values: [] });
    return cols;
  }
  function loadExample() {
    setData(exampleCols(), true);
    S.plot.x = 0; S.plot.ys = [4];
    Object.assign(S.stat, { type: "nl", x: 0, y: 4, model: "expdec", groups: [1, 2, 3] });
    renderSide();
  }

  /* ---------- storage: the artifact's database, or this browser as a fallback ---------- */
  const Store = { db: null, sb: null, remote: false, local: false, broken: false, email: "" };
  const CFG = window.DW_CONFIG || {};
  const PFX = CFG.dataPrefix || "";
  const sbErr = (error) => { const e = new Error(error.message || "Request failed"); e.code = error.code === "42501" ? "not_granted" : error.code; return e; };
  const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);
  Store.init = async function () {
    const inClaude = !!(window.claude && typeof window.claude.use === "function");
    try { if (inClaude) Store.db = await timeout(window.claude.use("db"), 11000, "timeout"); } catch (e) { Store.db = null; }
    if (!inClaude && CFG.supabaseUrl && CFG.supabaseKey && window.supabase) {
      Store.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      Store.remote = true;
    }
    Store.local = !Store.db && !Store.remote;
  };
  Store.list = async function (prefix) {
    const { data, error } = await timeout(Store.sb.from("docs").select("path,data").like("path", PFX + prefix + "%"), 15000, "The saved data could not be reached.");
    if (error) throw sbErr(error);
    return data || [];
  };
  Store.get = async function (path) {
    if (Store.remote) {
      const { data, error } = await timeout(Store.sb.from("docs").select("data").eq("path", PFX + path).maybeSingle(), 15000, "The saved data could not be reached.");
      if (error) throw sbErr(error);
      return data ? data.data : null;
    }
    if (Store.db) { const s = await timeout(Store.db.doc(path).get(), 10000, "The saved data could not be reached."); return s.exists ? JSON.parse(JSON.stringify(s.data())) : null; }
    try { const v = localStorage.getItem("dw:" + PFX + path); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  };
  Store.set = async function (path, data) {
    if (Store.remote) {
      const { error } = await Store.sb.from("docs").upsert({ path: PFX + path, data: data, updated_at: new Date().toISOString(), updated_by: Store.email });
      if (error) throw sbErr(error);
      return;
    }
    if (Store.db) return Store.db.doc(path).set(data);
    localStorage.setItem("dw:" + PFX + path, JSON.stringify(data));
  };
  Store.del = async function (path) {
    if (Store.remote) { const { error } = await Store.sb.from("docs").delete().eq("path", PFX + path); if (error) throw sbErr(error); return; }
    if (Store.db) return Store.db.doc(path).delete();
    localStorage.removeItem("dw:" + PFX + path);
  };
  function setState(msg, bad) { const el = $("saveState"); el.textContent = msg; el.classList.toggle("bad", !!bad); }
  const pend = {}, busy = {};
  function save(path, data) {
    if (Store.broken) return;
    pend[path] = data;
    if (!busy[path]) pump(path);
  }
  async function pump(path) {
    busy[path] = true;
    setState("Saving…");
    try {
      while (path in pend) { const d = pend[path]; delete pend[path]; await Store.set(path, d); }
      setState(Store.local ? "Saved in this browser only" : Store.remote ? "Saved for everyone" : "Saved");
    } catch (e) {
      const code = e && e.code;
      setState(code === "quota_exceeded" ? "Not saved: the storage for this page is full." : code === "invalid_argument" || code === "not_granted" || code === "revoked" ? "Not saved: you cannot change this page's data, or the entry is too large." : "Not saved. Your last change is kept only until you leave this page.", true);
    }
    busy[path] = false;
  }

  /* ---------- samples registry ---------- */
  let R = null, cur = null, savedJson = "", dirtyTimer;
  const NCOL = 5;
  const sampleName = (sm) => (sm.info[0] && sm.info[0].trim()) || "Sample " + (R.samples.indexOf(sm) + 1);
  function defaultRegistry() {
    return {
      infoTitles: ["Sample name", "Composition", "Date prepared", "Batch", "Notes"],
      procTitles: ["Synthesis", "Purification", "Drying", "Characterization", "Data analysis"],
      samples: [{ id: "example", example: true, info: ["Example sample", "", "", "", "Example row with example data. Edit or delete it."], proc: [true, false, false, false, false], rows: 16, cols: 5 }],
    };
  }
  function normalize(r) {
    const fix = (a, fill) => { a = Array.isArray(a) ? a.slice(0, NCOL) : []; while (a.length < NCOL) a.push(fill(a.length)); return a; };
    r.infoTitles = fix(r.infoTitles, (k) => "Info " + (k + 1)); r.procTitles = fix(r.procTitles, (k) => "Process " + (k + 1));
    r.samples = (Array.isArray(r.samples) ? r.samples : []).filter((s) => s && s.id);
    r.samples.forEach(normSample);
    return r;
  }
  function normSample(s) {
    const fix = (a, fill) => { a = Array.isArray(a) ? a.slice(0, NCOL) : []; while (a.length < NCOL) a.push(fill(a.length)); return a; };
    s.info = fix(s.info, () => "").map(String); s.proc = fix(s.proc, () => false).map(Boolean);
    s.sheets = (Array.isArray(s.sheets) ? s.sheets : []).filter((h) => h && h.id);
    if (!s.sheets.length) s.sheets = [{ id: "main", name: "Data", rows: s.rows || 0, cols: s.cols || 0 }];
    return s;
  }
  const sheetPath = (sm, sh) => (sh.id === "main" ? "datasets/" + sm.id : "datasets/" + sm.id + "/" + sh.id);
  function sheetSummary(sm) {
    if (sm.sheets.length > 1) return sm.sheets.length + " sheets";
    const h = sm.sheets[0];
    return h.rows ? h.rows + " × " + h.cols : "empty";
  }
  function saveRegistry() { if (!Store.remote) save("lab/registry", JSON.parse(JSON.stringify(R))); }
  // Online, each sample is its own row and the column titles are another, so people editing different samples never overwrite each other.
  function saveTitles() { if (Store.remote) save("lab/titles", { infoTitles: R.infoTitles.slice(), procTitles: R.procTitles.slice() }); else saveRegistry(); }
  function saveSample(sm) { if (Store.remote) save("samples/" + sm.id, JSON.parse(JSON.stringify(sm))); else saveRegistry(); }
  async function loadRemoteRegistry() {
    const [titles, rows] = await Promise.all([Store.get("lab/titles"), Store.list("samples/")]);
    const samples = rows.map((r) => r.data).filter((d) => d && d.id).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!titles && !samples.length) {
      const r = defaultRegistry();
      r.samples[0].created = 0;
      await Store.set("lab/titles", { infoTitles: r.infoTitles, procTitles: r.procTitles });
      await Store.set("samples/example", r.samples[0]);
      return r;
    }
    const d = defaultRegistry();
    return { infoTitles: (titles && titles.infoTitles) || d.infoTitles, procTitles: (titles && titles.procTitles) || d.procTitles, samples: samples };
  }
  async function loadRegistry() { return Store.remote ? loadRemoteRegistry() : Store.get("lab/registry"); }
  function renderRegistry() {
    if (!R) return;
    let h = '<thead><tr class="groups"><th></th><th></th><th colspan="' + NCOL + '">Sample information</th><th colspan="' + NCOL + '">Processes completed</th><th colspan="2">Data</th></tr><tr><th class="corner narrow">#</th><th class="sel narrow" title="Tick samples to plot them together">Plot</th>';
    R.infoTitles.forEach((t, k) => { h += '<th><input type="text" id="it' + k + '" data-title="info" data-k="' + k + '" value="' + esc(t) + '" aria-label="Title of information column ' + (k + 1) + '"></th>'; });
    R.procTitles.forEach((t, k) => { h += '<th class="ck"><input type="text" id="pt' + k + '" data-title="proc" data-k="' + k + '" value="' + esc(t) + '" aria-label="Title of process column ' + (k + 1) + '"></th>'; });
    h += '<th class="narrow">Measurements</th><th class="narrow"></th></tr></thead><tbody>';
    R.samples.forEach((sm, i) => {
      h += '<tr><th class="rn">' + (i + 1) + '</th><td class="sel"><input type="checkbox" data-sel="' + i + '"' + (SEL.has(sm.id) ? " checked" : "") + ' aria-label="Select sample ' + (i + 1) + ' for a combined plot"></td>';
      sm.info.forEach((v, k) => { h += '<td><input type="text" id="si' + i + "_" + k + '" data-s="' + i + '" data-k="' + k + '" value="' + esc(v) + '" aria-label="' + esc(R.infoTitles[k]) + ", sample " + (i + 1) + '"></td>'; });
      sm.proc.forEach((v, k) => { h += '<td class="ck"><input type="checkbox" id="sp' + i + "_" + k + '" data-s="' + i + '" data-k="' + k + '"' + (v ? " checked" : "") + ' aria-label="' + esc(R.procTitles[k]) + ", sample " + (i + 1) + '"></td>'; });
      h += '<td class="narrow"><button class="btn small" type="button" data-open="' + i + '">Open data</button><span class="dims">' + sheetSummary(sm) + '</span></td><td class="narrow"><button class="iconbtn" type="button" data-del="' + i + '" title="Delete this sample" aria-label="Delete sample ' + (i + 1) + '">×</button></td></tr>';
    });
    if (!R.samples.length) h += '<tr><td colspan="' + (2 * NCOL + 4) + '" style="padding:16px">No samples yet. Use Add sample to create the first one.</td></tr>';
    $("reg").innerHTML = h + "</tbody>";
    const n = R.samples.length;
    $("regCount").textContent = n + (n === 1 ? " sample" : " samples");
    updateCombineBtn();
  }
  $("reg").addEventListener("change", (e) => {
    const t = e.target, d = t.dataset;
    if (d.sel !== undefined) { const sm = R.samples[+d.sel]; if (t.checked) SEL.add(sm.id); else SEL.delete(sm.id); updateCombineBtn(); return; }
    if (d.title) { R[d.title === "info" ? "infoTitles" : "procTitles"][+d.k] = t.value.trim() || (d.title === "info" ? "Info " : "Process ") + (+d.k + 1); renderRegistry(); saveTitles(); }
    else if (d.s !== undefined) { const sm = R.samples[+d.s]; if (t.type === "checkbox") sm.proc[+d.k] = t.checked; else sm.info[+d.k] = t.value; saveSample(sm); }
  });
  $("reg").addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"), x = e.target.closest("[data-del]");
    if (o) openSample(R.samples[+o.dataset.open]);
    if (x) {
      const sm = R.samples[+x.dataset.del];
      openDialog({ title: "Delete " + sampleName(sm) + "?", text: "The sample row and its measurement data are removed for good.", actions: [{ label: "Delete sample", primary: true, fn: () => {
        R.samples = R.samples.filter((s) => s !== sm); renderRegistry(); saveRegistry();
        if (!Store.broken) {
          if (Store.remote) Store.del("samples/" + sm.id).catch(() => setState("The sample could not be deleted online. Refresh and try again.", true));
          sm.sheets.forEach((h) => Store.del(sheetPath(sm, h)).catch(() => {}));
        }
      } }] });
    }
  });
  $("btnAddSample").addEventListener("click", () => {
    if (!R) return;
    const sm = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), info: ["", "", "", "", ""], proc: [false, false, false, false, false], rows: 0, cols: 0, sheets: [{ id: "main", name: "Data", rows: 0, cols: 0 }] };
    R.samples.push(sm);
    renderRegistry(); saveSample(sm);
    const el = $("si" + (R.samples.length - 1) + "_0");
    if (el) { el.scrollIntoView({ block: "nearest" }); el.focus(); }
  });

  /* ---------- one sample's workbench ---------- */
  function snapshot() {
    return JSON.stringify({ cols: S.cols.map((c) => ({ name: c.name, unit: c.unit || "", formula: c.formula || null, values: c.formula ? [] : c.values })), n: S.n, plot: S.plot, stat: S.stat });
  }
  function markDirty() { if (!cur) return; clearTimeout(dirtyTimer); dirtyTimer = setTimeout(flush, 1200); }
  function flush() {
    clearTimeout(dirtyTimer);
    if (!cur) return;
    const j = snapshot();
    if (j === savedJson) return;
    savedJson = j;
    if (j.length > 250000) return setState("Not saved: this table is too large to store (about 20,000 values at most). It stays here until you leave the page.", true);
    save(sheetPath(cur, curSheet), JSON.parse(j));
    const filled = S.cols.some((c) => c.values.some((v) => v !== null));
    const rows = filled ? S.n : 0, ncols = filled ? S.cols.length : 0;
    if (curSheet.rows !== rows || curSheet.cols !== ncols) {
      curSheet.rows = rows; curSheet.cols = ncols;
      if (curSheet.id === "main") { cur.rows = rows; cur.cols = ncols; }
      saveSample(cur);
    }
  }
  function showView(v) { ["samples", "bench", "combine"].forEach((k) => document.body.classList.toggle("view-" + k, v === k)); }
  let curSheet = null;
  async function openSample(sm) {
    if (Store.remote) {
      try { const fresh = await Store.get("samples/" + sm.id); if (fresh) { Object.assign(sm, normSample(fresh)); } } catch (e) { /* use what we have */ }
    }
    const ok = await openSheet(sm, sm.sheets[0]);
    if (ok) { showView("bench"); showTab("plot"); }
  }
  function renderSheetTabs() {
    const box = $("sheetTabs");
    if (!cur) { box.innerHTML = ""; return; }
    let h = "";
    cur.sheets.forEach((sh, i) => {
      const on = sh === curSheet;
      h += '<button type="button" role="tab" aria-selected="' + on + '" data-sheet="' + i + '" title="' + (on ? "Double-click to rename" : "Open this sheet") + '">' + esc(sh.name || "Sheet " + (i + 1)) + "</button>";
    });
    h += '<button type="button" class="add" id="sheetAdd" title="Add a sheet to this sample">+ Sheet</button><span class="sp"></span>';
    h += '<button type="button" class="iconbtn" id="sheetRename">Rename</button>';
    if (cur.sheets.length > 1) h += '<button type="button" class="iconbtn" id="sheetDel">Delete sheet</button>';
    box.innerHTML = h;
  }
  const SHEET_IDEAS = "e.g. Swelling, Rheology, Conductivity, FTIR, DSC";
  $("sheetTabs").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || !cur) return;
    if (t.dataset.sheet !== undefined) { const sh = cur.sheets[+t.dataset.sheet]; if (sh !== curSheet) openSheet(cur, sh); return; }
    if (t.id === "sheetAdd") {
      openDialog({ title: "New sheet in " + sampleName(cur), text: "Name it after what you measure, " + SHEET_IDEAS + ".", input: "", placeholder: "Sheet name", actions: [{ label: "Add sheet", primary: true, fn: (v) => {
        const sh = { id: "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: v.trim() || "Sheet " + (cur.sheets.length + 1), rows: 0, cols: 0 };
        cur.sheets.push(sh); saveSample(cur); openSheet(cur, sh);
      } }] });
    }
    if (t.id === "sheetRename") renameSheet();
    if (t.id === "sheetDel") {
      const sh = curSheet;
      openDialog({ title: "Delete sheet " + sh.name + "?", text: "This sheet's table, formulas and plot settings are removed for good. The sample's other sheets are kept.", actions: [{ label: "Delete sheet", primary: true, fn: () => {
        clearTimeout(dirtyTimer);
        const i = cur.sheets.indexOf(sh);
        cur.sheets = cur.sheets.filter((x) => x !== sh);
        if (sh.id === "main") { cur.rows = 0; cur.cols = 0; }
        saveSample(cur);
        Store.del(sheetPath(cur, sh)).catch(() => {});
        curSheet = null;
        openSheet(cur, cur.sheets[Math.max(0, i - 1)]);
      } }] });
    }
  });
  $("sheetTabs").addEventListener("dblclick", (e) => { const t = e.target.closest("[data-sheet]"); if (t && cur && cur.sheets[+t.dataset.sheet] === curSheet) renameSheet(); });
  function renameSheet() {
    const sh = curSheet;
    openDialog({ title: "Rename sheet", text: SHEET_IDEAS.replace("e.g.", "For example:") + ".", input: sh.name, placeholder: "Sheet name", actions: [{ label: "Rename", primary: true, fn: (v) => {
      if (!v.trim()) return;
      sh.name = v.trim(); saveSample(cur); renderSheetTabs();
    } }] });
  }
  async function openSheet(sm, sh) {
    if (cur && curSheet) flush();
    let d = null;
    try { d = await Store.get(sheetPath(sm, sh)); } catch (e) { toast("The saved data for this sheet could not be loaded. Try again."); return false; }
    cur = null;
    $("viewTitle").textContent = sampleName(sm);
    if (d && Array.isArray(d.cols) && d.cols.length) {
      const n = d.n || 1;
      setData(d.cols.map((c) => { const v = Array.isArray(c.values) ? c.values.slice() : []; while (v.length < n) v.push(null); return { name: String(c.name || ""), unit: c.unit || "", formula: c.formula || null, values: v }; }), false);
      if (d.plot) Object.assign(S.plot, d.plot);
      if (d.stat) Object.assign(S.stat, d.stat);
      renderSide();
    } else if (sm.example && sh.id === "main") loadExample();
    else { S.stat.type = "desc"; S.plot.type = "scatter"; setData(emptyCols(), false); }
    clearTimeout(dirtyTimer);
    savedJson = snapshot();
    cur = sm; curSheet = sh;
    renderSheetTabs();
    return true;
  }
  $("btnBack").addEventListener("click", () => {
    flush(); cur = null; curSheet = null; renderSheetTabs();
    $("viewTitle").textContent = "Samples";
    showView("samples"); renderRegistry();
    if (Store.remote) refreshRegistry(true);
  });
  window.addEventListener("pagehide", flush);

  /* ---------- combined plot: several samples in one graph ---------- */
  const SEL = new Set();
  const CMP = { fn: "overlap", group: "all", sheet: "", x: "", y: "", type: "linesym", logx: false, logy: false, sd: true, ind: false, title: "", xl: "", yl: "", samples: [], sets: [], missing: [], built: null, token: 0 };
  const key = (s) => String(s || "").trim().toLowerCase();
  function updateCombineBtn() {
    if (!R) return;
    const ids = new Set(R.samples.map((s) => s.id));
    SEL.forEach((id) => { if (!ids.has(id)) SEL.delete(id); });
    $("btnCombine").textContent = "Plot selected" + (SEL.size ? " (" + SEL.size + ")" : "");
  }
  $("btnCombine").addEventListener("click", async () => {
    if (!R) return;
    CMP.samples = R.samples.filter((s) => SEL.has(s.id));
    if (!CMP.samples.length) return toast("Tick the samples you want in the Plot column first.");
    const names = sheetChoices();
    if (!names.some((o) => key(o.name) === key(CMP.sheet))) CMP.sheet = names[0].name;
    $("viewTitle").textContent = "Combined plot";
    showView("combine");
    await loadCombine();
  });
  function sheetChoices() {
    const m = new Map();
    CMP.samples.forEach((sm) => sm.sheets.forEach((h) => { const k = key(h.name); if (!m.has(k)) m.set(k, { name: h.name, count: 0 }); m.get(k).count++; }));
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }
  async function loadCombine() {
    const token = ++CMP.token, sets = [], missing = [];
    $("cNote").textContent = "Loading the selected samples…";
    for (const sm of CMP.samples) {
      const sh = sm.sheets.find((h) => key(h.name) === key(CMP.sheet));
      if (!sh) { missing.push(sampleName(sm) + " (no sheet named " + CMP.sheet + ")"); continue; }
      let d = null;
      try { d = await Store.get(sheetPath(sm, sh)); } catch (e) { missing.push(sampleName(sm) + " (could not be loaded)"); continue; }
      let cols = null, n = 0;
      if (d && Array.isArray(d.cols) && d.cols.length) {
        n = d.n || 1;
        cols = d.cols.map((c) => { const v = Array.isArray(c.values) ? c.values.slice() : []; while (v.length < n) v.push(null); return { name: String(c.name || ""), unit: c.unit || "", formula: c.formula || null, values: v }; });
      } else if (sm.example && sh.id === "main") { cols = exampleCols(); n = Math.max.apply(null, cols.map((c) => c.values.length)); cols.forEach((c) => { while (c.values.length < n) c.values.push(null); }); }
      if (!cols) { missing.push(sampleName(sm) + " (empty sheet)"); continue; }
      C.recompute(cols, n);
      sets.push({ sm: sm, cols: cols, n: n });
    }
    if (token !== CMP.token) return;
    CMP.sets = sets; CMP.missing = missing;
    const names = columnChoices();
    if (CMP.x !== "#row" && !names.some((o) => key(o.name) === key(CMP.x))) CMP.x = names.length > 1 ? names[0].name : "#row";
    if (!names.some((o) => key(o.name) === key(CMP.y))) { const y = names.find((o) => key(o.name) !== key(CMP.x)); CMP.y = y ? y.name : names.length ? names[0].name : ""; }
    renderCombine();
  }
  function columnChoices() {
    const m = new Map();
    CMP.sets.forEach((st) => st.cols.forEach((c) => { if (!c.values.some((v) => typeof v === "number")) return; const k = key(c.name); if (!m.has(k)) m.set(k, { name: c.name, count: 0 }); m.get(k).count++; }));
    return Array.from(m.values());
  }
  function buildCombine() {
    const curves = [], skipped = [];
    let xCol = null, yCol = null;
    CMP.sets.forEach((st) => {
      const xc = CMP.x === "#row" ? null : st.cols.find((c) => key(c.name) === key(CMP.x)), yc = st.cols.find((c) => key(c.name) === key(CMP.y));
      if (!yc || (CMP.x !== "#row" && !xc)) { skipped.push(sampleName(st.sm) + " (no column named " + (!yc ? CMP.y : CMP.x) + ")"); return; }
      const x = [], y = [];
      for (let i = 0; i < st.n; i++) { const yv = yc.values[i], xv = xc ? xc.values[i] : i + 1; if (typeof yv === "number" && typeof xv === "number") { x.push(xv); y.push(yv); } }
      if (!x.length) { skipped.push(sampleName(st.sm) + " (no numeric data in these columns)"); return; }
      xCol = xCol || xc; yCol = yCol || yc;
      curves.push({ name: sampleName(st.sm), sm: st.sm, x: x, y: y });
    });
    let series = [], interpolated = false;
    if (CMP.fn === "overlap") series = curves.map((c) => ({ name: c.name, x: c.x, y: c.y }));
    else {
      const groups = new Map();
      curves.forEach((c) => { const g = CMP.group === "all" ? "" : c.sm.info[+CMP.group].trim(); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
      groups.forEach((list, g) => {
        const m = C.mergeCurves(list);
        interpolated = interpolated || m.interpolated;
        const label = CMP.group === "all" ? "Mean of " + list.length + (list.length === 1 ? " sample" : " samples") : (g || "(blank)") + " (n = " + list.length + ")";
        series.push({ name: label, x: m.x, y: m.mean, sd: m.sd, n: m.n, members: list });
      });
    }
    return { series: series, skipped: skipped, curves: curves, interpolated: interpolated, xCol: xCol, yCol: yCol };
  }
  function renderCombine() {
    const opt = (v, t, cur) => '<option value="' + esc(v) + '"' + (key(v) === key(cur) ? " selected" : "") + ">" + esc(t) + "</option>";
    const total = CMP.samples.length;
    $("cFn").value = CMP.fn;
    $("cGroup").innerHTML = opt("all", "All selected samples into one curve", CMP.group) + R.infoTitles.map((t, k) => opt(String(k), "Samples with the same " + t, CMP.group)).join("");
    $("cSheet").innerHTML = sheetChoices().map((o) => opt(o.name, o.name + (o.count < total ? " (" + o.count + " of " + total + " samples)" : ""), CMP.sheet)).join("");
    const cols = columnChoices(), lab = (o) => o.name + (o.count < CMP.sets.length ? " (" + o.count + " of " + CMP.sets.length + ")" : "");
    $("cX").innerHTML = opt("#row", "Row number", CMP.x) + cols.map((o) => opt(o.name, lab(o), CMP.x)).join("");
    $("cY").innerHTML = cols.map((o) => opt(o.name, lab(o), CMP.y)).join("");
    $("cType").value = CMP.type; $("cLogX").checked = CMP.logx; $("cLogY").checked = CMP.logy; $("cSD").checked = CMP.sd; $("cInd").checked = CMP.ind;
    const merge = CMP.fn === "merge";
    $("cGroupWrap").hidden = !merge; $("cSDWrap").hidden = !merge; $("cIndWrap").hidden = !merge;
    $("cTitle").value = CMP.title; $("cXL").value = CMP.xl; $("cYL").value = CMP.yl;
    drawCombine();
  }
  function drawCombine() {
    const el = $("cChartIn");
    if (!document.body.classList.contains("view-combine")) return;
    if (!window.Plotly) { el.innerHTML = '<p class="note bad" style="padding:12px">The plotting library did not load. Check the connection and reload the page.</p>'; return; }
    const B = (CMP.built = buildCombine());
    const css = getComputedStyle(document.documentElement), tok = (n) => css.getPropertyValue(n).trim();
    const surface = tok("--surface"), ink = tok("--ink"), muted = tok("--muted");
    const mode = CMP.type === "scatter" ? "markers" : CMP.type === "line" ? "lines" : "lines+markers";
    const traces = [];
    B.series.forEach((sr, k) => {
      const color = tok("--s" + ((k % 8) + 1));
      if (sr.members && CMP.ind) sr.members.forEach((c) => traces.push({ type: "scatter", mode: "lines", x: c.x, y: c.y, name: c.name, showlegend: false, opacity: 0.45, line: { color: color, width: 1, dash: "dot" }, hovertemplate: "%{x}<br>%{y}<extra>" + esc(c.name) + "</extra>" }));
      const tr = { type: "scatter", mode: mode, x: sr.x, y: sr.y, name: sr.name, marker: { color: color, size: 9, symbol: SYMBOLS[k % 8], line: { color: surface, width: 1.5 } }, line: { color: color, width: 2 }, hovertemplate: "%{x}<br><b>%{y:.5g}</b><extra>" + esc(sr.name) + "</extra>" };
      if (sr.sd && CMP.sd && sr.members.length > 1) tr.error_y = { type: "data", array: sr.sd, visible: true, color: color, thickness: 1.2, width: 3 };
      traces.push(tr);
    });
    const axis = (title, log) => ({ title: { text: title || "", font: { color: muted, size: 13 }, standoff: 8 }, type: log ? "log" : "-", gridcolor: tok("--grid"), linecolor: tok("--line"), showline: true, zeroline: false, ticks: "outside", tickcolor: tok("--line"), tickfont: { color: muted }, automargin: true });
    const xl = CMP.xl || (CMP.x === "#row" ? "Row number" : B.xCol ? axisName(B.xCol) : CMP.x), yl = CMP.yl || (B.yCol ? axisName(B.yCol) : CMP.y);
    const layout = {
      paper_bgcolor: surface, plot_bgcolor: surface, font: { family: '"IBM Plex Sans", system-ui, sans-serif', color: ink, size: 13 },
      margin: { l: 60, r: 18, t: CMP.title ? 48 : 30, b: 52 },
      title: CMP.title ? { text: esc(CMP.title), font: { size: 16 }, x: 0.01, xanchor: "left" } : { text: "" },
      xaxis: axis(esc(xl), CMP.logx), yaxis: axis(esc(yl), CMP.logy),
      showlegend: true, legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: muted } },
      hovermode: "closest", hoverlabel: { bgcolor: surface, bordercolor: tok("--line"), font: { color: ink } },
    };
    if (!traces.length) layout.annotations = [{ text: "No data to plot for this sheet and these columns", showarrow: false, font: { color: muted, size: 14 } }];
    const left = CMP.missing.concat(B.skipped);
    let note = (CMP.fn === "merge" ? "Averaging " : "Showing ") + B.curves.length + " of " + CMP.samples.length + " selected samples: " + B.curves.map((c) => c.name).join(", ") + ".";
    if (left.length) note += " Not included: " + left.join("; ") + ".";
    if (CMP.fn === "merge" && B.interpolated) note += " The samples do not share the same X values, so each one is interpolated onto the X values of the first sample in its group, over the X range they all cover.";
    if (CMP.fn === "merge" && CMP.sd && B.series.some((sr) => sr.members.length < 2)) note += " A curve from a single sample has no error bars.";
    $("cNote").textContent = note;
    window.Plotly.react(el, traces, layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d"] });
    requestAnimationFrame(() => { try { window.Plotly.Plots.resize(el); } catch (e) { /* not drawn yet */ } });
  }
  function combineTable() {
    const B = CMP.built || buildCombine(), heads = [], colsOut = [];
    const xn = CMP.x === "#row" ? "Row" : CMP.x;
    B.series.forEach((sr) => {
      heads.push(xn, CMP.y + " - " + sr.name); colsOut.push(sr.x, sr.y);
      if (sr.sd) { heads.push("SD - " + sr.name, "n - " + sr.name); colsOut.push(sr.sd, sr.n); }
    });
    const rows = Math.max.apply(null, colsOut.map((c) => c.length).concat([0])), lines = [heads.join("\t")];
    for (let i = 0; i < rows; i++) lines.push(colsOut.map((c) => (i < c.length ? String(Number(c[i].toPrecision(10))) : "")).join("\t"));
    return lines.join("\n");
  }
  $("combineView").addEventListener("change", (e) => {
    const id = e.target.id, sheetBefore = CMP.sheet;
    CMP.fn = $("cFn").value; CMP.group = $("cGroup").value; CMP.sheet = $("cSheet").value; CMP.x = $("cX").value; CMP.y = $("cY").value;
    CMP.type = $("cType").value; CMP.logx = $("cLogX").checked; CMP.logy = $("cLogY").checked; CMP.sd = $("cSD").checked; CMP.ind = $("cInd").checked;
    if (id === "cTitle" || id === "cXL" || id === "cYL") return;
    if (CMP.sheet !== sheetBefore) loadCombine(); else renderCombine();
  });
  ["cTitle", "cXL", "cYL"].forEach((id) => $(id).addEventListener("input", () => { CMP.title = $("cTitle").value; CMP.xl = $("cXL").value; CMP.yl = $("cYL").value; drawCombine(); }));
  $("cCopyData").addEventListener("click", () => copyText(combineTable(), "Plotted data"));
  $("cPng").addEventListener("click", async () => { try { saveFile("combined_plot.png", dataUrlToBlob(await plotImage("png", "cChartIn"))); } catch (e) { toast("The plot could not be exported."); } });
  $("cSvg").addEventListener("click", async () => { try { const u = await plotImage("svg", "cChartIn"); saveFile("combined_plot.svg", decodeURIComponent(u.slice(u.indexOf(",") + 1))); } catch (e) { toast("The plot could not be exported."); } });
  $("cCopyImg").addEventListener("click", async () => {
    try {
      const blob = dataUrlToBlob(await plotImage("png", "cChartIn"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Plot image copied.");
    } catch (e) { toast("Copying images is blocked here. Use Save PNG instead."); }
  });

  async function refreshRegistry(quiet) {
    if (!Store.remote || Store.broken) return;
    if (Object.keys(pend).length || Object.values(busy).some(Boolean)) { setTimeout(() => refreshRegistry(quiet), 800); return; }
    try {
      R = normalize(await loadRemoteRegistry());
      if (!cur) renderRegistry();
      if (!quiet) toast("Samples updated.");
    } catch (e) { if (!quiet) toast("Could not refresh. Check your connection and try again."); }
  }
  $("btnRefresh").addEventListener("click", () => refreshRegistry(false));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !cur) refreshRegistry(true); });

  function showAuth(msg, signedInAs) {
    document.body.classList.add("view-auth");
    $("authView").hidden = false;
    $("viewTitle").textContent = "Data Workbench";
    $("authForm").hidden = !!signedInAs;
    $("authAlt").hidden = !signedInAs;
    $("authText").textContent = signedInAs
      ? "You are signed in as " + signedInAs + ", but this email is not on the lab's member list. Ask the workbench owner to add it, then reload this page."
      : "Enter your email and we'll send you a sign-in link. Only invited lab members can see the shared samples.";
    $("authMsg").textContent = msg || "";
  }
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("authEmail").value.trim();
    if (!email) return;
    $("authSend").disabled = true; $("authMsg").textContent = "Sending…";
    const { error } = await Store.sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } });
    $("authSend").disabled = false;
    $("authMsg").textContent = error
      ? (/rate|seconds/i.test(error.message) ? "Too many sign-in emails were requested. Wait a few minutes and try again." : "The link could not be sent: " + error.message)
      : "Check your inbox for an email from Supabase and click the link in it. You can close this tab.";
  });
  async function signOut() { try { await Store.sb.auth.signOut(); } catch (e) { /* ignore */ } location.reload(); }
  $("btnSignOut").addEventListener("click", () => { flush(); signOut(); });
  $("authOut").addEventListener("click", signOut);

  if (CFG.sandbox) {
    document.title = "Data Workbench (sandbox)";
    $("sbxChip").hidden = false;
  }
  $("btnCopyLive").addEventListener("click", () => {
    openDialog({ title: "Copy the live data into the sandbox?", text: "Everything currently in the sandbox is replaced by a copy of the live site's samples and data. The live site is only read, never changed.", actions: [{ label: "Copy live data", primary: true, fn: async () => {
      setState("Copying live data…");
      try {
        const all = await Store.sb.from("docs").select("path,data");
        if (all.error) throw all.error;
        const live = (all.data || []).filter((r) => r.path.indexOf(PFX) !== 0);
        const del = await Store.sb.from("docs").delete().like("path", PFX + "%");
        if (del.error) throw del.error;
        for (let i = 0; i < live.length; i += 50) {
          const up = await Store.sb.from("docs").upsert(live.slice(i, i + 50).map((r) => ({ path: PFX + r.path, data: r.data, updated_at: new Date().toISOString(), updated_by: Store.email })));
          if (up.error) throw up.error;
        }
        location.reload();
      } catch (e) { setState("The live data could not be copied: " + (e.message || "unknown error"), true); }
    } }] });
  });

  async function remoteGate() {
    const { data } = await Store.sb.auth.getSession();
    const session = data && data.session;
    if (!session) { showAuth(); return false; }
    Store.email = (session.user.email || "").toLowerCase();
    if (location.hash && /access_token|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    const m = await Store.sb.from("members").select("email").limit(1);
    if (m.error) { showAuth("The member list could not be checked: " + m.error.message); return false; }
    if (!m.data || !m.data.length) { showAuth("", Store.email); return false; }
    $("whoAmI").textContent = Store.email; $("whoAmI").hidden = false;
    $("btnRefresh").hidden = false; $("btnSignOut").hidden = false;
    $("btnCopyLive").hidden = !(CFG.sandbox && PFX);
    Store.sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") location.reload(); });
    return true;
  }

  (async function start() {
    await Store.init();
    if (Store.remote) {
      let ok = false;
      try { ok = await remoteGate(); } catch (e) { showAuth("The sign-in service could not be reached. Check your connection and reload."); }
      if (!ok) return;
    }
    try {
      const r = await loadRegistry();
      R = normalize(r || defaultRegistry());
      setState(Store.local ? "Changes are saved in this browser only" : Store.remote ? "Shared with your lab" : "");
    } catch (e) {
      Store.broken = true;
      R = normalize(defaultRegistry());
      setState("Saved samples could not be loaded. Reload to try again; changes made now are not saved.", true);
    }
    renderRegistry();
  })();
})();
