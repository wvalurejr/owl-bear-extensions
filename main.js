import OBR, { buildPath, buildText, Command } from "https://esm.sh/@owlbear-rodeo/sdk@3";

// Token-scoped sheet (per token); room-scoped luck + rules (shared by the table).
const SHEET_KEY = "com.wvalurejr.hardcore5e/sheet";
const LUCK_KEY = "com.wvalurejr.hardcore5e/fleetingLuck";
const RULES_KEY = "com.wvalurejr.hardcore5e/rules";
const BADGE_SUFFIX = "/hc-badge";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

// Classic (2014) exhaustion effects — hardcore play leans on these.
const EXHAUSTION = [
  "",
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attack rolls & saving throws",
  "Hit point maximum halved",
  "Speed reduced to 0",
  "Death",
];

// The configurable hardcore rules, with the text shown in the Rules panel.
const RULE_INFO = [
  { key: "massiveDamage", type: "toggle", title: "Massive-Damage Instant Death",
    desc: "A hit that drops a creature to 0 HP with leftover damage ≥ its HP maximum kills outright." },
  { key: "permadeath", type: "toggle", title: "Permanent Death",
    desc: "Death can only be undone by a GM Override. Turn off to allow the dead to be healed/revived normally." },
  { key: "damageAtZeroAutoFail", type: "toggle", title: "Hits While Down Auto-Fail",
    desc: "Taking any damage at 0 HP is an automatic failed death save." },
  { key: "exhaustionDeath", type: "toggle", title: "Exhaustion Is Lethal",
    desc: "Reaching exhaustion level 6 means death." },
  { key: "fleetingLuck", type: "toggle", title: "Fleeting Luck",
    desc: "A shared, volatile luck pool: gain on a Nat 20, spend to reroll, and a Nat 1 wipes the whole table." },
  { key: "deathSaveSuccesses", type: "number", title: "Successes to Stabilise", min: 1, max: 9,
    desc: "Successful death saves needed to become stable." },
  { key: "deathSaveFailures", type: "number", title: "Failures to Die", min: 1, max: 9,
    desc: "Failed death saves before death." },
];

// ---- State -----------------------------------------------------------------

let currentTokenId = null;
let currentTokenName = "Token";
let model = defaultSheet();

let luck = { count: 0 };
let lastLuckEventT = 0;

let rules = defaultRules();

let myName = "Someone";
let myRole = "PLAYER";

function defaultSheet() {
  return {
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    profBonus: 2, ac: 10, speed: 30,
    hp: { cur: 10, max: 10, temp: 0 },
    deathSaves: { successes: 0, failures: 0 },
    exhaustion: 0,
    status: "ALIVE", // ALIVE | DYING | STABLE | DEAD
  };
}

function defaultRules() {
  return {
    massiveDamage: true,
    permadeath: true,
    damageAtZeroAutoFail: true,
    exhaustionDeath: true,
    fleetingLuck: true,
    deathSaveSuccesses: 3,
    deathSaveFailures: 3,
  };
}

function normalize(data) {
  const d = defaultSheet();
  return {
    abilities: { ...d.abilities, ...(data.abilities ?? {}) },
    profBonus: num(data.profBonus, d.profBonus),
    ac: num(data.ac, d.ac),
    speed: num(data.speed, d.speed),
    hp: { ...d.hp, ...(data.hp ?? {}) },
    deathSaves: { ...d.deathSaves, ...(data.deathSaves ?? {}) },
    exhaustion: num(data.exhaustion, 0),
    status: data.status ?? "ALIVE",
  };
}

function normalizeRules(data) {
  const d = defaultRules();
  const clamp = (v, def, lo, hi) => Math.max(lo, Math.min(hi, num(v, def)));
  return {
    massiveDamage: bool(data.massiveDamage, d.massiveDamage),
    permadeath: bool(data.permadeath, d.permadeath),
    damageAtZeroAutoFail: bool(data.damageAtZeroAutoFail, d.damageAtZeroAutoFail),
    exhaustionDeath: bool(data.exhaustionDeath, d.exhaustionDeath),
    fleetingLuck: bool(data.fleetingLuck, d.fleetingLuck),
    deathSaveSuccesses: clamp(data.deathSaveSuccesses, 3, 1, 9),
    deathSaveFailures: clamp(data.deathSaveFailures, 3, 1, 9),
  };
}

