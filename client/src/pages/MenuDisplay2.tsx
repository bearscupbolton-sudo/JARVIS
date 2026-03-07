import menuImage from "@assets/Cream_and_Black_Minimalist_Cafe_Menu_(2160_x_3840_px)_-_2_1772887480425.png";

export default function MenuDisplay2() {
  return (
    <div
      className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden"
      data-testid="container-menu-display-2"
    >
      <img
        src={menuImage}
        alt="Bear's Cup Bakehouse Menu - Bagels & Pastries"
        className="rotate-90 origin-center"
        style={{ height: "100vw", width: "auto" }}
        data-testid="img-menu-2"
      />
    </div>
  );
}
