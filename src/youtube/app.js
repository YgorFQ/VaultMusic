import { createDirectPlayer } from "./direct-player.mjs";
import { createRecommendations } from "./recommendations.mjs";
const $ = (s) => document.querySelector(s),
  cap = location.hash.slice(1);
let mode = "for-you",
  query = "",
  id = "",
  pageToken = "",
  plan = "",
  loading = false,
  autoPaused = false,
  epoch = 0,
  status = {},
  items = [],
  queue = [],
  playing = null,
  player = null,
  playEpoch = 0;
let viewHistory = [],
  toastTimer;
let youtubeOwns = false,
  lastPlayerState = -1,
  previousVideos = [],
  likedHere = false;
let playAbort,
  playbackTask = Promise.resolve();
const recommendations = createRecommendations({ api });
let autoplay = localStorage.getItem("mei-youtube-autoplay") === "on",
  advancing = false,
  nextCandidates = [],
  nextPreparing = null,
  nextError = "",
  radioSession = null,
  browsedMix = null,
  listenedSeconds = 0,
  lastListeningReport = 0,
  lastTick = performance.now();
const sessionPlayed = new Set();
let youtubeVolume = Math.max(
  0,
  Math.min(100, Number(localStorage.getItem("mei-youtube-volume") || 70)),
);
const hostOrigin = (() => {
  try {
    return new URL(document.referrer).origin;
  } catch {
    return "http://tauri.localhost";
  }
})();
function hostState() {
  const number = (fn, fallback) => {
    try {
      const n = player?.[fn]?.();
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    owned: !!playing && youtubeOwns,
    id: playing?.id,
    title: playing?.snippet?.title || "",
    channel: playing?.snippet?.channelTitle || "",
    playing: lastPlayerState === 1,
    currentTime: number("getCurrentTime", 0),
    duration: number("getDuration", 0),
    volume: number("getVolume", youtubeVolume),
    rate: number("getPlaybackRate", 1),
    canNext: queue.length > 0 || (autoplay && !!playing),
    canPrevious: previousVideos.length > 0,
    canLike: !!status.canWrite,
    liked: likedHere,
    discord: $("#discord-presence")?.checked !== false,
  };
}
function publishPlayback() {
  if (window.parent !== window)
    window.parent.postMessage(
      { type: "mei-youtube-state", state: hostState() },
      hostOrigin,
    );
}
function openFullYouTube() {
  if (window.parent !== window)
    window.parent.postMessage({ type: "mei-youtube-open" }, hostOrigin);
}
window.addEventListener("message", (event) => {
  if (
    window.parent === window ||
    event.source !== window.parent ||
    event.origin !== hostOrigin ||
    event.data?.type !== "mei-youtube-command"
  )
    return;
  const { action, value } = event.data;
  try {
    if (action === "presentation") {
      document.body.dataset.presentation =
        value === "compact" ? "compact" : "full";
      return;
    }
    if (action === "toggle") {
      if (lastPlayerState === 1) player?.pauseVideo?.();
      else {
        youtubeOwns = !!playing;
        player?.playVideo?.();
      }
    }
    if (action === "pause") player?.pauseVideo?.();
    if (action === "release") {
      youtubeOwns = false;
      player?.pauseVideo?.();
    }
    if (action === "seek" && Number.isFinite(value))
      player?.seekTo?.(
        Math.max(0, Math.min(player?.getDuration?.() || 0, value)),
        true,
      );
    if (action === "volume" && Number.isFinite(value)) {
      youtubeVolume = Math.max(0, Math.min(100, value));
      localStorage.setItem("mei-youtube-volume", youtubeVolume);
      player?.setVolume?.(youtubeVolume);
      if (youtubeVolume) player?.unMute?.();
    }
    if (action === "next") playNext();
    if (action === "previous") previousVideo();
    if (action === "like") $("#like").click();
    if (action === "queue") {
      openFullYouTube();
      updateQueue();
      $("#queue-dialog").showModal();
    }
    publishPlayback();
  } catch (error) {
    playerMessage(error.message);
  }
});
setInterval(() => {
  const now = performance.now();
  if (playing && lastPlayerState === 1)
    listenedSeconds += Math.min(3, (now - lastTick) / 1000);
  lastTick = now;
  if (listenedSeconds - lastListeningReport >= 30) flushListening();
  publishPlayback();
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && lastPlayerState === 1) player?.pauseVideo?.();
});
const names = {
  "for-you": "Para você",
  mixes: "Mixes",
  subscriptions: "Inscrições",
  playlists: "Playlists",
  liked: "Curtidas",
  history: "Histórico local",
  search: "Resultados",
  playlist: "Playlist",
  channel: "Vídeos do canal",
  mix: "Mix do YouTube",
};
async function api(route, body) {
  const r = await fetch("/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + cap,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Não foi possível completar a ação.");
  return data;
}
const notice = (message, error = false) => {
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
};
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 3200);
}
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
function button(text, action) {
  const b = el("button", text);
  b.type = "button";
  b.onclick = () =>
    Promise.resolve()
      .then(action)
      .catch((e) => notice(e.message));
  return b;
}
const playerCredits = el("a", "Sobre o player");
playerCredits.href = "/player-about.html";
playerCredits.target = "_blank";
playerCredits.rel = "noopener";
$("footer").append(" · ", playerCredits);
const autoplayButton = button("", () => setAutoplay(!autoplay));
autoplayButton.id = "autoplay";
autoplayButton.title =
  "Quando a fila terminar, continuar com o mix ou com vídeos relacionados aos seus gostos.";
