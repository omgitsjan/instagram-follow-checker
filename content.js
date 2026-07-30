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
    let detail = "";
    try {
      detail = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new Error(
      detail
        ? `Instagram HTTP ${res.status}: ${detail}`
        : `Instagram responded with HTTP ${res.status}`
    );
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  }
  // Some IG endpoints return JSON without content-type
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Instagram returned non-JSON response.");
  }
}

/** Follow / unfollow / remove follower via Instagram web endpoints */
async function friendshipAction(userId, action) {
  // action: "create" | "destroy" | "remove_follower"
  let url;
  if (action === "remove_follower") {
    // Web UI: remove someone from your followers
    url = `https://www.instagram.com/api/v1/web/friendships/${userId}/remove_follower/`;
  } else {
    url = `https://www.instagram.com/api/v1/friendships/${action}/${userId}/`;
  }

  let data;
  try {
    data = await igFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-instagram-ajax": "1",
      },
      body: "",
    });
  } catch (err) {
    // Fallback path used by some IG web builds
    if (action === "remove_follower") {
      data = await igFetch(
        `https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-instagram-ajax": "1",
          },
          body: "",
        }
      );
    } else {
      throw err;
    }
  }

  if (data?.status && data.status !== "ok") {
    throw new Error(data.message || `Action failed (${data.status})`);
  }

  // friendship_status.following / outgoing_request / followed_by
  const fs = data?.friendship_status || {};
  return {
    ok: true,
    following: Boolean(fs.following),
    outgoingRequest: Boolean(fs.outgoing_request),
    followedBy: fs.followed_by === undefined ? undefined : Boolean(fs.followed_by),
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

function shortCodeFromId(idOrCode) {
  const s = String(idOrCode || "");
  // Media pk often "123_456" — shortcode is separate `code` field when present
  if (/^[A-Za-z0-9_-]+$/.test(s) && !s.includes("_")) return s;
  return s.split("_")[0] || s;
}

function mapMediaItem(item, fallbackAuthor = null) {
  const user = item.user || item.owner || fallbackAuthor || {};
  const captionObj = item.caption;
  const caption =
    (typeof captionObj === "object" && captionObj?.text) ||
    (typeof captionObj === "string" ? captionObj : "") ||
    item.accessibility_caption ||
    "";
  const thumb =
    item.image_versions2?.candidates?.[0]?.url ||
    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
    item.thumbnail_url ||
    "";
  const code = item.code || shortCodeFromId(item.pk ?? item.id ?? "");
  const id = String(item.pk ?? item.id ?? code);
  const likeCount = item.like_and_view_counts_disabled
    ? null
    : item.like_count != null
      ? Number(item.like_count)
      : null;
  const commentCount =
    item.comment_count != null ? Number(item.comment_count) : null;
  const playCount =
    item.play_count ?? item.ig_play_count ?? item.view_count ?? item.video_view_count ?? null;

  return {
    id,
    code: String(code),
    caption: typeof caption === "string" ? caption : "",
    thumb: thumb.startsWith("//") ? `https:${thumb}` : thumb,
    takenAt: item.taken_at || item.device_timestamp || null,
    likeCount: likeCount != null ? Number(likeCount) : null,
    commentCount: commentCount != null ? Number(commentCount) : null,
    playCount: playCount != null ? Number(playCount) : null,
    mediaType: item.media_type ?? null, // 1 image, 2 video, 8 carousel
    productType: item.product_type || "",
    author: {
      id: String(user.pk ?? user.id ?? ""),
      username: user.username || "",
      fullName: user.full_name || "",
      profilePic: pickProfilePic(user),
    },
    permalink: `https://www.instagram.com/p/${encodeURIComponent(String(code))}/`,
  };
}

function engagementScore(p) {
  return (p.likeCount || 0) + (p.commentCount || 0) * 3;
}

function sortPostsByEngagement(posts) {
  return [...posts].sort((a, b) => {
    const d = engagementScore(b) - engagementScore(a);
    if (d !== 0) return d;
    return (b.takenAt || 0) - (a.takenAt || 0);
  });
}

function sortPostsByRecency(posts) {
  return [...posts].sort((a, b) => (b.takenAt || 0) - (a.takenAt || 0));
}

function mapGraphMediaNode(n, meAuthor) {
  return mapMediaItem(
    {
      pk: n.id,
      id: n.id,
      code: n.shortcode,
      caption: n.edge_media_to_caption?.edges?.[0]?.node?.text || n.caption || "",
      taken_at: n.taken_at_timestamp || n.taken_at,
      like_count: n.edge_liked_by?.count ?? n.edge_media_preview_like?.count,
      comment_count: n.edge_media_to_comment?.count,
      thumbnail_url: n.thumbnail_src || n.display_url,
      image_versions2: n.display_url
        ? { candidates: [{ url: n.display_url }] }
        : undefined,
      media_type: n.is_video ? 2 : 1,
      user: meAuthor,
    },
    meAuthor
  );
}

/** First page via web_profile_info (often works when feed/user fails). */
async function fetchOwnPostsViaWebProfile(username, meAuthor) {
  if (!username) return [];
  const data = await igFetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
  );
  const user = data?.data?.user;
  const edges = user?.edge_owner_to_timeline_media?.edges || [];
  return edges.map((e) => mapGraphMediaNode(e.node || e, meAuthor));
}

