<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");

// ==========================
// 📝 YOUR LOGIN CREDENTIALS — EDIT THESE OR SET IN RENDER ENV
// ==========================
$VALID_USER = $_ENV["IPTV_USERNAME"] ?? "admin";
$VALID_PASS = $_ENV["IPTV_PASSWORD"] ?? "123456";

// 🎯 DIRECT TO M3U.WORK ORIGINAL — NO CHANGES, NO PROXY
$M3U_URL = $_ENV["M3U_URL"] ?? "https://m3u.work/AxXzaON";

$TIMEZONE = $_ENV["TIMEZONE"] ?? "Asia/Manila";
date_default_timezone_set($TIMEZONE);

// ==========================
// READ INPUT PARAMETERS
// ==========================
$user      = trim($_GET["username"] ?? "");
$pass      = trim($_GET["password"] ?? "");
$action    = $_GET["action"] ?? "";
$catFilter = $_GET["category_id"] ?? "";
$force     = isset($_GET["refresh"]) || isset($_GET["m3u_plus"]);

// ==========================
// 🔑 AUTHENTICATION — EXACT MATCH REQUIRED
// ==========================
if ($user !== $VALID_USER || $pass !== $VALID_PASS) {
    echo json_encode([
        "user_info" => ["auth" => 0, "status" => "Disabled", "message" => "Invalid login"]
    ], JSON_PRETTY_PRINT);
    exit;
}

// ==========================
// SERVER & USER INFO — STANDARD XTREAM FORMAT
// ==========================
$proto = (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off") ||
         ($_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "") === "https" ? "https" : "http";
$host  = $_SERVER["HTTP_HOST"] ?? "localhost";
$base  = "$proto://$host";

$userInfo = [
    "username"              => $user,
    "password"              => $pass,
    "auth"                  => 1,
    "status"                => "Active",
    "exp_date"              => 2000000000,
    "is_trial"              => 0,
    "active_cons"           => 1,
    "created_at"            => time(),
    "max_connections"       => 1,
    "allowed_output_formats"=> ["m3u8", "ts", "mp4", "mkv"]
];

$serverInfo = [
    "url"             => parse_url($base, PHP_URL_HOST),
    "port"            => $proto === "https" ? 443 : 80,
    "https_port"      => 443,
    "server_protocol" => $proto,
    "rtmp_port"       => 0,
    "timezone"        => $TIMEZONE,
    "process"         => $base . "/index.php",
    "version"         => "2.9.0"
];

// ==========================
// 🎯 FETCH DIRECTLY FROM M3U.WORK — NO MODIFICATIONS
// ==========================
function fetchM3U($url) {
    $ctx = stream_context_create([
        "http" => [
            "timeout" => 30,
            "ignore_errors" => true,
            "user_agent" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "follow_location" => 1,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false || trim($raw) === "") {
        return false;
    }
    return explode("\n", $raw);
}

// ==========================
// PARSE M3U INTO XTREAM FORMAT
// ==========================
function parseM3U($lines) {
    $channels = [];
    $categories = [];
    $catMap = [];
    $catId = 1;
    $usedIds = [];

    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, "#EXTINF:") === 0) {
            $attr = [];
            if (preg_match_all('/([\w\-]+)\s*=\s*"([^"]*)"/', $line, $m)) {
                foreach ($m[1] as $i => $k) {
                    $attr[$k] = $m[2][$i];
                }
            }
            $chName = "";
            if (preg_match("/,(.+)$/", $line, $mm)) {
                $chName = trim($mm[1]);
            }

            $tvgId   = !empty($attr["tvg-id"]) ? $attr["tvg-id"] : (!empty($attr["CUID"]) ? $attr["CUID"] : "");
            $tvgLogo = $attr["tvg-logo"] ?? "";
            $group   = trim($attr["group-title"] ?? "Uncategorized");

            if (empty($chName)) continue;

            if (!isset($catMap[$group])) {
                $catMap[$group] = (string)$catId++;
                $categories[] = [
                    "category_id"   => (string)$catMap[$group],
                    "category_name" => $group,
                    "parent_id"     => "0"
                ];
            }

            // Generate unique stream_id
            $hash = sprintf("%u", crc32($chName));
            $streamId = $hash % 1000000000;
            while (isset($usedIds[$streamId])) {
                $streamId = ($streamId + 1) % 1000000000;
            }
            $usedIds[$streamId] = true;

            $channels[] = [
                "num"                 => $streamId,
                "name"                => $chName,
                "stream_type"         => "live",
                "stream_id"           => $streamId,
                "stream_icon"         => $tvgLogo,
                "epg_channel_id"      => $tvgId,
                "added"               => time(),
                "category_id"         => (string)$catMap[$group],
                "custom_sid"          => "",
                "tv_archive"          => 0,
                "direct_source"       => "",
                "tv_archive_duration" => 0,
                "video_url"           => ""
            ];
        } elseif ($line && strpos($line, "#") !== 0) {
            $idx = count($channels) - 1;
            if ($idx >= 0 && !empty($line)) {
                $channels[$idx]["direct_source"] = $line;
                $channels[$idx]["video_url"]     = $line;
            }
        }
    }

    // Filter valid channels only
    $channels = array_values(array_filter($channels, function($c) {
        return !empty($c["name"]) && !empty($c["direct_source"]) && !empty($c["stream_id"]);
    }));

    return ["channels" => $channels, "categories" => $categories];
}

