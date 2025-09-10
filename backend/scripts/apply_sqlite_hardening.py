# backend/scripts/apply_sqlite_hardening.py
import sqlite3, pathlib, sys, os

# Usage:
#   python scripts/apply_sqlite_hardening.py               # uses backend/dev.db
#   python scripts/apply_sqlite_hardening.py path/to.db    # custom file

DB_PATH = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dev.db").resolve()

def trigger_exists(cur, name):
    cur.execute("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?", (name,))
    return cur.fetchone() is not None

def create_trigger(cur, name, sql):
    if not trigger_exists(cur, name):
        cur.execute(sql)

def index_exists(cur, name):
    cur.execute("SELECT 1 FROM sqlite_schema WHERE type='index' AND name=?", (name,))
    return cur.fetchone() is not None

def create_index(cur, name, sql):
    if not index_exists(cur, name):
        cur.execute(sql)

def main():
    if not DB_PATH.exists():
        print(f"DB not found: {DB_PATH}", file=sys.stderr)
        sys.exit(2)

    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys=ON;")
    cur = con.cursor()

    # -------------------------------
    # 1) Unique constraints / indexes
    # -------------------------------
    create_index(cur, "uq_platform_channel",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_channel ON channel (platform_id, external_channel_id);")
    create_index(cur, "uq_platform_video",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_video   ON video   (platform_id, external_video_id);")
    create_index(cur, "uq_platform_name",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_name    ON platform(name);")
    create_index(cur, "ix_user_email",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_email ON user(email);")

    # ---------------------------------
    # 2) Helpful/foreign key side indexes
    # ---------------------------------
    create_index(cur, "ix_cdm_channel_date",
        "CREATE INDEX IF NOT EXISTS ix_cdm_channel_date ON channel_daily_metrics(channel_id, date);")
    create_index(cur, "ix_vdm_video_date",
        "CREATE INDEX IF NOT EXISTS ix_vdm_video_date   ON video_daily_metrics(video_id, date);")

    create_index(cur, "ix_chm_channel_hour",
        "CREATE INDEX IF NOT EXISTS ix_chm_channel_hour ON channel_hourly_metrics (channel_id, hour_start);")
    create_index(cur, "ix_vhm_video_hour",
        "CREATE INDEX IF NOT EXISTS ix_vhm_video_hour ON video_hourly_metrics (video_id, hour_start);")

    create_index(cur, "ix_video_channel_published",
        "CREATE INDEX IF NOT EXISTS ix_video_channel_published ON video (channel_id, published_at);")

    create_index(cur, "ix_channel_account",
        "CREATE INDEX IF NOT EXISTS ix_channel_account ON channel (platform_account_id);")

    create_index(cur, "ix_oauth_credential_platform_account_id",
        "CREATE INDEX IF NOT EXISTS ix_oauth_credential_platform_account_id ON oauth_credential (platform_account_id);")

    create_index(cur, "ix_platform_account_owner_user_id",
        "CREATE INDEX IF NOT EXISTS ix_platform_account_owner_user_id ON platform_account (owner_user_id);")
    create_index(cur, "ix_platform_account_platform_id",
        "CREATE INDEX IF NOT EXISTS ix_platform_account_platform_id ON platform_account (platform_id);")

    create_index(cur, "ix_user_channel_user_id",
        "CREATE INDEX IF NOT EXISTS ix_user_channel_user_id ON user_channel (user_id);")
    create_index(cur, "ix_user_channel_channel_id",
        "CREATE INDEX IF NOT EXISTS ix_user_channel_channel_id ON user_channel (channel_id);")

    # -------------------------------
    # 3) Validation triggers (enums)
    # -------------------------------

    # platform.name enum
    create_trigger(cur, "trg_platform_name_ins", """
    CREATE TRIGGER trg_platform_name_ins
    BEFORE INSERT ON platform
    WHEN NEW.name NOT IN ('youtube','tiktok','instagram','x','facebook','twitch')
    BEGIN
        SELECT RAISE(ABORT, 'platform.name must be one of: youtube,tiktok,instagram,x,facebook,twitch');
    END;""")
    create_trigger(cur, "trg_platform_name_upd", """
    CREATE TRIGGER trg_platform_name_upd
    BEFORE UPDATE ON platform
    WHEN NEW.name NOT IN ('youtube','tiktok','instagram','x','facebook','twitch')
    BEGIN
        SELECT RAISE(ABORT, 'platform.name must be one of: youtube,tiktok,instagram,x,facebook,twitch');
    END;""")

    # user_channel.role enum
    create_trigger(cur, "trg_user_channel_role_ins", """
    CREATE TRIGGER trg_user_channel_role_ins
    BEFORE INSERT ON user_channel
    WHEN NEW.role NOT IN ('owner','editor','viewer')
    BEGIN
        SELECT RAISE(ABORT, 'user_channel.role must be owner|editor|viewer');
    END;""")
    create_trigger(cur, "trg_user_channel_role_upd", """
    CREATE TRIGGER trg_user_channel_role_upd
    BEFORE UPDATE ON user_channel
    WHEN NEW.role NOT IN ('owner','editor','viewer')
    BEGIN
        SELECT RAISE(ABORT, 'user_channel.role must be owner|editor|viewer');
    END;""")

    # video.privacy_status enum
    create_trigger(cur, "trg_video_privacy_ins", """
    CREATE TRIGGER trg_video_privacy_ins
    BEFORE INSERT ON video
    WHEN NEW.privacy_status IS NOT NULL
         AND NEW.privacy_status NOT IN ('public','unlisted','private')
    BEGIN
        SELECT RAISE(ABORT, 'video.privacy_status must be public|unlisted|private');
    END;""")
    create_trigger(cur, "trg_video_privacy_upd", """
    CREATE TRIGGER trg_video_privacy_upd
    BEFORE UPDATE ON video
    WHEN NEW.privacy_status IS NOT NULL
         AND NEW.privacy_status NOT IN ('public','unlisted','private')
    BEGIN
        SELECT RAISE(ABORT, 'video.privacy_status must be public|unlisted|private');
    END;""")

    # video.content_type enum
    create_trigger(cur, "trg_video_ctype_ins", """
    CREATE TRIGGER trg_video_ctype_ins
    BEFORE INSERT ON video
    WHEN NEW.content_type IS NOT NULL
         AND NEW.content_type NOT IN ('video','short','reel','live','post')
    BEGIN
        SELECT RAISE(ABORT, 'video.content_type must be video|short|reel|live|post');
    END;""")
    create_trigger(cur, "trg_video_ctype_upd", """
    CREATE TRIGGER trg_video_ctype_upd
    BEFORE UPDATE ON video
    WHEN NEW.content_type IS NOT NULL
         AND NEW.content_type NOT IN ('video','short','reel','live','post')
    BEGIN
        SELECT RAISE(ABORT, 'video.content_type must be video|short|reel|live|post');
    END;""")

    # ------------------------------------------------
    # 4) hour_start must be top-of-hour (mm:ss = 00:00)
    # ------------------------------------------------
    create_trigger(cur, "trg_chm_hour_top_ins", """
    CREATE TRIGGER trg_chm_hour_top_ins
    BEFORE INSERT ON channel_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'channel_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;""")
    create_trigger(cur, "trg_chm_hour_top_upd", """
    CREATE TRIGGER trg_chm_hour_top_upd
    BEFORE UPDATE ON channel_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'channel_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;""")

    create_trigger(cur, "trg_vhm_hour_top_ins", """
    CREATE TRIGGER trg_vhm_hour_top_ins
    BEFORE INSERT ON video_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'video_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;""")
    create_trigger(cur, "trg_vhm_hour_top_upd", """
    CREATE TRIGGER trg_vhm_hour_top_upd
    BEFORE UPDATE ON video_hourly_metrics
    WHEN strftime('%M', NEW.hour_start) <> '00' OR strftime('%S', NEW.hour_start) <> '00'
    BEGIN
        SELECT RAISE(ABORT, 'video_hourly_metrics.hour_start must be on the hour (mm:ss=00:00)');
    END;""")

    # ------------------------------------------------
    # 5) JSON validity for video.tags (if JSON1 available)
    # ------------------------------------------------
    has_json1 = True
    try:
        cur.execute("SELECT json_valid('[]');").fetchone()
    except sqlite3.OperationalError:
        has_json1 = False

    if has_json1:
        create_trigger(cur, "trg_video_tags_json_ins", """
        CREATE TRIGGER trg_video_tags_json_ins
        BEFORE INSERT ON video
        WHEN NEW.tags IS NOT NULL AND json_valid(NEW.tags) = 0
        BEGIN
            SELECT RAISE(ABORT, 'video.tags must be valid JSON');
        END;""")
        create_trigger(cur, "trg_video_tags_json_upd", """
        CREATE TRIGGER trg_video_tags_json_upd
        BEFORE UPDATE ON video
        WHEN NEW.tags IS NOT NULL AND json_valid(NEW.tags) = 0
        BEGIN
            SELECT RAISE(ABORT, 'video.tags must be valid JSON');
        END;""")

    con.commit()
    con.close()
    print(f"Schema hardening applied successfully to: {DB_PATH}")

if __name__ == "__main__":
    main()
