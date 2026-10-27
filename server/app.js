const dotenv = require("dotenv");

dotenv.config({
    path: __dirname + "/.env"
});

const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const db = require("./database/database");

const app = express();
const PORT = process.env.PORT || 3000;
// Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Middleware
app.use(cors());
app.use(express.json());
// Keep server code, the SQLite database, and local configuration out of the public web root.
app.use((req, res, next) => {
    let requestPath;
    try { requestPath = decodeURIComponent(req.path).toLowerCase(); }
    catch { return res.sendStatus(400); }
    if (requestPath === "/server" || requestPath.startsWith("/server/")) return res.sendStatus(404);
    next();
});
app.use(express.static(path.join(__dirname, "..")));

// Admin credentials are configured only in server/.env. Admin sessions are
// short-lived, HttpOnly cookies and are invalidated when the server restarts.
const adminSessions = new Map();
const adminLoginAttempts = new Map();
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

function readCookie(req, cookieName) {
    const cookieHeader = req.headers.cookie || "";
    const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
    return cookie ? cookie.slice(cookieName.length + 1) : "";
}

function requireAdmin(req, res, next) {
    const token = readCookie(req, "auctfy_admin_session");
    const expiresAt = adminSessions.get(token);
    if (!token || !expiresAt || expiresAt < Date.now()) {
        if (token) adminSessions.delete(token);
        return res.status(401).json({ success: false, message: "Admin sign-in is required." });
    }
    next();
}

app.post("/admin/login", async (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");
    const configuredUsername = process.env.ADMIN_USERNAME || "";
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
    if (!configuredUsername || !passwordHash) {
        return res.status(503).json({ success: false, message: "Admin access is not configured on this server." });
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const attempt = adminLoginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
    if (attempt.resetAt <= Date.now()) { attempt.count = 0; attempt.resetAt = Date.now() + 15 * 60 * 1000; }
    if (attempt.count >= 8) return res.status(429).json({ success: false, message: "Too many attempts. Try again in 15 minutes." });

    try {
        const suppliedUsername = Buffer.from(username);
        const expectedUsername = Buffer.from(configuredUsername);
        const usernameMatches = suppliedUsername.length === expectedUsername.length && crypto.timingSafeEqual(suppliedUsername, expectedUsername);
        const passwordMatches = password.length > 0 && await bcrypt.compare(password, passwordHash);
        if (!usernameMatches || !passwordMatches) {
            attempt.count += 1;
            adminLoginAttempts.set(ip, attempt);
            return res.status(401).json({ success: false, message: "The username or password is incorrect." });
        }

        adminLoginAttempts.delete(ip);
        const token = crypto.randomBytes(32).toString("hex");
        adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL);
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
        res.setHeader("Set-Cookie", `auctfy_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_TTL / 1000}${secure}`);
        return res.json({ success: true });
    } catch (error) {
        console.error("Admin login error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to sign in right now." });
    }
});

app.post("/admin/logout", requireAdmin, (req, res) => {
    adminSessions.delete(readCookie(req, "auctfy_admin_session"));
    res.setHeader("Set-Cookie", "auctfy_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    res.json({ success: true });
});

app.get("/admin/overview", requireAdmin, async (req, res) => {
    const get = (sql) => new Promise((resolve, reject) => db.get(sql, (err, row) => err ? reject(err) : resolve(row)));
    const all = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
    try {
        const [userTotal, auctionTotal, activeSubscriptions, completedAuctions, scheduledAuctions, users] = await Promise.all([
            get("SELECT COUNT(*) AS total FROM users"),
            get("SELECT COUNT(*) AS total FROM auctions"),
            get(`SELECT COUNT(DISTINCT user_id) AS total FROM subscriptions
                 WHERE lower(status) = 'active' AND date(end_date) >= date('now')`),
            get("SELECT COUNT(*) AS total FROM auctions WHERE lower(status) = 'ended'"),
            get("SELECT COUNT(*) AS total FROM auctions WHERE lower(status) = 'scheduled'"),
            all(`SELECT users.id, users.full_name, users.created_at,
                        CASE WHEN EXISTS (
                            SELECT 1 FROM subscriptions
                            WHERE subscriptions.user_id = users.id
                              AND lower(subscriptions.status) = 'active'
                              AND date(subscriptions.end_date) >= date('now')
                        ) THEN 'Active' ELSE 'Inactive' END AS subscription_status
                 FROM users ORDER BY users.created_at DESC, users.id DESC LIMIT 200`)
        ]);
        res.json({
            success: true,
            total_users: userTotal.total,
            total_auctions: auctionTotal.total,
            active_subscriptions: activeSubscriptions.total,
            completed_auctions: completedAuctions.total,
            scheduled_auctions: scheduledAuctions.total,
            users
        });
    } catch (error) {
        console.error("Admin overview error:", error.message);
        res.status(500).json({ success: false, message: "Unable to load admin dashboard data." });
    }
});

// Test Route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

// ==============================
// Multer Configuration
// ==============================

// Path where uploaded images will be stored
const uploadPath = path.join(__dirname, "uploads");

// Create uploads folder if it doesn't exist
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

// Configure storage
const storage = multer.diskStorage({

    // Folder to save uploaded images
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },

    // Generate a unique filename
    filename: function (req, file, cb) {

        const uniqueName = Date.now() + "-" + file.originalname;

        cb(null, uniqueName);

    }

});

