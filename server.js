"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const ADMIN_KEY =
  process.env.ADMIN_KEY || "change-this-admin-key";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

/* =========================================================
   EXPRESS
========================================================= */

app.disable("x-powered-by");

app.set("trust proxy", true);

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

/* =========================================================
   DATABASE
========================================================= */

const EMPTY_DATABASE = {
  users: [],

  live_categories: [],
  live_streams: [],

  vod_categories: [],
  vod_streams: [],

  series_categories: [],
  series: [],

  epg: []
};

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        EMPTY_DATABASE,
        null,
        2
      ),
      "utf8"
    );
  }
}

function loadDatabase() {
  ensureDatabase();

  try {
    const raw = fs.readFileSync(
      DB_FILE,
      "utf8"
    );

    const db = JSON.parse(raw);

    return {
      ...EMPTY_DATABASE,
      ...db,

      users: Array.isArray(db.users)
        ? db.users
        : [],

      live_categories:
        Array.isArray(db.live_categories)
          ? db.live_categories
          : [],

      live_streams:
        Array.isArray(db.live_streams)
          ? db.live_streams
          : [],

      vod_categories:
        Array.isArray(db.vod_categories)
          ? db.vod_categories
          : [],

      vod_streams:
        Array.isArray(db.vod_streams)
          ? db.vod_streams
          : [],

      series_categories:
        Array.isArray(db.series_categories)
          ? db.series_categories
          : [],

      series:
        Array.isArray(db.series)
          ? db.series
          : [],

      epg:
        Array.isArray(db.epg)
          ? db.epg
          : []
    };
  } catch (error) {
    console.error(
      "Database error:",
      error.message
    );

    return {
      ...EMPTY_DATABASE
    };
  }
}

let db = loadDatabase();

function saveDatabase() {
  const temporaryFile =
    `${DB_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(
      db,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temporaryFile,
    DB_FILE
  );
}

/* =========================================================
   HELPERS
========================================================= */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function numericId(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function findById(list, id, key = "stream_id") {
  const wanted = clean(id);

  return list.find(
    item =>
      clean(item[key]) === wanted
  );
}

function categoryFilter(
  list,
  categoryId
) {
  const category = clean(
    categoryId
  );

  if (!category) {
    return list;
  }

  return list.filter(
    item =>
      clean(item.category_id) ===
      category
  );
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getBaseUrl(req) {
  const protocol =
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http";

  return `${protocol}://${req.get("host")}`;
}

function getExtension(stream) {
  return clean(
    stream.container_extension
  ).replace(/^\./, "") || "m3u8";
}

/* =========================================================
   USER / AUTH
========================================================= */

function findUser(
  username,
  password
) {
  const u = clean(username);
  const p = clean(password);

  return db.users.find(
    user =>
      clean(user.username) === u &&
      clean(user.password) === p
  );
}

function isUserActive(user) {
  if (!user) {
    return false;
  }

  if (user.enabled === false) {
    return false;
  }

  if (user.exp_date) {
    const expiration =
      new Date(user.exp_date);

    if (
      !Number.isNaN(
        expiration.getTime()
      ) &&
      expiration.getTime() <
        Date.now()
    ) {
      return false;
    }
  }

  return true;
}

function authenticateQuery(
  req,
  res
) {
  const username =
    req.query.username;

  const password =
    req.query.password;

  if (
    !username ||
    !password
  ) {
    res.status(401).json({
      user_info: {
        auth: 0,
        status: "Disabled",
        message:
          "Username and password required"
      }
    });

    return null;
  }

  const user = findUser(
    username,
    password
  );

  if (!isUserActive(user)) {
    res.status(401).json({
      user_info: {
        auth: 0,
        status: "Disabled",
        message:
          "Invalid or expired account"
      }
    });

    return null;
  }

  return user;
}

function authenticatePath(
  req,
  res
) {
  const username =
    req.params.username;

  const password =
    req.params.password;

  const user = findUser(
    username,
    password
  );

  if (!isUserActive(user)) {
    res.status(401).send(
      "Unauthorized"
    );

    return null;
  }

  return user;
}