/** GraphQL user media (legacy query_hash still works for many sessions). */
async function fetchOwnPostsViaGraphql(userId, meAuthor, onProgress, maxPages = 5) {
  const results = [];
  let after = null;
  for (let page = 1; page <= maxPages; page++) {
    const variables = { id: String(userId), first: 12, after };
    const url =
      "https://www.instagram.com/graphql/query/?query_hash=69cba40317214236af40e7efa697781d&variables=" +
      encodeURIComponent(JSON.stringify(variables));
    const data = await igFetch(url);
    const conn = data?.data?.user?.edge_owner_to_timeline_media;
    const edges = conn?.edges || [];
    for (const e of edges) {
      results.push(mapGraphMediaNode(e.node || e, meAuthor));
    }
    if (onProgress) {
      onProgress({
        phase: "posts",
        loaded: results.length,
        page,
        hasMore: Boolean(conn?.page_info?.has_next_page),
      });
    }
    if (!conn?.page_info?.has_next_page) break;
    after = conn.page_info.end_cursor || null;
    if (!after) break;
    await sleep(DELAY_MS);
  }
  return results;
}

/**
 * Own posts with multiple strategies (feed/user often fails / 400).
 */
async function fetchOwnPosts(userId, onProgress, { maxPages = 8 } = {}) {
  let me = null;
  let meAuthor = null;
  try {
    me = await getCurrentUser();
    meAuthor = {
      pk: me.id,
      id: me.id,
      username: me.username,
      full_name: me.fullName,
      profile_pic_url: me.profilePic,
    };
    if (!userId) userId = me.id;
  } catch {
    /* continue */
  }

  if (!userId && !me?.username) {
    throw new Error("Could not resolve your account for posts. Stay logged in on Instagram.");
  }

  const results = [];
  const seen = new Set();
  const pushAll = (list) => {
    for (const p of list) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      results.push(p);
    }
  };

  const errors = [];

  // Strategy A: classic feed/user
  try {
    let maxId = null;
    let page = 0;
    do {
      page += 1;
      let url = `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(userId)}/?count=12`;
      if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;
      const data = await igFetch(url);
      const list = Array.isArray(data.items) ? data.items : [];
      pushAll(list.map((raw) => mapMediaItem(raw.media || raw, meAuthor)));
      if (onProgress) {
        onProgress({
          phase: "posts",
          loaded: results.length,
          page,
          hasMore: Boolean(data.more_available),
        });
      }
      maxId =
        data.next_max_id ||
        (data.more_available && list.length
          ? String(list[list.length - 1].pk || list[list.length - 1].id || "")
          : null);
      if (!maxId || !data.more_available || page >= maxPages) break;
      await sleep(DELAY_MS);
    } while (maxId);
  } catch (err) {
    errors.push(`feed/user: ${err?.message || err}`);
  }

  // Strategy B: web_profile_info
  if (!results.length) {
    try {
      const viaProfile = await fetchOwnPostsViaWebProfile(me?.username, meAuthor);
      pushAll(viaProfile);
      if (onProgress) {
        onProgress({
          phase: "posts",
          loaded: results.length,
          page: 1,
          hasMore: false,
          note: "web_profile",
        });
      }
    } catch (err) {
      errors.push(`web_profile: ${err?.message || err}`);
    }
  }

  // Strategy C: GraphQL user media
  if (!results.length && userId) {
    try {
      const viaGql = await fetchOwnPostsViaGraphql(
        userId,
        meAuthor,
        onProgress,
        Math.min(5, maxPages)
      );
      pushAll(viaGql);
    } catch (err) {
      errors.push(`graphql: ${err?.message || err}`);
    }
  }

  if (!results.length) {
    throw new Error(
      `Could not load your posts. ${errors.join(" · ") || "Unknown error"}. Open your profile on Instagram and try again.`
    );
  }

  return sortPostsByEngagement(results);
}

