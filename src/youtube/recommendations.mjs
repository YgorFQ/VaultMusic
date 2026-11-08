import { getEngine } from "./direct-player.mjs";
import {
  normaliseVideo,
  parseNextResponse,
  rankRecommendations,
} from "./recommendation-core.mjs";
const hash = (text) => {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
};
export function createRecommendations({ api, engine = getEngine } = {}) {
  let profilePromise,
    profileAt = 0;
  const nextCache = new Map(),
    plans = new Map();
  async function profile({ refresh = false } = {}) {
    if (refresh || Date.now() - profileAt > 300000) {
      profilePromise = null;
      profileAt = Date.now();
    }
    if (!profilePromise)
      profilePromise = api(
        "taste-profile" + (refresh ? "?refresh=1" : ""),
      ).catch((error) => {
        profilePromise = null;
        throw error;
      });
    return profilePromise;
  }
  async function next(seedId, mix = false) {
    const key = (mix ? "mix:" : "related:") + seedId;
    let entry = nextCache.get(key);
    if (!entry || entry.until < Date.now()) {
      const promise = engine()
        .then((e) => e.readNext(seedId, mix))
        .then((data) => parseNextResponse(data, { mix, seedId }))
        .catch((error) => {
          nextCache.delete(key);
          throw error;
        });
      entry = { promise, until: Date.now() + 1800000 };
      if (nextCache.size >= 120)
        nextCache.delete(nextCache.keys().next().value);
      nextCache.set(key, entry);
    }
    return entry.promise;
  }
  function remember(seedId, items) {
    const clean = items
      .map(normaliseVideo)
      .filter(Boolean)
      .filter((x) => x.id !== seedId);
    if (clean.length)
      nextCache.set("related:" + seedId, {
        until: Date.now() + 1800000,
        promise: Promise.resolve({ items: clean, isRadio: false }),
      });
  }
  async function feed({
    mode,
    pageToken = "",
    plan = "",
    refresh = false,
  } = {}) {
    const p = await profile({ refresh });
    let state = plans.get(plan);
    if (!state) {
      const salt = crypto.randomUUID();
      const seeds = [...p.seeds].sort(
        (a, b) => hash(salt + a.id) / a.score - hash(salt + b.id) / b.score,
      );
      state = { id: crypto.randomUUID(), seeds, seen: new Set(), offset: 0 };
      plans.set(state.id, state);
      if (plans.size > 12) plans.delete(plans.keys().next().value);
    }
    if (!state.seeds.length) {
      if (p.topics?.length && mode === "for-you") {
        const data = await api(
          "feed?" +
            new URLSearchParams({ mode: "search", q: p.topics[0], pageToken }),
        );
        return { ...data, reason: "o gosto que você informou: " + p.topics[0] };
      }
      return {
        items: [],
        needsPreferences: true,
        profileSummary: { likedCount: p.likedCount },
      };
    }
    if (mode === "mixes") {
      let offset = Number(pageToken) || 0,
        scanned = 0;
      const chosen = [];
      while (
        chosen.length < 12 &&
        offset < state.seeds.length &&
        scanned < 24
      ) {
        const batch = state.seeds.slice(
          offset,
          offset + Math.min(4, 12 - chosen.length),
        );
        offset += batch.length;
        scanned += batch.length;
        const radios = await Promise.allSettled(
          batch.map((seed) => next(seed.id, true)),
        );
        radios.forEach((result, index) => {
          if (
            result.status === "fulfilled" &&
            result.value.isRadio &&
            result.value.items.filter((x) => !p.hidden.includes(x.id)).length >
              1
          )
            chosen.push(batch[index]);
        });
      }
      if (!chosen.length)
        throw Error(
          "O YouTube não retornou mixes disponíveis nesta seleção. Atualize para tentar outras músicas.",
        );
      return {
        items: chosen.map((seed) => ({
          id: "RD" + seed.id,
          kind: "mix",
          seedId: seed.id,
          seed,
          source: seed.source,
          snippet: {
            ...seed.snippet,
            title: "Mix · " + seed.snippet.title,
            channelTitle:
              seed.source === "liked"
                ? "A partir de uma curtida sua"
                : seed.source === "listened"
                  ? "A partir do que você ouviu"
                  : "A partir de uma reprodução sua",
          },
        })),
        nextPageToken: offset < state.seeds.length ? String(offset) : "",
        plan: state.id,
        reason:
          "rádios do YouTube iniciadas pelos seus vídeos — não playlists buscadas por nome de canal",
        profileSummary: {
          likedCount: p.likedCount,
          musicLikedCount: p.musicLikedCount,
        },
      };
    }
    let candidates = [],
      failed = 0;
    for (
      let batch = 0;
      batch < 2 && candidates.length < 12 && state.offset < state.seeds.length;
      batch++
    ) {
      const seeds = state.seeds.slice(state.offset, state.offset + 3);
      state.offset += seeds.length;
      const responses = await Promise.allSettled(
        seeds.map(async (seed) => {
          const data = await next(seed.id);
          return data.items.map((item, position) => ({
            ...item,
            recommendation: {
              seedId: seed.id,
              seedTitle: seed.snippet.title,
              source: seed.source,
              position,
            },
          }));
        }),
      );
      responses.forEach((result) =>
        result.status === "fulfilled"
          ? candidates.push(...result.value)
          : failed++,
      );
      candidates = candidates.filter(
        (x) =>
          !state.seen.has(x.id) &&
          !p.likedIds.includes(x.id) &&
          !p.hidden.includes(x.id),
      );
    }
    const items = rankRecommendations(candidates, p, {
      exclude: [...state.seen, ...p.likedIds],
      limit: 12,
    });
    items.forEach((x) => state.seen.add(x.id));
    if (!items.length && failed)
      throw Error(
        "O YouTube não retornou sugestões agora. Tente atualizar esta seleção.",
      );
    return {
      items,
      plan: state.id,
      nextPageToken:
        items.length && state.offset < state.seeds.length
          ? String(state.offset)
          : "",
      reason: `vídeos relacionados às suas curtidas e músicas ouvidas · ${p.likedCount} curtidas consideradas`,
      profileSummary: {
        likedCount: p.likedCount,
        musicLikedCount: p.musicLikedCount,
      },
    };
  }
  async function radio(seedId) {
    const p = await profile(),
      data = await next(seedId, true);
    if (!data.items.length || !data.isRadio)
      throw Error("Este vídeo não retornou um mix agora. Escolha outro mix.");
    return {
      ...data,
      items: data.items.filter((x) => !p.hidden.includes(x.id)),
    };
  }
  async function following(current, { exclude = [] } = {}) {
    const p = await profile(),
      data = await next(current.id);
    return rankRecommendations(
      data.items.map((item, position) => ({
        ...item,
        recommendation: {
          seedId: current.id,
          seedTitle: current.snippet.title,
          source: "listened",
          position,
        },
      })),
      p,
      { exclude: [current.id, ...exclude], limit: 12 },
    );
  }
  return {
    profile,
    feed,
    radio,
    following,
    remember,
    invalidateProfile: () => {
      profilePromise = null;
      profileAt = 0;
    },
  };
}