const num = (v, fallback = 0) => (Number.isFinite(+v) ? +v : fallback);
const bool = (v, fallback) => (typeof v === "boolean" ? v : fallback);
const mod = (score) => Math.floor((num(score, 10) - 10) / 2);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---- Boot ------------------------------------------------------------------

// Build the static UI and wire buttons immediately. This runs even when the
// page is opened directly in a browser (outside Owlbear), so the layout and the
// Rules panel can be previewed — though OBR-backed features stay inert until the
// SDK connects. (This module is deferred, so the DOM is ready here.)
buildAbilityInputs();
buildExhaustionPips();
buildRulesPanel();
renderRulesPanel();
renderLuck();
bindEvents();

// Everything that actually talks to Owlbear waits for the SDK handshake, which
// only happens when the page is loaded as an extension inside Owlbear.
OBR.onReady(async () => {
  myName = await OBR.player.getName().catch(() => "Someone");
  myRole = await OBR.player.getRole().catch(() => "PLAYER");

  await initRoom();
  OBR.room.onMetadataChange(onRoomMetadata);

  await refreshSelection();
  OBR.player.onChange(onPlayerChange);
  OBR.scene.items.onChange(onSceneChange);
});

function buildAbilityInputs() {
  document.getElementById("abilities").innerHTML = ABILITIES.map(
    (a) => `
      <div class="ability">
        <div class="name">${a.toUpperCase()}</div>
        <div class="mod" id="${a}-mod">+0</div>
        <input id="${a}" type="number" />
      </div>`
  ).join("");
}

function buildExhaustionPips() {
  document.getElementById("exh-pips").innerHTML = Array.from(
    { length: 6 },
    (_, i) => `<div class="exh-pip" data-i="${i}"></div>`
  ).join("");
}

// ---- Room metadata: luck + rules -------------------------------------------

async function initRoom() {
  const md = (await OBR.room.getMetadata()) ?? {};
  if (md[LUCK_KEY]) {
    luck = { count: num(md[LUCK_KEY].count) };
    lastLuckEventT = md[LUCK_KEY].event?.t ?? 0;
  }
  rules = normalizeRules(md[RULES_KEY] ?? {});
  renderLuck();
  renderRulesPanel();
}

function onRoomMetadata(md) {
  const l = md[LUCK_KEY];
  if (l) {
    luck = { count: num(l.count) };
    renderLuck();
    if (l.event && l.event.t > lastLuckEventT) {
      lastLuckEventT = l.event.t;
      showLuckToast(l.event, luck.count);
    }
  }
  rules = normalizeRules(md[RULES_KEY] ?? {});
  renderRulesPanel();
  if (currentTokenId) render();
}

async function onPlayerChange() {
  myName = await OBR.player.getName().catch(() => myName);
  myRole = await OBR.player.getRole().catch(() => myRole);
  renderRulesPanel();
  await refreshSelection();
}

// ---- Selection / scene sync ------------------------------------------------

async function refreshSelection() {
  const sel = await OBR.player.getSelection();
  let token = null;
  if (sel && sel.length) {
    const items = await OBR.scene.items.getItems(sel);
    token = items.find((i) => i.layer === "CHARACTER" || i.layer === "MOUNT") || null;
  }

  if (!token) {
    currentTokenId = null;
    showEmpty();
    return;
  }

  currentTokenId = token.id;
  currentTokenName = token.name || token.text?.plainText || "Token";
  model = token.metadata[SHEET_KEY] ? normalize(token.metadata[SHEET_KEY]) : defaultSheet();
  showSheet();
  render();
}

function onSceneChange(items) {
  if (!currentTokenId) return;
  const token = items.find((i) => i.id === currentTokenId);
  if (!token) {
    currentTokenId = null;
    showEmpty();
    return;
  }
  const incoming = token.metadata[SHEET_KEY];
  if (incoming && !isEditing() && JSON.stringify(normalize(incoming)) !== JSON.stringify(model)) {
    model = normalize(incoming);
    render();
  }
}

