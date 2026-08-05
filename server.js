const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultDB = {
    users: [
        {
            username: "demo",
            password: "demo",
            enabled: true,
            exp_date: "2099-12-31T23:59:59.000Z",
            max_connections: 1
        }
    ],

    live_categories: [
        {
            category_id: "1",
            category_name: "Live TV",
            parent_id: 0
        }
    ],

    live_streams: [
        {
            stream_id: 1,
            name: "Example Live Channel",
            category_id: "1",
            stream_type: "live",
            stream_url: "https://example.com/live.m3u8",
            stream_icon: "",
            epg_channel_id: "example"
        }
    ],

    vod_categories: [
        {
            category_id: "1",
            category_name: "Movies",
            parent_id: 0
        }
    ],

    vod_streams: [
        {
            stream_id: 1,
            name: "Example Movie",
            category_id: "1",
            stream_type: "movie",
            stream_url: "https://example.com/movie.m3u8",
            stream_icon: "",
            container_extension: "m3u8"
        }
    ],

    series_categories: [
        {
            category_id: "1",
            category_name: "Series",
            parent_id: 0
        }
    ],

    series: [],

    epg: []
};

function ensureDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(defaultDB, null, 2)
        );
    }
}

function loadDB() {
    ensureDB();

    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );
    } catch (err) {
        console.error("Database read error:", err);
        return JSON.parse(JSON.stringify(defaultDB));
    }
}

function saveDB(db) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

function getBaseURL(req) {
    const forwardedProto = req.headers["x-forwarded-proto"];

    const protocol =
        forwardedProto ||
        req.protocol ||
        "http";

    return `${protocol}://${req.get("host")}`;
}

function findUser(username, password) {
    const db = loadDB();

    return db.users.find(
        user =>
            String(user.username) === String(username) &&
            String(user.password) === String(password)
    );
}

function userIsValid(user) {
    if (!user) return false;
    if (user.enabled === false) return false;

    if (user.exp_date) {
        const expiration = new Date(user.exp_date);

        if (
            !Number.isNaN(expiration.getTime()) &&
            expiration.getTime() < Date.now()
        ) {
            return false;
        }
    }

    return true;
}

function authenticate(req, res) {
    const username = req.query.username;
    const password = req.query.password;

    if (!username || !password) {
        res.status(401).json({
            user_info: {
                auth: 0,
                status: "Disabled",
                message: "Username and password are required"
            }
        });

        return null;
    }

    const user = findUser(username, password);

    if (!userIsValid(user)) {
        res.status(401).json({
            user_info: {
                auth: 0,
                status: "Disabled",
                message: "Invalid username/password or expired account"
            }
        });

        return null;
    }

    return user;
}

function userInfo(user) {
    const expiration = user.exp_date
        ? Math.floor(new Date(user.exp_date).getTime() / 1000)
        : 0;

    return {
        username: user.username,
        password: user.password,
        message: "Welcome",
        auth: 1,
        status: "Active",
        exp_date: String(expiration),
        is_trial: "0",
        active_cons: "0",
        created_at: String(
            Math.floor(Date.now() / 1000)
        ),
        max_connections: String(
            user.max_connections || 1
        ),
        allowed_output_formats: [
            "m3u8",
            "ts"
        ]
    };
}

function serverInfo(req) {
    const base = getBaseURL(req);

    return {
        url: base,
        port: String(PORT),
        https_port: String(PORT),
        server_protocol: req.protocol,
        rtmp_port: "0",
        timezone: "UTC",
        timestamp_now: Math.floor(Date.now() / 1000),
        time_now: new Date().toISOString()
    };
}

function categoryFilter(items, categoryId) {
    if (
        categoryId === undefined ||
        categoryId === null ||
        categoryId === ""
    ) {
        return items;
    }

    return items.filter(
        item =>
            String(item.category_id) === String(categoryId)
    );
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Xtream-compatible API",
        version: "1.0.0"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});

/*
|--------------------------------------------------------------------------
| Xtream Player API
|--------------------------------------------------------------------------
*/