$(".player-info .actions").append(autoplayButton);
autoplayButton.setAttribute("aria-label", "Reprodução automática");
const compactAuto = button("", () => setAutoplay(!autoplay));
compactAuto.id = "compact-autoplay";
compactAuto.title = "Alternar reprodução automática";
$(".compact-bar").insertBefore(compactAuto, $("#expand-player"));
compactAuto.setAttribute("aria-label", "Reprodução automática no miniplayer");
const nextUp = el("p");
nextUp.id = "next-up";
nextUp.setAttribute("role", "status");
$(".player-info").append(nextUp);
const syncTaste = button("Sincronizar curtidas", async () => {
  syncTaste.disabled = true;
  try {
    notice("Sincronizando suas curtidas…");
    await recommendations.profile({ refresh: true });
    await select(["for-you", "mixes"].includes(mode) ? mode : "for-you");
  } finally {
    syncTaste.disabled = false;
  }
});
syncTaste.id = "sync-taste";
$(".section-actions").append(syncTaste);
function eligibleRadio() {
  return (
    radioSession?.items
      ?.slice(radioSession.cursor || 0)
      .filter((x) => !sessionPlayed.has(x.id) && x.id !== playing?.id) || []
  );
}
function updateAutoplay() {
  for (const button of [autoplayButton, compactAuto]) {
    button.setAttribute("aria-pressed", String(autoplay));
    button.classList.toggle("is-active", autoplay);
  }
  autoplayButton.textContent = autoplay
    ? "Automático: ligado"
    : "Automático: desligado";
  compactAuto.textContent = autoplay ? "Auto ✓" : "Auto";
  const next =
    queue[0] || (autoplay && (eligibleRadio()[0] || nextCandidates[0]));
  nextUp.textContent = next
    ? "A seguir: " + next.snippet.title
    : autoplay && playing
      ? nextPreparing
        ? "Buscando o próximo vídeo…"
        : nextError || "O próximo vídeo será escolhido pelos seus gostos."
      : "Ative o automático para continuar quando a fila terminar.";
  $("#next").disabled = !queue.length && !(autoplay && playing);
  publishPlayback();
}
function setAutoplay(value) {
  autoplay = !!value;
  nextError = "";
  localStorage.setItem("mei-youtube-autoplay", autoplay ? "on" : "off");
  updateAutoplay();
  if (autoplay && playing) prepareNext();
}
function flushListening() {
  if (!playing || listenedSeconds < 15) return;
  lastListeningReport = listenedSeconds;
  api("listening", {
    id: playing.id,
    seconds: Math.round(listenedSeconds),
  })
    .then(() => recommendations.invalidateProfile())
    .catch(() => {});
}
async function prepareNext(version = playEpoch) {
  if (!autoplay || !playing || eligibleRadio().length) {
    updateAutoplay();
    return;
  }
  if (nextPreparing?.version === version) return nextPreparing.promise;
  const current = playing;
  nextError = "";
  const promise = recommendations
    .following(current, {
      exclude: [...sessionPlayed, ...queue.map((x) => x.id)],
    })
    .then((found) => {
      if (version === playEpoch) nextCandidates = found;
      return found;
    })
    .catch((error) => {
      if (version === playEpoch && autoplay) nextError = error.message;
      return [];
    })
    .finally(() => {
      if (nextPreparing?.version === version) nextPreparing = null;
      if (version === playEpoch) updateAutoplay();
    });
  nextPreparing = { version, promise };
  updateAutoplay();
  return promise;
}
async function playNext({ automatic = false, version = playEpoch } = {}) {
  if (advancing) return;
  if (automatic && !autoplay && !queue.length) return;
  advancing = true;
  try {
    let next = queue.shift(),
      queued = !!next;
    if (!next && autoplay && playing) {
      next = eligibleRadio()[0];
      if (!next) {
        await prepareNext(version);
        if (version !== playEpoch || (automatic && !autoplay)) return;
        next = queue.shift();
        queued = !!next;
        next ||= nextCandidates.find((x) => !sessionPlayed.has(x.id));
      }
    }
    if (version !== playEpoch) return;
    if (!next) {
      if (!automatic)
        toast(
          "Não há um próximo vídeo disponível. Adicione à fila ou ative o automático.",
        );
      return;
    }
    nextCandidates = nextCandidates.filter((x) => x.id !== next.id);
    updateQueue();
    await play(next, {
      mixContext: radioSession,
      advanceRadio: !queued,
      reveal: false,
    });
  } finally {
    advancing = false;
    updateAutoplay();
  }
}
function playCard(item) {
  return play(item, {
    mixContext:
      mode === "mix" && browsedMix ? { ...browsedMix, cursor: 0 } : null,
  });
}
async function refreshStatus() {
  status = await api("status");
  $("#account").textContent = status.linked
    ? "Conta vinculada ✓"
    : "Vincular conta";
  $("#account").classList.toggle("is-linked", status.linked);
  if (!$("#preferences-dialog").open)
    $("#topics").value = (status.topics || []).join(", ");
  $("#disconnect").disabled = !status.linked;
  $("#config-status").textContent = status.oauthConfigured
    ? "OAuth configurado neste computador."
    : "Nenhuma credencial OAuth configurada.";
  return status;
}
function removeSkeletons() {
  document.querySelectorAll(".skeleton").forEach((e) => e.remove());
}
function busy(value) {
  $("#grid").setAttribute("aria-busy", String(value));
  $("#refresh").disabled = value;
  $("#loading-more").hidden = !value || !items.length;
  if (value && !items.length) {
    for (let i = 0; i < 6; i++) {
      const box = el("div", undefined, "skeleton");
      box.setAttribute("aria-hidden", "true");
      box.append(
        el("div", undefined, "skeleton-thumb"),
        el("div", undefined, "skeleton-line"),
        el("div", undefined, "skeleton-line short"),
      );
      $("#grid").append(box);
    }
  }
  if (!value) removeSkeletons();
}
function updateSummary() {
  $("#result-count").textContent = items.length
    ? `${items.length} ${mode === "subscriptions" ? "canais" : mode === "mixes" ? "mixes" : mode === "playlists" ? "playlists" : "vídeos"} carregados`
    : "";
  $("#back").hidden = !viewHistory.length;
}
function empty(title, text, action, label) {
  removeSkeletons();
  const box = el("div", undefined, "empty");
  box.append(el("h3", title), el("p", text));
  if (action) box.append(button(label, action));
  $("#grid").append(box);
}
function updateQueue() {
  $("#queue-count").textContent = queue.length;
  $("#next").disabled = !queue.length && !(autoplay && playing);
  $("#play-queue").disabled = !queue.length;
  $("#clear-queue").disabled = !queue.length;
  const list = $("#queue-list");
  list.replaceChildren();
  if (!queue.length)
    list.append(
      el(
        "p",
        "Sua fila está vazia. Use “＋ Fila” nos vídeos para escolher os próximos.",
      ),
    );
  queue.forEach((item, index) => {
    const row = el("li"),
      name = button(item.snippet.title, () => {
        const [next] = queue.splice(index, 1);
        updateQueue();
        $("#queue-dialog").close();
        play(next);
      });
    name.className = "queue-label";
    name.title = item.snippet.title;
    const remove = button("Remover", () => {
      queue.splice(index, 1);
      updateQueue();
      toast("Vídeo removido da fila.");
    });
    remove.className = "queue-remove";
    remove.setAttribute("aria-label", "Remover da fila: " + item.snippet.title);
    row.append(name, remove);
    list.append(row);
  });
  document.querySelectorAll("[data-queue-id]").forEach((b) => {
    const queued = queue.some((x) => x.id === b.dataset.queueId);
    b.textContent = queued ? "Na fila ✓" : "＋ Fila";
    b.classList.toggle("queued", queued);
    b.setAttribute("aria-pressed", String(queued));
  });
  updateAutoplay();
}
function addQueue(item) {
  if (queue.some((x) => x.id === item.id)) {
    toast("Este vídeo já está na fila.");
    return;
  }
  queue.push(item);
  updateQueue();
  toast(`Adicionado à fila · ${queue.length} vídeo(s).`);
}
function previousVideo() {
  if (previousVideos.length) {
    const previous = previousVideos.pop();
    play(previous, { remember: false });
  } else player?.seekTo?.(0, true);
}
function duration(value) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(value || "");
  if (!m) return "";
  const total =
      Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0),
    h = Math.floor(total / 3600),
    min = Math.floor(total / 60) % 60,
    sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(min).padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}
