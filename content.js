/**
 * Content script – runs on instagram.com with the user's session.
 * Loads followers/following via the same web endpoints as Instagram.com.
 */

const IG_APP_ID = "936619743392459";
const PAGE_SIZE = 50;
const DELAY_MS = 900; // Pause zwischen Seiten, um Rate-Limits zu vermeiden

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function igHeaders() {
  const csrf = getCookie("csrftoken") || "";
  return {
    "x-ig-app-id": IG_APP_ID,
    "x-requested-with": "XMLHttpRequest",
    "x-csrftoken": csrf,
    Accept: "application/json",
  };
}

async function igFetch(url, options = {}) {
  const method = options.method || "GET";
  const headers = {
    ...igHeaders(),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers,
    body: options.body,
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "Not logged in or blocked. Please log in on instagram.com and try again later."
    );
  }
  if (res.status === 429) {
    throw new Error(
      "The website rate-limited requests (429). Wait 1–2 minutes and try again."
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new Error(
      detail
        ? `HTTP ${res.status}: ${detail}`
        : `The website responded with HTTP ${res.status}`
    );
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The website returned a non-JSON response.");
  }
}
