const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

//======================
// AUTO CREATE FOLDERS/FILES IF MISSING
//======================
const ensureFile = (filePath, defaultContent = {}) => {
  const fullPath = path.join(__dirname, filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, JSON.stringify(defaultContent, null, 2));
};
ensureFile("data/users.json", {});
ensureFile("data/channels.json", []);
ensureFile("data/movies.json", []);
ensureFile("data/series.json", []);

//======================
// LOAD / SAVE JSON
//======================
function loadJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")); }
  catch (e) { console.log(`⚠️ ${file} missing, using default`); return fallback; }
}
function saveJSON(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
}

//======================
// DATABASE
//======================
let USERS = loadJSON("data/users.json", {});
let CHANNELS = loadJSON("data/channels.json", []);
let MOVIES = loadJSON("data/movies.json", []);
let SERIES = loadJSON("data/series.json", []);

//======================
// AUTH
//======================
function login(username, password) {
  const user = USERS[username];
  if (!user) return false;
  if (user.password !== password) return false;
  if (user.status !== "Active") return false;
  return true;
}
const getServerInfo = (req) => ({
  url: req.hostname, port: "443", https_port: "443",
  server_protocol: "https", rtmp_port: "1935", timezone: "Asia/Manila"
});

//======================
// ADMIN: ADD USER
//======================
app.post("/admin/add-user", (req, res) => {
  const { username, password, status = "Active", expiry = "2030-12-31", connections = 1 } = req.body;
  if (!username || !password) return res.json({ success: false, msg: "Username & Password required" });
  if (USERS[username]) return res.json({ success: false, msg: "Username already exists" });
  
  USERS[username] = { password, status, expiry, connections };
  saveJSON("data/users.json", USERS);
  res.json({ success: true, msg: "User added successfully" });
});

//======================
// ADMIN: ADD CHANNEL
//======================
app.post("/admin/add-channel", (req, res) => {
  const { name, logo, category_id = 1, url } = req.body;
  if (!name || !url) return res.json({ success: false, msg: "Name & Stream URL required" });
  
  const newId = CHANNELS.length ? Math.max(...CHANNELS.map(c => c.id)) + 1 : 1;
  CHANNELS.push({ id: newId, num: newId, name, logo, category_id, url });
  saveJSON("data/channels.json", CHANNELS);
  res.json({ success: true, msg: "Channel added successfully", id: newId });
});

//======================
// ADMIN: ADD MOVIE
//======================
app.post("/admin/add-movie", (req, res) => {
  const { name, stream_icon, category_id = 2, direct_source, description = "" } = req.body;
  if (!name || !direct_source) return res.json({ success: false, msg: "Name & Source URL required" });
  
  const newId = MOVIES.length ? Math.max(...MOVIES.map(m => m.stream_id)) + 1 : 1;
  MOVIES.push({ stream_id: newId, name, stream_icon, category_id, direct_source, description });
  saveJSON("data/movies.json", MOVIES);
  res.json({ success: true, msg: "Movie added successfully", id: newId });
});

//======================
// ADMIN: ADD SERIES + SEASONS/EPS
//======================
app.post("/admin/add-series", (req, res) => {
  const { name, cover, category_id = 3, description = "", seasons = [] } = req.body;
  if (!name) return res.json({ success: false, msg: "Series name required" });
  
  const newId = SERIES.length ? Math.max(...SERIES.map(s => s.series_id)) + 1 : 1;
  SERIES.push({ series_id: newId, name, cover, category_id, description, seasons });
  saveJSON("data/series.json", SERIES);
  res.json({ success: true, msg: "Series added successfully", id: newId });
});

//======================
// ADMIN: GET ALL DATA
//======================
app.get("/admin/data", (req, res) => {
  res.json({ users: USERS, channels: CHANNELS, movies: MOVIES, series: SERIES });
});

//======================
// ORIGINAL XTREAM API (UNCHANGED)
//======================
app.get("/", (req, res) => res.send("✅ Xtream IPTV API Running"));

app.get("/player_api.php", (req, res) => {
  const { username, password, action = "" } = req.query;
  if (!login(username, password)) return res.json({ user_info: { auth: 0, status: "Disabled" } });

  const userInfo = { username, password, auth: 1, status: "Active" };
  if (!action) return res.json({ user_info: userInfo, server_info: getServerInfo(req) });

  if (action === "get_live_categories") return res.json([{category_id:"1",category_name:"Live TV",parent_id:0}]);
  if (action === "get_live_streams") return res.json(CHANNELS.map(c=>({...c,stream_type:"live",container_extension:"ts"})));
  if (action === "get_vod_categories") return res.json([{category_id:"2",category_name:"Movies",parent_id:0}]);
  if (action === "get_vod_streams") return res.json(MOVIES);
  if (action === "get_series_categories") return res.json([{category_id:"3",category_name:"Series",parent_id:0}]);
  if (action === "get_series") return res.json(SERIES);
  
  res.json({ user_info: userInfo, server_info: getServerInfo(req) });
});

app.get("/panel_api.php", (req, res) => {
  req.url = `/player_api.php?${req._parsedUrl.query}`;
  app._router.handle(req, res);
});

app.get("/get.php", (req, res) => {
  const { username, password } = req.query;
  if (!login(username, password)) return res.send("Invalid Login");
  const base = `${req.protocol}://${req.get("host")}`;
  let m3u = "#EXTM3U\n";
  CHANNELS.forEach(c => m3u += `#EXTINF:-1 tvg-logo="${c.logo||""}" group-title="Live TV",${c.name}\n${base}/live/${username}/${password}/${c.id}.ts\n`);
  MOVIES.forEach(m => m3u += `#EXTINF:-1 group-title="Movies",${m.name}\n${base}/movie/${username}/${password}/${m.stream_id}.mp4\n`);
  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
});

app.get("/live/:u/:p/:id.ts", async (req, res) => {
  if (!login(req.params.u, req.params.p)) return res.send("Invalid Login");
  const ch = CHANNELS.find(c=>String(c.id)===String(req.params.id));
  if (!ch) return res.send("Not Found");
  try { (await fetch(ch.url,{headers:{"User-Agent":"Mozilla/5.0"}})).body.pipe(res); }
  catch { res.send("Stream Error"); }
});

app.get("/movie/:u/:p/:id.mp4", (req, res) => {
  if (!login(req.params.u, req.params.p)) return res.send("Invalid Login");
  const mv = MOVIES.find(m=>String(m.stream_id)===String(req.params.id));
  res.redirect(mv?.direct_source || "");
});

app.get("/series/:u/:p/:id.mp4", (req, res) => {
  if (!login(req.params.u, req.params.p)) return res.send("Invalid Login");
  const ep = SERIES.flatMap(s=>s.seasons||[]).flatMap(s=>s.episodes||[]).find(e=>String(e.id)===String(req.params.id));
  res.redirect(ep?.source || "");
});

app.listen(PORT, () => console.log(`✅ Running on port ${PORT} | Admin: /admin.html`));