function card(item) {
  const sn = item.snippet || {},
    video =
      typeof item.id === "string" &&
      !["subscriptions", "playlists", "mixes"].includes(mode),
    playlist = ["mixes", "playlists"].includes(mode),
    channel = mode === "subscriptions";
  const vid = video ? item.id : null,
    pid = playlist ? item.id.playlistId || item.id : null,
    cid = channel ? sn.resourceId.channelId : null;
  const c = el("article", undefined, "card");
  if (vid) c.dataset.videoId = vid;
  const thumb = button("", () =>
    vid
      ? playCard(item)
      : item.kind === "mix"
        ? select("mix", item.seedId)
        : select(pid ? "playlist" : "channel", pid || cid),
  );
  thumb.className = "thumb";
  thumb.setAttribute("aria-label", sn.title || "Abrir");
  const image = el("img");
  image.alt = "";
  image.loading = "lazy";
  image.referrerPolicy = "strict-origin-when-cross-origin";
  const src = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url;
  if (
    src &&
    /^https:\/\/(?:i\.ytimg\.com|yt3\.ggpht\.com|yt3\.googleusercontent\.com)\//.test(
      src,
    )
  )
    image.src = src;
  thumb.append(image);
  const badge =
    duration(item.contentDetails?.duration) ||
    (item.kind === "mix" ? "Mix" : playlist ? "Playlist" : "");
  if (badge) thumb.append(el("span", badge, "duration"));
  c.append(
    thumb,
    el("h3", sn.title || "Sem título"),
    el("p", sn.channelTitle || ""),
  );
  if (item.playback?.kind === "external")
    c.append(el("p", "Reprodução no YouTube oficial", "external-label"));
  if (item.recommendation) {
    const why = el(
      "p",
      (item.recommendation.source === "liked"
        ? "Porque você curtiu: "
        : "Relacionado ao que você ouviu: ") + item.recommendation.seedTitle,
      "recommendation-reason",
    );
    why.title = why.textContent;
    c.append(why);
  }
  const actions = el("div", undefined, "actions");
  if (vid) {
    const add = button("＋ Fila", () => addQueue(item));
    add.dataset.queueId = vid;
    actions.append(
      add,
      button("Menos disso", async () => {
        await api("hide", {
          id: vid,
          channelTitle: sn.channelTitle,
          channelId: sn.channelId,
        });
        recommendations.invalidateProfile();
        nextCandidates = nextCandidates.filter((x) => x.id !== vid);
        updateAutoplay();
        c.remove();
        items = items.filter((x) => x.id !== vid);
        updateSummary();
        toast("Vídeo removido das próximas sugestões.");
      }),
    );
    const titleButton = button(sn.title || "Sem título", () => playCard(item));
    c.querySelector("h3").replaceChildren(titleButton);
  }
  if (pid)
    actions.append(
      button("Abrir original ↗", () =>
        api("open", {
          playlist: pid,
          ...(item.kind === "mix" ? { id: item.seedId } : {}),
        }),
      ),
    );
  c.append(actions);
  return c;
}
function sectionMeta() {
  $("#section-title").textContent = names[mode] || "YouTube";
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.mode === mode ? "page" : "false",
      ),
    );
  $("#description").textContent =
    mode === "mixes"
      ? "Rádios do YouTube iniciadas pelas músicas que você curtiu ou ouviu. Não são os mixes privados da sua conta."
      : mode === "history"
        ? "Vídeos reproduzidos aqui, guardados neste computador."
        : mode === "search"
          ? `Resultados para “${query}”`
          : mode === "for-you"
            ? "Sugestões relacionadas aos seus vídeos curtidos e ao que você realmente ouviu aqui."
            : mode === "mix"
              ? "Faixas da rádio deste vídeo no YouTube. Ative o automático para continuar tocando."
              : "Seleções do Mei Music com vídeos do YouTube.";
  syncTaste.hidden = !["for-you", "mixes"].includes(mode);
  updateSummary();
}
async function select(nextMode, nextId = "", options = {}) {
  if (!options.keepHistory) {
    if (
      ["playlist", "channel", "search", "mix"].includes(nextMode) &&
      items.length
    )
      viewHistory.push({
        mode,
        id,
        query,
        pageToken,
        plan,
        items: [...items],
        y: scrollY,
        description: $("#notice").textContent,
        browsedMix,
      });
    else viewHistory = [];
  }
  mode = nextMode;
  id = nextId;
  browsedMix = null;
  if (options.query !== undefined) query = options.query;
  epoch++;
  loading = false;
  autoPaused = false;
  pageToken = "";
  plan = "";
  items = [];
  $("#grid").replaceChildren();
  sectionMeta();
  window.scrollTo({ top: 0, behavior: "instant" });
  await load();
}
function goBack() {
  const previous = viewHistory.pop();
  if (!previous) return;
  epoch++;
  loading = false;
  autoPaused = false;
  ({ mode, id, query, pageToken, plan, items, browsedMix } = previous);
  busy(false);
  $("#grid").replaceChildren(...items.map(card));
  $("#query").value = query;
  syncSearch();
  sectionMeta();
  updateQueue();
  notice(previous.description);
  $("#more").hidden = !pageToken;
  requestAnimationFrame(() =>
    window.scrollTo({ top: previous.y, behavior: "instant" }),
  );
}
async function load() {
  if (loading) return;
  const version = epoch;
  loading = true;
  $("#more").hidden = true;
  busy(true);
  notice("");
  try {
    await refreshStatus();
    if (version !== epoch) return;
    if (mode === "history") {
      items = status.configured
        ? (await api("feed?mode=history")).items
        : (status.history || []).map((x) => ({
            id: x.id,
            snippet: {
              title: x.title,
              channelTitle: x.channelTitle,
              thumbnails: {
                medium: { url: `https://i.ytimg.com/vi/${x.id}/mqdefault.jpg` },
              },
            },
          }));
      if (version !== epoch) return;
      $("#grid").replaceChildren(...items.map(card));
      if (!items.length)
        empty(
          "Seu histórico começa aqui",
          "Os vídeos aparecem depois que a reprodução começar. Vídeos não retornados pelo YouTube são omitidos.",
        );
      notice("");
      return;
    }
    if (!status.configured) {
      empty(
        "Vamos conectar seu YouTube",
        "Configure o acesso para buscar vídeos, mixes e playlists. Você pode escolher seus gostos desde já.",
        () => $("#settings-dialog").showModal(),
        "Configurar conexão",
      );
      notice("");
      return;
    }
    if (
      ["subscriptions", "playlists", "liked"].includes(mode) &&
      !status.linked
    ) {
      empty(
        "Vincule sua conta",
        "Entre pela página oficial do Google para acessar esta seção.",
        () => $("#settings-dialog").showModal(),
        "Vincular conta",
      );
      notice("");
      return;
    }
    const params = new URLSearchParams({ mode, q: query, id, pageToken, plan });
    let data;
    if (["for-you", "mixes"].includes(mode))
      data = await recommendations.feed({ mode, pageToken, plan });
    else if (mode === "mix") {
      const radio = await recommendations.radio(id);
      if (version !== epoch) return;
      browsedMix = { seedId: id, items: radio.items };
      data = {
        items: radio.items,
        reason: "Mix do YouTube iniciado por um vídeo do seu perfil",
      };
    } else data = await api("feed?" + params);
    if (version !== epoch) return;
    pageToken = data.nextPageToken || "";
    plan = data.plan || "";
    if (data.needsPreferences) {
      empty(
        "Uma seleção com a sua cara",
        "Vincule a conta para usar suas curtidas ou escolha artistas e estilos. O que você ouvir aqui também ajuda.",
        () => $("#preferences-dialog").showModal(),
        "Escolher meus gostos",
      );
      notice("");
      return;
    }
    const known = new Set(items.map((x) => JSON.stringify(x.id))),
      fresh = (data.items || []).filter(
        (x) => !known.has(JSON.stringify(x.id)),
      );
    items.push(...fresh);
    $("#grid").append(...fresh.map(card));
    if (!items.length)
      empty(
        "Nenhum resultado por aqui",
        "Experimente outra pesquisa ou ajuste seus gostos.",
      );
    notice(data.reason ? "Seleção a partir de: " + data.reason : "");
    $("#more").hidden = !pageToken;
  } catch (e) {
    if (version === epoch) {
      autoPaused = true;
      notice(e.message, true);
      $("#more").hidden = false;
      $("#more").textContent = "Tentar novamente";
    }
  } finally {
    if (version === epoch) {
      loading = false;
      busy(false);
      updateSummary();
      updateQueue();
    }
  }
}
function resetPlayer() {
  playAbort?.abort();
  const previous = player;
  player = null;
  if (previous)
    playbackTask = playbackTask.catch(() => {}).then(() => previous.destroy());
  const slot = el("div");
  slot.id = "player";
  $("#player-host").replaceChildren(slot);
}
function playerMessage(message) {
  $("#player-error").textContent = message;
  $("#player-error").hidden = !message;
}
async function play(
  item,
  {
    remember = true,
    mixContext = null,
    advanceRadio = true,
    reveal = true,
  } = {},
) {
  flushListening();
  listenedSeconds = 0;
  lastListeningReport = 0;
  lastTick = performance.now();
  nextCandidates = [];
  nextError = "";
  radioSession = mixContext;
  if (radioSession && advanceRadio) {
    const index = radioSession.items.findIndex((track) => track.id === item.id);
    if (index >= 0) radioSession.cursor = index + 1;
  }
  const version = ++playEpoch;
  sessionPlayed.add(item.id);
  if (sessionPlayed.size > 160)
    sessionPlayed.delete(sessionPlayed.values().next().value);
  if (remember && playing && playing.id !== item.id)
    previousVideos.push(playing);
  playing = item;
  youtubeOwns = true;
  lastPlayerState = -1;
  likedHere = false;
  resetPlayer();
  playAbort = new AbortController();
  const signal = playAbort.signal;
  playerMessage("Preparando reprodução…");
  $("#watch").hidden = false;
  $("#playing-title").textContent = item.snippet.title;
  $("#playing-channel").textContent = item.snippet.channelTitle || "";
  $("#like").textContent = "Curtir na conta";
  if (reveal)
    $("#watch").scrollIntoView({ behavior: motion(), block: "start" });
  recommendations
    .profile()
    .then((p) => {
      if (version !== playEpoch) return;
      likedHere = p.likedIds.includes(item.id);
      $("#like").textContent = likedHere ? "Curtido ✓" : "Curtir na conta";
      publishPlayback();
    })
    .catch(() => {});
  updateAutoplay();
  publishPlayback();
  try {
    const check = await api("video?id=" + encodeURIComponent(item.id));
    if (version !== playEpoch) return;
    if (["external", "unavailable"].includes(check.playback.kind)) {
      playerMessage(check.playback.message);
      if (check.playback.kind === "unavailable")
        document
          .querySelectorAll(`[data-video-id="${item.id}"]`)
          .forEach((c) => c.remove());
      return;
    }
    let recorded = false;
    playbackTask = playbackTask
      .catch(() => {})
      .then(async () => {
        if (version !== playEpoch) return;
        return createDirectPlayer({
          container: $("#player"),
          videoId: item.id,
          volume: youtubeVolume,
          signal,
          onState: (state) => {
            if (version !== playEpoch) return;
            lastPlayerState = state;
            if (state === 1) {
              youtubeOwns = true;
              playerMessage("");
              if (!recorded) {
                recorded = true;
                api("played", {
                  id: item.id,
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  channelId: item.snippet.channelId,
                }).catch((err) => notice(err.message));
              }
            }
            publishPlayback();
            if (state === 0) {
              flushListening();
              if (queue.length || autoplay)
                playNext({ automatic: true, version });
            }
          },
          onError: (error) => {
            if (version !== playEpoch) return;
            lastPlayerState = -1;
            publishPlayback();
            playerMessage(error.message);
          },
          onMetadata: (metadata) => {
            if (version !== playEpoch) return;
            if (metadata.title) item.snippet.title = metadata.title;
            if (metadata.channel) item.snippet.channelTitle = metadata.channel;
            $("#playing-title").textContent = item.snippet.title;
            $("#playing-channel").textContent = item.snippet.channelTitle || "";
            publishPlayback();
          },
          onRecommendations: (related) => {
            if (version !== playEpoch) return;
            recommendations.remember(item.id, related);
            if (autoplay) prepareNext(version);
          },
        });
      });
    const created = await playbackTask;
    if (version !== playEpoch) {
      await created?.destroy();
      return;
    }
    player = created;
    if (autoplay) prepareNext(version);
    publishPlayback();
  } catch (error) {
    if (version === playEpoch && error.name !== "AbortError") {
      lastPlayerState = -1;
      publishPlayback();
      playerMessage(error.message);
    }
  }
}
function syncSearch() {
  $("#clear-search").hidden = !$("#query").value;
}
$("#query").oninput = syncSearch;
$("#clear-search").onclick = () => {
  $("#query").value = "";
  syncSearch();
  $("#query").focus();
};
$("#search").onsubmit = async (e) => {
  e.preventDefault();
  const q = $("#query").value.trim();
  if (!q) return;
  let videoId;
  try {
    const u = new URL(q);
    if (
      u.protocol === "https:" &&
      [
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
      ].includes(u.hostname)
    )
      videoId =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/)?.[1];
  } catch {}
  if (/^[\w-]{11}$/.test(videoId || "")) {
    try {
      const data = await api("video?id=" + encodeURIComponent(videoId));
      if (!data.item) throw Error(data.playback.message);
      await play(data.item);
    } catch (error) {
      notice(error.message, true);
    }
  } else select("search", "", { query: q });
};
document
  .querySelectorAll("[data-mode]")
  .forEach((b) => (b.onclick = () => select(b.dataset.mode)));
