import sqlite3
from pathlib import Path


DB_PATH = Path(__file__).resolve().parent.parent / "dev.db"


def execute_ddl(con: sqlite3.Connection, sql: str) -> None:
    con.executescript(sql)


DDL = r"""
PRAGMA foreign_keys=ON;

-- Core entities
CREATE TABLE IF NOT EXISTS app_user (
  id              INTEGER PRIMARY KEY, -- reuse existing ids
  email           TEXT UNIQUE,
  display_name    TEXT,
  created_at      TEXT
);

CREATE TABLE IF NOT EXISTS yt_channel (
  id              INTEGER PRIMARY KEY, -- reuse existing ids where possible
  channel_id      TEXT UNIQUE NOT NULL,
  title           TEXT,
  created_at      TEXT
);

CREATE TABLE IF NOT EXISTS user_channel_access (
  user_id         INTEGER NOT NULL,
  channel_id      INTEGER NOT NULL,
  role            TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS yt_video (
  id                      INTEGER PRIMARY KEY,
  channel_id              INTEGER NOT NULL,
  video_id                TEXT UNIQUE NOT NULL,
  format                  TEXT DEFAULT 'long',
  published_at            TEXT,
  current_title           TEXT,
  current_description     TEXT,
  current_thumbnail_url   TEXT,
  created_at              TEXT
);

-- Facts
CREATE TABLE IF NOT EXISTS fact_video_daily (
  video_id                INTEGER NOT NULL,
  metric_date             TEXT NOT NULL, -- ISO date
  views                   INTEGER,
  likes                   INTEGER,
  subscribers_gained      INTEGER,
  subscribers_lost        INTEGER,
  watch_time_seconds      INTEGER,
  average_view_duration_s REAL,
  average_pct_viewed      REAL,          -- 0..1
  impressions             INTEGER,
  ctr                     REAL,          -- 0..1
  revenue_usd             REAL,
  rpm_usd                 REAL,
  playback_cpm_usd        REAL,
  currency                TEXT,
  end_screen_ctr          REAL,
  shorts_swipe_view_ratio REAL,
  PRIMARY KEY (video_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_fvd_date ON fact_video_daily(metric_date);

CREATE TABLE IF NOT EXISTS fact_channel_daily (
  channel_id             INTEGER NOT NULL,
  metric_date            TEXT NOT NULL,
  total_views            INTEGER,
  total_watch_time_s     INTEGER,
  subscribers            INTEGER,
  revenue_usd            REAL,
  PRIMARY KEY (channel_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_fcd_date ON fact_channel_daily(metric_date);

-- Breakdowns (subset used now)
CREATE TABLE IF NOT EXISTS fact_video_traffic_daily (
  video_id        INTEGER NOT NULL,
  metric_date     TEXT NOT NULL,
  source          TEXT NOT NULL,
  views           INTEGER,
  impressions     INTEGER,
  watch_time_s    INTEGER,
  ctr             REAL,
  likes           INTEGER,
  subscribers_gained INTEGER,
  subscribers_lost  INTEGER,
  revenue_usd     REAL,
  PRIMARY KEY (video_id, metric_date, source)
);

CREATE TABLE IF NOT EXISTS fact_video_device_daily (
  video_id        INTEGER NOT NULL,
  metric_date     TEXT NOT NULL,
  device          TEXT NOT NULL,
  views           INTEGER,
  watch_time_s    INTEGER,
  PRIMARY KEY (video_id, metric_date, device)
);

CREATE TABLE IF NOT EXISTS fact_video_geo_daily (
  video_id        INTEGER NOT NULL,
  metric_date     TEXT NOT NULL,
  country_iso2    TEXT NOT NULL,
  views           INTEGER,
  watch_time_s    INTEGER,
  revenue_usd     REAL,
  PRIMARY KEY (video_id, metric_date, country_iso2)
);

-- Demographics breakdown (age/gender)
CREATE TABLE IF NOT EXISTS fact_video_demo_daily (
  video_id        INTEGER NOT NULL,
  metric_date     TEXT NOT NULL,
  age_bucket      TEXT NOT NULL,
  gender          TEXT NOT NULL,
  views           INTEGER,
  watch_time_s    INTEGER,
  PRIMARY KEY (video_id, metric_date, age_bucket, gender)
);

-- Per-video timestamped series (daily snapshots here; can be hourly later)
CREATE TABLE IF NOT EXISTS fact_video_timeseries (
  video_id        INTEGER NOT NULL,
  ts              TEXT NOT NULL, -- ISO timestamp
  views           INTEGER,
  revenue_usd     REAL,
  watch_time_s    INTEGER,
  PRIMARY KEY (video_id, ts)
);
"""


