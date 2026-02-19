// ===============================
// FORM 1: CHECK-IN (already working)
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
// FORM 2: GAME RESULTS (Step 2 mapping done)
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

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

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

function nowMs() { return Date.now(); }

function getCooldownUntilMs(aliasHash) {
  const v = localStorage.getItem(`cooldown_until_${aliasHash}`);
  return v ? Number(v) : 0;
}

function setCooldownUntilMs(aliasHash, untilMs) {
  localStorage.setItem(`cooldown_until_${aliasHash}`, String(untilMs));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function getSessionCountToday(aliasHash) {
  return Number(localStorage.getItem(`sessions_${aliasHash}_${getTodayKey()}`) || "0");
}

function incrementSessionCountToday(aliasHash) {
  const key = `sessions_${aliasHash}_${getTodayKey()}`;
  const n = getSessionCountToday(aliasHash) + 1;
  localStorage.setItem(key, String(n));
  return n;
}

function cacheAgeIfProvided(aliasHash, ageVal) {
  if (!ageVal) return;
  localStorage.setItem(`age_${aliasHash}`, String(ageVal));
}

function getCachedAge(aliasHash) {
  const v = localStorage.getItem(`age_${aliasHash}`);
  return v ? Number(v) : null;
}

function selectedSymptoms() {
  return Array.from(document.querySelectorAll(".symptom:checked")).map((x) => x.value);
}

function deviceInfo() { return navigator.userAgent; }
function uuidv4() { return crypto.randomUUID(); }

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// --------------------
// Hidden form submit (no fetch)
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

// --------------------
// Session state (used for Step 3 flow)
// --------------------
let SESSION = {
  alias: "",
  aliasHash: "",
  sessionId: "",
  sessionNumberToday: 0,
  isFirstToday: false
};

// --------------------
// Step 3: Screen flow (Start → SDMT explanation → placeholder game)
// --------------------
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

// --------------------
// Main
// --------------------
async function main() {
  await loadConfig();

  const aliasInput = document.getElementById("aliasInput");
  const aliasBtn = document.getElementById("aliasBtn");
  const aliasError = document.getElementById("aliasError");

  const cooldownText = document.getElementById("cooldownText");
  const cooldownOverrideBtn = document.getElementById("cooldownOverrideBtn");
  const overrideMsg = document.getElementById("overrideMsg");

  const submitBtn = document.getElementById("submitCheckinBtn");
  const submitMsg = document.getElementById("submitMsg");

  const startBtn = document.getElementById("startSessionBtn");

  const explainTitle = document.getElementById("explainTitle");
  const explainText = document.getElementById("explainText");
  const beginTestBtn = document.getElementById("beginTestBtn");

  const gameTitle = document.getElementById("gameTitle");
  const gameUI = document.getElementById("gameUI");

  const finishBtn = document.getElementById("finishBtn");
  const resultsSummary = document.getElementById("resultsSummary");

  // Alias continue
  aliasBtn.addEventListener("click", async () => {
    aliasError.textContent = "";
    const alias = normalizeAlias(aliasInput.value);

    if (!isValidAliasFormat(alias)) {
      aliasError.textContent =
        "Invalid format. Must be 4 chars: 2 letters + 2 numbers (any order).";
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

    // Prefill cached age
    const cachedAge = getCachedAge(aliasHash);
    if (cachedAge) document.getElementById("age").value = cachedAge;

    // Cooldown
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

  // Submit check-in → Start screen
  submitBtn.addEventListener("click", () => {
    submitMsg.textContent = "";
    submitBtn.disabled = true;

    const sleep_hours = Number(document.getElementById("sleepHours").value || "");
    const shift_length_hours = Number(document.getElementById("shiftLen").value || "");
    const hours_into_shift = Number(document.getElementById("hoursInto").value || "");
    const caffeine_level = document.getElementById("caffeine").value;
    const fatigue_scale = Number(document.getElementById("fatigue").value || "");
    const motivation_scale = Number(document.getElementById("motivation").value || "");
    const age = Number(document.getElementById("age").value || "");

    if (age) cacheAgeIfProvided(SESSION.aliasHash, age);

    // Session IDs for linking check-in <-> results
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

    // local backup
    localStorage.setItem(`session_${payload.session_id}`, JSON.stringify(payload));

    // Submit to CHECK-IN form (hidden form post)
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

    // Set cooldown now (2 hours)
    setCooldownUntilMs(
      SESSION.aliasHash,
      nowMs() + CONFIG.COOLDOWN_HOURS * 3600 * 1000
    );

    submitMsg.textContent = "Saved. Continuing to tests…";
    submitBtn.disabled = false;

    hide("checkinSection");
    show("startSection");
  });

  // Start → first explanation
  startBtn.addEventListener("click", () => {
    flowIndex = 0;
    showExplanation(flowIndex);
  });

  // Begin test → placeholder game screen
  beginTestBtn.addEventListener("click", () => {
    const step = FLOW[flowIndex];
    hide("explainSection");
    show("gameSection");
    gameTitle.textContent = step.title;
    gameUI.innerHTML = `
      <p class="hint"><b>${step.title} game not implemented yet.</b></p>
      <p class="hint">Next step: we build the full 60s ${step.title} task + scoring.</p>
      <button id="nextStepBtn">Continue</button>
    `;

    document.getElementById("nextStepBtn").addEventListener("click", () => {
      flowIndex++;
      if (flowIndex < FLOW.length) {
        showExplanation(flowIndex);
      } else {
        // End of battery placeholder
        hide("gameSection");
        show("resultsSection");
        resultsSummary.innerHTML = `
          <p><b>Battery complete (placeholder).</b></p>
          <p>Next: implement SDMT → 2-back → Stroop → PVT + scoring + submit results.</p>
          <p class="hint">Session ID: ${SESSION.sessionId}</p>
        `;
      }
    });
  });

  finishBtn.addEventListener("click", () => {
    // Reset to start
    hide("resultsSection");
    show("aliasSection");
    document.getElementById("aliasInput").value = "";
  });

  function showExplanation(i) {
    hide("startSection");
    hide("gameSection");
    hide("resultsSection");
    show("explainSection");

    const step = FLOW[i];
    explainTitle.textContent = `${step.title} – Instructions`;
    explainText.textContent = step.text;
  }
}

main();
