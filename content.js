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
  // Some endpoints return JSON without content-type
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The website returned a non-JSON response.");
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
    // Fallback path used by some website builds
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
    "Could not detect your account. Open instagram.com, log in, and stay on that page."
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
