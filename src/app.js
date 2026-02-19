// ===============================
// FORM 1: CHECK-IN
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
// FORM 2: GAME RESULTS
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
// Google Form submit via hidden iframe
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
    text: "A key at the top shows 9 symbols, each paired with a number. A symbol appears in the centre — press the matching number as fast as you can. You have 4 seconds per symbol before it counts as a miss."
  },
  {
    key: "nback",
    title: "2-Back",
    text: "Letters appear one at a time. Press YES if the letter matches the one shown 2 steps ago, or NO if it doesn't. Stay focused — it gets tricky!"
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
// FIX 1 + 2: SDMT Game
// — Table-aligned key so symbols & numbers line up
// — 4-second per-trial timeout counts as incorrect if no answer
// ===============================
function runSDMT({ durationSec = 60, trialTimeoutSec = 4, onDone }) {
  const SYMBOLS = ["▭", "◯", "∧", "⊕", "≡", "⇔", "◄", "∴", "Ψ"];

  // Shuffle digits so mapping changes each run
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }

  const mapSymbolToDigit = new Map();
  SYMBOLS.forEach((sym, idx) => mapSymbolToDigit.set(sym, digits[idx]));

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

  // FIX 1: Use a proper table for aligned key display
  const keyTableCells = SYMBOLS.map(
    (s) => `<td style="text-align:center; padding:4px 10px; font-size:26px; line-height:1;">${s}</td>`
  ).join("");
  const digitTableCells = SYMBOLS.map(
    (s) => `<td style="text-align:center; padding:4px 10px; font-size:20px; font-weight:700;">${mapSymbolToDigit.get(s)}</td>`
  ).join("");

  gameUI.innerHTML = `
    <div style="overflow-x:auto; text-align:center;">
      <table style="margin:0 auto; border-collapse:collapse; border:1px solid #ccc; border-radius:8px; overflow:hidden;">
        <tbody>
          <tr style="background:#f5f5f5;">${keyTableCells}</tr>
          <tr>${digitTableCells}</tr>
        </tbody>
      </table>
    </div>

    <div style="display:flex; justify-content:center; align-items:center; height:160px; margin-top:16px;">
      <div id="sdmtTarget" style="font-size:92px; font-weight:700;">${currentSymbol}</div>
    </div>

    <div style="text-align:center; margin-top:4px;">
      <span id="sdmtTrialTimer" style="font-size:18px; color:#e44; font-weight:700;"></span>
    </div>

    <div id="sdmtFeedback" style="text-align:center; min-height:22px; font-size:15px; margin-top:6px;"></div>

    <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-top:14px;">
      ${[1,2,3,4,5,6,7,8,9]
        .map((n) => `<button class="sdmtBtn" data-n="${n}" style="width:64px; height:46px; font-size:18px;">${n}</button>`)
        .join("")}
    </div>

    <div class="hint" style="text-align:center; margin-top:14px;">
      Correct: <b id="sdmtCorrect">0</b> &nbsp;|&nbsp; Incorrect: <b id="sdmtIncorrect">0</b>
    </div>
  `;

  const targetEl = document.getElementById("sdmtTarget");
  const feedbackEl = document.getElementById("sdmtFeedback");
  const correctEl = document.getElementById("sdmtCorrect");
  const incorrectEl = document.getElementById("sdmtIncorrect");
  const trialTimerEl = document.getElementById("sdmtTrialTimer");

  const startMs = Date.now();
  let ended = false;
  let trialStartMs = Date.now();
  let trialTimeoutHandle = null;

  // Overall game countdown
  function updateTimer() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(durationSec - elapsed));
    timerEl.textContent = String(remaining) + "s";
    if (remaining <= 0 && !ended) finish();
  }
  const timerInt = setInterval(updateTimer, 200);
  updateTimer();

  // FIX 2: Per-trial countdown display
  function updateTrialTimer() {
    if (ended) return;
    const elapsed = (Date.now() - trialStartMs) / 1000;
    const remaining = Math.max(0, trialTimeoutSec - elapsed);
    trialTimerEl.textContent = remaining.toFixed(1) + "s";
  }
  const trialTimerInt = setInterval(updateTrialTimer, 100);

  function startTrialTimeout() {
    clearTimeout(trialTimeoutHandle);
    trialStartMs = Date.now();
    trialTimeoutHandle = setTimeout(() => {
      if (ended) return;
      // Time's up for this trial — count as miss
      incorrect++;
      feedbackEl.textContent = `⏱ Too slow! (was ${mapSymbolToDigit.get(currentSymbol)})`;
      feedbackEl.style.color = "#c00";
      incorrectEl.textContent = String(incorrect);
      nextTrial();
    }, trialTimeoutSec * 1000);
  }

  function nextTrial() {
    trials++;
    currentSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    targetEl.textContent = currentSymbol;
    startTrialTimeout();
    // Clear feedback colour after short delay
    setTimeout(() => {
      if (!ended) feedbackEl.style.color = "";
    }, 600);
  }

  // Start first trial timeout
  startTrialTimeout();

  function handleAnswer(n) {
    if (ended) return;
    clearTimeout(trialTimeoutHandle);

    const correctDigit = mapSymbolToDigit.get(currentSymbol);
    if (n === correctDigit) {
      correct++;
      feedbackEl.textContent = "✓ Correct";
      feedbackEl.style.color = "#080";
    } else {
      incorrect++;
      feedbackEl.textContent = `✗ Incorrect (was ${correctDigit})`;
      feedbackEl.style.color = "#c00";
    }
    correctEl.textContent = String(correct);
    incorrectEl.textContent = String(incorrect);

    nextTrial();
  }

  Array.from(gameUI.querySelectorAll(".sdmtBtn")).forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(Number(btn.dataset.n)));
  });

  function keyHandler(e) {
    if (/^[1-9]$/.test(e.key)) handleAnswer(Number(e.key));
  }
  window.addEventListener("keydown", keyHandler);

  function finish() {
    ended = true;
    clearInterval(timerInt);
    clearInterval(trialTimerInt);
    clearTimeout(trialTimeoutHandle);
    window.removeEventListener("keydown", keyHandler);
    trialTimerEl.textContent = "";

    const raw = Math.max(0, correct - 0.25 * incorrect);
    const score = Math.max(0, Math.min(100, Math.round((raw / 60) * 100)));

    onDone?.({ correct, incorrect, trials, score_0_100: score });
  }
}