function unixExpiration(user) {
  if (!user.exp_date) {
    return "0";
  }

  const date =
    new Date(user.exp_date);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "0";
  }

  return String(
    Math.floor(
      date.getTime() / 1000
    )
  );
}

function buildUserInfo(user) {
  return {
    username: user.username,
    password: user.password,
    message: "Welcome",
    auth: 1,
    status: "Active",

    exp_date:
      unixExpiration(user),

    is_trial: "0",

    active_cons:
      String(
        user.active_cons || 0
      ),

    created_at:
      String(
        user.created_at || 0
      ),

    max_connections:
      String(
        user.max_connections || 1
      ),

    allowed_output_formats: [
      "m3u8",
      "ts",
      "mp4"
    ]
  };
}

/* =========================================================
   SERVER INFO
========================================================= */

function buildServerInfo(req) {
  const base =
    getBaseUrl(req);

  return {
    url: base,

    port: String(PORT),

    https_port:
      req.secure
        ? String(PORT)
        : String(PORT),

    server_protocol:
      req.secure
        ? "https"
        : "http",

    rtmp_port: "0",

    timezone:
      process.env.TZ ||
      "UTC",

    timestamp_now:
      Math.floor(
        Date.now() / 1000
      ),

    time_now:
      new Date().toISOString()
  };
}

/* =========================================================
   LOGIN
========================================================= */

