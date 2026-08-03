const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === EXACT MATCH YOUR SETTINGS ===
const CONFIG = {
  username: "myuser123",
  password: "mypass456",
  serverUrl: ""
};

// === FIRST: GLOBAL SETTINGS (CRITICAL FOR ALL PLAYERS) ===
app.use((req, res, next) => {
  // Auto-detect correct URL (works on Render, local, any host)
  CONFIG.serverUrl = `${req.protocol}://${req.get('host')}`;
  
  // Full CORS + Headers — fixes 90% of player connection issues
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// === AUTH CHECK ===
const checkAuth = (req) => {
  const user = req.query.username || req.query.user;
  const pass = req.query.password || req.query.pass;
  return user === CONFIG.username && pass === CONFIG.password;
};

// ==============================================
// ✅ STANDARD XTREAM V2 ENDPOINTS (ALL PLAYERS USE THESE)
// ==============================================

// 🔑 MAIN LOGIN ENDPOINT — Every player checks this first
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
      exp_date: 0, is_trial: "0", active_cons: "1", max_connections: "999"
    },
    server_info: { timezone: "Asia/Manila" }
  });
});

// 📋 M3U PLAYLIST — For direct import in any player
app.get('/get.php', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('#EXTM3U\n#EXTINF:-1,Unauthorized Access\n');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXTINF:-1 tvg-id="test.channel" tvg-name="My Test Channel" group-title="My Channels",My Test Channel
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`);
});

// 📂 PANEL API — The missing endpoint your app needs!
app.get('/panel_api.php', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json({
    live_categories: [
      { category_id: "1", category_name: "My Channels", parent_id: 0 }
    ],
    live_streams: [
      {
        stream_id: "1", name: "My Test Channel", stream_type: "live",
        stream_url: `${CONFIG.serverUrl}/stream/live1?username=${CONFIG.username}&password=${CONFIG.password}`,
        category_id: "1", thumbnail: "", added: ""
      }
    ],
    vod_categories: [],
    vod_streams: [],
    series_categories: [],
    series_streams: []
  });
});

// 🛟 FALLBACK ENDPOINTS — For players that use different paths
app.get('/live/categories', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json([]);
  res.json([{ category_id: "1", category_name: "My Channels" }]);
});

app.get('/live/streams', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json([]);
  res.json([{
    stream_id: "1", name: "My Test Channel", stream_type: "live",
    stream_url: `${CONFIG.serverUrl}/stream/live1?username=${CONFIG.username}&password=${CONFIG.password}`,
    category_id: "1"
  }]);
});

// 🎬 STREAM PROXY — Works with auth attached
app.get('/stream/live1', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('Unauthorized');
  res.redirect('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Server URL: ${CONFIG.serverUrl}`);
});
