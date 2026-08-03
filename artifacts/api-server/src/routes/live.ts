import { Router } from "express";
import { db } from "@workspace/db";
import { liveTvTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { scrapeLiveTV } from "../lib/scraper.js";

const router = Router();

// GET /api/live/channels — list all live TV channels
router.get("/live/channels", async (req, res) => {
  const { group } = req.query as { group?: string };
  let rows = await db.select().from(liveTvTable).orderBy(liveTvTable.group, liveTvTable.name);
  if (group) rows = rows.filter((r) => r.group === group);
  res.json({ channels: rows });
});

// GET /api/live/groups — distinct group names
router.get("/live/groups", async (_req, res) => {
  const rows = await db.select({ group: liveTvTable.group }).from(liveTvTable);
  const groups = [...new Set(rows.map((r) => r.group).filter(Boolean))].sort();
  res.json({ groups });
});

// POST /api/live/refresh — re-scrape M3U8 and status
router.post("/live/refresh", async (_req, res) => {
  try {
    const count = await scrapeLiveTV();
    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