app.get(
  "/player_api.php",
  (req, res) => {
    const user =
      authenticateQuery(
        req,
        res
      );

    if (!user) {
      return;
    }

    const action =
      clean(req.query.action);

    /*
     * Standard login
     */

    if (!action) {
      return res.json({
        user_info:
          buildUserInfo(user),

        server_info:
          buildServerInfo(req)
      });
    }

    /* =====================================================
       LIVE CATEGORIES
    ===================================================== */

    if (
      action ===
      "get_live_categories"
    ) {
      return res.json(
        db.live_categories
      );
    }

    /* =====================================================
       LIVE STREAMS
    ===================================================== */

    if (
      action ===
      "get_live_streams"
    ) {
      const streams =
        categoryFilter(
          db.live_streams,
          req.query.category_id
        );

      const output =
        streams.map(
          (stream, index) => ({
            num:
              Number(
                stream.stream_id
              ) || index + 1,

            name:
              stream.name || "",

            stream_type:
              "live",

            stream_id:
              Number(
                stream.stream_id
              ) || index + 1,

            stream_icon:
              stream.stream_icon || "",

            epg_channel_id:
              stream.epg_channel_id ||
              "",

            added:
              stream.added || "",

            category_id:
              clean(
                stream.category_id
              ),

            tv_archive: 0,

            direct_source:
              stream.stream_url ||
              "",

            tv_archive_duration: 0
          })
        );

      return res.json(output);
    }

    /* =====================================================
       VOD CATEGORIES
    ===================================================== */

    if (
      action ===
      "get_vod_categories"
    ) {
      return res.json(
        db.vod_categories
      );
    }

    /* =====================================================
       VOD STREAMS
    ===================================================== */

    if (
      action ===
      "get_vod_streams"
    ) {
      const streams =
        categoryFilter(
          db.vod_streams,
          req.query.category_id
        );

      const output =
        streams.map(
          (stream, index) => ({
            num:
              Number(
                stream.stream_id
              ) || index + 1,

            name:
              stream.name || "",

            stream_type:
              "movie",

            stream_id:
              Number(
                stream.stream_id
              ) || index + 1,

            stream_icon:
              stream.stream_icon ||
              "",

            rating:
              stream.rating ||
              "0",

            rating_5based:
              stream.rating_5based ||
              "0",

            added:
              stream.added ||
              "",

            category_id:
              clean(
                stream.category_id
              ),

            container_extension:
              getExtension(stream),

            custom_sid: "",

            direct_source:
              stream.stream_url ||
              ""
          })
        );

      return res.json(output);
    }

    /* =====================================================
       VOD INFO
    ===================================================== */

    if (
      action ===
      "get_vod_info"
    ) {
      const stream =
        findById(
          db.vod_streams,
          req.query.vod_id
        );

      if (!stream) {
        return res.json({
          info: {},
          movie_data: {}
        });
      }

      return res.json({
        info: {
          name:
            stream.name || "",

          movie_image:
            stream.stream_icon ||
            "",

          rating:
            stream.rating ||
            "0",

          genre:
            stream.genre ||
            "",

          plot:
            stream.plot ||
            "",

          cast:
            stream.cast ||
            "",

          director:
            stream.director ||
            "",

          releasedate:
            stream.releasedate ||
            stream.releaseDate ||
            "",

          duration_secs:
            stream.duration_secs ||
            0,

          duration:
            stream.duration ||
            "",

          container_extension:
            getExtension(stream)
        },

        movie_data: {
          stream_id:
            Number(
              stream.stream_id
            ),

          name:
            stream.name || "",

          added:
            stream.added ||
            "",

          category_id:
            clean(
              stream.category_id
            ),

          container_extension:
            getExtension(stream)
        }
      });
    }

    /* =====================================================
       SERIES CATEGORIES
    ===================================================== */

    if (
      action ===
      "get_series_categories"
    ) {
      return res.json(
        db.series_categories
      );
    }

    /* =====================================================
       SERIES LIST
    ===================================================== */

    if (
      action === "get_series"
    ) {
      let series =
        db.series;

      if (
        req.query.category_id
      ) {
        series =
          series.filter(
            item =>
              clean(
                item.category_id
              ) ===
              clean(
                req.query.category_id
              )
          );
      }

      const output =
        series.map(
          item => ({
            num:
              Number(
                item.series_id
              ),

            name:
              item.name || "",

            series_id:
              Number(
                item.series_id
              ),

            cover:
              item.cover || "",

            plot:
              item.plot || "",

            cast:
              item.cast || "",

            director:
              item.director || "",

            genre:
              item.genre || "",

            releaseDate:
              item.releaseDate ||
              item.releasedate ||
              "",

            category_id:
              clean(
                item.category_id
              ),

            last_modified:
              item.last_modified ||
              "",

            rating:
              item.rating ||
              "0",

            rating_5based:
              item.rating_5based ||
              "0",

            backdrop_path:
              item.backdrop_path ||
              [],

            youtube_trailer:
              item.youtube_trailer ||
              "",

            episode_run_time:
              item.episode_run_time ||
              0,

            seasons:
              item.seasons || []
          })
        );

      return res.json(output);
    }

    /* =====================================================
       SERIES INFO
    ===================================================== */

    if (
      action ===
      "get_series_info"
    ) {
      const series =
        findById(
          db.series,
          req.query.series_id,
          "series_id"
        );

      if (!series) {
        return res.json({
          seasons: [],
          episodes: {}
        });
      }

      return res.json({
        seasons:
          series.seasons || [],

        episodes:
          normalizeEpisodes(
            series
          ),

        info: {
          name:
            series.name || "",

          cover:
            series.cover || "",

          plot:
            series.plot || "",

          cast:
            series.cast || "",

          director:
            series.director || "",

          genre:
            series.genre || "",

          releaseDate:
            series.releaseDate ||
            series.releasedate ||
            "",

          category_id:
            clean(
              series.category_id
            ),

          rating:
            series.rating ||
            "0"
        }
      });
    }

    /* =====================================================
       SHORT EPG
    ===================================================== */

    if (
      action ===
        "get_short_epg" ||
      action ===
        "get_simple_data_table"
    ) {
      let epg =
        db.epg;

      if (
        req.query.stream_id
      ) {
        epg =
          epg.filter(
            item =>
              clean(
                item.stream_id
              ) ===
              clean(
                req.query.stream_id
              )
          );
      }

      const limit =
        Number(
          req.query.limit
        ) || 0;

      if (
        limit > 0
      ) {
        epg =
          epg.slice(
            0,
            limit
          );
      }

      return res.json(epg);
    }

    /*
     * Unknown action
     */

    return res.json({});
  }
);

/* =========================================================
   SERIES NORMALIZATION
========================================================= */

