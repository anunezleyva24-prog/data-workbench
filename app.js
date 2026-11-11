/* Data Workbench UI */
(function () {
  "use strict";
  const C = window.Core;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PAGE = 200;
  const SYMBOLS = ["circle", "square", "diamond", "triangle-up", "cross", "triangle-down", "x", "star"];

  const S = {
    cols: [], n: 0, page: 0, example: true, editFormula: -1, sel: [], selAnchor: -1, readonly: false, seq: null, seqSel: new Set(), seqSelMode: false,
    plot: { type: "scatter", x: 0, ys: [1], err: -1, logx: false, logy: false, showFit: true, title: "", xl: "", yl: "", yr: "", right: [], logy2: false, stepColors: true },
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
    const a = $("dlgArea"), inp = $("dlgInput"), pick = $("dlgSelect");
    pick.hidden = !o.select;
    pick.innerHTML = (o.select || []).map((x) => '<option value="' + esc(x.v) + '"' + (String(x.v) === String(o.selected) ? " selected" : "") + ">" + esc(x.t) + "</option>").join("");
    inp.hidden = o.input === undefined; inp.value = o.input || ""; inp.placeholder = o.placeholder || ""; inp.type = o.inputType || "text";
    a.hidden = o.area === undefined;
    a.value = o.area || ""; a.readOnly = !!o.readonly; a.placeholder = o.placeholder || "";
    const cb = $("dlgChecks");
    cb.hidden = !o.checks;
    cb.innerHTML = (o.checks || []).map((x) => '<label class="check"><input type="checkbox" value="' + esc(x.v) + '"' + (x.checked ? " checked" : "") + (x.disabled ? " disabled" : "") + "> " + esc(x.t) + "</label>").join("");
    const b = $("dlgBtns");
    b.innerHTML = "";
    (o.actions || []).concat([{ label: o.closeLabel || "Cancel" }]).forEach((act) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn" + (act.primary ? " primary" : ""); btn.textContent = act.label;
      btn.addEventListener("click", () => { $("dlg").close(); if (act.fn) act.fn(o.checks ? Array.from(cb.querySelectorAll("input:checked")).map((x) => x.value) : o.select ? pick.value : o.input !== undefined ? inp.value : a.value); });
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
    S.cols = cols; S.page = 0; S.example = !!example; S.fit = null; S.editFormula = -1; S.sel = []; S.selAnchor = -1;
    C.recompute(S.cols, S.n);
    const nc = numCols();
    S.plot.x = nc.length > 1 ? nc[0] : -1;
    S.plot.ys = nc.length > 1 ? [nc[1]] : nc.slice(0, 1);
    S.plot.err = -1; S.plot.logx = S.plot.logy = S.plot.logy2 = false; S.plot.title = S.plot.xl = S.plot.yl = S.plot.yr = ""; S.plot.right = [];
    if (["hist", "box"].indexOf(S.plot.type) >= 0) S.plot.type = "scatter";
    S.stat.x = nc.length ? nc[0] : 0; S.stat.y = nc.length > 1 ? nc[1] : 0; S.stat.groups = nc.slice(1, 4);
    renderAll();
    histRecord();
  }
  function remapAfterDelete(d) {
    const m = (i) => (i === d ? -1 : i > d ? i - 1 : i);
    const P = S.plot, T = S.stat;
    P.x = m(P.x); P.err = m(P.err); P.ys = P.ys.map(m).filter((i) => i >= 0); P.right = P.right.map(m).filter((i) => i >= 0);
    T.x = Math.max(0, m(T.x)); T.y = Math.max(0, m(T.y)); T.groups = T.groups.map(m).filter((i) => i >= 0);
    S.fit = null; S.editFormula = -1;
  }
  function changed() { S.example = false; C.recompute(S.cols, S.n); histRecord(); }

  /* ---------- undo / redo for the open table ---------- */
  const H = { undo: [], redo: [], present: null, max: 50 };
  const MH = { undo: [], redo: [] }; // mask changes of the open sequence
  const histData = () => JSON.stringify({ cols: S.cols.map((c) => ({ name: c.name, unit: c.unit || "", formula: c.formula || null, values: c.formula ? [] : c.values })), n: S.n });
  const histView = () => JSON.stringify({ plot: S.plot, stat: S.stat });
  function histButtons() {
    const sq = S.readonly && !!S.seq;
    $("btnUndo").disabled = sq ? !MH.undo.length : S.readonly || !H.undo.length;
    $("btnRedo").disabled = sq ? !MH.redo.length : S.readonly || !H.redo.length;
  }
  function histReset() { H.undo = []; H.redo = []; H.present = { d: histData(), v: histView() }; histButtons(); }
  function histRecord() {
    const d = histData();
    if (H.present && d === H.present.d) return;
    if (H.present) { H.present.v = H.present.v || histView(); H.undo.push(H.present); if (H.undo.length > H.max) H.undo.shift(); }
    H.present = { d: d, v: histView() };
    H.redo = [];
    histButtons();
  }
  function histStep(dir) {
    if (S.readonly) { if (S.seq) maskHist(dir); return; }
    const from = dir < 0 ? H.undo : H.redo, to = dir < 0 ? H.redo : H.undo;
    if (!from.length || !H.present) return toast(dir < 0 ? "Nothing to undo." : "Nothing to redo.");
    H.present.v = histView();
    to.push(H.present);
    const e = (H.present = from.pop()), d = JSON.parse(e.d);
    const namesBefore = S.cols.map((c) => c.name).join("\u0001");
    S.n = d.n;
    S.cols = d.cols.map((c) => { const v = c.values.slice(); while (v.length < d.n) v.push(null); return { name: c.name, unit: c.unit, formula: c.formula, values: v }; });
    C.recompute(S.cols, S.n);
    S.example = false; S.fit = null; S.editFormula = -1; S.sel = []; S.selAnchor = -1;
    S.page = Math.max(0, Math.min(S.page, Math.ceil(S.n / PAGE) - 1));
    // plot and statistics settings point at columns, so they go back too when the columns themselves changed
    if (S.cols.map((c) => c.name).join("\u0001") !== namesBefore) { const v = JSON.parse(e.v); Object.assign(S.plot, v.plot); Object.assign(S.stat, v.stat); }
    renderAll(); histButtons();
    toast(dir < 0 ? "Undone." : "Redone.");
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(), undo = k === "z" && !e.shiftKey, redo = k === "y" || (k === "z" && e.shiftKey);
    if ((!undo && !redo) || !inBench() || $("dlg").open || (S.readonly && !S.seq)) return;
    const t = e.target;
    if (t && t.matches) {
      // while a cell or header is being typed in, Ctrl+Z belongs to the browser's own text undo
      if (t.matches("#grid td[contenteditable]")) { const col = S.cols[+t.dataset.c]; if (!col || t.textContent.replace(/\u00a0/g, " ").trim() !== disp(col.values[+t.dataset.r])) return; }
      else if (t.matches("#grid input[data-f]")) { const col = S.cols[+t.dataset.c]; if (!col || t.value !== (col[t.dataset.f] || "")) return; }
      else if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t.blur && t !== document.body) t.blur();
    }
    e.preventDefault();
    histStep(undo ? -1 : 1);
  });
  $("btnUndo").addEventListener("click", () => histStep(-1));
  $("btnRedo").addEventListener("click", () => histStep(1));
  function roBlock() {
    if (!S.readonly) return false;
    toast("A sequence is calculated from its step sheets. Edit those sheets instead.");
    return true;
  }

  /* ---------- worksheet ---------- */
  function renderTable() {
    const g = $("grid");
    let h = '<thead><tr><th class="corner"></th>';
    S.cols.forEach((c, j) => {
      h += '<th data-hc="' + j + '"' + (S.sel.indexOf(j) >= 0 ? ' class="selc"' : "") + '><div class="colhead"><div class="line1" data-selcol="' + j + '" title="Click to select the whole column. Shift-click or Ctrl-click selects several."><span class="ltr">' + C.letter(j) + '</span><span class="sp"></span>' +
        '<button class="iconbtn" type="button" data-act="copycol" data-c="' + j + '" title="Copy this column\'s data (without name and unit)">copy</button>' +
        (S.readonly ? "" : '<button class="iconbtn" type="button" data-act="delcol" data-c="' + j + '" title="Delete this column" aria-label="Delete column ' + C.letter(j) + '">×</button>') + "</div>" +
        '<input id="cn' + j + '" data-f="name" data-c="' + j + '" value="' + esc(c.name) + '"' + (S.readonly ? " readonly" : "") + ' aria-label="Name of column ' + C.letter(j) + '">' +
        '<input id="cu' + j + '" class="unit" data-f="unit" data-c="' + j + '" value="' + esc(c.unit || "") + '"' + (S.readonly ? " readonly" : "") + ' placeholder="unit" aria-label="Unit of column ' + C.letter(j) + '">' +
        (c.formula ? '<button class="iconbtn fx" type="button" data-act="editfx" data-c="' + j + '" title="Edit formula">= ' + esc(c.formula) + "</button>" : "") +
        (c.error ? '<span class="err">' + esc(c.error) + "</span>" : "") + "</div></th>";
    });
    h += "</tr></thead><tbody>";
    const a = S.page * PAGE, b = Math.min(S.n, a + PAGE);
    for (let i = a; i < b; i++) {
      h += '<tr><th class="rn">' + (i + 1) + (S.readonly ? "" : '<button type="button" data-act="delrow" data-r="' + i + '" title="Delete row ' + (i + 1) + '" aria-label="Delete row ' + (i + 1) + '">×</button>') + "</th>";
      S.cols.forEach((c, j) => {
        const v = c.values[i];
        const cls = (c.formula ? "calc" : typeof v === "string" ? "txt" : "") + (S.sel.indexOf(j) >= 0 ? " selc" : "");
        h += "<td" + (c.formula || S.readonly ? "" : ' contenteditable="true"') + (cls.trim() ? ' class="' + cls.trim() + '"' : "") + ' data-r="' + i + '" data-c="' + j + '">' + esc(c.formula ? dispCalc(v) : disp(v)) + "</td>";
      });
      h += "</tr>";
    }
    g.innerHTML = h + "</tbody>";
    $("dims").textContent = S.n + " rows × " + S.cols.length + " columns";
    S.sel = S.sel.filter((i) => i < S.cols.length); paintSel();
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
    if (roBlock()) return;
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
  /* whole-column selection, as in Excel or Origin: click the top strip of a column */
  function columnsText(idx) {
    const cols = idx.slice().sort((a, b) => a - b).map((i) => S.cols[i]);
    let n = S.n;
    while (n > 0 && cols.every((c) => c.values[n - 1] === null || c.values[n - 1] === undefined)) n--;
    return C.toTSV(cols, n, false);
  }
  function paintSel() {
    $("grid").querySelectorAll("[data-hc]").forEach((th) => th.classList.toggle("selc", S.sel.indexOf(+th.dataset.hc) >= 0));
    $("grid").querySelectorAll("td[data-c]").forEach((td) => td.classList.toggle("selc", S.sel.indexOf(+td.dataset.c) >= 0));
    const n = S.sel.length;
    $("selInfo").hidden = !n;
    if (n) $("selInfo").textContent = (n === 1 ? "Column " + C.letter(S.sel[0]) : n + " columns") + " selected: Ctrl+C copies the data, Ctrl+V pastes from the first row, Delete clears, Esc deselects";
  }
  function clearSel() { if (S.sel.length) { S.sel = []; S.selAnchor = -1; paintSel(); } }
  $("grid").addEventListener("click", (e) => {
    const strip = e.target.closest("[data-selcol]");
    if (!strip || e.target.closest("button")) return;
    const j = +strip.dataset.selcol;
    if (e.shiftKey && S.selAnchor >= 0) { const a = Math.min(S.selAnchor, j), b = Math.max(S.selAnchor, j); S.sel = []; for (let i = a; i <= b; i++) S.sel.push(i); }
    else if (e.ctrlKey || e.metaKey) { S.sel = S.sel.indexOf(j) >= 0 ? S.sel.filter((i) => i !== j) : S.sel.concat([j]); S.selAnchor = j; }
    else { S.sel = S.sel.length === 1 && S.sel[0] === j ? [] : [j]; S.selAnchor = j; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const ws = window.getSelection && window.getSelection(); if (ws && ws.removeAllRanges) ws.removeAllRanges();
    paintSel();
  });
  $("grid").addEventListener("focusin", (e) => { if (e.target.matches && e.target.matches("td, input")) clearSel(); });
  const typingTarget = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  document.addEventListener("copy", (e) => {
    if (!inBench() || !S.sel.length || typingTarget(e.target) || $("dlg").open) return;
    e.clipboardData.setData("text/plain", columnsText(S.sel));
    e.preventDefault();
    toast((S.sel.length === 1 ? "Column " + C.letter(S.sel[0]) : S.sel.length + " columns") + " copied (data only).");
  });
  document.addEventListener("keydown", (e) => {
    if (!inBench() || !S.sel.length || typingTarget(e.target) || $("dlg").open) return;
    if (e.key === "Escape") clearSel();
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (roBlock()) return;
      const idx = S.sel.filter((i) => !S.cols[i].formula);
      if (!idx.length) return toast("Calculated columns cannot be cleared. Edit or remove their formula instead.");
      openDialog({ title: "Clear " + (idx.length === 1 ? "column " + C.letter(idx[0]) : idx.length + " columns") + "?", text: "All values in the selected columns are removed. Names and units are kept. This cannot be undone.", actions: [{ label: "Clear values", primary: true, fn: () => {
        idx.forEach((i) => { S.cols[i].values = S.cols[i].values.map(() => null); });
        changed(); renderAll();
      } }] });
    }
  });
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, c = +b.dataset.c;
    if (act === "copycol") copyText(columnsText([c]), "Column " + C.letter(c) + " data");
    if (act === "delcol") {
      if (S.cols.length < 2) return toast("A table needs at least one column.");
      S.sel = []; S.selAnchor = -1;
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
    if (roBlock()) return;
    S.cols.forEach((c) => c.values.push(null)); S.n++; S.page = Math.ceil(S.n / PAGE) - 1;
    changed(); renderAll();
    const first = S.cols.findIndex((c) => !c.formula), td = first >= 0 && cellAt(S.n - 1, first);
    if (td) td.focus();
  });
  $("btnAddCol").addEventListener("click", () => {
    if (roBlock()) return;
    S.cols.push({ name: C.letter(S.cols.length), unit: "", formula: null, values: Array.from({ length: S.n }, () => null) });
    changed(); renderAll();
    const w = document.querySelector(".tablewrap"); w.scrollLeft = w.scrollWidth;
  });
  $("btnCopy").addEventListener("click", () => copyText(C.toTSV(S.cols, S.n, $("copyHeaders").checked), "Table"));
  $("btnCsv").addEventListener("click", () => saveFile("data.csv", C.toTSV(S.cols, S.n, true, ",")));
  $("oCopyData").addEventListener("click", () => copyText(C.toTSV(S.cols, S.n, false), "Data"));

  /* ---------- import ---------- */
  function importText(text) {
    if (roBlock()) return;
    try { setData(C.parseText(text), false); toast("Imported " + S.n + " rows × " + S.cols.length + " columns."); }
    catch (e) { toast(e.message); }
  }
  function importSheet(wb, name) {
    if (roBlock()) return;
    try {
      setData(C.parseRows(window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })), false);
      toast('Imported sheet "' + name + '": ' + S.n + " rows × " + S.cols.length + " columns.");
    } catch (e) { toast(e.message); }
  }
  function handleFile(file) {
    if (!file || roBlock()) return;
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
  $("btnPaste").addEventListener("click", () => !roBlock() && openDialog({
    title: "Paste data", text: "Paste rows copied from Excel, Origin or a text file. A first row of names is used as column headers; a second row of units is recognised too.",
    area: "", placeholder: "Time (s)\tSignal (mV)\n0\t1.02\n1\t0.87", actions: [{ label: "Import", primary: true, fn: (v) => (v.trim() ? importText(v) : toast("Nothing was pasted.")) }],
  }));
  const emptyCols = () => ["A", "B", "C"].map((nm) => ({ name: nm, unit: "", formula: null, values: Array.from({ length: 12 }, () => null) }));
  $("btnNew").addEventListener("click", () => { if (!roBlock()) setData(emptyCols(), false); });
  document.addEventListener("paste", (e) => {
    const t = e.target;
    if (!inBench()) return;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (text && text.trim() && S.sel.length) { e.preventDefault(); pasteBlock(0, Math.min.apply(null, S.sel), text); return; }
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
    $("pStepWrap").hidden = !S.seq; $("pStep").checked = P.stepColors !== false;
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
      const x = [], y = [], err = [], ri = [];
      for (let i = 0; i < S.n; i++) {
        const yv = col.values[i], xv = P.x >= 0 ? S.cols[P.x].values[i] : i + 1;
        if (typeof yv !== "number" || xv === null || xv === undefined) continue;
        x.push(xv); y.push(yv); ri.push(i);
        if (P.err >= 0) { const ev = S.cols[P.err].values[i]; err.push(typeof ev === "number" ? ev : 0); }
      }
      if (S.seq && P.stepColors && P.type !== "bar" && P.x === 0) {
        const stepCol = S.cols[S.cols.length - 1];
        S.seq.bounds.forEach((bd, si) => {
          const pick = ri.map((r, q) => (stepCol.values[r] === bd.name ? q : -1)).filter((q) => q >= 0);
          if (!pick.length) return;
          const c2 = tok("--s" + ((si % 8) + 1)), nm = (P.ys.length > 1 ? col.name + " · " : "") + bd.name;
          const t2 = { type: "scatter", mode: P.type === "scatter" ? "markers" : P.type === "line" ? "lines" : "lines+markers", x: pick.map((q) => x[q]), y: pick.map((q) => y[q]), customdata: pick.map((q) => ri[q]), name: nm + (onRight ? " (right axis)" : ""),
            marker: { color: c2, size: 9, symbol: SYMBOLS[k % 8], line: { color: surface, width: 1.5 } }, line: { color: c2, width: 2 }, hovertemplate: "%{x}<br><b>%{y}</b><extra>" + esc(nm) + "</extra>" };
          if (onRight) t2.yaxis = "y2";
          if (P.err >= 0 && k === 0) t2.error_y = { type: "data", array: pick.map((q) => err[q]), visible: true, color: c2, thickness: 1.2, width: 3 };
          traces.push(t2);
        });
        return;
      }
      const tr = { x: x, y: y, name: name, hovertemplate: "%{x}<br><b>%{y}</b><extra>" + esc(name) + "</extra>" };
      if (onRight) tr.yaxis = "y2";
      if (S.seq) tr.customdata = ri;
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
    // in a sequence, points can be selected on the plot (to mask them) while X is the time column
    const selectable = !!S.seq && xy && P.x === 0 && P.type !== "bar";
    if (selectable) traces.forEach((t) => {
      if (!t.customdata) return;
      if (S.seqSelMode && t.mode === "lines") t.mode = "lines+markers";
      t.unselected = { marker: { opacity: 0.3 } };
      if (S.seqSel.size) t.selectedpoints = t.customdata.map((r, i) => (S.seqSel.has(r) ? i : -1)).filter((i) => i >= 0);
    });
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
    else if (S.seq && xy && P.x === 0 && !P.logx) stepMarks(layout, S.seq.bounds, muted);
    layout.dragmode = selectable && S.seqSelMode ? "select" : "zoom";
    window.Plotly.react(el, traces, layout, { responsive: true, displaylogo: false, modeBarButtonsToRemove: selectable && S.seqSelMode ? ["toImage"] : ["toImage", "lasso2d", "select2d"] });
    if (!el._dwSel && el.on) {
      el._dwSel = true;
      const rowsOf = (ev) => ((ev && ev.points) || []).map((pt) => pt.customdata).filter((r) => typeof r === "number");
      el.on("plotly_selected", (ev) => { if (!S.seq || !S.seqSelMode) return; S.seqSel = new Set(rowsOf(ev)); updateMaskBtn(); });
      el.on("plotly_deselect", () => { if (!S.seq || !S.seqSel.size) return; S.seqSel = new Set(); updateMaskBtn(); });
      el.on("plotly_click", (ev) => {
        if (!S.seq || !S.seqSelMode) return;
        const rows = rowsOf(ev);
        if (!rows.length) return;
        rows.forEach((r) => { if (S.seqSel.has(r)) S.seqSel.delete(r); else S.seqSel.add(r); });
        updateMaskBtn(); setTimeout(drawPlot, 0);
      });
    }
    requestAnimationFrame(() => { try { window.Plotly.Plots.resize(el); } catch (e) { /* not drawn yet */ } });
  }
  // thin dashed lines where one step ends and the next begins, with the step names along the top
  function stepMarks(layout, bounds, color) {
    layout.shapes = bounds.slice(1).map((bd) => ({ type: "line", xref: "x", yref: "paper", x0: bd.x, x1: bd.x, y0: 0, y1: 1, line: { color: color, width: 1, dash: "dash" } }));
    layout.annotations = (layout.annotations || []).concat(bounds.map((bd) => ({ xref: "x", yref: "paper", x: bd.x, y: 1, xanchor: "left", yanchor: "top", xshift: 4, text: esc(bd.name), showarrow: false, font: { color: color, size: 11 } })));
  }
  function readPlotControls() {
    const P = S.plot;
    P.stepColors = $("pStep").checked;
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
    if (roBlock()) return;
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
    if (!b || roBlock()) return;
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
  const NINFO = 8, NPROC = 4, MAXCOLS = 20; // NINFO/NPROC: the layout given to data saved before columns became editable
  const newColId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const seqIds = (n, p) => Array.from({ length: n }, (_, k) => p + k);
  const sampleName = (sm) => (sm.info[0] && sm.info[0].trim()) || "Sample " + (R.samples.indexOf(sm) + 1);
  function defaultRegistry() {
    return {
      infoTitles: ["Sample name", "Composition", "Date prepared", "Batch", "Notes", "Info 6", "Info 7", "Info 8"],
      procTitles: ["Synthesis", "Purification", "Drying", "Characterization"],
      infoIds: seqIds(NINFO, "i"), procIds: seqIds(NPROC, "p"),
      samples: [{ id: "example", example: true, info: ["Example sample", "", "", "", "Example row with example data. Edit or delete it."], proc: [true, false, false, false], rows: 16, cols: 5 }],
    };
  }
  function normalize(r) {
    if (!Array.isArray(r.infoIds) || !r.infoIds.length) r.infoIds = seqIds(NINFO, "i");
    if (!Array.isArray(r.procIds) || !r.procIds.length) r.procIds = seqIds(NPROC, "p");
    const titles = (a, ids, word) => ids.map((_, k) => (Array.isArray(a) && a[k] !== null && a[k] !== undefined && String(a[k]).trim()) || word + " " + (k + 1));
    r.infoTitles = titles(r.infoTitles, r.infoIds, "Info"); r.procTitles = titles(r.procTitles, r.procIds, "Process");
    r.samples = (Array.isArray(r.samples) ? r.samples : []).filter((s) => s && s.id);
    r.samples.forEach((s) => normSample(s, r));
    return r;
  }
  // A sample keeps its values by column id (infoMap, procMap); info and proc are the same values in the order the columns are shown.
  function normSample(s, reg) {
    reg = reg || R;
    const byPosition = (a, p) => { const m = {}; (Array.isArray(a) ? a : []).forEach((v, k) => { m[p + k] = v; }); return m; };
    const isMap = (m) => m && typeof m === "object" && !Array.isArray(m);
    s.infoMap = isMap(s.infoMap) ? s.infoMap : byPosition(s.info, "i");
    s.procMap = isMap(s.procMap) ? s.procMap : byPosition(s.proc, "p");
    s.info = reg.infoIds.map((id) => (s.infoMap[id] === null || s.infoMap[id] === undefined ? "" : String(s.infoMap[id])));
    s.proc = reg.procIds.map((id) => !!s.procMap[id]);
    s.sheets = (Array.isArray(s.sheets) ? s.sheets : []).filter((h) => h && h.id);
    if (!s.sheets.length) s.sheets = [{ id: "main", name: "Data", rows: s.rows || 0, cols: s.cols || 0 }];
    return s;
  }
  function packSample(sm) {
    R.infoIds.forEach((id, k) => { sm.infoMap[id] = sm.info[k]; });
    R.procIds.forEach((id, k) => { sm.procMap[id] = sm.proc[k]; });
    return JSON.parse(JSON.stringify(sm));
  }
  const packTitles = () => ({ infoTitles: R.infoTitles.slice(), procTitles: R.procTitles.slice(), infoIds: R.infoIds.slice(), procIds: R.procIds.slice() });
  const sheetPath = (sm, sh) => (sh.id === "main" ? "datasets/" + sm.id : "datasets/" + sm.id + "/" + sh.id);
  function sheetSummary(sm) {
    if (sm.sheets.length > 1) return sm.sheets.length + " sheets";
    const h = sm.sheets[0];
    return h.rows ? h.rows + " × " + h.cols : "empty";
  }
  function saveRegistry() { if (!Store.remote) save("lab/registry", Object.assign(packTitles(), { samples: R.samples.map(packSample) })); }
  // Online, each sample is its own row and the column titles are another, so people editing different samples never overwrite each other.
  function saveTitles() { if (Store.remote) save("lab/titles", packTitles()); else saveRegistry(); }
  function saveSample(sm) { if (Store.remote) save("samples/" + sm.id, packSample(sm)); else saveRegistry(); }
  async function loadRemoteRegistry() {
    const [titles, rows] = await Promise.all([Store.get("lab/titles"), Store.list("samples/")]);
    const samples = rows.map((r) => r.data).filter((d) => d && d.id).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (!titles && !samples.length) {
      const r = defaultRegistry();
      r.samples[0].created = 0;
      await Store.set("lab/titles", { infoTitles: r.infoTitles, procTitles: r.procTitles, infoIds: r.infoIds, procIds: r.procIds });
      await Store.set("samples/example", r.samples[0]);
      return r;
    }
    const d = defaultRegistry();
    if (!titles) return Object.assign(d, { samples: samples });
    return { infoTitles: titles.infoTitles, procTitles: titles.procTitles, infoIds: titles.infoIds, procIds: titles.procIds, samples: samples };
  }
  async function loadRegistry() { return Store.remote ? loadRemoteRegistry() : Store.get("lab/registry"); }
  function renderRegistry() {
    if (!R) return;
    let h = '<thead><tr class="groups"><th></th><th></th><th colspan="' + R.infoTitles.length + '">Sample information</th><th colspan="' + R.procTitles.length + '">Processes completed</th><th colspan="2">Data</th></tr><tr><th class="corner narrow">#</th><th class="sel narrow" title="Tick samples to plot them together">Plot</th>';
    R.infoTitles.forEach((t, k) => { h += '<th><input type="text" id="it' + k + '" data-title="info" data-k="' + k + '" value="' + esc(t) + '" aria-label="Title of information column ' + (k + 1) + '"></th>'; });
    R.procTitles.forEach((t, k) => { h += '<th class="ck"><input type="text" id="pt' + k + '" data-title="proc" data-k="' + k + '" value="' + esc(t) + '" aria-label="Title of process column ' + (k + 1) + '"></th>'; });
    h += '<th class="narrow">Measurements</th><th class="narrow"></th></tr></thead><tbody>';
    R.samples.forEach((sm, i) => {
      h += '<tr><th class="rn">' + (i + 1) + '</th><td class="sel"><input type="checkbox" data-sel="' + i + '"' + (SEL.has(sm.id) ? " checked" : "") + ' aria-label="Select sample ' + (i + 1) + ' for a combined plot"></td>';
      sm.info.forEach((v, k) => { h += '<td><input type="text" id="si' + i + "_" + k + '" data-s="' + i + '" data-k="' + k + '" value="' + esc(v) + '" aria-label="' + esc(R.infoTitles[k]) + ", sample " + (i + 1) + '"></td>'; });
      sm.proc.forEach((v, k) => { h += '<td class="ck"><input type="checkbox" id="sp' + i + "_" + k + '" data-s="' + i + '" data-k="' + k + '"' + (v ? " checked" : "") + ' aria-label="' + esc(R.procTitles[k]) + ", sample " + (i + 1) + '"></td>'; });
      h += '<td class="narrow"><button class="btn small" type="button" data-open="' + i + '">Open data</button><span class="dims">' + sheetSummary(sm) + '</span></td><td class="narrow"><button class="iconbtn" type="button" data-del="' + i + '" title="Delete this sample" aria-label="Delete sample ' + (i + 1) + '">×</button></td></tr>';
    });
    if (!R.samples.length) h += '<tr><td colspan="' + (R.infoTitles.length + R.procTitles.length + 4) + '" style="padding:16px">No samples yet. Use Add sample to create the first one.</td></tr>';
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
  /* ---------- add or delete columns of the sample list ---------- */
  function addColumn(kind) {
    const info = kind === "info", titles = info ? R.infoTitles : R.procTitles, ids = info ? R.infoIds : R.procIds;
    if (titles.length >= MAXCOLS) return toast("This section already has " + MAXCOLS + " columns, the most it can hold.");
    openDialog({ title: info ? "Add a Sample information column" : "Add a Sample process column", text: info ? "The new column is added at the end of the Sample information section, for every sample." : "The new column is added at the end of the Processes completed section, as a tick box for every sample.", input: "", placeholder: "Column title", actions: [{ label: "Add column", primary: true, fn: (v) => {
      titles.push(v.trim() || (info ? "Info " : "Process ") + (titles.length + 1)); ids.push(newColId(info ? "i" : "p"));
      R.samples.forEach((sm) => { if (info) sm.info.push(""); else sm.proc.push(false); });
      renderRegistry(); saveTitles();
      const el = $((info ? "it" : "pt") + (titles.length - 1)); if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    } }] });
  }
  function deleteColumn(kind) {
    const info = kind === "info", titles = info ? R.infoTitles : R.procTitles, ids = info ? R.infoIds : R.procIds, first = info ? 1 : 0;
    if (titles.length <= 1) return toast(info ? "The first column holds the sample's name and cannot be deleted." : "This section needs at least one column.");
    const choices = titles.map((t, k) => ({ v: k, t: t })).slice(first);
    openDialog({ title: info ? "Delete a Sample information column" : "Delete a Sample process column", text: "Choose the column to delete. It disappears for everyone, together with what each sample has in it. This cannot be undone." + (info ? " The first column holds the sample's name, so it cannot be deleted." : ""), select: choices, selected: titles.length - 1, actions: [{ label: "Delete column", primary: true, fn: (v) => {
      const k = +v;
      if (!(k >= first && k < titles.length)) return;
      const name = titles[k];
      titles.splice(k, 1); ids.splice(k, 1);
      R.samples.forEach((sm) => { if (info) sm.info.splice(k, 1); else sm.proc.splice(k, 1); });
      if (info) CMP.group = "all";
      renderRegistry(); saveTitles(); toast("Column " + name + " deleted.");
    } }] });
  }
  $("samplesView").addEventListener("click", (e) => {
    const b = e.target.closest("[data-colop]");
    if (!b || !R) return;
    b.closest("details").open = false;
    const [kind, op] = b.dataset.colop.split("-");
    if (op === "add") addColumn(kind); else deleteColumn(kind);
  });
  document.addEventListener("click", (e) => { document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });

  $("btnAddSample").addEventListener("click", () => {
    if (!R) return;
    const sm = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), info: R.infoIds.map(() => ""), proc: R.procIds.map(() => false), infoMap: {}, procMap: {}, rows: 0, cols: 0, sheets: [{ id: "main", name: "Data", rows: 0, cols: 0 }] };
    R.samples.push(sm);
    renderRegistry(); saveSample(sm);
    const el = $("si" + (R.samples.length - 1) + "_0");
    if (el) { el.scrollIntoView({ block: "nearest" }); el.focus(); }
  });

  /* ---------- one sample's workbench ---------- */
  function snapshot() {
    if (S.readonly) return JSON.stringify({ cols: [], n: 0, seqView: true, names: S.cols.map((c) => c.name), plot: S.plot, stat: S.stat });
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
    if (S.readonly) return;
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
      h += '<button type="button" role="tab" aria-selected="' + on + '" data-sheet="' + i + '" title="' + (on ? "Double-click to rename" : "Open this sheet") + '">' + (sh.type === "seq" ? "⏱ " : "") + esc(sh.name || "Sheet " + (i + 1)) + "</button>";
    });
    h += '<button type="button" class="add" id="sheetAdd" title="Add a sheet to this sample">+ Sheet</button>';
    h += '<button type="button" class="add" id="sheetSeq" title="Chain sheets of this sample one after the other on a single time axis">+ Sequence</button><span class="sp"></span>';
    h += '<button type="button" class="iconbtn" id="sheetRename">Rename</button>';
    if (cur.sheets.length > 1) h += '<button type="button" class="iconbtn" id="sheetDel">Delete sheet</button>';
    box.innerHTML = h;
    renderSeqPanel();
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
    if (t.id === "sheetSeq") {
      const taken = cur.sheets.map((h) => key(h.name));
      let nm = "Sequence"; for (let q = 2; taken.indexOf(key(nm)) >= 0; q++) nm = "Sequence " + q;
      openDialog({ title: "New sequence in " + sampleName(cur), text: "A sequence chains sheets of this sample one after the other on one time axis: each step starts where the previous one ended. Give it the same name in every sample you want to compare.", input: nm, placeholder: "Sequence name", actions: [{ label: "Add sequence", primary: true, fn: (v) => {
        const sh = { id: "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: v.trim() || nm, type: "seq", rows: 0, cols: 0, seq: { steps: cur.sheets.filter((h) => h.type !== "seq").map((h) => h.id), x: "", gap: 0, zero: true } };
        cur.sheets.push(sh); saveSample(cur); openSheet(cur, sh);
      } }] });
    }
    if (t.id === "sheetRename") renameSheet();
    if (t.id === "sheetDel") {
      const sh = curSheet;
      if (sh.type !== "seq" && cur.sheets.filter((h) => h.type !== "seq").length < 2) return toast("A sample needs at least one data sheet. Delete the sequences first, or add another sheet.");
      openDialog({ title: "Delete sheet " + sh.name + "?", text: "This sheet's table, formulas and plot settings are removed for good. The sample's other sheets are kept.", actions: [{ label: "Delete sheet", primary: true, fn: () => {
        clearTimeout(dirtyTimer);
        const i = cur.sheets.indexOf(sh);
        cur.sheets = cur.sheets.filter((x) => x !== sh);
        cur.sheets.forEach((h) => { if (h.type === "seq" && h.seq) h.seq.steps = (h.seq.steps || []).filter((id) => id !== sh.id); });
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
  /* ---------- sequence: sheets of one sample chained on a single time axis ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function settle() { for (let q = 0; q < 100 && (Object.keys(pend).length || Object.values(busy).some(Boolean)); q++) await sleep(50); }
  async function loadSheetCols(sm, sh) {
    if (sh.type === "seq") { const q = await buildSequence(sm, sh); return q.n ? q : null; }
    const d = await Store.get(sheetPath(sm, sh));
    let cols = null, n = 0;
    if (d && Array.isArray(d.cols) && d.cols.length) {
      n = d.n || 1;
      cols = d.cols.map((c) => { const v = Array.isArray(c.values) ? c.values.slice() : []; while (v.length < n) v.push(null); return { name: String(c.name || ""), unit: c.unit || "", formula: c.formula || null, values: v }; });
    } else if (sm.example && sh.id === "main") { cols = exampleCols(); n = Math.max.apply(null, cols.map((c) => c.values.length)); cols.forEach((c) => { while (c.values.length < n) c.values.push(null); }); }
    if (!cols) return null;
    C.recompute(cols, n);
    return { cols: cols, n: n };
  }
  function fingerprint(cols, n) {
    const str = JSON.stringify(cols.map((c) => [c.name, c.values.slice(0, n)]));
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return str.length + ":" + (h >>> 0).toString(36);
  }
  async function buildSequence(sm, sh) {
    await settle();
    const q = sh.seq || {}, out = { cols: [], n: 0, bounds: [], notes: [], timeNames: [], x: "", src: [], masked: [], fps: {}, resets: [] }, loaded = [];
    const steps = (q.steps || []).map((id) => sm.sheets.find((h) => h.id === id && h.type !== "seq")).filter(Boolean);
    for (const st of steps) {
      let r = null;
      try { r = await loadSheetCols(sm, st); } catch (e) { out.notes.push(st.name + " could not be loaded"); continue; }
      if (!r) { out.notes.push(st.name + " is empty"); continue; }
      loaded.push({ sh: st, cols: r.cols, n: r.n });
    }
    if (!loaded.length) return out;
    const numeric = (c) => c.values.some((v) => typeof v === "number");
    const inAll = loaded[0].cols.filter(numeric).filter((c) => loaded.every((L) => L.cols.some((d) => key(d.name) === key(c.name) && numeric(d))));
    out.timeNames = inAll.map((c) => c.name);
    const tcol = inAll.find((c) => key(c.name) === key(q.x)) || inAll[0];
    if (!tcol) { out.notes.push("the step sheets have no numeric column with the same name to use as time"); return out; }
    out.x = tcol.name;
    const others = inAll.filter((c) => c !== tcol), T = [], Y = others.map(() => []), stepv = [];
    const gap = +q.gap || 0, zero = q.zero !== false, tidy = (v) => Number(v.toPrecision(12));
    let offset = 0;
    loaded.forEach((L) => {
      const tc = L.cols.find((c) => key(c.name) === key(tcol.name)), ycs = others.map((o) => L.cols.find((c) => key(c.name) === key(o.name)));
      // a mask belongs to the step's data as it was when the points were masked; if that data changed, the mask is dropped
      const fp = fingerprint(L.cols, L.n);
      out.fps[L.sh.id] = fp;
      let mk = q.mask && q.mask[L.sh.id];
      if (mk && mk.fp !== fp) { delete q.mask[L.sh.id]; out.resets.push(L.sh.name); mk = null; }
      const hidden = new Set(mk && Array.isArray(mk.rows) ? mk.rows : []), rows = [];
      for (let i = 0; i < L.n; i++) {
        if (typeof tc.values[i] !== "number") continue;
        if (hidden.has(i)) out.masked.push({ sid: L.sh.id, step: L.sh.name, row: i, t: tc.values[i], y: ycs.length && ycs[0] && typeof ycs[0].values[i] === "number" ? ycs[0].values[i] : null });
        else rows.push(i);
      }
      if (!rows.length) { out.notes.push(L.sh.name + (hidden.size ? " has all its points masked" : " has no time values")); return; }
      const ts = rows.map((i) => tc.values[i]), lo = Math.min.apply(null, ts), hi = Math.max.apply(null, ts), t0 = zero ? lo : 0;
      out.bounds.push({ x: tidy(offset + lo - t0), name: L.sh.name });
      rows.forEach((i) => { T.push(tidy(tc.values[i] - t0 + offset)); ycs.forEach((yc, k) => Y[k].push(typeof yc.values[i] === "number" ? yc.values[i] : null)); stepv.push(L.sh.name); out.src.push({ sid: L.sh.id, row: i }); });
      offset = offset + hi - t0 + gap;
    });
    out.cols = [{ name: tcol.name, unit: tcol.unit || "", formula: null, values: T }].concat(others.map((o, k) => ({ name: o.name, unit: o.unit || "", formula: null, values: Y[k] })), [{ name: "Step", unit: "", formula: null, values: stepv }]);
    out.n = T.length;
    return out;
  }
  async function openSeq(sm, sh, keep) {
    let q, d = null;
    try { q = await buildSequence(sm, sh); if (!keep) d = await Store.get(sheetPath(sm, sh)); }
    catch (e) { toast("The sequence could not be loaded. Try again."); return false; }
    const saved = keep ? { plot: JSON.parse(JSON.stringify(S.plot)), names: S.cols.map((c) => c.name), stat: null } : d;
    cur = null;
    $("viewTitle").textContent = sampleName(sm);
    S.readonly = true;
    S.seq = { bounds: q.bounds, notes: q.notes, timeNames: q.timeNames, x: q.x, src: q.src, masked: q.masked, fps: q.fps };
    S.seqSel = new Set();
    if (!keep) { MH.undo = []; MH.redo = []; S.seqSelMode = false; }
    if (!keep) { S.stat.type = "desc"; S.plot.type = "linesym"; S.plot.stepColors = true; }
    setData(q.n ? q.cols : [{ name: "Time", unit: "", formula: null, values: [null] }], false);
    if (saved && saved.plot) {
      // settings are remembered by column name, because the columns depend on the step sheets
      const names = Array.isArray(saved.names) ? saved.names : [], P = saved.plot, def = { x: S.plot.x, ys: S.plot.ys.slice() };
      const at = (i) => (i >= 0 && names[i] !== undefined ? S.cols.findIndex((c) => c.name === names[i]) : -1);
      Object.assign(S.plot, P);
      S.plot.x = P.x === -1 ? -1 : at(P.x) >= 0 ? at(P.x) : def.x;
      S.plot.ys = (P.ys || []).map(at).filter((i) => i >= 0); if (!S.plot.ys.length) S.plot.ys = def.ys;
      S.plot.err = at(P.err); S.plot.right = (P.right || []).map(at).filter((i) => i >= 0);
      if (saved.stat && names.length === S.cols.length && names.every((nm, i) => nm === S.cols[i].name)) Object.assign(S.stat, saved.stat);
    }
    renderSide();
    clearTimeout(dirtyTimer);
    savedJson = keep ? savedJson : snapshot();
    cur = sm; curSheet = sh;
    renderSheetTabs();
    histReset();
    if (q.resets.length) { saveSample(sm); toast("The mask on " + q.resets.join(", ") + " was cleared because the data in " + (q.resets.length === 1 ? "that sheet" : "those sheets") + " changed."); }
    return true;
  }
  function renderSeqPanel() {
    const box = $("seqPanel"), on = !!(cur && curSheet && curSheet.type === "seq");
    const nm = on && S.seq ? S.seq.masked.length : 0;
    $("oMaskNote").textContent = nm ? nm + (nm === 1 ? " masked point is" : " masked points are") + " left out." : "";
    document.body.classList.toggle("seq-mode", on);
    box.hidden = !on;
    if (!on) { box.innerHTML = ""; return; }
    const q = curSheet.seq, data = cur.sheets.filter((h) => h.type !== "seq");
    const inSeq = q.steps.map((id) => data.find((h) => h.id === id)).filter(Boolean), rest = data.filter((h) => inSeq.indexOf(h) < 0);
    let h = '<div class="seqcols"><div><div class="lbl">Steps, in order</div><ol class="seqsteps">';
    inSeq.forEach((st, i) => {
      h += '<li><label class="check"><input type="checkbox" data-step="' + esc(st.id) + '" checked> ' + (i + 1) + ". " + esc(st.name) + '</label><span class="sp"></span>' +
        '<button type="button" class="iconbtn" data-mv="-1" data-id="' + esc(st.id) + '"' + (i ? "" : " disabled") + ' title="Move earlier" aria-label="Move ' + esc(st.name) + ' earlier">↑</button>' +
        '<button type="button" class="iconbtn" data-mv="1" data-id="' + esc(st.id) + '"' + (i < inSeq.length - 1 ? "" : " disabled") + ' title="Move later" aria-label="Move ' + esc(st.name) + ' later">↓</button></li>';
    });
    rest.forEach((st) => { h += '<li class="off"><label class="check"><input type="checkbox" data-step="' + esc(st.id) + '"> ' + esc(st.name) + "</label></li>"; });
    h += '</ol></div><div class="controls">' +
      '<label class="field">Time column <select id="seqX">' + (S.seq.timeNames.length ? S.seq.timeNames.map((nm) => '<option value="' + esc(nm) + '"' + (key(nm) === key(S.seq.x) ? " selected" : "") + ">" + esc(nm) + "</option>").join("") : "<option>none found</option>") + "</select></label>" +
      '<label class="field">Gap between steps <input type="text" id="seqGap" inputmode="decimal" size="6" value="' + esc(String(+q.gap || 0)) + '"></label>' +
      '<label class="check"><input type="checkbox" id="seqZero"' + (q.zero !== false ? " checked" : "") + "> start every step at 0</label>" +
      '<button type="button" class="btn small" id="seqCopy">Copy setup to other samples</button></div></div>';
    h += '<div class="maskbar"><label class="check"><input type="checkbox" id="seqSelMode"' + (S.seqSelMode ? " checked" : "") + '> select points on the plot (drag a box; Shift adds; click toggles one point)</label>' +
      '<button type="button" class="btn small" id="seqMask" disabled>Mask selected</button>' +
      '<button type="button" class="btn small" id="seqClearMask"' + (nm ? "" : " disabled") + ">Clear mask</button></div>";
    if (nm) {
      h += '<div class="maskchips"><span class="lbl">Masked points, left out of the table and the plot (× brings one back):</span>' + S.seq.masked.map((m, i) =>
        '<span class="mchip">' + esc(m.step) + " · " + esc(S.seq.x) + " " + esc(disp(m.t)) + (m.y !== null ? " · " + esc(dispCalc(m.y)) : "") + '<button type="button" class="iconbtn" data-unmask="' + i + '" title="Unmask this point" aria-label="Unmask this point">×</button></span>').join("") + "</div>";
    }
    h += '<p class="note">The table below is calculated from the ticked sheets and updates when they change. It keeps the columns that every step has, matched by name.' + (S.seq.notes.length ? " Left out: " + esc(S.seq.notes.join("; ")) + "." : "") + "</p>";
    box.innerHTML = h;
    updateMaskBtn();
  }
  function updateMaskBtn() {
    const b = $("seqMask");
    if (!b) return;
    b.disabled = !S.seqSel.size;
    b.textContent = S.seqSel.size ? "Mask selected (" + S.seqSel.size + ")" : "Mask selected";
  }
  // every mask change goes through here, so it can be undone
  function maskEdit(fn) {
    const q = curSheet.seq;
    MH.undo.push(JSON.stringify(q.mask || {})); if (MH.undo.length > 50) MH.undo.shift();
    MH.redo = [];
    q.mask = q.mask || {};
    fn(q.mask);
    seqChanged();
  }
  function maskHist(dir) {
    if (!cur || !curSheet || curSheet.type !== "seq") return;
    const from = dir < 0 ? MH.undo : MH.redo, to = dir < 0 ? MH.redo : MH.undo;
    if (!from.length) return toast(dir < 0 ? "Nothing to undo." : "Nothing to redo.");
    to.push(JSON.stringify(curSheet.seq.mask || {}));
    curSheet.seq.mask = JSON.parse(from.pop());
    seqChanged();
    toast(dir < 0 ? "Undone." : "Redone.");
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !S.seq || !S.seqSel.size || $("dlg").open) return;
    S.seqSel = new Set(); updateMaskBtn(); drawPlot();
  });
  async function seqChanged() { saveSample(cur); await openSeq(cur, curSheet, true); markDirty(); }
  $("seqPanel").addEventListener("change", (e) => {
    if (!cur || !curSheet || curSheet.type !== "seq") return;
    const t = e.target, q = curSheet.seq;
    if (t.id === "seqSelMode") { S.seqSelMode = t.checked; if (!t.checked) S.seqSel = new Set(); updateMaskBtn(); drawPlot(); return; }
    if (t.dataset.step !== undefined) q.steps = t.checked ? q.steps.concat([t.dataset.step]) : q.steps.filter((id) => id !== t.dataset.step);
    else if (t.id === "seqX") q.x = t.value;
    else if (t.id === "seqGap") { const v = Number(String(t.value).replace(",", ".")); q.gap = isFinite(v) && v >= 0 ? v : 0; }
    else if (t.id === "seqZero") q.zero = t.checked;
    else return;
    seqChanged();
  });
  $("seqPanel").addEventListener("click", (e) => {
    if (!cur || !curSheet || curSheet.type !== "seq") return;
    const mv = e.target.closest("[data-mv]");
    if (mv) {
      const q = curSheet.seq, live = q.steps.filter((id) => cur.sheets.some((h) => h.id === id && h.type !== "seq"));
      const i = live.indexOf(mv.dataset.id), j = i + +mv.dataset.mv;
      if (i < 0 || j < 0 || j >= live.length) return;
      live.splice(j, 0, live.splice(i, 1)[0]); q.steps = live;
      seqChanged();
    } else if (e.target.id === "seqCopy") copySeqSetup();
    else if (e.target.id === "seqMask") {
      const picked = Array.from(S.seqSel).map((i) => S.seq.src[i]).filter(Boolean);
      if (!picked.length) return;
      maskEdit((mask) => picked.forEach((src) => {
        const m = mask[src.sid] && mask[src.sid].fp === S.seq.fps[src.sid] ? mask[src.sid] : (mask[src.sid] = { fp: S.seq.fps[src.sid], rows: [] });
        if (m.rows.indexOf(src.row) < 0) m.rows.push(src.row);
      }));
    } else if (e.target.id === "seqClearMask") maskEdit((mask) => { Object.keys(mask).forEach((k) => delete mask[k]); });
    else if (e.target.closest("[data-unmask]")) {
      const m = S.seq.masked[+e.target.closest("[data-unmask]").dataset.unmask];
      if (!m) return;
      maskEdit((mask) => { const k = mask[m.sid]; if (!k) return; k.rows = k.rows.filter((r) => r !== m.row); if (!k.rows.length) delete mask[m.sid]; });
    }
  });
  function copySeqSetup() {
    const src = curSheet, me = cur;
    const stepNames = src.seq.steps.map((id) => me.sheets.find((h) => h.id === id && h.type !== "seq")).filter(Boolean).map((h) => h.name);
    const others = R.samples.filter((sm) => sm !== me);
    if (!stepNames.length) return toast("Tick at least one step first.");
    if (!others.length) return toast("There are no other samples yet.");
    const has = (sm) => stepNames.filter((nm) => sm.sheets.some((h) => h.type !== "seq" && key(h.name) === key(nm))).length;
    const checks = others.map((sm) => { const k = has(sm); return { v: sm.id, t: sampleName(sm) + (k === stepNames.length ? "" : k ? " (has " + k + " of the " + stepNames.length + " step sheets)" : " (none of the step sheets)"), checked: k === stepNames.length, disabled: !k }; });
    openDialog({ title: "Copy this sequence setup to other samples", text: "Each ticked sample gets a sequence named " + src.name + " with the same step order and settings. Steps are matched by sheet name: " + stepNames.join(", ") + ". A sample that already has a sequence with this name has it updated. Sample data is not changed.", checks: checks, actions: [{ label: "Copy setup", primary: true, fn: async (ids) => {
      let done = 0;
      for (const id of ids) {
        const sm = R.samples.find((x) => x.id === id);
        if (!sm) continue;
        if (Store.remote) { try { const fresh = await Store.get("samples/" + id); if (fresh) Object.assign(sm, normSample(fresh)); } catch (e) { continue; } }
        const steps = stepNames.map((nm) => sm.sheets.find((h) => h.type !== "seq" && key(h.name) === key(nm))).filter(Boolean).map((h) => h.id);
        if (!steps.length) continue;
        const setup = { steps: steps, x: src.seq.x || S.seq.x || "", gap: +src.seq.gap || 0, zero: src.seq.zero !== false };
        const old = sm.sheets.find((h) => h.type === "seq" && key(h.name) === key(src.name));
        if (old) old.seq = setup;
        else sm.sheets.push({ id: "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: src.name, type: "seq", rows: 0, cols: 0, seq: setup });
        saveSample(sm); done++;
      }
      toast(done ? "Sequence setup copied to " + done + (done === 1 ? " sample." : " samples.") : "No sample was changed.");
    } }] });
  }

  async function openSheet(sm, sh) {
    if (cur && curSheet) flush();
    if (sh.type === "seq") return openSeq(sm, sh, false);
    let d = null;
    try { d = await Store.get(sheetPath(sm, sh)); } catch (e) { toast("The saved data for this sheet could not be loaded. Try again."); return false; }
    cur = null;
    S.readonly = false; S.seq = null;
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
    histReset();
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
    await settle();
    for (const sm of CMP.samples) {
      const sh = sm.sheets.find((h) => key(h.name) === key(CMP.sheet));
      if (!sh) { missing.push(sampleName(sm) + " (no sheet named " + CMP.sheet + ")"); continue; }
      let r = null;
      try { r = await loadSheetCols(sm, sh); } catch (e) { missing.push(sampleName(sm) + " (could not be loaded)"); continue; }
      if (!r) { missing.push(sampleName(sm) + (sh.type === "seq" ? " (empty sequence)" : " (empty sheet)")); continue; }
      sets.push({ sm: sm, cols: r.cols, n: r.n, bounds: r.bounds || null });
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
      curves.push({ name: sampleName(st.sm), sm: st.sm, x: x, y: y, set: st });
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
    let stepsDiffer = false;
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
    else if (!CMP.logx) {
      // step boundaries are drawn when every plotted sample is a sequence on its time column and they all agree on where the steps start
      const bs = B.curves.map((c) => (c.set.bounds && key(c.set.cols[0].name) === key(CMP.x) ? c.set.bounds : null)), b0 = bs[0];
      const agree = b0 && b0.length && bs.every((b) => b && b.length === b0.length && b.every((v, i) => v.name === b0[i].name && Math.abs(v.x - b0[i].x) <= 1e-6 * Math.max(1, Math.abs(b0[i].x))));
      if (agree) stepMarks(layout, b0, muted);
      else if (b0 && bs.every(Boolean)) stepsDiffer = true;
    }
    const left = CMP.missing.concat(B.skipped);
    let note = (CMP.fn === "merge" ? "Averaging " : "Showing ") + B.curves.length + " of " + CMP.samples.length + " selected samples: " + B.curves.map((c) => c.name).join(", ") + ".";
    if (left.length) note += " Not included: " + left.join("; ") + ".";
    if (CMP.fn === "merge" && B.interpolated) note += " The samples do not share the same X values, so each one is interpolated onto the X values of the first sample in its group, over the X range they all cover.";
    if (CMP.fn === "merge" && CMP.sd && B.series.some((sr) => sr.members.length < 2)) note += " A curve from a single sample has no error bars.";
    if (stepsDiffer) note += " The steps do not start at the same times in every sample, so no step lines are drawn.";
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
  /* ---------- sandbox only: move data between the sandbox and the live site ---------- */
  const BACKUP = "backup/"; // the live data as it was before the last publish
  const inSandbox = () => !!(CFG.sandbox && PFX && Store.remote);
  async function allDocs() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await Store.sb.from("docs").select("path,data").order("path").range(from, from + 999);
      if (r.error) throw r.error;
      out.push.apply(out, r.data || []);
      if (!r.data || r.data.length < 1000) return out;
    }
  }
  async function writeDocs(rows) {
    for (let i = 0; i < rows.length; i += 50) {
      const up = await Store.sb.from("docs").upsert(rows.slice(i, i + 50).map((r) => ({ path: r.path, data: r.data, updated_at: new Date().toISOString(), updated_by: Store.email })));
      if (up.error) throw up.error;
    }
  }
  async function deleteDocs(paths) {
    for (let i = 0; i < paths.length; i += 50) {
      const del = await Store.sb.from("docs").delete().in("path", paths.slice(i, i + 50));
      if (del.error) throw del.error;
    }
  }
  const isSandboxRow = (r) => r.path.indexOf(PFX) === 0, isBackupRow = (r) => r.path.indexOf(BACKUP) === 0;
  $("btnCopyLive").addEventListener("click", () => {
    if (!inSandbox()) return;
    openDialog({ title: "Copy the live data into the sandbox?", text: "Everything currently in the sandbox is replaced by a copy of the live site's samples and data. The live site is only read, never changed.", actions: [{ label: "Copy live data", primary: true, fn: async () => {
      setState("Copying live data…");
      try {
        await settle();
        const all = await allDocs(), live = all.filter((r) => !isSandboxRow(r) && !isBackupRow(r));
        await deleteDocs(all.filter(isSandboxRow).map((r) => r.path));
        await writeDocs(live.map((r) => ({ path: PFX + r.path, data: r.data })));
        location.reload();
      } catch (e) { setState("The live data could not be copied: " + (e.message || "unknown error"), true); }
    } }] });
  });
  async function pinMatches(pin) {
    if (!CFG.publishPinHash || !window.crypto || !window.crypto.subtle) return false;
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode("data-workbench-publish:" + String(pin).trim()));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("") === CFG.publishPinHash;
  }
  $("btnPublishData").addEventListener("click", () => {
    if (!inSandbox()) return;
    openDialog({ title: "Publish the sandbox data to the live site?", text: "The live site's samples and data are REPLACED by what is in the sandbox now. Anything on the live site that is not in the sandbox is removed. The live data as it is now is kept as a backup in the database (only the most recent backup is kept). Publish the code first if the sandbox has features the live site does not have yet. Enter the PIN to continue.", input: "", inputType: "password", placeholder: "PIN", actions: [{ label: "Publish data to live", primary: true, fn: async (pin) => {
      if (!inSandbox()) return;
      let ok = false;
      try { ok = await pinMatches(pin); } catch (e) { ok = false; }
      if (!ok) return toast("Wrong PIN. Nothing was changed.");
      setState("Publishing data to the live site…");
      try {
        await settle();
        const all = await allDocs();
        const sandbox = all.filter(isSandboxRow).map((r) => ({ path: r.path.slice(PFX.length), data: r.data })).filter((r) => r.path.indexOf(BACKUP) !== 0 && r.path.indexOf(PFX) !== 0);
        const live = all.filter((r) => !isSandboxRow(r) && !isBackupRow(r));
        if (!sandbox.length) throw new Error("the sandbox has no data");
        // 1. keep the current live data as the backup, 2. write the sandbox data over live, 3. remove live items the sandbox does not have
        await deleteDocs(all.filter(isBackupRow).map((r) => r.path));
        await writeDocs(live.map((r) => ({ path: BACKUP + r.path, data: r.data })));
        await writeDocs(sandbox);
        const keep = new Set(sandbox.map((r) => r.path));
        await deleteDocs(live.filter((r) => !keep.has(r.path)).map((r) => r.path));
        setState("Published to the live site");
        openDialog({ title: "Data published", text: "The live site now has the sandbox's " + sandbox.length + " saved items (samples, sheets and titles). The previous live data, " + live.length + " items, is kept as a backup. Ask your collaborators to reload the live site.", closeLabel: "Close" });
      } catch (e) { setState("The data could not be published: " + (e.message || "unknown error") + ". The live site may be partly updated; try again.", true); }
    } }] });
  });
  if (CFG.publishCodeUrl) $("lnkPublishCode").href = CFG.publishCodeUrl;

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
    $("btnCopyLive").hidden = !inSandbox();
    $("btnPublishData").hidden = !(inSandbox() && CFG.publishPinHash);
    $("lnkPublishCode").hidden = !(inSandbox() && CFG.publishCodeUrl);
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
