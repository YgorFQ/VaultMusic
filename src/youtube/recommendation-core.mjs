const validId = (id) => typeof id === "string" && /^[\w-]{11}$/.test(id);
const text = (value) =>
  typeof value === "string"
    ? value
    : typeof value?.simpleText === "string"
      ? value.simpleText
      : typeof value?.content === "string"
        ? value.content
        : Array.isArray(value?.runs)
          ? value.runs.map((x) => x.text || "").join("")
          : "";
const words = (value) =>
  text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu) || [];
const generic = new Set(
  "the and feat with from para uma com dos das official video music musica audio lyrics lyric remix remixes mix playlist channel canal youtube feat featuring original full version live nightcore".split(
    " ",
  ),
);
export const tasteWords = (value) => [
  ...new Set(words(value).filter((w) => !generic.has(w))),
];
const seconds = (value) =>
  typeof value === "number"
    ? value
    : /^\d+(?::\d+){1,2}$/.test(text(value))
      ? text(value)
          .split(":")
          .reduce((a, b) => a * 60 + Number(b), 0)
      : 0;
export function normaliseVideo(raw) {
  if (!raw) return null;
  const id = typeof raw.id === "string" ? raw.id : raw.videoId || raw.video_id;
  if (!validId(id)) return null;
  const sn = raw.snippet || {},
    title = text(sn.title || raw.title).slice(0, 300);
  if (!title) return null;
  const channel = text(
      sn.channelTitle || raw.channelTitle || raw.author?.name || raw.author,
    ).slice(0, 160),
    channelId =
      sn.channelId || raw.channelId || raw.authorId || raw.author?.id || "";
  const duration = seconds(
    raw.lengthSeconds || raw.duration?.seconds || raw.durationSeconds,
  );
  return {
    id,
    snippet: {
      title,
      channelTitle: channel,
      channelId: String(channelId).slice(0, 100),
      categoryId: sn.categoryId || "",
      tags: (sn.tags || []).filter((x) => typeof x === "string").slice(0, 30),
      thumbnails: {
        medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
      },
    },
    contentDetails: raw.contentDetails || {
      duration: duration ? `PT${Math.round(duration)}S` : "",
    },
    ...(raw.recommendation ? { recommendation: raw.recommendation } : {}),
  };
}
function browseId(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 9) return "";
  if (typeof value.browseId === "string" && value.browseId.startsWith("UC"))
    return value.browseId;
  for (const child of Object.values(value)) {
    const id = browseId(child, depth + 1);
    if (id) return id;
  }
  return "";
}
function renderVideo(node) {
  const v =
    node.compactVideoRenderer ||
    node.playlistPanelVideoRenderer ||
    node.videoRenderer;
  if (v) {
    if (v.isPlayable === false || v.upcomingEventData) return null;
    return normaliseVideo({
      id: v.videoId,
      title: text(v.title),
      channelTitle: text(v.longBylineText || v.shortBylineText || v.ownerText),
      channelId: browseId(v.longBylineText || v.shortBylineText || v.ownerText),
      lengthSeconds: seconds(v.lengthText),
    });
  }
  const lock = node.lockupViewModel;
  if (!lock || lock.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  const meta = lock.metadata?.lockupMetadataViewModel,
    rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  let duration = "";
  for (const overlay of lock.contentImage?.thumbnailViewModel?.overlays || [])
    for (const badge of overlay.thumbnailBottomOverlayViewModel?.badges || []) {
      const candidate = badge.thumbnailBadgeViewModel?.text;
      if (/^\d+(?::\d+){1,2}$/.test(candidate || "")) duration = candidate;
    }
  return normaliseVideo({
    id: lock.contentId,
    title: text(meta?.title),
    channelTitle: text(rows[0]?.metadataParts?.[0]?.text),
    channelId: browseId(meta?.image),
    lengthSeconds: seconds(duration),
  });
}
export function parseNextResponse(data, { mix = false, seedId } = {}) {
  const column =
    data?.contents?.twoColumnWatchNextResults ||
    data?.contents?.singleColumnWatchNextResults;
  const playlist = column?.playlist?.playlist;
  const root =
    mix && playlist?.contents?.length
      ? playlist.contents
      : column?.secondaryResults?.secondaryResults?.results ||
        column?.secondaryResults?.results ||
        [];
  const items = [],
    seen = new Set();
  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((x) => visit(x, depth + 1));
      return;
    }
    const item = renderVideo(node);
    if (item) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
      return;
    }
    for (const key of [
      "itemSectionRenderer",
      "contents",
      "results",
      "richItemRenderer",
      "content",
    ])
      if (node[key]) visit(node[key], depth + 1);
  }
  visit(root);
  return {
    items: mix ? items : items.filter((x) => x.id !== seedId),
    isRadio: !!(mix && playlist?.contents?.length),
    playlistId: playlist?.playlistId || null,
  };
}
function musicSignal(item) {
  return (
    item.snippet.categoryId === "10" ||
    /nightcore|synthwave|hands.?up|soundtrack|ost\b|\bmusic\b|\bmúsica\b|remix|bootleg|\blyrics\b|\blofi\b|\bphonk\b|\brock\b|\bpiano\b/i.test(
      item.snippet.title + " " + item.snippet.tags.join(" "),
    )
  );
}
export function buildTasteProfile({
  likes = [],
  history = [],
  topics = [],
  hidden = [],
  negative = [],
} = {}) {
  const blocked = new Set(hidden),
    seeds = new Map(),
    channels = new Map(),
    terms = new Map();
  function add(item, weight) {
    const channel = item.snippet.channelId || item.snippet.channelTitle;
    if (channel) channels.set(channel, (channels.get(channel) || 0) + weight);
    for (const term of tasteWords(
      item.snippet.title + " " + item.snippet.channelTitle,
    ))
      terms.set(term, (terms.get(term) || 0) + weight);
  }
  likes.forEach((raw, index) => {
    const item = normaliseVideo(raw);
    if (
      !item ||
      blocked.has(item.id) ||
      raw.status?.privacyStatus === "private"
    )
      return;
    const source = "liked",
      score = 100 + (musicSignal(item) ? 35 : 0) + 20 / (1 + index / 40);
    seeds.set(item.id, { ...item, source, score });
    add(item, 3);
  });
  history.forEach((entry, index) => {
    const item = normaliseVideo({
      id: entry.id,
      title: entry.title,
      channelTitle: entry.channelTitle,
      channelId: entry.channelId,
    });
    if (!item || blocked.has(item.id)) return;
    const listened = Number(entry.listenedSeconds) || 0,
      source = listened >= 30 ? "listened" : "history",
      score =
        (listened >= 30 ? 65 : 8) +
        (musicSignal(item) ? 20 : 0) +
        10 / (1 + index / 10);
    if (!seeds.has(item.id)) seeds.set(item.id, { ...item, source, score });
    if (listened >= 30) add(item, Math.min(3, 1 + listened / 600));
  });
  const all = [...seeds.values()].sort((a, b) => b.score - a.score),
    musical = all.filter((x) => x.source === "liked" && musicSignal(x)),
    sorted =
      musical.length >= 5
        ? all.filter((x) => musicSignal(x) || x.source === "listened")
        : all,
    selected = [],
    channelCounts = new Map();
  for (let cap = 1; selected.length < 100 && cap <= 100; cap++) {
    let changed = false;
    for (const item of sorted) {
      if (selected.includes(item)) continue;
      const key =
        item.snippet.channelId || item.snippet.channelTitle || item.id;
      if ((channelCounts.get(key) || 0) >= cap) continue;
      selected.push(item);
      channelCounts.set(key, (channelCounts.get(key) || 0) + 1);
      changed = true;
      if (selected.length >= 100) break;
    }
    if (!changed) break;
  }
  return {
    version: 2,
    seeds: selected,
    likedIds: likes
      .map((x) => (typeof x.id === "string" ? x.id : x.videoId))
      .filter(validId),
    likedCount: likes.length,
    musicLikedCount: likes.filter((x) => {
      const n = normaliseVideo(x);
      return n && musicSignal(n);
    }).length,
    historyCount: history.length,
    topics,
    hidden,
    negative,
    channels: [...channels],
    terms: [...terms].sort((a, b) => b[1] - a[1]).slice(0, 300),
  };
}
export function rankRecommendations(
  candidates,
  profile,
  { exclude = [], limit = 12 } = {},
) {
  const blocked = new Set([...(profile.hidden || []), ...exclude]),
    channels = new Map(profile.channels || []),
    terms = new Map(profile.terms || []),
    negativeChannels = new Map();
  for (const n of profile.negative || []) {
    const key = n.channelId || n.channelTitle;
    if (key) negativeChannels.set(key, (negativeChannels.get(key) || 0) + 1);
  }
  const explicit = new Set((profile.topics || []).flatMap(tasteWords)),
    unique = new Map();
  candidates.forEach((raw, index) => {
    const item = normaliseVideo(raw);
    if (!item || blocked.has(item.id)) return;
    const r = item.recommendation || {},
      key = item.snippet.channelId || item.snippet.channelTitle;
    let score =
      80 -
      (r.position ?? index) * 0.9 +
      (r.source === "liked" ? 20 : r.source === "listened" ? 12 : 0) +
      Math.min(18, Math.log2(1 + (channels.get(key) || 0)) * 4);
    for (const term of tasteWords(
      item.snippet.title + " " + item.snippet.channelTitle,
    ))
      score +=
        Math.min(4, Math.log2(1 + (terms.get(term) || 0))) +
        (explicit.has(term) ? 4 : 0);
    score -= Math.min(25, (negativeChannels.get(key) || 0) * 7);
    const previous = unique.get(item.id);
    if (previous) {
      if (score > previous.score)
        unique.set(item.id, { item, score: score + 3 });
      else previous.score += 3;
    } else unique.set(item.id, { item, score });
  });
  const sorted = [...unique.values()].sort((a, b) => b.score - a.score),
    result = [],
    counts = new Map();
  for (const cap of [3, Infinity])
    for (const { item } of sorted) {
      if (result.includes(item)) continue;
      const key =
        item.snippet.channelId || item.snippet.channelTitle || item.id;
      if ((counts.get(key) || 0) >= cap) continue;
      result.push(item);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (result.length >= limit) return result;
    }
  return result;
}