const isEditing = () => {
  const el = document.activeElement;
  return el && el.tagName === "INPUT" && el.closest("#sheet");
};

function showEmpty() {
  document.getElementById("empty").classList.remove("hidden");
  document.getElementById("sheet").classList.add("hidden");
}
function showSheet() {
  document.getElementById("empty").classList.add("hidden");
  document.getElementById("sheet").classList.remove("hidden");
}

// ---- Persistence -----------------------------------------------------------

async function save() {
  if (!currentTokenId) return;
  const snapshot = JSON.parse(JSON.stringify(model));
  await OBR.scene.items.updateItems([currentTokenId], (items) => {
    for (const it of items) it.metadata[SHEET_KEY] = snapshot;
  });
  upsertBadge().catch((e) => console.warn("badge update failed", e));
}

// ---- Rendering: sheet ------------------------------------------------------

function render() {
  const s = model;

  document.getElementById("token-name").textContent = currentTokenName;

  for (const a of ABILITIES) {
    document.getElementById(a).value = s.abilities[a];
    document.getElementById(`${a}-mod`).textContent = signed(mod(s.abilities[a]));
  }

  document.getElementById("ac").value = s.ac;
  document.getElementById("speed").value = s.speed;
  document.getElementById("prof").value = s.profBonus;
  document.getElementById("init").textContent = signed(mod(s.abilities.dex));

  document.getElementById("hp-cur").textContent = s.hp.cur;
  document.getElementById("hp-max-label").textContent = `/ ${s.hp.max}`;
  document.getElementById("hp-temp-label").textContent = s.hp.temp > 0 ? `+${s.hp.temp} temp` : "";
  document.getElementById("hp-max").value = s.hp.max;
  document.getElementById("hp-temp").value = s.hp.temp;
  const pct = s.hp.max > 0 ? Math.max(0, Math.min(1, s.hp.cur / s.hp.max)) * 100 : 0;
  document.getElementById("hp-fill").style.width = `${pct}%`;

  document.getElementById("death").classList.toggle("show", s.hp.cur === 0 && s.status !== "DEAD");
  renderPips("succ", s.deathSaves.successes, rules.deathSaveSuccesses);
  renderPips("fail", s.deathSaves.failures, rules.deathSaveFailures);

  document.querySelectorAll(".exh-pip").forEach((pip) => {
    const i = +pip.dataset.i;
    pip.classList.toggle("on", i < s.exhaustion);
    pip.classList.toggle("death", i === 5 && s.exhaustion >= 6 && rules.exhaustionDeath);
  });
  document.getElementById("exh-effect").textContent =
    s.exhaustion > 0 ? `Lvl ${s.exhaustion}: ${EXHAUSTION[s.exhaustion]}` : "Not exhausted";

  const pill = document.getElementById("status-pill");
  pill.textContent = { ALIVE: "Alive", DYING: "Dying", STABLE: "Stable", DEAD: "Dead" }[s.status];
  pill.className = `st-${s.status.toLowerCase()}`;
  document.getElementById("revive").classList.toggle("show", s.status === "DEAD");
}

// Death-save pips are rebuilt each render because the thresholds are configurable.
function renderPips(kind, count, total) {
  const root = document.getElementById(`${kind}-pips`);
  root.innerHTML = Array.from({ length: total }, (_, i) =>
    `<div class="pip ${i < count ? `on-${kind}` : ""}"></div>`
  ).join("");
}

// ---- Rendering: rules panel ------------------------------------------------

function buildRulesPanel() {
  const list = document.getElementById("rules-list");
  list.innerHTML = RULE_INFO.map((r) => {
    const control =
      r.type === "toggle"
        ? `<label class="switch"><input type="checkbox" id="rule-${r.key}" /><span class="track"></span></label>`
        : `<input type="number" id="rule-${r.key}" min="${r.min}" max="${r.max}" />`;
    return `
      <div class="rule-row">
        <div class="r-head"><span class="r-title">${r.title}</span>${control}</div>
        <div class="r-desc">${r.desc}</div>
      </div>`;
  }).join("");

  for (const r of RULE_INFO) {
    const el = document.getElementById(`rule-${r.key}`);
    el.addEventListener("change", () => {
      if (myRole !== "GM") return;
      rules[r.key] =
        r.type === "toggle"
          ? el.checked
          : Math.max(r.min, Math.min(r.max, num(el.value, rules[r.key])));
      saveRules();
    });
  }
}