function normalizeEpisodes(
  series
) {
  const result = {};

  const seasons =
    series.episodes || {};

  for (
    const [seasonNumber, episodes]
    of Object.entries(seasons)
  ) {
    result[seasonNumber] =
      Array.isArray(episodes)
        ? episodes.map(
            episode => ({
              id:
                Number(
                  episode.id
                ),

              episode_num:
                Number(
                  episode.episode_num
                ),

              title:
                episode.title ||
                "",

              container_extension:
                episode.container_extension ||
                "mp4",

              info:
                episode.info || {},

              custom_sid:
                episode.custom_sid ||
                "",

              added:
                episode.added ||
                "",

              season:
                Number(
                  seasonNumber
                ),

              direct_source:
                episode.stream_url ||
                ""
            })
          )
        : [];
  }

  return result;
}

/* =========================================================
   M3U
========================================================= */

app.get(
  "/get.php",
  (req, res) => {
    const user =
      authenticateQuery(
        req,
        res
      );

    if (!user) {
      return;
    }

    const base =
      getBaseUrl(req);

    const lines = [
      "#EXTM3U"
    ];

    /*
     * LIVE
     */

    for (
      const stream
      of db.live_streams
    ) {
      const id =
        Number(
          stream.stream_id
        );

      const url =
        `${base}/live/${encodeURIComponent(
          user.username
        )}/${encodeURIComponent(
          user.password
        )}/${id}.m3u8`;

      lines.push(
        `#EXTINF:-1 tvg-id="${escapeM3u(
          stream.epg_channel_id || ""
        )}" tvg-name="${escapeM3u(
          stream.name || ""
        )}" tvg-logo="${escapeM3u(
          stream.stream_icon || ""
        )}" group-title="${escapeM3u(
          getCategoryName(
            db.live_categories,
            stream.category_id
          )
        )}",${escapeM3u(
          stream.name || ""
        )}`
      );

      lines.push(url);
    }

    /*
     * MOVIES
     */

    for (
      const stream
      of db.vod_streams
    ) {
      const id =
        Number(
          stream.stream_id
        );

      const ext =
        getExtension(stream);

      const url =
        `${base}/movie/${encodeURIComponent(
          user.username
        )}/${encodeURIComponent(
          user.password
        )}/${id}.${ext}`;

      lines.push(
        `#EXTINF:-1 tvg-name="${escapeM3u(
          stream.name || ""
        )}" tvg-logo="${escapeM3u(
          stream.stream_icon || ""
        )}" group-title="${escapeM3u(
          getCategoryName(
            db.vod_categories,
            stream.category_id
          )
        )}",${escapeM3u(
          stream.name || ""
        )}`
      );

      lines.push(url);
    }

    /*
     * SERIES
     */

    for (
      const series
      of db.series
    ) {
      const seasons =
        series.episodes || {};

      for (
        const [
          seasonNumber,
          episodes
        ]
        of Object.entries(seasons)
      ) {
        if (
          !Array.isArray(
            episodes
          )
        ) {
          continue;
        }

        for (
          const episode
          of episodes
        ) {
          const ext =
            clean(
              episode.container_extension
            ) || "mp4";

          const episodeId =
            Number(
              episode.id
            );

          const url =
            `${base}/series/${encodeURIComponent(
              user.username
            )}/${encodeURIComponent(
              user.password
            )}/${episodeId}.${ext}`;

          lines.push(
            `#EXTINF:-1 tvg-name="${escapeM3u(
              episode.title || ""
            )}" tvg-logo="${escapeM3u(
              series.cover || ""
            )}" group-title="${escapeM3u(
              series.name || ""
            )} - Season ${escapeM3u(
              seasonNumber
            )}",${escapeM3u(
              episode.title || ""
            )}`
          );

          lines.push(url);
        }
      }
    }

    res.setHeader(
      "Content-Type",
      "application/x-mpegURL"
    );

    res.setHeader(
      "Content-Disposition",
      'inline; filename="playlist.m3u"'
    );

    res.send(
      lines.join("\n") +
      "\n"
    );
  }
);

/* =========================================================
   XMLTV
========================================================= */

