"use client";

import { useEffect, useRef, useState } from "react";

type Story = { title: string; body: string; author: string; subreddit: string; score: number; comments: number };
type RedditComment = { id: string; author: string; body: string; score: number; depth: number; selected: boolean };
type SizePreset = "short" | "square" | "landscape" | "custom";

const starter: Story = {
  title: "What is the kindest thing a stranger has ever done for you?",
  body: "Last winter my car broke down on a quiet road during a snowstorm. A stranger stopped, helped me push it somewhere safe, and waited until the tow truck arrived.\n\nI never got his name, but I still think about it whenever I see someone stranded.",
  author: "littlepaperboats",
  subreddit: "AskReddit",
  score: 12400,
  comments: 847,
};

const presets: Record<Exclude<SizePreset, "custom">, [number, number]> = {
  short: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080],
};

const accentColors = [
  { name: "Orange", hex: "#ff541f", rgb: "255,84,31" }, { name: "Red", hex: "#ff3b4f", rgb: "255,59,79" },
  { name: "Pink", hex: "#f04fbd", rgb: "240,79,189" }, { name: "Purple", hex: "#9b6cff", rgb: "155,108,255" },
  { name: "Blue", hex: "#438cff", rgb: "67,140,255" }, { name: "Cyan", hex: "#20c7d9", rgb: "32,199,217" },
  { name: "Green", hex: "#39c978", rgb: "57,201,120" }, { name: "Yellow", hex: "#f2bb35", rgb: "242,187,53" },
];

const featuredChannels = [
  { name: "Ginduyah", handle: "@ginduyah", url: "https://www.youtube.com/@ginduyah", views: "2M views", image: "https://yt3.googleusercontent.com/AhdFFGGJJblVlnW-XgA4xOhl8F7pTU6L1DKk8slahB-dn4eG5kOKdviv63PvpHFhGXlFZfPLMA=s900-c-k-c0x00ffffff-no-rj" },
  { name: "Rezaro", handle: "@RezaroReads", url: "https://www.youtube.com/@RezaroReads", views: "884K views", image: "https://yt3.googleusercontent.com/bCwlSwg1EppYymVuojO1oqi4tQbwmoNgoNfYDPUvsJlz69KzDRVXzfKGbMAkibR8Yu38lmCXCw=s900-c-k-c0x00ffffff-no-rj" },
  { name: "LemurStories", handle: "@LemurStories", url: "https://www.youtube.com/@LemurStories", views: "No public views yet", image: "https://yt3.googleusercontent.com/ECZLBSNHBHpIJ7Wo6EYGG_QChY8X9z-9CIGSUdE7FZN_XjKvzqwt3MVnO3bd7mlSsvzSpUDL=s900-c-k-c0x00ffffff-no-rj" },
];

const avatarColors = ["#ff4500", "#ff3b4f", "#f04fbd", "#9b6cff", "#438cff", "#20c7d9", "#39c978", "#f2a531"];

function avatarColor(name: string) {
  let hash = 0;
  for (const character of name) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.closePath();
}

function linesFor(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    const words = paragraph.trim().split(/\s+/); let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function voteArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, direction: "up" | "down") {
  const flip = direction === "up" ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x, y - 10 * size * flip); ctx.lineTo(x - 10 * size, y * 1 + 1 * size * flip);
  ctx.lineTo(x - 4 * size, y + 1 * size * flip); ctx.lineTo(x - 4 * size, y + 10 * size * flip);
  ctx.lineTo(x + 4 * size, y + 10 * size * flip); ctx.lineTo(x + 4 * size, y + 1 * size * flip);
  ctx.lineTo(x + 10 * size, y + 1 * size * flip); ctx.closePath(); ctx.stroke();
}