def map_core(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    # app_user from user
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
    if cur.fetchone():
        cur.execute("SELECT id, email, username, created_at FROM user")
        rows = cur.fetchall()
        for r in rows:
            cur.execute(
                "INSERT OR IGNORE INTO app_user (id, email, display_name, created_at) VALUES (?,?,?,?)",
                (r[0], r[1], r[2], r[3]),
            )

    # yt_channel from channel
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='channel'")
    if cur.fetchone():
        cur.execute("SELECT id, yt_channel_id, title, created_at, user_id FROM channel")
        for id_, yt_id, title, created_at, user_id in cur.fetchall():
            cur.execute(
                "INSERT OR IGNORE INTO yt_channel (id, channel_id, title, created_at) VALUES (?,?,?,?)",
                (id_, yt_id, title, created_at),
            )
            if user_id:
                cur.execute(
                    "INSERT OR IGNORE INTO user_channel_access (user_id, channel_id, role) VALUES (?,?, 'owner')",
                    (user_id, id_),
                )

    # yt_video from videomap
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='videomap'")
    if cur.fetchone():
        cur.execute(
            "SELECT id, channel_id, yt_video_id, title, description, thumbnail_url, published_at FROM videomap"
        )
        for id_, ch_id, vid, title, desc, thumb, pub in cur.fetchall():
            cur.execute(
                """
                INSERT OR IGNORE INTO yt_video
                (id, channel_id, video_id, format, published_at, current_title, current_description, current_thumbnail_url)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (id_, ch_id, vid, 'long', pub, title, desc, thumb),
            )


def map_facts(con: sqlite3.Connection) -> None:
    cur = con.cursor()
    # video-level facts (adapt to available columns)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='metricdaily'")
    if cur.fetchone():
        cols = [r[1] for r in cur.execute("PRAGMA table_info(metricdaily)").fetchall()]
        rows = cur.execute("SELECT * FROM metricdaily").fetchall()
        # Preload video_id -> yt_video.pk mapping
        vmap = {row["video_id"]: row["id"] for row in con.execute("SELECT video_id, id FROM yt_video")}
        for row in rows:
            ch_id = row["channel_id"] if "channel_id" in row.keys() else None
            video_id = row["video_id"] if "video_id" in row.keys() else None
            date = row["date"]
            views = row["views"] if "views" in row.keys() else None
            wt_min = row["watch_time_min"] if "watch_time_min" in row.keys() else None
            avg_dur = row["avg_view_duration_sec"] if "avg_view_duration_sec" in row.keys() else None
            avg_pct = row["avg_pct_viewed"] if "avg_pct_viewed" in row.keys() else None
            imps = row["impressions"] if "impressions" in row.keys() else None
            ctr_pct = row["impressions_ctr_pct"] if "impressions_ctr_pct" in row.keys() else None
            likes = row["likes"] if "likes" in row.keys() else None
            sg = row["subs_gained"] if "subs_gained" in row.keys() else None
            sl = row["subs_lost"] if "subs_lost" in row.keys() else None
            rev_minor = row["est_revenue_minor"] if "est_revenue_minor" in row.keys() else None
            rpm_minor = row["rpm_minor"] if "rpm_minor" in row.keys() else None
            cpm_minor = row["playback_cpm_minor"] if "playback_cpm_minor" in row.keys() else None
            currency = row["currency"] if "currency" in row.keys() else None
            esc_pct = row["end_screen_ctr_pct"] if "end_screen_ctr_pct" in row.keys() else None
            shorts_pct = row["shorts_swipe_vs_view_pct"] if "shorts_swipe_vs_view_pct" in row.keys() else None

            if video_id is None:
                # channel-level row
                total_watch_s = (wt_min or 0) * 60
                revenue = (rev_minor or 0) / 100.0 if rev_minor is not None else None
                cur.execute(
                    """
                    INSERT OR REPLACE INTO fact_channel_daily
                    (channel_id, metric_date, total_views, total_watch_time_s, subscribers, revenue_usd)
                    VALUES (?,?,?,?,?,?)
                    """,
                    (ch_id, date, views, total_watch_s, None, revenue),
                )
                continue

            vid_pk = vmap.get(video_id)
            if not vid_pk:
                # If not present, try to insert minimal yt_video row
                cur.execute(
                    "INSERT OR IGNORE INTO yt_video (channel_id, video_id) VALUES (?,?)",
                    (ch_id, video_id),
                )
                # refresh mapping
                vid_pk = cur.lastrowid or con.execute("SELECT id FROM yt_video WHERE video_id=?", (video_id,)).fetchone()[0]

            watch_s = (wt_min or 0) * 60
            # Normalize ratios and monetary values
            def pct_to_ratio(val):
                if val is None:
                    return None
                try:
                    return (val / 100.0) if val > 1 else float(val)
                except Exception:
                    return None

            avg_ratio = pct_to_ratio(avg_pct)
            ctr_ratio = pct_to_ratio(ctr_pct)
            end_screen_ctr = pct_to_ratio(esc_pct)
            revenue = (rev_minor or 0) / 100.0 if rev_minor is not None else None
            rpm_usd = (rpm_minor or 0) / 100.0 if rpm_minor is not None else None
            cpm_usd = (cpm_minor or 0) / 100.0 if cpm_minor is not None else None
            shorts_ratio = pct_to_ratio(shorts_pct)

            cur.execute(
                """
                INSERT OR REPLACE INTO fact_video_daily
                (video_id, metric_date, views, likes, subscribers_gained, subscribers_lost,
                 watch_time_seconds, average_view_duration_s, average_pct_viewed, impressions, ctr, revenue_usd,
                 rpm_usd, playback_cpm_usd, currency, end_screen_ctr, shorts_swipe_view_ratio)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    vid_pk, date, views, likes, sg, sl, watch_s, avg_dur, avg_ratio, imps, ctr_ratio, revenue,
                    rpm_usd, cpm_usd, currency, end_screen_ctr, shorts_ratio,
                ),
            )

            # Also add a timestamped snapshot at midnight UTC for this date
            ts = f"{date}T00:00:00Z"
            cur.execute(
                """
                INSERT OR REPLACE INTO fact_video_timeseries
                (video_id, ts, views, revenue_usd, watch_time_s)
                VALUES (?,?,?,?,?)
                """,
                (vid_pk, ts, views, revenue, watch_s),
            )

    # breakdowns
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='metricbreakdowndaily'")
    if cur.fetchone():
        # Build mapping again for confidence
        vmap = {row["video_id"]: row["id"] for row in con.execute("SELECT video_id, id FROM yt_video")}
        rows = cur.execute("SELECT * FROM metricbreakdowndaily").fetchall()
        for row in rows:
            ch_id = row["channel_id"]
            video_id = row["video_id"]
            date = row["date"]
            dim = row["dimension"]
            key = row["key"]
            views = row["views"] if "views" in row.keys() else None
            wt_min = row["watch_time_min"] if "watch_time_min" in row.keys() else None
            imps = row["impressions"] if "impressions" in row.keys() else None
            ctr_pct = row["impressions_ctr_pct"] if "impressions_ctr_pct" in row.keys() else None
            likes = row["likes"] if "likes" in row.keys() else None
            sg = row["subs_gained"] if "subs_gained" in row.keys() else None
            sl = row["subs_lost"] if "subs_lost" in row.keys() else None
            rev_minor = row["est_revenue_minor"] if "est_revenue_minor" in row.keys() else None

            vid_pk = vmap.get(video_id) if video_id else None
            watch_s = (wt_min or 0) * 60
            ctr_ratio = (ctr_pct / 100.0) if isinstance(ctr_pct, (int, float)) else None
            revenue = (rev_minor or 0) / 100.0 if rev_minor is not None else None

            if dim == 'deviceType' and vid_pk:
                con.execute(
                    "INSERT OR REPLACE INTO fact_video_device_daily (video_id, metric_date, device, views, watch_time_s) VALUES (?,?,?,?,?)",
                    (vid_pk, date, key or 'UNKNOWN', views, watch_s),
                )
            elif dim == 'insightTrafficSourceType' and vid_pk:
                con.execute(
                    "INSERT OR REPLACE INTO fact_video_traffic_daily (video_id, metric_date, source, views, impressions, watch_time_s, ctr, likes, subscribers_gained, subscribers_lost, revenue_usd) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (vid_pk, date, key or 'OTHER', views, imps, watch_s, ctr_ratio, likes, sg, sl, revenue),
                )
            elif dim == 'country' and vid_pk:
                con.execute(
                    "INSERT OR REPLACE INTO fact_video_geo_daily (video_id, metric_date, country_iso2, views, watch_time_s, revenue_usd) VALUES (?,?,?,?,?,?)",
                    (vid_pk, date, (key or 'ZZ')[:2], views, watch_s, revenue),
                )
            elif dim == 'ageGroup,gender' and vid_pk:
                # Expect composite key "age|gender" if available
                age_bucket = 'UNKNOWN'
                gender = 'UNKNOWN'
                if key and isinstance(key, str) and '|' in key:
                    parts = key.split('|', 1)
                    age_bucket = parts[0] or 'UNKNOWN'
                    gender = parts[1] or 'UNKNOWN'
                else:
                    age_bucket = key or 'UNKNOWN'
                con.execute(
                    "INSERT OR REPLACE INTO fact_video_demo_daily (video_id, metric_date, age_bucket, gender, views, watch_time_s) VALUES (?,?,?,?,?,?)",
                    (vid_pk, date, age_bucket, gender, views, watch_s),
                )


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    # Use dict-like rows throughout so we can access by column name
    con.row_factory = sqlite3.Row
    try:
        execute_ddl(con, DDL)
        map_core(con)
        map_facts(con)
        con.commit()
        print("Restructure complete -> fact/dimension tables created and populated.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
