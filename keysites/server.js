/**
 * Key system backend
 * -------------------
 * Endpoints:
 *   POST /api/ad-watched     { sessionId }        -> increments ad-watch counter for a session
 *   POST /api/generate-key   { sessionId }         -> requires 2 ads watched, creates a key, notifies Discord
 *   POST /api/verify-key     { key }               -> used by the Roblox script to check validity
 *
 * Data is stored in a simple JSON file (keys.json). Swap for a real DB (SQLite/Postgres/Firebase)
 * if you expect meaningful traffic or want persistence across redeploys.
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DB_FILE = path.join(__dirname, "keys.json");
const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

// !!! SET THIS to your Discord webhook URL (Channel Settings -> Integrations -> Webhooks) !!!
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "PASTE_YOUR_WEBHOOK_URL_HERE";

// --- tiny JSON "database" helpers ---
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { keys: {}, sessions: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// --- ad watching (very simple session-based gate) ---
app.post("/api/ad-watched", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const db = loadDB();
  db.sessions[sessionId] = (db.sessions[sessionId] || 0) + 1;
  saveDB(db);

  res.json({ adsWatched: db.sessions[sessionId] });
});

// --- key generation ---
app.post("/api/generate-key", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const db = loadDB();
  const adsWatched = db.sessions[sessionId] || 0;

  if (adsWatched < 2) {
    return res.status(403).json({ error: "You must watch 2 ads before getting a key." });
  }

  const key = "HUB-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  const now = Date.now();
  const expiresAt = now + KEY_LIFETIME_MS;

  db.keys[key] = { createdAt: now, expiresAt };
  // reset ad counter so they can't spam-generate keys from the same session
  db.sessions[sessionId] = 0;
  saveDB(db);

  // notify Discord (fire and forget)
  notifyDiscord(key, expiresAt).catch((e) => console.error("Discord webhook failed:", e.message));

  res.json({ key, expiresAt });
});

// --- key verification (called by the Roblox script) ---
app.post("/api/verify-key", (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, reason: "no key provided" });

  const db = loadDB();
  const entry = db.keys[key];

  if (!entry) {
    return res.json({ valid: false, reason: "not_found" });
  }
  if (Date.now() > entry.expiresAt) {
    delete db.keys[key];
    saveDB(db);
    return res.json({ valid: false, reason: "expired" });
  }

  return res.json({ valid: true, expiresAt: entry.expiresAt });
});

async function notifyDiscord(key, expiresAt) {
  if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes("PASTE_YOUR")) return;

  const expiresDate = new Date(expiresAt).toISOString();
  await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: "🔑 New key generated",
          description: `\`${key}\``,
          fields: [{ name: "Expires (UTC)", value: expiresDate }],
          color: 0x5865f2,
        },
      ],
    }),
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Key server running on port ${PORT}`));
