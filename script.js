"use strict";

const BASES = {
  10: { name: "Decimal", short: "DEC", prefix: "", digits: "0123456789", hint: "Digits 0–9", ph: "255" },
  2: { name: "Binary", short: "BIN", prefix: "0b", digits: "01", hint: "Digits 0 and 1 only", ph: "1011" },
  8: { name: "Octal", short: "OCT", prefix: "0o", digits: "01234567", hint: "Digits 0–7", ph: "377" },
  16: { name: "Hexadecimal", short: "HEX", prefix: "0x", digits: "0123456789ABCDEF", hint: "Digits 0–9 and A–F", ph: "FF" },
};
const ORDER = [10, 2, 8, 16];
const WIDTH = { 2: 1, 8: 3, 16: 4 };
const MAX_DIGITS = 2000;
const KEY = "nexus.history.v1";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const input = $("#value");
const hint = $("#hint");
const field = $(".field");
const prefixEl = $("#prefix");
const targetsEl = $("#targets");
const stepsEl = $("#steps");
const statusEl = $("#status");

let base = 10;
let src = null; // { neg, mag (BigInt), base }
let target = null;
let history = loadHistory();

/* ---------- exact arithmetic (BigInt only) ---------- */

function parse(raw, b) {
  let s = raw.replace(/[\s_]/g, "");
  if (!s) return { error: "Enter a value to convert." };
  let neg = false;
  if (s[0] === "-" || s[0] === "+") {
    neg = s[0] === "-";
    s = s.slice(1);
  }
  const p = BASES[b].prefix;
  if (p && s.slice(0, 2).toLowerCase() === p) s = s.slice(2);
  if (!s) return { error: "Add digits after the sign or prefix." };
  if (s.length > MAX_DIGITS) return { error: `That is ${s.length} digits. The limit is ${MAX_DIGITS}.` };
  const set = BASES[b].digits;
  const bb = BigInt(b);
  let mag = 0n;
  for (const ch of s.toUpperCase()) {
    const d = set.indexOf(ch);
    if (d < 0) {
      return { error: `“${ch}” isn’t valid in ${BASES[b].name.toLowerCase()}. ${BASES[b].hint}.` };
    }
    mag = mag * bb + BigInt(d);
  }
  return { neg: neg && mag !== 0n, mag, base: b };
}

const digitsOf = (mag, b) => mag.toString(b).toUpperCase();
const sign = (neg) => (neg ? "-" : "");
const group = (s, n) => {
  const out = [];
  for (let i = s.length; i > 0; i -= n) out.unshift(s.slice(Math.max(0, i - n), i));
  return out.join(" ");
};

/* ---------- steps ---------- */

const squeeze = (rows) => (rows.length > 12 ? [...rows.slice(0, 6), null, ...rows.slice(-6)] : rows);

