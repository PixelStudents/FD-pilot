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

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
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
    text: "A key at the top shows 9 symbols, each paired with a number. A symbol appears in the centre — press the matching number as fast as you can. You have 4 seconds per symbol before it counts as incorrect."
  },
  {
    key: "nback",
    title: "2-Back",
    text: "Letters appear one at a time. Press YES if the letter matches the one shown 2 steps ago, or NO if it doesn't. Stay focused — it gets tricky!"
  },
  {
    key: "stroop",
    title: "Stroop",
    text: "A colour word will appear on screen printed in a different ink colour. Tap the button matching the INK COLOUR — ignore what the word says. Respond as quickly and accurately as you can. You have 60 seconds."
  },
  {
    key: "pvt",
    title: "PVT",
    text: "A red dot will appear on screen after a random delay (2–10 seconds). Tap it as fast as you can. Do NOT tap before it appears — that counts as a false start. You have 60 seconds."
  }
];

let flowIndex = 0;

// ===============================
// SDMT Game
// ===============================
function runSDMT({ durationSec = 60, trialTimeoutSec = 4, onDone }) {
  const SYMBOLS = ["▭", "◯", "∧", "⊕", "≡", "⇔", "◄", "∴", "Ψ"];  

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

  function updateTimer() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(durationSec - elapsed));
    timerEl.textContent = String(remaining) + "s";
    if (remaining <= 0 && !ended) finish();
  }
  const timerInt = setInterval(updateTimer, 200);
  updateTimer();

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
    setTimeout(() => {
      if (!ended) feedbackEl.style.color = "";
    }, 600);
  }

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

    const attempts = correct + incorrect;
    let score = null;
    if (attempts >= 10) {
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const throughput = Math.max(0, correct - 0.5 * incorrect);
      const MIN = 5;
      const MAX = 70;
      score = Math.round(clamp01((throughput - MIN) / (MAX - MIN)) * 100);
    }

    onDone?.({ correct, incorrect, trials, score_0_100: score });
  }
}

// ===============================
// 2-Back Game
// ===============================
function runNBack({ rounds = 25, nBack = 2, onDone }) {
  const LETTERS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
  const DISPLAY_MS = 500;
  const ISI_MS = 2000;

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

  const stimEl     = document.getElementById("nbackStimulus");
  const feedbackEl = document.getElementById("nbackFeedback");
  const trialNumEl = document.getElementById("nbackTrialNum");
  const hitsEl     = document.getElementById("nbackHits");
  const missesEl   = document.getElementById("nbackMisses");
  const faEl       = document.getElementById("nbackFA");
  const yesBtn     = document.getElementById("nbackYes");
  const noBtn      = document.getElementById("nbackNo");

  const sequence = [];
  for (let i = 0; i < rounds; i++) {
    if (i >= nBack && Math.random() < 0.30) {
      sequence.push(sequence[i - nBack]);
    } else {
      let letter;
      do { letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]; }
      while (i >= nBack && letter === sequence[i - nBack]);
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
    if (trialIndex > nBack && !responded) {
      if (isTarget) {
        misses++;
        missesEl.textContent = String(misses);
        showFeedback("Miss!", "#c00");
      }
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

    setButtons(trialIndex >= nBack);

    displayTimer = setTimeout(() => {
      stimEl.textContent = "";
    }, DISPLAY_MS);

    isiTimer = setTimeout(() => {
      recordNoResponse();
      trialIndex++;
      runTrial();
    }, ISI_MS);
  }

  function handleResponse(yes) {
    if (ended || trialIndex < nBack) return;
    if (responded) return;
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

    isiTimer = setTimeout(() => {
      trialIndex++;
      runTrial();
    }, 600);
  }

  yesBtn.addEventListener("click", () => handleResponse(true));
  noBtn.addEventListener("click", () => handleResponse(false));

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

    const targetCount = sequence.filter((_, i) => i >= nBack && sequence[i] === sequence[i - nBack]).length;
    const rawScore = targetCount > 0 ? (hits - falseAlarms) / targetCount : 0;
    let score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
    if (rounds < 20) {
      score = null;
    }

    onDone?.({ hits, misses, false_alarms: falseAlarms, score_0_100: score });
  }

  runTrial();
}

