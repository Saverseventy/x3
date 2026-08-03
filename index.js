<?php
/**
 * Xtream IPTV API — Fully Optimized for All IPTV Players
 * @version 2.0.0
 * @deploy Render / PHP 7.4+
 */

// ========== CONFIGURATION — Use Environment Variables (Render Dashboard) ==========
function getEnvBool($key, $default = false) {
    $val = $_ENV[$key] ?? getenv($key);
    if ($val === false || $val === '') return $default;
    return filter_var(trim($val), FILTER_VALIDATE_BOOLEAN);
}

$CFG = [
    'M3U_URL_WITH_ADULT' => $_ENV['M3U_URL_WITH_ADULT'] ?? 'http://drewlive24.duckdns.org:8081/DrewLive/MergedPlaylist.m3u8',
    'M3U_URL_CLEAN'      => $_ENV['M3U_URL_CLEAN']      ?? 'http://drewlive24.duckdns.org:8081/DrewLive/MergedCleanPlaylist.m3u8',
    'IPTV_USERNAME'       => $_ENV['IPTV_USERNAME']       ?? 'admin',
    'IPTV_PASSWORD'       => $_ENV['IPTV_PASSWORD']       ?? 'changeme123',
    'INCLUDE_ADULT_VOD'   => getEnvBool('INCLUDE_ADULT_VOD', false),
    'TIMEZONE'            => $_ENV['TIMEZONE']            ?? 'Asia/Manila',
    'CACHE_TTL'           => (int)($_ENV['CACHE_TTL'] ?? 3600), // Refresh cache every hour
    'API_ALIAS'           => 'iptv', // Optional: /iptv.php alias compatibility
];

date_default_timezone_set($CFG['TIMEZONE']);

// ========== HELPERS ==========
function channelIdFromName($name) {
    $hash = crc32($name);
    $id = sprintf('%u', $hash);
    return $id % 1000000000;
}

function authCheck($u, $p, $CFG) {
    return ($u === $CFG['IPTV_USERNAME'] && $p === $CFG['IPTV_PASSWORD']);
}

function ensureDir($path) {
    if (!is_dir($path)) mkdir($path, 0755, true);
}

function baseUrl() {
    $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
             ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $path = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/');
    return "$proto://$host$path";
}