function renderRulesPanel() {
  const isGM = myRole === "GM";
  for (const r of RULE_INFO) {
    const el = document.getElementById(`rule-${r.key}`);
    if (!el) continue;
    if (r.type === "toggle") el.checked = !!rules[r.key];
    else el.value = rules[r.key];
    el.disabled = !isGM;
  }
  document.getElementById("rules-note").textContent = isGM
    ? "You're the GM — changes here apply to the whole table immediately."
    : "These are the rules your GM has set. Only the GM can change them.";
  // Hide the luck bar entirely when the rule is switched off.
  document.getElementById("luck").style.display = rules.fleetingLuck ? "" : "none";
}

async function saveRules() {
  await OBR.room.setMetadata({ [RULES_KEY]: { ...rules } });
}

// ---- Hardcore 5e rules (read the configurable `rules`) ---------------------

function setDead(reason) {
  model.status = "DEAD";
  model.hp.cur = 0;
  model.hp.temp = 0;
  OBR.notification.show(`☠️ ${currentTokenName} has died — ${reason}.`, "ERROR");
}

function applyDamage(amount) {
  amount = Math.max(0, num(amount));
  if (amount === 0 || model.status === "DEAD") return;
  const s = model;

  const soaked = Math.min(s.hp.temp, amount);
  s.hp.temp -= soaked;
  let dmg = amount - soaked;
  if (dmg <= 0) return;

  if (s.hp.cur > 0) {
    const overflow = dmg - s.hp.cur;
    s.hp.cur = Math.max(0, s.hp.cur - dmg);
    if (s.hp.cur === 0) {
      if (rules.massiveDamage && overflow >= s.hp.max) return setDead("massive damage");
      s.status = "DYING";
    }
  } else {
    if (rules.massiveDamage && amount >= s.hp.max) return setDead("massive damage");
    if (rules.damageAtZeroAutoFail) {
      s.deathSaves.failures += 1;
      if (s.deathSaves.failures >= rules.deathSaveFailures) return setDead("failed death saves");
    }
  }
}

function applyHeal(amount) {
  amount = Math.max(0, num(amount));
  if (amount === 0) return;
  if (model.status === "DEAD" && rules.permadeath) {
    OBR.notification.show("Hardcore: the dead can't be healed. Use GM Override.", "WARNING");
    return;
  }
  const s = model;
  if (s.hp.cur === 0 || s.status === "DEAD") {
    s.status = "ALIVE";
    s.deathSaves = { successes: 0, failures: 0 };
  }
  s.hp.cur = Math.min(s.hp.max, s.hp.cur + amount);
}

function deathSave(kind) {
  const s = model;
  if (s.status === "DEAD") return;
  if (kind === "success") {
    s.deathSaves.successes = Math.min(rules.deathSaveSuccesses, s.deathSaves.successes + 1);
    if (s.deathSaves.successes >= rules.deathSaveSuccesses) s.status = "STABLE";
  } else if (kind === "fail") {
    s.deathSaves.failures += 1;
    if (s.deathSaves.failures >= rules.deathSaveFailures) setDead("failed death saves");
  } else if (kind === "nat20") {
    applyHeal(1);
    gainLuck(); // a natural 20!
  } else if (kind === "nat1") {
    s.deathSaves.failures += 2;
    if (s.deathSaves.failures >= rules.deathSaveFailures) setDead("failed death saves");
    wipeLuck(); // a natural 1 wipes the table's luck
  }
}

function changeExhaustion(delta) {
  const s = model;
  s.exhaustion = Math.max(0, Math.min(6, s.exhaustion + delta));
  if (s.exhaustion >= 6 && rules.exhaustionDeath && s.status !== "DEAD") setDead("exhaustion level 6");
}

