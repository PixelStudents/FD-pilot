// ===============================
// FORM 1: CHECK-IN (your existing working form)
// ===============================
const FORM_CHECKIN_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfSO6_C_mIWA1G1OHuCwPIaOn_srffgsm6XmM8Y2SKKwhGyBA/formResponse";

const CHECKIN_ENTRY = {
  timestamp_utc: "entry.1572758946",
  session_id: "entry.1944994785",
  alias_hash: "entry.1791040349",
  app_version: "entry.1171626104",
  device_info: "entry.556106516",
  session_number_today: "entry.187344393",
  is_first_session_today: "entry.1633018053",
  sleep_hours: "entry.1121567346",
  shift_length_hours: "entry.978814771",
  hours_into_shift: "entry.1639077315",
  caffeine_level: "entry.563674604",
  fatigue_scale: "entry.1736915856",
  motivation_scale: "entry.884871826",
  symptoms: "entry.1133216744",
  age: "entry.1773262357"
};

// ===============================
// FORM 2: GAME RESULTS (your new form mapping)
// Included now; we’ll submit once all games exist.
// ===============================
const FORM_RESULTS_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSeL7efoV0n5cBJeJlM_sMfOufITpQcFirPkzAwC7-7uSmmoyA/formResponse";

const RESULTS_ENTRY = {
  timestamp_utc: "entry.474040265",
  session_id: "entry.678239311",
  alias_hash: "entry.567749104",
  app_version: "entry.81590406",

  sdmt_correct: "entry.740812054",
  sdmt_incorrect: "entry.136926342",
  sdmt_score_0_100: "entry.1439510000",

  nback_hits: "entry.557094512",
  nback_misses: "entry.1417958972",
  nback_false_alarms: "entry.1104830090",
  nback_score_0_100: "entry.2143341535",

  stroop_correct: "entry.1349594133",
  stroop_incorrect: "entry.351916292",
  stroop_median_rt_ms: "entry.430287127",
  stroop_score_0_100: "entry.1928939925",

  pvt_median_rt_ms: "entry.788283783",
  pvt_lapses: "entry.1056650105",
  pvt_false_starts: "entry.1994575411",
  pvt_score_0_100: "entry.461582704",

  overall_score_0_100: "entry.1796082506",
  overall_band: "entry.134879237",
  advice_text: "entry.447359756"
};

let CONFIG = null;

// --------------------
// Helpers
// --------------------
async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-store" });
  CONFIG = await res.json();
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function normalizeAlias(raw) {
  return (raw || "").trim().toUpperCase();
}

function isValidAliasFormat(alias) {
  if (!alias || alias.length !== 4) return false;
  const chars = alias.split("");
  const letters = chars.filter((c) => /[A-Z]/.test(c)).length;
  const digits = chars.filter((c) => /[0-9]/.test(c)).length;
  return letters === 2 && digits === 2;
}

