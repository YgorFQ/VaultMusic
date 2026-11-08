import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { transportRequest } from "./direct-transport.mjs";
import { playbackFetch, playbackToken } from "./playback-host-client.mjs";
import { buildTasteProfile, normaliseVideo } from "./recommendation-core.mjs";
const run = promisify(execFile);
import { dataDir as defaultData } from './runtime.mjs';
const jsonRead = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const atomic = (file, value) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value));
  fs.renameSync(file + ".tmp", file);
};
function protect(value, decrypt = false) {
  return new Promise((resolve, reject) => {
    const operation = decrypt ? "Unprotect" : "Protect";
    const script = `Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=${decrypt ? "[Convert]::FromBase64String($s)" : "[Text.Encoding]::UTF8.GetBytes($s)"}; $v=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write(${decrypt ? "[Text.Encoding]::UTF8.GetString($v)" : "[Convert]::ToBase64String($v)"});`;
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) =>
        err
          ? reject(
              Error("Não foi possível proteger os dados da conta no Windows."),
            )
          : resolve(stdout.trim()),
    );
    child.stdin.end(value);
  });
}
export function playbackInfo(video) {
  if (!video)
    return {
      kind: "unavailable",
      reason: "not-returned",
      message:
        "Este vídeo foi removido, está privado ou não está disponível para esta consulta.",
    };
  if (video.status?.privacyStatus === "private")
    return {
      kind: "external",
      reason: "private",
      message:
        "Este vídeo é privado. Abra no YouTube com uma conta que tenha acesso.",
    };
  if (video.contentDetails?.contentRating?.ytRating === "ytAgeRestricted")
    return {
      kind: "external",
      reason: "age-restricted",
      message:
        "Este vídeo exige verificação de idade no YouTube oficial. O login da integração não conecta a conta ao player.",
    };
  return {
    kind: "direct",
    reason: "public-video",
    message:
      "Reprodução pelo motor local. A disponibilidade será confirmada ao carregar a mídia.",
  };
}
export async function createBridge({
  config,
  dataDir = defaultData,
  fetchImpl = fetch,
  openBrowser = true,
  browserOpener,
} = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const settingsFile = path.join(dataDir, "settings.dpapi"),
    tokensFile = path.join(dataDir, "account.dpapi"),
    prefsFile = path.join(dataDir, "preferences.json");
  const load = async (file) =>
    fs.existsSync(file)
      ? JSON.parse(await protect(fs.readFileSync(file, "utf8"), true))
      : {};
  let settings = await load(settingsFile),
    tokens = await load(tokensFile),
    prefs = jsonRead(prefsFile, { topics: [], history: [], hidden: [] }),
    pending = null,
    refreshing = null;
  const cache = new Map();
  const tasteCacheFile = path.join(dataDir, "taste-cache.json");
  let tasteCache = jsonRead(tasteCacheFile, {}),
    likesLoading;
  function invalidateTaste() {
    tasteCache = {};
    atomic(tasteCacheFile, tasteCache);
    for (const key of cache.keys())
      if (key.includes("myRating=like")) cache.delete(key);
  }
  async function tasteProfile(refresh = false) {
    if (refresh) invalidateTaste();
    const tag = crypto
      .createHash("sha256")
      .update(tokens.refresh_token || tokens.access_token || "anonymous")
      .digest("hex");
    if (
      (tokens.refresh_token || tokens.access_token) &&
      (!tasteCache.items ||
        tasteCache.tag !== tag ||
        tasteCache.expires < Date.now())
    ) {
      if (!likesLoading)
        likesLoading = (async () => {
          const collected = new Map(),
            seenPages = new Set();
          let pageToken = "";
          for (let page = 0; page < 10; page++) {
            const result = await api("videos", {
              part: "snippet,contentDetails,status",
              myRating: "like",
              maxResults: 50,
              pageToken,
            });
            for (const raw of result.items || []) {
              const item = normaliseVideo(raw);
              if (item && raw.status?.privacyStatus !== "private")
                collected.set(item.id, item);
            }
            pageToken = result.nextPageToken || "";
            if (!pageToken || seenPages.has(pageToken)) break;
            seenPages.add(pageToken);
          }
          tasteCache = {
            tag,
            expires: Date.now() + 900000,
            items: [...collected.values()],
          };
          atomic(tasteCacheFile, tasteCache);
        })().finally(() => (likesLoading = null));
      await likesLoading;
    }
    return buildTasteProfile({
      likes:
        tokens.refresh_token || tokens.access_token
          ? tasteCache.items || []
          : [],
      history: prefs.history,
      topics: prefs.topics,
      hidden: prefs.hidden,
      negative: prefs.negative || [],
    });
  }
  const saveSecret = async (file, value) => {
    const encrypted = await protect(JSON.stringify(value));
    fs.writeFileSync(file + ".tmp", encrypted);
    fs.renameSync(file + ".tmp", file);
  };
  const savePrefs = () => atomic(prefsFile, prefs);
  const response = async (r) => {
    let data;
    try {
      const raw = await r.text();
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw Error("Resposta inválida do Google.");
    }
    if (!r.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded")
        throw Error("A cota do YouTube terminou. Tente novamente mais tarde.");
      throw Error(
        data.error?.message ||
          data.error_description ||
          "O Google recusou a solicitação.",
      );
    }
    return data;
  };
  async function access() {
    if (!tokens.refresh_token && !tokens.access_token) return null;
    if (tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
    if (!tokens.refresh_token) throw Error("Vincule a conta novamente.");
    if (!refreshing)
      refreshing = (async () => {
        const body = new URLSearchParams({
          client_id: settings.client_id,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        });
        if (settings.client_secret)
          body.set("client_secret", settings.client_secret);
        const data = await response(
          await fetchImpl("https://oauth2.googleapis.com/token", {
            method: "POST",
            body,
            signal: AbortSignal.timeout(20000),
          }),
        );
        tokens = {
          ...tokens,
          ...data,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        await saveSecret(tokensFile, tokens);
        return tokens.access_token;
      })().finally(() => (refreshing = null));
    return refreshing;
  }
  async function api(resource, params = {}, method = "GET", body) {
    const token = await access();
    if (!token && !settings.apiKey)
      throw Error(
        "Abra Configurar e informe uma chave da API ou vincule sua conta Google.",
      );
    const u = new URL("https://www.googleapis.com/youtube/v3/" + resource);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
    if (!token) u.searchParams.set("key", settings.apiKey);
    const key = u.pathname + u.search;
    if (method === "GET" && cache.get(key)?.expires > Date.now())
      return cache.get(key).value;
    const headers = token ? { Authorization: "Bearer " + token } : {};
    if (body) headers["Content-Type"] = "application/json";
    const data = await response(
      await fetchImpl(u, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      }),
    );
    if (method === "GET")
      cache.set(key, { value: data, expires: Date.now() + 300000 });
    else cache.clear();
    return data;
  }
  async function videos(data) {
    const ids = data.items
      .map(
        (x) =>
          x.id?.videoId ||
          x.contentDetails?.videoId ||
          (typeof x.id === "string" ? x.id : null),
      )
      .filter(Boolean);
    if (!ids.length) return { items: [], nextPageToken: data.nextPageToken };
    const details = await api("videos", {
      part: "snippet,contentDetails,status",
      id: ids.join(","),
    });
    const byId = new Map(
      details.items.map((x) => [x.id, { ...x, playback: playbackInfo(x) }]),
    );
    return {
      items: ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .filter((x) => !prefs.hidden.includes(x.id)),
      nextPageToken: data.nextPageToken,
    };
  }
  async function feed(query) {
    const mode = query.mode || "for-you",
      pageToken = query.pageToken || "";
    if (mode === "history")
      return videos({
        items: prefs.history.slice(0, 50).map((x) => ({ id: x.id })),
      });
    if (mode === "liked")
      return videos(
        await api("videos", {
          part: "snippet,contentDetails,status",
          myRating: "like",
          maxResults: 12,
          pageToken,
        }),
      );
    if (mode === "subscriptions")
      return api("subscriptions", {
        part: "snippet",
        mine: true,
        maxResults: 12,
        pageToken,
      });
    if (mode === "playlists")
      return api("playlists", {
        part: "snippet,contentDetails",
        mine: true,
        maxResults: 12,
        pageToken,
      });
    if (mode === "playlist")
      return videos(
        await api("playlistItems", {
          part: "contentDetails",
          playlistId: query.id,
          maxResults: 12,
          pageToken,
        }),
      );
    if (mode === "channel") {
      const channel = await api("channels", {
        part: "contentDetails",
        id: query.id,
      });
      const uploads =
        channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) throw Error("Canal sem vídeos disponíveis.");
      return videos(
        await api("playlistItems", {
          part: "contentDetails",
          playlistId: uploads,
          maxResults: 12,
          pageToken,
        }),
      );
    }
    if (mode === "search")
      return videos(
        await api("search", {
          part: "snippet",
          q: query.q,
          type: "video",
          maxResults: 12,
          pageToken,
        }),
      );
    throw Error(
      "Seção inválida. Sugestões e mixes usam o perfil de gostos e o motor de recomendações.",
    );
  }
  const browser = (url) => {
    if (browserOpener) {
      browserOpener(url);
      return;
    }
    if (openBrowser)
      spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        windowsHide: true,
        stdio: "ignore",
      }).on("error", () => {});
  };
  const send = (res, status, data, type = "application/json") => {
    res.writeHead(status, {
      "Content-Type": type + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(type === "application/json" ? JSON.stringify(data) : data);
  };
  const server = http.createServer(async (req, res) => {
    try {
      const host = `127.0.0.1:${config.port}`;
      if (req.headers.host !== host)
        return send(res, 403, { error: "Host inválido." });
      const url = new URL(req.url, "http://" + host);
      if (url.pathname === "/oauth/callback") {
        const flow = pending;
        if (
          !flow ||
          Date.now() - flow.created > 600000 ||
          url.searchParams.get("state") !== flow.state
        )
          return send(
            res,
            400,
            "Autorização inválida ou expirada.",
            "text/plain",
          );
        pending = null;
        if (url.searchParams.has("error"))
          return send(
            res,
            400,
            "Autorização cancelada. Volte ao Mei Music.",
            "text/plain",
          );
        const body = new URLSearchParams({
          client_id: settings.client_id,
          code: url.searchParams.get("code") || "",
          code_verifier: flow.verifier,
          redirect_uri: `http://${host}/oauth/callback`,
          grant_type: "authorization_code",
        });
        if (settings.client_secret)
          body.set("client_secret", settings.client_secret);
        const t = await response(
          await fetchImpl("https://oauth2.googleapis.com/token", {
            method: "POST",
            body,
            signal: AbortSignal.timeout(20000),
          }),
        );
        tokens = { ...t, expiresAt: Date.now() + t.expires_in * 1000 };
        await saveSecret(tokensFile, tokens);
        cache.clear();
        invalidateTaste();
        return send(
          res,
          200,
          "Conta vinculada. Você pode fechar esta janela e voltar ao Mei Music.",
          "text/plain",
        );
      }
      if (url.pathname.startsWith("/api/")) {
        if (req.headers.authorization !== "Bearer " + config.capability)
          return send(res, 403, { error: "Acesso local não autorizado." });
        if (req.headers.origin && req.headers.origin !== `http://${host}`)
          return send(res, 403, { error: "Origem inválida." });
        if (url.pathname === "/api/transport")
          return await transportRequest(req, res, { fetchImpl: playbackFetch });
        let body = {};
        if (req.method === "POST") {
          let raw = "";
          const limit =
            url.pathname === "/api/playback-token" ? 1500000 : 150000;
          for await (const chunk of req) {
            raw += chunk;
            if (raw.length > limit)
              return send(res, 413, { error: "Solicitação muito grande." });
          }
          body = JSON.parse(raw || "{}");
        }
        const route = url.pathname;
        if (route === "/api/taste-profile" && req.method === "GET")
          return send(
            res,
            200,
            await tasteProfile(url.searchParams.get("refresh") === "1"),
          );
        if (route === "/api/listening" && req.method === "POST") {
          if (
            !/^[\w-]{11}$/.test(body.id || "") ||
            !Number.isFinite(body.seconds) ||
            body.seconds < 0 ||
            body.seconds > 86400
          )
            throw Error("Progresso de escuta inválido.");
          const entry = prefs.history.find((x) => x.id === body.id);
          if (entry) {
            entry.listenedSeconds = Math.max(
              entry.listenedSeconds || 0,
              Math.round(body.seconds),
            );
            savePrefs();
          }
          return send(res, 200, { ok: true });
        }
        if (route === "/api/playback-token" && req.method === "POST") {
          if (
            !/^[\w-]{11}$/.test(body.videoId || "") ||
            !Array.isArray(body.args) ||
            body.args.length !== 3 ||
            body.args.some((x) => typeof x !== "string")
          )
            throw Error("Solicitação de reprodução inválida.");
          return send(res, 200, await playbackToken(body.videoId, body.args));
        }
        if (route === "/api/status" && req.method === "GET")
          return send(res, 200, {
            playbackEngine: "freetube-shaka",
            recommendationEngine: "video-seeds-v2",
            instanceId: config.instanceId || null,
            configured: !!(settings.apiKey || settings.client_id),
            oauthConfigured: !!settings.client_id,
            linked: !!(tokens.access_token || tokens.refresh_token),
            canWrite: !!tokens.scope?.includes("youtube.force-ssl"),
            topics: prefs.topics,
            history: prefs.history.slice(0, 60),
          });
        if (route === "/api/settings" && req.method === "POST") {
          const installed = body.oauth?.installed;
          if (body.oauth && !installed?.client_id)
            throw Error(
              "Selecione o JSON de um cliente OAuth do tipo Aplicativo para computador.",
            );
          if (installed) {
            if (
              settings.client_id &&
              settings.client_id !== String(installed.client_id)
            ) {
              tokens = {};
              await saveSecret(tokensFile, tokens);
            }
            settings.client_id = String(installed.client_id);
            settings.client_secret = String(installed.client_secret || "");
          }
          if (body.apiKey !== undefined)
            settings.apiKey = String(body.apiKey).trim();
          await saveSecret(settingsFile, settings);
          cache.clear();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/preferences" && req.method === "POST") {
          prefs.topics = (body.topics || [])
            .map((x) => String(x).trim().slice(0, 100))
            .filter(Boolean)
            .slice(0, 20);
          savePrefs();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/login" && req.method === "POST") {
          if (!settings.client_id)
            throw Error("Importe primeiro o JSON OAuth em Configurar.");
          const verifier = crypto.randomBytes(48).toString("base64url");
          pending = {
            state: crypto.randomBytes(32).toString("hex"),
            verifier,
            created: Date.now(),
          };
          const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          for (const [k, v] of Object.entries({
            client_id: settings.client_id,
            redirect_uri: `http://${host}/oauth/callback`,
            response_type: "code",
            scope:
              "https://www.googleapis.com/auth/youtube.readonly" +
              (body.write
                ? " https://www.googleapis.com/auth/youtube.force-ssl"
                : ""),
            state: pending.state,
            code_challenge: crypto
              .createHash("sha256")
              .update(verifier)
              .digest("base64url"),
            code_challenge_method: "S256",
            access_type: "offline",
            prompt: "consent",
          }))
            u.searchParams.set(k, v);
          browser(u.href);
          return send(res, 200, { ok: true });
        }
        if (route === "/api/logout" && req.method === "POST") {
          if (tokens.refresh_token || tokens.access_token)
            await response(
              await fetchImpl("https://oauth2.googleapis.com/revoke", {
                method: "POST",
                body: new URLSearchParams({
                  token: tokens.refresh_token || tokens.access_token,
                }),
                signal: AbortSignal.timeout(15000),
              }),
            );
          tokens = {};
          await saveSecret(tokensFile, tokens);
          cache.clear();
          invalidateTaste();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/feed" && req.method === "GET")
          return send(
            res,
            200,
            await feed(Object.fromEntries(url.searchParams)),
          );
        if (route === "/api/video" && req.method === "GET") {
          const id = url.searchParams.get("id");
          if (!/^[\w-]{11}$/.test(id || "")) throw Error("Vídeo inválido.");
          const data = await api("videos", {
            part: "snippet,contentDetails,status",
            id,
          });
          const video = data.items?.[0];
          return send(res, 200, {
            item: video ? { ...video, playback: playbackInfo(video) } : null,
            playback: playbackInfo(video),
          });
        }
        if (route === "/api/player-error" && req.method === "POST") {
          if (
            !/^[\w-]{11}$/.test(body.id || "") ||
            ![2, 5, 100, 101, 150, 153].includes(body.code)
          )
            throw Error("Diagnóstico inválido.");
          const file = path.join(dataDir, "player-errors.json"),
            entries = jsonRead(file, []);
          entries.push({
            id: body.id,
            code: body.code,
            at: new Date().toISOString(),
          });
          atomic(file, entries.slice(-100));
          return send(res, 200, { ok: true });
        }
        if (route === "/api/played" && req.method === "POST") {
          if (!/^[\w-]{11}$/.test(body.id)) throw Error("Vídeo inválido.");
          prefs.history = [
            {
              ...prefs.history.find((x) => x.id === body.id),
              id: body.id,
              title: String(body.title || "").slice(0, 300),
              channelTitle: String(body.channelTitle || "").slice(0, 200),
              channelId: String(body.channelId || "").slice(0, 100),
              at: Date.now(),
            },
            ...prefs.history.filter((x) => x.id !== body.id),
          ].slice(0, 300);
          savePrefs();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/hide" && req.method === "POST") {
          if (!/^[\w-]{11}$/.test(body.id)) throw Error("Vídeo inválido.");
          prefs.hidden = [...new Set([...prefs.hidden, body.id])].slice(-1000);
          prefs.negative = [
            {
              id: body.id,
              channelTitle: String(body.channelTitle || "").slice(0, 160),
              channelId: String(body.channelId || "").slice(0, 100),
            },
            ...(prefs.negative || []).filter((x) => x.id !== body.id),
          ].slice(0, 100);
          savePrefs();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/rate" && req.method === "POST") {
          if (!tokens.scope?.includes("youtube.force-ssl"))
            throw Error("Vincule a conta com a opção de permitir curtidas.");
          if (!/^[\w-]{11}$/.test(body.id)) throw Error("Vídeo inválido.");
          await api(
            "videos/rate",
            { id: body.id, rating: body.like ? "like" : "none" },
            "POST",
          );
          invalidateTaste();
          return send(res, 200, { ok: true });
        }
        if (route === "/api/open" && req.method === "POST") {
          const pages = {
            home: "https://www.youtube.com/",
            history: "https://www.youtube.com/feed/history",
            mixes: "https://www.youtube.com/",
          };
          let target = pages[body.page];
          if (body.id && /^[\w-]{11}$/.test(body.id))
            target = "https://www.youtube.com/watch?v=" + body.id;
          if (body.playlist && /^[\w-]{10,100}$/.test(body.playlist))
            target =
              body.id && /^[\w-]{11}$/.test(body.id)
                ? "https://www.youtube.com/watch?v=" +
                  body.id +
                  "&list=" +
                  body.playlist
                : "https://www.youtube.com/playlist?list=" + body.playlist;
          if (!target) throw Error("Destino inválido.");
          browser(target);
          return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: "Recurso não encontrado." });
      }
      if (req.method !== "GET")
        return send(res, 405, { error: "Método não permitido." });
      if (url.pathname === "/engine/source.zip") {
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="mei-player-source.zip"',
          "X-Content-Type-Options": "nosniff",
        });
        fs.createReadStream(path.join(import.meta.dirname, "engine/source.zip"))
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      if (url.pathname === "/player-about.html")
        return send(
          res,
          200,
          fs.readFileSync(
            path.join(import.meta.dirname, "player-about.html"),
            "utf8",
          ),
          "text/html",
        );
      const files = {
        "/recommendations.mjs": ["recommendations.mjs", "text/javascript"],
        "/recommendation-core.mjs": [
          "recommendation-core.mjs",
          "text/javascript",
        ],
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/player-support.mjs": ["player-support.mjs", "text/javascript"],
        "/style.css": ["style.css", "text/css"],
        "/direct-player.mjs": ["direct-player.mjs", "text/javascript"],
        "/engine-sandbox.html": ["engine-sandbox.html", "text/html"],
        "/engine-sandbox.js": ["engine-sandbox.js", "text/javascript"],
        "/engine/freetube-engine.js": [
          "engine/freetube-engine.js",
          "text/javascript",
        ],
        "/engine/botguard.js": ["engine/botguard.js", "text/javascript"],
        "/engine/LICENSE-FreeTube.txt": [
          "engine/LICENSE-FreeTube.txt",
          "text/plain",
        ],
        "/engine/NOTICE.txt": ["engine/NOTICE.txt", "text/plain"],
      };
      const file = files[url.pathname];
      if (!file) return send(res, 404, { error: "Não encontrado." });
      send(
        res,
        200,
        fs.readFileSync(path.join(import.meta.dirname, file[0]), "utf8"),
        file[1],
      );
    } catch (e) {
      if (res.headersSent) res.destroy();
      else send(res, 400, { error: e.message });
    }
  });
  const timer = setInterval(() => {
    for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  }, 60000);
  timer.unref();
  server.on("close", () => clearInterval(timer));
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "connection.json")),
  );
  const server = await createBridge({ config });
  server.listen(config.port, "127.0.0.1");
  server.on("error", (e) => {
    console.error(
      e.code === "EADDRINUSE" ? "A porta local já está ocupada." : e.message,
    );
    process.exitCode = 1;
  });
}
