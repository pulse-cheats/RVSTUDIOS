// ===== CONFIG =====
// Site and backend are served by the same Render app (server.js serves this /public folder),
// so we can just use relative paths — no separate URL needed.
const BACKEND_URL = "";

// Ad watch duration in seconds (how long the user must "watch" before it counts).
// Real ad networks (Adsterra/Monetag) usually give you a callback/postback instead of a timer —
// swap this out for their SDK's completion event if you use one.
const AD_WATCH_SECONDS = 15;

// ===== SESSION ID (persists per browser so the backend can track ad progress) =====
function getSessionId() {
  let id = localStorage.getItem("kh_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("kh_session", id);
  }
  return id;
}
const sessionId = getSessionId();

// ===== ELEMENTS =====
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

const watchBtn1 = document.getElementById("watchBtn1");
const watchBtn2 = document.getElementById("watchBtn2");
const getKeyBtn = document.getElementById("getKeyBtn");

const progress1 = document.getElementById("progress1");
const progress2 = document.getElementById("progress2");

const keyBox = document.getElementById("keyBox");
const keyText = document.getElementById("keyText");
const expiryText = document.getElementById("expiryText");
const copyBtn = document.getElementById("copyBtn");

step1.classList.add("active");

// ===== AD WATCH FLOW =====
function runAdTimer(button, progressEl, onDone) {
  button.disabled = true;
  progressEl.classList.add("active");

  let elapsed = 0;

  // Use a real child div (instead of the CSS ::after) so JS can control its width directly.
  progressEl.innerHTML = `<div style="height:100%;width:0%;background:#5865f2;transition:width ${AD_WATCH_SECONDS}s linear;"></div>`;
  requestAnimationFrame(() => {
    progressEl.firstElementChild.style.width = "100%";
  });

  const timer = setInterval(() => {
    elapsed++;
    if (elapsed >= AD_WATCH_SECONDS) {
      clearInterval(timer);
      onDone();
    }
  }, 1000);
}

async function markAdWatched() {
  const res = await fetch(`${BACKEND_URL}/api/ad-watched`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

watchBtn1.addEventListener("click", () => {
  runAdTimer(watchBtn1, progress1, async () => {
    await markAdWatched();
    watchBtn1.textContent = "✓ Watched";
    step2.classList.add("active");
    watchBtn2.disabled = false;
  });
});

watchBtn2.addEventListener("click", () => {
  runAdTimer(watchBtn2, progress2, async () => {
    await markAdWatched();
    watchBtn2.textContent = "✓ Watched";
    step3.classList.add("active");
    getKeyBtn.disabled = false;
  });
});

// ===== KEY GENERATION =====
getKeyBtn.addEventListener("click", async () => {
  getKeyBtn.disabled = true;
  getKeyBtn.textContent = "Generating...";

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Something went wrong. Please watch both ads first.");
      getKeyBtn.disabled = false;
      getKeyBtn.textContent = "Get Key";
      return;
    }

    keyText.textContent = data.key;
    keyBox.classList.remove("hidden");

    const expiresDate = new Date(data.expiresAt);
    expiryText.textContent = `Expires: ${expiresDate.toLocaleString()}`;
    expiryText.classList.remove("hidden");

    getKeyBtn.classList.add("hidden");
  } catch (err) {
    alert("Could not reach the server. Try again in a moment.");
    getKeyBtn.disabled = false;
    getKeyBtn.textContent = "Get Key";
  }
});

// ===== COPY BUTTON =====
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(keyText.textContent).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  });
});