function commentBubble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath(); ctx.moveTo(x - 10 * size, y - 8 * size); ctx.lineTo(x + 10 * size, y - 8 * size);
  ctx.quadraticCurveTo(x + 13 * size, y - 8 * size, x + 13 * size, y - 5 * size);
  ctx.lineTo(x + 13 * size, y + 6 * size); ctx.quadraticCurveTo(x + 13 * size, y + 9 * size, x + 10 * size, y + 9 * size);
  ctx.lineTo(x - 2 * size, y + 9 * size); ctx.lineTo(x - 9 * size, y + 14 * size); ctx.lineTo(x - 7 * size, y + 9 * size);
  ctx.lineTo(x - 10 * size, y + 9 * size); ctx.quadraticCurveTo(x - 13 * size, y + 9 * size, x - 13 * size, y + 6 * size);
  ctx.lineTo(x - 13 * size, y - 5 * size); ctx.quadraticCurveTo(x - 13 * size, y - 8 * size, x - 10 * size, y - 8 * size); ctx.stroke();
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [story, setStory] = useState(starter);
  const [url, setUrl] = useState("");
  const [preset, setPreset] = useState<SizePreset>("short");
  const [width, setWidth] = useState(1080); const [height, setHeight] = useState(1920);
  const [transparent, setTransparent] = useState(true); const [bg, setBg] = useState("#0f1115");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [avatarImage, setAvatarImage] = useState<HTMLImageElement | null>(null);
  const [replyAvatarImage, setReplyAvatarImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Paste a Reddit link, or edit the story manually.");
  const [loading, setLoading] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [redditJson, setRedditJson] = useState("");
  const [includeReplies, setIncludeReplies] = useState(false);
  const [redditComments, setRedditComments] = useState<RedditComment[]>([]);
  const [originalPost, setOriginalPost] = useState<Story>(starter);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [replyContext, setReplyContext] = useState<{ depth: number; postAuthor: string } | null>(null);
  const [accent, setAccent] = useState(accentColors[0]);
  const [rgbMode, setRgbMode] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [channelCards, setChannelCards] = useState(featuredChannels);

  const update = (key: keyof Story, value: string | number) => {
    setStory((s) => ({ ...s, [key]: value }));
    setOriginalPost((post) => ({ ...post, [key]: value }));
  };

  useEffect(() => {
    const root = document.documentElement;
    let targetX = window.innerWidth * .82; let targetY = 0;
    let glowX = targetX; let glowY = targetY;
    let animationFrame = 0;
    const followGlow = (event: PointerEvent) => {
      targetX = event.clientX; targetY = event.clientY;
    };
    const animateGlow = () => {
      glowX += (targetX - glowX) * .16; glowY += (targetY - glowY) * .16;
      root.style.setProperty("--glow-x", `${glowX}px`); root.style.setProperty("--glow-y", `${glowY}px`);
      animationFrame = requestAnimationFrame(animateGlow);
    };
    window.addEventListener("pointermove", followGlow, { passive: true });
    animationFrame = requestAnimationFrame(animateGlow);
    return () => { window.removeEventListener("pointermove", followGlow); cancelAnimationFrame(animationFrame); };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!rgbMode) {
      root.style.setProperty("--orange", accent.hex);
      root.style.setProperty("--accent-rgb", accent.rgb);
      return;
    }

    let frame = 0;
    const animateRgb = (time: number) => {
      const hue = (time / 35) % 360;
      const lightness = .6; const saturation = .92;
      const a = saturation * Math.min(lightness, 1 - lightness);
      const channel = (offset: number) => {
        const k = (offset + hue / 30) % 12;
        return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
      };
      root.style.setProperty("--orange", `hsl(${hue} 92% 60%)`);
      root.style.setProperty("--accent-rgb", `${channel(0)},${channel(8)},${channel(4)}`);
      frame = requestAnimationFrame(animateRgb);
    };
    frame = requestAnimationFrame(animateRgb);
    return () => cancelAnimationFrame(frame);
  }, [accent, rgbMode]);

  useEffect(() => {
    let active = true;
    fetch("/api/channels")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { channels?: typeof featuredChannels }) => {
        if (active && payload.channels?.length === featuredChannels.length) setChannelCards(payload.channels);
      })
      .catch(() => { /* Keep the last known channel details if YouTube is unavailable. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const wrap = canvasWrapRef.current;
      if (wrap) wrap.scrollTop = Math.max(0, (wrap.scrollHeight - wrap.clientHeight) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [width, height, selectedCommentIds]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }

    const scale = Math.min(width / 1080, height / 1080);
    const margin = Math.max(54 * scale, width * 0.06); const cardW = width - margin * 2;
    const replyIndent = replyContext ? Math.min(replyContext.depth + 1, 3) * 28 * scale : 0;
    const replyBodyOffset = replyContext ? 54 * scale : 0;
    let bodyFont = replyContext ? Math.max(23, 30 * scale) : Math.max(27, 38 * scale); let titleFont = Math.max(36, 55 * scale);
    const pad = Math.max(38, 58 * scale); const titleMaxText = cardW - pad * 2; const maxText = titleMaxText - replyIndent - replyBodyOffset; const textX = margin + pad + replyIndent; const bodyX = textX + replyBodyOffset;
    let titleLines: string[] = []; let bodyLines: string[] = []; let titleLH = 0; let bodyLH = 0; let naturalH = 0;
    const maxCardH = height - margin * 2;
    for (let attempt = 0; attempt < 140; attempt++) {
      ctx.font = `600 ${titleFont}px Arial`; titleLines = story.title ? linesFor(ctx, story.title, titleMaxText) : [];
      ctx.font = `400 ${bodyFont}px Arial`; bodyLines = story.body ? linesFor(ctx, story.body, maxText) : [];
      titleLH = titleFont * 1.16; bodyLH = bodyFont * (replyContext ? 1.34 : 1.42);
      naturalH = pad + 58 * scale + 32 * scale + (replyContext ? 118 * scale : 0) + titleLines.length * titleLH + 30 * scale + bodyLines.length * bodyLH + 92 * scale + pad;
      if (naturalH <= maxCardH) break;
      titleFont *= .96; bodyFont *= .96;
    }
    const cardH = Math.min(naturalH, maxCardH); const x = margin; const y = (height - cardH) / 2;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 45 * scale; ctx.shadowOffsetY = 15 * scale;
    const cardColor = theme === "dark" ? "#202226" : "#ffffff";
    const primary = theme === "dark" ? "#f7f7f8" : "#1a1a1b";
    const secondary = theme === "dark" ? "#d7d9dc" : "#3a3a3c";
    const subdued = theme === "dark" ? "#a8aaae" : "#6a6d70";
    ctx.fillStyle = cardColor; roundedRect(ctx, x, y, cardW, cardH, 30 * scale); ctx.fill(); ctx.restore();

    let cy = y + pad - 14 * scale; const postX = x + pad;
    ctx.save(); ctx.beginPath(); ctx.arc(postX + 24 * scale, cy + 24 * scale, 24 * scale, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, postX, cy, 48 * scale, 48 * scale);
    else { ctx.fillStyle = avatarColor(story.author || story.subreddit || "reddit"); ctx.fillRect(postX, cy, 48 * scale, 48 * scale); ctx.fillStyle = "white"; ctx.font = `700 ${25 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText("r", postX + 24 * scale, cy + 33 * scale); }
    ctx.restore(); ctx.textAlign = "left";
    ctx.fillStyle = primary; ctx.font = `700 ${24 * scale}px Arial`; ctx.fillText(`r/${story.subreddit || "reddit"}`, postX + 64 * scale, cy + 20 * scale);
    ctx.fillStyle = subdued; ctx.font = `400 ${21 * scale}px Arial`; ctx.fillText(`Posted by u/${replyContext ? originalPost.author : story.author || "anonymous"}`, postX + 64 * scale, cy + 49 * scale);
    cy += 116 * scale;
    ctx.fillStyle = primary; ctx.font = `700 ${titleFont}px Arial`;
    const footerY = y + cardH - pad - 42 * scale;
    for (const line of titleLines) { ctx.fillText(line, x + pad, cy); cy += titleLH; }
    cy += 18 * scale;
    if (replyContext) {
      const replyTop = cy; ctx.strokeStyle = theme === "dark" ? "#555a61" : "#c8c9cb"; ctx.lineWidth = 3 * scale;
      for (let level = 0; level <= Math.min(replyContext.depth, 2); level++) { const railX = x + pad + level * 28 * scale + 8 * scale; ctx.beginPath(); ctx.moveTo(railX, replyTop); ctx.lineTo(railX, footerY + 14 * scale); ctx.stroke(); }
      ctx.fillStyle = "#ff541f"; ctx.font = `700 ${20 * scale}px Arial`; ctx.fillText(`${replyContext.depth ? "Reply in thread" : "Comment"} · on u/${replyContext.postAuthor}'s post`, textX, cy + 18 * scale); cy += 40 * scale;
      ctx.save(); ctx.beginPath(); ctx.arc(textX + 20 * scale, cy + 20 * scale, 20 * scale, 0, Math.PI * 2); ctx.clip();
      if (replyAvatarImage) ctx.drawImage(replyAvatarImage, textX, cy, 40 * scale, 40 * scale);
      else { ctx.fillStyle = "#5f6975"; ctx.fillRect(textX, cy, 40 * scale, 40 * scale); ctx.fillStyle = "white"; ctx.font = `700 ${18 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText((story.author || "r").slice(0,1).toUpperCase(), textX + 20 * scale, cy + 27 * scale); }
      ctx.restore(); ctx.textAlign = "left"; ctx.fillStyle = primary; ctx.font = `700 ${22 * scale}px Arial`; ctx.fillText(`u/${story.author || "anonymous"}`, bodyX, cy + 27 * scale); cy += 66 * scale;
    }
    ctx.fillStyle = secondary; ctx.font = `400 ${bodyFont}px Arial`;
    for (const line of bodyLines) { ctx.fillText(line, bodyX, cy); cy += bodyLH; }
    const actionBg = theme === "dark" ? "#2b2d31" : "#f2f2f3";
    const voteX = bodyX; const voteW = 166 * scale; const actionY = footerY - 29 * scale;
    ctx.fillStyle = actionBg; roundedRect(ctx, voteX, actionY, voteW, 52 * scale, 26 * scale); ctx.fill();
    ctx.strokeStyle = subdued; ctx.lineWidth = 2.4 * scale; ctx.lineJoin = "round";
    voteArrow(ctx, voteX + 28 * scale, footerY - 3 * scale, scale, "up");
    ctx.fillStyle = primary; ctx.font = `700 ${21 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText(formatCount(story.score), voteX + 82 * scale, footerY + 5 * scale);
    voteArrow(ctx, voteX + 138 * scale, footerY - 3 * scale, scale, "down");
    const commentX = voteX + voteW + 14 * scale; const commentW = 230 * scale;
    ctx.fillStyle = actionBg; roundedRect(ctx, commentX, actionY, commentW, 52 * scale, 26 * scale); ctx.fill();
    ctx.strokeStyle = subdued; commentBubble(ctx, commentX + 30 * scale, footerY - 3 * scale, scale);
    ctx.fillStyle = primary; ctx.textAlign = "left"; ctx.fillText(`${formatCount(story.comments)} Comments`, commentX + 55 * scale, footerY + 5 * scale); ctx.textAlign = "left";
  }, [story, width, height, transparent, bg, theme, avatarImage, replyAvatarImage, replyContext, originalPost]);

  useEffect(() => {
    if (!selectedCommentIds.length) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = width; canvas.height = height; ctx.clearRect(0, 0, width, height);
    if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
    const selected = redditComments.filter((comment) => selectedCommentIds.includes(comment.id));
    const scale = Math.min(width / 1080, height / 1080); const margin = Math.max(54 * scale, width * .06);
    const cardW = width - margin * 2; const pad = Math.max(38, 58 * scale); const contentW = cardW - pad * 2;
    const maxCardH = height - margin * 2; let titleFont = Math.max(34, 52 * scale); let postFont = Math.max(24, 34 * scale); let commentFont = Math.max(19, 25 * scale);
    let titleLines: string[] = []; let postLines: string[] = []; let commentLayouts: { comment: RedditComment; lines: string[]; height: number }[] = []; let naturalH = 0;
    for (let attempt = 0; attempt < 150; attempt++) {
      ctx.font = `700 ${titleFont}px Arial`; titleLines = originalPost.title ? linesFor(ctx, originalPost.title, contentW) : [];
      ctx.font = `400 ${postFont}px Arial`; postLines = originalPost.body ? linesFor(ctx, originalPost.body, contentW) : [];
      commentLayouts = selected.map((comment) => { const indent = Math.min(comment.depth, 3) * 34 * scale; ctx.font = `400 ${commentFont}px Arial`; const lines = linesFor(ctx, comment.body, contentW - indent - 58 * scale); return { comment, lines, height: 88 * scale + lines.length * commentFont * 1.42 + 78 * scale }; });
      naturalH = pad + 116 * scale + titleLines.length * titleFont * 1.15 + (postLines.length ? 22 * scale + postLines.length * postFont * 1.4 : 0) + 38 * scale + commentLayouts.reduce((sum, item) => sum + item.height, 0) + 88 * scale + pad;
      if (naturalH <= maxCardH) break; titleFont *= .96; postFont *= .96; commentFont *= .96;
    }
    const cardH = Math.min(naturalH, maxCardH); const x = margin; const y = (height - cardH) / 2;
    const cardColor = theme === "dark" ? "#202226" : "#fff"; const primary = theme === "dark" ? "#f7f7f8" : "#1a1a1b"; const secondary = theme === "dark" ? "#d7d9dc" : "#3a3a3c"; const subdued = theme === "dark" ? "#a8aaae" : "#6a6d70";
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 45 * scale; ctx.shadowOffsetY = 15 * scale; ctx.fillStyle = cardColor; roundedRect(ctx, x, y, cardW, cardH, 30 * scale); ctx.fill(); ctx.restore();
    let cy = y + pad - 10 * scale; const postX = x + pad;
    ctx.save(); ctx.beginPath(); ctx.arc(postX + 24 * scale, cy + 24 * scale, 24 * scale, 0, Math.PI * 2); ctx.clip();
    if (avatarImage) ctx.drawImage(avatarImage, postX, cy, 48 * scale, 48 * scale); else { ctx.fillStyle = avatarColor(originalPost.author || originalPost.subreddit || "reddit"); ctx.fillRect(postX, cy, 48 * scale, 48 * scale); ctx.fillStyle = "white"; ctx.font = `700 ${25 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText("r", postX + 24 * scale, cy + 33 * scale); } ctx.restore();
    ctx.textAlign = "left"; ctx.fillStyle = primary; ctx.font = `700 ${24 * scale}px Arial`; ctx.fillText(`r/${originalPost.subreddit || "reddit"}`, postX + 64 * scale, cy + 20 * scale); ctx.fillStyle = subdued; ctx.font = `400 ${20 * scale}px Arial`; ctx.fillText(`Posted by u/${originalPost.author || "anonymous"}`, postX + 64 * scale, cy + 49 * scale); cy += 116 * scale;
    ctx.fillStyle = primary; ctx.font = `700 ${titleFont}px Arial`; for (const line of titleLines) { ctx.fillText(line, postX, cy); cy += titleFont * 1.15; }
    if (postLines.length) { cy += 18 * scale; ctx.fillStyle = secondary; ctx.font = `400 ${postFont}px Arial`; for (const line of postLines) { ctx.fillText(line, postX, cy); cy += postFont * 1.4; } }
    cy += 30 * scale;
    for (const { comment, lines } of commentLayouts) {
      const depth = Math.min(comment.depth, 3); const indent = depth * 34 * scale; const itemX = postX + indent; const bodyX = itemX + 56 * scale; const itemTop = cy - 10 * scale;
      if (depth) { ctx.strokeStyle = theme === "dark" ? "#555a61" : "#c8c9cb"; ctx.lineWidth = 3 * scale; ctx.lineCap = "round"; for (let level = 0; level < depth; level++) { const railX = postX + level * 34 * scale + 9 * scale; ctx.beginPath(); ctx.moveTo(railX, itemTop - 28 * scale); ctx.lineTo(railX, cy + 138 * scale + lines.length * commentFont * 1.42); ctx.stroke(); } ctx.lineCap = "butt"; }
      ctx.save(); ctx.beginPath(); ctx.arc(itemX + 19 * scale, cy + 19 * scale, 19 * scale, 0, Math.PI * 2); ctx.clip(); if (replyAvatarImage) ctx.drawImage(replyAvatarImage, itemX, cy, 38 * scale, 38 * scale); else { ctx.fillStyle = avatarColor(comment.author || "reply"); ctx.fillRect(itemX, cy, 38 * scale, 38 * scale); ctx.fillStyle = "white"; ctx.font = `700 ${17 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText((comment.author || "r")[0].toUpperCase(), itemX + 19 * scale, cy + 26 * scale); } ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = primary; ctx.font = `700 ${20 * scale}px Arial`; ctx.fillText(`u/${comment.author || "anonymous"}`, bodyX, cy + 18 * scale); ctx.fillStyle = subdued; ctx.font = `400 ${16 * scale}px Arial`; ctx.fillText(`${formatCount(comment.score)} points${depth ? " · reply" : " · comment"}`, bodyX, cy + 43 * scale); cy += 78 * scale;
      ctx.fillStyle = secondary; ctx.font = `400 ${commentFont}px Arial`; for (const line of lines) { ctx.fillText(line, bodyX, cy); cy += commentFont * 1.42; }
      cy += 16 * scale; const replyVoteW = 154 * scale; const replyVoteH = 44 * scale; const replyVoteY = cy - 23 * scale; ctx.fillStyle = theme === "dark" ? "#2b2d31" : "#f2f2f3"; roundedRect(ctx, bodyX, replyVoteY, replyVoteW, replyVoteH, 22 * scale); ctx.fill(); ctx.strokeStyle = subdued; ctx.lineWidth = 2.1 * scale; ctx.lineJoin = "round"; voteArrow(ctx, bodyX + 26 * scale, cy - 1 * scale, .82 * scale, "up"); ctx.fillStyle = primary; ctx.font = `700 ${18 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText(formatCount(comment.score), bodyX + 77 * scale, cy + 5 * scale); ctx.strokeStyle = subdued; voteArrow(ctx, bodyX + 128 * scale, cy - 1 * scale, .82 * scale, "down"); ctx.textAlign = "left"; cy += 62 * scale;
    }
    const footerY = y + cardH - pad - 32 * scale; const actionBg = theme === "dark" ? "#2b2d31" : "#f2f2f3"; const voteW = 166 * scale;
    ctx.fillStyle = actionBg; roundedRect(ctx, postX, footerY - 27 * scale, voteW, 52 * scale, 26 * scale); ctx.fill(); ctx.strokeStyle = subdued; ctx.lineWidth = 2.4 * scale; voteArrow(ctx, postX + 28 * scale, footerY - 1 * scale, scale, "up"); ctx.fillStyle = primary; ctx.font = `700 ${21 * scale}px Arial`; ctx.textAlign = "center"; ctx.fillText(formatCount(originalPost.score), postX + 82 * scale, footerY + 7 * scale); voteArrow(ctx, postX + 138 * scale, footerY - 1 * scale, scale, "down");
    const commentX = postX + voteW + 14 * scale; ctx.fillStyle = actionBg; roundedRect(ctx, commentX, footerY - 27 * scale, 230 * scale, 52 * scale, 26 * scale); ctx.fill(); ctx.strokeStyle = subdued; commentBubble(ctx, commentX + 30 * scale, footerY - 1 * scale, scale); ctx.fillStyle = primary; ctx.textAlign = "left"; ctx.fillText(`${formatCount(originalPost.comments)} Comments`, commentX + 55 * scale, footerY + 7 * scale);
  }, [selectedCommentIds, redditComments, originalPost, width, height, transparent, bg, theme, avatarImage, replyAvatarImage]);

  function formatCount(value: number) { return value >= 1000000 ? `${(value/1000000).toFixed(1)}m` : value >= 1000 ? `${(value/1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value || 0); }

  function chooseAvatar(file?: File) {
    if (!file) return; const reader = new FileReader();
    reader.onload = () => { const image = new Image(); image.onload = () => setAvatarImage(image); image.src = String(reader.result); };
    reader.readAsDataURL(file);
  }

  function chooseReplyAvatar(file?: File) {
    if (!file) return; const reader = new FileReader();
    reader.onload = () => { const image = new Image(); image.onload = () => setReplyAvatarImage(image); image.src = String(reader.result); };
    reader.readAsDataURL(file);
  }

  function choosePreset(next: SizePreset) {
    setPreset(next); if (next !== "custom") { setWidth(presets[next][0]); setHeight(presets[next][1]); }
  }

  async function fetchPost() {
    if (!/^https?:\/\/(www\.|old\.)?reddit\.com\//i.test(url) && !/^https?:\/\/redd\.it\//i.test(url)) { setStatus("Enter a valid reddit.com or redd.it post URL."); return; }
    setLoading(true); setStatus("Fetching post…");
    try {
      const response = await fetch(`/api/reddit?url=${encodeURIComponent(url)}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reddit request failed");
      setStory(data); setOriginalPost(data); setSelectedCommentIds([]); setReplyContext(null); setShowFallback(false); setStatus("Post loaded. Every field is still editable.");
    } catch { setShowFallback(true); setStatus("Reddit blocked the automatic import. Use the quick JSON fallback below, or edit the fields manually."); }
    finally { setLoading(false); }
  }

  function importJson() {
    try {
      const payload = JSON.parse(redditJson);
      const post = Array.isArray(payload) ? payload?.[0]?.data?.children?.[0]?.data : payload?.data?.children?.[0]?.data ?? payload;
      if (!post?.title) throw new Error();
      setStory({ title: String(post.title || ""), body: String(post.selftext || ""), author: String(post.author || "anonymous"), subreddit: String(post.subreddit || "reddit"), score: Number(post.score || 0), comments: Number(post.num_comments || 0) });
      setOriginalPost({ title: String(post.title || ""), body: String(post.selftext || ""), author: String(post.author || "anonymous"), subreddit: String(post.subreddit || "reddit"), score: Number(post.score || 0), comments: Number(post.num_comments || 0) }); setSelectedCommentIds([]); setReplyContext(null);
      const found: RedditComment[] = [];
      const walk = (children: unknown[], depth = 0) => children?.forEach((child) => {
        const data = (child as { kind?: string; data?: Record<string, unknown> })?.data;
        if (!data || typeof data.body !== "string") return;
        found.push({ id: String(data.id || `${depth}-${found.length}`), author: String(data.author || "anonymous"), body: data.body, score: Number(data.score || 0), depth, selected: false });
        const replies = data.replies as { data?: { children?: unknown[] } } | "" | undefined;
        if (replies && typeof replies === "object") walk(replies.data?.children || [], depth + 1);
      });
      if (Array.isArray(payload)) walk(payload?.[1]?.data?.children || []);
      setRedditComments(found); setStatus(`Post imported${found.length ? ` with ${found.length} comments and replies` : ""}. Every field is editable.`); setShowFallback(false); setRedditJson("");
    } catch { setStatus("That doesn’t look like Reddit post JSON. Copy the complete page contents and try again."); }
  }

  function jsonUrl() {
    try { const parsed = new URL(url); parsed.search = ""; parsed.hash = ""; parsed.pathname = parsed.pathname.replace(/\/$/, "") + ".json"; return parsed.toString(); } catch { return "https://www.reddit.com/"; }
  }

  function download() {
    const canvas = canvasRef.current; if (!canvas) return;
    const link = document.createElement("a"); link.download = `${story.subreddit || "reddit"}-story-${width}x${height}.png`; link.href = canvas.toDataURL("image/png"); link.click();
  }

  function toggleComment(comment: RedditComment) {
    const nextIds = selectedCommentIds.includes(comment.id) ? selectedCommentIds.filter((id) => id !== comment.id) : [...selectedCommentIds, comment.id];
    setSelectedCommentIds(nextIds);
    setStory(originalPost);
    setReplyContext(null);
    setStatus(`${nextIds.length} ${nextIds.length === 1 ? "comment" : "comments/replies"} selected. The original post stays at the top.`);
  }

  function resetCard() { setStory(starter); setOriginalPost(starter); setSelectedCommentIds([]); setReplyContext(null); }

  return <main>
    <header><div className="brand"><span className="brand-mark"><img src="/ginduyah-avatar.png" alt="Ginduyah"/></span><span>ginduyah</span></div><div className="header-actions"><div className={`theme-menu ${themeMenuOpen?"open":""}`}><button className="theme-trigger" onClick={()=>setThemeMenuOpen((open)=>!open)} aria-haspopup="listbox" aria-expanded={themeMenuOpen}><span className={rgbMode?"theme-dot rgb-dot":"theme-dot"} style={rgbMode?undefined:{background:accent.hex}}/><span>THEME</span><strong>{rgbMode?"RGB":accent.name}</strong><i>⌄</i></button>{themeMenuOpen&&<div className="theme-options" role="listbox" aria-label="Choose theme">{accentColors.map((color)=><button key={color.name} role="option" aria-selected={!rgbMode&&accent.name===color.name} className={!rgbMode&&accent.name===color.name?"selected":""} onClick={()=>{setRgbMode(false);setAccent(color);setThemeMenuOpen(false)}}><span className="theme-dot" style={{background:color.hex}}/><span>{color.name}</span><b>✓</b></button>)}<button role="option" aria-selected={rgbMode} className={rgbMode?"selected":""} onClick={()=>{setRgbMode(true);setThemeMenuOpen(false)}}><span className="theme-dot rgb-dot"/><span>RGB <small>Animated</small></span><b>✓</b></button></div>}</div><a className="youtube-link" href="https://youtube.com/@ginduyah/" target="_blank" rel="noreferrer" aria-label="Visit Ginduyah on YouTube"><span>▶</span> YouTube</a></div></header>
    <section className="intro"><p className="eyebrow">REDDIT → SHORT-FORM READY</p><h1>Turn any story into a<br/><em>scroll-stopping card.</em></h1><p className="lede">Paste a Reddit post, tune the canvas, and download a crisp PNG for Shorts, TikTok, or Reels.</p></section>
    <section className="workspace">
      <div className="controls">
        <div className="step"><span>01</span><h2>Bring in your story</h2></div>
        <label className="label" htmlFor="reddit-url">Reddit post URL</label>
        <div className="url-row"><input id="reddit-url" value={url} onChange={(e)=>setUrl(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&fetchPost()} placeholder="https://www.reddit.com/r/.../comments/..."/><a className="copy-json" href={jsonUrl()} target="_blank" rel="noreferrer" onClick={()=>setShowFallback(true)}>OPEN JSON</a><button className="fetch" onClick={fetchPost} disabled={loading}>{loading ? "Loading…" : "Fetch post"}</button></div>
        <p className="status">{status}</p>
        {showFallback && <div className="fallback"><strong>Quick fallback</strong><p>On the Reddit JSON page, copy everything, come back here, and paste it into the box.</p><a href={jsonUrl()} target="_blank" rel="noreferrer">Open Reddit JSON ↗</a><textarea aria-label="Reddit JSON" rows={5} value={redditJson} onChange={(e)=>setRedditJson(e.target.value)} placeholder="Paste the Reddit JSON here…"/><button onClick={importJson} disabled={!redditJson.trim()}>Import copied post</button></div>}
        <div className="divider"/>
        <div className="step"><span>02</span><h2>Fine-tune the copy</h2></div>
        <div className="two"><label>Subreddit<input value={story.subreddit} onChange={(e)=>update("subreddit", e.target.value)}/></label><label>Username<input value={story.author} onChange={(e)=>update("author", e.target.value)}/></label></div>
        <div className="profile-row"><label className="avatar-upload">Profile picture<input type="file" accept="image/*" onChange={(e)=>chooseAvatar(e.target.files?.[0])}/><span>{avatarImage ? "Replace image" : "Choose image"}</span></label>{avatarImage && <button onClick={()=>setAvatarImage(null)}>Remove</button>}</div>
        <label>Title<textarea rows={3} value={story.title} onChange={(e)=>update("title", e.target.value)}/></label>
        <label>Story<textarea rows={8} value={story.body} onChange={(e)=>update("body", e.target.value)}/></label>
        <div className="two"><label>Post score<input type="number" min="0" value={story.score} onChange={(e)=>update("score", Number(e.target.value))}/></label><label>Comments<input type="number" min="0" value={story.comments} onChange={(e)=>update("comments", Number(e.target.value))}/></label></div>
        <div className="optional-replies">
          <label className="check"><input type="checkbox" checked={includeReplies} onChange={(e)=>setIncludeReplies(e.target.checked)}/><span/> Add comments & replies <small>Optional</small></label>
          {includeReplies && <div className="reply-panel">
            <div className="profile-row reply-profile"><label className="avatar-upload">Reply profile picture<input type="file" accept="image/*" onChange={(e)=>chooseReplyAvatar(e.target.files?.[0])}/><span>{replyAvatarImage ? "Replace reply image" : "Choose reply image"}</span></label>{replyAvatarImage && <button onClick={()=>setReplyAvatarImage(null)}>Remove</button>}</div>
            <p>{redditComments.length ? "Pick as many comments and replies as you want. The original post title and story will stay above them." : "Paste the post’s Reddit JSON above to import its comments and nested replies."}</p>
            {selectedCommentIds.length > 0 && <div className="selected-summary"><strong>{selectedCommentIds.length} selected</strong><button onClick={()=>{setSelectedCommentIds([]);setStory(originalPost);setStatus("Comments cleared. The original post is still in the preview.");}}>Clear all</button></div>}
            {redditComments.map((comment) => <article className={`reply-item ${selectedCommentIds.includes(comment.id) ? "selected" : ""}`} key={comment.id} style={{ marginLeft: `${Math.min(comment.depth, 3) * 14}px` }}>
              <div><strong>u/{comment.author}</strong><span>{formatCount(comment.score)} points{comment.depth ? " · reply" : ""}</span></div>
              <p>{comment.body}</p><button onClick={()=>toggleComment(comment)}>{selectedCommentIds.includes(comment.id) ? "Remove from image" : "Add to image"}</button>
            </article>)}
          </div>}
        </div>
        <div className="divider"/>
        <div className="step"><span>03</span><h2>Set the canvas</h2></div>
        <div className="presets"><button className={preset==="short"?"active":""} onClick={()=>choosePreset("short")}>9:16 <small>1080 × 1920</small></button><button className={preset==="square"?"active":""} onClick={()=>choosePreset("square")}>1:1 <small>1080 × 1080</small></button><button className={preset==="landscape"?"active":""} onClick={()=>choosePreset("landscape")}>16:9 <small>1920 × 1080</small></button></div>
        <div className="two"><label>Width<input type="number" min="320" max="4096" value={width} onChange={(e)=>{setPreset("custom");setWidth(Number(e.target.value))}}/></label><label>Height<input type="number" min="320" max="4096" value={height} onChange={(e)=>{setPreset("custom");setHeight(Number(e.target.value))}}/></label></div>
        <div className="background-row"><label className="check"><input type="checkbox" checked={transparent} onChange={(e)=>setTransparent(e.target.checked)}/><span/> Transparent background</label><label className={transparent?"color disabled":"color"}>Solid color<input type="color" value={bg} disabled={transparent} onChange={(e)=>setBg(e.target.value)}/></label></div>
        <div className="theme-row"><span>Card appearance</span><div><button className={theme==="dark"?"active":""} onClick={()=>setTheme("dark")}>Dark</button><button className={theme==="light"?"active":""} onClick={()=>setTheme("light")}>Light</button></div></div>
      </div>
      <aside className="preview-panel"><div className="preview-top"><div><span>LIVE PREVIEW</span><strong>{width} × {height} PNG</strong></div><button onClick={resetCard}>Reset</button></div><div ref={canvasWrapRef} className={`canvas-wrap ${transparent?"checker":""}`}><canvas ref={canvasRef}/></div><button className="download" onClick={download}>Download PNG <span>↓</span></button><p className="tip">All story text is automatically resized to fit. Use 1080 × 1920 for Shorts.</p></aside>
    </section>
    <section className="channel-showcase" aria-labelledby="channel-showcase-title">
      <div className="channel-heading"><p className="eyebrow">USED BY STORYTELLERS</p><h2 id="channel-showcase-title">Channels creating with Ginduyah</h2></div>
      <div className="channel-marquee"><div className="channel-track">{[...channelCards,...channelCards,...channelCards].map((channel,index)=><a className="channel-card" href={channel.url} target="_blank" rel="noreferrer" key={`${channel.handle}-${index}`} aria-hidden={index>=channelCards.length?"true":undefined} tabIndex={index>=channelCards.length?-1:undefined}><img className="channel-avatar" src={channel.image} alt={index<channelCards.length?`${channel.name} profile picture`:""}/><span><strong>{channel.name}</strong><small>{channel.handle}</small><small className="channel-views">{channel.views}</small></span><b>▶</b></a>)}</div></div>
    </section>
    <footer><strong>Built for storytellers.</strong><span>Reddit content remains subject to its original author’s rights and Reddit’s terms.</span></footer>
  </main>;
}
