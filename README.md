# 📺 Universal Xtream IPTV API — Works with ALL Players

✅ **Fully optimized for:** TiviMate • Smarters Pro • IPTV Smarters • GSE Smart IPTV • Perfect Player • OTT Navigator • VLC • IP Television • Set-top boxes & more

## ⚙️ How It Works
- Loads your M3U8 from `drewlive24.duckdns.org:8081`
- Auto-parses categories, channel names, logos & EPG IDs
- Caches results for **1 hour** (faster player loads)
- Presents **100% Xtream Codes compatible API**
- Also gives you a **direct M3U download link**

## 🚀 Deploy to Render
1. Fork this repo → go to **Render → New → Web Service**
2. Connect your repo → select **Docker** environment
3. Set these **Environment Variables**:

| Variable | Example Value |
|---|---|
| `M3U_URL_WITH_ADULT` | `http://drewlive24.duckdns.org:8081/DrewLive/MergedPlaylist.m3u8` |
| `M3U_URL_CLEAN` | `http://drewlive24.duckdns.org:8081/DrewLive/MergedCleanPlaylist.m3u8` |
| `IPTV_USERNAME` | `yourname` |
| `IPTV_PASSWORD` | `yourstrongpass` |
| `INCLUDE_ADULT_VOD` | `false` or `true` |
| `TIMEZONE` | `Asia/Manila` |
| `CACHE_TTL` | `3600` (seconds = 1 hour) |

4. Click **Create Web Service** — done in ~2 minutes!

## 📱 Player Login Settings

> **Server URL:** `https://your-service.onrender.com/index.php`
> **Username:** your `IPTV_USERNAME`
> **Password:** your `IPTV_PASSWORD`

### 📥 Direct M3U Link