/** Likers of one media id (pk). */
async function fetchMediaLikers(mediaId) {
  const id = encodeURIComponent(String(mediaId).split("_")[0] || mediaId);
  const urls = [
    `https://www.instagram.com/api/v1/media/${id}/likers/`,
    `https://www.instagram.com/api/v1/media/${encodeURIComponent(mediaId)}/likers/`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const data = await igFetch(url);
      return (data.users || []).map(mapUser);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Likers unavailable");
}

/**
 * Load own posts + rank fans by how many of your recent posts they liked.
 * Tie-break: likes on newer posts rank higher (recency score).
 */
async function analyzeOwnPostsWithFans(onProgress, options = {}) {
  const maxPostPages = options.maxPostPages ?? 6;
  const maxPostsForLikers = options.maxPostsForLikers ?? 12;

  const me = await getCurrentUser();
  const postsRanked = await fetchOwnPosts(me.id, onProgress, {
    maxPages: maxPostPages,
  });

  // Recency order (newest first) for weight assignment
  const chronological = sortPostsByRecency(postsRanked);
  const scan = chronological.slice(0, maxPostsForLikers);
  const n = scan.length;

  /** @type {Map<string, {user: object, count: number, recencyScore: number, postIds: string[]}>} */
  const fanMap = new Map();

  for (let i = 0; i < n; i++) {
    const post = scan[i];
    // Newer posts get higher weight → win ties when like-counts equal
    const weight = n - i;
    if (onProgress) {
      onProgress({
        phase: "likers",
        postIndex: i + 1,
        postTotal: n,
        loaded: postsRanked.length,
        fans: fanMap.size,
      });
    }
    try {
      const likers = await fetchMediaLikers(post.id);
      for (const u of likers) {
        if (!u.id || u.id === me.id) continue;
        let entry = fanMap.get(u.id);
        if (!entry) {
          entry = { user: u, count: 0, recencyScore: 0, postIds: [] };
          fanMap.set(u.id, entry);
        }
        if (!entry.postIds.includes(post.id)) {
          entry.count += 1;
          entry.recencyScore += weight;
          entry.postIds.push(post.id);
          // Prefer richer profile fields if later liker payload has more
          if (!entry.user.profilePic && u.profilePic) entry.user = u;
        }
      }
    } catch {
      // skip post if likers blocked
    }
    await sleep(DELAY_MS);
  }

  const topFans = [...fanMap.values()]
    .map((e) => ({
      ...e.user,
      postsLiked: e.count,
      recencyScore: e.recencyScore,
      likedPostIds: e.postIds,
    }))
    .sort((a, b) => {
      if (b.postsLiked !== a.postsLiked) return b.postsLiked - a.postsLiked;
      if (b.recencyScore !== a.recencyScore) return b.recencyScore - a.recencyScore;
      return (a.username || "").localeCompare(b.username || "");
    });

  return {
    posts: postsRanked,
    chronological,
    topFans,
    postsScannedForLikers: n,
    me,
  };
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

function applyProfileInfoToUser(u, info) {
  if (!info) return false;
  let changed = false;
  // REST user object
  if (info.follower_count != null) {
    u.followerCount = Number(info.follower_count);
    changed = true;
  }
  if (info.following_count != null) {
    u.followingCount = Number(info.following_count);
    changed = true;
  }
  if (info.media_count != null) {
    u.mediaCount = Number(info.media_count);
    changed = true;
  }
  // web_profile_info graph shape
  if (info.edge_followed_by?.count != null) {
    u.followerCount = Number(info.edge_followed_by.count);
    changed = true;
  }
  if (info.edge_follow?.count != null) {
    u.followingCount = Number(info.edge_follow.count);
    changed = true;
  }
  if (info.edge_owner_to_timeline_media?.count != null) {
    u.mediaCount = Number(info.edge_owner_to_timeline_media.count);
    changed = true;
  }
  if (info.is_private != null) u.isPrivate = Boolean(info.is_private);
  if (info.is_verified != null) u.isVerified = Boolean(info.is_verified);
  if (info.has_anonymous_profile_picture != null) {
    u.hasAnonymousProfilePic = Boolean(info.has_anonymous_profile_picture);
  }
  if (!u.profilePic && (info.profile_pic_url || info.profile_pic_url_hd)) {
    u.profilePic = pickProfilePic(info);
  }
  if (!u.fullName && info.full_name) u.fullName = info.full_name;
  return changed;
}

/**
 * Fill missing public counts. List API almost never includes them on web.
 * Prefer web_profile_info by username (more reliable than users/{id}/info on web).
 */
async function enrichUsersWithCounts(users, onProgress, { max = 120, delayMs = 550 } = {}) {
  const targets = (users || []).filter(
    (u) =>
      u.username &&
      (u.followerCount == null ||
        u.followingCount == null ||
        u.mediaCount == null)
  );
  // Prefer sparse / digit-heavy accounts so bot heuristics get counts where useful
  targets.sort((a, b) => {
    const hint = (u) => {
      let s = 0;
      const un = (u.username || "").toLowerCase();
      if (u.hasAnonymousProfilePic || !u.profilePic) s += 3;
      if (/\d{4,}$/.test(un) || (un.match(/\d/g) || []).length >= 5) s += 3;
      if (!(u.fullName || "").trim()) s += 1;
      if (u.isPrivate) s += 1;
      return s;
    };
    return hint(b) - hint(a);
  });
  const slice = targets.slice(0, max);
  let ok = 0;
  for (let i = 0; i < slice.length; i++) {
    const u = slice[i];
    let got = false;
    // 1) web_profile_info (public profiles)
    try {
      const data = await igFetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u.username)}`
      );
      got = applyProfileInfoToUser(u, data?.data?.user);
    } catch {
      /* try next */
    }
    // 2) users/{id}/info fallback
    if (!got && u.id) {
      try {
        const data = await igFetch(
          `https://www.instagram.com/api/v1/users/${encodeURIComponent(u.id)}/info/`
        );
        got = applyProfileInfoToUser(u, data?.user);
      } catch {
        /* skip */
      }
    }
    if (got) ok += 1;
    if (onProgress) {
      onProgress({ enriched: i + 1, total: slice.length, ok });
    }
    await sleep(delayMs);
  }
  return users;
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
    // action: "follow" | "unfollow" | "remove_follower"
    (async () => {
      try {
        const userId = String(msg.userId || "");
        if (!userId) throw new Error("No user id.");
        let apiAction = "destroy";
        if (msg.action === "follow") apiAction = "create";
        else if (msg.action === "unfollow") apiAction = "destroy";
        else if (msg.action === "remove_follower") apiAction = "remove_follower";
        else throw new Error(`Unknown friendship action: ${msg.action}`);
        const result = await friendshipAction(userId, apiAction);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true; // async sendResponse
  }

  if (
    msg?.type === "FETCH_OWN_POSTS" ||
    msg?.type === "FETCH_LIKED" ||
    msg?.type === "ANALYZE_OWN_POSTS"
  ) {
    (async () => {
      try {
        const onProgress = (p) => {
          chrome.runtime
            .sendMessage({
              type: "PROGRESS",
              stage: "posts",
              ...p,
            })
            .catch(() => {});
        };

        // Full analysis: posts ranked + fan ranking by likes on your posts
        const result = await analyzeOwnPostsWithFans(onProgress, {
          maxPostPages: msg.maxPages ?? 6,
          maxPostsForLikers: msg.maxPostsForLikers ?? 12,
        });

        sendResponse({
          ok: true,
          posts: result.posts,
          liked: result.posts,
          topFans: result.topFans,
          postsScannedForLikers: result.postsScannedForLikers,
          me: result.me,
          finishedAt: Date.now(),
        });
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

        // Light enrich for bots heuristics only (charts use list buckets, no counts needed)
        await enrichUsersWithCounts(
          followers,
          (p) => {
            chrome.runtime
              .sendMessage({
                type: "PROGRESS",
                stage: "enrich",
                target: "followers",
                enriched: p.enriched,
                total: p.total,
                ok: p.ok,
              })
              .catch(() => {});
          },
          { max: 40, delayMs: 450 }
        );

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
