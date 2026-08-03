const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === EXACT MATCH TO YOUR SETTINGS ===
const CONFIG = {
  username: "myuser123",
  password: "mypass456",
  serverUrl: ""
};

// --- 1. RUN FIRST: Set URL + Global Headers ---
app.use((req, res, next) => {
  CONFIG.serverUrl = `${req.protocol}://${req.get('host')}`;
  // Fix CORS & player headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- 2. Auth Check ---
const checkAuth = (req) => {
  const u = req.query.username;
  const p = req.query.password;
  return u === CONFIG.username && p === CONFIG.password;
};

// --- 🔑 CRITICAL: EXACT XTREAM V2 ENDPOINTS ---

// ✅ Login / Player API (REQUIRED — App checks this first)
app.get('/player_api.php', (req, res) => {
  if (!checkAuth(req)) {
    return res.json({
      user_info: { auth: 0, status: "Disabled", message: "Invalid login" }
    });
  }
  res.json({
    user_info: {
      auth: 1, status: "Active", username: CONFIG.username, password: CONFIG.password,
      server_url: CONFIG.serverUrl, https_port: "443", port: "80",
      exp_date: 0, is_trial: "0", active_cons: "1", max_connections: "1"
    },
    server_info: { timezone: "Asia/Manila" }
  });
});

// ✅ M3U Playlist (For direct import)
app.get('/get.php', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('#EXTM3U\n#EXTINF:-1,Unauthorized\n');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXTINF:-1 tvg-id="test.channel" tvg-name="My Test Channel" group-title="My Channels",My Test Channel
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`);
});

// ✅ Live Categories — EXACT PATH APP EXPECTS
app.get('/panel_api.php', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json({
    live_categories: [
      { category_id: "1", category_name: "My Channels", parent_id: 0 }
    ],
    live_streams: [
      {
        stream_id: "1", name: "My Test Channel", stream_type: "live",
        stream_url: `${CONFIG.serverUrl}/stream/my-channel?username=${CONFIG.username}&password=${CONFIG.password}`,
        category_id: "1", thumbnail: "", added: ""
      }
    ]
  });
});

// ✅ Alternative paths some apps use (fallback)
app.get('/live/categories', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json([{ category_id: "1", category_name: "My Channels", parent_id: 0 }]);
});

app.get('/live/streams', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json([{
    stream_id: "1", name: "My Test Channel", stream_type: "live",
    stream_url: `${CONFIG.serverUrl}/stream/my-channel?username=${CONFIG.username}&password=${CONFIG.password}`,
    category_id: "1", thumbnail: ""
  }]);
});

// ✅ Stream Proxy
app.get('/stream/my-channel', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('Unauthorized');
  res.redirect('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
});

// Start Server
app.listen(PORT, () => console.log(`✅ Running on port ${PORT} | URL: ${CONFIG.serverUrl}`));
