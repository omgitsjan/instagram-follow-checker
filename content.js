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
      "Instagram rate-limited requests (429). Wait 1–2 minutes and try again."
    );
  }
  if (!res.ok) {
    throw new Error(`Instagram responded with HTTP ${res.status}`);
  }
  return res.json();
}

/** Follow / unfollow via the same web endpoints as Instagram.com */
async function friendshipAction(userId, action) {
  // action: "create" (follow) | "destroy" (unfollow)
  const url = `https://www.instagram.com/api/v1/friendships/${action}/${userId}/`;
  const data = await igFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-instagram-ajax": "1",
    },
    body: "",
  });

  if (data?.status && data.status !== "ok") {
    throw new Error(data.message || `Action failed (${data.status})`);
  }

  // friendship_status.following / outgoing_request
  const fs = data?.friendship_status || {};
  return {
    ok: true,
    following: Boolean(fs.following),
    outgoingRequest: Boolean(fs.outgoing_request),
    raw: data,
  };
}

/** Profilbild als Data-URL laden (falls CDN im Popup blockt) */
async function fetchImageAsDataUrl(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function getCurrentUser() {
  // 1) Cookie ds_user_id + Profil-Info
  const userId = getCookie("ds_user_id");
  if (userId) {
    try {
      const data = await igFetch(
        `https://www.instagram.com/api/v1/users/${userId}/info/`
      );
      if (data?.user) {
        return {
          id: String(data.user.pk || data.user.id || userId),
          username: data.user.username,
          fullName: data.user.full_name || "",
          profilePic: data.user.profile_pic_url || "",
          followersCount: data.user.follower_count ?? null,
          followingCount: data.user.following_count ?? null,
        };
      }
    } catch {
      /* fallbacks below */
    }
  }

  // 2) web_profile_info mit Username aus URL
  const pathUser = location.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
  if (pathUser && !["accounts", "explore", "reels", "direct", "stories"].includes(pathUser[1])) {
    try {
      const data = await igFetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(pathUser[1])}`
      );
      const u = data?.data?.user;
      if (u) {
        return {
          id: String(u.id),
          username: u.username,
          fullName: u.full_name || "",
          profilePic: u.profile_pic_url || "",
          followersCount: u.edge_followed_by?.count ?? null,
          followingCount: u.edge_follow?.count ?? null,
        };
      }
    } catch {
      /* continue */
    }
  }

  // 3) Shared data / embedded JSON
  try {
    const html = document.documentElement.innerHTML;
    const m =
      html.match(/"viewerId"\s*:\s*"(\d+)"/) ||
      html.match(/"id"\s*:\s*"(\d+)"\s*,\s*"username"\s*:\s*"([^"]+)"/);
    if (m) {
      const id = m[1];
      const username = m[2] || null;
      if (username) {
        return { id, username, fullName: "", profilePic: "", followersCount: null, followingCount: null };
      }
      const info = await igFetch(`https://www.instagram.com/api/v1/users/${id}/info/`);
      if (info?.user) {
        return {
          id: String(info.user.pk || id),
          username: info.user.username,
          fullName: info.user.full_name || "",
          profilePic: info.user.profile_pic_url || "",
          followersCount: info.user.follower_count ?? null,
          followingCount: info.user.following_count ?? null,
        };
      }
    }
  } catch {
    /* continue */
  }

  throw new Error(
    "Could not detect your account. Open instagram.com, log in, and stay on an Instagram page."
  );
}

