-- $ dropdb cameo-twitter; createdb cameo-twitter && psql cameo-twitter < schema.sql

-- thoughts on TIMESTAMP WITH TIME ZONE vs. WITHOUT: both are stored in the
-- same amount of space; it's just that WITHOUT insists that clients be on the same timezone
-- WITH TIME ZONE allows clients to tell the server what timezone they're sending over, including
-- UTC vs. whatever the postgres server thinks the timezone is. It would all be okay, too, if we
-- could ensure that the client has TZ='UTC' and server has `timezone = UTC`, but that takes a bit
-- more config.

CREATE EXTENSION citext;

-- PG data types: http://www.postgresql.org/docs/9.3/static/datatype.html

CREATE TABLE users (
  -- Twitter docs: 1) Your username cannot be longer than 15 characters, 2) A username can only contain alphanumeric characters (letters A-Z, numbers 0-9) with the exception of underscores, as noted above.
  -- id                                 BIGINT UNIQUE,
  id_str                             TEXT UNIQUE,
  name                               TEXT,
  screen_name                        CITEXT CHECK (screen_name ~* '^[_a-z0-9]{1,15}$') UNIQUE,
  location                           TEXT,
  description                        TEXT,
  url                                TEXT,
  protected                          BOOLEAN,

  followers_count                    INT,
  friends_count                      INT,
  listed_count                       INT,
  created_at                         TIMESTAMP WITH TIME ZONE,
  favourites_count                   INT,
  utc_offset                         INT,
  time_zone                          TEXT,
  geo_enabled                        BOOLEAN,
  verified                           BOOLEAN,
  statuses_count                     INT,
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

  -- if we want someone, but Twitter just gives us a 404
  missing                            BOOLEAN DEFAULT FALSE,

  -- modified tracks the last-synced date
  modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT 'epoch',

  -- "inserted", to differentiate from "created_at"
  inserted TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);
CREATE INDEX users_id_str ON users(id_str);

CREATE TABLE statuses (
  created_at                TIMESTAMP WITH TIME ZONE,
  -- id                        BIGINT,
  id_str                    TEXT PRIMARY KEY,
  text                      TEXT,
  source                    TEXT,
  truncated                 BOOLEAN,
  -- in_reply_to_status_id     BIGINT,
  in_reply_to_status_id_str TEXT,
  -- in_reply_to_user_id       BIGINT,
  in_reply_to_user_id_str   TEXT,
  in_reply_to_screen_name   TEXT,
  -- user json, -- break this out into:
    -- user_id                 BIGINT,
    user_id_str             TEXT,
    user_screen_name        CITEXT,
  -- geo json, -- this is deprecated (lat lon, instead of lon lat)
  coordinates               JSON, -- this will be a GeoJSON geometry object
  place                     JSON, -- a place object
  contributors              TEXT,
  -- retweeted_status json, -- break out into:
    retweeted_status_id_str TEXT,
  retweet_count             INT,
  favorite_count            INT,
  entities                  JSON,
  favorited                 BOOLEAN,
  retweeted                 BOOLEAN,
  possibly_sensitive        BOOLEAN,
  filter_level              TEXT,
  lang                      TEXT,

  inserted TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp NOT NULL
);
CREATE INDEX statuses_user_id_str ON statuses(user_id_str);

CREATE TABLE statuses_watched_users (
  id                 SERIAL PRIMARY KEY,

  user_id            TEXT NOT NULL UNIQUE,
  active             BOOLEAN DEFAULT TRUE NOT NULL,

  backlog_exhausted  BOOLEAN DEFAULT FALSE,

  modified           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT 'epoch',
  created            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);

CREATE TABLE edge_events_watched_users (
  id           SERIAL PRIMARY KEY,

  user_id      TEXT NOT NULL UNIQUE,
  active       BOOLEAN DEFAULT TRUE NOT NULL,

  -- modified: when last crawled
  modified     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT 'epoch',
  -- created: default, insertion point
  created      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp
);

CREATE TYPE edge_event_type AS ENUM (
  'follow',
  'unfollow'
);

-- edge history
CREATE TABLE edge_events (
  id      SERIAL PRIMARY KEY,

  from_id TEXT NOT NULL,
  to_id   TEXT NOT NULL,
  type    edge_event_type NOT NULL,

  -- when crawling, we'll know the last time we updated, and by what time we
  -- observed the change, but it could have happened anywhere in between.
  started TIMESTAMP WITH TIME ZONE NOT NULL,
  ended   TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX from_to_index ON edge_events(from_id, to_id);
CREATE INDEX to_from_index ON edge_events(to_id, from_id);
