import { Router } from "express";
import { db } from "@workspace/db";
import { scraperJobsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  runScraperJob,
  stopScraper,
  getActiveJobId,
  type JobType,
} from "../lib/scraper.js";

const router = Router();

// ─── GET /api/scraper/status ─────────────────────────────────────────────────
// Get current scraper status and recent jobs
router.get("/scraper/status", async (_req, res) => {
  const activeId = getActiveJobId();

  const recentJobs = await db
    .select()
    .from(scraperJobsTable)
    .orderBy(desc(scraperJobsTable.createdAt))
    .limit(10);

  const activeJob = activeId
    ? recentJobs.find((j) => j.id === activeId) ?? null
    : null;

  res.json({
    isRunning: activeId !== null,
    activeJobId: activeId,
    activeJob,
    recentJobs,
  });
});

// ─── GET /api/scraper/jobs/:id ────────────────────────────────────────────────
// Get a specific job with full log
router.get("/scraper/jobs/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ error: "Invalid job id" });
    return;
  }

  const [job] = await db
    .select()
    .from(scraperJobsTable)
    .where(eq(scraperJobsTable.id, id))
    .limit(1);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ job });
});

// ─── POST /api/scraper/start ─────────────────────────────────────────────────
// Start a new scraper job
router.post("/scraper/start", async (req, res) => {
  const jobType = (req.body?.type as JobType) || "full";
  const validTypes: JobType[] = ["full", "metadata", "video", "update_check"];

  if (!validTypes.includes(jobType)) {
    res.status(400).json({
      error: `Invalid job type. Must be one of: ${validTypes.join(", ")}`,
    });
    return;
  }

  try {
    const jobId = await runScraperJob(jobType);
    res.status(202).json({
      jobId,
      message: `${jobType} scraper job started`,
      statusUrl: `/api/scraper/jobs/${jobId}`,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes("already running")) {
      res.status(409).json({
        error: "A scraper job is already running",
        activeJobId: getActiveJobId(),
      });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// ─── POST /api/scraper/stop ──────────────────────────────────────────────────
// Stop the active scraper job
router.post("/scraper/stop", async (_req, res) => {
  const activeId = getActiveJobId();
  if (!activeId) {
    res.status(404).json({ error: "No active scraper job" });
    return;
  }

  stopScraper();
  res.json({ message: "Stop signal sent", jobId: activeId });
});

export default router;
