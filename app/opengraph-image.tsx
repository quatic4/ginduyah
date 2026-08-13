import { ImageResponse } from "next/og";

export const alt = "Ginduyah — Turn Reddit stories into scroll-stopping cards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", alignItems: "center", padding: "72px 82px", color: "#f7f7f8", background: "radial-gradient(circle at 82% 18%, rgba(255,84,31,.45), transparent 32%), linear-gradient(135deg, #090a0c 0%, #111318 58%, #17191d 100%)", fontFamily: "Arial" }}>
      <div style={{ position: "absolute", inset: 24, display: "flex", border: "1px solid #2d3036", borderRadius: 34 }} />
      <div style={{ width: 690, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 52 }}>
          <img src="https://ginduyah.vercel.app/ginduyah-avatar.png" width="82" height="82" style={{ borderRadius: "50%", border: "3px solid #ff541f" }} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
            <div style={{ fontSize: 35, fontWeight: 800, letterSpacing: -1 }}>ginduyah</div>
            <div style={{ marginTop: 5, color: "#ff754b", fontSize: 17, fontWeight: 700, letterSpacing: 3 }}>REDDIT → SHORT-FORM</div>
          </div>
        </div>
        <div style={{ fontSize: 66, lineHeight: 1.04, fontWeight: 800, letterSpacing: -3.5 }}>Turn any story into a scroll-stopping card.</div>
        <div style={{ marginTop: 28, color: "#b8bbc1", fontSize: 25, lineHeight: 1.35 }}>Create downloadable images for YouTube Shorts, TikTok, and Reels.</div>
      </div>
      <div style={{ width: 310, height: 430, marginLeft: "auto", display: "flex", flexDirection: "column", padding: 30, borderRadius: 28, border: "1px solid #3a3d43", background: "#202226", boxShadow: "0 26px 70px rgba(0,0,0,.38)", transform: "rotate(3deg)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#ff541f", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>r</div>
          <div style={{ marginLeft: 12, display: "flex", flexDirection: "column" }}><div style={{ fontSize: 16, fontWeight: 700 }}>r/AskReddit</div><div style={{ color: "#92959b", fontSize: 11 }}>Posted by u/ginduyah</div></div>
        </div>
        <div style={{ marginTop: 30, fontSize: 28, lineHeight: 1.12, fontWeight: 800 }}>What story will you turn into your next video?</div>
        <div style={{ marginTop: 22, color: "#c7c9cd", fontSize: 17, lineHeight: 1.45 }}>Paste a Reddit link, customize the design, and export a crisp PNG.</div>
        <div style={{ marginTop: "auto", display: "flex", gap: 10 }}><div style={{ padding: "10px 15px", borderRadius: 18, background: "#2c2e33", fontSize: 13 }}>↑ 12.4K ↓</div><div style={{ padding: "10px 15px", borderRadius: 18, background: "#2c2e33", fontSize: 13 }}>▢ 847</div></div>
      </div>
    </div>,
    size,
  );
}