// Initialize multer
const upload = multer({

    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024   // 5 MB
    }

});
app.use("/uploads", express.static(uploadPath));

// Signup creates the account immediately; email verification is not required.
app.post("/signup", async (req, res) => {
    const body = req.body || {};
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");

    if (body.terms_accepted !== true) {
        return res.status(400).json({ success: false, message: "Please accept the Terms & Conditions to continue." });
    }
    if (fullName.length < 2 || fullName.length > 100 || !/^\S+@\S+\.\S+$/.test(email)
        || phone.length < 5 || phone.length > 30 || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ success: false, message: "Enter a valid name, email, phone number, and password (8 to 72 bytes)." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (full_name, email, phone, password) VALUES (?, ?, ?, ?)",
            [fullName, email, phone, hashedPassword],
            function (error) {
                if (error) {
                    if (String(error.message).includes("UNIQUE constraint failed: users.email")) {
                        return res.status(409).json({ success: false, message: "An account with this email already exists. Please log in." });
                    }
                    console.error("Signup error:", error.message);
                    return res.status(500).json({ success: false, message: "Unable to create your account right now." });
                }
                return res.status(201).json({ success: true, message: "Account created successfully! You can now log in." });
            }
        );
    } catch (error) {
        console.error("Signup error:", error.message);
        return res.status(500).json({ success: false, message: "Unable to create your account right now." });
    }
});

// Password reset by email (Resend)
app.post("/forgot-password", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }
    if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM_EMAIL || !process.env.APP_BASE_URL) {
        return res.status(503).json({ success: false, message: "Password reset email is not configured. Set RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL, and APP_BASE_URL in server/.env." });
    }

    db.get("SELECT id, email FROM users WHERE lower(email) = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Unable to process the reset request." });
        if (!user) return res.json({ success: true, message: "If an account exists for that email, a reset link will be sent." });

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = Date.now() + 30 * 60 * 1000;
        db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id], function (deleteErr) {
            if (deleteErr) return res.status(500).json({ success: false, message: "Unable to prepare a reset link." });
            db.run("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [user.id, tokenHash, expiresAt], async function (insertErr) {
                if (insertErr) return res.status(500).json({ success: false, message: "Unable to prepare a reset link." });
                const baseUrl = process.env.APP_BASE_URL.replace(/\/$/, "");
                const resetUrl = `${baseUrl}/reset-password.html?token=${rawToken}`;
                try {
                    const mailResponse = await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            from: process.env.PASSWORD_RESET_FROM_EMAIL,
                            to: [user.email],
                            subject: "Reset your AuctFy password",
                            html: `<p>We received a request to reset your AuctFy password.</p><p><a href="${resetUrl}">Set a new password</a></p><p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`
                        })
                    });
                    if (!mailResponse.ok) {
                        const providerError = await mailResponse.json().catch(() => ({}));
                        console.error("Password reset email provider error:", providerError.message || mailResponse.status);
                        return db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id], () =>
                            res.status(502).json({ success: false, message: "The reset email could not be sent. Check your Resend sender configuration." })
                        );
                    }
                    res.json({ success: true, message: "If an account exists for that email, a reset link will be sent." });
                } catch (mailError) {
                    console.error("Password reset email error:", mailError.message);
                    db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id], () =>
                        res.status(502).json({ success: false, message: "Could not connect to the email service. Try again later." })
                    );
                }
            });
        });
    });
});

