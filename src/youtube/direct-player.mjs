const nativeFetch = window.fetch.bind(window),
  cap = location.hash.slice(1),
  playerCache = new Map();
let engineReady;
window.fetch = async (input, init) => {
  const request = new Request(
    input instanceof Request ? input : new URL(input, location.href),
    init,
  );
  if (!request.url.startsWith("https://")) return nativeFetch(input, init);
  const headers = new Headers({
    Authorization: "Bearer " + cap,
    "X-Mei-Transport-Headers": JSON.stringify([...request.headers]),
  });
  const response = await nativeFetch(
    "/api/transport?url=" + encodeURIComponent(request.url),
    {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      signal: request.signal,
      credentials: "omit",
    },
  );
  Object.defineProperty(response, "url", { value: request.url });
  return response;
};
function helperFrame(id) {
  const frame = document.createElement("iframe");
  frame.id = id;
  frame.hidden = true;
  frame.sandbox = "allow-scripts";
  frame.src = "/engine-sandbox.html";
  frame.title = "Auxiliar de reprodução";
  frame.tabIndex = -1;
  document.body.append(frame);
  return frame;
}
async function generatePoToken(videoId, ...args) {
  const response = await nativeFetch("/api/playback-token", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cap,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ videoId, args }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      data.error || "Não foi possível preparar a sessão de reprodução.",
    );
  return data.token;
}
export async function getEngine() {
  if (!engineReady)
    engineReady = (async () => {
      window.ftElectron = {
        playerCacheGet: async (id) => playerCache.get(id),
        playerCacheSet: async (id, value) => {
          if (playerCache.size > 5) playerCache.clear();
          playerCache.set(id, value);
        },
        generatePoToken,
      };
      const signature = helperFrame("sigFrame");
      await new Promise((resolve, reject) => {
        signature.onload = resolve;
        signature.onerror = reject;
      });
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/engine/freetube-engine.js";
        script.onload = resolve;
        script.onerror = () =>
          reject(Error("Não foi possível carregar o motor de reprodução."));
        document.head.append(script);
      });
      if (!window.MeiFreeTube)
        throw Error("O motor de reprodução não inicializou.");
      window.MeiFreeTube.shaka.polyfill.installAll();
      return window.MeiFreeTube;
    })().catch((error) => {
      engineReady = null;
      throw error;
    });
  return engineReady;
}
function sabrManifest(info, mime) {
  const formats = info.streaming_data.adaptive_formats.map((e) => ({
    itag: e.itag,
    lastModified: e.last_modified_ms,
    mimeType: e.mime_type,
    xtags: e.xtags,
    bitrate: e.bitrate,
    initRange: e.init_range,
    indexRange: e.index_range,
    width: e.width,
    height: e.height,
    frameRate: e.fps,
    quality: e.quality,
    language: e.language,
    audioSampleRate: e.audio_sample_rate,
    audioChannels: e.audio_channels,
    isDrc: e.is_drc,
    isVoiceBoost: e.is_vb,
    isOriginal: e.is_original,
    isDubbed: e.is_dubbed,
    isAutoDubbed: e.is_auto_dubbed,
    isDescriptive: e.is_descriptive,
    isSecondary: e.is_secondary,
    spatialAudio: !!e.spatial_audio_type,
    label: e.audio_track?.display_name,
    colorTransferCharacteristics: e.color_info?.transfer_characteristics,
    colorPrimaries: e.color_info?.primaries,
  }));
  const durations = info.streaming_data.adaptive_formats
    .map((e) => e.approx_duration_ms)
    .filter(Number.isFinite);
  const manifest = {
    duration: durations.length
      ? Math.min(...durations) / 1000
      : info.basic_info.duration,
    formats,
    captions: [],
    chapters: [],
    storyboards: [],
  };
  return "data:" + mime + "," + encodeURIComponent(JSON.stringify(manifest));
}
export async function createDirectPlayer({
  container,
  videoId,
  volume = 70,
  onState = () => {},
  onError = () => {},
  onMetadata = () => {},
  onRecommendations = () => {},
  onDebug = () => {},
  signal,
}) {
  let video,
    shaka,
    sabr,
    destroyed = false,
    loading = false;
  const alive = () => {
    if (destroyed || signal?.aborted)
      throw new DOMException("Reprodução cancelada", "AbortError");
  };
  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    video?.pause();
    try {
      await shaka?.destroy();
    } finally {
      sabr?.cleanup();
      video?.remove();
    }
  };
  const adapter = {
    destroy,
    pauseVideo: () => video?.pause(),
    playVideo: () => video?.play().catch(() => onState(2)),
    seekTo: (time) => {
      if (video) video.currentTime = time;
    },
    setVolume: (value) => {
      if (video) video.volume = Math.max(0, Math.min(1, value / 100));
    },
    unMute: () => {
      if (video) video.muted = false;
    },
    getCurrentTime: () => video?.currentTime || 0,
    getDuration: () => (Number.isFinite(video?.duration) ? video.duration : 0),
    getVolume: () => Math.round((video?.volume ?? volume / 100) * 100),
    getPlaybackRate: () => video?.playbackRate || 1,
    getVideoElement: () => video,
  };
  try {
    const engine = await getEngine();
    alive();
    onState(3);
    onDebug({ stage: "extracting" });
    const data = await engine.getVideoInfo(videoId);
    alive();
    const info = data.info,
      status = info.playability_status;
    if (status?.status !== "OK")
      throw Error(
        status?.reason ||
          status?.error_screen?.reason?.text ||
          "Este vídeo não está disponível para reprodução.",
      );
    if (!info.streaming_data)
      throw Error("O YouTube não retornou mídia para este vídeo.");
    onMetadata({
      title: info.basic_info.title,
      channel: info.basic_info.author,
      duration: info.basic_info.duration,
    });
    try {
      onRecommendations(engine.getRelated(info));
    } catch {}
    video = document.createElement("video");
    video.className = "mei-direct-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "auto";
    video.volume = volume / 100;
    video.setAttribute("aria-label", "Vídeo do YouTube");
    container.replaceChildren(video);
    for (const [event, state] of [
      ["playing", 1],
      ["pause", 2],
      ["ended", 0],
      ["waiting", 3],
    ])
      video.addEventListener(event, () => {
        if (!destroyed && !(event === "pause" && video.ended)) onState(state);
      });
    video.addEventListener("volumechange", () => {
      if (!destroyed) onState(video.paused ? 2 : 1);
    });
    shaka = new engine.shaka.Player();
    await shaka.attach(video);
    alive();
    onDebug({ stage: "attached", video, shaka });
    shaka.configure({
      abr: { enabled: true, defaultBandwidthEstimate: 1_500_000 },
      streaming: {
        bufferingGoal: 20,
        rebufferingGoal: 2,
        retryParameters: { maxAttempts: 2, timeout: 30000 },
      },
      restrictions: { maxHeight: 1080 },
      preferredAudioLanguage: "pt-BR",
    });
    shaka.addEventListener("error", (event) => {
      if (
        !destroyed &&
        event.detail.severity === engine.shaka.util.Error.Severity.CRITICAL &&
        !loading
      )
        onError(Error(readableError(event.detail)));
    });
    const config =
      info.player_config?.media_common_config?.media_ustreamer_request_config;
    let manifest, mime;
    if (info.streaming_data.server_abr_streaming_url && config) {
      const url = new URL(info.streaming_data.server_abr_streaming_url);
      url.searchParams.set("alr", "yes");
      url.searchParams.set("cpn", info.cpn);
      sabr = engine.setupSabr(
        {
          url: url.href,
          poToken: data.poToken,
          ustreamerConfig: config.video_playback_ustreamer_config,
          clientInfo: data.clientInfo,
        },
        () => shaka,
        () => shaka.getManifest(),
        {
          get value() {
            return video.clientWidth || 640;
          },
        },
        {
          get value() {
            return video.clientHeight || 360;
          },
        },
      );
      sabr.onBackoffRequested((event) =>
        onDebug({ stage: "backoff", backoffMs: event.backoffMs, video, shaka }),
      );
      sabr.onReloadOnce(() => {
        if (!destroyed)
          onError(
            Error(
              "A sessão de reprodução expirou. Clique em tentar novamente.",
            ),
          );
      });
      mime = engine.manifestMime;
      manifest = sabrManifest(info, mime);
    } else if (info.streaming_data.hls_manifest_url) {
      manifest = info.streaming_data.hls_manifest_url;
      mime = "application/x-mpegurl";
    } else {
      manifest =
        "data:application/dash+xml;charset=UTF-8," +
        encodeURIComponent(
          await info.toDash({
            manifest_options: { include_thumbnails: false },
          }),
        );
      mime = "application/dash+xml";
    }
    alive();
    loading = true;
    onDebug({ stage: "loading", video, shaka });
    try {
      await shaka.load(manifest, 0, mime);
    } finally {
      loading = false;
    }
    alive();
    onDebug({ stage: "loaded", video, shaka });
    video.play().catch(() => {
      if (!destroyed) onState(2);
    });
    return adapter;
  } catch (error) {
    await destroy();
    throw error?.code && error?.data ? Error(readableError(error)) : error;
  }
}
function readableError(error) {
  if (error.code === 1001) {
    const status = error.data?.[1];
    if (status === 403)
      return "O YouTube recusou a reprodução (403). Tente novamente; a sessão ou o endereço de mídia pode ter expirado.";
    if (status === 429)
      return "O YouTube limitou as solicitações. Aguarde antes de tentar novamente.";
  }
  return (
    "Não foi possível reproduzir este vídeo" +
    (error.code ? " (player " + error.code + ")" : "") +
    ". Tente novamente ou abra no YouTube."
  );
}
