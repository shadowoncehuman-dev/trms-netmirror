import { useState, useRef, useEffect } from 'react';
import { useParams } from 'wouter';
import { Play, Star, Film, Tv, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Nav } from '@/components/nav';
import {
  useGetContent,
  useGetContentBySubjectId,
  useGetVideoUrl,
  useGetEpisodes,
} from '@workspace/api-client-react';

function VideoPlayer({ url, poster }: { url: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden w-full">
      <video
        ref={videoRef}
        src={url}
        poster={poster}
        controls
        autoPlay
        className="w-full h-full"
        playsInline
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}

function MoviePlayer({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'tv' }) {
  const [quality, setQuality] = useState('480');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [playing, setPlaying] = useState(false);

  const { data: contentData } = useGetContent(tmdbId, type as 'movie' | 'tv');
  const { data: episodesData } = useGetEpisodes(tmdbId, 'tv', { query: { enabled: type === 'tv', queryKey: ['episodes', tmdbId] } });
  const { data: videoData, isLoading: videoLoading, refetch } = useGetVideoUrl(
    tmdbId, type as 'movie' | 'tv',
    { season, episode, quality: quality as '480' | '720' | '1080' },
    { query: { enabled: playing, queryKey: ['video', tmdbId, type, season, episode, quality] } }
  );

  const content = contentData?.content;
  const qualities = content?.qualities ?? ['480', '720'];
  const seasonNums = Object.keys(episodesData?.seasons ?? {}).map(Number).sort((a, b) => a - b);
  const episodes = episodesData?.seasons?.[season] ?? [];

  return (
    <div>
      {playing && videoData?.url ? (
        <VideoPlayer url={videoData.url} poster={content?.backdropPath ?? content?.posterPath ?? undefined} />
      ) : (
        <div className="relative aspect-video bg-black/50 rounded-xl overflow-hidden w-full flex items-center justify-center group">
          {content?.backdropPath && (
            <img src={content.backdropPath} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
          )}
          <Button
            size="lg"
            className="relative z-10 gap-2 bg-purple-600 hover:bg-purple-700 px-8"
            onClick={() => setPlaying(true)}
            disabled={videoLoading}
          >
            {videoLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
            {videoLoading ? 'Loading...' : 'Play'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {/* Quality selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Quality:</span>
          {qualities.map(q => (
            <button
              key={q}
              onClick={() => { setQuality(q); if (playing) refetch(); }}
              className={`text-xs px-2 py-0.5 rounded ${quality === q ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white'}`}
            >
              {q}p
            </button>
          ))}
        </div>

        {/* TV: season/episode */}
        {type === 'tv' && seasonNums.length > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Season:</span>
              <div className="flex gap-1">
                {seasonNums.slice(0, 8).map(s => (
                  <button
                    key={s}
                    onClick={() => { setSeason(s); setEpisode(1); setPlaying(false); }}
                    className={`text-xs px-2 py-0.5 rounded ${season === s ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white'}`}
                  >
                    S{s}
                  </button>
                ))}
              </div>
            </div>
            {episodes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">Episode:</span>
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {episodes.slice(0, 20).map(ep => (
                    <button
                      key={ep.episodeNum}
                      onClick={() => { setEpisode(ep.episodeNum); setPlaying(true); }}
                      className={`text-xs px-2 py-0.5 rounded ${episode === ep.episodeNum ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white'}`}
                    >
                      {ep.episodeNum}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {videoData?.allQualities && (
        <div className="mt-2 flex flex-wrap gap-2">
          {videoData.allQualities.map((q: { quality: string; url: string; server?: number }) => (
            <Badge key={`${q.quality}-${q.server}`} variant="outline" className="text-xs gap-1">
              {q.quality}p {q.server ? `· S${q.server}` : ''}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ContentDetail() {
  const params = useParams<{ tmdbId?: string; type?: string; subjectId?: string }>();
  const tmdbId = params.tmdbId ? parseInt(params.tmdbId, 10) : undefined;
  const type = (params.type || 'movie') as 'movie' | 'tv';
  const subjectId = params.subjectId;

  const { data: byTmdb, isLoading: l1 } = useGetContent(tmdbId!, type, {
    query: { enabled: !!tmdbId, queryKey: ['content', tmdbId, type] }
  });
  const { data: bySubject, isLoading: l2 } = useGetContentBySubjectId(subjectId!, {
    query: { enabled: !!subjectId && !tmdbId, queryKey: ['content-subject', subjectId] }
  });

  const detailData = byTmdb ?? bySubject;
  const content = detailData?.content;
  const isLoading = (tmdbId ? l1 : l2);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="max-w-4xl mx-auto px-4 pt-20">
          <Skeleton className="aspect-video rounded-xl mb-6" />
          <Skeleton className="h-8 w-64 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </main>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="max-w-4xl mx-auto px-4 pt-20 flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Film className="w-12 h-12 mb-3" />
          <p>Content not found</p>
        </main>
      </div>
    );
  }

  const resolvedTmdbId = content.tmdbId ?? tmdbId;
  const resolvedType = (content.type || type) as 'movie' | 'tv';

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-12">
        {/* Video player */}
        {resolvedTmdbId ? (
          <div className="mb-6">
            <MoviePlayer tmdbId={resolvedTmdbId} type={resolvedType} />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-xl flex items-center justify-center mb-6">
            <p className="text-muted-foreground text-sm">Video not available (no TMDB ID)</p>
          </div>
        )}

        {/* Content info */}
        <div className="flex gap-5">
          {content.posterPath && (
            <img
              src={content.posterPath}
              alt={content.title}
              className="w-28 h-40 object-cover rounded-lg flex-shrink-0 hidden sm:block shadow-lg"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{content.title}</h1>
              {content.year && <span className="text-muted-foreground">({content.year})</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {content.rating && (
                <div className="flex items-center gap-1 text-yellow-400">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-semibold">{content.rating.toFixed(1)}</span>
                </div>
              )}
              <Badge variant={content.type === 'movie' ? 'default' : 'secondary'} className="gap-1">
                {content.type === 'movie' ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                {content.type === 'movie' ? 'Movie' : 'TV Series'}
              </Badge>
              {content.genre?.split(',').slice(0, 3).map(g => (
                <Badge key={g} variant="outline" className="text-xs">{g.trim()}</Badge>
              ))}
              {content.qualities?.map(q => (
                <Badge key={q} variant="outline" className="text-xs border-green-500/40 text-green-400">{q}p</Badge>
              ))}
            </div>

            {content.overview && (
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">{content.overview}</p>
            )}

            {/* Dubs */}
            {Array.isArray(content.dubs) && content.dubs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">Audio:</span>
                {(content.dubs as { lanName: string; subjectId: string }[]).map(dub => (
                  <Badge key={dub.subjectId} variant="outline" className="text-xs">{dub.lanName}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
