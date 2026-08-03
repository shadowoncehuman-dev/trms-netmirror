# NetMirror Scraper & Crawler

A full scraper/crawler backend for net27.cc (NetMirror) that fetches all content metadata (movies, TV series, episodes), video CDN URLs, and images — storing everything in PostgreSQL for reuse and proper video playback.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Scraping: Playwright-core (headless Chromium) + Cheerio for HTML parsing
- Scheduling: node-cron (auto-updates every 6h metadata, daily 3am full)
- Source site: https://net27.cc (NetMirror)

## Where things live

- `lib/db/src/schema/content.ts` — DB schema: content, episodes, video_sources, scraper_jobs tables
- `artifacts/api-server/src/lib/scraper.ts` — core scraper/crawler logic
- `artifacts/api-server/src/routes/content.ts` — content API routes
- `artifacts/api-server/src/routes/scraper.ts` — scraper control routes

## API Endpoints

### Content
- `GET /api/content` — list all content (query: `type`, `category`, `q`, `page`, `limit`)
- `GET /api/content/categories` — list all categories
- `GET /api/content/:tmdbId/:type` — get title with video sources and episodes
- `GET /api/content/:tmdbId/:type/video?quality=480&season=1&episode=1` — get playable video URL (auto-refreshes if expired)
- `GET /api/content/:tmdbId/:type/episodes` — get all episodes grouped by season

### Scraper Control
- `POST /api/scraper/start` — start a scrape job (`{"type": "full"|"metadata"|"video"}`)
- `GET /api/scraper/status` — current job status + recent jobs
- `GET /api/scraper/jobs/:id` — specific job detail with full log
- `POST /api/scraper/stop` — stop the active scrape job

## Scraper Job Types

| Type | Description |
|------|-------------|
| `full` | Fetch metadata + video URLs for all content |
| `metadata` | Fetch/update content metadata only (fast, no video) |
| `video` | Refresh video CDN URLs only |
| `update_check` | Light check for new content |

## Video URL System

Video URLs from the CDN (`net27-r2-cache.bupcdn74213.workers.dev`) are signed and time-limited. The scraper:
1. Extracts the internal CDN content ID (`/v1/{cdnId}/s{season}/e{episode}/{quality}.mp4`)
2. Stores the full signed URL + expiry timestamp
3. Auto-refreshes via Playwright when a URL is expired on-demand

## Schedule

- Every 6 hours: metadata-only scrape (new content discovery)
- Daily at 3am: full scrape (metadata + video URL refresh)

## Architecture decisions

- Content identified by `(tmdb_id, type)` unique pair matching the site's own ID system
- Video URLs stored with expiry — refreshed on-demand when serving to avoid constant re-fetching
- Sequential scraping with 2s delay between items to be respectful of the source
- Playwright downloads its own Chromium binary — stored in `.cache/ms-playwright/`

## Product

A scraper/API backend that crawls net27.cc for:
- All movies and TV shows across 15+ category sections (Trending, Netflix, Bollywood, etc.)
- For series: all seasons and episodes
- Video CDN paths and signed playback URLs at multiple qualities (480p, 720p, 1080p)
- Poster and backdrop images (TMDB CDN URLs)

## User preferences

- Sequential fetch: one item at a time → save → next (respectful crawling)
- All content from site should be fetched and stored in database
- Video URLs must be playable and refreshable

## Gotchas

- Playwright Chromium is in `.cache/ms-playwright/` — if the repl is reset, run `npx playwright install chromium`
- Video signed URLs expire (hours to days) — always call `/video` endpoint which auto-refreshes
- The site is a JS SPA (Astro) — plain fetch only gets hero carousel; Playwright gets all category rows
- `pnpm --filter @workspace/db run push-force` if schema push fails with column conflicts
