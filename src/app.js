// ===============================
// Google Form submission (NO fetch)
// ===============================

const FORM_RESPONSE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfSO6_C_mIWA1G1OHuCwPIaOn_srffgsm6XmM8Y2SKKwhGyBA/formResponse";

// Entry IDs from your prefilled link (15 fields)
const ENTRY = {
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
  age: "entry.1773262357",
};

let CONFIG = null;

// --------------------
// Utilities
// --------------------
async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-store" });
  CONFIG = await res.json();
}

function normalizeAlias(raw) {
  return (raw || "").trim().toUpperCase();
}

function isValidAlias(alias) {
  if (!alias || alias.length !== 4) return false;
  const chars = alias.split("");
  const letters = chars.filter((c) => /[A-Z]/.test(c)).length;
  const digits = chars.filter((c) => /[0-9]/.test(c)).length;
  return letters === 2 && digits === 2;
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

function getCooldownUntilMs(aliasHash) {
  const v = localStorage.getItem(`cooldown_until_${aliasHash}`);
  return v ? Number(v) : 0;
}

function setCooldownUntilMs(aliasHash, untilMs) {
  localStorage.setItem(`cooldown_until_${aliasHash}`, String(untilMs));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getUTCDate()).padStart(2, "0")}`;
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

function deviceInfo() {
  return navigator.userAgent;
}

function uuidv4() {
  return crypto.randomUUID();
}

function show(id) {
  document.getElementById(id).classList.remove("hidden");
}
function hide(id) {
  document.getElementById(id).classList.add("hidden");
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// --------------------
// Google Forms submit WITHOUT fetch
// --------------------
function submitToGoogleForm(payload) {
  // Create hidden iframe so page doesn't navigate away
  let iframe = document.getElementById("gf_hidden_iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "gf_hidden_iframe";
    iframe.name = "gf_hidden_iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);
  }

  const form = document.createElement("form");
  form.action = FORM_RESPONSE_URL;
  form.method = "POST";
  form.target = "gf_hidden_iframe";
  form.style.display = "none";

  const add = (name, value) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  };

  // Core IDs
  add(ENTRY.timestamp_utc, payload.timestamp_utc || "");
  add(ENTRY.session_id, payload.session_id || "");
  add(ENTRY.alias_hash, payload.alias_hash || "");
  add(ENTRY.app_version, payload.app_version || "");
  add(ENTRY.device_info, payload.device_info || "");
  add(ENTRY.session_number_today, String(payload.session_number_today ?? ""));
  add(ENTRY.is_first_session_today, String(payload.is_first_session_today ?? ""));

  // Check-in
  add(ENTRY.sleep_hours, String(payload.checkin?.sleep_hours ?? ""));
  add(ENTRY.shift_length_hours, String(payload.checkin?.shift_length_hours ?? ""));
  add(ENTRY.hours_into_shift, String(payload.checkin?.hours_into_shift ?? ""));
  add(ENTRY.caffeine_level, String(payload.checkin?.caffeine_level ?? ""));
  add(ENTRY.fatigue_scale, String(payload.checkin?.fatigue_scale ?? ""));
  add(ENTRY.motivation_scale, String(payload.checkin?.motivation_scale ?? ""));
  add(ENTRY.symptoms, String((payload.checkin?.symptoms || []).join("|")));
  add(ENTRY.age, String(payload.checkin?.age ?? ""));

  document.body.appendChild(form);
  form.submit();
  form.remove();

  // We can't detect success/fail from Google Forms,
  // but if the form is published and accepting responses, it will land in Sheets.
  return { ok: true };
}

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

  let currentAlias = "";
  let aliasHash = "";

  aliasBtn.addEventListener("click", async () => {
    aliasError.textContent = "";
    currentAlias = normalizeAlias(aliasInput.value);

    if (!isValidAlias(currentAlias)) {
      aliasError.textContent =
        "Invalid code format. Must be 4 chars: 2 letters + 2 numbers (any order).";
      return;
    }

    // Hash alias
    const salted = `${CONFIG.HASHING.salt}::${currentAlias}`;
    aliasHash = await sha256Hex(salted);

    // Prefill age if cached
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

  cooldownOverrideBtn.addEventListener("click", () => {
    const pw = prompt("Admin password:");
    if (pw === "ADMIN123") {
      overrideMsg.textContent = "Override enabled. You may check-in now.";
      hide("cooldownSection");
      show("checkinSection");
    } else {
      overrideMsg.textContent = "Incorrect password.";
    }
  });

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

    if (age) cacheAgeIfProvided(aliasHash, age);

    const sessionNumberToday = incrementSessionCountToday(aliasHash);
    const isFirstToday = sessionNumberToday === 1;

    const payload = {
      timestamp_utc: new Date().toISOString(),
      session_id: uuidv4(),
      alias_hash: aliasHash,
      app_version: CONFIG.APP_VERSION,
      device_info: deviceInfo(),
      session_number_today: sessionNumberToday,
      is_first_session_today: isFirstToday,
      checkin: {
        sleep_hours: Number.isFinite(sleep_hours) ? sleep_hours : "",
        shift_length_hours: Number.isFinite(shift_length_hours) ? shift_length_hours : "",
        hours_into_shift: Number.isFinite(hours_into_shift) ? hours_into_shift : "",
        caffeine_level,
        fatigue_scale: Number.isFinite(fatigue_scale) ? fatigue_scale : "",
        motivation_scale: Number.isFinite(motivation_scale) ? motivation_scale : "",
        symptoms: selectedSymptoms(),
        age: Number.isFinite(age) ? age : "",
      },
    };

    // Local backup
    localStorage.setItem(`session_${payload.session_id}`, JSON.stringify(payload));

    // Submit (no fetch)
    submitToGoogleForm(payload);

    // We treat as saved (Google Form is published + accepting responses)
    submitMsg.textContent = "Saved. (Check your Google Sheet to confirm.)";

    // 2-hour cooldown
    const until = nowMs() + CONFIG.COOLDOWN_HOURS * 3600 * 1000;
    setCooldownUntilMs(aliasHash, until);

    submitBtn.disabled = false;

    // NEXT: launch SDMT screen (we’ll do next step)
  });
}

main();
