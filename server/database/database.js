const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "auctfy.db");
const db = new sqlite3.Database(dbPath, error => {
    if (error) console.error("Database connection failed:", error.message);
    else console.log("Connected to SQLite database");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        password TEXT NOT NULL,
        free_auction_used INTEGER DEFAULT 0,
        subscription_status TEXT DEFAULT 'inactive',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS auctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        starting_price REAL NOT NULL,
        min_increment REAL NOT NULL,
        start_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_date TEXT NOT NULL,
        end_time TEXT NOT NULL,
        time_zone TEXT NOT NULL DEFAULT 'UTC',
        image TEXT,
        status TEXT DEFAULT 'Scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        bid_amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(auction_id) REFERENCES auctions(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subscription_payment_receipts (
        payment_id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Add timezone support to databases created before auction scheduling stored it.
    db.run("ALTER TABLE auctions ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC'", error => {
        if (error && !error.message.includes("duplicate column name")) {
            console.error("Unable to add auction timezone column:", error.message);
        }
    });

});

module.exports = db;
