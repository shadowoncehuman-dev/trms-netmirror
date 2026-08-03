import {
  pgTable,
  text,
  serial,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Content (Movies & TV Shows) ───────────────────────────────────────────

export const contentTable = pgTable(
  "content",
  {
    id: serial("id").primaryKey(),
    // TMDB ID (nullable — native-API-only content may not have one)
    tmdbId: integer("tmdb_id"),
    // AoneRoom/CDN internal subject ID — primary CDN identifier
    subjectId: text("subject_id"),
    type: text("type").notNull(), // "movie" | "tv"
    title: text("title").notNull(),
    year: text("year"),
    overview: text("overview"),
    rating: real("rating"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    // Genre string (e.g. "Action,Adventure,Fantasy")
    genre: text("genre"),
    // Dominant color accent for dark UIs (e.g. "#665053")
    hueDark: text("hue_dark"),
    // Detail page URL slug (e.g. "spider-man-no-way-home-hindi-y5aSbvTqUe4")
    detailPath: text("detail_path"),
    // IMDB ID (e.g. "tt10872600")
    imdbId: text("imdb_id"),
    // Available quality options (e.g. ["480", "720", "1080"])
    qualities: text("qualities").array(),
    // Audio/language tracks available
    audioTracks: text("audio_tracks").array(),
    // Platform/category tags
    categories: text("categories").array(),
    // Available dubs — JSONB array of {subjectId, lanName, lanCode, detailPath}
    dubs: jsonb("dubs"),
    // Season/episode availability from AoneRoom detail API
    // [{se: 1, maxEp: 13, resolutions: [{resolution: 480, epNum: 13}]}]
    seasonsInfo: jsonb("seasons_info"),
    // Scrape metadata
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    videoLastFetchedAt: timestamp("video_last_fetched_at", { withTimezone: true }),
    scrapedOk: boolean("scraped_ok").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    // Primary deduplicate: subjectId is unique per content item
    unique("content_subject_id_unique").on(t.subjectId),
    // Secondary: tmdb deduplicate (when tmdbId is present)
    index("content_tmdb_type_idx").on(t.tmdbId, t.type),
    index("content_type_idx").on(t.type),
    index("content_categories_idx").on(t.categories),
    index("content_subject_idx").on(t.subjectId),
  ],
);

export const insertContentSchema = createInsertSchema(contentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contentTable.$inferSelect;

// ─── Episodes (for TV series) ────────────────────────────────────────────────

export const episodesTable = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    contentId: integer("content_id")
      .notNull()
      .references(() => contentTable.id, { onDelete: "cascade" }),
    seasonNum: integer("season_num").notNull(),
    episodeNum: integer("episode_num").notNull(),
    // Episode-specific CDN content ID (if different from content's)
    cdnContentId: text("cdn_content_id"),
    qualities: text("qualities").array(),
    audioTracks: text("audio_tracks").array(),
    lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
    videoLastFetchedAt: timestamp("video_last_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("episodes_unique").on(t.contentId, t.seasonNum, t.episodeNum),
    index("episodes_content_idx").on(t.contentId),
  ],
);

export const insertEpisodeSchema = createInsertSchema(episodesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodesTable.$inferSelect;

// ─── Video Sources (signed CDN URLs) ─────────────────────────────────────────

export const videoSourcesTable = pgTable(
  "video_sources",
  {
    id: serial("id").primaryKey(),
    contentId: integer("content_id")
      .notNull()
      .references(() => contentTable.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodesTable.id, {
      onDelete: "cascade",
    }),
    server: integer("server").notNull().default(1), // 1=primary CDN, 2=fallback CDN
    quality: text("quality").notNull(), // "480", "720", "1080"
    // Full signed URL
    url: text("url").notNull(),
    // Expiry timestamp (from ?exp= param, unix seconds)
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("video_sources_content_idx").on(t.contentId),
    index("video_sources_episode_idx").on(t.episodeId),
  ],
);

export const insertVideoSourceSchema = createInsertSchema(videoSourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVideoSource = z.infer<typeof insertVideoSourceSchema>;
export type VideoSource = typeof videoSourcesTable.$inferSelect;

// ─── Live TV Channels ─────────────────────────────────────────────────────────

export const liveTvTable = pgTable(
  "live_tv",
  {
    id: serial("id").primaryKey(),
    channelId: text("channel_id").notNull().unique(),
    name: text("name").notNull(),
    group: text("group"),
    logo: text("logo"),
    streamUrl: text("stream_url").notNull(),
    licenseType: text("license_type"),
    licenseKey: text("license_key"),
    isUp: boolean("is_up").default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export const insertLiveTvSchema = createInsertSchema(liveTvTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLiveTv = z.infer<typeof insertLiveTvSchema>;
export type LiveTv = typeof liveTvTable.$inferSelect;

// ─── Scraper Jobs ─────────────────────────────────────────────────────────────

export const scraperJobsTable = pgTable("scraper_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  jobType: text("job_type").notNull().default("full"), // full | metadata | video | update_check | live_tv
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  failedItems: integer("failed_items").default(0),
  currentItem: text("current_item"),
  log: jsonb("log").default([]),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScraperJobSchema = createInsertSchema(scraperJobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScraperJob = z.infer<typeof insertScraperJobSchema>;
export type ScraperJob = typeof scraperJobsTable.$inferSelect;