function table(head, rows) {
  const body = rows
    .map((r) =>
      r ? `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>` : `<tr><td colspan="${head.length}">…</td></tr>`
    )
    .join("");
  return `<div class="table-wrap"><table class="div-table"><thead><tr>${head
    .map((h) => `<th scope="col">${h}</th>`)
    .join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function buildSteps(s, t) {
  const m = s.mag;
  const sb = s.base;
  const sd = digitsOf(m, sb);
  const td = digitsOf(m, t);
  const out = [];
  if (s.neg) {
    out.push(["Set the sign aside", `The value is negative. Convert the magnitude <b>${sd}</b>, then put the minus sign back in front.`]);
  }

  if (sb === 10) {
    const bt = BigInt(t);
    const rows = [];
    for (let q = m; q > 0n || rows.length === 0; q /= bt) {
      const r = q % bt;
      rows.push([q, q / bt, r]);
      if (q === 0n) break;
    }
    const shown = squeeze(rows).map((r) =>
      r ? [`${r[0]} ÷ ${t}`, r[1], `<span class="r">${r[2] > 9n ? `${r[2]} (${digitsOf(r[2], 16)})` : r[2]}</span>`] : null
    );
    out.push([
      `Divide by ${t} until the quotient is 0`,
      table(["Division", "Quotient", "Remainder"], shown) +
        (rows.length > 12 ? `<p class="note">${rows.length} divisions in total. The middle rows are hidden.</p>` : ""),
    ]);
    out.push(["Read the remainders from bottom to top", "Read in that order, the remainders spell the result."]);
  } else if (t === 10) {
    const ds = [...sd];
    const n = ds.length;
    const rows = ds.map((c, i) => {
      const p = n - 1 - i;
      const d = BigInt(BASES[sb].digits.indexOf(c));
      return [c, `${sb}<sup>${p}</sup>`, d * BigInt(sb) ** BigInt(p)];
    });
    out.push(["Multiply each digit by its place value", table(["Digit", "Place value", "Term"], squeeze(rows))]);
    out.push(["Add the terms together", "The sum of all the terms is the decimal value."]);
  } else {
    const bits = m.toString(2);
    if (sb !== 2) {
      const w = WIDTH[sb];
      const rows = [...sd].map((c) => [c, BigInt(BASES[sb].digits.indexOf(c)).toString(2).padStart(w, "0")]);
      out.push([`Write each ${BASES[sb].name.toLowerCase()} digit as ${w} bits`, table(["Digit", "Bits"], squeeze(rows))]);
    }
    if (t !== 2) {
      const w = WIDTH[t];
      const pad = bits.padStart(Math.ceil(bits.length / w) * w, "0");
      const g = pad.match(new RegExp(`.{${w}}`, "g"));
      const mapped = g.map((x) => digitsOf(BigInt("0b" + x), t));
      out.push([
        `Regroup the bits in ${w}s from the right`,
        `<p>${g.join(" ")}</p><p>→ <b>${mapped.join(" ")}</b></p>`,
      ]);
    } else {
      out.push(["Drop any leading zeros", `The bit string is <b>${group(bits, 4)}</b>.`]);
    }
  }

  const shown = t === 2 ? group(td, 4) : td;
  out.push(["Result", `<p class="answer"><span>${sign(s.neg)}${BASES[t].prefix}${shown}</span></p>`]);
  return out;
}

/* ---------- rendering ---------- */

function setBase(b) {
  base = b;
  $$("#base-tabs .tab").forEach((t) => {
    const on = +t.dataset.base === b;
    t.setAttribute("aria-checked", on);
    t.tabIndex = on ? 0 : -1;
  });
  prefixEl.textContent = BASES[b].prefix;
  prefixEl.hidden = !BASES[b].prefix;
  input.placeholder = BASES[b].ph;
  clearError();
}

function showError(msg) {
  hint.textContent = msg;
  hint.classList.add("is-error");
  field.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");
}

function clearError() {
  hint.textContent = BASES[base].hint;
  hint.classList.remove("is-error");
  field.classList.remove("has-error");
  input.removeAttribute("aria-invalid");
}

function renderResults() {
  $$(".panel").forEach((p) => {
    const b = +p.dataset.base;
    const digits = digitsOf(src.mag, b);
    const shown = b === 2 ? group(digits, 4) : digits;
    $(".value", p).innerHTML = `${sign(src.neg)}<span class="pre">${BASES[b].prefix}</span>${shown}`;
    p.dataset.raw = sign(src.neg) + digits;
    p.classList.toggle("is-source", b === src.base);
    $(".tag", p).hidden = b !== src.base;
    $(".copy", p).disabled = false;
  });
  const grid = $("#result-grid");
  grid.classList.remove("reveal");
  void grid.offsetWidth;
  grid.classList.add("reveal");
}

function renderMethod() {
  const opts = ORDER.filter((b) => b !== src.base);
  if (!opts.includes(target)) target = opts[0];
  targetsEl.hidden = false;
  $("#method-empty").hidden = true;
  targetsEl.innerHTML = opts
    .map(
      (b) =>
        `<button type="button" class="tab" role="radio" aria-checked="${b === target}" tabindex="${b === target ? 0 : -1}" data-base="${b}">${BASES[b].name}<small>Base ${b}</small></button>`
    )
    .join("");
  renderSteps();
}

function renderSteps() {
  stepsEl.innerHTML = buildSteps(src, target)
    .map(([h, b]) => `<li><h3>${h}</h3><div class="work">${b}</div></li>`)
    .join("");
}

/* ---------- history ---------- */

function loadHistory() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(a)
      ? a.filter((e) => e && typeof e.v === "string" && BASES[e.b] && Number.isFinite(e.t)).slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable: history lives in memory only */
  }
}

function pushHistory(s) {
  const v = sign(s.neg) + digitsOf(s.mag, s.base);
  if (!(history[0] && history[0].v === v && history[0].b === s.base)) {
    history.unshift({ v, b: s.base, t: Date.now() });
    history = history.slice(0, 10);
    saveHistory();
  }
  renderHistory();
}

function renderHistory() {
  const rows = history
    .map((e, i) => {
      const r = parse(e.v, e.b);
      if (r.error) return "";
      const others = ORDER.filter((b) => b !== e.b)
        .map((b) => `${BASES[b].short} ${sign(r.neg)}${digitsOf(r.mag, b)}`)
        .join("   ");
      const when = new Date(e.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      return `<li><time class="h-time">${when}</time><div class="h-main"><strong>${sign(r.neg)}${digitsOf(r.mag, e.b)} · ${BASES[e.b].short}</strong><span>${others}</span></div><button class="link-btn" type="button" data-i="${i}" aria-label="Restore ${BASES[e.b].name} ${sign(r.neg)}${digitsOf(r.mag, e.b)}">Restore</button></li>`;
    })
    .join("");
  $("#history-list").innerHTML = rows;
  $("#history-empty").hidden = history.length > 0;
  $("#clear-history").disabled = history.length === 0;
}

/* ---------- actions ---------- */

function convert() {
  const r = parse(input.value, base);
  if (r.error) return showError(r.error);
  clearError();
  src = r;
  renderResults();
  renderMethod();
  pushHistory(r);
  statusEl.textContent = "Converted. All four results are updated.";
  const top = $("#results").getBoundingClientRect().top;
  if (top > window.innerHeight * 0.6) $("#results").scrollIntoView();
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function radioKeys(container, pick) {
  container.addEventListener("keydown", (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const tabs = $$(".tab", container);
    const i = tabs.indexOf(document.activeElement);
    const next = tabs[(i + keys[e.key] + tabs.length) % tabs.length];
    next.focus();
    pick(+next.dataset.base);
  });
  container.addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) pick(+t.dataset.base);
  });
}

radioKeys($("#base-tabs"), setBase);
radioKeys(targetsEl, (b) => {
  target = b;
  $$(".tab", targetsEl).forEach((t) => {
    const on = +t.dataset.base === b;
    t.setAttribute("aria-checked", on);
    t.tabIndex = on ? 0 : -1;
  });
  renderSteps();
});

$("#converter-form").addEventListener("submit", (e) => {
  e.preventDefault();
  convert();
});
input.addEventListener("input", () => hint.classList.contains("is-error") && clearError());
$("#clear").addEventListener("click", () => {
  input.value = "";
  clearError();
  input.focus();
});

$("#result-grid").addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy");
  if (!btn || btn.disabled) return;
  const panel = btn.closest(".panel");
  if (await copy(panel.dataset.raw)) {
    btn.textContent = "Copied";
    btn.classList.add("is-copied");
    statusEl.textContent = `${BASES[+panel.dataset.base].name} value copied.`;
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("is-copied");
    }, 1800);
  } else {
    statusEl.textContent = "Copy isn’t available in this browser. Select the value and copy it manually.";
  }
});

$("#history-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-i]");
  const entry = btn && history[+btn.dataset.i];
  if (!entry) return;
  setBase(entry.b);
  input.value = entry.v;
  convert();
});

$("#clear-history").addEventListener("click", () => {
  history = [];
  saveHistory();
  renderHistory();
});

$$('a[href="#converter"]').forEach((a) =>
  a.addEventListener("click", () => setTimeout(() => input.focus({ preventScroll: true }), 450))
);

$("#year").textContent = new Date().getFullYear();
setBase(10);
renderHistory();