app.get("/player_api.php", (req, res) => {
    const username = req.query.username;
    const password = req.query.password;
    const action = req.query.action;

    const user = authenticate(req, res);

    if (!user) return;

    const db = loadDB();

    /*
     * Login request
     */

    if (!action) {
        return res.json({
            user_info: userInfo(user),
            server_info: serverInfo(req)
        });
    }

    /*
     * Live categories
     */

    if (action === "get_live_categories") {
        return res.json(db.live_categories);
    }

    /*
     * Live streams
     */

    if (action === "get_live_streams") {
        const streams = categoryFilter(
            db.live_streams,
            req.query.category_id
        );

        return res.json(
            streams.map(stream => ({
                num: stream.stream_id,
                name: stream.name,
                stream_type: "live",
                stream_id: stream.stream_id,
                stream_icon: stream.stream_icon || "",
                epg_channel_id:
                    stream.epg_channel_id || "",
                added: stream.added || "",
                category_id: String(
                    stream.category_id || "0"
                ),
                tv_archive: 0,
                direct_source:
                    stream.stream_url || "",
                tv_archive_duration: 0
            }))
        );
    }

    /*
     * VOD categories
     */

    if (action === "get_vod_categories") {
        return res.json(db.vod_categories);
    }

    /*
     * VOD streams
     */

    if (action === "get_vod_streams") {
        const streams = categoryFilter(
            db.vod_streams,
            req.query.category_id
        );

        return res.json(
            streams.map(stream => ({
                num: stream.stream_id,
                name: stream.name,
                stream_type: "movie",
                stream_id: stream.stream_id,
                stream_icon: stream.stream_icon || "",
                rating: stream.rating || "0",
                rating_5based: stream.rating_5based || "0",
                added: stream.added || "",
                category_id: String(
                    stream.category_id || "0"
                ),
                container_extension:
                    stream.container_extension || "m3u8",
                custom_sid: "",
                direct_source:
                    stream.stream_url || ""
            }))
        );
    }

    /*
     * VOD information
     */

    if (action === "get_vod_info") {
        const streamId = String(
            req.query.vod_id || ""
        );

        const stream = db.vod_streams.find(
            item =>
                String(item.stream_id) === streamId
        );

        if (!stream) {
            return res.json({
                info: {},
                movie_data: {}
            });
        }

        return res.json({
            info: {
                name: stream.name,
                movie_image:
                    stream.stream_icon || "",
                rating:
                    stream.rating || "0",
                genre:
                    stream.genre || "",
                plot:
                    stream.plot || "",
                cast:
                    stream.cast || "",
                director:
                    stream.director || "",
                releasedate:
                    stream.releasedate || "",
                duration_secs:
                    stream.duration_secs || 0,
                duration:
                    stream.duration || "",
                container_extension:
                    stream.container_extension || "m3u8"
            },

            movie_data: {
                stream_id: stream.stream_id,
                name: stream.name,
                added: stream.added || "",
                category_id:
                    stream.category_id || "0",
                container_extension:
                    stream.container_extension || "m3u8"
            }
        });
    }

    /*
     * Series categories
     */

    if (action === "get_series_categories") {
        return res.json(db.series_categories);
    }

    /*
     * Series
     */

    if (action === "get_series") {
        const categoryId =
            req.query.category_id;

        let series = db.series || [];

        if (categoryId) {
            series = series.filter(
                item =>
                    String(item.category_id) ===
                    String(categoryId)
            );
        }

        return res.json(series);
    }

    /*
     * Series information
     */

    if (action === "get_series_info") {
        const seriesId =
            req.query.series_id;

        const item = (db.series || []).find(
            series =>
                String(series.series_id) ===
                String(seriesId)
        );

        if (!item) {
            return res.json({
                seasons: [],
                episodes: {}
            });
        }

        return res.json({
            seasons: item.seasons || [],
            episodes: item.episodes || {}
        });
    }

    /*
     * EPG
     */

    if (
        action === "get_short_epg" ||
        action === "get_simple_data_table"
    ) {
        const streamId =
            req.query.stream_id;

        const epg = (db.epg || []).filter(
            item =>
                !streamId ||
                String(item.stream_id) ===
                String(streamId)
        );

        return res.json(epg);
    }

    /*
     * Unknown action
     */

    return res.json({});
});

