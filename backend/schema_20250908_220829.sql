CREATE INDEX ix_channel_account ON channel (platform_account_id);
CREATE INDEX ix_chm_channel_hour ON channel_hourly_metrics (channel_id, hour_start);
CREATE INDEX ix_oauth_credential_platform_account_id ON oauth_credential (platform_account_id);
CREATE INDEX ix_platform_account_owner_user_id ON platform_account (owner_user_id);
CREATE INDEX ix_platform_account_platform_id ON platform_account (platform_id);
CREATE INDEX ix_user_channel_channel_id ON user_channel (channel_id);
CREATE INDEX ix_user_channel_user_id ON user_channel (user_id);
CREATE UNIQUE INDEX ix_user_email ON user (email);
CREATE INDEX ix_vhm_video_hour ON video_hourly_metrics (video_id, hour_start);
CREATE INDEX ix_video_channel_published ON video (channel_id, published_at);
CREATE TABLE alembic_version (
	version_num VARCHAR(32) NOT NULL, 
	CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
CREATE TABLE channel (
	id INTEGER NOT NULL, 
	platform_id INTEGER NOT NULL, 
	platform_account_id INTEGER, 
	external_channel_id VARCHAR NOT NULL, 
	title VARCHAR, 
	description VARCHAR, 
	country CHAR(2), 
	language CHAR(2), 
	custom_url VARCHAR, 
	avatar_url VARCHAR, 
	banner_url VARCHAR, 
	is_monetized BOOLEAN, 
	published_at TIMESTAMP, 
	last_synced_at TIMESTAMP, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(platform_account_id) REFERENCES platform_account (id) ON DELETE SET NULL, 
	FOREIGN KEY(platform_id) REFERENCES platform (id) ON DELETE RESTRICT
);
CREATE TABLE channel_daily_metrics (
	channel_id INTEGER NOT NULL, 
	date DATE NOT NULL, 
	subscribers_total BIGINT, 
	subscribers_gained BIGINT, 
	subscribers_lost BIGINT, 
	views BIGINT, 
	watch_time_minutes BIGINT, 
	impressions BIGINT, 
	click_through_rate NUMERIC(5, 2), 
	estimated_revenue NUMERIC(12, 4), 
	revenue_currency CHAR(3), 
	PRIMARY KEY (channel_id, date), 
	CONSTRAINT ck_cdm_ctr_pct CHECK (click_through_rate >= 0 AND click_through_rate <= 100), 
	CONSTRAINT ck_cdm_rev_nonneg CHECK (estimated_revenue >= 0), 
	CONSTRAINT ck_cdm_impr_nonneg CHECK (impressions >= 0), 
	CONSTRAINT ck_cdm_subs_gained_nonneg CHECK (subscribers_gained >= 0), 
	CONSTRAINT ck_cdm_subs_lost_nonneg CHECK (subscribers_lost >= 0), 
	CONSTRAINT ck_cdm_subs_total_nonneg CHECK (subscribers_total >= 0), 
	CONSTRAINT ck_cdm_views_nonneg CHECK (views >= 0), 
	CONSTRAINT ck_cdm_wtm_nonneg CHECK (watch_time_minutes >= 0), 
	FOREIGN KEY(channel_id) REFERENCES channel (id) ON DELETE CASCADE
);
CREATE TABLE channel_hourly_metrics (
	channel_id INTEGER NOT NULL, 
	hour_start TIMESTAMP NOT NULL, 
	views BIGINT, 
	watch_time_minutes BIGINT, 
	impressions BIGINT, 
	likes BIGINT, 
	comments BIGINT, 
	subscribers_gained BIGINT, 
	estimated_revenue NUMERIC(12, 4), 
	PRIMARY KEY (channel_id, hour_start), 
	FOREIGN KEY(channel_id) REFERENCES channel (id) ON DELETE CASCADE
);
CREATE TABLE oauth_credential (
	id INTEGER NOT NULL, 
	platform_account_id INTEGER NOT NULL, 
	access_token_encrypted VARCHAR NOT NULL, 
	refresh_token_encrypted VARCHAR, 
	scopes VARCHAR(1024), 
	expires_at TIMESTAMP, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(platform_account_id) REFERENCES platform_account (id) ON DELETE CASCADE
);
CREATE TABLE platform (
	id INTEGER NOT NULL, 
	name VARCHAR(9) NOT NULL, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE platform_account (
	id INTEGER NOT NULL, 
	platform_id INTEGER NOT NULL, 
	owner_user_id INTEGER NOT NULL, 
	display_name VARCHAR, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_user_id) REFERENCES user (id) ON DELETE CASCADE, 
	FOREIGN KEY(platform_id) REFERENCES platform (id) ON DELETE RESTRICT
);
CREATE TABLE user (
	id INTEGER NOT NULL, 
	name VARCHAR, 
	email VARCHAR NOT NULL, 
	password_hash VARCHAR, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE user_channel (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	channel_id INTEGER NOT NULL, 
	role VARCHAR(6) DEFAULT 'viewer' NOT NULL, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(channel_id) REFERENCES channel (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES user (id) ON DELETE CASCADE, 
	CONSTRAINT uq_user_channel_pair UNIQUE (user_id, channel_id)
);
CREATE TABLE video (
	id INTEGER NOT NULL, 
	platform_id INTEGER NOT NULL, 
	channel_id INTEGER NOT NULL, 
	external_video_id VARCHAR NOT NULL, 
	title VARCHAR, 
	description VARCHAR, 
	category VARCHAR, 
	privacy_status VARCHAR(8), 
	content_type VARCHAR(5), 
	duration_seconds BIGINT, 
	published_at TIMESTAMP, 
	thumbnail_url VARCHAR, 
	tags JSON, 
	last_synced_at TIMESTAMP, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(channel_id) REFERENCES channel (id) ON DELETE CASCADE, 
	FOREIGN KEY(platform_id) REFERENCES platform (id) ON DELETE RESTRICT
);
CREATE TABLE video_daily_metrics (
	video_id INTEGER NOT NULL, 
	date DATE NOT NULL, 
	views BIGINT, 
	watch_time_minutes BIGINT, 
	avg_view_duration_seconds BIGINT, 
	avg_percent_viewed NUMERIC(5, 2), 
	likes BIGINT, 
	comments BIGINT, 
	shares BIGINT, 
	impressions BIGINT, 
	click_through_rate NUMERIC(5, 2), 
	subs_gained_from_video BIGINT, 
	estimated_revenue NUMERIC(12, 4), 
	revenue_currency CHAR(3), 
	PRIMARY KEY (video_id, date), 
	CONSTRAINT ck_vdm_apv_pct CHECK (avg_percent_viewed >= 0 AND avg_percent_viewed <= 100), 
	CONSTRAINT ck_vdm_avd_nonneg CHECK (avg_view_duration_seconds >= 0), 
	CONSTRAINT ck_vdm_ctr_pct CHECK (click_through_rate >= 0 AND click_through_rate <= 100), 
	CONSTRAINT ck_vdm_comments_nonneg CHECK (comments >= 0), 
	CONSTRAINT ck_vdm_rev_nonneg CHECK (estimated_revenue >= 0), 
	CONSTRAINT ck_vdm_impr_nonneg CHECK (impressions >= 0), 
	CONSTRAINT ck_vdm_likes_nonneg CHECK (likes >= 0), 
	CONSTRAINT ck_vdm_shares_nonneg CHECK (shares >= 0), 
	CONSTRAINT ck_vdm_subs_nonneg CHECK (subs_gained_from_video >= 0), 
	CONSTRAINT ck_vdm_views_nonneg CHECK (views >= 0), 
	CONSTRAINT ck_vdm_wtm_nonneg CHECK (watch_time_minutes >= 0), 
	FOREIGN KEY(video_id) REFERENCES video (id) ON DELETE CASCADE
);
CREATE TABLE video_hourly_metrics (
	video_id INTEGER NOT NULL, 
	hour_start TIMESTAMP NOT NULL, 
	views BIGINT, 
	watch_time_minutes BIGINT, 
	impressions BIGINT, 
	likes BIGINT, 
	comments BIGINT, 
	subs_gained_from_video BIGINT, 
	estimated_revenue NUMERIC(12, 4), 
	PRIMARY KEY (video_id, hour_start), 
	FOREIGN KEY(video_id) REFERENCES video (id) ON DELETE CASCADE
);
