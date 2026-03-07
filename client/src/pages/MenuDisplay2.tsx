import { useEffect } from "react";
import menuImage from "@assets/Cream_and_Black_Minimalist_Cafe_Menu_(2160_x_3840_px)_-_2_1772887480425.png";

const RELOAD_INTERVAL_MS = 8 * 60 * 1000;

export default function MenuDisplay2() {
  useEffect(() => {
    const timer = setInterval(() => {
      window.location.reload();
    }, RELOAD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden"
      data-testid="container-menu-display-2"
    >
      <img
        src={menuImage}
        alt="Bear's Cup Bakehouse Menu - Bagels & Pastries"
        className="-rotate-90 origin-center"
        style={{ height: "100vw", width: "auto" }}
        data-testid="img-menu-2"
      />
    </div>
  );
}