$("#more").onclick = () => {
  autoPaused = false;
  $("#more").textContent = "Carregar mais";
  load();
};
$("#refresh").onclick = () => select(mode, id, { keepHistory: true });
$("#back").onclick = goBack;
$("#queue-button").onclick = () => {
  updateQueue();
  $("#queue-dialog").showModal();
};
$("#clear-queue").onclick = () => {
  queue = [];
  updateQueue();
  toast("Fila limpa.");
};
$("#play-queue").onclick = () => {
  $("#queue-dialog").close();
  playNext();
};
const motion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
$(".skip-link").onclick = (e) => {
  e.preventDefault();
  $("#section-title").focus({ preventScroll: true });
  $("#section-title").scrollIntoView({ behavior: motion(), block: "start" });
};
$("#to-top").onclick = () => window.scrollTo({ top: 0, behavior: motion() });
const topbar = $(".topbar");
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--header-height",
    topbar.offsetHeight + "px",
  ),
).observe(topbar);
window.addEventListener(
  "scroll",
  () => {
    topbar.classList.toggle("is-scrolled", scrollY > 8);
    $("#to-top").hidden = scrollY < 500;
  },
  { passive: true },
);
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !e.target.closest('input,textarea,[contenteditable="true"]') &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    $("#query").focus();
  }
});
new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting && pageToken && !loading && !autoPaused)
      load();
  },
  { rootMargin: "250px" },
).observe($("#sentinel"));
$("#settings").onclick = $("#account").onclick = () =>
  $("#settings-dialog").showModal();