/*
|--------------------------------------------------------------------------
| M3U Playlist
|--------------------------------------------------------------------------
*/

app.get("/get.php", (req, res) => {
    const user = authenticate(req, res);

    if (!user) return;

    const db = loadDB();
    const base = getBaseURL(req);

    let output = "#EXTM3U\n";

    for (const stream of db.live_streams) {
        const streamURL =
            `${base}/live/${encodeURIComponent(user.username)}/${encodeURIComponent(user.password)}/${stream.stream_id}.m3u8`;

        output +=
            `#EXTINF:-1 tvg-id="${stream.epg_channel_id || ""}" tvg-name="${stream.name}" tvg-logo="${stream.stream_icon || ""}" group-title="${stream.category_id || "Live TV"}",${stream.name}\n`;

        output += `${streamURL}\n`;
    }

    for (const stream of db.vod_streams) {
        const ext =
            stream.container_extension || "m3u8";

        const streamURL =
            `${base}/movie/${encodeURIComponent(user.username)}/${encodeURIComponent(user.password)}/${stream.stream_id}.${ext}`;

        output +=
            `#EXTINF:-1 tvg-name="${stream.name}" tvg-logo="${stream.stream_icon || ""}" group-title="Movies",${stream.name}\n`;

        output += `${streamURL}\n`;
    }

    res.setHeader(
        "Content-Type",
        "audio/x-mpegurl"
    );

    res.send(output);
});

/*
|--------------------------------------------------------------------------
| XMLTV / EPG
|--------------------------------------------------------------------------
*/

