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

/* =====================================================================
   NEXUS interactive layer (added). Purely cosmetic: it never changes how
   numbers are parsed or converted. Everything is skipped when the user
   prefers reduced motion. CSS for these effects is injected from here, so
   index.html and style.css stay untouched.
   ===================================================================== */
(function enhance() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const mk = (tag, cls) => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };

  /* ---- injected CSS ---- */
  const st = document.createElement("style");
  st.id = "nexus-fx";
  st.textContent = `
.fx-progress{position:fixed;inset:0 0 auto 0;height:2px;z-index:60;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#a898ff,#79e4c3)}
.fx-glow{position:fixed;left:0;top:0;width:520px;height:520px;margin:-260px 0 0 -260px;border-radius:50%;pointer-events:none;z-index:-1;background:radial-gradient(circle,rgb(168 152 255/14%),transparent 65%);transform:translate3d(var(--gx,50vw),var(--gy,50vh),0);will-change:transform}
.fx-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:-2;opacity:.5;pointer-events:none}
.rv{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0ms)}
.rv.in{opacity:1;transform:none}
.fx-in{animation:fxIn .5s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*70ms)}
@keyframes fxIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.button,.copy{position:relative;overflow:hidden}
.ripple{position:absolute;border-radius:50%;pointer-events:none;background:rgb(168 152 255/45%);transform:scale(0);animation:fxRip .6s ease-out forwards}
@keyframes fxRip{to{transform:scale(1);opacity:0}}
.fx-shake{animation:fxShake .32s}
@keyframes fxShake{20%{transform:translateX(-6px)}50%{transform:translateX(6px)}80%{transform:translateX(-3px)}}
.fx-pop{animation:fxPop .35s ease}
@keyframes fxPop{40%{transform:translateY(-4px) scale(1.05)}}
.panel{position:relative;transition:border-color 180ms ease,transform 180ms ease}
.panel::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgb(168 152 255/16%),transparent 60%)}
.panel:hover::before{opacity:1}
.navigation a.nav-active{color:#fff}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}.fx-in,.fx-shake,.fx-pop,.ripple{animation:none}.fx-glow,.fx-canvas{display:none}}`;
  document.head.appendChild(st);

  /* ---- scroll progress bar ---- */
  const bar = mk("div", "fx-progress");
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- cursor glow that follows the pointer ---- */
  if (fine && !reduce) {
    const glow = mk("div", "fx-glow");
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);
    addEventListener("pointermove", (e) => {
      glow.style.setProperty("--gx", e.clientX + "px");
      glow.style.setProperty("--gy", e.clientY + "px");
    });
  }

  /* ---- scroll reveal for static blocks ---- */
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          io.unobserve(el);
          el.classList.add("in");
          // hand control back after the reveal so hover/tilt transforms work normally
          setTimeout(() => el.classList.remove("rv", "in"), 1000);
        });
      },
      { threshold: 0.12 }
    );
    $$(".block .eyebrow, .block h2, .block .section-copy, .converter, .head-row .link-btn, .panel, .method-body .tabs").forEach((el, i) => {
      el.classList.add("rv");
      el.style.setProperty("--d", (i % 4) * 80 + "ms");
      io.observe(el);
    });
  }

  /* ---- scroll spy for the header links ---- */
  if ("IntersectionObserver" in window) {
    const links = $$(".navigation a[href^='#']");
    const spy = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          links.forEach((a) => a.classList.toggle("nav-active", a.getAttribute("href") === "#" + en.target.id));
        }),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    ["converter", "method", "history"].forEach((id) => $("#" + id) && spy.observe($("#" + id)));
  }

  /* ---- sparks (Web Animations API) ---- */
  function burst(x, y, n = 14) {
    if (reduce || !document.body.animate) return;
    const colors = ["#a898ff", "#79e4c3", "#f4f5fb"];
    for (let i = 0; i < n; i++) {
      const p = mk("span", "fx-spark");
      p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:6px;height:6px;border-radius:1px;pointer-events:none;z-index:70;background:${colors[i % 3]}`;
      document.body.appendChild(p);
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 80;
      p.animate(
        [
          { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 },
          { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) rotate(${Math.random() * 360}deg) scale(0)`, opacity: 0 },
        ],
        { duration: 600 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.2,1)" }
      ).onfinish = () => p.remove();
    }
  }

  /* ---- button ripple + magnetic pull ---- */
  document.addEventListener("click", (e) => {
    if (reduce) return;
    const b = e.target.closest(".button, .copy");
    if (!b) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const rip = mk("span", "ripple");
    rip.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  });
  if (fine && !reduce) {
    $$(".button").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.18;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.28;
        b.style.transform = `translate(${x}px,${y}px)`;
      });
      b.addEventListener("pointerleave", () => (b.style.transform = ""));
    });
    $$(".panel").forEach((p) => {
      p.addEventListener("pointermove", (e) => {
        const r = p.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        p.style.setProperty("--mx", x * 100 + "%");
        p.style.setProperty("--my", y * 100 + "%");
        p.style.transform = `perspective(800px) rotateX(${(0.5 - y) * 6}deg) rotateY(${(x - 0.5) * 8}deg)`;
      });
      p.addEventListener("pointerleave", () => (p.style.transform = ""));
    });
  }

  /* ---- decode animation on the four results ---- */
  let token = 0;
  const baseRenderResults = renderResults;
  renderResults = function () {
    baseRenderResults();
    if (reduce) return;
    const tok = ++token;
    $$(".panel").forEach((p, pi) => {
      const node = $(".value", p).lastChild;
      if (!node || node.nodeType !== 3) return;
      const final = node.data;
      const set = BASES[+p.dataset.base].digits;
      const start = performance.now() + pi * 90;
      const dur = Math.min(1100, 450 + final.length * 18);
      const tick = (now) => {
        if (tok !== token) {
          node.data = final;
          return;
        }
        const t = Math.min(1, Math.max(0, (now - start) / dur));
        const reveal = Math.floor(t * final.length);
        let out = "";
        for (let i = 0; i < final.length; i++) {
          out += final[i] === " " || i < reveal ? final[i] : set[Math.floor(Math.random() * set.length)];
        }
        node.data = t >= 1 ? final : out;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  /* ---- staggered entrance for steps and history rows ---- */
  const stagger = (root) => {
    if (reduce || !root) return;
    [...root.children].forEach((li, i) => {
      li.style.setProperty("--i", i);
      li.classList.add("fx-in");
    });
  };
  const baseRenderSteps = renderSteps;
  renderSteps = function () {
    baseRenderSteps();
    stagger(stepsEl);
  };
  const baseRenderHistory = renderHistory;
  renderHistory = function () {
    baseRenderHistory();
    stagger($("#history-list"));
  };

  /* ---- sparks on a successful Convert / Copy ---- */
  const baseConvert = convert;
  convert = function () {
    const before = src;
    baseConvert();
    if (src && src !== before) {
      const b = $("#converter-form .button");
      const r = b.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2);
    }
  };
  $("#result-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".copy");
    if (!btn || btn.disabled) return;
    setTimeout(() => {
      if (btn.classList.contains("is-copied")) {
        const r = btn.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 10);
      }
    }, 80);
  });

  /* ---- input feedback: shake on an invalid character, pop when the base changes ---- */
  input.addEventListener("input", () => {
    if (reduce) return;
    let s = input.value.replace(/[\s_]/g, "").replace(/^[+-]/, "");
    const p = BASES[base].prefix;
    if (p && s.slice(0, 2).toLowerCase() === p) s = s.slice(2);
    if ([...s.toUpperCase()].some((c) => !BASES[base].digits.includes(c))) {
      field.classList.remove("fx-shake");
      void field.offsetWidth;
      field.classList.add("fx-shake");
    }
  });
  $("#base-tabs").addEventListener("click", () => {
    if (reduce) return;
    [prefixEl, hint].forEach((el) => {
      el.classList.remove("fx-pop");
      void el.offsetWidth;
      el.classList.add("fx-pop");
    });
  });

  /* ---- press "/" to jump to the input ---- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(input|textarea|select)$/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });

  /* ---- binary rain behind the hero (pauses off-screen, reacts to the cursor) ---- */
  const hero = $(".hero");
  if (hero && !reduce) {
    const cv = mk("canvas", "fx-canvas");
    cv.setAttribute("aria-hidden", "true");
    hero.prepend(cv);
    const ctx = cv.getContext("2d");
    const fs = 16;
    const glyphs = "01010101ABCDEF";
    let w = 0, h = 0, drops = [], px = -999, running = false, last = 0;
    const size = () => {
      const r = hero.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = r.width;
      h = r.height;
      drops = Array.from({ length: Math.ceil(w / fs) }, () => Math.random() * (h / fs));
    };
    const frame = (now) => {
      if (!running) return;
      requestAnimationFrame(frame);
      if (now - last < 45) return;
      last = now;
      ctx.fillStyle = "rgba(11,16,32,.14)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fs - 2}px "Space Grotesk", monospace`;
      drops.forEach((y, i) => {
        const x = i * fs;
        const near = Math.abs(x - px) < 70;
        ctx.fillStyle = near ? "rgba(121,228,195,.9)" : "rgba(168,152,255,.5)";
        ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y * fs);
        drops[i] = y * fs > h && Math.random() > 0.975 ? 0 : y + (near ? 1.6 : 0.5);
      });
    };
    const toggle = (on) => {
      if (on && !running && !document.hidden) {
        running = true;
        requestAnimationFrame(frame);
      } else if (!on) running = false;
    };
    size();
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(hero);
    hero.addEventListener("pointermove", (e) => (px = e.clientX - hero.getBoundingClientRect().left));
    hero.addEventListener("pointerleave", () => (px = -999));
    if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => toggle(en.isIntersecting)).observe(hero);
    else toggle(true);
    document.addEventListener("visibilitychange", () => toggle(!document.hidden));
  }

  stagger($("#history-list"));
})();

