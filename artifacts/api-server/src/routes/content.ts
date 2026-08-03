import { Router } from "express";
import { db } from "@workspace/db";
import {
  contentTable,
  episodesTable,
  videoSourcesTable,
} from "@workspace/db";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { refreshVideoUrls, searchNative, fetchAoneroomDetail } from "../lib/scraper.js";

const router = Router();

// ─── GET /api/content ─────────────────────────────────────────────────────────
router.get("/content", async (req, res) => {
  const { type, category, q, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  const conds: ReturnType<typeof eq>[] = [];
  if (type === "movie" || type === "tv") conds.push(eq(contentTable.type, type));
  if (q) conds.push(like(contentTable.title, `%${q}%`));
  if (category) {
    conds.push(sql`${contentTable.categories} @> ARRAY[${category}]::text[]` as ReturnType<typeof eq>);
  }

  const where = conds.length ? and(...conds) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      id: contentTable.id,
      tmdbId: contentTable.tmdbId,
      subjectId: contentTable.subjectId,
      type: contentTable.type,
      title: contentTable.title,
      year: contentTable.year,
      rating: contentTable.rating,
      overview: contentTable.overview,
      posterPath: contentTable.posterPath,
      backdropPath: contentTable.backdropPath,
      genre: contentTable.genre,
      hueDark: contentTable.hueDark,
      detailPath: contentTable.detailPath,
      categories: contentTable.categories,
      qualities: contentTable.qualities,
      scrapedOk: contentTable.scrapedOk,
      dubs: contentTable.dubs,
    }).from(contentTable).where(where)
      .orderBy(desc(contentTable.rating)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contentTable).where(where),
  ]);

  res.json({ data: rows, pagination: { page: pageNum, limit: limitNum, total: countResult[0]?.count ?? 0 } });
});

// ─── GET /api/content/categories ─────────────────────────────────────────────
router.get("/content/categories", async (_req, res) => {
  const rows = await db.execute<{ category: string }>(
    sql`SELECT DISTINCT unnest(categories) as category FROM content ORDER BY category`,
  );
  res.json({ categories: rows.rows.map((r) => r.category) });
});

// ─── GET /api/content/search ─────────────────────────────────────────────────
router.get("/content/search", async (req, res) => {
  const q = (req.query.q as string) || "";
  if (!q || q.length < 2) { res.status(400).json({ error: "Query must be at least 2 characters" }); return; }

  const [local, remote] = await Promise.all([
    db.select({
      id: contentTable.id,
      subjectId: contentTable.subjectId,
      tmdbId: contentTable.tmdbId,
      type: contentTable.type,
      title: contentTable.title,
      year: contentTable.year,
      rating: contentTable.rating,
      posterPath: contentTable.posterPath,
      genre: contentTable.genre,
    }).from(contentTable).where(like(contentTable.title, `%${q}%`))
      .orderBy(desc(contentTable.rating)).limit(20),
    searchNative(q),
  ]);

  res.json({ local, remote });
});

// ─── GET /api/content/:id — by DB id or subjectId ────────────────────────────
router.get("/content/subject/:subjectId", async (req, res) => {
  const { subjectId } = req.params;
  const [content] = await db.select().from(contentTable)
    .where(eq(contentTable.subjectId, subjectId)).limit(1);

  if (!content) {
    // Try live from AoneRoom
    const detail = await fetchAoneroomDetail(subjectId);
    if (!detail) { res.status(404).json({ error: "Not found" }); return; }
    const sub = detail.data.subject;
    res.json({
      content: {
        subjectId,
        type: sub.subjectType === 1 ? "movie" : "tv",
        title: sub.title,
        overview: sub.description,
        genre: sub.genre,
        posterPath: sub.cover.url,
        dubs: sub.dubs,
        seasonsInfo: detail.data.resource.seasons,
      },
      live: true,
    });
    return;
  }

  const [videoSources, episodes] = await Promise.all([
    db.select().from(videoSourcesTable).where(eq(videoSourcesTable.contentId, content.id)),
    content.type === "tv"
      ? db.select().from(episodesTable).where(eq(episodesTable.contentId, content.id))
          .orderBy(episodesTable.seasonNum, episodesTable.episodeNum)
      : Promise.resolve([]),
  ]);

  res.json({ content, videoSources, episodes });
});

// ─── GET /api/content/:tmdbId/:type ──────────────────────────────────────────
router.get("/content/:tmdbId/:type", async (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId, 10);
  const type = req.params.type as "movie" | "tv";
  if (!tmdbId || (type !== "movie" && type !== "tv")) {
    res.status(400).json({ error: "Invalid tmdbId or type" }); return;
  }

  const [content] = await db.select().from(contentTable)
    .where(and(sql`${contentTable.tmdbId} = ${tmdbId}`, eq(contentTable.type, type))).limit(1);

  if (!content) { res.status(404).json({ error: "Content not found" }); return; }

  const [videoSources, episodes] = await Promise.all([
    db.select().from(videoSourcesTable).where(eq(videoSourcesTable.contentId, content.id)),
    type === "tv"
      ? db.select().from(episodesTable).where(eq(episodesTable.contentId, content.id))
          .orderBy(episodesTable.seasonNum, episodesTable.episodeNum)
      : Promise.resolve([]),
  ]);

  res.json({ content, videoSources, episodes });
});

