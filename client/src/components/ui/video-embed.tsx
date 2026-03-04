import { useState, useEffect, useCallback } from "react";
import { Play } from "lucide-react";

function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function parseVimeoId(url: string): string | null {
  const match = url.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/);
  return match ? match[1] : null;
}

type VideoProvider = "youtube" | "vimeo" | null;

function detectProvider(url: string): { provider: VideoProvider; id: string | null } {
  const ytId = parseYouTubeId(url);
  if (ytId) return { provider: "youtube", id: ytId };
  const vimeoId = parseVimeoId(url);
  if (vimeoId) return { provider: "vimeo", id: vimeoId };
  return { provider: null, id: null };
}

interface VideoEmbedProps {
  url: string;
  className?: string;
}

export function VideoEmbed({ url, className = "" }: VideoEmbedProps) {
  const [playing, setPlaying] = useState(false);
  const [vimeoThumb, setVimeoThumb] = useState<string | null>(null);

  const { provider, id } = detectProvider(url);

  useEffect(() => {
    if (provider === "vimeo" && id) {
      fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.thumbnail_url) setVimeoThumb(data.thumbnail_url);
        })
        .catch(() => {});
    }
  }, [provider, id]);

  const handlePlay = useCallback(() => setPlaying(true), []);

  if (!provider || !id) {
    return null;
  }

  const thumbnailUrl =
    provider === "youtube"
      ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
      : vimeoThumb;

  const embedUrl =
    provider === "youtube"
      ? `https://www.youtube.com/embed/${id}?autoplay=1`
      : `https://player.vimeo.com/video/${id}?autoplay=1`;

  if (playing) {
    return (
      <div className={`relative w-full ${className}`} style={{ aspectRatio: "16/9" }} data-testid="video-embed-player">
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full rounded-md"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Video player"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      className={`relative w-full cursor-pointer group rounded-md overflow-hidden bg-muted ${className}`}
      style={{ aspectRatio: "16/9" }}
      data-testid="video-embed-facade"
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt="Video thumbnail"
          className="absolute inset-0 w-full h-full object-cover"
          data-testid="video-embed-thumbnail"
        />
      ) : (
        <div className="absolute inset-0 bg-muted" />
      )}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
          <Play className="w-8 h-8 text-black ml-1" />
        </div>
      </div>
    </button>
  );
}