app.post("/reset-password", async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8) {
        return res.status(400).json({ success: false, message: "Use a valid reset link and a password with at least 8 characters." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    db.get("SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?", [tokenHash, Date.now()], async (err, reset) => {
        if (err) return res.status(500).json({ success: false, message: "Unable to reset password." });
        if (!reset) return res.status(400).json({ success: false, message: "This reset link is invalid or expired. Request a new one." });
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.run("DELETE FROM password_reset_tokens WHERE id = ? AND expires_at > ?", [reset.id, Date.now()], function (consumeErr) {
                if (consumeErr) return res.status(500).json({ success: false, message: "Unable to reset password." });
                if (this.changes !== 1) return res.status(400).json({ success: false, message: "This reset link has expired or was already used." });
                db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, reset.user_id], function (updateErr) {
                    if (updateErr || this.changes === 0) return res.status(500).json({ success: false, message: "Unable to update the password. Request a new reset link." });
                    db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", [reset.user_id], deleteErr => {
                        if (deleteErr) console.error("Reset token cleanup failed:", deleteErr.message);
                        res.json({ success: true, message: "Password updated. You can now log in." });
                    });
                });
            });
        } catch (hashError) {
            res.status(500).json({ success: false, message: "Unable to update the password." });
        }
    });
});
// Login API
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Please fill all fields."
        });
    }

    db.get(
        "SELECT * FROM users WHERE lower(email) = lower(?)",
        [email],
        async (err, user) => {

            if (err) {
                return res.status(500).json({
                    success: false,
                    message: "Server Error"
                });
            }

            if (!user) {
                return res.json({
                    success: false,
                    message: "Email not found."
                });
            }

            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.json({
                    success: false,
                    message: "Incorrect password."
                });
            }

            res.json({
                success: true,
                message: "Login Successful!",
                user: {
                    id: user.id,
                    name: user.full_name,
                    email: user.email
                }
            });

        }
    );

});
// ==============================
// Create Auction API
// ==============================

