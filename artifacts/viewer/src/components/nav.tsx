import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Search, Tv, Film, Radio, Settings, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchContent } from '@workspace/api-client-react';

export function Nav() {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: searchResults } = useSearchContent(
    { q: searchQuery },
    { query: { enabled: searchQuery.length >= 2, queryKey: ['search', searchQuery] } }
  );

  const navLinks = [
    { href: '/', label: 'Home', icon: Film },
    { href: '/browse', label: 'Browse', icon: Tv },
    { href: '/live', label: 'Live TV', icon: Radio },
    { href: '/admin/scraper', label: 'Scraper', icon: Settings },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220_14%_8%/0.95)] backdrop-blur-sm border-b border-[hsl(var(--border))]">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-4">
        <Link href="/">
          <span className="text-xl font-bold text-purple-400 cursor-pointer whitespace-nowrap">NetMirror</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href}>
              <span className={`px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                location === href ? 'text-white bg-white/10' : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}>{label}</span>
            </Link>
          ))}
        </div>

        <div className="flex-1 md:flex-none" />

        {/* Search */}
        <div className="relative flex items-center gap-2">
          {showSearch ? (
            <div className="relative">
              <Input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search movies, shows..."
                className="w-56 h-8 bg-white/10 border-white/20 text-sm pr-8"
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Search dropdown */}
              {searchResults && searchQuery.length >= 2 && (
                <div className="absolute top-full mt-1 right-0 w-72 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto">
                  {searchResults.local.length === 0 && searchResults.remote.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-3 py-3">No results found</p>
                  ) : (
                    <>
                      {searchResults.local.slice(0, 5).map(item => (
                        <Link key={item.id} href={`/content/${item.tmdbId}/${item.type}`}>
                          <div className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer" onClick={() => { setSearchQuery(''); setShowSearch(false); }}>
                            {item.posterPath && (
                              <img src={item.posterPath} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{item.year} · {item.type === 'movie' ? 'Movie' : 'TV Series'}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {searchResults.remote.slice(0, 3).map(item => (
                        <Link key={item.subjectId} href={`/content/subject/${item.subjectId}`}>
                          <div className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer border-t border-border/50" onClick={() => { setSearchQuery(''); setShowSearch(false); }}>
                            {item.poster && (
                              <img src={item.poster} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{item.year} · Live</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSearch(true)}>
              <Search className="w-4 h-4" />
            </Button>
          )}

          {/* Mobile menu */}
          <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 py-2 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 cursor-pointer" onClick={() => setMobileOpen(false)}>
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