// ========== FETCH & PARSE M3U PLAYLIST ==========
function buildPlaylist($CFG) {
    $srcUrl = $CFG['INCLUDE_ADULT_VOD'] ? $CFG['M3U_URL_WITH_ADULT'] : $CFG['M3U_URL_CLEAN'];

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 20,
            'ignore_errors' => true,
            'user_agent' => 'Mozilla/5.0 IPTV Player',
        ],
    ]);

    $raw = @file_get_contents($srcUrl, false, $ctx);
    if ($raw === false) {
        return ['ok' => false, 'error' => 'Failed fetching source playlist', 'url' => $srcUrl];
    }

    $lines = explode("\n", $raw);
    $channels = [];
    $categories = [];
    $catMap = [];
    $catId = 100;
    $usedIds = [];

    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, '#EXTINF:') === 0) {
            $attr = [];
            if (preg_match_all('/([\w\-]+)\s*=\s*"([^"]*)"/', $line, $m)) {
                foreach ($m[1] as $i => $k) $attr[$k] = $m[2][$i];
            }
            $chName = '';
            if (preg_match('/,(.+)$/', $line, $mm)) $chName = trim($mm[1]);

            $tvgId   = $attr['tvg-id']      ?? $attr['channel-id'] ?? '';
            $tvgLogo = $attr['tvg-logo']    ?? '';
            $group   = trim($attr['group-title'] ?? 'General');
            $chNum   = isset($attr['tvg-chno']) ? (int)$attr['tvg-chno'] : 0;

            if (!$chName) continue;

            if (!isset($catMap[$group])) {
                $catMap[$group] = (string)$catId++;
                $categories[] = [
                    'category_id'   => (string)$catMap[$group],
                    'category_name' => $group,
                    'parent_id'     => '0'
                ];
            }

            $streamId = $chNum > 0 ? $chNum : channelIdFromName($chName);
            while (isset($usedIds[$streamId])) $streamId = ($streamId + 1) % 1000000000;
            $usedIds[$streamId] = true;

            $channels[] = [
                'num'                 => $streamId,
                'name'                => $chName,
                'stream_type'         => 'live',
                'stream_id'           => $streamId,
                'stream_icon'         => $tvgLogo,
                'epg_channel_id'      => $tvgId ?: 'ch_' . $streamId,
                'added'               => time(),
                'category_id'         => (string)$catMap[$group],
                'custom_sid'          => '',
                'tv_archive'          => 0,
                'direct_source'       => '',
                'tv_archive_duration' => 0,
                'video_url'           => '',
                'description'         => $attr['tvg-name'] ?? $chName,
                'group'               => $group,
            ];
        } elseif ($line && $line[0] !== '#') {
            $idx = count($channels) - 1;
            if ($idx >= 0) {
                $channels[$idx]['direct_source'] = $line;
                $channels[$idx]['video_url']     = $line;
            }
        }
    }

    // Write cache
    $base = __DIR__ . '/channels';
    ensureDir($base);
    file_put_contents("$base/categories.json", json_encode($categories, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    file_put_contents("$base/channels.json", json_encode($channels, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    file_put_contents("$base/last_build.txt", (string)time());

    return [
        'ok' => true,
        'channels' => $channels,
        'categories' => $categories,
        'count' => count($channels),
        'source' => $srcUrl,
    ];
}

// ========== CACHE MANAGEMENT ==========
function loadData($CFG, $force = false) {
    $base = __DIR__ . '/channels';
    $catFile = "$base/categories.json";
    $chFile  = "$base/channels.json";
    $tsFile  = "$base/last_build.txt";

    if ($force || !is_file($catFile) || !is_file($chFile)) {
        return buildPlaylist($CFG);
    }

    $ts = (int)@file_get_contents($tsFile);
    if ((time() - $ts) > $CFG['CACHE_TTL']) {
        return buildPlaylist($CFG);
    }

    return [
        'ok' => true,
        'channels'   => json_decode(file_get_contents($chFile), true),
        'categories' => json_decode(file_get_contents($catFile), true),
        'count'      => count(json_decode(file_get_contents($chFile), true)),
        'cached'     => true,
    ];
}

// ========== INPUT ==========
$action   = $_REQUEST['action']   ?? '';
$username = $_REQUEST['username'] ?? '';
$password = $_REQUEST['password'] ?? '';

// ========== M3U ENDPOINT — Direct M3U Download ==========
if ($action === 'm3u' || isset($_GET['m3u'])) {
    if (!$CFG['IPTV_USERNAME'] || !authCheck($username, $password, $CFG)) {
        http_response_code(403);
        exit('Unauthorized — use: ?action=m3u&username=USER&password=PASS');
    }
    $data = loadData($CFG);
    if (!$data['ok']) { http_response_code(502); exit('Source unreachable'); }

    header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
    header('Content-Disposition: attachment; filename="playlist.m3u8"');
    echo "#EXTM3U\n# Generated: " . date('c') . "\n";
    foreach ($data['channels'] as $c) {
        $logo = $c['stream_icon'] ? ' tvg-logo="' . $c['stream_icon'] . '"' : '';
        $gid  = ' group-title="' . addslashes($c['group']) . '"';
        echo "#EXTINF:-1 tvg-id=\"{$c['epg_channel_id']}\"$logo$gid,{$c['name']}\n";
        echo $c['direct_source'] . "\n";
    }
    exit;
}

// ========== REFRESH ==========
if ($action === 'refresh') {
    header('Content-Type: application/json');
    if (!authCheck($username, $password, $CFG)) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); exit; }
    echo json_encode(loadData($CFG, true), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ========== XTREAM: LOGIN / GET ==========
if ($action === '' || $action === 'get') {
    header('Content-Type: application/json; charset=utf-8');
    if (!authCheck($username, $password, $CFG)) {
        http_response_code(401);
        echo json_encode(['user_info' => ['auth' => 0, 'message' => 'Invalid credentials']]);
        exit;
    }
    $urlParts = parse_url(baseUrl());
    $isHttps = ($urlParts['scheme'] === 'https');
    echo json_encode([
        'server_info' => [
            'url'             => $urlParts['host'],
            'port'            => $isHttps ? 443 : 80,
            'https_port'      => 443,
            'server_protocol' => $urlParts['scheme'],
            'rtmp_port'       => 0,
            'timezone'        => $CFG['TIMEZONE'],
            'process'         => baseUrl() . '/',
            'version'         => '2.9.0',
            'url'             => $urlParts['host'],
        ],
        'user_info' => [
            'username'        => $username,
            'password'        => $password,
            'auth'            => 1,
            'status'          => 'Active',
            'exp_date'        => 2000000000,
            'is_trial'        => 0,
            'active_cons'     => 1,
            'created_at'       => time(),
            'max_connections' => 1,
            'allowed_output_formats' => ['m3u8', 'ts', 'rtmp'],
        ],
        'live_streams'       => [],
        'live_categories'    => [],
        'vod_categories'     => [],
        'vod_streams'        => [],
        'series_categories'  => [],
        'series'             => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ========== XTREAM: LIVE CATEGORIES ==========
if ($action === 'get_live_categories') {
    header('Content-Type: application/json; charset=utf-8');
    if (!authCheck($username, $password, $CFG)) { echo json_encode([]); exit; }
    $d = loadData($CFG);
    echo json_encode($d['categories'] ?? [], JSON_UNESCAPED_UNICODE);
    exit;
}

// ========== XTREAM: LIVE STREAMS ==========
if ($action === 'get_live_streams') {
    header('Content-Type: application/json; charset=utf-8');
    if (!authCheck($username, $password, $CFG)) { echo json_encode([]); exit; }
    $d = loadData($CFG);
    echo json_encode($d['channels'] ?? [], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// ========== XTREAM: VOD / SERIES — Return Empty (Player Compatibility) ==========
$emptyActions = [
    'get_vod_categories', 'get_vod_streams', 'get_series_categories', 'get_series',
    'get_vod_info', 'get_series_info', 'get_episodes', 'get_short_epg', 'get_simple_data',
    'get_epg_data', 'get_live_epg', 'get_user_info', 'check_user',
];
if (in_array($action, $emptyActions)) {
    header('Content-Type: application/json; charset=utf-8');
    if (!authCheck($username, $password, $CFG)) { echo json_encode([]); exit; }
    echo json_encode([]);
    exit;
}

// ========== CLI / DEBUG RUN ==========
if (php_sapi_name() === 'cli' || isset($_GET['debug'])) {
    header('Content-Type: application/json');
    echo json_encode(loadData($CFG, true), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ========== FALLBACK ==========
header('Content-Type: application/json');
echo json_encode(['status' => 'running', 'api' => 'Xtream IPTV', 'version' => '2.0.0']);