app.post("/create-auction", upload.array("images", 5), (req, res) => {

    const {
        user_id,
        product_name,
        category,
        description,
        starting_price,
        min_increment,
        start_date,
        start_time,
        end_date,
        end_time
    } = req.body;


    // ==============================
    // Validate User
    // ==============================

    if (!user_id) {

        return res.status(400).json({
            success: false,
            message: "User ID is required."
        });

    }


    // ==============================
    // Check How Many Auctions User Has
    // ==============================

    db.get(
        `SELECT COUNT(*) AS auction_count
         FROM auctions
         WHERE user_id = ?`,
        [user_id],
        (countErr, result) => {

            if (countErr) {

                console.error(countErr);

                return res.status(500).json({
                    success: false,
                    message: "Unable to check auction eligibility."
                });

            }


            // ==============================
            // First Auction = FREE
            // ==============================

            if (result.auction_count > 0) {

                // User already created an auction.
                // Check for active subscription.

                db.get(
                    `SELECT *
                     FROM subscriptions
                     WHERE user_id = ?
                     AND status = 'Active'
                     AND date(end_date) >= date('now')
                     ORDER BY id DESC
                     LIMIT 1`,
                    [user_id],
                    (subErr, subscription) => {

                        if (subErr) {

                            console.error(subErr);

                            return res.status(500).json({
                                success: false,
                                message: "Unable to check subscription."
                            });

                        }


                        // No active subscription

                        if (!subscription) {

                            return res.status(403).json({
                                success: false,
                                message:
                                    "Your free auction has already been used. Please subscribe to create another auction.",
                                reason: "SUBSCRIPTION_REQUIRED"
                            });

                        }


                        // Subscription exists.
                        // Continue creating auction.

                        createAuction();

                    }
                );

            } else {

                // First auction is free.

                createAuction();

            }


            // ==============================
            // Create Auction Function
            // ==============================

            function createAuction() {

                let imageNames = "";


                // Get uploaded image names

                if (req.files && req.files.length > 0) {

                    imageNames = req.files
                        .map(file => file.filename)
                        .join(",");

                }


                // ==============================
                // Insert Auction
                // ==============================

                db.run(
                    `INSERT INTO auctions
                    (
                        user_id,
                        product_name,
                        category,
                        description,
                        starting_price,
                        min_increment,
                        start_date,
                        start_time,
                        end_date,
                        end_time,
                        image
                    )
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,

                    [
                        user_id,
                        product_name,
                        category,
                        description,
                        starting_price,
                        min_increment,
                        start_date,
                        start_time,
                        end_date,
                        end_time,
                        imageNames
                    ],

                    function(err) {

                        if (err) {

                            console.error(err);

                            return res.status(500).json({
                                success: false,
                                message: "Unable to create auction."
                            });

                        }


                        // ==============================
                        // Success
                        // ==============================

                        res.json({
                            success: true,
                            message: "Auction created successfully!"
                        });

                    }
                );

            }

        }
    );

});
// ==============================
// Recent bid notifications for the seller dashboard.
app.get("/notifications/:user_id", (req, res) => {
    db.all(`SELECT bids.id, bids.bid_amount, bids.created_at,
                   auctions.id AS auction_id, auctions.product_name,
                   users.full_name AS bidder_name
            FROM bids
            INNER JOIN auctions ON auctions.id = bids.auction_id
            INNER JOIN users ON users.id = bids.user_id
            WHERE auctions.user_id = ?
            ORDER BY bids.created_at DESC, bids.id DESC
            LIMIT 10`, [req.params.user_id], (err, notifications) => {
        if (err) {
            console.error("Notification query failed:", err.message);
            return res.status(500).json({ success: false, message: "Unable to load notifications." });
        }
        res.json({ success: true, notifications });
    });
});
// Profile API
// ==============================

app.get("/profile/:user_id", (req, res) => {

    const userId = req.params.user_id;

    db.get(
        `SELECT id, full_name, email, phone
         FROM users
         WHERE id = ?`,
        [userId],
        (err, user) => {

            if (err) {

                console.error("Profile Error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to load profile."
                });

            }

            if (!user) {

                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });

            }

            res.json({
                success: true,
                user: user
            });

        }
    );

});
// ==============================
// Browse All Auctions API
// ==============================
// ==============================
// Single Auction Details API
// ==============================

app.get("/auction/:id", (req, res) => {

    const auctionId = req.params.id;

    db.get(
        `SELECT
            auctions.*,
            users.full_name AS seller_name
         FROM auctions
         LEFT JOIN users
         ON auctions.user_id = users.id
         WHERE auctions.id = ?`,

        [auctionId],

        (err, auction) => {

            if (err) {

                console.error(
                    "Auction Details Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load auction."
                });

            }

            if (!auction) {

                return res.status(404).json({
                    success: false,
                    message: "Auction not found."
                });

            }

            res.json({
                success: true,
                auction: auction
            });

        }
    );

});
// ======================================
// Get Current Highest Bid
// ======================================

app.get("/auction/:id/highest-bid", (req, res) => {

    const auctionId = req.params.id;

    db.get(
        `SELECT
            MAX(bid_amount) AS highest_bid
         FROM bids
         WHERE auction_id = ?`,
        [auctionId],
        (err, result) => {

            if (err) {

                console.error(
                    "Highest Bid Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load highest bid."
                });

            }

            res.json({
                success: true,
                highest_bid: result.highest_bid || 0
            });

        }
    );

});
// ======================================
// Place Bid
// ======================================

app.post("/place-bid", (req, res) => {

    const {
        auction_id,
        user_id,
        bid_amount
    } = req.body;


    // ======================================
    // Validate Input
    // ======================================

    if (!auction_id || !user_id || !bid_amount) {

        return res.status(400).json({
            success: false,
            message: "Auction, user and bid amount are required."
        });

    }


    const bidAmount = Number(bid_amount);


    if (isNaN(bidAmount) || bidAmount <= 0) {

        return res.status(400).json({
            success: false,
            message: "Enter a valid bid amount."
        });

    }


    // ======================================
    // Get Auction
    // ======================================

    db.get(
        `SELECT *
         FROM auctions
         WHERE id = ?`,
        [auction_id],
        (auctionErr, auction) => {

            if (auctionErr) {

                console.error(auctionErr);

                return res.status(500).json({
                    success: false,
                    message: "Unable to load auction."
                });

            }


            if (!auction) {

                return res.status(404).json({
                    success: false,
                    message: "Auction not found."
                });

            }


            // ======================================
            // Seller Cannot Bid On Own Auction
            // ======================================

            if (Number(auction.user_id) === Number(user_id)) {

                return res.status(400).json({
                    success: false,
                    message: "You cannot bid on your own auction."
                });

            }


            // ======================================
            // Check Auction Status
            // ======================================

            if (auction.status !== "Active") {

                return res.status(400).json({
                    success: false,
                    message: "This auction is not active."
                });

            }


            // ======================================
            // Get Highest Existing Bid
            // ======================================

            db.get(
                `SELECT MAX(bid_amount) AS highest_bid
                 FROM bids
                 WHERE auction_id = ?`,
                [auction_id],
                (bidErr, result) => {

                    if (bidErr) {

                        console.error(bidErr);

                        return res.status(500).json({
                            success: false,
                            message: "Unable to check current bid."
                        });

                    }


                    const minimumBid = result.highest_bid == null
                        ? Number(auction.starting_price)
                        : Number(result.highest_bid) + Number(auction.min_increment);


                    // ======================================
                    // Check Bid Amount
                    // ======================================

                    if (bidAmount < minimumBid) {

                        return res.status(400).json({

                            success: false,

                            message:
                                `Your bid must be at least ₹${minimumBid}.`

                        });

                    }


                    // ======================================
                    // Save Bid
                    // ======================================

                    db.run(
                        `INSERT INTO bids
                        (
                            auction_id,
                            user_id,
                            bid_amount
                        )
                        VALUES (?, ?, ?)`,

                        [
                            auction_id,
                            user_id,
                            bidAmount
                        ],

                        function(insertErr) {

                            if (insertErr) {

                                console.error(insertErr);

                                return res.status(500).json({
                                    success: false,
                                    message: "Unable to place bid."
                                });

                            }


                            res.json({

                                success: true,

                                message:
                                    "Bid placed successfully!",

                                bid: {

                                    id: this.lastID,

                                    auction_id:
                                        auction_id,

                                    user_id:
                                        user_id,

                                    bid_amount:
                                        bidAmount

                                }

                            });

                        }
                    );

                }
            );

        }
    );

});
// ======================================
// Get Bid History
// ======================================

app.get("/auction/:id/bids", (req, res) => {

    const auctionId = req.params.id;

    db.all(
        `SELECT
            bids.id,
            bids.bid_amount,
            bids.created_at,
            users.full_name AS bidder_name
         FROM bids
         INNER JOIN users
         ON bids.user_id = users.id
         WHERE bids.auction_id = ?
         ORDER BY bids.bid_amount DESC, bids.created_at DESC`,
        [auctionId],
        (err, bids) => {

            if (err) {

                console.error(
                    "Bid History Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load bid history."
                });

            }

            res.json({
                success: true,
                bids: bids
            });

        }
    );

});
// ======================================
// Get Auction Winner
// ======================================

app.get("/auction/:id/winner", (req, res) => {

    const auctionId = req.params.id;

    db.get(
        `SELECT
            bids.bid_amount,
            bids.created_at,
            users.id AS user_id,
            users.full_name AS winner_name
         FROM bids
         INNER JOIN users
         ON bids.user_id = users.id
         WHERE bids.auction_id = ?
         ORDER BY bids.bid_amount DESC,
                  bids.created_at ASC
         LIMIT 1`,
        [auctionId],
        (err, winner) => {

            if (err) {

                console.error(
                    "Winner Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to determine winner."
                });

            }

            if (!winner) {

                return res.json({
                    success: true,
                    winner: null
                });

            }

            res.json({
                success: true,
                winner: winner
            });

        }
    );

});
// ======================================
// Get My Bids
// ======================================

app.get("/my-bids/:user_id", (req, res) => {

    const userId = req.params.user_id;

    db.all(
        `SELECT
            bids.id AS bid_id,
            bids.auction_id,
            bids.bid_amount,
            bids.created_at,

            auctions.product_name,
            auctions.starting_price,
            auctions.min_increment,
            auctions.start_date,
            auctions.start_time,
            auctions.end_date,
            auctions.end_time,
            auctions.status,
            auctions.image,

            users.full_name AS seller_name

         FROM bids

         INNER JOIN auctions
         ON bids.auction_id = auctions.id

         INNER JOIN users
         ON auctions.user_id = users.id

         WHERE bids.user_id = ?

         ORDER BY bids.created_at DESC`,
        [userId],
        (err, bids) => {

            if (err) {

                console.error(
                    "My Bids Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message: "Unable to load your bids."
                });

            }

            res.json({
                success: true,
                bids: bids
            });

        }
    );

});
app.get("/auctions", (req, res) => {

    db.all(
        `SELECT
            id,
            user_id,
            product_name,
            category,
            description,
            starting_price,
            min_increment,
            start_date,
            start_time,
            end_date,
            end_time,
            image,
            status,
            created_at
         FROM auctions
         ORDER BY created_at DESC`,

        [],

        (err, auctions) => {

            if (err) {

                console.error(
                    "Browse Auctions Error:",
                    err
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to load auctions."
                });

            }

            res.json({
                success: true,
                auctions: auctions
            });

        }
    );

});
app.get("/my-auctions/:user_id", (req, res) => {

    const userId = req.params.user_id;

    db.all(
        `SELECT * FROM auctions
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId],
        (err, auctions) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to load auctions."
                });

            }

            res.json({
                success: true,
                auctions: auctions
            });

        }
    );

});
// ======================================
// Delete My Auction
// ======================================

