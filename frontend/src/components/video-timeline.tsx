"use client";

import Link from "next/link";
import { useState } from "react";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { formatCount } from "@/lib/format";
import type { VideoSummary } from "@/lib/youtube";

export function VideoTimeline({ videos }: { videos: VideoSummary[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (videos.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--ink-2)]">
        No videos to display on timeline.
      </div>
    );
  }

  // Filter to videos with valid publish dates and sort chronologically
  const sorted = [...videos]
    .filter((v) => v.published_at)
    .sort((a, b) => Date.parse(a.published_at!) - Date.parse(b.published_at!));

  if (sorted.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--ink-2)]">
        No videos with publish dates available.
      </div>
    );
  }

  const dates = sorted.map((v) => Date.parse(v.published_at!));
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  // Find max views for height scaling (clamp to 1 to avoid division by zero)
  const maxViews = Math.max(...sorted.map((v) => v.views ?? 0), 1);

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Video Timeline</h2>
        <p className="text-xs text-[var(--ink-2)]">
          Chronological view of uploads with performance indicators
        </p>
      </div>

      <div className="space-y-6">
        {/* Timeline SVG background */}
        <div className="relative">
          <svg className="h-2 w-full" style={{ minHeight: "8px" }}>
            <line
              x1="0"
              y1="50%"
              x2="100%"
              y2="50%"
              stroke="var(--border)"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Videos positioned on timeline */}
        <div className="space-y-3">
          {sorted.map((video) => {
            const pubDate = Date.parse(video.published_at!);
            const position = ((pubDate - minDate) / dateRange) * 100;
            const barHeight = (video.views ?? 0) / maxViews * 100;
            const isHovered = hovered === video.video_id;

            return (
              <div
                key={video.video_id}
                className="group relative flex items-end gap-3 px-2 py-1 transition"
                onMouseEnter={() => setHovered(video.video_id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Position marker on timeline */}
                <div
                  className="absolute top-0 w-1 bg-[var(--accent)] opacity-0 transition group-hover:opacity-100"
                  style={{
                    left: `calc(${position}% + 12px)`,
                    height: "24px",
                  }}
                />

                {/* Video thumbnail */}
                <Link href={`/dashboard/videos/${video.video_id}`} className="group/thumb">
                  <VideoThumbnail
                    src={video.thumbnail_url}
                    width={56}
                    height={32}
                    className="h-8 w-14 shrink-0 rounded object-cover transition group-hover/thumb:ring-2 ring-[var(--accent)]"
                  />
                </Link>

                {/* Video details and hover card */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/videos/${video.video_id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {video.title || video.external_video_id}
                  </Link>
                  <div className="text-xs text-[var(--ink-2)]">
                    {video.published_at
                      ? new Date(video.published_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </div>
                </div>

                {/* Views bar + stats */}
                {isHovered && (
                  <div className="absolute -top-16 left-0 z-10 flex flex-col gap-1 rounded border border-[var(--border)] bg-white p-2 shadow-lg whitespace-nowrap text-xs">
                    <div className="font-semibold">{formatCount(video.views ?? 0)} views</div>
                    <div className="text-[var(--ink-2)]">
                      {formatCount(video.likes ?? 0)} likes
                    </div>
                    <div className="text-[var(--ink-2)]">
                      {video.comments != null ? formatCount(video.comments) : "—"} comments
                    </div>
                  </div>
                )}

                <div className="flex items-end justify-end gap-1 text-xs font-semibold">
                  <span>{formatCount(video.views ?? 0)}</span>
                  <div
                    className="w-6 rounded-t bg-[var(--accent)]/30 border-t border-[var(--accent)]"
                    style={{ height: `${Math.max(barHeight, 8)}px` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