app.get("/xmltv.php", (req, res) => {
    const user = authenticate(req, res);

    if (!user) return;

    const db = loadDB();

    let xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<tv generator-info-name="Xtream Compatible Server">\n`;

    const streams = db.live_streams || [];

    for (const stream of streams) {
        const id =
            stream.epg_channel_id ||
            String(stream.stream_id);

        xml +=
            `  <channel id="${escapeXML(id)}">\n` +
            `    <display-name>${escapeXML(stream.name)}</display-name>\n` +
            `  </channel>\n`;
    }

    for (const program of db.epg || []) {
        const stream =
            streams.find(
                item =>
                    String(item.stream_id) ===
                    String(program.stream_id)
            );

        if (!stream) continue;

        const channel =
            stream.epg_channel_id ||
            String(stream.stream_id);

        xml +=
            `  <programme start="${escapeXML(program.start || "")}" stop="${escapeXML(program.stop || "")}" channel="${escapeXML(channel)}">\n` +
            `    <title>${escapeXML(program.title || "")}</title>\n` +
            `    <desc>${escapeXML(program.description || "")}</desc>\n` +
            `  </programme>\n`;
    }

    xml += "</tv>";

    res.setHeader(
        "Content-Type",
        "application/xml"
    );

    res.send(xml);
});

/*
|--------------------------------------------------------------------------
| Stream routes
|--------------------------------------------------------------------------
|
| These redirect the player to the authorized source URL.
|
*/

app.get(
    "/live/:username/:password/:streamId.m3u8",
    streamHandler
);

app.get(
    "/live/:username/:password/:streamId.ts",
    streamHandler
);

app.get(
    "/movie/:username/:password/:streamId.:extension",
    streamHandler
);

async function streamHandler(req, res) {
    const {
        username,
        password,
        streamId
    } = req.params;

    const user = findUser(
        username,
        password
    );

    if (!userIsValid(user)) {
        return res.status(401).send(
            "Unauthorized"
        );
    }

    const db = loadDB();

    const isMovie =
        req.path.startsWith("/movie/");

    const list =
        isMovie
            ? db.vod_streams
            : db.live_streams;

    const stream = list.find(
        item =>
            String(item.stream_id) ===
            String(streamId)
    );

    if (!stream || !stream.stream_url) {
        return res.status(404).send(
            "Stream not found"
        );
    }

    /*
     * Redirect to the source supplied in your database.
     */

    return res.redirect(
        302,
        stream.stream_url
    );
}

/*
|--------------------------------------------------------------------------
| Admin authentication
|--------------------------------------------------------------------------
*/

function admin(req, res, next) {
    const key =
        req.headers["x-admin-key"] ||
        req.query.admin_key;

    if (
        !key ||
        key !== ADMIN_KEY
    ) {
        return res.status(403).json({
            error: "Invalid admin key"
        });
    }

    next();
}

/*
|--------------------------------------------------------------------------
| Admin - database
|--------------------------------------------------------------------------
*/

app.get(
    "/admin/database",
    admin,
    (req, res) => {
        res.json(loadDB());
    }
);

/*
|--------------------------------------------------------------------------
| Admin - create user
|--------------------------------------------------------------------------
*/

app.post(
    "/admin/users",
    admin,
    (req, res) => {
        const {
            username,
            password,
            exp_date,
            max_connections
        } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error:
                    "username and password required"
            });
        }

        const db = loadDB();

        if (
            db.users.some(
                u =>
                    u.username === username
            )
        ) {
            return res.status(409).json({
                error:
                    "Username already exists"
            });
        }

        const user = {
            username,
            password,
            enabled: true,
            exp_date:
                exp_date ||
                "2099-12-31T23:59:59.000Z",
            max_connections:
                Number(max_connections) || 1
        };

        db.users.push(user);

        saveDB(db);

        res.json({
            success: true,
            user
        });
    }
);

/*
|--------------------------------------------------------------------------
| Admin - add live stream
|--------------------------------------------------------------------------
*/

app.post(
    "/admin/live",
    admin,
    (req, res) => {
        const db = loadDB();

        const stream = {
            stream_id:
                Number(req.body.stream_id) ||
                Date.now(),

            name:
                req.body.name ||
                "Unnamed Channel",

            category_id:
                String(
                    req.body.category_id || "1"
                ),

            stream_type: "live",

            stream_url:
                req.body.stream_url || "",

            stream_icon:
                req.body.stream_icon || "",

            epg_channel_id:
                req.body.epg_channel_id || ""
        };

        db.live_streams.push(stream);

        saveDB(db);

        res.json({
            success: true,
            stream
        });
    }
);

/*
|--------------------------------------------------------------------------
| Admin - add VOD
|--------------------------------------------------------------------------
*/

app.post(
    "/admin/vod",
    admin,
    (req, res) => {
        const db = loadDB();

        const stream = {
            stream_id:
                Number(req.body.stream_id) ||
                Date.now(),

            name:
                req.body.name ||
                "Unnamed Movie",

            category_id:
                String(
                    req.body.category_id || "1"
                ),

            stream_type: "movie",

            stream_url:
                req.body.stream_url || "",

            stream_icon:
                req.body.stream_icon || "",

            container_extension:
                req.body.container_extension ||
                "m3u8",

            rating:
                req.body.rating || "0",

            genre:
                req.body.genre || "",

            plot:
                req.body.plot || ""
        };

        db.vod_streams.push(stream);

        saveDB(db);

        res.json({
            success: true,
            stream
        });
    }
);

/*
|--------------------------------------------------------------------------
| Admin - add category
|--------------------------------------------------------------------------
*/

app.post(
    "/admin/live-category",
    admin,
    (req, res) => {
        const db = loadDB();

        const category = {
            category_id:
                String(
                    req.body.category_id ||
                    Date.now()
                ),

            category_name:
                req.body.category_name ||
                "Live TV",

            parent_id: 0
        };

        db.live_categories.push(
            category
        );

        saveDB(db);

        res.json({
            success: true,
            category
        });
    }
);

/*
|--------------------------------------------------------------------------
| XML escaping
|--------------------------------------------------------------------------
*/

function escapeXML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log(
        `Xtream-compatible server running on port ${PORT}`
    );
});