app.delete("/delete-auction/:id", (req, res) => {

    const auctionId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({
            success: false,
            message: "User ID is required."
        });
    }

    // First check that this auction belongs to this user
    db.get(
        `SELECT * FROM auctions
         WHERE id = ?
         AND user_id = ?`,
        [auctionId, user_id],
        (err, auction) => {

            if (err) {
                console.error("Delete Auction Error:", err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to delete auction."
                });
            }

            if (!auction) {
                return res.status(404).json({
                    success: false,
                    message: "Auction not found or you don't have permission to delete it."
                });
            }

            // Delete auction
            db.run(
                `DELETE FROM auctions
                 WHERE id = ?
                 AND user_id = ?`,
                [auctionId, user_id],
                function(deleteErr) {

                    if (deleteErr) {
                        console.error(deleteErr);

                        return res.status(500).json({
                            success: false,
                            message: "Unable to delete auction."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Auction deleted successfully."
                    });

                }
            );

        }
    );

});
// ==============================
// Subscription Status API
// ==============================

app.get("/subscription/:user_id", (req, res) => {

    const userId = req.params.user_id;

    db.get(
        `SELECT *
         FROM subscriptions
         WHERE user_id = ?
         AND status = 'Active'
         AND date(end_date) >= date('now')
         ORDER BY id DESC
         LIMIT 1`,
        [userId],
        (err, subscription) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to check subscription."
                });

            }

            res.json({
                success: true,
                subscription: subscription || null
            });

        }
    );

});
// ==============================
// Check Auction Eligibility
// ==============================