function revive() {
  if (rules.permadeath && !confirm(`GM Override: bring ${currentTokenName} back at 1 HP?`)) return;
  model.status = "ALIVE";
  model.hp.cur = 1;
  model.deathSaves = { successes: 0, failures: 0 };
  model.exhaustion = Math.min(model.exhaustion, 5);
}

// ---- Fleeting Luck (room-wide) ---------------------------------------------

function renderLuck() {
  document.getElementById("luck-count").textContent = luck.count;
  document.getElementById("luck-spend").disabled = luck.count <= 0;
}

async function setLuck(count, type) {
  count = Math.max(0, count);
  // Update locally first so the count moves instantly (and so it still responds
  // when previewing the page outside Owlbear). The room broadcast confirms it.
  luck = { count };
  renderLuck();
  const event = { type, by: myName, t: Date.now() };
  try {
    await OBR.room.setMetadata({ [LUCK_KEY]: { count, event } });
  } catch (e) {
    console.warn("Fleeting Luck save failed (running outside Owlbear?)", e);
  }
}

function gainLuck() {
  if (!rules.fleetingLuck) return;
  setLuck(luck.count + 1, "gain");
}
function spendLuck() {
  if (!rules.fleetingLuck || luck.count <= 0) return;
  setLuck(luck.count - 1, "spend");
}
function wipeLuck() {
  if (!rules.fleetingLuck) return;
  setLuck(0, "wipe");
}

function showLuckToast(event, count) {
  const who = event.by || "Someone";
  if (event.type === "gain") OBR.notification.show(`✦ ${who} gained Fleeting Luck (now ${count}).`, "SUCCESS");
  else if (event.type === "spend") OBR.notification.show(`✦ ${who} spent Fleeting Luck (${count} left).`, "INFO");
  else if (event.type === "wipe") OBR.notification.show(`💀 Natural 1! All Fleeting Luck is lost.`, "ERROR");
}

// ---- Event wiring ----------------------------------------------------------

function commit() {
  render();
  save();
}

function bindEvents() {
  for (const a of ABILITIES) {
    document.getElementById(a).addEventListener("change", (e) => {
      model.abilities[a] = num(e.target.value, 10);
      commit();
    });
  }
  const bindNum = (id, set) =>
    document.getElementById(id).addEventListener("change", (e) => {
      set(num(e.target.value));
      commit();
    });
  bindNum("ac", (v) => (model.ac = v));
  bindNum("speed", (v) => (model.speed = v));
  bindNum("prof", (v) => (model.profBonus = v));
  bindNum("hp-max", (v) => (model.hp.max = Math.max(0, v)));
  bindNum("hp-temp", (v) => (model.hp.temp = Math.max(0, v)));

  const dmgAmt = () => num(document.getElementById("dmg-amt").value);
  document.getElementById("btn-damage").addEventListener("click", () => { applyDamage(dmgAmt()); commit(); });
  document.getElementById("btn-heal").addEventListener("click", () => { applyHeal(dmgAmt()); commit(); });

  document.getElementById("ds-success").addEventListener("click", () => { deathSave("success"); commit(); });
  document.getElementById("ds-fail").addEventListener("click", () => { deathSave("fail"); commit(); });
  document.getElementById("ds-nat20").addEventListener("click", () => { deathSave("nat20"); commit(); });
  document.getElementById("ds-nat1").addEventListener("click", () => { deathSave("nat1"); commit(); });

  document.getElementById("exh-minus").addEventListener("click", () => { changeExhaustion(-1); commit(); });
  document.getElementById("exh-plus").addEventListener("click", () => { changeExhaustion(1); commit(); });

  document.getElementById("revive").addEventListener("click", () => { revive(); commit(); });

  // Fleeting Luck controls
  document.getElementById("luck-gain").addEventListener("click", gainLuck);
  document.getElementById("luck-spend").addEventListener("click", spendLuck);
  document.getElementById("luck-wipe").addEventListener("click", wipeLuck);

  // Rules panel open/close
  document.getElementById("open-rules").addEventListener("click", () =>
    document.getElementById("rules-panel").classList.remove("hidden"));
  document.getElementById("close-rules").addEventListener("click", () =>
    document.getElementById("rules-panel").classList.add("hidden"));

  document.getElementById("draw-graffiti").addEventListener("click", drawGraffiti);
}