$("#preferences").onclick = () => $("#preferences-dialog").showModal();
$("#official").onclick = () =>
  api("open", { page: "home" }).catch((e) => notice(e.message));
$("#config-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const body = {};
    if ($("#api-key").value.trim()) body.apiKey = $("#api-key").value.trim();
    const file = $("#oauth-file").files[0];
    if (file) {
      if (file.size > 100000)
        throw Error("Arquivo de credenciais muito grande.");
      body.oauth = JSON.parse(await file.text());
    }
    await api("settings", body);
    $("#api-key").value = "";
    $("#oauth-file").value = "";
    await refreshStatus();
    $("#config-status").textContent =
      "Configuração salva. Você já pode vincular sua conta.";
    await select(mode, id);
  } catch (err) {
    $("#config-status").textContent = err.message;
  }
};
$("#connect").onclick = async () => {
  try {
    await api("login", { write: $("#write-access").checked });
    $("#config-status").textContent =
      "Conclua o login no navegador. Esta tela será atualizada ao voltar.";
  } catch (e) {
    $("#config-status").textContent = e.message;
  }
};
$("#disconnect").onclick = async () => {
  try {
    await api("logout", {});
    recommendations.invalidateProfile();
    await refreshStatus();
    await select(mode, id);
  } catch (e) {
    $("#config-status").textContent = e.message;
  }
};
$("#preferences-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("preferences", { topics: $("#topics").value.split(",") });
    recommendations.invalidateProfile();
    $("#preferences-dialog").close();
    await select(mode, id);
  } catch (err) {
    notice(err.message);
  }
};
$("#like").onclick = async () => {
  if (!playing) return;
  try {
    await api("rate", { id: playing.id, like: !likedHere });
    likedHere = !likedHere;
    recommendations.invalidateProfile();
    $("#like").textContent = likedHere ? "Curtido ✓" : "Curtir na conta";
    publishPlayback();
    toast(
      likedHere
        ? "Curtida registrada na sua conta do YouTube."
        : "Curtida removida da sua conta do YouTube.",
    );
  } catch (e) {
    notice(e.message);
  }
};
$("#retry-player").onclick = () =>
  playing && play(playing, { mixContext: radioSession });
