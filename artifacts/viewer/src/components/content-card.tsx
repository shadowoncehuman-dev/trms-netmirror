import { Link } from 'wouter';
import { Star, Tv, Film } from 'lucide-react';
import type { ContentItem } from '@workspace/api-client-react';

interface ContentCardProps {
  item: ContentItem;
  rank?: number;
}

export function ContentCard({ item, rank }: ContentCardProps) {
  const href = item.tmdbId
    ? `/content/${item.tmdbId}/${item.type}`
    : `/content/subject/${item.subjectId}`;

  return (
    <Link href={href}>
      <div className="group relative cursor-pointer rounded-lg overflow-hidden bg-card hover:scale-105 transition-transform duration-200">
        {rank && (
          <div className="absolute top-2 left-2 z-10 bg-purple-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow">
            {rank}
          </div>
        )}
        <div className="aspect-[2/3] relative overflow-hidden bg-muted">
          {item.posterPath ? (
            <img
              src={item.posterPath}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              {item.type === 'movie' ? <Film className="w-8 h-8" /> : <Tv className="w-8 h-8" />}
              <span className="text-xs text-center px-2">{item.title}</span>
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
            <p className="text-white text-xs font-medium truncate">{item.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {item.rating && (
                <span className="flex items-center gap-0.5 text-yellow-400 text-xs">
                  <Star className="w-3 h-3 fill-current" />
                  {item.rating.toFixed(1)}
                </span>
              )}
              <span className="text-white/60 text-xs">{item.year}</span>
            </div>
          </div>
        </div>
        <div className="p-2">
          <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            {item.type === 'movie' ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
            {item.year}
          </p>
        </div>
      </div>
    </Link>
  );
}