/* =====================================================================
   NEXUS v2 interaction layer (appended). Still cosmetic / convenience only:
   conversion stays explicit (Convert button) and exact (BigInt).
   ===================================================================== */
(function enhance2() {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const mk = (tag, cls) => {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  };

  /* ---- smart header: compact after scrolling, hides on scroll down ---- */
  const header = $(".site-header");
  let lastY = scrollY;
  addEventListener(
    "scroll",
    () => {
      const y = scrollY;
      header.classList.toggle("is-compact", y > 40);
      const down = y > lastY && y > 240;
      header.classList.toggle("is-hidden", down && !header.contains(document.activeElement));
      lastY = y;
    },
    { passive: true }
  );

  /* ---- hero pointer parallax (feeds --px / --py used by the glow) ---- */
  const hero = $(".hero");
  if (hero && fine && !reduce) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      hero.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
  }

  /* ---- try-an-example chips ---- */
  const SAMPLES = { 10: ["255", "-42", "65535"], 2: ["1010", "11111111", "-101010"], 8: ["377", "7777", "-52"], 16: ["FF", "DEADBEEF", "-2A"] };
  const ex = mk("div", "examples");
  ex.setAttribute("role", "group");
  ex.setAttribute("aria-label", "Try an example");
  hint.after(ex);
  function renderExamples() {
    ex.innerHTML = '<span class="ex-label">Try</span>' + SAMPLES[base].map((s) => `<button type="button" class="ex-chip">${s}</button>`).join("");
  }
  ex.addEventListener("click", (e) => {
    const c = e.target.closest(".ex-chip");
    if (!c) return;
    input.value = c.textContent;
    clearError();
    convert();
  });
  renderExamples();
  $("#base-tabs").addEventListener("click", renderExamples);
  $("#base-tabs").addEventListener("keydown", () => setTimeout(renderExamples, 0));
  $("#history-list").addEventListener("click", () => setTimeout(renderExamples, 0));

  /* ---- keyboard hint ---- */
  const kb = mk("span", "kbd-hint");
  kb.innerHTML = "<kbd>/</kbd> focus · <kbd>Enter</kbd> convert";
  $(".actions").append(kb);

  /* ---- "Use as input": chain conversions from any result ---- */
  $$(".panel-head").forEach((h) => {
    const b = mk("button", "use");
    b.type = "button";
    b.textContent = "Use as input";
    b.disabled = true;
    b.setAttribute("aria-label", "Use this value as the new input");
    h.insertBefore(b, $(".copy", h));
  });
  const prevRenderResults = renderResults;
  renderResults = function () {
    prevRenderResults();
    $$(".use").forEach((b) => (b.disabled = false));
  };
  $("#result-grid").addEventListener("click", (e) => {
    const b = e.target.closest(".use");
    if (!b || b.disabled) return;
    const p = b.closest(".panel");
    const pb = +p.dataset.base;
    setBase(pb);
    input.value = p.dataset.raw;
    renderExamples();
    $("#converter").scrollIntoView();
    setTimeout(() => input.focus({ preventScroll: true }), 450);
    statusEl.textContent = `${BASES[pb].name} value placed in the input. Press Convert.`;
  });
})();