app.get(
  "/xmltv.php",
  (req, res) => {
    const user =
      authenticateQuery(
        req,
        res
      );

    if (!user) {
      return;
    }

    let xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n';

    xml +=
      '<tv generator-info-name="Xtream Compatible Server">\n';

    /*
     * CHANNELS
     */

    for (
      const channel
      of db.live_streams
    ) {
      const channelId =
        channel.epg_channel_id ||
        String(
          channel.stream_id
        );

      xml +=
        `  <channel id="${escapeXml(
          channelId
        )}">\n`;

      xml +=
        `    <display-name>${escapeXml(
          channel.name
        )}</display-name>\n`;

      if (
        channel.stream_icon
      ) {
        xml +=
          `    <icon src="${escapeXml(
            channel.stream_icon
          )}"/>\n`;
      }

      xml +=
        "  </channel>\n";
    }

    /*
     * PROGRAMS
     */

    for (
      const program
      of db.epg
    ) {
      const stream =
        findById(
          db.live_streams,
          program.stream_id
        );

      if (!stream) {
        continue;
      }

      const channelId =
        stream.epg_channel_id ||
        String(
          stream.stream_id
        );

      xml +=
        `  <programme start="${escapeXml(
          program.start || ""
        )}" stop="${escapeXml(
          program.stop || ""
        )}" channel="${escapeXml(
          channelId
        )}">\n`;

      xml +=
        `    <title>${escapeXml(
          program.title || ""
        )}</title>\n`;

      if (
        program.description
      ) {
        xml +=
          `    <desc>${escapeXml(
            program.description
          )}</desc>\n`;
      }

      xml +=
        "  </programme>\n";
    }

    xml +=
      "</tv>\n";

    res.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    res.send(xml);
  }
);

/* =========================================================
   PLAYBACK - LIVE
========================================================= */

app.get(
  "/live/:username/:password/:streamId.:extension",
  async (req, res) => {
    const user =
      authenticatePath(
        req,
        res
      );

    if (!user) {
      return;
    }

    const stream =
      findById(
        db.live_streams,
        req.params.streamId
      );

    if (
      !stream ||
      !stream.stream_url
    ) {
      return res.status(404).send(
        "Live stream not found"
      );
    }

    return redirectStream(
      res,
      stream.stream_url
    );
  }
);

/* =========================================================
   PLAYBACK - MOVIE
========================================================= */

app.get(
  "/movie/:username/:password/:streamId.:extension",
  async (req, res) => {
    const user =
      authenticatePath(
        req,
        res
      );

    if (!user) {
      return;
    }

    const stream =
      findById(
        db.vod_streams,
        req.params.streamId
      );

    if (
      !stream ||
      !stream.stream_url
    ) {
      return res.status(404).send(
        "Movie not found"
      );
    }

    return redirectStream(
      res,
      stream.stream_url
    );
  }
);

/* =========================================================
   PLAYBACK - SERIES
========================================================= */

app.get(
  "/series/:username/:password/:episodeId.:extension",
  async (req, res) => {
    const user =
      authenticatePath(
        req,
        res
      );

    if (!user) {
      return;
    }

    const episode =
      findEpisode(
        req.params.episodeId
      );

    if (
      !episode ||
      !episode.stream_url
    ) {
      return res.status(404).send(
        "Episode not found"
      );
    }

    return redirectStream(
      res,
      episode.stream_url
    );
  }
);

/* =========================================================
   OPTIONAL DIRECT EPISODE ROUTE
========================================================= */

app.get(
  "/episode/:username/:password/:episodeId.:extension",
  async (req, res) => {
    const user =
      authenticatePath(
        req,
        res
      );

    if (!user) {
      return;
    }

    const episode =
      findEpisode(
        req.params.episodeId
      );

    if (
      !episode ||
      !episode.stream_url
    ) {
      return res.status(404).send(
        "Episode not found"
      );
    }

    return redirectStream(
      res,
      episode.stream_url
    );
  }
);

/* =========================================================
   FIND SERIES EPISODE
========================================================= */