// ===============================
// FIX 4: 2-Back Game
// ===============================
function runNBack({ rounds = 25, nBack = 2, onDone }) {
  const LETTERS = "BCDFGHJKLMNPQRSTVWXYZ".split(""); // consonants only — easier to distinguish
  const DISPLAY_MS = 500;   // letter shown for 500ms
  const ISI_MS = 2000;      // inter-stimulus interval (blank)

  hide("explainSection");
  show("gameSection");

  const gameTitle = document.getElementById("gameTitle");
  const gameUI = document.getElementById("gameUI");
  const timerEl = document.getElementById("gameTimer");
  timerEl.textContent = "";

  gameTitle.textContent = "2-Back Task";

  gameUI.innerHTML = `
    <div style="text-align:center; margin-top:20px;">
      <p class="hint">Does this letter match the one from <b>2 steps ago</b>?</p>
      <div id="nbackStimulus" style="font-size:120px; font-weight:700; height:160px; line-height:160px; letter-spacing:2px;">
        &nbsp;
      </div>
      <div id="nbackFeedback" style="min-height:28px; font-size:16px; margin-top:8px;"></div>
      <div style="display:flex; justify-content:center; gap:24px; margin-top:20px;">
        <button id="nbackYes" style="width:110px; height:56px; font-size:20px; background:#1a73e8; color:#fff; border:none; border-radius:10px; cursor:pointer;">YES</button>
        <button id="nbackNo"  style="width:110px; height:56px; font-size:20px; background:#555;   color:#fff; border:none; border-radius:10px; cursor:pointer;">NO</button>
      </div>
      <div class="hint" style="margin-top:20px;">
        Trial: <b id="nbackTrialNum">0</b> / ${rounds} &nbsp;|&nbsp;
        Hits: <b id="nbackHits">0</b> &nbsp;|&nbsp;
        Misses: <b id="nbackMisses">0</b> &nbsp;|&nbsp;
        False alarms: <b id="nbackFA">0</b>
      </div>
    </div>
  `;

  const stimEl   = document.getElementById("nbackStimulus");
  const feedbackEl = document.getElementById("nbackFeedback");
  const trialNumEl = document.getElementById("nbackTrialNum");
  const hitsEl   = document.getElementById("nbackHits");
  const missesEl = document.getElementById("nbackMisses");
  const faEl     = document.getElementById("nbackFA");
  const yesBtn   = document.getElementById("nbackYes");
  const noBtn    = document.getElementById("nbackNo");

  // Pre-generate sequence; ~30% of trials after position nBack are targets
  const sequence = [];
  for (let i = 0; i < rounds; i++) {
    if (i >= nBack && Math.random() < 0.30) {
      sequence.push(sequence[i - nBack]); // deliberate match
    } else {
      let letter;
      do { letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
      while (i >= nBack && letter === sequence[i - nBack]); // avoid accidental match
      sequence.push(letter);
    }
  }

  let trialIndex = 0;
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let responded = false;
  let isTarget = false;
  let displayTimer = null;
  let isiTimer = null;
  let ended = false;

  function setButtons(enabled) {
    yesBtn.disabled = !enabled;
    noBtn.disabled = !enabled;
    yesBtn.style.opacity = enabled ? "1" : "0.4";
    noBtn.style.opacity = enabled ? "1" : "0.4";
  }

  function showFeedback(text, color) {
    feedbackEl.textContent = text;
    feedbackEl.style.color = color;
  }

  function recordNoResponse() {
    // Called at end of ISI if no response given for a valid trial
    if (trialIndex > nBack && !responded) {
      if (isTarget) {
        misses++;
        missesEl.textContent = String(misses);
        showFeedback("Miss!", "#c00");
      }
      // No response to a non-target is correct (no false alarm) — silent
    }
  }

  function runTrial() {
    if (ended) return;
    if (trialIndex >= rounds) { finish(); return; }

    responded = false;
    const letter = sequence[trialIndex];
    isTarget = trialIndex >= nBack && sequence[trialIndex] === sequence[trialIndex - nBack];

    stimEl.textContent = letter;
    trialNumEl.textContent = String(trialIndex + 1);
    feedbackEl.textContent = "";

    // Only enable buttons from trial nBack+1 onwards (need 2 prior items)
    setButtons(trialIndex >= nBack);

    // Hide stimulus after DISPLAY_MS
    displayTimer = setTimeout(() => {
      stimEl.textContent = "";
    }, DISPLAY_MS);

    // After full ISI, score non-responses then move on
    isiTimer = setTimeout(() => {
      recordNoResponse();
      trialIndex++;
      runTrial();
    }, ISI_MS);
  }

  function handleResponse(yes) {
    if (ended || trialIndex < nBack) return;
    if (responded) return; // one response per trial
    responded = true;

    clearTimeout(isiTimer);

    if (yes && isTarget) {
      hits++;
      hitsEl.textContent = String(hits);
      showFeedback("✓ Hit!", "#080");
    } else if (yes && !isTarget) {
      falseAlarms++;
      faEl.textContent = String(falseAlarms);
      showFeedback("✗ False alarm", "#c00");
    } else if (!yes && isTarget) {
      misses++;
      missesEl.textContent = String(misses);
      showFeedback("✗ Miss", "#c00");
    } else {
      showFeedback("✓ Correct rejection", "#080");
    }

    // Short pause then next trial
    isiTimer = setTimeout(() => {
      trialIndex++;
      runTrial();
    }, 600);
  }

  yesBtn.addEventListener("click", () => handleResponse(true));
  noBtn.addEventListener("click", () => handleResponse(false));

  // Keyboard shortcuts: y / n
  function keyHandler(e) {
    if (e.key.toLowerCase() === "y") handleResponse(true);
    if (e.key.toLowerCase() === "n") handleResponse(false);
  }
  window.addEventListener("keydown", keyHandler);

  function finish() {
    ended = true;
    clearTimeout(displayTimer);
    clearTimeout(isiTimer);
    window.removeEventListener("keydown", keyHandler);
    setButtons(false);

    // Targets present (trials where a match existed)
    const targetCount = sequence.filter((_, i) => i >= nBack && sequence[i] === sequence[i - nBack]).length;
    // Score: hits / targets present, penalised by false alarms
    const rawScore = targetCount > 0 ? (hits - falseAlarms) / targetCount : 0;
    const score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));

    onDone?.({ hits, misses, false_alarms: falseAlarms, score_0_100: score });
  }

  runTrial();
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

  const sdmt  = GAME_RESULTS.sdmt;
  const nback = GAME_RESULTS.nback;

  // FIX 3: Submit game results to Google Sheet
  submitHiddenForm(FORM_RESULTS_URL, {
    [RESULTS_ENTRY.timestamp_utc]: new Date().toISOString(),
    [RESULTS_ENTRY.session_id]:    SESSION.sessionId,
    [RESULTS_ENTRY.alias_hash]:    SESSION.aliasHash,
    [RESULTS_ENTRY.app_version]:   CONFIG.APP_VERSION,

    [RESULTS_ENTRY.sdmt_correct]:     String(sdmt ? sdmt.correct     : ""),
    [RESULTS_ENTRY.sdmt_incorrect]:   String(sdmt ? sdmt.incorrect   : ""),
    [RESULTS_ENTRY.sdmt_score_0_100]: String(sdmt ? sdmt.score_0_100 : ""),

    [RESULTS_ENTRY.nback_hits]:        String(nback ? nback.hits         : ""),
    [RESULTS_ENTRY.nback_misses]:      String(nback ? nback.misses       : ""),
    [RESULTS_ENTRY.nback_false_alarms]:String(nback ? nback.false_alarms : ""),
    [RESULTS_ENTRY.nback_score_0_100]: String(nback ? nback.score_0_100  : ""),

    // Stroop & PVT not yet implemented — send blanks
    [RESULTS_ENTRY.stroop_correct]:       "",
    [RESULTS_ENTRY.stroop_incorrect]:     "",
    [RESULTS_ENTRY.stroop_median_rt_ms]:  "",
    [RESULTS_ENTRY.stroop_score_0_100]:   "",

    [RESULTS_ENTRY.pvt_median_rt_ms]:  "",
    [RESULTS_ENTRY.pvt_lapses]:        "",
    [RESULTS_ENTRY.pvt_false_starts]:  "",
    [RESULTS_ENTRY.pvt_score_0_100]:   "",

    [RESULTS_ENTRY.overall_score_0_100]: "",
    [RESULTS_ENTRY.overall_band]:        "",
    [RESULTS_ENTRY.advice_text]:         ""
  });

  document.getElementById("resultsSummary").innerHTML = `
    <p><b>Session complete!</b></p>

    <p><b>SDMT</b></p>
    <ul>
      <li>Correct: <b>${sdmt ? sdmt.correct : "-"}</b></li>
      <li>Incorrect: <b>${sdmt ? sdmt.incorrect : "-"}</b></li>
      <li>Score (0–100): <b>${sdmt ? sdmt.score_0_100 : "-"}</b></li>
    </ul>

    <p><b>2-Back</b></p>
    <ul>
      <li>Hits: <b>${nback ? nback.hits : "-"}</b></li>
      <li>Misses: <b>${nback ? nback.misses : "-"}</b></li>
      <li>False alarms: <b>${nback ? nback.false_alarms : "-"}</b></li>
      <li>Score (0–100): <b>${nback ? nback.score_0_100 : "-"}</b></li>
    </ul>

    <p class="hint">Results submitted to Google Sheets. &nbsp; Session ID: ${SESSION.sessionId}</p>
    <p class="hint">Stroop &amp; PVT coming next.</p>
  `;
}