$("#next").onclick = () => playNext();
$("#open-video").onclick = () =>
  playing && api("open", { id: playing.id }).catch((e) => notice(e.message));
$("#close-player").onclick = () => {
  flushListening();
  nextCandidates = [];
  radioSession = null;
  playEpoch++;
  resetPlayer();
  playing = null;
  youtubeOwns = false;
  lastPlayerState = -1;
  playerMessage("");
  $("#watch").hidden = true;
  publishPlayback();
  updateAutoplay();
};
$("#expand-player").onclick = openFullYouTube;
$("#compact-toggle").onclick = () => {
  if (lastPlayerState === 1) player?.pauseVideo?.();
  else player?.playVideo?.();
};
$("#discord-presence").checked =
  localStorage.getItem("mei-youtube-discord") !== "off";
$("#discord-presence").onchange = () => {
  localStorage.setItem(
    "mei-youtube-discord",
    $("#discord-presence").checked ? "on" : "off",
  );
  publishPlayback();
};
window.addEventListener("focus", async () => {
  try {
    const was = status.linked;
    await refreshStatus();
    if (!was && status.linked) {
      recommendations.invalidateProfile();
      $("#settings-dialog").close();
      await select(mode, id);
    }
  } catch {}
});
updateQueue();
if (!/^[a-f0-9]{64}$/.test(cap))
  notice("Abra esta tela pelo iniciador do Mei Music.");
else select("for-you");
