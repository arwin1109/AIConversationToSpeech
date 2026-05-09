import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import cookieParser from "cookie-parser";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB,
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Update schema for new fields
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS age INT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(255);`);
    // Seed admin
    const res = await pool.query("SELECT * FROM users WHERE username = 'admin'");
    if (res.rows.length === 0) {
      const hash = await bcrypt.hash("admin$123", 10);
      await pool.query("INSERT INTO users (username, password_hash, email, is_verified) VALUES ($1, $2, $3, true)", ["admin", hash, "aravind.balineni@code2vibe.dev"]);
      console.log("Admin user seeded with email.");
    } else {
      // Update existing admin if email is missing
      await pool.query("UPDATE users SET email = $1, is_verified = true WHERE username = 'admin' AND email IS NULL", ["aravind.balineni@code2vibe.dev"]);
    }
    console.log("Database initialized.");
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
}

// Setup NodeMailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function startServer() {
  await initDb();

  const app = express();
  
  // Middleware to protect routes
  const requireAuth = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };
  
  app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
  });

  const PORT = 3000;
  const BASE_CACHE_DIR = path.join(process.cwd(), "audiocache");
  const BASE_ARCHIVE_DIR = path.join(process.cwd(), "audiocache_archive");

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());
  app.use(
    cookieSession({
      name: "session",
      keys: [process.env.SESSION_SECRET || "default_secret"],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false, // Set to true if using HTTPS in production
      sameSite: "lax",
    })
  );

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"
  );

  // --- AUTHENTICATION API ---
  const JWT_SECRET = process.env.JWT_SECRET_KEY || "prism-jwt-secret-key-2025-change-in-production";

  app.post("/api/auth/register", async (req, res) => {
    const { username, password, email, age, gender, phone, dob } = req.body;
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const token = crypto.randomBytes(32).toString('hex');

      await pool.query(
        "INSERT INTO users (username, password_hash, email, age, gender, phone, dob, verification_token) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [username, passwordHash, email, age, gender, phone, dob, token]
      );
      
      // Send verification email
      const verifyUrl = `http://localhost:${PORT}/api/auth/verify?token=${token}`;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: "Verify Your Gemini Voice Library Account",
          html: `<p>Hi ${username},</p><p>Please verify your email by clicking the link below:</p><a href="${verifyUrl}">${verifyUrl}</a>`
        });
        console.log(`Verification email sent to ${email}`);
      } catch (emailErr) {
        console.error("Failed to send verification email:", emailErr);
        console.log(`MOCK EMAIL SENT: Click this link to verify: ${verifyUrl}`);
      }

      res.json({ success: true, message: "Registration successful. Please check your email to verify." });
    } catch (e: any) {
      if (e.code === '23505') return res.status(400).json({ error: "Username or email already taken" });
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });
      
      if (!user.is_verified) {
        return res.status(403).json({ error: "Please verify your email address before logging in." });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
      res.json({ 
        success: true, 
        user: { 
          id: user.id, 
          username: user.username, 
          email: user.email,
          age: user.age,
          gender: user.gender,
          phone: user.phone,
          dob: user.dob,
          gemini_api_key: user.gemini_api_key 
        } 
      });
    } catch (e) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/auth/verify", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send("Invalid token");

    try {
      const result = await pool.query("UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING id", [token]);
      if (result.rowCount === 0) {
        return res.status(400).send("Invalid or expired verification token");
      }
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #09090b; color: white;">
            <div style="text-align: center; padding: 2rem; background: #18181b; border-radius: 1rem; border: 1px solid #27272a;">
              <h1 style="color: #4ade80;">Email Verified!</h1>
              <p>Your account is now verified. You can close this window and log in.</p>
              <a href="/" style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #4f46e5; color: white; text-decoration: none; border-radius: 0.5rem;">Go to Login</a>
            </div>
          </body>
        </html>
      `);
    } catch (e) {
      console.error(e);
      res.status(500).send("Server error");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    req.session = null;
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    console.log("HIT /api/auth/me", req.cookies);
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not logged in" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const result = await pool.query("SELECT id, username, email, age, gender, phone, dob, gemini_api_key FROM users WHERE id = $1", [decoded.id]);
      if (result.rows.length === 0) return res.status(401).json({ error: "User not found" });
      res.json({ user: result.rows[0] });
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.put("/api/user/profile", requireAuth, async (req: any, res) => {
    const { age, gender, phone, email, dob } = req.body;
    try {
      await pool.query(
        "UPDATE users SET age = $1, gender = $2, phone = $3, email = $4, dob = $5 WHERE id = $6",
        [age, gender, phone, email, dob, req.user.id]
      );
      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to update profile:", e);
      if (e.code === '23505') return res.status(400).json({ error: "Email already taken" });
      res.status(500).json({ error: "Server error: " + e.message });
    }
  });

  app.put("/api/user/apikey", requireAuth, async (req: any, res) => {
    const { apiKey } = req.body;
    try {
      const result = await pool.query("UPDATE users SET gemini_api_key = $1 WHERE id = $2", [apiKey, req.user.id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "Server error" });
    }
  });



  // Helper to get user cache dir
  const getUserDirs = (userId: number) => {
    const cacheDir = path.join(BASE_CACHE_DIR, userId.toString());
    const archiveDir = path.join(BASE_ARCHIVE_DIR, userId.toString());
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    return { cacheDir, archiveDir };
  };

  // Google OAuth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const scopes = ["https://www.googleapis.com/auth/drive.file"];
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      req.session!.tokens = tokens;
      
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; color: #18181b;">
            <div style="text-align: center;">
              <h2 style="margin-bottom: 8px;">Success!</h2>
              <p>Google Drive connected. This window will close automatically.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/auth/status", (req, res) => {
    res.json({ isAuthenticated: !!req.session?.tokens });
  });

  app.post("/api/drive/upload", requireAuth, async (req, res) => {
    if (!req.session?.tokens) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const { fileName, audioBase64 } = req.body;
    if (!fileName || !audioBase64) {
      return res.status(400).json({ error: "Missing filename or audio data" });
    }

    try {
      oauth2Client.setCredentials(req.session.tokens);
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      const buffer = Buffer.from(audioBase64, "base64");
      const streamedBuffer = new (await import("stream")).Readable();
      streamedBuffer.push(buffer);
      streamedBuffer.push(null);

      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          mimeType: "audio/wav",
        },
        media: {
          mimeType: "audio/wav",
          body: streamedBuffer,
        },
      });

      res.json({ success: true, fileId: response.data.id });
    } catch (error: any) {
      console.error("Error uploading to Google Drive:", error);
      if (error.code === 401) {
        req.session = null;
        return res.status(401).json({ error: "Session expired" });
      }
      res.status(500).json({ error: "Failed to upload to Google Drive" });
    }
  });

  // --- SERVER CACHE ROUTES (Protected) ---
  app.post("/api/cache/save", requireAuth, async (req: any, res) => {
    const { fileName, audioBase64 } = req.body;
    if (!fileName || !audioBase64) {
      return res.status(400).json({ error: "Missing filename or audio data" });
    }

    try {
      const { cacheDir } = getUserDirs(req.user.id);
      const filePath = path.join(cacheDir, fileName + ".b64");
      await fsPromises.writeFile(filePath, audioBase64, "utf-8");
      res.json({ success: true, path: fileName });
    } catch (error) {
      console.error("Error saving to server cache:", error);
      res.status(500).json({ error: "Failed to save to server cache" });
    }
  });

  app.delete("/api/cache/clear", requireAuth, async (req: any, res) => {
    try {
      const { cacheDir, archiveDir } = getUserDirs(req.user.id);
      const files = await fsPromises.readdir(cacheDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      for (const file of files) {
        const oldPath = path.join(cacheDir, file);
        const newPath = path.join(archiveDir, `${timestamp}_${file}`);
        await fsPromises.rename(oldPath, newPath);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing server cache:", error);
      res.status(500).json({ error: "Failed to clear server cache" });
    }
  });

  app.get("/api/cache/list", requireAuth, async (req: any, res) => {
    try {
      const { cacheDir } = getUserDirs(req.user.id);
      const files = await fsPromises.readdir(cacheDir);
      res.json({ files });
    } catch (error) {
      res.json({ files: [] });
    }
  });

  app.get("/api/cache/get/:fileName", requireAuth, async (req: any, res) => {
    try {
      const { cacheDir } = getUserDirs(req.user.id);
      const filePath = path.join(cacheDir, req.params.fileName);
      const audioBase64 = await fsPromises.readFile(filePath, "utf-8");
      res.json({ audioBase64 });
    } catch (error) {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