// ─── GET /api/content/:tmdbId/:type/video ────────────────────────────────────
router.get("/content/:tmdbId/:type/video", async (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId, 10);
  const type = req.params.type as "movie" | "tv";
  const quality = (req.query.quality as string) || "480";
  const seasonNum = req.query.season ? parseInt(req.query.season as string, 10) : 1;
  const episodeNum = req.query.episode ? parseInt(req.query.episode as string, 10) : 1;

  if (!tmdbId || (type !== "movie" && type !== "tv")) {
    res.status(400).json({ error: "Invalid tmdbId or type" }); return;
  }

  const [content] = await db.select().from(contentTable)
    .where(and(sql`${contentTable.tmdbId} = ${tmdbId}`, eq(contentTable.type, type))).limit(1);

  if (!content) {
    // Live fetch from embed API
    const embed = await refreshVideoUrls(0, tmdbId, type, seasonNum, episodeNum);
    if (!embed?.mp4) { res.status(404).json({ error: "Video not found" }); return; }
    res.json({
      url: embed.mp4, quality: embed.resolution || "480",
      expiresAt: embed.exp ? new Date(embed.exp * 1000) : null,
      streams: embed.streams, captions: embed.captions, live: true,
    });
    return;
  }

  let episodeId: number | undefined;
  if (type === "tv") {
    const [ep] = await db.select({ id: episodesTable.id }).from(episodesTable)
      .where(and(eq(episodesTable.contentId, content.id),
        eq(episodesTable.seasonNum, seasonNum), eq(episodesTable.episodeNum, episodeNum))).limit(1);
    episodeId = ep?.id;
  }

  const sources = await db.select().from(videoSourcesTable).where(
    and(eq(videoSourcesTable.contentId, content.id), eq(videoSourcesTable.quality, quality),
      ...(episodeId !== undefined ? [eq(videoSourcesTable.episodeId, episodeId)] : [])),
  );

  const now = new Date();
  const source = sources[0];
  const isExpired = !source || (source.expiresAt && source.expiresAt <= now);

  if (isExpired) {
    const embed = await refreshVideoUrls(content.id, tmdbId, type, seasonNum, episodeNum);
    if (!embed?.mp4) { res.status(503).json({ error: "Video URL expired and refresh failed" }); return; }
    const allSources = await db.select().from(videoSourcesTable)
      .where(and(eq(videoSourcesTable.contentId, content.id),
        ...(episodeId !== undefined ? [eq(videoSourcesTable.episodeId, episodeId)] : [])));
    res.json({
      url: embed.mp4, quality: embed.resolution || "480",
      expiresAt: embed.exp ? new Date(embed.exp * 1000) : null,
      streams: embed.streams, captions: embed.captions,
      allQualities: allSources.map((s) => ({ quality: s.quality, url: s.url, server: s.server })),
    });
    return;
  }

  const allSources = await db.select().from(videoSourcesTable)
    .where(and(eq(videoSourcesTable.contentId, content.id),
      ...(episodeId !== undefined ? [eq(videoSourcesTable.episodeId, episodeId)] : [])));

  res.json({
    url: source.url, quality: source.quality, server: source.server,
    expiresAt: source.expiresAt, contentId: content.id,
    allQualities: allSources.map((s) => ({ quality: s.quality, url: s.url, server: s.server })),
  });
});

// ─── GET /api/content/:tmdbId/:type/episodes ─────────────────────────────────
router.get("/content/:tmdbId/:type/episodes", async (req, res) => {
  const tmdbId = parseInt(req.params.tmdbId, 10);
  const type = req.params.type;
  if (type !== "tv") { res.status(400).json({ error: "Episodes only for TV" }); return; }

  const [content] = await db.select({ id: contentTable.id, title: contentTable.title, seasonsInfo: contentTable.seasonsInfo })
    .from(contentTable).where(and(sql`${contentTable.tmdbId} = ${tmdbId}`, eq(contentTable.type, "tv"))).limit(1);

  if (!content) { res.status(404).json({ error: "Not found" }); return; }

  const episodes = await db.select().from(episodesTable).where(eq(episodesTable.contentId, content.id))
    .orderBy(episodesTable.seasonNum, episodesTable.episodeNum);

  const seasons: Record<number, typeof episodes> = {};
  for (const ep of episodes) {
    if (!seasons[ep.seasonNum]) seasons[ep.seasonNum] = [];
    seasons[ep.seasonNum].push(ep);
  }

  res.json({ title: content.title, seasons, seasonsInfo: content.seasonsInfo, totalEpisodes: episodes.length });
});

export default router;