app.get("/auction-eligibility/:user_id", (req, res) => {

    const userId = req.params.user_id;

    db.get(
        `SELECT COUNT(*) AS auction_count
         FROM auctions
         WHERE user_id = ?`,
        [userId],
        (err, result) => {

            if (err) {

                console.error(err);

                return res.status(500).json({
                    success: false,
                    message: "Unable to check auction eligibility."
                });

            }

            if (result.auction_count === 0) {

                return res.json({
                    success: true,
                    allowed: true,
                    reason: "FIRST_AUCTION_FREE"
                });

            }

            db.get(
                `SELECT *
                 FROM subscriptions
                 WHERE user_id = ?
                 AND status = 'Active'
                 AND date(end_date) >= date('now')
                 ORDER BY id DESC
                 LIMIT 1`,
                [userId],
                (subErr, subscription) => {

                    if (subErr) {

                        return res.status(500).json({
                            success: false,
                            message: "Unable to check subscription."
                        });

                    }

                    if (subscription) {

                        return res.json({
                            success: true,
                            allowed: true,
                            reason: "ACTIVE_SUBSCRIPTION"
                        });

                    }

                    res.json({
                        success: true,
                        allowed: false,
                        reason: "SUBSCRIPTION_REQUIRED"
                    });

                }
            );

        }
    );

});
// ======================================
// Razorpay - Create Subscription Order
// ======================================

