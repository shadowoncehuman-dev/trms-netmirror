import { Link } from 'wouter';
import { Play, Info, Star, TrendingUp, Tv, Film, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ContentCard } from '@/components/content-card';
import { Nav } from '@/components/nav';
import { useListContent } from '@workspace/api-client-react';

function ContentRow({ title, type, category, icon }: { title: string; type?: 'movie' | 'tv'; category?: string; icon?: React.ReactNode }) {
  const { data, isLoading } = useListContent({ type, category, limit: 20 });

  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">{icon}{title}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!data?.data?.length) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">{icon}{title}</h2>
        <Link href={`/browse${type ? `?type=${type}` : ''}${category ? `?category=${encodeURIComponent(category)}` : ''}`}>
          <span className="text-sm text-muted-foreground hover:text-white flex items-center gap-0.5 cursor-pointer">View all <ChevronRight className="w-4 h-4" /></span>
        </Link>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {data.data.slice(0, 8).map(item => (
          <ContentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function Top10Row() {
  const { data, isLoading } = useListContent({ category: 'Top 10 Today', limit: 10 });

  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-red-400" />Top 10 Today</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-lg" />)}
        </div>
      </section>
    );
  }

  if (!data?.data?.length) return null;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-red-400" />Top 10 Today
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-3">
        {data.data.slice(0, 10).map((item, i) => (
          <ContentCard key={item.id} item={item} rank={i + 1} />
        ))}
      </div>
    </section>
  );
}

function HeroBanner() {
  const { data } = useListContent({ category: 'Trending', limit: 1 });
  const hero = data?.data?.[0];

  if (!hero) {
    return (
      <div className="relative h-[50vh] min-h-72 bg-gradient-to-b from-purple-900/30 to-background flex items-end pb-10 px-6 mb-8">
        <div className="max-w-lg">
          <Skeleton className="h-8 w-48 mb-3" />
          <Skeleton className="h-4 w-80 mb-2" />
          <Skeleton className="h-4 w-64 mb-4" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>
    );
  }

  const href = hero.tmdbId ? `/content/${hero.tmdbId}/${hero.type}` : `/content/subject/${hero.subjectId}`;

  return (
    <div className="relative h-[55vh] min-h-80 mb-8 overflow-hidden -mx-4 md:mx-0 md:rounded-xl">
      {hero.backdropPath && (
        <>
          <img src={hero.backdropPath} alt={hero.title} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </>
      )}
      <div className="relative h-full flex flex-col justify-end p-6 md:p-10 max-w-lg">
        <div className="flex items-center gap-2 mb-2">
          {hero.genre?.split(',').slice(0, 2).map(g => (
            <Badge key={g} variant="secondary" className="text-xs">{g.trim()}</Badge>
          ))}
          <Badge variant="outline" className="text-xs border-purple-500 text-purple-300">
            {hero.type === 'movie' ? 'Movie' : 'TV Series'}
          </Badge>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight">{hero.title}</h1>
        {hero.rating && (
          <div className="flex items-center gap-1.5 mb-3">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span className="text-yellow-400 font-semibold">{hero.rating.toFixed(1)}</span>
            <span className="text-white/50 text-sm">· {hero.year}</span>
          </div>
        )}
        {hero.overview && (
          <p className="text-white/70 text-sm leading-relaxed mb-4 line-clamp-2">{hero.overview}</p>
        )}
        <div className="flex gap-3">
          <Link href={href}>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
              <Play className="w-4 h-4 fill-current" />Watch Now
            </Button>
          </Link>
          <Link href={href}>
            <Button variant="outline" className="border-white/30 text-white gap-2">
              <Info className="w-4 h-4" />More Info
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 pt-16">
        <HeroBanner />
        <Top10Row />
        <ContentRow title="Trending" category="Trending" icon={<TrendingUp className="w-5 h-5 text-orange-400" />} />
        <ContentRow title="Latest Movies" type="movie" category="Latest Release" icon={<Film className="w-5 h-5 text-blue-400" />} />
        <ContentRow title="Latest TV Series" type="tv" category="Latest Release" icon={<Tv className="w-5 h-5 text-green-400" />} />
        <ContentRow title="Netflix" category="Netflix" icon={<span className="text-red-500 font-bold text-sm">N</span>} />
        <ContentRow title="Prime Video" category="Prime Video" icon={<span className="text-blue-400 font-bold text-sm">P</span>} />
        <ContentRow title="JioHotstar" category="JioHotstar" icon={<span className="text-pink-400 font-bold text-sm">H</span>} />
        <ContentRow title="Bollywood" category="Bollywood" icon={<Film className="w-5 h-5 text-yellow-400" />} />
        <ContentRow title="Hollywood" category="Hollywood" icon={<Film className="w-5 h-5 text-purple-400" />} />
        <ContentRow title="Kids" category="Kids" icon={<span className="text-green-300">🎈</span>} />
        <ContentRow title="Action" category="Action Movies" icon={<span className="text-red-400">⚡</span>} />
        <ContentRow title="Crunchyroll" category="Crunchyroll" icon={<span className="text-orange-400 font-bold text-sm">C</span>} />
      </main>
    </div>
  );
}
