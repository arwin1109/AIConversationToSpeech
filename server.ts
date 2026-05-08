import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieSession from "cookie-session";
import fs from "fs";
import { promises as fsPromises } from "fs";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const CACHE_DIR = path.join(process.cwd(), "audiocache");
  const ARCHIVE_DIR = path.join(process.cwd(), "audiocache_archive");

  // Ensure cache directories exist
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR);
  }
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR);
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(
    cookieSession({
      name: "session",
      keys: [process.env.SESSION_SECRET || "default_secret"],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: true,
      sameSite: "none",
    })
  );

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"
  );

  // API Routes
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

  app.post("/api/auth/logout", (req, res) => {
    req.session = null;
    res.json({ success: true });
  });

  app.post("/api/drive/upload", async (req, res) => {
    if (!req.session?.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
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

  // Server Cache Routes
  app.post("/api/cache/save", async (req, res) => {
    const { fileName, audioBase64 } = req.body;
    if (!fileName || !audioBase64) {
      return res.status(400).json({ error: "Missing filename or audio data" });
    }

    try {
      // Store raw base64 string as text so we get the exact same data back
      const filePath = path.join(CACHE_DIR, fileName + ".b64");
      await fsPromises.writeFile(filePath, audioBase64, "utf-8");
      res.json({ success: true, path: fileName });
    } catch (error) {
      console.error("Error saving to server cache:", error);
      res.status(500).json({ error: "Failed to save to server cache" });
    }
  });

  app.delete("/api/cache/clear", async (req, res) => {
    try {
      const files = await fsPromises.readdir(CACHE_DIR);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      for (const file of files) {
        const oldPath = path.join(CACHE_DIR, file);
        const newPath = path.join(ARCHIVE_DIR, `${timestamp}_${file}`);
        await fsPromises.rename(oldPath, newPath);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing server cache:", error);
      res.status(500).json({ error: "Failed to clear server cache" });
    }
  });

  app.get("/api/cache/list", async (req, res) => {
    try {
      const files = await fsPromises.readdir(CACHE_DIR);
      res.json({ files });
    } catch (error) {
      res.json({ files: [] });
    }
  });

  app.get("/api/cache/get/:fileName", async (req, res) => {
    try {
      const filePath = path.join(CACHE_DIR, req.params.fileName);
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
