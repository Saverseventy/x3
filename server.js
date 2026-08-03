const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// === YOUR CREDENTIALS — EDIT THESE ===
const CONFIG = {
  username: "myuser123",
  password: "mypass456",
  serverUrl: "" // Auto-filled by Render
};

// Auth check middleware
const checkAuth = (req) => {
  const u = req.query.username;
  const p = req.query.password;
  return u === CONFIG.username && p === CONFIG.password;
};

// --- Xtream Standard Endpoints ---
app.get('/player_api.php', (req, res) => {
  if (!checkAuth(req)) return res.json({ user_info: { auth: 0, status: "Active" } });
  res.json({
    user_info: {
      auth: 1, status: "Active", username: CONFIG.username, password: CONFIG.password,
      server_url: CONFIG.serverUrl, https_port: "443", port: "80"
    }
  });
});

app.get('/get.php', (req, res) => {
  if (!checkAuth(req)) return res.send('Unauthorized');
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXTINF:-1 tvg-id="" tvg-name="My Test Channel" group-title="My Channels",My Test Channel
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`);
});

app.get('/live/categories', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('Unauthorized');
  res.json([{ category_id: "1", category_name: "My Channels" }]);
});

app.get('/live/streams', (req, res) => {
  if (!checkAuth(req)) return res.status(401).send('Unauthorized');
  res.json([{ stream_id: "1", name: "My Test Channel", stream_type: "live", stream_url: `${CONFIG.serverUrl}/stream/my-channel` }]);
});

// Sample stream proxy
app.get('/stream/my-channel', (req, res) => res.redirect('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'));

// Auto-set server URL
app.use((req, res, next) => {
  CONFIG.serverUrl = `${req.protocol}://${req.get('host')}`;
  next();
});

app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