function findEpisode(
  episodeId
) {
  const wanted =
    clean(episodeId);

  for (
    const series
    of db.series
  ) {
    const seasons =
      series.episodes || {};

    for (
      const episodes
      of Object.values(
        seasons
      )
    ) {
      if (
        !Array.isArray(
          episodes
        )
      ) {
        continue;
      }

      const episode =
        episodes.find(
          item =>
            clean(
              item.id
            ) === wanted
        );

      if (episode) {
        return episode;
      }
    }
  }

  return null;
}

/* =========================================================
   STREAM REDIRECT
========================================================= */

function redirectStream(
  res,
  url
) {
  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
        "http:" &&
      parsed.protocol !==
        "https:"
    ) {
      return res.status(400).send(
        "Unsupported stream protocol"
      );
    }

    return res.redirect(
      302,
      url
    );
  } catch {
    return res.status(400).send(
      "Invalid stream URL"
    );
  }
}

/* =========================================================
   CATEGORY NAME
========================================================= */

function getCategoryName(
  categories,
  categoryId
) {
  const category =
    categories.find(
      item =>
        clean(
          item.category_id
        ) ===
        clean(categoryId)
    );

  return (
    category?.category_name ||
    "Uncategorized"
  );
}

/* =========================================================
   M3U ESCAPE
========================================================= */

