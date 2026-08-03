const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG — MATCH YOUR SETTINGS SCREEN ===
const CONFIG = {
  username: "myuser123",
  password: "mypass456",
  serverUrl: ""
};

// --- FIRST: Auto-set Server URL & Global Headers ---
app.use((req, res, next) => {
  // Auto-detect correct base URL (works on Render & local)
  CONFIG.serverUrl = `${req.protocol}://${req.get('host')}`;
  
  // Fix CORS & headers for players/TVs
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// --- Auth Check ---
const checkAuth = (req) => {
  const { username, password } = req.query;
  return username === CONFIG.username && password === CONFIG.password;
};

// --- ✅ Standard Xtream API Endpoints (What the Player Expects) ---

// 1. Player API / Login Check — CRITICAL for your settings screen
app.get('/player_api.php', (req, res) => {
  if (!checkAuth(req)) {
    return res.json({
      user_info: {
        auth: 0,
        status: "Disabled",
        message: "Invalid login"
      }
    });
  }
  // Full fields required by all OTT/IPTV apps
  res.json({
    user_info: {
      auth: 1,
      status: "Active",
      username: CONFIG.username,
      password: CONFIG.password,
      server_url: CONFIG.serverUrl,
      https_port: "443",
      port: "80",
      exp_date: 0,
      is_trial: "0",
      active_cons: "1",
      max_connections: "1"
    },
    server_info: {
      timezone: "Asia/Manila"
    }
  });
});

// 2. M3U Playlist Endpoint
app.get('/get.php', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('#EXTM3U\n#EXTINF:-1,Unauthorized\n');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXTINF:-1 tvg-id="test.mychannel" tvg-name="My Test Channel" group-title="My Channels",My Test Channel
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`);
});

// 3. Live Categories
app.get('/live/categories', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json([
    { category_id: "1", category_name: "My Channels", parent_id: 0 }
  ]);
});

// 4. Live Streams List
app.get('/live/streams', (req, res) => {
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });
  res.json([
    {
      stream_id: "1",
      name: "My Test Channel",
      stream_type: "live",
      stream_url: `${CONFIG.serverUrl}/stream/my-channel?username=${CONFIG.username}&password=${CONFIG.password}`,
      category_id: "1",
      thumbnail: "",
      added: ""
    }
  ]);
});

// 5. Stream Proxy (pass auth & avoid CORS issues)
app.get('/stream/my-channel', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('Unauthorized');
  res.redirect('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
});

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Your URL: ${CONFIG.serverUrl}`);
});
