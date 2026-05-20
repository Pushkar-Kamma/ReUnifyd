"use client";

import Image from "next/image";
import { useState } from "react";

interface VideoThumbnailProps {
  src: string | null | undefined;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  placeholderClassName?: string;
}

/**
 * Renders a YouTube video thumbnail with automatic fallback:
 * 1. Tries the stored URL (usually maxresdefault.jpg)
 * 2. On error, falls back to hqdefault.jpg (always available on YouTube)
 * 3. On second error, shows a grey placeholder div
 */
export function VideoThumbnail({
  src,
  alt = "",
  width = 64,
  height = 36,
  className = "h-9 w-16 shrink-0 rounded object-cover",
  placeholderClassName,
}: VideoThumbnailProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(src ?? null);
  const [failed, setFailed] = useState(false);

  const placeholder = (
    <div
      className={
        placeholderClassName ??
        `${className} bg-[var(--bg-2)]`.replace("object-cover", "")
      }
    />
  );

  if (!imgSrc || failed) return placeholder;

  // Extract YouTube video ID from thumbnail URL to build hqdefault fallback
  const hqFallback = (() => {
    const m = imgSrc.match(/\/vi(?:_webp)?\/([^/]+)\//);
    if (!m) return null;
    return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  })();

  function handleError() {
    if (hqFallback && imgSrc !== hqFallback) {
      setImgSrc(hqFallback);
    } else {
      setFailed(true);
    }
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={className}
      onError={handleError}
    />
  );
}
