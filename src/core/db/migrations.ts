// src/core/db/migrations.ts

/** Ordered migration SQL. Index N is applied to move user_version N -> N+1.
 *  Never edit an existing entry once shipped — only append. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE category (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE tag (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES category(id),
    name        TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    UNIQUE (category_id, name)
  );

  CREATE TABLE block (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES category(id),
    tag_id          INTEGER REFERENCES tag(id),
    title           TEXT,
    scheduled_start INTEGER NOT NULL,
    scheduled_end   INTEGER NOT NULL,
    note_path       TEXT,
    status          TEXT NOT NULL DEFAULT 'planned',
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE session (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES category(id),
    tag_id          INTEGER REFERENCES tag(id),
    block_id        INTEGER REFERENCES block(id),
    intent          TEXT,
    planned_seconds INTEGER NOT NULL,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    status          TEXT NOT NULL,
    note_path       TEXT,
    reflection      TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE session_pause (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES session(id),
    paused_at  INTEGER NOT NULL,
    resumed_at INTEGER
  );

  CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX idx_session_status ON session(status);
  CREATE INDEX idx_block_start ON block(scheduled_start);
  CREATE INDEX idx_pause_session ON session_pause(session_id);
  `,
  `
  CREATE TABLE fired_event (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    event    TEXT NOT NULL,
    ref_id   INTEGER NOT NULL,
    key      TEXT NOT NULL DEFAULT '',
    fired_at INTEGER NOT NULL,
    UNIQUE (event, ref_id, key)
  );
  `,
];
