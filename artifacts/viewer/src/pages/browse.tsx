import { useState } from 'react';
import { Film, Tv, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContentCard } from '@/components/content-card';
import { Nav } from '@/components/nav';
import { useListContent, useListCategories } from '@workspace/api-client-react';

export default function Browse() {
  const [type, setType] = useState<'movie' | 'tv' | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const limit = 24;

  const { data, isLoading } = useListContent({ type, category, page, limit });
  const { data: catData } = useListCategories();

  const total = data?.pagination?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 pt-20 pb-12">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Browse</h1>
            {!isLoading && <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} titles</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Type filter */}
            <div className="flex gap-1.5">
              {[
                { label: 'All', value: undefined },
                { label: 'Movies', value: 'movie' as const, icon: Film },
                { label: 'TV', value: 'tv' as const, icon: Tv },
              ].map(({ label, value, icon: Icon }) => (
                <Button
                  key={label}
                  variant={type === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setType(value); setPage(1); }}
                  className="gap-1.5"
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}{label}
                </Button>
              ))}
            </div>
            {/* Category filter */}
            <Select value={category || '_all'} onValueChange={v => { setCategory(v === '_all' ? undefined : v); setPage(1); }}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All categories</SelectItem>
                {catData?.categories?.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active filters */}
        {(type || category) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {type && <Badge variant="secondary" className="gap-1">{type === 'movie' ? 'Movies' : 'TV Series'} <button onClick={() => { setType(undefined); setPage(1); }} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button></Badge>}
            {category && <Badge variant="secondary" className="gap-1">{category} <button onClick={() => { setCategory(undefined); setPage(1); }} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button></Badge>}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="aspect-[2/3] rounded-lg" />)}
          </div>
        ) : data?.data?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Film className="w-12 h-12 mb-3" />
            <p>No content found</p>
            <p className="text-sm mt-1">Try running the scraper to fetch content</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {data?.data?.map(item => <ContentCard key={item.id} item={item} />)}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