function escapeM3u(value) {
  return String(value ?? "")
    .replace(/"/g, "'")
    .replace(/\r?\n/g, " ")
    .trim();
}

/* =========================================================
   ADMIN AUTH
========================================================= */

function adminAuth(
  req,
  res,
  next
) {
  const supplied =
    req.headers[
      "x-admin-key"
    ] ||
    req.query.admin_key;

  if (
    !supplied ||
    supplied !== ADMIN_KEY
  ) {
    return res.status(403).json({
      error:
        "Invalid admin key"
    });
  }

  next();
}

/* =========================================================
   ADMIN DATABASE
========================================================= */

app.get(
  "/admin/database",
  adminAuth,
  (req, res) => {
    res.json(db);
  }
);

/* =========================================================
   ADMIN RELOAD
========================================================= */

app.post(
  "/admin/reload",
  adminAuth,
  (req, res) => {
    db =
      loadDatabase();

    res.json({
      success: true,
      message:
        "Database reloaded"
    });
  }
);

/* =========================================================
   ADMIN SAVE
========================================================= */

app.post(
  "/admin/save",
  adminAuth,
  (req, res) => {
    try {
      if (
        !req.body ||
        typeof req.body !==
          "object"
      ) {
        return res.status(400).json({
          error:
            "Invalid database object"
        });
      }

      db = {
        ...EMPTY_DATABASE,
        ...req.body
      };

      saveDatabase();

      res.json({
        success: true
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   ADMIN ADD USER
========================================================= */

app.post(
  "/admin/users",
  adminAuth,
  (req, res) => {
    const username =
      clean(
        req.body.username
      );

    const password =
      clean(
        req.body.password
      );

    if (
      !username ||
      !password
    ) {
      return res.status(400).json({
        error:
          "username and password required"
      });
    }

    if (
      db.users.some(
        user =>
          clean(
            user.username
          ) === username
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

      enabled:
        req.body.enabled !==
        false,

      exp_date:
        req.body.exp_date ||
        "2099-12-31T23:59:59.000Z",

      max_connections:
        Number(
          req.body.max_connections
        ) || 1,

      created_at:
        Math.floor(
          Date.now() / 1000
        )
    };

    db.users.push(user);

    saveDatabase();

    res.json({
      success: true,
      user
    });
  }
);

/* =========================================================
   ADMIN ADD LIVE STREAM
========================================================= */

app.post(
  "/admin/live",
  adminAuth,
  (req, res) => {
    const streamId =
      numericId(
        req.body.stream_id
      ) ??
      nextId(
        db.live_streams
      );

    const stream = {
      stream_id: streamId,

      name:
        clean(
          req.body.name
        ) ||
        "Unnamed Channel",

      category_id:
        clean(
          req.body.category_id
        ) || "1",

      stream_type:
        "live",

      stream_url:
        clean(
          req.body.stream_url
        ),

      stream_icon:
        clean(
          req.body.stream_icon
        ),

      epg_channel_id:
        clean(
          req.body.epg_channel_id
        )
    };

    if (!stream.stream_url) {
      return res.status(400).json({
        error:
          "stream_url required"
      });
    }

    db.live_streams.push(
      stream
    );

    saveDatabase();

    res.json({
      success: true,
      stream
    });
  }
);

/* =========================================================
   ADMIN ADD MOVIE
========================================================= */

app.post(
  "/admin/vod",
  adminAuth,
  (req, res) => {
    const streamId =
      numericId(
        req.body.stream_id
      ) ??
      nextId(
        db.vod_streams
      );

    const stream = {
      stream_id: streamId,

      name:
        clean(
          req.body.name
        ) ||
        "Unnamed Movie",

      category_id:
        clean(
          req.body.category_id
        ) || "1",

      stream_type:
        "movie",

      stream_url:
        clean(
          req.body.stream_url
        ),

      stream_icon:
        clean(
          req.body.stream_icon
        ),

      container_extension:
        clean(
          req.body.container_extension
        ) || "m3u8",

      rating:
        clean(
          req.body.rating
        ) || "0",

      genre:
        clean(
          req.body.genre
        ),

      plot:
        clean(
          req.body.plot
        )
    };

    if (!stream.stream_url) {
      return res.status(400).json({
        error:
          "stream_url required"
      });
    }

    db.vod_streams.push(
      stream
    );

    saveDatabase();

    res.json({
      success: true,
      stream
    });
  }
);

/* =========================================================
   ADMIN ADD SERIES
========================================================= */

app.post(
  "/admin/series",
  adminAuth,
  (req, res) => {
    const seriesId =
      numericId(
        req.body.series_id
      ) ??
      nextId(
        db.series,
        "series_id"
      );

    const series = {
      series_id: seriesId,

      name:
        clean(
          req.body.name
        ) ||
        "Unnamed Series",

      cover:
        clean(
          req.body.cover
        ),

      plot:
        clean(
          req.body.plot
        ),

      cast:
        clean(
          req.body.cast
        ),

      director:
        clean(
          req.body.director
        ),

      genre:
        clean(
          req.body.genre
        ),

      releaseDate:
        clean(
          req.body.releaseDate
        ),

      category_id:
        clean(
          req.body.category_id
        ) || "1",

      seasons:
        Array.isArray(
          req.body.seasons
        )
          ? req.body.seasons
          : [],

      episodes:
        req.body.episodes &&
        typeof req.body.episodes ===
          "object"
          ? req.body.episodes
          : {}
    };

    db.series.push(
      series
    );

    saveDatabase();

    res.json({
      success: true,
      series
    });
  }
);

/* =========================================================
   ADMIN ADD SERIES EPISODE
========================================================= */

app.post(
  "/admin/series/:seriesId/episode",
  adminAuth,
  (req, res) => {
    const series =
      findById(
        db.series,
        req.params.seriesId,
        "series_id"
      );

    if (!series) {
      return res.status(404).json({
        error:
          "Series not found"
      });
    }

    const season =
      String(
        req.body.season_number || 1
      );

    if (
      !series.episodes ||
      typeof series.episodes !==
        "object"
    ) {
      series.episodes = {};
    }

    if (
      !Array.isArray(
        series.episodes[season]
      )
    ) {
      series.episodes[season] =
        [];
    }

    const episodeId =
      numericId(
        req.body.id
      ) ??
      nextEpisodeId();

    const episode = {
      id: episodeId,

      episode_num:
        Number(
          req.body.episode_num
        ) ||
        series.episodes[
          season
        ].length + 1,

      title:
        clean(
          req.body.title
        ) ||
        `Episode ${
          series.episodes[
            season
          ].length + 1
        }`,

      container_extension:
        clean(
          req.body.container_extension
        ) || "mp4",

      info:
        req.body.info || {},

      stream_url:
        clean(
          req.body.stream_url
        )
    };

    if (!episode.stream_url) {
      return res.status(400).json({
        error:
          "stream_url required"
      });
    }

    series.episodes[
      season
    ].push(episode);

    /*
     * Keep season metadata synchronized.
     */

    if (
      !Array.isArray(
        series.seasons
      )
    ) {
      series.seasons = [];
    }

    let seasonInfo =
      series.seasons.find(
        item =>
          Number(
            item.season_number
          ) ===
          Number(season)
      );

    if (!seasonInfo) {
      seasonInfo = {
        season_number:
          Number(season),

        name:
          `Season ${season}`,

        episode_count: 0
      };

      series.seasons.push(
        seasonInfo
      );
    }

    seasonInfo.episode_count =
      series.episodes[
        season
      ].length;

    saveDatabase();

    res.json({
      success: true,
      episode
    });
  }
);

/* =========================================================
   ADMIN CATEGORY
========================================================= */

app.post(
  "/admin/category",
  adminAuth,
  (req, res) => {
    const type =
      clean(
        req.body.type
      );

    const category = {
      category_id:
        clean(
          req.body.category_id
        ) ||
        String(
          Date.now()
        ),

      category_name:
        clean(
          req.body.category_name
        ) ||
        "New Category",

      parent_id: 0
    };

    if (
      type === "live"
    ) {
      db.live_categories.push(
        category
      );
    } else if (
      type === "vod"
    ) {
      db.vod_categories.push(
        category
      );
    } else if (
      type === "series"
    ) {
      db.series_categories.push(
        category
      );
    } else {
      return res.status(400).json({
        error:
          "type must be live, vod, or series"
      });
    }

    saveDatabase();

    res.json({
      success: true,
      category
    });
  }
);

/* =========================================================
   NEXT ID HELPERS
========================================================= */

function nextId(
  list,
  key = "stream_id"
) {
  let maximum = 0;

  for (
    const item
    of list
  ) {
    const id =
      Number(
        item[key]
      );

    if (
      Number.isFinite(id) &&
      id > maximum
    ) {
      maximum = id;
    }
  }

  return maximum + 1;
}

function nextEpisodeId() {
  let maximum = 0;

  for (
    const series
    of db.series
  ) {
    const seasons =
      series.episodes || {};

    for (
      const episodes
      of Object.values(
        seasons
      )
    ) {
      if (
        !Array.isArray(
          episodes
        )
      ) {
        continue;
      }

      for (
        const episode
        of episodes
      ) {
        const id =
          Number(
            episode.id
          );

        if (
          Number.isFinite(id) &&
          id > maximum
        ) {
          maximum = id;
        }
      }
    }
  }

  return maximum + 1;
}

/* =========================================================
   HOME
========================================================= */

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>HONOR TV PH</title>
  <style>
    body{
      margin:0;height:100vh;display:flex;justify-content:center;align-items:center;
      background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);
      font-family:Arial;color:#fff;text-align:center
    }
    .box{
      background:rgba(0,0,0,.45);padding:30px 40px;border-radius:16px;
      box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:420px
    }
    h1{color:#00e5ff;margin:0}
  </style>
</head>
<body>
  <div class="box">
    <h1>📺 HONOR TV PH</h1>
    <p>Enjoy Watching Movies</p>
    <p><small>@2025</small></p>
  </div>
</body>
</html>
`);
});

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "ok",

      uptime:
        process.uptime(),

      timestamp:
        new Date().toISOString(),

      database: {
        users:
          db.users.length,

        live:
          db.live_streams.length,

        movies:
          db.vod_streams.length,

        series:
          db.series.length
      }
    });
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "Endpoint not found"
    });
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      error
    );

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      error:
        "Internal server error"
    });
  }
);

/* =========================================================
   START
========================================================= */

ensureDatabase();

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      "=========================================="
    );

    console.log(
      " Xtream Compatible Server"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Database: ${DB_FILE}`
    );

    console.log(
      `Users: ${db.users.length}`
    );

    console.log(
      `Live: ${db.live_streams.length}`
    );

    console.log(
      `Movies: ${db.vod_streams.length}`
    );

    console.log(
      `Series: ${db.series.length}`
    );

    console.log(
      "=========================================="
    );
  }
);
