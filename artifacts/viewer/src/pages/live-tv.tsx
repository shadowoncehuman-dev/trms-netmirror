import { useState, useRef } from 'react';
import { Radio, Tv, Circle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Nav } from '@/components/nav';
import { useListLiveChannels, useListLiveGroups, useRefreshLiveChannels } from '@workspace/api-client-react';
import type { LiveChannel } from '@workspace/api-client-react';

function LivePlayer({ channel }: { channel: LiveChannel }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden w-full">
      <video
        ref={videoRef}
        src={channel.streamUrl}
        controls
        autoPlay
        className="w-full h-full"
        playsInline
        key={channel.channelId}
      />
    </div>
  );
}

export default function LiveTV() {
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>(undefined);
  const [activeChannel, setActiveChannel] = useState<LiveChannel | null>(null);

  const { data: groupsData } = useListLiveGroups();
  const { data: channelsData, isLoading } = useListLiveChannels({ group: selectedGroup });
  const { mutate: refresh, isPending: refreshing } = useRefreshLiveChannels();

  const channels = channelsData?.channels ?? [];
  const groups = groupsData?.groups ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-7xl mx-auto px-4 pt-20 pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="w-6 h-6 text-red-400" />Live TV
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{channels.length} channels</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={refreshing}
            className="gap-2"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>

        {/* Active player */}
        {activeChannel && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              {activeChannel.logo && (
                <img src={activeChannel.logo} alt="" className="w-8 h-8 object-contain rounded" />
              )}
              <div>
                <h2 className="font-semibold">{activeChannel.name}</h2>
                {activeChannel.group && <p className="text-xs text-muted-foreground">{activeChannel.group}</p>}
              </div>
              <Badge variant={activeChannel.isUp ? 'default' : 'destructive'} className="ml-auto gap-1">
                <Circle className={`w-2 h-2 fill-current ${activeChannel.isUp ? 'text-green-400' : 'text-red-400'}`} />
                {activeChannel.isUp ? 'Live' : 'Offline'}
              </Badge>
            </div>
            <LivePlayer channel={activeChannel} />
          </div>
        )}

        {/* Group filter */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            <button
              onClick={() => setSelectedGroup(undefined)}
              className={`text-sm px-3 py-1 rounded-full transition-colors ${!selectedGroup ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white'}`}
            >
              All
            </button>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={`text-sm px-3 py-1 rounded-full transition-colors ${selectedGroup === g ? 'bg-purple-600 text-white' : 'bg-secondary text-muted-foreground hover:text-white'}`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Channels grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 20 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Tv className="w-12 h-12 mb-3" />
            <p>No channels found</p>
            <p className="text-sm mt-1">Click Refresh to fetch live TV channels</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {channels.map(ch => (
              <button
                key={ch.channelId}
                onClick={() => setActiveChannel(ch)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-left ${
                  activeChannel?.channelId === ch.channelId
                    ? 'border-purple-500 bg-purple-600/10'
                    : 'border-border bg-card hover:border-purple-500/50 hover:bg-card/80'
                }`}
              >
                {ch.logo ? (
                  <img src={ch.logo} alt={ch.name} className="w-12 h-12 object-contain" />
                ) : (
                  <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                    <Tv className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="w-full">
                  <p className="text-xs font-medium text-center truncate">{ch.name}</p>
                  {ch.group && <p className="text-xs text-muted-foreground text-center truncate">{ch.group}</p>}
                  <div className="flex justify-center mt-1">
                    <Circle className={`w-2 h-2 fill-current ${ch.isUp !== false ? 'text-green-400' : 'text-red-400'}`} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