function pickProfilePic(u) {
  const raw =
    u.profile_pic_url_hd ||
    u.profile_pic_url ||
    u.hd_profile_pic_url_info?.url ||
    u.profile_pic_url_info?.url ||
    (Array.isArray(u.hd_profile_pic_versions) && u.hd_profile_pic_versions[0]?.url) ||
    "";
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

function mapUser(u) {
  const followerCount =
    u.follower_count ?? u.followers_count ?? u.edge_followed_by?.count ?? null;
  const followingCount =
    u.following_count ?? u.follow_count ?? u.edge_follow?.count ?? null;
  const mediaCount =
    u.media_count ?? u.total_igtv_videos ?? u.edge_owner_to_timeline_media?.count ?? null;

  return {
    id: String(u.pk ?? u.id ?? u.pk_id ?? ""),
    username: u.username || "",
    fullName: u.full_name || "",
    profilePic: pickProfilePic(u),
    isPrivate: Boolean(u.is_private),
    isVerified: Boolean(u.is_verified),
    hasAnonymousProfilePic: Boolean(
      u.has_anonymous_profile_picture || u.is_anonymous_profile_picture
    ),
    followerCount: followerCount != null ? Number(followerCount) : null,
    followingCount: followingCount != null ? Number(followingCount) : null,
    mediaCount: mediaCount != null ? Number(mediaCount) : null,
  };
}

function mapLikedItem(item) {
  const user = item.user || item.owner || {};
  const caption =
    item.caption?.text ||
    item.caption ||
    item.accessibility_caption ||
    "";
  const thumb =
    item.image_versions2?.candidates?.[0]?.url ||
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    item.thumbnail_url ||
    "";
  const code = item.code || item.pk || item.id || "";
  const id = String(item.pk ?? item.id ?? code);
  return {
    id,
    code: String(code),
    caption: typeof caption === "string" ? caption : "",
    thumb: thumb.startsWith("//") ? `https:${thumb}` : thumb,
    takenAt: item.taken_at || item.device_timestamp || null,
    likeCount: item.like_count ?? null,
    author: {
      id: String(user.pk ?? user.id ?? ""),
      username: user.username || "",
      fullName: user.full_name || "",
      profilePic: pickProfilePic(user),
    },
    permalink: user.username
      ? `https://www.instagram.com/p/${encodeURIComponent(String(code).split("_")[0] || code)}/`
      : `https://www.instagram.com/p/${encodeURIComponent(String(code))}/`,
  };
}

/** Paginated liked posts for the logged-in user */
async function fetchLikedPosts(onProgress, { maxPages = 8 } = {}) {
  const results = [];
  let maxId = null;
  let page = 0;

  do {
    page += 1;
    let url = "https://www.instagram.com/api/v1/feed/liked/?";
    if (maxId) url += `max_id=${encodeURIComponent(maxId)}`;

    const data = await igFetch(url);
    const items = data.items || data.media_items || [];
    for (const raw of items) {
      const media = raw.media || raw;
      results.push(mapLikedItem(media));
    }

    if (onProgress) {
      onProgress({ loaded: results.length, page, hasMore: Boolean(data.next_max_id) });
    }

    maxId = data.next_max_id || null;
    if (!maxId || page >= maxPages) break;
    await sleep(DELAY_MS);
  } while (maxId);

  return results;
}

async function fetchList(userId, type, onProgress) {
  const results = [];
  let maxId = null;
  let page = 0;

  // type: "followers" | "following"
  do {
    page += 1;
    let url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?count=${PAGE_SIZE}`;
    if (maxId) {
      url += `&max_id=${encodeURIComponent(maxId)}`;
    }

    const data = await igFetch(url);
    const users = (data.users || []).map(mapUser);
    results.push(...users);

    if (onProgress) {
      onProgress({
        type,
        loaded: results.length,
        page,
        hasMore: Boolean(data.next_max_id),
      });
    }

    maxId = data.next_max_id || null;

    // big_list false + no next_max_id = fertig
    if (!maxId) break;

    await sleep(DELAY_MS);
  } while (maxId);

  return results;
}

function compareLists(following, followers) {
  const followerIds = new Set(followers.map((u) => u.id));
  const followingIds = new Set(following.map((u) => u.id));

  const mutual = [];
  const notFollowingBack = [];
  const notFollowedByMe = [];

  for (const u of following) {
    if (followerIds.has(u.id)) mutual.push(u);
    else notFollowingBack.push(u);
  }

  for (const u of followers) {
    if (!followingIds.has(u.id)) notFollowedByMe.push(u);
  }

  const byName = (a, b) =>
    a.username.localeCompare(b.username, undefined, { sensitivity: "base" });

  mutual.sort(byName);
  notFollowingBack.sort(byName);
  notFollowedByMe.sort(byName);

  return { mutual, notFollowingBack, notFollowedByMe };
}

let running = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === "GET_ME") {
    (async () => {
      try {
        const me = await getCurrentUser();
        sendResponse({ ok: true, me });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg?.type === "FRIENDSHIP") {
    // action: "follow" | "unfollow"
    (async () => {
      try {
        const userId = String(msg.userId || "");
        if (!userId) throw new Error("No user id.");
        const action = msg.action === "follow" ? "create" : "destroy";
        const result = await friendshipAction(userId, action);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true; // async sendResponse
  }

  if (msg?.type === "FETCH_LIKED") {
    (async () => {
      try {
        const liked = await fetchLikedPosts(
          (p) => {
            chrome.runtime
              .sendMessage({
                type: "PROGRESS",
                stage: "liked",
                loaded: p.loaded,
                page: p.page,
              })
              .catch(() => {});
          },
          { maxPages: msg.maxPages ?? 8 }
        );
        sendResponse({ ok: true, liked, finishedAt: Date.now() });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg?.type === "FETCH_AVATAR") {
    (async () => {
      try {
        const dataUrl = await fetchImageAsDataUrl(msg.url);
        sendResponse({ ok: Boolean(dataUrl), dataUrl });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg?.type === "ANALYZE") {
    if (running) {
      sendResponse({ ok: false, error: "Analysis already running." });
      return false;
    }

    running = true;
    (async () => {
      try {
        const me = await getCurrentUser();

        chrome.runtime
          .sendMessage({
            type: "PROGRESS",
            stage: "user",
            me,
          })
          .catch(() => {});

        const following = await fetchList(me.id, "following", (p) => {
          chrome.runtime
            .sendMessage({
              type: "PROGRESS",
              stage: "following",
              loaded: p.loaded,
              total: me.followingCount,
            })
            .catch(() => {});
        });

        const followers = await fetchList(me.id, "followers", (p) => {
          chrome.runtime
            .sendMessage({
              type: "PROGRESS",
              stage: "followers",
              loaded: p.loaded,
              total: me.followersCount,
            })
            .catch(() => {});
        });

        const lists = compareLists(following, followers);
        const result = {
          type: "RESULT",
          ok: true,
          me,
          counts: {
            following: following.length,
            followers: followers.length,
            mutual: lists.mutual.length,
            notFollowingBack: lists.notFollowingBack.length,
            notFollowedByMe: lists.notFollowedByMe.length,
          },
          following,
          followers,
          mutual: lists.mutual,
          notFollowingBack: lists.notFollowingBack,
          notFollowedByMe: lists.notFollowedByMe,
          finishedAt: Date.now(),
        };

        // Persist if popup was closed
        try {
          await chrome.storage.local.set({ lastResult: result });
        } catch {
          /* ignore */
        }

        chrome.runtime.sendMessage(result).catch(() => {});
      } catch (err) {
        const fail = {
          type: "RESULT",
          ok: false,
          error: err?.message || String(err),
        };
        try {
          await chrome.storage.local.set({ lastResult: fail });
        } catch {
          /* ignore */
        }
        chrome.runtime.sendMessage(fail).catch(() => {});
      } finally {
        running = false;
      }
    })();

    sendResponse({ ok: true, started: true });
    return false;
  }

  return false;
});
