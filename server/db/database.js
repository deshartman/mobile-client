/**
 * SQLite database singleton.
 *
 * Opens (or creates) server/data/app.db, enables foreign keys + WAL mode,
 * and applies idempotent schema DDL.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { logOut } = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    user_guid         TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    phone             TEXT UNIQUE,
    email             TEXT UNIQUE,
    twilio_number     TEXT UNIQUE,
    twilio_number_sid TEXT,
    active            INTEGER NOT NULL DEFAULT 1,
    created           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    phone        TEXT PRIMARY KEY,
    code_hash    TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    verified     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contacts (
    contact_guid  TEXT PRIMARY KEY,
    user_guid     TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    first_name    TEXT,
    last_name     TEXT,
    company       TEXT,
    photo_data    TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_guid);

CREATE TABLE IF NOT EXISTS contact_identities (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_guid  TEXT NOT NULL REFERENCES contacts(contact_guid) ON DELETE CASCADE,
    type          TEXT NOT NULL,
    value         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_identities_contact ON contact_identities(contact_guid);

CREATE TABLE IF NOT EXISTS activities (
    id             TEXT PRIMARY KEY,
    user_guid      TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    type           TEXT NOT NULL,
    datetime       TEXT NOT NULL,
    duration       INTEGER NOT NULL DEFAULT 0,
    identity_value TEXT,
    contact_guid   TEXT REFERENCES contacts(contact_guid) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_user_dt ON activities(user_guid, datetime DESC);

CREATE TABLE IF NOT EXISTS conversations (
    conversation_sid TEXT PRIMARY KEY,
    user_guid        TEXT NOT NULL REFERENCES users(user_guid) ON DELETE CASCADE,
    contact_guid     TEXT REFERENCES contacts(contact_guid) ON DELETE SET NULL,
    remote_address   TEXT NOT NULL,
    proxy_address    TEXT NOT NULL,
    activity_id      TEXT REFERENCES activities(id) ON DELETE SET NULL,
    created          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user_pair
    ON conversations(user_guid, proxy_address, remote_address);

CREATE TABLE IF NOT EXISTS messages (
    message_sid      TEXT PRIMARY KEY,
    conversation_sid TEXT NOT NULL REFERENCES conversations(conversation_sid) ON DELETE CASCADE,
    direction        TEXT NOT NULL,
    author           TEXT,
    body             TEXT,
    datetime         TEXT NOT NULL,
    idx              INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_conv_dt
    ON messages(conversation_sid, datetime);
`;

db.exec(SCHEMA);

// Additive migration: contacts.photo_data for older databases that were
// created before this column existed. Idempotent via PRAGMA lookup.
const contactCols = db.prepare(`PRAGMA table_info(contacts)`).all();
if (!contactCols.some(c => c.name === 'photo_data')) {
    logOut('DB', 'Migrating contacts table: adding photo_data column');
    db.exec('ALTER TABLE contacts ADD COLUMN photo_data TEXT');
}

logOut('DB', `Database ready at ${DB_PATH}`);

module.exports = { db };
