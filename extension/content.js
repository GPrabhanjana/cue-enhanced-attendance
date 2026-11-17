// CUE Enhanced Attendance
//
// Attendance page:
//   - "Effective attendance x%" / "With medical x%" lines on the Overall card
//   - a Target card after Overall / Present / Absent
// Subject page (View Details -> /main/AbsentDetails):
//   - Subject attendance / Present / Absent / Target cards for that subject
//
// Rules follow the portal's own "Attendance Information" box:
//   - co-curricular hours are added back (claims are added at semester end)
//   - medical leave is added only while attendance (with co-curricular) is
//     between 74.50% and 84.49%  (read from the page when available)
//
// Runs only in your browser. Nothing is sent anywhere.

(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const K = { target: "cueTarget", medical: "cueCountMedical", course: "cueLastCourse", rules: "cueRules" };
  const DEFAULT_TARGET = 85;
  const MARK = "data-cue-planner";
  const LIMIT = 5000;
  const COLORS = { need: "#f2607a", skip: "#22b07d", none: "#f5a524" };

  let target = DEFAULT_TARGET;
  let countMedical = true;
  let rules = { low: 74.5, high: 84.49 };
  let lastCourse = null; // { name, code, attended, scheduled, at }

  const save = (o) => { try { api.storage.local.set(o); } catch (_) {} };
  const r2 = (x) => Math.round(x * 100) / 100;
  const fmt = (x) => r2(x).toString() + "%";
  const norm = (t) => t.replace(/\s+/g, " ").trim();
  const num = "(\\d+(?:\\.\\d+)?)";

  // ======================================================================
  // math
  // ======================================================================
  // s = { present, total, cc, med }   (hours)

  function medEligible(base) {
    return base >= rules.low && base <= rules.high;
  }

  // Percentage after attending `attend` more and/or skipping `skip` more.
  function pctAfter(s, attend, skip, useMed) {
    const T = s.total + attend + skip;
    if (T <= 0) return null;
    let A = s.present + s.cc + attend;
    const base = r2((A / T) * 100);
    const applied = useMed && s.med > 0 && medEligible(base);
    if (applied) A += s.med;
    return { pct: Math.min(100, (A / T) * 100), base, applied };
  }

  function plan(s, pct) {
    const useMed = countMedical;
    const now = pctAfter(s, 0, 0, useMed);
    if (!now) return { kind: "empty" };
    const ok = (r) => r.pct >= pct - 1e-9;
    if (ok(now)) {
      let k = 0;
      while (k < LIMIT && ok(pctAfter(s, 0, k + 1, useMed))) k++;
      return k ? { kind: "skip", n: k } : { kind: "none" };
    }
    if (pct >= 100) return { kind: "impossible" };
    for (let n = 1; n <= LIMIT; n++) if (ok(pctAfter(s, n, 0, useMed))) return { kind: "need", n };
    return { kind: "impossible" };
  }

  // ======================================================================
  // reading the attendance page
  // ======================================================================

  function readLabelled(label) {
    const re = new RegExp("^" + label + "\\s*" + num + "$", "i");
    for (const el of document.querySelectorAll("span, p, div")) {
      if (el.closest("[" + MARK + "]")) continue;
      if (el.children.length || norm(el.textContent).toLowerCase() !== label.toLowerCase()) continue;
      let node = el;
      for (let i = 0; i < 4 && node.parentElement; i++) {
        node = node.parentElement;
        const m = norm(node.textContent).match(re);
        if (m) return Number(m[1]);
      }
    }
    return null;
  }

  function readOverall() {
    const scope = document.querySelector("main") || document.body;
    const m = scope.textContent.match(new RegExp(num + "\\s*/\\s*" + num + "\\s*hrs", "i"));
    if (!m) return null;
    const other = readLabelled("Other Absences");
    if (other === null) return null;
    const cc = readLabelled("Co-Curricular") || 0;
    const present = Number(m[1]);
    const total = Number(m[2]);
    // Anything absent that is neither co-curricular nor "other" is medical leave.
    const med = Math.max(0, r2(total - present - cc - other));
    return { present, total, cc, other, med };
  }

  function readRules() {
    const t = (document.querySelector("main") || document.body).textContent;
    const m = t.match(/between\s*([\d.]+)\s*%\s*and\s*([\d.]+)\s*%/i);
    if (!m) return;
    const r = { low: Number(m[1]), high: Number(m[2]) };
    if (!(r.low > 0 && r.high > r.low && r.high <= 100)) return;
    if (r.low !== rules.low || r.high !== rules.high) {
      rules = r;
      save({ [K.rules]: r });
    }
  }

  // Remember which subject's "View Details" was clicked.
  function readCourseFrom(btn) {
    const tr = btn.closest("tr");
    if (tr) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      const m = td && td.textContent.match(new RegExp(num + "\\s*/\\s*" + num));
      if (th && m) {
        const parts = [];
        th.querySelectorAll("span").forEach((s) => {
          const t = norm(s.textContent);
          if (t && !parts.includes(t)) parts.push(t);
        });
        return { name: parts[0] || norm(th.textContent), code: parts[1] || "", attended: +m[1], scheduled: +m[2] };
      }
    }
    // Cards view: climb to the smallest box holding this one course.
    let node = btn;
    for (let i = 0; i < 8 && node.parentElement; i++) {
      node = node.parentElement;
      const btns = [...node.querySelectorAll("button")].filter((b) => /view details/i.test(b.textContent));
      if (btns.length > 1) break;
      const m = node.textContent.match(new RegExp(num + "\\s*/\\s*" + num));
      if (!m) continue;
      let name = "", code = "";
      for (const el of node.querySelectorAll("span, p, h6, h5, h4")) {
        if (el.children.length) continue;
        const t = norm(el.textContent);
        if (!code && /^[A-Z]{2,}\d+[A-Z]*-\d+$/.test(t)) code = t;
        else if (!name && /^[A-Z][A-Z &/,.()-]{3,}$/.test(t) && !/^VIEW DETAILS$/.test(t)) name = t;
      }
      if (name) return { name, code, attended: +m[1], scheduled: +m[2] };
    }
    return null;
  }

  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const btn = t.closest("button");
    if (btn && /view details/i.test(btn.textContent + " " + (btn.title || ""))) {
      const c = readCourseFrom(btn);
      if (c) {
        lastCourse = { ...c, at: Date.now() };
        save({ [K.course]: lastCourse });
      }
    }
  }, true);

  // ======================================================================
  // reading the subject (AbsentDetails) page
  // ======================================================================

  const STATUS_RE = new RegExp("^" + num + "\\s*hrs?\\s+(absent|co-?curricular|extra-?curricular|medical(?: leave)?)$", "i");

  function readAbsentDetails() {
    const scope = document.querySelector("main") || document.body;
    const hits = [];
    for (const el of scope.querySelectorAll("*")) {
      if (el.closest("[" + MARK + "]") || el.closest("[hidden]")) continue;
      const m = norm(el.textContent).match(STATUS_RE);
      if (!m) continue;
      if ([...el.children].some((c) => STATUS_RE.test(norm(c.textContent)))) continue; // keep deepest
      hits.push({ el, v: Number(m[1]), kind: m[2].toLowerCase() });
    }
    if (!hits.length) return null;

    // The "3 hrs absent" summary is the hit equal to the sum of all the others.
    let summary = null;
    for (let i = 0; i < hits.length; i++) {
      const rest = hits.reduce((s, h, j) => (j === i ? s : s + h.v), 0);
      if (Math.abs(rest - hits[i].v) < 0.01) { summary = hits[i]; break; }
    }
    const rows = hits.filter((h) => h !== summary);
    const d = { cc: 0, med: 0, other: 0 };
    for (const h of rows) {
      if (/curricular/.test(h.kind)) d.cc += h.v;
      else if (/medical/.test(h.kind)) d.med += h.v;
      else d.other += h.v;
    }
    d.absent = summary ? summary.v : r2(d.cc + d.med + d.other);
    d.anchor = (summary || rows[0]).el;
    d.first = (rows[0] || summary).el;
    return d;
  }

  // ======================================================================
  // shared styles, icons, tooltip
  // ======================================================================

  const ICON = {
    event: "M17 12h-5v5h5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1zm3 18H5V8h14z",
    present: "M16.59 7.58 10 14.17l-3.59-3.58L5 12l5 5 8-8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
    absent: "M14.59 8 12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41zM12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
    trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2M5 8V7h2v3.82C5.84 10.4 5 9.3 5 8m14 0c0 1.3-.84 2.4-2 2.82V7h2z",
    medical: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4z",
    other: "M11 18h2v-2h-2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4",
    target: "m19.07 4.93-1.41 1.41C19.1 7.79 20 9.79 20 12c0 4.42-3.58 8-8 8s-8-3.58-8-8c0-4.08 3.05-7.44 7-7.93v2.02C8.16 6.57 6 9.03 6 12c0 3.31 2.69 6 6 6s6-2.69 6-6c0-1.66-.67-3.16-1.76-4.24l-1.41 1.41C15.55 9.9 16 10.9 16 12c0 2.21-1.79 4-4 4s-4-1.79-4-4c0-1.86 1.28-3.41 3-3.86v2.14c-.6.35-1 .98-1 1.72 0 1.1.9 2 2 2s2-.9 2-2c0-.74-.4-1.38-1-1.72V2h-1C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-2.76-1.12-5.26-2.93-7.07",
  };

  function svgIcon(path, size) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", size || 22);
    svg.setAttribute("height", size || 22);
    svg.setAttribute("aria-hidden", "true");
    svg.style.fill = "currentColor";
    svg.style.flexShrink = "0";
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    svg.append(p);
    return svg;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }



  // Styles live in content.css (declared in manifest.json). A <style> tag
  // added from here would be blocked by the portal's Content-Security-Policy.
  function ensureStyle() {}

  let tipEl = null;
  // Lines use **bold** markers; the tooltip is built from DOM nodes only.
  function showTip(anchor, lines) {
    hideTip();
    tipEl = el("div", "cue-tip");
    for (const line of lines) {
      const p = el("p");
      line.split("**").forEach((part, i) => { if (part) p.append(i % 2 ? el("b", null, part) : document.createTextNode(part)); });
      tipEl.append(p);
    }
    document.body.append(tipEl);
    const r = anchor.getBoundingClientRect();
    const w = tipEl.offsetWidth || 280;
    const h = tipEl.offsetHeight || 120;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    tipEl.style.left = left + "px";
    tipEl.style.top = top + "px";
  }
  function hideTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }

  function helpLines(s) {
    const lo = rules.low.toFixed(2), hi = rules.high.toFixed(2);
    const base = s ? pctAfter(s, 0, 0, false) : null;
    const out = [
      "**How this is calculated**",
      "Co-curricular hours are added back, as the university does at semester end.",
      `Medical leave is added only while your attendance (with co-curricular) is between **${lo}%** and **${hi}%**. Below that it counts as absent, so the count shows the classes you actually need.`,
    ];
    if (s && s.med > 0 && base) {
      out.push(medEligible(base.base)
        ? `You're at **${fmt(base.base)}** with co-curricular, so your **${s.med} hr** of medical leave is counted.`
        : base.base < rules.low
          ? `You're at **${fmt(base.base)}** with co-curricular, below ${lo}%, so your **${s.med} hr** of medical leave isn't counted yet. The number shown is what you actually need to attend.`
          : `You're above ${hi}%, so medical leave isn't needed or counted.`);
    }
    out.push("Untick **Count medical** to ignore medical leave completely.");
    out.push("Counts assume you attend (or skip) every class from now on.");
    return out;
  }

  function sizeInput(input) { input.style.width = Math.max(2, input.value.length) + "ch"; }

  // Builds target %, ?, and the "Count medical" checkbox; wires them up.
  function targetControls(getData) {
    const input = el("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.maxLength = 5;
    input.value = String(target);
    input.title = "Click to change your target";
    input.setAttribute("aria-label", "Target attendance percentage");
    sizeInput(input);

    const wrap = el("label", "cue-target");
    wrap.append(input, el("span", "pct", "%"));

    // A <span>, not a <button>: the portal's global button styles would resize it.
    const help = el("span", "cue-help", "?");
    help.setAttribute("tabindex", "0");
    help.setAttribute("aria-label", "How this is calculated");
    // Inline !important beats any page stylesheet, so the portal can't resize it.
    const lock = {
      display: "inline-flex", "align-items": "center", "justify-content": "center",
      "box-sizing": "border-box", width: "15px", height: "15px", "min-width": "15px",
      "min-height": "15px", "max-width": "15px", "max-height": "15px", padding: "0",
      margin: "0", border: "1.3px solid currentColor", "border-radius": "50%",
      background: "none", "box-shadow": "none", "font-family": "system-ui, sans-serif",
      "font-size": "10px", "font-weight": "700", "line-height": "1", "flex": "0 0 15px",
    };
    for (const [k, v] of Object.entries(lock)) help.style.setProperty(k, v, "important");
    const open = () => showTip(help, helpLines(getData()));
    help.addEventListener("mouseenter", open);
    help.addEventListener("focus", open);
    help.addEventListener("mouseleave", hideTip);
    help.addEventListener("blur", hideTip);

    const right = el("span", "cue-right");
    right.append(wrap);

    const med = el("label", "cue-med");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = countMedical;
    med.append(cb, el("span", null, "Count medical"));
    const foot = el("div", "cue-foot");
    foot.append(med, help);
    cb.addEventListener("change", () => {
      countMedical = cb.checked;
      save({ [K.medical]: countMedical });
      rerenderAll();
    });

    for (const ev of ["keydown", "keyup", "keypress"]) input.addEventListener(ev, (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
    // Only text that can still become a number from 1 to 100 (max 2 decimals)
    // is accepted: "", "7", "74.", "74.5", "100". Not "0", "101", "1e3", "-5", "7a".
    const VALID = /^(?:[1-9]\d?(?:\.\d{0,2})?|100)?$/;
    let lastGood = input.value;
    input.cueSync = (v) => { lastGood = v; };
    input.addEventListener("beforeinput", (e) => {
      if (e.inputType === "historyUndo" || e.inputType === "historyRedo") return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      let next;
      if (e.inputType.startsWith("insert")) {
        const data = e.data ?? (e.dataTransfer ? e.dataTransfer.getData("text/plain") : "");
        next = input.value.slice(0, start) + (data || "") + input.value.slice(end);
      } else if (e.inputType.startsWith("delete")) {
        if (start !== end) next = input.value.slice(0, start) + input.value.slice(end);
        else if (e.inputType === "deleteContentBackward") next = input.value.slice(0, Math.max(0, start - 1)) + input.value.slice(end);
        else if (e.inputType === "deleteContentForward") next = input.value.slice(0, start) + input.value.slice(end + 1);
        else return; // word/line deletes: checked in the input handler below
      } else return;
      if (!VALID.test(next) || parseFloat(next) > 100) e.preventDefault();
    });
    input.addEventListener("input", () => {
      // Safety net for anything beforeinput couldn't vet (autofill, drag & drop, etc.)
      if (!VALID.test(input.value) || parseFloat(input.value) > 100) {
        const pos = Math.max(0, (input.selectionStart ?? lastGood.length) - (input.value.length - lastGood.length));
        input.value = lastGood;
        try { input.setSelectionRange(pos, pos); } catch (_) {}
        return;
      }
      lastGood = input.value;
      sizeInput(input);
      const v = parseFloat(input.value);
      if (!Number.isFinite(v) || v < 1 || v > 100) return;
      target = v;
      save({ [K.target]: v });
      rerenderAll();
    });
    input.addEventListener("blur", () => { input.value = String(target); lastGood = input.value; sizeInput(input); });
    input.addEventListener("focus", () => input.select());

    return { input, wrap, right, med, foot, cb };
  }

  // Fills a target box: { h4, unit, caption, label, icon, wrap, cb, input }
  function fillTarget(box, s) {
    const p = plan(s, target);
    let color;
    if (p.kind === "need") {
      box.h4.textContent = String(p.n);
      box.unit.textContent = p.n === 1 ? "more class" : "more classes";
      box.caption.textContent = `You need ${p.n} more to reach ${target}%`;
      color = COLORS.need;
    } else if (p.kind === "skip") {
      box.h4.textContent = String(p.n);
      box.unit.textContent = p.n === 1 ? "skip left" : "skips left";
      box.caption.textContent = `You can skip ${p.n} and maintain ${target}%`;
      color = COLORS.skip;
    } else if (p.kind === "none") {
      box.h4.textContent = "0";
      box.unit.textContent = "skips left";
      box.caption.textContent = "You cannot skip classes";
      color = COLORS.none;
    } else {
      box.h4.textContent = "\u2013";
      box.unit.textContent = "";
      box.caption.textContent = p.kind === "empty" ? "No classes held yet" : `${target}% can't be reached`;
      color = COLORS.need;
    }
    box.label.style.color = color;
    if (box.icon) box.icon.style.color = color;
    box.wrap.style.color = color;
    if (box.cb.checked !== countMedical) box.cb.checked = countMedical;
    if (document.activeElement !== box.input && box.input.value !== String(target)) {
      box.input.value = String(target);
      if (box.input.cueSync) box.input.cueSync(box.input.value);
      sizeInput(box.input);
    }
  }

  // Shows only what differs from the portal's own figure:
  //   co-curricular hours -> "Effective attendance x%"
  //   medical leave       -> "With medical x%"
  //   neither             -> nothing (returns null)
  function effectiveLines(s) {
    if (!(s.total > 0)) return null;
    const showEff = s.cc > 0;
    const showMed = s.med > 0;
    if (!showEff && !showMed) return null;

    const eff = r2(((s.present + s.cc) / s.total) * 100);
    const wrap = el("div", "cue-eff");
    if (showEff) {
      const l1 = el("div", "ln");
      const v = el("b", null, fmt(eff));
      v.style.color = COLORS.skip;
      l1.append(el("span", null, "Effective attendance"), v);
      wrap.append(l1);
    }
    if (showMed) {
      const withMed = Math.min(100, r2(((s.present + s.cc + s.med) / s.total) * 100));
      const l2 = el("div", "ln");
      const v = el("b", null, fmt(withMed));
      const lab = el("span", null, "With medical ");
      if (!medEligible(eff)) {
        v.className = "dim";
        lab.title = "Medical leave only counts between " + rules.low + "% and " + rules.high + "%";
        lab.append(el("span", "dim", eff < rules.low ? "(from " + rules.low + "%)" : "(not needed)"));
      } else if (!showEff) {
        v.style.color = COLORS.skip;
      }
      l2.append(lab, v);
      wrap.append(l2);
    }
    return wrap;
  }

  // ======================================================================
  // attendance page
  // ======================================================================

  let att = { data: null, box: null, sig: "" };

  function findPresentItem() {
    for (const p of document.querySelectorAll("p")) {
      if (p.children.length || norm(p.textContent) !== "Present") continue;
      if (p.closest("[" + MARK + "]")) continue;
      const item = p.closest(".MuiGrid-item");
      if (item) return item;
    }
    return null;
  }

  function buildAttendanceTarget() {
    const proto = findPresentItem();
    if (!proto) return null;
    const root = proto.cloneNode(true);
    root.setAttribute(MARK, "target");
    root.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    root.querySelectorAll("[aria-label]").forEach((n) => n.removeAttribute("aria-label"));

    const label = [...root.querySelectorAll("p")].find((p) => norm(p.textContent) === "Present");
    const h4 = root.querySelector("h4");
    if (!label || !h4) return null;
    const titleBox = label.parentElement;
    const headRow = titleBox.parentElement;
    const icon = titleBox.querySelector("svg");
    const valueRow = h4.parentElement;
    const unit = valueRow.querySelector("p");
    if (!unit) return null;

    label.textContent = "Target";
    if (icon) {
      const path = icon.querySelector("path");
      if (path) path.setAttribute("d", ICON.target);
      icon.setAttribute("viewBox", "0 0 24 24");
    }
    Object.assign(headRow.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });

    const ctl = targetControls(() => att.data);
    headRow.append(ctl.right);
    unit.classList.add("cue-unit");

    const caption = unit.cloneNode(false);
    caption.classList.remove("cue-unit");
    caption.classList.add("cue-caption");
    valueRow.after(caption);
    caption.after(ctl.foot);

    const cards = [...proto.parentElement.children].filter((c) => !c.hasAttribute(MARK));
    cards[cards.length - 1].after(root);
    return { root, h4, unit, caption, label, icon, wrap: ctl.wrap, cb: ctl.cb, input: ctl.input };
  }

  function updateOverallCards(s) {
    for (const p of document.querySelectorAll("p")) {
      if (p.children.length || norm(p.textContent) !== "Overall Attendance") continue;
      const card = p.closest(".MuiCard-root");
      if (!card || card.closest("[" + MARK + "]")) continue;
      const content = card.querySelector(".MuiCardContent-root") || card;

      const lines = effectiveLines(s);
      const old = content.querySelector("[" + MARK + "='eff']");
      const sig = JSON.stringify([s, rules]);
      if (!lines) { if (old) old.remove(); continue; }
      if (old && old.dataset.sig === sig) continue;

      const ref = [...card.querySelectorAll("p")].find((x) => !x.children.length && /hrs/i.test(x.textContent));
      const box = el("div", ref ? ref.className : "");
      box.setAttribute(MARK, "eff");
      box.dataset.sig = sig;
      box.style.marginTop = "10px";
      box.title = "Co-curricular absences are claimed back at semester end.";
      lines.style.marginTop = "0";
      box.append(lines);
      if (old) old.replaceWith(box); else content.append(box);
    }
  }

  function refreshAttendance(force) {
    readRules();
    const s = readOverall();
    if (!s || s.total <= 0) return;
    att.data = s;
    ensureStyle();
    updateOverallCards(s);
    if (!att.box || !att.box.root.isConnected) { att.box = buildAttendanceTarget(); att.sig = ""; }
    if (!att.box) return;
    const sig = JSON.stringify([s, target, countMedical, rules]);
    if (!force && sig === att.sig) return;
    att.sig = sig;
    fillTarget(att.box, s);
  }

  // ======================================================================
  // subject page (AbsentDetails)
  // ======================================================================

  let sub = { row: null, sig: "", data: null, box: null, validCourse: null };

  function titleCase(t) {
    return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
      .replace(/\b(Ai|Ii|Iii|Iv|Ml|Nlp|Ui|Ux)\b/g, (w) => w.toUpperCase());
  }

  function card(icon, labelText, color) {
    const c = el("div", "cue-card");
    const hd = el("div", "hd");
    const ttl = el("div", "ttl");
    const ic = svgIcon(icon);
    const lab = el("span", null, labelText);
    ttl.style.color = color;
    ttl.append(ic, lab);
    hd.append(ttl);
    const val = el("div", "val");
    const h4 = el("h4");
    const unit = el("p");
    val.append(h4, unit);
    c.append(hd, val);
    return { c, hd, ttl, ic, lab, h4, unit, val };
  }

  function line(icon, text, color, value, valueColor) {
    const ln = el("div", "ln");
    const a = el("span");
    a.style.color = color;
    a.append(svgIcon(icon, 16), el("span", null, text));
    const b = el("span", null, String(value));
    b.style.color = valueColor || color;
    ln.append(a, b);
    return ln;
  }

  function isFlexRow(node) {
    try {
      const cs = getComputedStyle(node);
      // Only a single-line flex row would squeeze the cards; a wrapping one
      // gives them their own full-width line (see .cue-row in content.css).
      return /flex/.test(cs.display) && !/column/.test(cs.flexDirection) && cs.flexWrap === "nowrap";
    } catch (_) { return false; }
  }

  // Put the cards right below the "Download & View" box, as a full-width block.
  function insertRow(row, d) {
    const scope = document.querySelector("main") || document.body;
    const dl = [...scope.querySelectorAll("button, a")].find((b) => /download/i.test(b.textContent) && !b.closest("[" + MARK + "]"));
    let node = dl;
    if (node) {
      while (node.parentElement && node.parentElement !== scope && node.parentElement.children.length === 1) node = node.parentElement;
      for (let i = 0; i < 3 && node.parentElement && node.parentElement !== scope && isFlexRow(node.parentElement); i++) node = node.parentElement;
      node.after(row);
      return true;
    }
    // Fallback: before the block holding the "N hrs absent" summary.
    const a = d.anchor, b = d.first;
    let lca = a;
    while (lca && !lca.contains(b)) lca = lca.parentElement;
    if (!lca) return false;
    let block = a;
    if (a === lca) block = a;
    else while (block.parentElement !== lca) block = block.parentElement;
    while (block.parentElement && block.parentElement !== scope && isFlexRow(block.parentElement)) block = block.parentElement;
    block.parentElement.insertBefore(row, block);
    return true;
  }

  const subjectSig = (c, d) => JSON.stringify([c, d.cc, d.med, d.other, d.absent, target, countMedical, rules]);

  function removeSubject() {
    if (sub.row && sub.row.isConnected) sub.row.remove();
    sub.row = null; sub.sig = ""; sub.box = null;
  }

  function refreshSubject(force) {
    const d = readAbsentDetails();
    if (!d) return removeSubject();
    const c = lastCourse;
    const valid = c && Math.abs(r2(c.scheduled - c.attended) - d.absent) < 0.01 &&
      Math.abs(d.cc + d.med + d.other - d.absent) < 0.01;

    const sig = subjectSig(valid && c, d);
    if (!force && sub.row && sub.row.isConnected && sig === sub.sig) return;
    ensureStyle();

    const row = el("div", valid ? "cue-row" : "cue-note");
    row.setAttribute(MARK, "subject");
    if (document.documentElement.getAttribute("data-theme") === "light") row.classList.add("cue-light");

    if (!valid) {
      row.textContent = "Open this page from \u201cView Details\u201d on the Attendance page to see this subject's cards.";
    } else {
      const s = { present: c.attended, total: c.scheduled, cc: d.cc, med: d.med };
      sub.data = s;
      const eff = r2(((s.present + s.cc) / s.total) * 100);

      // 1. Subject attendance
      const k1 = card(ICON.event, titleCase(c.name), "#60a5fa");
      k1.lab.title = c.name;
      const actual = s.total > 0 ? (s.present / s.total) * 100 : 0;
      k1.h4.textContent = s.total > 0 ? fmt(actual) : "\u2013";
      k1.unit.remove();
      k1.c.append(el("p", "sub", `${s.present} / ${s.total} hrs${c.code ? " \u00b7 " + c.code : ""}`));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = Math.max(0, Math.min(100, actual)) + "%";
      bar.append(fill);
      k1.c.append(bar);
      const effEl = effectiveLines(s);
      if (effEl) k1.c.append(effEl);

      // 2. Present
      const k2 = card(ICON.present, "Present", "#22b07d");
      k2.h4.textContent = String(s.present);
      k2.unit.textContent = "hrs";

      // 3. Absent
      const k3 = card(ICON.absent, "Absent", "#f2607a");
      k3.h4.textContent = String(d.absent);
      k3.unit.textContent = "hrs";
      const lines = el("div", "lines");
      lines.append(line(ICON.trophy, "Co-Curricular", "#f59e0b", d.cc));
      if (d.med > 0) lines.append(line(ICON.medical, "Medical Leave", "#2dd4bf", d.med));
      lines.append(line(ICON.other, "Other Absences", "#cbd5e1", d.other, "#93c5fd"));
      k3.c.append(lines);

      // 4. Target
      const k4 = card(ICON.target, "Target", COLORS.need);
      const ctl = targetControls(() => sub.data);
      k4.hd.append(ctl.right);
      k4.unit.classList.add("cue-unit");
      const caption = el("p", "cue-caption");
      k4.c.append(caption, ctl.foot);
      sub.box = { h4: k4.h4, unit: k4.unit, caption, label: k4.ttl, icon: null, wrap: ctl.wrap, cb: ctl.cb, input: ctl.input };
      fillTarget(sub.box, s);

      row.append(k1.c, k2.c, k3.c, k4.c);
    }

    // Keep focus in the target box if the row is rebuilt while typing.
    const hadFocus = sub.row && sub.row.contains(document.activeElement);
    if (sub.row && sub.row.isConnected) sub.row.replaceWith(row);
    else if (!insertRow(row, d)) return;
    sub.row = row;
    sub.sig = sig;
    sub.validCourse = valid && c;
    if (hadFocus && sub.box) sub.box.input.focus();
  }

  // Re-render when target / checkbox change. Only the Target card depends on
  // these, so it is updated in place (keeps focus while typing).
  function rerenderAll() {
    hideTip();
    if (isAttendance()) refreshAttendance(true);
    if (isSubject() && sub.box && sub.data && sub.row && sub.row.isConnected) {
      fillTarget(sub.box, sub.data);
      const d = readAbsentDetails();
      if (d) sub.sig = subjectSig(sub.validCourse, d);
    }
  }

  // ======================================================================
  // lifecycle (the portal is a single-page app)
  // ======================================================================

  const isAttendance = () => /attend/i.test(location.pathname) && !/absentdetails/i.test(location.pathname);
  const isSubject = () => /absentdetails/i.test(location.pathname);

  function refresh() {
    if (isAttendance()) refreshAttendance(false);
    if (isSubject()) refreshSubject(false);
    else if (sub.row) removeSubject();
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };

  function start() {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(schedule, 2000);
    refresh();
  }

  try {
    Promise.resolve(api.storage.local.get([K.target, K.medical, K.course, K.rules])).then((res) => {
      res = res || {};
      const v = res[K.target];
      if (Number.isFinite(v) && v >= 1 && v <= 100) target = v;
      if (typeof res[K.medical] === "boolean") countMedical = res[K.medical];
      if (res[K.course] && typeof res[K.course] === "object") lastCourse = res[K.course];
      const r = res[K.rules];
      if (r && r.low > 0 && r.high > r.low) rules = r;
      start();
    }, start);
  } catch (_) {
    start();
  }
})();
