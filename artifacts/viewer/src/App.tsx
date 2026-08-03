import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Browse from '@/pages/browse';
import ContentDetail from '@/pages/content-detail';
import LiveTV from '@/pages/live-tv';
import ScraperAdmin from '@/pages/scraper-admin';
import { Route, Switch, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/content/:tmdbId/:type" component={ContentDetail} />
      <Route path="/content/subject/:subjectId" component={ContentDetail} />
      <Route path="/live" component={LiveTV} />
      <Route path="/admin/scraper" component={ScraperAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