function isAllowedAlias(alias) {
  const list = CONFIG?.ALLOWED_ALIASES || [];
  return list.includes(alias);
}

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowMs() {
  return Date.now();
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function deviceInfo() {
  return navigator.userAgent;
}

function uuidv4() {
  return crypto.randomUUID();
}

function selectedSymptoms() {
  return Array.from(document.querySelectorAll(".symptom:checked")).map((x) => x.value);
}

// --------------------
// Local storage helpers
// --------------------
function getTodayKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function getSessionCountToday(aliasHash) {
  return Number(localStorage.getItem(`sessions_${aliasHash}_${getTodayKeyUTC()}`) || "0");
}

function incrementSessionCountToday(aliasHash) {
  const key = `sessions_${aliasHash}_${getTodayKeyUTC()}`;
  const n = getSessionCountToday(aliasHash) + 1;
  localStorage.setItem(key, String(n));
  return n;
}

function getCooldownUntilMs(aliasHash) {
  const v = localStorage.getItem(`cooldown_until_${aliasHash}`);
  return v ? Number(v) : 0;
}

function setCooldownUntilMs(aliasHash, untilMs) {
  localStorage.setItem(`cooldown_until_${aliasHash}`, String(untilMs));
}

function cacheAgeIfProvided(aliasHash, ageVal) {
  if (!ageVal) return;
  localStorage.setItem(`age_${aliasHash}`, String(ageVal));
}

function getCachedAge(aliasHash) {
  const v = localStorage.getItem(`age_${aliasHash}`);
  return v ? Number(v) : null;
}

// --------------------
// Google Form submit via hidden iframe form
// (avoids CORS / fetch failures)
// --------------------
function submitHiddenForm(url, fields) {
  let iframe = document.getElementById("gf_hidden_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "gf_hidden_iframe";
    iframe.name = "gf_hidden_iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }

  const form = document.createElement("form");
  form.action = url;
  form.method = "POST";
  form.target = "gf_hidden_iframe";
  form.style.display = "none";

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

// ===============================
// Session state
// ===============================
let SESSION = {
  alias: "",
  aliasHash: "",
  sessionId: "",
  sessionNumberToday: 0,
  isFirstToday: false
};

// Results for this run (we’ll submit later once all games implemented)
let GAME_RESULTS = {
  sdmt: null,
  nback: null,
  stroop: null,
  pvt: null
};

// ===============================
// Flow
// ===============================
const FLOW = [
  {
    key: "sdmt",
    title: "SDMT",
    text: "Match the symbol to the correct number as quickly and accurately as you can."
  },
  {
    key: "nback",
    title: "2-back",
    text: "Decide whether the current item matches the one from 2 steps ago. Respond YES/NO."
  },
  {
    key: "stroop",
    title: "Stroop",
    text: "Select the colour of the text (ignore what the word says)."
  },
  {
    key: "pvt",
    title: "PVT",
    text: "Press as soon as the stimulus appears. Avoid false starts."
  }
];

let flowIndex = 0;

// ===============================
// SDMT Game (60s)
// ===============================
function runSDMT({ durationSec = 60, onDone }) {
  // Fixed symbols each time
  const SYMBOLS = ["▭", "◯", "∧", "⊕", "≡", "⇔", "◄", "∴", "Ψ"];

  // Randomise digit mapping each run (prevents learning)
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }

  const mapSymbolToDigit = new Map();
  SYMBOLS.forEach((sym, idx) => mapSymbolToDigit.set(sym, digits[idx]));

  // Metrics
  let correct = 0;
  let incorrect = 0;
  let trials = 0;

  let currentSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];

  hide("explainSection");
  show("gameSection");

  const gameTitle = document.getElementById("gameTitle");
  const gameUI = document.getElementById("gameUI");
  const timerEl = document.getElementById("gameTimer");

  gameTitle.textContent = "Symbol Digit Modality Test (SDMT)";

  const mappingSymbolsRow = SYMBOLS.map((s) => `<span style="margin:0 8px;">${s}</span>`).join("");
  const mappingDigitsRow = SYMBOLS.map((s) => `<span style="margin:0 10px;">${mapSymbolToDigit.get(s)}</span>`).join("");

  gameUI.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:28px; line-height:1.2; margin-top:6px;">
        ${mappingSymbolsRow}
      </div>
      <div style="font-size:22px; margin-top:8px; opacity:0.95;">
        ${mappingDigitsRow}
      </div>
    </div>

    <div style="display:flex; justify-content:center; align-items:center; height:190px; margin-top:16px;">
      <div id="sdmtTarget" style="font-size:92px; font-weight:700;">${currentSymbol}</div>
    </div>

    <div id="sdmtFeedback" class="hint" style="text-align:center; min-height:22px;"></div>

    <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-top:14px;">
      ${[1,2,3,4,5,6,7,8,9]
        .map(
          (n) =>
            `<button class="sdmtBtn" data-n="${n}" style="width:64px; height:46px;">${n}</button>`
        )
        .join("")}
    </div>

    <div class="hint" style="text-align:center; margin-top:14px;">
      Correct: <b id="sdmtCorrect">${correct}</b> &nbsp; | &nbsp; Incorrect: <b id="sdmtIncorrect">${incorrect}</b>
    </div>
  `;

  const targetEl = document.getElementById("sdmtTarget");
  const feedbackEl = document.getElementById("sdmtFeedback");
  const correctEl = document.getElementById("sdmtCorrect");
  const incorrectEl = document.getElementById("sdmtIncorrect");

  const startMs = Date.now();
  let ended = false;

  function updateTimer() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(durationSec - elapsed));
    timerEl.textContent = String(remaining);
    if (remaining <= 0 && !ended) finish();
  }
  const timerInt = setInterval(updateTimer, 200);
  updateTimer();

  function nextTrial() {
    trials++;
    currentSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    targetEl.textContent = currentSymbol;
  }

  function handleAnswer(n) {
    if (ended) return;

    const correctDigit = mapSymbolToDigit.get(currentSymbol);
    if (n === correctDigit) {
      correct++;
      feedbackEl.textContent = "✓ Correct";
    } else {
      incorrect++;
      feedbackEl.textContent = `✗ Incorrect (was ${correctDigit})`;
    }
    correctEl.textContent = String(correct);
    incorrectEl.textContent = String(incorrect);

    nextTrial();
  }

  // Buttons
  Array.from(gameUI.querySelectorAll(".sdmtBtn")).forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(Number(btn.dataset.n)));
  });

  // Optional keyboard 1–9
  function keyHandler(e) {
    if (/^[1-9]$/.test(e.key)) handleAnswer(Number(e.key));
  }
  window.addEventListener("keydown", keyHandler);

  function finish() {
    ended = true;
    clearInterval(timerInt);
    window.removeEventListener("keydown", keyHandler);

    // Score (simple + robust for 60s)
    // Reward correct, small penalty for incorrect, scaled to 0–100.
    const raw = Math.max(0, correct - 0.25 * incorrect);
    const score = Math.max(0, Math.min(100, Math.round((raw / 60) * 100)));

    onDone?.({
      correct,
      incorrect,
      trials,
      score_0_100: score
    });
  }
}

// ===============================
// UI helpers
// ===============================
function showExplanation(i) {
  hide("startSection");
  hide("gameSection");
  hide("resultsSection");
  show("explainSection");

  const step = FLOW[i];
  document.getElementById("explainTitle").textContent = `${step.title} – Instructions`;
  document.getElementById("explainText").textContent = step.text;
}

function showResultsScreen() {
  hide("gameSection");
  hide("explainSection");
  hide("startSection");
  show("resultsSection");

  const sdmt = GAME_RESULTS.sdmt;

  document.getElementById("resultsSummary").innerHTML = `
    <p><b>Session complete (SDMT implemented, others pending).</b></p>
    <p><b>SDMT</b></p>
    <ul>
      <li>Correct: <b>${sdmt ? sdmt.correct : "-"}</b></li>
      <li>Incorrect: <b>${sdmt ? sdmt.incorrect : "-"}</b></li>
      <li>Score (0–100): <b>${sdmt ? sdmt.score_0_100 : "-"}</b></li>
    </ul>
    <p class="hint">Next step: implement 2-back, Stroop and PVT, then submit full results to the Game Results form.</p>
    <p class="hint">Session ID: ${SESSION.sessionId}</p>
  `;
}

// ===============================
// MAIN
// ===============================
async function main() {
  await loadConfig();

  // Elements
  const aliasInput = document.getElementById("aliasInput");
  const aliasBtn = document.getElementById("aliasBtn");
  const aliasError = document.getElementById("aliasError");

  const cooldownText = document.getElementById("cooldownText");
  const cooldownOverrideBtn = document.getElementById("cooldownOverrideBtn");
  const overrideMsg = document.getElementById("overrideMsg");

  const submitBtn = document.getElementById("submitCheckinBtn");
  const submitMsg = document.getElementById("submitMsg");

  const startBtn = document.getElementById("startSessionBtn");
  const beginTestBtn = document.getElementById("beginTestBtn");

  const finishBtn = document.getElementById("finishBtn");

  // Alias -> check cooldown -> checkin
  aliasBtn.addEventListener("click", async () => {
    aliasError.textContent = "";

    const alias = normalizeAlias(aliasInput.value);

    if (!isValidAliasFormat(alias)) {
      aliasError.textContent = "Invalid format. Must be 4 chars: 2 letters + 2 numbers (any order).";
      return;
    }
    if (!isAllowedAlias(alias)) {
      aliasError.textContent = "That code is not recognised.";
      return;
    }

    const salted = `${CONFIG.HASHING.salt}::${alias}`;
    const aliasHash = await sha256Hex(salted);

    SESSION.alias = alias;
    SESSION.aliasHash = aliasHash;

    // Prefill age if previously stored
    const cachedAge = getCachedAge(aliasHash);
    if (cachedAge) document.getElementById("age").value = cachedAge;

    // Cooldown check
    const until = getCooldownUntilMs(aliasHash);
    if (nowMs() < until) {
      hide("aliasSection");
      show("cooldownSection");

      const tick = () => {
        const left = until - nowMs();
        cooldownText.textContent = `Available in ${formatCountdown(left)}.`;
        if (left <= 0) {
          clearInterval(int);
          hide("cooldownSection");
          show("checkinSection");
        }
      };

      tick();
      const int = setInterval(tick, 500);
      return;
    }

    hide("aliasSection");
    show("checkinSection");
  });

  // Admin override
  cooldownOverrideBtn.addEventListener("click", () => {
    const pw = prompt("Admin password:");
    if (pw === "ADMIN123") {
      overrideMsg.textContent = "Override enabled.";
      hide("cooldownSection");
      show("checkinSection");
    } else {
      overrideMsg.textContent = "Incorrect password.";
    }
  });

  // Submit check-in -> Start screen
  submitBtn.addEventListener("click", () => {
    submitMsg.textContent = "";
    submitBtn.disabled = true;

    const sleep_hours = Number(document.getElementById("sleepHours").value || "");
    const shift_length_hours = Number(document.getElementById("shiftLen").value || "");
    const hours_into_shift = Number(document.getElementById("hoursInto").value || "");
    const caffeine_level = document.getElementById("caffeine").value || "";
    const fatigue_scale = Number(document.getElementById("fatigue").value || "");
    const motivation_scale = Number(document.getElementById("motivation").value || "");
    const age = Number(document.getElementById("age").value || "");

    if (age) cacheAgeIfProvided(SESSION.aliasHash, age);

    SESSION.sessionId = uuidv4();
    SESSION.sessionNumberToday = incrementSessionCountToday(SESSION.aliasHash);
    SESSION.isFirstToday = SESSION.sessionNumberToday === 1;

    const payload = {
      timestamp_utc: new Date().toISOString(),
      session_id: SESSION.sessionId,
      alias_hash: SESSION.aliasHash,
      app_version: CONFIG.APP_VERSION,
      device_info: deviceInfo(),
      session_number_today: SESSION.sessionNumberToday,
      is_first_session_today: SESSION.isFirstToday,
      checkin: {
        sleep_hours: Number.isFinite(sleep_hours) ? sleep_hours : "",
        shift_length_hours: Number.isFinite(shift_length_hours) ? shift_length_hours : "",
        hours_into_shift: Number.isFinite(hours_into_shift) ? hours_into_shift : "",
        caffeine_level,
        fatigue_scale: Number.isFinite(fatigue_scale) ? fatigue_scale : "",
        motivation_scale: Number.isFinite(motivation_scale) ? motivation_scale : "",
        symptoms: selectedSymptoms(),
        age: Number.isFinite(age) ? age : ""
      }
    };

    // Local backup
    localStorage.setItem(`session_${payload.session_id}`, JSON.stringify(payload));

    // Submit to check-in form
    submitHiddenForm(FORM_CHECKIN_URL, {
      [CHECKIN_ENTRY.timestamp_utc]: payload.timestamp_utc,
      [CHECKIN_ENTRY.session_id]: payload.session_id,
      [CHECKIN_ENTRY.alias_hash]: payload.alias_hash,
      [CHECKIN_ENTRY.app_version]: payload.app_version,
      [CHECKIN_ENTRY.device_info]: payload.device_info,
      [CHECKIN_ENTRY.session_number_today]: String(payload.session_number_today),
      [CHECKIN_ENTRY.is_first_session_today]: String(payload.is_first_session_today),

      [CHECKIN_ENTRY.sleep_hours]: String(payload.checkin.sleep_hours),
      [CHECKIN_ENTRY.shift_length_hours]: String(payload.checkin.shift_length_hours),
      [CHECKIN_ENTRY.hours_into_shift]: String(payload.checkin.hours_into_shift),
      [CHECKIN_ENTRY.caffeine_level]: String(payload.checkin.caffeine_level),
      [CHECKIN_ENTRY.fatigue_scale]: String(payload.checkin.fatigue_scale),
      [CHECKIN_ENTRY.motivation_scale]: String(payload.checkin.motivation_scale),
      [CHECKIN_ENTRY.symptoms]: (payload.checkin.symptoms || []).join("|"),
      [CHECKIN_ENTRY.age]: String(payload.checkin.age)
    });

    // Apply cooldown immediately
    setCooldownUntilMs(SESSION.aliasHash, nowMs() + CONFIG.COOLDOWN_HOURS * 3600 * 1000);

    // Reset game results
    GAME_RESULTS = { sdmt: null, nback: null, stroop: null, pvt: null };

    // Move to start
    submitMsg.textContent = "Saved. Continuing to tests…";
    submitBtn.disabled = false;

    hide("checkinSection");
    show("startSection");
  });

  // Start -> show SDMT explanation
  startBtn.addEventListener("click", () => {
    flowIndex = 0;
    showExplanation(flowIndex);
  });

  // Begin test -> run SDMT (others placeholder for now)
  beginTestBtn.addEventListener("click", () => {
    const step = FLOW[flowIndex];

    if (step.key === "sdmt") {
      runSDMT({
        durationSec: 60,
        onDone: (result) => {
          GAME_RESULTS.sdmt = result;

          // Next steps are placeholders for now.
          flowIndex++;
          if (flowIndex < FLOW.length) {
            showExplanation(flowIndex);
          } else {
            showResultsScreen();
          }
        }
      });
      return;
    }

    // Placeholder for other games (for now)
    hide("explainSection");
    show("gameSection");
    document.getElementById("gameTitle").textContent = step.title;
    document.getElementById("gameUI").innerHTML = `
      <p class="hint"><b>${step.title} not implemented yet.</b></p>
      <p class="hint">Next we’ll build this game exactly like SDMT (60s + scoring + saved to sheet).</p>
      <button id="nextStepBtn">Continue</button>
    `;

    document.getElementById("nextStepBtn").addEventListener("click", () => {
      flowIndex++;
      if (flowIndex < FLOW.length) {
        showExplanation(flowIndex);
      } else {
        showResultsScreen();
      }
    });
  });

  // Finish -> back to alias screen
  finishBtn.addEventListener("click", () => {
    hide("resultsSection");
    show("aliasSection");
    document.getElementById("aliasInput").value = "";
  });
}

main();