app.post("/create-subscription-order", async (req, res) => {

    const { user_id, terms_accepted } = req.body;

    if (!user_id) {
        return res.status(400).json({ success: false, message: "User ID is required." });
    }
    if (terms_accepted !== true) {
        return res.status(400).json({ success: false, message: "Please accept the Terms and Conditions before paying." });
    }
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return res.status(503).json({ success: false, message: "Razorpay credentials are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env, then restart the server." });
    }

    try {
        const amount = 49900;
        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: `subscription_${user_id}_${Date.now()}`,
            notes: { user_id: String(user_id), plan: "Monthly Seller" }
        });

        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        const reason = error.error?.description || error.message || "Unknown Razorpay error.";
        console.error("Razorpay order creation failed:", reason);
        res.status(502).json({ success: false, message: `Razorpay could not create the order: ${reason}` });
    }
});

// Razorpay single-use UPI QR for a Monthly Seller subscription.
app.post("/create-subscription-qr", async (req, res) => {
    const { user_id, terms_accepted } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: "User ID is required." });
    if (terms_accepted !== true) return res.status(400).json({ success: false, message: "Accept the Terms and Conditions before paying." });
    try {
        const qr = await razorpay.qrCode.create({
            type: "upi_qr", name: "AuctFy Monthly Seller", usage: "single_use",
            fixed_amount: true, payment_amount: 49900,
            description: "AuctFy Monthly Seller plan - 30 days",
            close_by: Math.floor(Date.now() / 1000) + 20 * 60,
            notes: { user_id: String(user_id), plan: "Monthly Seller" }
        });
        res.json({ success: true, qr_id: qr.id, image_url: qr.image_url, amount: 49900, close_by: qr.close_by });
    } catch (error) {
        const reason = error.error?.description || error.message || "Unknown Razorpay error.";
        console.error("Razorpay UPI QR creation failed:", reason);
        res.status(502).json({ success: false, message: `Could not create UPI QR: ${reason}` });
    }
});

app.post("/subscription-qr-status", async (req, res) => {
    const { user_id, qr_id } = req.body;
    if (!user_id || !qr_id) return res.status(400).json({ success: false, message: "User and QR details are required." });
    try {
        const qr = await razorpay.qrCode.fetch(qr_id);
        if (String(qr.notes?.user_id) !== String(user_id) || qr.payment_amount !== 49900 || qr.type !== "upi_qr") {
            return res.status(400).json({ success: false, message: "This QR code does not match this account and subscription." });
        }
        const paymentList = await razorpay.qrCode.fetchAllPayments(qr_id, { count: 100 });
        let payment = (paymentList.items || []).find(item => item.status === "captured" && item.amount === 49900 && item.currency === "INR");
        if (!payment) {
            payment = (paymentList.items || []).find(item => item.status === "authorized" && item.amount === 49900 && item.currency === "INR");
            if (payment) payment = await razorpay.payments.capture(payment.id, 49900, "INR");
        }
        if (!payment) return res.json({ success: true, paid: false, status: qr.status });
        if (payment.status !== "captured") return res.status(409).json({ success: false, message: `UPI payment status is ${payment.status}; waiting for capture.` });

        db.run("INSERT OR IGNORE INTO subscription_payment_receipts (payment_id, user_id) VALUES (?, ?)", [payment.id, user_id], function (receiptErr) {
            if (receiptErr) return res.status(500).json({ success: false, message: "Payment arrived but could not be recorded. Contact support with payment ID " + payment.id });
            if (this.changes === 0) return res.json({ success: true, paid: true, message: "UPI payment already confirmed." });
            const startDate = new Date();
            const endDate = new Date(); endDate.setDate(endDate.getDate() + 30);
            const start = startDate.toISOString().split("T")[0];
            const end = endDate.toISOString().split("T")[0];
            db.run("INSERT INTO subscriptions (user_id, plan, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)", [user_id, "Monthly Seller", start, end, "Active"], function (subErr) {
                if (subErr) {
                    db.run("DELETE FROM subscription_payment_receipts WHERE payment_id = ?", [payment.id]);
                    return res.status(500).json({ success: false, message: "Payment captured but subscription activation failed. Contact support with payment ID " + payment.id });
                }
                res.json({ success: true, paid: true, message: "UPI payment confirmed and subscription activated.", subscription: { plan: "Monthly Seller", start_date: start, end_date: end } });
            });
        });
    } catch (error) {
        const reason = error.error?.description || error.message || "Unknown Razorpay error.";
        console.error("UPI QR status check failed:", reason);
        res.status(502).json({ success: false, message: `Could not check UPI payment: ${reason}` });
    }
});
// ======================================
// Razorpay - Verify Subscription Payment
// ======================================

