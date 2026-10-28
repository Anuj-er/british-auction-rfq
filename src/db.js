const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'auction.db');
const db = new DatabaseSync(dbFile);

// run schema on startup — creates tables if they don't exist
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
