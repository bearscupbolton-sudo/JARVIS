import { useState, useRef, useEffect, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad" | "src"> {
  src: string | null | undefined;
  thumbnailSrc?: string | null;
  alt: string;
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function LazyImage({
  src,
  thumbnailSrc,
  alt,
  className,
  width,
  height,
  ...imgProps
}: LazyImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setFullLoaded(false);
    setThumbLoaded(false);
    setHasError(false);
  }, [src]);

  if (!src) {
    return (
      <div
        ref={containerRef}
        className={cn("flex items-center justify-center bg-muted", className)}
        style={{ width, height }}
        data-testid="lazy-image-skeleton"
      >
        <Skeleton className="w-full h-full absolute inset-0" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        ref={containerRef}
        className={cn("flex items-center justify-center bg-muted", className)}
        style={{ width, height }}
        data-testid="lazy-image-error"
      >
        <ImageOff className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
    >
      {!fullLoaded && !thumbnailSrc && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {thumbnailSrc && !fullLoaded && (
        <img
          src={thumbnailSrc}
          alt={alt}
          onLoad={() => setThumbLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            thumbLoaded ? "opacity-100 blur-sm scale-105" : "opacity-0"
          )}
          aria-hidden="true"
        />
      )}

      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setFullLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500",
            fullLoaded ? "opacity-100" : "opacity-0"
          )}
          {...imgProps}
        />
      )}
    </div>
  );
}
