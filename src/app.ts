import express from "express";
import driveUploadRouter from "./routes/driveUpload.router";

export function createApp() {
  const app = express();

  // ── Global middleware ───────────────────────────────────────────────────────
  app.use(express.json());

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use("/api/drive", driveUploadRouter);

  // ── 404 fallback ────────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  return app;
}
