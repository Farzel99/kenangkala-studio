/**
 * Kenangkala Studio — private relay (Cloudflare Worker)
 *
 * Why this exists:
 *  - Notion does not let a web page call its API directly from the browser.
 *  - TikTok access tokens expire every 24 hours; refreshing them needs your
 *    TikTok "client secret", which must never be put inside the website.
 *
 * This tiny script runs in YOUR OWN Cloudflare account. It keeps those secret
 * keys on the server side and only forwards the few requests the Command
 * Center needs. Setup steps: see relay/README.md.
 *
 * Secrets to add in Cloudflare (Settings → Variables and Secrets):
 *   RELAY_KEY             any long random password; also typed into the website's Settings
 *   NOTION_TOKEN          Notion internal integration secret (optional)
 *   TIKTOK_CLIENT_KEY     TikTok app client key (optional)
 *   TIKTOK_CLIENT_SECRET  TikTok app client secret (optional)
 *   TIKTOK_REFRESH_TOKEN  refresh token from TikTok Login Kit (optional)
 */

const NOTION_VERSION = "2022-06-28";

// Only these requests are forwarded. Everything else is refused.
const ROUTES = [
  { method: "GET", re: /^\/notion\/v1\/databases\/[0-9a-f-]{32,36}$/i },
  { method: "POST", re: /^\/notion\/v1\/databases\/[0-9a-f-]{32,36}\/query$/i },
  { method: "POST", re: /^\/notion\/v1\/pages$/ },
  { method: "GET", re: /^\/tiktok\/v2\/user\/info\/$/ },
  { method: "POST", re: /^\/tiktok\/v2\/video\/list\/$/ },
];

let tiktokCache = { token: null, expires: 0 };

async function tiktokAccessToken(env) {
  if (tiktokCache.token && Date.now() < tiktokCache.expires - 60_000) return tiktokCache.token;
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: env.TIKTOK_REFRESH_TOKEN,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error("TikTok token refresh failed: " + (data.error_description || data.error || res.status));
  }
  tiktokCache = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Relay-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req, status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });

    if (!env.RELAY_KEY) return json(req, 500, { message: "RELAY_KEY is not set on the relay." });
    if (!sameKey(req.headers.get("X-Relay-Key") || "", env.RELAY_KEY)) {
      return json(req, 401, { message: "Wrong relay key. Check Settings & Connections." });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health") {
      return json(req, 200, {
        ok: true,
        notion: !!env.NOTION_TOKEN,
        tiktok: !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REFRESH_TOKEN),
      });
    }

    if (!ROUTES.some((r) => r.method === req.method && r.re.test(path))) {
      return json(req, 404, { message: "This relay does not forward that request." });
    }

    try {
      let upstream;
      if (path.startsWith("/notion/")) {
        if (!env.NOTION_TOKEN) return json(req, 400, { message: "NOTION_TOKEN is not set on the relay." });
        upstream = await fetch("https://api.notion.com" + path.slice("/notion".length), {
          method: req.method,
          headers: {
            Authorization: "Bearer " + env.NOTION_TOKEN,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: req.method === "GET" ? undefined : await req.text(),
        });
      } else {
        if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET || !env.TIKTOK_REFRESH_TOKEN) {
          return json(req, 400, { message: "TikTok secrets are not set on the relay." });
        }
        const token = await tiktokAccessToken(env);
        upstream = await fetch("https://open.tiktokapis.com" + path.slice("/tiktok".length) + url.search, {
          method: req.method,
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: req.method === "GET" ? undefined : await req.text(),
        });
      }
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    } catch (err) {
      return json(req, 502, { message: String((err && err.message) || err) });
    }
  },
};
