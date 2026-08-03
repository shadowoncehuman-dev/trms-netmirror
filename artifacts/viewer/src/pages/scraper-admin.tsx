import { useState, useEffect } from 'react';
import { Play, Square, RefreshCw, Clock, CheckCircle, XCircle, Loader2, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Nav } from '@/components/nav';
import {
  useGetScraperStatus,
  useStartScraper,
  useStopScraper,
} from '@workspace/api-client-react';
import type { ScraperJob } from '@workspace/api-client-react';

type JobType = 'full' | 'metadata' | 'video' | 'update_check';

const JOB_TYPES: { value: JobType; label: string; description: string }[] = [
  { value: 'full', label: 'Full Scrape', description: 'Fetch all metadata + video URLs' },
  { value: 'metadata', label: 'Metadata Only', description: 'Fetch titles, posters, descriptions' },
  { value: 'video', label: 'Video URLs', description: 'Refresh video CDN links for existing titles' },
  { value: 'update_check', label: 'Update Check', description: 'Check for newly added content' },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
    running: { color: 'bg-blue-500/20 text-blue-400', icon: Loader2 },
    done: { color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
    failed: { color: 'bg-red-500/20 text-red-400', icon: XCircle },
  }[status] ?? { color: 'bg-muted text-muted-foreground', icon: Clock };

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
}

function JobCard({ job }: { job: ScraperJob }) {
  const [showLog, setShowLog] = useState(false);
  const progress = job.totalItems && job.totalItems > 0
    ? Math.round((job.processedItems ?? 0) / job.totalItems * 100)
    : 0;
  const log = Array.isArray(job.log) ? (job.log as unknown) as string[] : [];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{job.jobType} job #{job.id}</span>
              <StatusBadge status={job.status} />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Started: {job.startedAt ? new Date(job.startedAt).toLocaleString() : 'Not started'}</p>
              {job.completedAt && <p>Completed: {new Date(job.completedAt).toLocaleString()}</p>}
              {job.currentItem && <p className="truncate">Processing: {job.currentItem}</p>}
            </div>
            {job.status === 'running' && job.totalItems && job.totalItems > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{job.processedItems ?? 0} / {job.totalItems} items</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}
            <div className="flex gap-3 text-xs text-muted-foreground mt-1">
              <span className="text-green-400">✓ {job.processedItems ?? 0}</span>
              <span className="text-red-400">✗ {job.failedItems ?? 0}</span>
            </div>
          </div>
          {log.length > 0 && (
            <button
              onClick={() => setShowLog(!showLog)}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-0.5 flex-shrink-0"
            >
              Log {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
        {showLog && log.length > 0 && (
          <div className="mt-3 bg-black/30 rounded p-3 max-h-40 overflow-y-auto font-mono text-xs text-muted-foreground space-y-0.5">
            {log.map((entry, i) => <p key={i}>{entry}</p>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScraperAdmin() {
  const [selectedType, setSelectedType] = useState<JobType>('metadata');
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const { data: status, isLoading, refetch } = useGetScraperStatus({
    query: {
      queryKey: ['scraper-status'],
      refetchInterval: pollingEnabled ? 3000 : false,
    }
  });

  const { mutate: startScraper, isPending: starting } = useStartScraper();
  const { mutate: stopScraper, isPending: stopping } = useStopScraper();

  const isRunning = status?.isRunning ?? false;

  useEffect(() => {
    setPollingEnabled(isRunning);
  }, [isRunning]);

  const handleStart = () => {
    startScraper({ data: { type: selectedType } }, {
      onSuccess: () => { setPollingEnabled(true); refetch(); }
    });
  };

  const handleStop = () => {
    stopScraper(undefined, {
      onSuccess: () => refetch()
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-4xl mx-auto px-4 pt-20 pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="w-6 h-6 text-purple-400" />Scraper Control
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage content harvesting from net27.cc</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={handleStop} disabled={stopping} className="gap-2">
                {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Stop
              </Button>
            ) : (
              <Button className="bg-purple-600 hover:bg-purple-700 gap-2" size="sm" onClick={handleStart} disabled={starting}>
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start
              </Button>
            )}
          </div>
        </div>

        {/* Status overview */}
        <Card className="mb-6 bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Status
              {isRunning && (
                <span className="flex items-center gap-1.5 text-blue-400 text-sm font-normal">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />Running
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="space-y-3">
                {status?.activeJobId && status?.recentJobs && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Active job</p>
                    {(() => {
                      const activeJob = status.recentJobs.find(j => j.id === status.activeJobId);
                      return activeJob ? <JobCard job={activeJob as ScraperJob} /> : null;
                    })()}
                  </div>
                )}
                {!isRunning && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Start a new scraper job:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {JOB_TYPES.map(jt => (
                        <button
                          key={jt.value}
                          onClick={() => setSelectedType(jt.value)}
                          className={`text-left p-3 rounded-lg border transition-all ${
                            selectedType === jt.value
                              ? 'border-purple-500 bg-purple-600/10'
                              : 'border-border bg-muted/30 hover:border-purple-500/50'
                          }`}
                        >
                          <p className="text-sm font-medium">{jt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{jt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent jobs */}
        <div>
          <h2 className="text-base font-semibold mb-3">Recent Jobs</h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : !status?.recentJobs?.length ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
              <p>No scraper jobs yet</p>
              <p className="text-xs mt-1">Start a job above to begin harvesting content</p>
            </div>
          ) : (
            <div className="space-y-3">
              {status.recentJobs.map(job => (
                <JobCard key={job.id} job={job as ScraperJob} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