// ===============================
// MAIN
// ===============================
async function main() {
  await loadConfig();

  const aliasInput  = document.getElementById("aliasInput");
  const aliasBtn    = document.getElementById("aliasBtn");
  const aliasError  = document.getElementById("aliasError");

  const cooldownText        = document.getElementById("cooldownText");
  const cooldownOverrideBtn = document.getElementById("cooldownOverrideBtn");
  const overrideMsg         = document.getElementById("overrideMsg");

  const submitBtn = document.getElementById("submitCheckinBtn");
  const submitMsg = document.getElementById("submitMsg");

  const startBtn    = document.getElementById("startSessionBtn");
  const beginTestBtn = document.getElementById("beginTestBtn");
  const finishBtn   = document.getElementById("finishBtn");

  // Alias -> cooldown check -> checkin
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

    const cachedAge = getCachedAge(aliasHash);
    if (cachedAge) document.getElementById("age").value = cachedAge;

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

  // Submit check-in
  submitBtn.addEventListener("click", () => {
    submitMsg.textContent = "";
    submitBtn.disabled = true;

    const sleep_hours        = Number(document.getElementById("sleepHours").value || "");
    const shift_length_hours = Number(document.getElementById("shiftLen").value   || "");
    const hours_into_shift   = Number(document.getElementById("hoursInto").value  || "");
    const caffeine_level     = document.getElementById("caffeine").value || "";
    const fatigue_scale      = Number(document.getElementById("fatigue").value    || "");
    const motivation_scale   = Number(document.getElementById("motivation").value || "");
    const age                = Number(document.getElementById("age").value        || "");

    if (age) cacheAgeIfProvided(SESSION.aliasHash, age);

    SESSION.sessionId           = uuidv4();
    SESSION.sessionNumberToday  = incrementSessionCountToday(SESSION.aliasHash);
    SESSION.isFirstToday        = SESSION.sessionNumberToday === 1;

    const payload = {
      timestamp_utc:          new Date().toISOString(),
      session_id:             SESSION.sessionId,
      alias_hash:             SESSION.aliasHash,
      app_version:            CONFIG.APP_VERSION,
      device_info:            deviceInfo(),
      session_number_today:   SESSION.sessionNumberToday,
      is_first_session_today: SESSION.isFirstToday,
      checkin: {
        sleep_hours:        Number.isFinite(sleep_hours)        ? sleep_hours        : "",
        shift_length_hours: Number.isFinite(shift_length_hours) ? shift_length_hours : "",
        hours_into_shift:   Number.isFinite(hours_into_shift)   ? hours_into_shift   : "",
        caffeine_level,
        fatigue_scale:      Number.isFinite(fatigue_scale)      ? fatigue_scale      : "",
        motivation_scale:   Number.isFinite(motivation_scale)   ? motivation_scale   : "",
        symptoms:           selectedSymptoms(),
        age:                Number.isFinite(age)                ? age                : ""
      }
    };

    localStorage.setItem(`session_${payload.session_id}`, JSON.stringify(payload));

    submitHiddenForm(FORM_CHECKIN_URL, {
      [CHECKIN_ENTRY.timestamp_utc]:          payload.timestamp_utc,
      [CHECKIN_ENTRY.session_id]:             payload.session_id,
      [CHECKIN_ENTRY.alias_hash]:             payload.alias_hash,
      [CHECKIN_ENTRY.app_version]:            payload.app_version,
      [CHECKIN_ENTRY.device_info]:            payload.device_info,
      [CHECKIN_ENTRY.session_number_today]:   String(payload.session_number_today),
      [CHECKIN_ENTRY.is_first_session_today]: String(payload.is_first_session_today),
      [CHECKIN_ENTRY.sleep_hours]:            String(payload.checkin.sleep_hours),
      [CHECKIN_ENTRY.shift_length_hours]:     String(payload.checkin.shift_length_hours),
      [CHECKIN_ENTRY.hours_into_shift]:       String(payload.checkin.hours_into_shift),
      [CHECKIN_ENTRY.caffeine_level]:         String(payload.checkin.caffeine_level),
      [CHECKIN_ENTRY.fatigue_scale]:          String(payload.checkin.fatigue_scale),
      [CHECKIN_ENTRY.motivation_scale]:       String(payload.checkin.motivation_scale),
      [CHECKIN_ENTRY.symptoms]:               (payload.checkin.symptoms || []).join("|"),
      [CHECKIN_ENTRY.age]:                    String(payload.checkin.age)
    });

    setCooldownUntilMs(SESSION.aliasHash, nowMs() + CONFIG.COOLDOWN_HOURS * 3600 * 1000);

    GAME_RESULTS = { sdmt: null, nback: null, stroop: null, pvt: null };

    submitMsg.textContent = "Saved. Continuing to tests…";
    submitBtn.disabled = false;

    hide("checkinSection");
    show("startSection");
  });

  // Start -> SDMT explanation
  startBtn.addEventListener("click", () => {
    flowIndex = 0;
    showExplanation(flowIndex);
  });

  // Begin test
  beginTestBtn.addEventListener("click", () => {
    const step = FLOW[flowIndex];

    if (step.key === "sdmt") {
      runSDMT({
        durationSec: 60,
        trialTimeoutSec: 4,
        onDone: (result) => {
          GAME_RESULTS.sdmt = result;
          flowIndex++;
          flowIndex < FLOW.length ? showExplanation(flowIndex) : showResultsScreen();
        }
      });
      return;
    }

    if (step.key === "nback") {
      runNBack({
        rounds: 25,
        nBack: 2,
        onDone: (result) => {
          GAME_RESULTS.nback = result;
          flowIndex++;
          flowIndex < FLOW.length ? showExplanation(flowIndex) : showResultsScreen();
        }
      });
      return;
    }

    // Placeholder for Stroop & PVT
    hide("explainSection");
    show("gameSection");
    document.getElementById("gameTitle").textContent = step.title;
    document.getElementById("gameUI").innerHTML = `
      <p class="hint"><b>${step.title} — coming soon.</b></p>
      <button id="nextStepBtn">Continue</button>
    `;

    document.getElementById("nextStepBtn").addEventListener("click", () => {
      flowIndex++;
      flowIndex < FLOW.length ? showExplanation(flowIndex) : showResultsScreen();
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