// ==========================
// CACHE MANAGEMENT
// ==========================
$cacheFile = __DIR__ . "/cache.json";
if ($force || !is_file($cacheFile) || (time() - @filemtime($cacheFile)) > 3600) {
    $lines = fetchM3U($M3U_URL);
    if ($lines === false) {
        // Fallback to old cache if source unreachable
        if (is_file($cacheFile)) {
            $data = json_decode(file_get_contents($cacheFile), true);
        } else {
            echo json_encode(["error" => "Source unreachable", "url" => $M3U_URL]);
            exit;
        }
    } else {
        $data = parseM3U($lines);
        @file_put_contents($cacheFile, json_encode($data));
    }
} else {
    $data = json_decode(file_get_contents($cacheFile), true);
}

$live_channels = $data["channels"];
$live_cats     = $data["categories"];

// ==========================
// 📡 API RESPONSES
// ==========================
switch ($action) {
    // LOGIN / SERVER INFO
    case "":
    case "get":
        echo json_encode([
            "server_info" => $serverInfo,
            "user_info"   => $userInfo
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;

    // LIVE CATEGORIES
    case "get_live_categories":
        echo json_encode($live_cats, JSON_UNESCAPED_UNICODE);
        break;

    // LIVE STREAMS
    case "get_live_streams":
        $out = $live_channels;
        if ($catFilter !== "") {
            $out = array_values(array_filter($out, function($i) use ($catFilter) {
                return (string)$i["category_id"] === (string)$catFilter;
            }));
        }
        echo json_encode($out, JSON_UNESCAPED_UNICODE);
        break;

    // M3U DOWNLOAD DIRECT
    case "m3u":
        header("Content-Type: application/vnd.apple.mpegurl; charset=utf-8");
        header("Content-Disposition: attachment; filename=\"playlist.m3u8\"");
        echo "#EXTM3U\n# Source: m3u.work/AxXzaON\n# Generated: " . date("c") . "\n";
        foreach ($live_channels as $c) {
            $logo = $c["stream_icon"] ? ' tvg-logo="' . $c["stream_icon"] . '"' : "";
            echo "#EXTINF:-1 tvg-id=\"{$c["epg_channel_id"]}\"$logo group-title=\"{$c["category_id"]}\",{$c["name"]}\n";
            echo $c["direct_source"] . "\n";
        }
        break;

    // REFRESH / DEBUG
    case "refresh":
    case "m3u_plus":
        echo json_encode([
            "ok" => true,
            "count" => count($live_channels),
            "categories" => count($live_cats),
            "source" => $M3U_URL,
            "channels" => $live_channels
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        break;

    // ALL OTHER ACTIONS — COMPATIBILITY
    default:
        echo json_encode([]);
}
