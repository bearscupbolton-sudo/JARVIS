import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AlertTriangle, ImageOff } from "lucide-react";

type ScreenData = {
  active: boolean;
  slot: number;
  imageUrl?: string;
  orientation?: string;
  rotationDeg?: number;
  refreshInterval?: number;
  showEightySixed?: boolean;
  eightySixedItems?: string[];
  menuName?: string;
};

function MenuImage({ src, alt, rotationDeg, slot }: { src?: string; alt: string; rotationDeg: number; slot: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 text-white/40">
        <ImageOff className="w-32 h-32" />
        <p className="text-4xl font-light tracking-wide">Menu Loading...</p>
        <p className="text-xl opacity-60">Display {slot}</p>
      </div>
    );
  }

  const isRotated = rotationDeg === 90 || rotationDeg === -90;

  return (
    <img
      src={src}
      alt={alt}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
        width: isRotated ? "100vh" : "100vw",
        height: isRotated ? "100vw" : "100vh",
        objectFit: "contain",
      }}
      onError={() => setFailed(true)}
      data-testid={`img-menu-${slot}`}
    />
  );
}

function useScreenSSE(slot: string) {
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      es = new EventSource(`/api/jmt/screen-events/${slot}`);

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "refresh") {
            queryClient.invalidateQueries({ queryKey: [`/api/jmt/screen/${slot}`] });
          }
          retryRef.current = 0;
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
        retryRef.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [slot]);
}

export default function MenuScreen() {
  const params = useParams<{ slot: string }>();
  const slot = params?.slot || "1";

  useScreenSSE(slot);

  const { data, isLoading } = useQuery<ScreenData>({
    queryKey: [`/api/jmt/screen/${slot}`],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!data?.active) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 text-white/60">
        <img src="/bear-logo.png" alt="Jarvis" className="w-20 h-20 opacity-40" />
        <p className="text-lg font-light tracking-wide" data-testid="text-display-standby">Display {slot} — Standby</p>
        <p className="text-sm opacity-50">No menu assigned. Configure in JMT.</p>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative" data-testid={`container-menu-screen-${slot}`}>
      <MenuImage
        src={data.imageUrl}
        alt={data.menuName || `Menu Display ${slot}`}
        rotationDeg={data.rotationDeg || 0}
        slot={slot}
      />

      {data.showEightySixed && data.eightySixedItems && data.eightySixedItems.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-900/95 backdrop-blur-sm px-6 py-4" data-testid="container-86d-overlay">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-red-200 uppercase tracking-wider">Currently 86'd</span>
              <p className="text-sm text-white font-medium mt-0.5" data-testid="text-86d-items">
                {data.eightySixedItems.join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