// ---- On-map HP badge (attached to the token) -------------------------------

async function upsertBadge() {
  if (!currentTokenId) return;
  const s = model;
  const [token] = await OBR.scene.items.getItems([currentTokenId]);
  if (!token) return;
  const dpi = await OBR.scene.grid.getDpi();

  const icon = s.status === "DEAD" ? "💀 " : s.status === "DYING" ? "❗ " : "";
  const exh = s.exhaustion > 0 ? ` ⚠${s.exhaustion}` : "";
  const label = `${icon}${s.hp.cur}/${s.hp.max}${exh}`;
  const color = s.status === "DEAD" ? "#e0453c" : s.hp.cur === 0 ? "#d9b25f" : "#ffffff";

  const id = currentTokenId + BADGE_SUFFIX;
  const [existing] = await OBR.scene.items.getItems([id]);

  if (existing) {
    await OBR.scene.items.updateItems([id], (items) => {
      for (const it of items) {
        if (it.text) it.text.plainText = label;
        if (it.text?.style) it.text.style.fillColor = color;
      }
    });
    return;
  }

  const badge = buildText()
    .id(id)
    .attachedTo(currentTokenId)
    .position({ x: token.position.x, y: token.position.y + dpi * 0.55 })
    .plainText(label)
    .fontSize(dpi * 0.22)
    .fillColor(color)
    .strokeColor("#000000")
    .strokeWidth(dpi * 0.02)
    .layer("TEXT")
    .disableHit(true)
    .locked(true)
    .build();

  await OBR.scene.items.addItems([badge]);
}

// ---- Graffiti (unchanged) --------------------------------------------------

const GRAFFITI_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f1c40f", "#e67e22"];

function circleCommands(cx, cy, r) {
  const k = r * 0.5522847498307936;
  return [
    [Command.MOVE, cx + r, cy],
    [Command.CUBIC, cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    [Command.CUBIC, cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    [Command.CUBIC, cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    [Command.CUBIC, cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    [Command.CLOSE],
  ];
}

async function drawGraffiti() {
  if (!(await OBR.scene.isReady())) {
    OBR.notification.show("Open a scene first, then try again.", "WARNING");
    return;
  }

  const [vw, vh, scale, pos, dpi] = await Promise.all([
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
    OBR.viewport.getScale(),
    OBR.viewport.getPosition(),
    OBR.scene.grid.getDpi(),
  ]);

  const viewCenter = { x: (vw / 2 - pos.x) / scale, y: (vh / 2 - pos.y) / scale };
  const target = {
    x: viewCenter.x + (Math.random() - 0.5) * 4 * dpi,
    y: viewCenter.y + (Math.random() - 0.5) * 4 * dpi,
  };

  const u = dpi;
  const hw = 0.13 * u, y0 = 0.45 * u, yTop = -0.45 * u, dome = -0.82 * u;
  const r = 0.23 * u, bx = 0.24 * u, by = 0.5 * u;

  const commands = [
    [Command.MOVE, -hw, y0],
    [Command.LINE, -hw, yTop],
    [Command.CUBIC, -hw, dome, hw, dome, hw, yTop],
    [Command.LINE, hw, y0],
    [Command.CLOSE],
    ...circleCommands(-bx, by, r),
    ...circleCommands(bx, by, r),
  ];

  const color = GRAFFITI_COLORS[Math.floor(Math.random() * GRAFFITI_COLORS.length)];

  const item = buildPath()
    .commands(commands)
    .position(target)
    .rotation(Math.random() * 360)
    .fillColor(color)
    .fillOpacity(1)
    .fillRule("nonzero")
    .strokeColor("#1a1a1a")
    .strokeWidth(Math.max(2, 0.03 * u))
    .strokeOpacity(1)
    .layer("DRAWING")
    .name("Graffiti")
    .build();

  await OBR.scene.items.addItems([item]);
}