app.post("/verify-subscription-payment", async (req, res) => {
    const { user_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!user_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: "Payment details are incomplete." });
    }

    try {
        // Load order details from Razorpay so the client cannot substitute another order.
        const order = await razorpay.orders.fetch(razorpay_order_id);
        if (String(order.notes?.user_id) !== String(user_id) ||
            order.amount !== 49900 || order.currency !== "INR") {
            return res.status(400).json({ success: false, message: "This payment order does not match this account and plan." });
        }

        const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${order.id}|${razorpay_payment_id}`)
            .digest();
        const supplied = Buffer.from(razorpay_signature, "hex");
        if (supplied.length !== expected.length || !crypto.timingSafeEqual(expected, supplied)) {
            return res.status(400).json({ success: false, message: "Razorpay payment signature did not match. Check that the server is using the same test or live key pair as Checkout." });
        }

        let payment = await razorpay.payments.fetch(razorpay_payment_id);
        if (payment.order_id !== order.id || payment.amount !== order.amount || payment.currency !== order.currency) {
            return res.status(400).json({ success: false, message: "The Razorpay payment does not match this subscription order." });
        }
        if (payment.status === "authorized") {
            payment = await razorpay.payments.capture(payment.id, order.amount, order.currency);
        }
        if (payment.status !== "captured") {
            return res.status(409).json({ success: false, message: `Payment status is ${payment.status}. AuctFy activates subscriptions only after Razorpay captures payment.` });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        const start = startDate.toISOString().split("T")[0];
        const end = endDate.toISOString().split("T")[0];

        db.run(
            `INSERT INTO subscriptions (user_id, plan, start_date, end_date, status)
             VALUES (?, ?, ?, ?, ?)`,
            [user_id, "Monthly Seller", start, end, "Active"],
            function (err) {
                if (err) {
                    console.error("Subscription Database Error:", err);
                    return res.status(500).json({ success: false, message: "Payment was captured, but subscription activation failed. Contact AuctFy support with payment ID " + razorpay_payment_id + "." });
                }
                res.json({
                    success: true,
                    message: "Payment captured and subscription activated.",
                    subscription: { plan: "Monthly Seller", start_date: start, end_date: end }
                });
            }
        );
    } catch (error) {
        const reason = error.error?.description || error.message || "Unknown Razorpay verification error.";
        console.error("Razorpay payment verification failed:", reason);
        res.status(502).json({ success: false, message: `Razorpay verification failed: ${reason}` });
    }
});
// ======================================
// Automatically Update Auction Status
// ======================================

function updateAuctionStatuses() {

    const now = new Date();

    const currentDate =
        now.toISOString().split("T")[0];

    const currentTime =
        now.toTimeString().slice(0, 5);


    // ======================================
    // Scheduled → Active
    // ======================================

    db.run(
        `UPDATE auctions
         SET status = 'Active'
         WHERE status = 'Scheduled'
         AND (
             start_date < ?
             OR (
                 start_date = ?
                 AND start_time <= ?
             )
         )
         AND (
             end_date > ?
             OR (
                 end_date = ?
                 AND end_time > ?
             )
         )`,
        [
            currentDate,
            currentDate,
            currentTime,
            currentDate,
            currentDate,
            currentTime
        ],
        function(err) {

            if (err) {

                console.error(
                    "Error activating auctions:",
                    err
                );

            }

        }
    );


    // ======================================
    // Active → Ended
    // ======================================

    db.run(
        `UPDATE auctions
         SET status = 'Ended'
         WHERE status = 'Active'
         AND (
             end_date < ?
             OR (
                 end_date = ?
                 AND end_time <= ?
             )
         )`,
        [
            currentDate,
            currentDate,
            currentTime
        ],
        function(err) {

            if (err) {

                console.error(
                    "Error ending auctions:",
                    err
                );

            }

        }
    );

}


// ======================================
// Run Status Check
// ======================================

// Check immediately when server starts
updateAuctionStatuses();


// Check every 30 seconds
setInterval(
    updateAuctionStatuses,
    30 * 1000
);

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});











