export type Candidate = { id: string; title: string; publishedAt: string; thumbnail?: string };
const words = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(x => x.length > 1);
export function matchVideo(candidates: Candidate[], title: string, dueDate: string) {
  const target = new Set(words(title));
  if (!target.size) return null;
  const ranked = candidates.map(video => {
    const tokens = new Set(words(video.title));
    const shared = [...target].filter(t => tokens.has(t)).length;
    const similarity = (2 * shared) / (target.size + tokens.size || 1);
    const days = Math.abs((Date.parse(video.publishedAt) - Date.parse(`${dueDate}T12:00:00Z`)) / 86400000);
    return { video, similarity, days, score: similarity - Math.min(days, 14) * .025 };
  }).filter(x => x.days <= 7 && x.similarity >= .68).sort((a,b) => b.score-a.score);
  if (!ranked.length || (ranked[1] && ranked[0].score - ranked[1].score < .13)) return null;
  return ranked[0].video;
}
