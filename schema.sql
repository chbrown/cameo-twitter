-- $ dropdb cameo-twitter; createdb cameo-twitter && psql cameo-twitter < schema.sql

CREATE EXTENSION citext;

-- PG data types: http://www.postgresql.org/docs/9.3/static/datatype.html

-- CREATE TABLE tasks (
--   id serial PRIMARY KEY,

--   -- currently, the only supported task is user-crawling
--   screen_name CITEXT UNIQUE NOT NULL CHECK (screen_name ~* '^[_a-z0-9]{1,15}$'),
--   last_updated TIMESTAMP,
--   backlog_exhausted BOOLEAN DEFAULT FALSE,

--   touched TIMESTAMP NOT NULL DEFAULT current_timestamp,
--   inserted TIMESTAMP NOT NULL DEFAULT current_timestamp
-- );

CREATE TABLE users (
  -- Twitter docs: 1) Your username cannot be longer than 15 characters, 2) A username can only contain alphanumeric characters (letters A-Z, numbers 0-9) with the exception of underscores, as noted above.
  -- named... CONSTRAINT valid_twitter_username
  id                                 BIGINT UNIQUE,
  id_str                             TEXT UNIQUE,
  name                               TEXT,
  screen_name                        CITEXT CHECK (screen_name ~* '^[_a-z0-9]{1,15}$') UNIQUE,
  location                           TEXT,
  description                        TEXT,
  url                                TEXT,
  protected                          BOOLEAN,

  followers_count                    BIGINT,
  friends_count                      BIGINT,
  listed_count                       BIGINT,
  created_at                         TEXT,
  favourites_count                   BIGINT,
  utc_offset                         INT,
  time_zone                          TEXT,
  geo_enabled                        BOOLEAN,
  verified                           BOOLEAN,
  statuses_count                     BIGINT,
  lang                               TEXT,

  contributors_enabled               BOOLEAN,
  is_translator                      BOOLEAN,
  is_translation_enabled             BOOLEAN,

  profile_background_color           TEXT,
  profile_background_image_url       TEXT,
  profile_background_image_url_https TEXT,
  profile_background_tile            BOOLEAN,
  profile_image_url                  TEXT,
  profile_image_url_https            TEXT,
  profile_banner_url                 TEXT,
  profile_link_color                 TEXT,
  profile_sidebar_border_color       TEXT,
  profile_sidebar_fill_color         TEXT,
  profile_text_color                 TEXT,
  profile_use_background_image       BOOLEAN,

  default_profile                    BOOLEAN,
  default_profile_image              BOOLEAN,
  following                          BOOLEAN,
  follow_request_sent                BOOLEAN,
  notifications                      BOOLEAN,

  -- modified tracks the last-synced date
  modified TIMESTAMP,

  -- "inserted", to differentiate from "created_at"
  inserted TIMESTAMP NOT NULL DEFAULT current_timestamp
);


CREATE TABLE tweets (
  -- screen_name CITEXT REFERENCES users,

  id_str        TEXT PRIMARY KEY,
  id            BIGINT,
  screen_name   TEXT,
  created_at    TIMESTAMP,
  text          TEXT,
  source        TEXT,
  retweeted     BOOLEAN,
  retweet_count BIGINT,
  favorited     BOOLEAN,
  truncated     BOOLEAN,
  -- entities      TwitterEntities

  inserted TIMESTAMP NOT NULL DEFAULT current_timestamp NOT NULL
);

-- watched users
CREATE TABLE edge_events_watched_users (
  id SERIAL PRIMARY KEY,

  user_id BIGINT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT TRUE NOT NULL,

  -- modified: when last crawled
  modified TIMESTAMP DEFAULT 'epoch',
  -- created: default, insertion point
  created TIMESTAMP NOT NULL DEFAULT current_timestamp
);

CREATE TYPE edge_event_type AS ENUM (
  'follow',
  'unfollow'
);

-- edge history
CREATE TABLE edge_events (
  id SERIAL PRIMARY KEY,

  from_id BIGINT NOT NULL,
  to_id BIGINT NOT NULL,
  type edge_event_type NOT NULL,

  -- when crawling, we'll know the last time we updated, and by what time we
  -- observed the change, but it could have happened anywhere in between.
  started TIMESTAMP,
  ended TIMESTAMP NOT NULL
);
CREATE INDEX from_to_index ON edge_events(from_id, to_id);
CREATE INDEX to_from_index ON edge_events(to_id, from_id);
