const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbzHVTYY7JRASImK0k8YoMJxBAYuKVd9SnmTCPOWWXMjOUJUWeBW4uvy_mT6AKn-ptsuMQ/exec";

let CONFIG = null;

async function loadConfig() {
  const res = await fetch("config.json", { cache: "no-store" });
  CONFIG = await res.json();
}

function normalizeAlias(raw) {
  return (raw || "").trim().toUpperCase();
}

// Exactly 4 chars, exactly 2 letters and 2 digits, any order
function isValidAlias(alias) {
  if (!alias || alias.length !== 4) return false;
  const chars = alias.split("");
  const letters = chars.filter(c => /[A-Z]/.test(c)).length;
  const digits = chars.filter(c => /[0-9]/.test(c)).length;
  return letters === 2 && digits === 2;
}

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function nowMs() { return Date.now(); }

function getCooldownUntilMs(aliasHash) {
  const key = `cooldown_until_${aliasHash}`;
  const v = localStorage.getItem(key);
  return v ? Number(v) : 0;
}

function setCooldownUntilMs(aliasHash, untilMs) {
  localStorage.setItem(`cooldown_until_${aliasHash}`, String(untilMs));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function getSessionCountToday(aliasHash) {
  const key = `sessions_${aliasHash}_${getTodayKey()}`;
  return Number(localStorage.getItem(key) || "0");
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
  return Array.from(document.querySelectorAll(".symptom:checked")).map(x => x.value);
}

function deviceInfo() {
  return `${navigator.userAgent}`;
}

function uuidv4() {
  return crypto.randomUUID();
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  const hh = String(Math.floor(s/3600)).padStart(2,"0");
  const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${hh}:${mm}:${ss}`;
}

async function postSession(payload) {
  const res = await fetch(ENDPOINT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

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
      aliasError.textContent = "Invalid code format. Must be 4 chars: 2 letters + 2 numbers (any order).";
      return;
    }

    // Hash with salt so dataset doesn't store raw alias
    const salted = `${CONFIG.HASHING.salt}::${currentAlias}`;
    aliasHash = await sha256Hex(salted);

    // Pre-fill age if cached
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
    // For pilot: simple client-side gate (we can strengthen later)
    if (pw === "ADMIN123") {
      overrideMsg.textContent = "Override enabled. You may check-in now.";
      hide("cooldownSection");
      show("checkinSection");
    } else {
      overrideMsg.textContent = "Incorrect password.";
    }
  });

  submitBtn.addEventListener("click", async () => {
    submitMsg.textContent = "";
    submitBtn.disabled = true;

    const sleep_hours = Number(document.getElementById("sleepHours").value || "");
    const shift_length_hours = Number(document.getElementById("shiftLen").value || "");
    const hours_into_shift = Number(document.getElementById("hoursInto").value || "");
    const caffeine_level = document.getElementById("caffeine").value;
    const fatigue_scale = Number(document.getElementById("fatigue").value || "");
    const motivation_scale = Number(document.getElementById("motivation").value || "");
    const age = Number(document.getElementById("age").value || "");

    // Cache age once if provided
    if (age) cacheAgeIfProvided(aliasHash, age);

    const sessionNumberToday = incrementSessionCountToday(aliasHash);
    const isFirstToday = sessionNumberToday === 1;

    const payload = {
      timestamp_utc: new Date().toISOString(),
      session_id: uuidv4(),
      participant_id: aliasHash,       // stable per user
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
        age: Number.isFinite(age) ? age : ""
      }
    };

    // Local failsafe copy
    const localKey = `session_${payload.session_id}`;
    localStorage.setItem(localKey, JSON.stringify(payload));

    try {
      const resp = await postSession(payload);
      if (resp && resp.ok) {
        submitMsg.textContent = "Saved. (Next: we'll launch the tests.)";
        // Set cooldown now (2 hours)
        const until = nowMs() + CONFIG.COOLDOWN_HOURS * 3600 * 1000;
        setCooldownUntilMs(aliasHash, until);

        // NEXT STEP: route to SDMT page (we implement next)
      } else {
        submitMsg.textContent = `Upload failed (data saved locally). Error: ${resp?.error || "unknown"}`;
      }
    } catch (e) {
      submitMsg.textContent = `Upload failed (data saved locally). Error: ${String(e)}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

main();
