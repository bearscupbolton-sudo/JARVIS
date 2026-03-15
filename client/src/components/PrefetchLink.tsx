import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { prefetchRoute, createPrefetchObserver } from "@/lib/prefetch";

let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (!sharedObserver) {
    sharedObserver = createPrefetchObserver();
  }
  return sharedObserver;
}

interface PrefetchLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function PrefetchLink({ href, children, className, onClick }: PrefetchLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    const observer = getObserver();
    if (!el || !observer) return;

    el.setAttribute("data-prefetch", href);
    observer.observe(el);

    return () => {
      observer.unobserve(el);
    };
  }, [href]);

  const handleEagerPrefetch = () => {
    prefetchRoute(href);
  };

  return (
    <Link href={href} className={className} ref={ref} onTouchStart={handleEagerPrefetch} onMouseEnter={handleEagerPrefetch} onClick={onClick}>
      {children}
    </Link>
  );
}
