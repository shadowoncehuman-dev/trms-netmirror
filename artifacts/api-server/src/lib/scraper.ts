/**
 * NetMirror scraper — fetches all content + video CDN sources
 *
 * APIs (discovered via JS bundle + APK reverse engineering):
 *
 * NATIVE (app backend at net27.cc):
 *   GET /api/native/home              → hero + top-10 rails
 *   GET /api/native/browse?page=N     → paginated all-content (23/page, hasMore)
 *   GET /api/native/search?q=...      → search results
 *   GET /api/live/tv                  → M3U8 playlist (148 live TV channels)
 *   GET /api/live/status              → channel up/down status
 *
 * CATALOG (web frontend API):
 *   GET /api/catalog/trending?window=day|week
 *   GET /api/catalog/discover?type=movie|tv&sort=...&page=N
 *
 * VIDEO:
 *   GET /api/embed-tmdb/{tmdbId}?type=movie|tv&se=N&ep=N  → signed CDN URL
 *
 * AONEROOM (content detail + play CDN):
 *   GET https://h5-api.aoneroom.com/wefeed-h5api-bff/detail?subjectId={id}
 *     → full seasons/episodes/resolutions structure (no auth needed)
 */

import { db } from "@workspace/db";
import {
  contentTable,
  episodesTable,
  videoSourcesTable,
  scraperJobsTable,
  liveTvTable,
  type InsertContent,
  type InsertEpisode,
  type InsertVideoSource,
  type InsertLiveTv,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const BASE_URL = "https://net27.cc";
const AONEROOM_API = "https://h5-api.aoneroom.com/wefeed-h5api-bff";
const REGION = "IN";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${BASE_URL}/`,
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface NativeCard {
  subjectId: string;
  type: "movie" | "tv";
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: number;
  genre?: string;
  hueDark?: string;
  detailPath?: string;
}

interface NativeBrowseResponse {
  cards: NativeCard[];
  page: number;
  hasMore: boolean;
}

interface NativeHomeResponse {
  hero: NativeCard;
  rails: Array<{ title: string; cards: NativeCard[] }>;
}

interface NativeSearchResponse {
  q: string;
  results: NativeCard[];
}

interface AoneroomSeason {
  se: number;
  maxEp: number;
  allEp: string;
  resolutions: Array<{ resolution: number; epNum: number }>;
}

interface AoneroomDub {
  subjectId: string;
  lanName: string;
  lanCode: string;
  original: boolean;
  type: number;
  detailPath: string;
}

interface AoneroomDetail {
  code: number;
  message: string;
  data: {
    subject: {
      subjectId: string;
      subjectType: number; // 1=movie, 2=tv
      title: string;
      description: string;
      releaseDate: string;
      genre: string;
      cover: { url: string; blurHash?: string; avgHueDark?: string };
      countryName: string;
      imdbRatingValue?: string;
      subtitles: string;
      hasResource: boolean;
      dubs: AoneroomDub[];
      detailPath: string;
    };
    stars: unknown[];
    resource: {
      seasons: AoneroomSeason[];
      source: string;
      uploadBy: string;
    };
  };
}

interface EmbedResponse {
  ok?: boolean;
  tmdbId?: number;
  title?: string;
  year?: string;
  imdb?: string;
  type?: string;
  poster?: string;
  currentSeason?: number;
  currentEpisode?: number;
  exp?: number;
  sig?: string;
  mp4?: string;
  resolution?: string;
  streams?: Array<{ url: string; resolution: number; size?: number }>;
  direct?: boolean;
  cdn?: string;
  subjectId?: string;
  captions?: Array<{ lang: string; name: string; url: string }>;
  fallbackHls?: string;
  error?: string;
}

interface LiveStatusResponse {
  generatedAt: number;
  total: number;
  up: number;
  down: number;
  channels: Record<string, number>; // 1=up, 0=down
}

// ─── Scraper State ────────────────────────────────────────────────────────────

let activeJobId: number | null = null;
let abortController: AbortController | null = null;

export function getActiveJobId(): number | null { return activeJobId; }
export function stopScraper(): void { abortController?.abort(); }

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Native API ───────────────────────────────────────────────────────────────

async function fetchNativeHome(signal?: AbortSignal): Promise<NativeHomeResponse | null> {
  return apiGet<NativeHomeResponse>(`${BASE_URL}/api/native/home`, signal);
}

async function* browseAll(signal?: AbortSignal): AsyncGenerator<NativeCard> {
  let page = 1;
  while (true) {
    if (signal?.aborted) return;
    const resp = await apiGet<NativeBrowseResponse>(
      `${BASE_URL}/api/native/browse?page=${page}`,
      signal,
    );
    if (!resp || !resp.cards?.length) break;
    for (const card of resp.cards) yield card;
    if (!resp.hasMore) break;
    page++;
    await delay(300);
  }
}

export async function searchNative(q: string): Promise<NativeCard[]> {
  const resp = await apiGet<NativeSearchResponse>(
    `${BASE_URL}/api/native/search?q=${encodeURIComponent(q)}`,
  );
  return resp?.results ?? [];
}

// ─── Catalog API (for TMDB-ID-indexed content) ───────────────────────────────

interface CatalogItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  rating?: number;
  overview?: string;
}

interface CatalogResponse {
  ok: boolean;
  page: number;
  totalPages: number;
  items: CatalogItem[];
}

const CATALOG_ENDPOINTS = [
  { category: "Top 10 Today", url: `/api/catalog/trending?window=day`, maxPages: 2 },
  { category: "Trending", url: `/api/catalog/trending?window=week`, maxPages: 5 },
  { category: "Latest Release", url: `/api/catalog/discover?type=movie&sort=release&year_from=2024&region=${REGION}`, maxPages: 30 },
  { category: "Latest Release", url: `/api/catalog/discover?type=tv&sort=release&year_from=2024&region=${REGION}`, maxPages: 20 },
  { category: "Netflix", url: `/api/catalog/discover?platform=Netflix&type=movie&region=${REGION}`, maxPages: 20 },
  { category: "Netflix", url: `/api/catalog/discover?platform=Netflix&type=tv&region=${REGION}`, maxPages: 20 },
  { category: "Prime Video", url: `/api/catalog/discover?platform=PrimeVideo&type=movie&region=${REGION}`, maxPages: 20 },
  { category: "JioHotstar", url: `/api/catalog/discover?platform=JioHotstar&type=movie&region=${REGION}`, maxPages: 20 },
  { category: "JioHotstar", url: `/api/catalog/discover?platform=JioHotstar&type=tv&region=${REGION}`, maxPages: 20 },
  { category: "Crunchyroll", url: `/api/catalog/discover?platform=Crunchyroll&type=tv`, maxPages: 20 },
  { category: "Action Movies", url: `/api/catalog/discover?type=movie&genre=28&region=${REGION}`, maxPages: 20 },
  { category: "Bollywood", url: `/api/catalog/discover?type=movie&country=IN&sort=popularity&region=${REGION}`, maxPages: 50 },
  { category: "Hollywood", url: `/api/catalog/discover?type=movie&country=US&sort=popularity&region=${REGION}`, maxPages: 30 },
  { category: "Drama Series", url: `/api/catalog/discover?type=tv&genre=18&sort=rating&region=${REGION}`, maxPages: 20 },
  { category: "Kids", url: `/api/catalog/discover?type=movie&genre=10751&sort=popularity`, maxPages: 10 },
];

async function* crawlCatalog(signal?: AbortSignal): AsyncGenerator<{ item: CatalogItem; category: string }> {
  for (const ep of CATALOG_ENDPOINTS) {
    if (signal?.aborted) return;
    let page = 1;
    while (page <= ep.maxPages) {
      if (signal?.aborted) return;
      const sep = ep.url.includes("?") ? "&" : "?";
      const resp = await apiGet<CatalogResponse>(`${BASE_URL}${ep.url}${sep}page=${page}`, signal);
      if (!resp?.ok || !resp.items?.length) break;
      for (const item of resp.items) yield { item, category: ep.category };
      if (page >= resp.totalPages) break;
      page++;
      await delay(300);
    }
  }
}

// ─── AoneRoom Detail API ──────────────────────────────────────────────────────

async function fetchAoneroomDetail(subjectId: string): Promise<AoneroomDetail | null> {
  try {
    const res = await fetch(`${AONEROOM_API}/detail?subjectId=${subjectId}`, {
      headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as AoneroomDetail;
    if (data.code !== 0) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Video Embed API ─────────────────────────────────────────────────────────

async function fetchEmbed(
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
  signal?: AbortSignal,
): Promise<EmbedResponse | null> {
  return apiGet<EmbedResponse>(
    `${BASE_URL}/api/embed-tmdb/${tmdbId}?type=${type}&se=${season}&ep=${episode}`,
    signal,
  );
}

// ─── Live TV ─────────────────────────────────────────────────────────────────

async function scrapeLiveTV(): Promise<number> {
  // 1) Fetch M3U8 playlist
  const m3uRes = await fetch(`${BASE_URL}/api/live/tv`, { headers: HEADERS });
  if (!m3uRes.ok) return 0;
  const m3u = await m3uRes.text();

  // 2) Fetch status
  const status = await apiGet<LiveStatusResponse>(`${BASE_URL}/api/live/status`);
  const channelStatus = status?.channels ?? {};

  // 3) Parse M3U8
  const lines = m3u.split("\n").map((l) => l.trim()).filter(Boolean);
  const channels: InsertLiveTv[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("#EXTINF")) { i++; continue; }

    const extinf = lines[i];
    const licType = lines[i + 1]?.startsWith("#KODIPROP:inputstream.adaptive.license_type=")
      ? lines[i + 1].split("=").slice(1).join("=") : undefined;
    const licKey = lines[i + 2]?.startsWith("#KODIPROP:inputstream.adaptive.license_key=")
      ? lines[i + 2].split("=").slice(1).join("=") : undefined;
    const urlOffset = licType ? 3 : 1;
    const streamUrl = lines[i + urlOffset];

    if (!streamUrl || streamUrl.startsWith("#")) { i++; continue; }

    // Parse EXTINF attributes
    const tvgId = extinf.match(/tvg-id="([^"]+)"/)?.[1] ?? "";
    const tvgLogo = extinf.match(/tvg-logo="([^"]*)"/)?.[1] ?? "";
    const group = extinf.match(/group-title="([^"]+)"/)?.[1] ?? "";
    const nameMatch = extinf.match(/,(.+)$/);
    const name = nameMatch?.[1]?.trim() ?? tvgId;

    if (tvgId && streamUrl.startsWith("http")) {
      channels.push({
        channelId: tvgId,
        name,
        group: group || undefined,
        logo: tvgLogo || undefined,
        streamUrl,
        licenseType: licType || undefined,
        licenseKey: licKey || undefined,
        isUp: channelStatus[tvgId] === 1,
        lastCheckedAt: new Date(),
      });
    }

    i += urlOffset + 1;
  }

  // 4) Upsert all channels
  for (const ch of channels) {
    await db
      .insert(liveTvTable)
      .values(ch)
      .onConflictDoUpdate({
        target: liveTvTable.channelId,
        set: {
          name: ch.name,
          group: ch.group,
          logo: ch.logo,
          streamUrl: ch.streamUrl,
          licenseType: ch.licenseType,
          licenseKey: ch.licenseKey,
          isUp: ch.isUp,
          lastCheckedAt: new Date(),
        },
      });
  }

  return channels.length;
}

// ─── DB Operations ────────────────────────────────────────────────────────────

async function upsertNativeCard(
  card: NativeCard,
  categories: string[],
  detail?: AoneroomDetail | null,
): Promise<number> {
  const subject = detail?.data.subject;
  const resource = detail?.data.resource;

  const existing = await db
    .select({ id: contentTable.id, categories: contentTable.categories })
    .from(contentTable)
    .where(eq(contentTable.subjectId, card.subjectId))
    .limit(1);

  const merged = [...new Set([...(existing[0]?.categories ?? []), ...categories])];
  const dubs = subject?.dubs?.length ? subject.dubs : undefined;
  const seasonsInfo = resource?.seasons?.length ? resource.seasons : undefined;
  const qualities = resource?.seasons?.flatMap(
    (s) => s.resolutions.map((r) => String(r.resolution)),
  );
  const uniqQualities = qualities ? [...new Set(qualities)] : undefined;

  if (existing.length > 0) {
    await db.update(contentTable).set({
      title: card.title,
      year: card.year,
      rating: card.rating ?? subject?.imdbRatingValue ? parseFloat(subject!.imdbRatingValue!) : undefined,
      overview: subject?.description,
      posterPath: card.poster ?? subject?.cover.url,
      genre: card.genre ?? subject?.genre,
      hueDark: card.hueDark ?? subject?.cover.avgHueDark,
      detailPath: card.detailPath,
      imdbId: undefined,
      dubs,
      seasonsInfo,
      qualities: uniqQualities,
      audioTracks: dubs?.map((d) => `${d.lanCode || "orig"}:${d.lanName}`) ?? undefined,
      categories: merged,
      lastScrapedAt: new Date(),
    }).where(eq(contentTable.id, existing[0].id));
    return existing[0].id;
  }

  const [ins] = await db.insert(contentTable).values({
    subjectId: card.subjectId,
    type: card.type,
    title: card.title,
    year: card.year,
    rating: card.rating,
    overview: subject?.description,
    posterPath: card.poster ?? subject?.cover.url,
    genre: card.genre ?? subject?.genre,
    hueDark: card.hueDark ?? subject?.cover.avgHueDark,
    detailPath: card.detailPath,
    dubs,
    seasonsInfo,
    qualities: uniqQualities,
    audioTracks: dubs?.map((d) => `${d.lanCode || "orig"}:${d.lanName}`) ?? undefined,
    categories: merged,
    lastScrapedAt: new Date(),
    scrapedOk: false,
  } as InsertContent).returning({ id: contentTable.id });

  return ins.id;
}

async function upsertCatalogItem(
  item: CatalogItem,
  category: string,
): Promise<number | null> {
  // Catalog items identified by tmdbId+type
  // First check if we already have this item by tmdbId
  const existing = await db
    .select({ id: contentTable.id, categories: contentTable.categories, subjectId: contentTable.subjectId })
    .from(contentTable)
    .where(and(
      sql`${contentTable.tmdbId} = ${item.tmdbId}`,
      eq(contentTable.type, item.type),
    ))
    .limit(1);

  const merged = [...new Set([...(existing[0]?.categories ?? []), category])];

  if (existing.length > 0) {
    await db.update(contentTable).set({
      title: item.title,
      year: item.year,
      rating: item.rating,
      overview: item.overview,
      posterPath: item.poster,
      backdropPath: item.backdrop,
      categories: merged,
      lastScrapedAt: new Date(),
    }).where(eq(contentTable.id, existing[0].id));
    return existing[0].id;
  }

  // Only insert if we have a tmdbId (catalog API always provides one)
  if (!item.tmdbId) return null;

  try {
    const [ins] = await db.insert(contentTable).values({
      tmdbId: item.tmdbId,
      type: item.type,
      title: item.title,
      year: item.year,
      rating: item.rating,
      overview: item.overview,
      posterPath: item.poster,
      backdropPath: item.backdrop,
      categories: merged,
      lastScrapedAt: new Date(),
      scrapedOk: false,
    } as InsertContent).returning({ id: contentTable.id });
    return ins.id;
  } catch {
    return null; // ignore duplicates
  }
}

async function saveEpisodes(
  contentId: number,
  seasons: AoneroomSeason[],
): Promise<void> {
  for (const season of seasons) {
    const maxEp = season.maxEp || season.resolutions[0]?.epNum || 1;
    const qualities = season.resolutions.map((r) => String(r.resolution));

    for (let ep = 1; ep <= maxEp; ep++) {
      await db.insert(episodesTable).values({
        contentId,
        seasonNum: season.se,
        episodeNum: ep,
        qualities,
      } as InsertEpisode).onConflictDoUpdate({
        target: [episodesTable.contentId, episodesTable.seasonNum, episodesTable.episodeNum],
        set: { qualities },
      });
    }
  }
}

async function saveVideoSources(
  contentId: number,
  embed: EmbedResponse,
  episodeId?: number,
): Promise<void> {
  const streams = embed.streams ?? [];
  if (!streams.length && embed.mp4) {
    streams.push({ url: embed.mp4, resolution: parseInt(embed.resolution ?? "480", 10) });
  }

  for (const stream of streams) {
    const expiresAt = embed.exp ? new Date(embed.exp * 1000) : undefined;
    await db.insert(videoSourcesTable).values({
      contentId,
      episodeId,
      server: stream.url.includes("bupcdn") ? 1 : 2,
      quality: String(stream.resolution),
      url: stream.url,
      expiresAt,
    } as InsertVideoSource).onConflictDoNothing();
  }
}

// ─── Job Logging ──────────────────────────────────────────────────────────────

async function appendJobLog(jobId: number, msg: string): Promise<void> {
  const entry = JSON.stringify([{ ts: new Date().toISOString(), msg }]);
  try {
    await db.execute(
      sql`UPDATE scraper_jobs SET log = COALESCE(log,'[]'::jsonb) || ${entry}::jsonb, updated_at = now() WHERE id = ${jobId}`,
    );
  } catch { /* non-fatal */ }
}

async function updateProgress(
  jobId: number,
  processed: number,
  failed: number,
  total: number,
  current?: string,
): Promise<void> {
  await db.update(scraperJobsTable).set({
    processedItems: processed, failedItems: failed,
    totalItems: total, currentItem: current,
  }).where(eq(scraperJobsTable.id, jobId));
}

// ─── Job Runner ───────────────────────────────────────────────────────────────

export type JobType = "full" | "metadata" | "video" | "update_check" | "live_tv";

export async function runScraperJob(jobType: JobType = "full"): Promise<number> {
  if (activeJobId !== null) throw new Error("A scraper job is already running");

  abortController = new AbortController();
  const { signal } = abortController;

  const [job] = await db.insert(scraperJobsTable)
    .values({ status: "running", jobType, startedAt: new Date() })
    .returning({ id: scraperJobsTable.id });

  activeJobId = job.id;
  setImmediate(() => _runJob(job.id, jobType, signal));
  return job.id;
}

async function _runJob(jobId: number, jobType: JobType, signal: AbortSignal): Promise<void> {
  let processed = 0, failed = 0;

  try {
    await appendJobLog(jobId, `Starting ${jobType} job`);

    // ── Live TV only ────────────────────────────────────────────────────────
    if (jobType === "live_tv") {
      await appendJobLog(jobId, "Scraping live TV channels...");
      const count = await scrapeLiveTV();
      await appendJobLog(jobId, `Saved ${count} live TV channels`);
      processed = count;
      await db.update(scraperJobsTable).set({
        status: "done", processedItems: count, completedAt: new Date(),
      }).where(eq(scraperJobsTable.id, jobId));
      return;
    }

    // ── Phase 1: Collect all content via native browse API ──────────────────
    await appendJobLog(jobId, "Phase 1: Crawling native browse API...");
    const allCards = new Map<string, { card: NativeCard; categories: string[] }>();

    // Home page (hero + rails)
    const home = await fetchNativeHome(signal);
    if (home) {
      const homeCard = home.hero;
      allCards.set(homeCard.subjectId, { card: homeCard, categories: ["Featured"] });
      for (const rail of home.rails) {
        for (const card of rail.cards) {
          const existing = allCards.get(card.subjectId);
          if (existing) { existing.categories.push(rail.title); }
          else allCards.set(card.subjectId, { card, categories: [rail.title] });
        }
      }
    }

    // Full browse
    let browseCount = 0;
    for await (const card of browseAll(signal)) {
      const existing = allCards.get(card.subjectId);
      if (existing) { /* keep existing */ }
      else allCards.set(card.subjectId, { card, categories: ["Browse"] });
      browseCount++;
    }
    await appendJobLog(jobId, `Found ${allCards.size} titles from native API (${browseCount} from browse)`);

    // ── Phase 2: Enrich with catalog API (adds tmdbId + overview + backdrop) ─
    if (jobType !== "video") {
      await appendJobLog(jobId, "Phase 2: Enriching with catalog API...");
      let catalogCount = 0;
      for await (const { item, category } of crawlCatalog(signal)) {
        if (signal.aborted) break;
        await upsertCatalogItem(item, category);
        catalogCount++;
      }
      await appendJobLog(jobId, `Catalog enrichment: ${catalogCount} items processed`);
    }

    // ── Phase 3: Save native content + AoneRoom details ─────────────────────
    const total = allCards.size;
    await updateProgress(jobId, 0, 0, total);
    await appendJobLog(jobId, `Phase 3: Saving ${total} titles + episode info...`);

    for (const [, { card, categories }] of allCards) {
      if (signal.aborted) break;
      const label = `${card.title} (${card.type})`;
      await updateProgress(jobId, processed, failed, total, label);

      try {
        // Fetch AoneRoom detail for full season/episode/resolution info
        let detail: AoneroomDetail | null = null;
        if (jobType !== "video") {
          detail = await fetchAoneroomDetail(card.subjectId);
          await delay(200);
        }

        const contentId = await upsertNativeCard(card, categories, detail);

        // Save episode stubs from seasons info
        if (detail?.data.resource.seasons?.length && card.type === "tv") {
          await saveEpisodes(contentId, detail.data.resource.seasons);
        }

        processed++;
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        failed++;
        logger.error({ err, subjectId: card.subjectId }, "Error processing native card");
      }
    }

    // ── Phase 4: Fetch video URLs (full job only) ────────────────────────────
    if ((jobType === "full" || jobType === "video") && !signal.aborted) {
      await appendJobLog(jobId, "Phase 4: Fetching video URLs (tmdbId-based content)...");

      // Only fetch video for content that has a tmdbId (needed for embed API)
      const withTmdb = await db.select({
        id: contentTable.id,
        tmdbId: contentTable.tmdbId,
        type: contentTable.type,
      }).from(contentTable)
        .where(sql`${contentTable.tmdbId} IS NOT NULL AND ${contentTable.scrapedOk} = false`)
        .limit(500);

      let videoCount = 0;
      for (const row of withTmdb) {
        if (signal.aborted) break;
        const embed = await fetchEmbed(row.tmdbId!, row.type as "movie" | "tv", 1, 1, signal);
        if (embed?.subjectId) {
          // Link subjectId back to the content record
          await db.update(contentTable).set({
            subjectId: embed.subjectId,
            imdbId: embed.imdb,
            videoLastFetchedAt: new Date(),
            scrapedOk: true,
          }).where(eq(contentTable.id, row.id));
          await saveVideoSources(row.id, embed);
          videoCount++;
        }
        await delay(400);
      }
      await appendJobLog(jobId, `Fetched video URLs for ${videoCount} titles`);
    }

    const finalStatus = signal.aborted ? "failed" : "done";
    await db.update(scraperJobsTable).set({
      status: finalStatus, processedItems: processed,
      failedItems: failed, completedAt: new Date(),
    }).where(eq(scraperJobsTable.id, jobId));
    await appendJobLog(jobId, `Job ${finalStatus}. Processed: ${processed}, Failed: ${failed}`);

  } catch (err) {
    logger.error({ err }, "Scraper job crashed");
    await db.update(scraperJobsTable).set({
      status: "failed", processedItems: processed,
      failedItems: failed, completedAt: new Date(),
    }).where(eq(scraperJobsTable.id, jobId));
    try { await appendJobLog(jobId, `Crashed: ${(err as Error).message}`); } catch { /* */ }
  } finally {
    activeJobId = null;
    abortController = null;
  }
}

// ─── On-demand refresh ────────────────────────────────────────────────────────

export async function refreshVideoUrls(
  contentId: number,
  tmdbId: number,
  type: "movie" | "tv",
  season = 1,
  episode = 1,
): Promise<EmbedResponse | null> {
  const embed = await fetchEmbed(tmdbId, type, season, episode);
  if (embed?.subjectId) {
    await db.update(contentTable).set({
      subjectId: embed.subjectId,
      videoLastFetchedAt: new Date(),
      scrapedOk: true,
    }).where(eq(contentTable.id, contentId));
    await saveVideoSources(contentId, embed);
  }
  return embed;
}

export { fetchNativeHome, browseAll, fetchAoneroomDetail, fetchEmbed, scrapeLiveTV };