// ===============================
// Stroop Game
// ===============================
function runStroop({ durationSec = 60, onDone }) {
  const COLOURS = [
    { name: "RED",    hex: "#e53935" },
    { name: "BLUE",   hex: "#1e88e5" },
    { name: "GREEN",  hex: "#43a047" },
    { name: "YELLOW", hex: "#f9a825" }
  ];

  hide("explainSection");
  show("gameSection");

  const gameTitle = document.getElementById("gameTitle");
  const gameUI    = document.getElementById("gameUI");
  const timerEl   = document.getElementById("gameTimer");

  gameTitle.textContent = "Stroop Colour Task";

  // Build button grid
  const btnHTML = COLOURS.map(
    (c) => `<button class="stroopBtn" data-colour="${c.name}"
      style="width:120px; height:54px; font-size:18px; font-weight:700;
             background:${c.hex}; color:#fff; border:none; border-radius:10px; cursor:pointer;">
      ${c.name}
    </button>
  ).join("");

  gameUI.innerHTML = `
    <p class="hint" style="text-align:center;">Tap the button matching the <b>ink colour</b> — ignore the word.</p>
    <div style="display:flex; justify-content:center; align-items:center; height:130px; margin-top:8px;">
      <div id="stroopWord" style="font-size:72px; font-weight:900; letter-spacing:2px;"></div>
    </div>
    <div id="stroopFeedback" style="text-align:center; min-height:24px; font-size:15px; margin-top:4px;"></div>
    <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:18px;">
      ${btnHTML}
    </div>
    <div class="hint" style="text-align:center; margin-top:16px;">
      Correct: <b id="stroopCorrect">0</b> &nbsp;|&nbsp; Incorrect: <b id="stroopIncorrect">0</b>
    </div>
  `;

  const wordEl      = document.getElementById("stroopWord");
  const feedbackEl  = document.getElementById("stroopFeedback");
  const correctEl   = document.getElementById("stroopCorrect");
  const incorrectEl = document.getElementById("stroopIncorrect");

  let correct = 0;
  let incorrect = 0;
  const reactionTimes = [];
  let trialStart = 0;
  let currentInkColour = "";
  let ended = false;

  function nextTrial() {
    // Pick word and ink colour independently (force incongruent ~60% of time)
    const wordIdx = Math.floor(Math.random() * COLOURS.length);
    let inkIdx;
    if (Math.random() < 0.6) {
      // incongruent
      do { inkIdx = Math.floor(Math.random() * COLOURS.length); } while (inkIdx === wordIdx);
    } else {
      inkIdx = wordIdx;
    }
    const word      = COLOURS[wordIdx].name;
    const inkColour = COLOURS[inkIdx];
    currentInkColour = inkColour.name;
    wordEl.textContent = word;
    wordEl.style.color = inkColour.hex;
    trialStart = Date.now();
  }

  nextTrial();

  const startMs = Date.now();

  function updateTimer() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(durationSec - elapsed));
    timerEl.textContent = String(remaining) + "s";
    if (remaining <= 0 && !ended) finish();
  }
  const timerInt = setInterval(updateTimer, 200);
  updateTimer();

  function handleClick(chosen) {
    if (ended) return;
    const rt = Date.now() - trialStart;

    if (chosen === currentInkColour) {
      correct++;
      reactionTimes.push(rt);
      feedbackEl.textContent = "✓ Correct";
      feedbackEl.style.color = "#080";
      correctEl.textContent = String(correct);
    } else {
      incorrect++;
      feedbackEl.textContent = `✗ Wrong — it was ${currentInkColour}`;
      feedbackEl.style.color = "#c00";
      incorrectEl.textContent = String(incorrect);
    }
    nextTrial();
    setTimeout(() => { if (!ended) feedbackEl.style.color = ""; }, 500);
  }

  Array.from(gameUI.querySelectorAll(".stroopBtn")).forEach((btn) => {
    btn.addEventListener("click", () => handleClick(btn.dataset.colour));
  });

  function finish() {
    ended = true;
    clearInterval(timerInt);

    const total = correct + incorrect;
    const accuracy = total > 0 ? correct / total : 0;
    const medianRt = median(reactionTimes);
    let score = null;

    if (total >= 10) {
      // Score: blend accuracy (70%) and speed (30%)
      // Speed benchmark: 400ms = perfect, 1200ms = 0
      const speedScore = Math.max(0, Math.min(1, (1200 - medianRt) / 800));
      const rawScore = accuracy * 0.7 + speedScore * 0.3;
      score = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
    }

    onDone?.({ correct, incorrect, median_rt_ms: medianRt, score_0_100: score });
  }
}

// ===============================
// PVT Game
// ===============================
function runPVT({ durationSec = 60, minDelaySec = 2, maxDelaySec = 10, onDone }) {
  const LAPSE_THRESHOLD_MS = 500;

  hide("explainSection");
  show("gameSection");

  const gameTitle = document.getElementById("gameTitle");
  const gameUI    = document.getElementById("gameUI");
  const timerEl   = document.getElementById("gameTimer");

  gameTitle.textContent = "Psychomotor Vigilance Task (PVT)";

  gameUI.innerHTML = `
    <p class="hint" style="text-align:center;">Tap the dot as soon as it appears. Do NOT tap early.</p>
    <div id="pvtArena" style="
      display:flex; justify-content:center; align-items:center;
      height:200px; margin-top:16px; cursor:pointer; user-select:none;">
      <div id="pvtDot" style="
        width:100px; height:100px; border-radius:50%;
        background:#ccc; opacity:0.25;
        display:flex; align-items:center; justify-content:center;
        font-size:18px; font-weight:700; color:#fff;
        transition:background 0.1s;">
      </div>
    </div>
    <div id="pvtFeedback" style="text-align:center; min-height:28px; font-size:16px; margin-top:8px;"></div>
    <div class="hint" style="text-align:center; margin-top:12px;">
      Responses: <b id="pvtResponses">0</b> &nbsp;|&nbsp;
      Lapses (&gt;500ms): <b id="pvtLapses">0</b> &nbsp;|&nbsp;
      False starts: <b id="pvtFalseStarts">0</b>
    </div>
    <div class="hint" style="text-align:center; margin-top:4px;">
      Last RT: <b id="pvtLastRT">—</b>
    </div>
  `;

  const arena        = document.getElementById("pvtArena");
  const dot          = document.getElementById("pvtDot");
  const feedbackEl   = document.getElementById("pvtFeedback");
  const responsesEl  = document.getElementById("pvtResponses");
  const lapsesEl     = document.getElementById("pvtLapses");
  const falseStartsEl= document.getElementById("pvtFalseStarts");
  const lastRtEl     = document.getElementById("pvtLastRT");

  const reactionTimes = [];
  let lapses       = 0;
  let falseStarts  = 0;
  let stimulusOn   = false;
  let stimulusStart = 0;
  let waitHandle   = null;
  let ended        = false;
  let trials = 0;
  let respondedThisTrial = false;
  let currentTrialLapseCounted = false;
  let lapseTimerHandle = null;

  const startMs = Date.now();

  function updateTimer() {
    const elapsed = (Date.now() - startMs) / 1000;
    const remaining = Math.max(0, Math.ceil(durationSec - elapsed));
    timerEl.textContent = String(remaining) + "s";
    if (remaining <= 0 && !ended) finish();
  }
  const timerInt = setInterval(updateTimer, 200);
  updateTimer();

  function showStimulus() {
    if (ended) return;
    trials++;
    respondedThisTrial = false;
    currentTrialLapseCounted = false;
    stimulusOn = true;
    stimulusStart = Date.now();
    dot.style.background = "#e53935";
    dot.style.opacity = "1";
    dot.textContent = "";
    clearTimeout(waitHandle);
    clearTimeout(lapseTimerHandle);

    lapseTimerHandle = setTimeout(() => {
      if (ended) return;
      if (stimulusOn && !respondedThisTrial && !currentTrialLapseCounted) {
        lapses++;
        currentTrialLapseCounted = true;
        lapsesEl.textContent = String(lapses);
      }
    }, LAPSE_THRESHOLD_MS);
  }

  function hideStimulus() {
    stimulusOn = false;
    dot.style.background = "#ccc";
    dot.style.opacity = "0.25";
    dot.textContent = "";
    clearTimeout(waitHandle);
    clearTimeout(lapseTimerHandle);
  }

  function scheduleNext() {
    if (ended) return;
    const delay = (minDelaySec + Math.random() * (maxDelaySec - minDelaySec)) * 1000;
    waitHandle = setTimeout(showStimulus, delay);
  }

  arena.addEventListener("click", () => {
    if (ended) return;

    if (!stimulusOn) {
      // False start
      falseStarts++;
      falseStartsEl.textContent = String(falseStarts);
      feedbackEl.textContent = "✗ Too early! (false start)";
      feedbackEl.style.color = "#e65100";
      return;
    }

    // Valid response
    respondedThisTrial = true;
    clearTimeout(lapseTimerHandle);
    const rt = Date.now() - stimulusStart;
    reactionTimes.push(rt);
    const responses = reactionTimes.length;
    responsesEl.textContent = String(responses);
    lastRtEl.textContent = rt + " ms";

    if (rt >= LAPSE_THRESHOLD_MS) {
      if (!currentTrialLapseCounted) {
        lapses++;
        currentTrialLapseCounted = true;
        lapsesEl.textContent = String(lapses);
      }
      feedbackEl.textContent = `⚠ Slow: ${rt} ms (lapse)`;
      feedbackEl.style.color = "#c00";
    } else {
      feedbackEl.textContent = `✓ ${rt} ms`;
      feedbackEl.style.color = rt < 250 ? "#080" : "#555";
    }

    hideStimulus();
    scheduleNext();
    setTimeout(() => { if (!ended) feedbackEl.style.color = ""; }, 700);
  });

  // Start first stimulus
  scheduleNext();

  function finish() {
    ended = true;
    clearInterval(timerInt);
    clearTimeout(waitHandle);
    clearTimeout(lapseTimerHandle);
    hideStimulus();

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const clamp0to100 = (x) => Math.max(0, Math.min(100, x));
    const medianRt = median(reactionTimes);
    const lapseRate = trials > 0 ? lapses / trials : 0;
    const fsRate = trials > 0 ? falseStarts / trials : 0;
    const speedScore = clamp01((700 - medianRt) / (700 - 200));
    const lapsePenalty = clamp01(lapseRate * 1.2);
    const fsPenalty = clamp01(fsRate * 0.4);
    const rawScore = speedScore * (1 - clamp01(lapsePenalty + fsPenalty));
    let score = clamp0to100(Math.round(rawScore * 100));

    if (trials < 8) {
      score = null;
    }

    onDone?.({ median_rt_ms: medianRt, lapses, false_starts: falseStarts, score_0_100: score });
  }
}

// ===============================
// Scoring helpers
// ===============================
function computeOverall(results) {
  // Weighted average: SDMT 25%, NBack 15%, Stroop 25%, PVT 35%
  const weights = { pvt: 0.35, sdmt: 0.25, stroop: 0.25, nback: 0.15 };
  let total = 0;
  let wSum  = 0;
  for (const [key, w] of Object.entries(weights)) {
    const r = results[key];
    if (r && typeof r.score_0_100 === "number") {
      total += r.score_0_100 * w;
      wSum  += w;
    }
  }
  return wSum > 0 ? Math.round(total / wSum) : 0;
}

function scoreToBand(score) {
  if (score >= 80) return "Green";
  if (score >= 60) return "Amber";
  if (score >= 40) return "Amber-Red";
  return "Red";
}

function scoreToAdvice(score, band) {
  if (band === "Green") {
    return "Cognitive performance looks good. You appear alert and well-rested. Continue as normal and recheck after your next rest break.";
  }
  if (band === "Amber") {
    return "Mild signs of fatigue detected. Take a short break if possible, stay hydrated, and avoid high-risk tasks requiring sustained focus. Recheck in 2 hours.";
  }
  if (band === "Amber-Red") {
    return "Moderate fatigue indicators present. Consider a rest or handover before safety-critical tasks. Do not drive or operate machinery without supervisor awareness.";
  }
  return "Significant fatigue detected. Rest is strongly recommended before resuming duty. Inform your supervisor and avoid safety-critical tasks.";
}

function bandColour(band) {
  const map = { "Green": "#2e7d32", "Amber": "#f9a825", "Amber-Red": "#e65100", "Red": "#c62828" };
  return map[band] || "#555";
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

  const sdmt   = GAME_RESULTS.sdmt;
  const nback  = GAME_RESULTS.nback;
  const stroop = GAME_RESULTS.stroop;
  const pvt    = GAME_RESULTS.pvt;

  const overallScore = computeOverall(GAME_RESULTS);
  const band         = scoreToBand(overallScore);
  const advice       = scoreToAdvice(overallScore, band);
  const bColour      = bandColour(band);

  // Submit full results to Google Sheet
  submitHiddenForm(FORM_RESULTS_URL, {
    [RESULTS_ENTRY.timestamp_utc]: new Date().toISOString(),
    [RESULTS_ENTRY.session_id]:    SESSION.sessionId,
    [RESULTS_ENTRY.alias_hash]:    SESSION.aliasHash,
    [RESULTS_ENTRY.app_version]:   CONFIG.APP_VERSION,

    [RESULTS_ENTRY.sdmt_correct]:     String(sdmt   ? sdmt.correct       : ""),
    [RESULTS_ENTRY.sdmt_incorrect]:   String(sdmt   ? sdmt.incorrect     : ""),
    [RESULTS_ENTRY.sdmt_score_0_100]: String(sdmt?.score_0_100 ?? ""),

    [RESULTS_ENTRY.nback_hits]:         String(nback  ? nback.hits          : ""),
    [RESULTS_ENTRY.nback_misses]:       String(nback  ? nback.misses        : ""),
    [RESULTS_ENTRY.nback_false_alarms]: String(nback  ? nback.false_alarms  : ""),
    [RESULTS_ENTRY.nback_score_0_100]:  String(nback?.score_0_100 ?? ""),

    [RESULTS_ENTRY.stroop_correct]:      String(stroop ? stroop.correct      : ""),
    [RESULTS_ENTRY.stroop_incorrect]:    String(stroop ? stroop.incorrect    : ""),
    [RESULTS_ENTRY.stroop_median_rt_ms]: String(stroop ? stroop.median_rt_ms : ""),
    [RESULTS_ENTRY.stroop_score_0_100]:  String(stroop?.score_0_100 ?? ""),

    [RESULTS_ENTRY.pvt_median_rt_ms]: String(pvt    ? pvt.median_rt_ms    : ""),
    [RESULTS_ENTRY.pvt_lapses]:       String(pvt    ? pvt.lapses           : ""),
    [RESULTS_ENTRY.pvt_false_starts]: String(pvt    ? pvt.false_starts     : ""),
    [RESULTS_ENTRY.pvt_score_0_100]:  String(pvt?.score_0_100 ?? ""),

    [RESULTS_ENTRY.overall_score_0_100]: String(overallScore),
    [RESULTS_ENTRY.overall_band]:        band,
    [RESULTS_ENTRY.advice_text]:         advice
  });

  document.getElementById("resultsSummary").innerHTML = `
    <div style="text-align:center; padding:16px 0 8px;">
      <div style="font-size:64px; font-weight:900; color:${bColour};">${overallScore}</div>
      <div style="font-size:22px; font-weight:700; color:${bColour}; margin-top:4px;">${band}</div>
      <p style="max-width:480px; margin:12px auto 0; font-size:15px; line-height:1.55; color:#333;">${advice}</p>
    </div>

    <hr style="margin:20px 0; border:none; border-top:1px solid #e0e0e0;" />

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">

      <div style="background:#f9f9f9; border-radius:10px; padding:14px;">
        <p style="margin:0 0 8px; font-weight:700;">SDMT</p>
        <ul style="margin:0; padding-left:18px; font-size:14px; line-height:1.8;">
          <li>Correct: <b>${sdmt ? sdmt.correct : "—"}</b></li>
          <li>Incorrect: <b>${sdmt ? sdmt.incorrect : "—"}</b></li>
          <li>Score: <b>${sdmt ? sdmt.score_0_100 : "—"} / 100</b></li>
        </ul>
      </div>

      <div style="background:#f9f9f9; border-radius:10px; padding:14px;">
        <p style="margin:0 0 8px; font-weight:700;">2-Back</p>
        <ul style="margin:0; padding-left:18px; font-size:14px; line-height:1.8;">
          <li>Hits: <b>${nback ? nback.hits : "—"}</b></li>
          <li>Misses: <b>${nback ? nback.misses : "—"}</b></li>
          <li>False alarms: <b>${nback ? nback.false_alarms : "—"}</b></li>
          <li>Score: <b>${nback ? nback.score_0_100 : "—"} / 100</b></li>
        </ul>
      </div>

      <div style="background:#f9f9f9; border-radius:10px; padding:14px;">
        <p style="margin:0 0 8px; font-weight:700;">Stroop</p>
        <ul style="margin:0; padding-left:18px; font-size:14px; line-height:1.8;">
          <li>Correct: <b>${stroop ? stroop.correct : "—"}</b></li>
          <li>Incorrect: <b>${stroop ? stroop.incorrect : "—"}</b></li>
          <li>Median RT: <b>${stroop ? stroop.median_rt_ms + " ms" : "—"}</b></li>
          <li>Score: <b>${stroop ? stroop.score_0_100 : "—"} / 100</b></li>
        </ul>
      </div>

      <div style="background:#f9f9f9; border-radius:10px; padding:14px;">
        <p style="margin:0 0 8px; font-weight:700;'>PVT</p>
        <ul style="margin:0; padding-left:18px; font-size:14px; line-height:1.8;">
          <li>Median RT: <b>${pvt ? pvt.median_rt_ms + " ms" : "—"}</b></li>
          <li>Lapses: <b>${pvt ? pvt.lapses : "—"}</b></li>
          <li>False starts: <b>${pvt ? pvt.false_starts : "—"}</b></li>
          <li>Score: <b>${pvt ? pvt.score_0_100 : "—"} / 100</b></li>
        </ul>
      </div>

    </div>

    <p class="hint" style="text-align:center; margin-top:16px;">
      Results submitted to Google Sheets. &nbsp; Session ID: ${SESSION.sessionId}
    </p>
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

  const submitBtn  = document.getElementById("submitCheckinBtn");
  const submitMsg  = document.getElementById("submitMsg");

  const startBtn     = document.getElementById("startSessionBtn");
  const beginTestBtn = document.getElementById("beginTestBtn");
  const finishBtn    = document.getElementById("finishBtn");

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

    if (step.key === "stroop") {
      runStroop({
        durationSec: 60,
        onDone: (result) => {
          GAME_RESULTS.stroop = result;
          flowIndex++;
          flowIndex < FLOW.length ? showExplanation(flowIndex) : showResultsScreen();
        }
      });
      return;
    }

    if (step.key === "pvt") {
      runPVT({
        durationSec: 60,
        minDelaySec: 2,
        maxDelaySec: 10,
        onDone: (result) => {
          GAME_RESULTS.pvt = result;
          flowIndex++;
          flowIndex < FLOW.length ? showExplanation(flowIndex) : showResultsScreen();
        }
      });
      return;
    }
  });

  // Finish -> back to alias screen
  finishBtn.addEventListener("click", () => {
    hide("resultsSection");
    show("aliasSection");
    document.getElementById("aliasInput").value = "";
  });
}

main();
