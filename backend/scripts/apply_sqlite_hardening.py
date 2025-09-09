import sqlite3, pathlib, sys

DB_PATH = pathlib.Path("dev.db").resolve()

def trigger_exists(cur, name):
    cur.execute("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?", (name,))
    return cur.fetchone() is not None

def create_trigger(cur, name, sql):
    if not trigger_exists(cur, name):
        cur.execute(sql)

def index_exists(cur, name):
    cur.execute("SELECT 1 FROM sqlite_schema WHERE type='index' AND name=?", (name,))
    return cur.fetchone() is not None

def main():
    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}", file=sys.stderr)
        sys.exit(2)

    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys=ON;")
    cur = con.cursor()

    # 1) Unique IDs across platforms
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_channel ON channel (platform_id, external_channel_id);")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_video   ON video   (platform_id, external_video_id);")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_name    ON platform(name);")

    # 2) Daily metrics helpful indexes
    cur.execute("CREATE INDEX IF NOT EXISTS ix_cdm_channel_date ON channel_daily_metrics(channel_id, date);")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_vdm_video_date   ON video_daily_metrics(video_id, date);")

    # 3) Validation triggers (enum-like constraints)

    # platform.name enum
    create_trigger(cur, "trg_platform_name_ins",
    """
    CREATE TRIGGER trg_platform_name_ins
    BEFORE INSERT ON platform
    WHEN NEW.name NOT IN ('youtube','tiktok','instagram','x','facebook','twitch')
    BEGIN
        SELECT RAISE(ABORT, 'platform.name must be one of: youtube,tiktok,instagram,x,facebook,twitch');
    END;
    """)
    create_trigger(cur, "trg_platform_name_upd",
    """
    CREATE TRIGGER trg_platform_name_upd
    BEFORE UPDATE ON platform
    WHEN NEW.name NOT IN ('youtube','tiktok','instagram','x','facebook','twitch')
    BEGIN
        SELECT RAISE(ABORT, 'platform.name must be one of: youtube,tiktok,instagram,x,facebook,twitch');
    END;
    """)

    # user_channel.role enum
    create_trigger(cur, "trg_user_channel_role_ins",
    """
    CREATE TRIGGER trg_user_channel_role_ins
    BEFORE INSERT ON user_channel
    WHEN NEW.role NOT IN ('owner','editor','viewer')
    BEGIN
        SELECT RAISE(ABORT, 'user_channel.role must be owner|editor|viewer');
    END;
    """)
    create_trigger(cur, "trg_user_channel_role_upd",
    """
    CREATE TRIGGER trg_user_channel_role_upd
    BEFORE UPDATE ON user_channel
    WHEN NEW.role NOT IN ('owner','editor','viewer')
    BEGIN
        SELECT RAISE(ABORT, 'user_channel.role must be owner|editor|viewer');
    END;
    """)

    # video.privacy_status enum
    create_trigger(cur, "trg_video_privacy_ins",
    """
    CREATE TRIGGER trg_video_privacy_ins
    BEFORE INSERT ON video
    WHEN NEW.privacy_status IS NOT NULL
         AND NEW.privacy_status NOT IN ('public','unlisted','private')
    BEGIN
        SELECT RAISE(ABORT, 'video.privacy_status must be public|unlisted|private');
    END;
    """)
    create_trigger(cur, "trg_video_privacy_upd",
    """
    CREATE TRIGGER trg_video_privacy_upd
    BEFORE UPDATE ON video
    WHEN NEW.privacy_status IS NOT NULL
         AND NEW.privacy_status NOT IN ('public','unlisted','private')
    BEGIN
        SELECT RAISE(ABORT, 'video.privacy_status must be public|unlisted|private');
    END;
    """)

    # video.content_type enum
    create_trigger(cur, "trg_video_ctype_ins",
    """
    CREATE TRIGGER trg_video_ctype_ins
    BEFORE INSERT ON video
    WHEN NEW.content_type IS NOT NULL
         AND NEW.content_type NOT IN ('video','short','reel','live','post')
    BEGIN
        SELECT RAISE(ABORT, 'video.content_type must be video|short|reel|live|post');
    END;
    """)
    create_trigger(cur, "trg_video_ctype_upd",
    """
    CREATE TRIGGER trg_video_ctype_upd
    BEFORE UPDATE ON video
    WHEN NEW.content_type IS NOT NULL
         AND NEW.content_type NOT IN ('video','short','reel','live','post')
    BEGIN
        SELECT RAISE(ABORT, 'video.content_type must be video|short|reel|live|post');
    END;
    """)

    # 4) hour_start must be top-of-hour (mm:ss = 00:00)
    create_trigger(cur, "trg_chm_hour_top_ins",
    """
    CREATE TRIGGER trg_chm_hour_top_ins
    BEFORE INSERT ON channel_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'channel_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;
    """)
    create_trigger(cur, "trg_chm_hour_top_upd",
    """
    CREATE TRIGGER trg_chm_hour_top_upd
    BEFORE UPDATE ON channel_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'channel_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;
    """)

    create_trigger(cur, "trg_vhm_hour_top_ins",
    """
    CREATE TRIGGER trg_vhm_hour_top_ins
    BEFORE INSERT ON video_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'video_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;
    """)
    create_trigger(cur, "trg_vhm_hour_top_upd",
    """
    CREATE TRIGGER trg_vhm_hour_top_upd
    BEFORE UPDATE ON video_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'video_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;
    """)

    # 5) JSON validity for video.tags (only if JSON1 is available)
    has_json1 = True
    try:
        cur.execute("SELECT json_valid('[]');").fetchone()
    except sqlite3.OperationalError:
        has_json1 = False

    if has_json1:
        create_trigger(cur, "trg_video_tags_json_ins",
        """
        CREATE TRIGGER trg_video_tags_json_ins
        BEFORE INSERT ON video
        WHEN NEW.tags IS NOT NULL AND json_valid(NEW.tags) = 0
        BEGIN
            SELECT RAISE(ABORT, 'video.tags must be valid JSON');
        END;
        """)
        create_trigger(cur, "trg_video_tags_json_upd",
        """
        CREATE TRIGGER trg_video_tags_json_upd
        BEFORE UPDATE ON video
        WHEN NEW.tags IS NOT NULL AND json_valid(NEW.tags) = 0
        BEGIN
            SELECT RAISE(ABORT, 'video.tags must be valid JSON');
        END;
        """)

    con.commit()
    con.close()
    print("Schema hardening applied successfully.")

if __name__ == "__main__":
    main()
