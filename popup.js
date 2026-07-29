const $ = (id) => document.getElementById(id);

const startBtn = $("startBtn");
const statusEl = $("status");
const progressWrap = $("progressWrap");
const progressFill = $("progressFill");
const progressText = $("progressText");
const stats = $("stats");
const tabs = $("tabs");
const panels = $("panels");
const searchRow = $("searchRow");
const searchInput = $("searchInput");
const exportBtn = $("exportBtn");
const accountLine = $("accountLine");
const headerLogo = $("headerLogo");
const settingsBtn = $("settingsBtn");
const settingsPanel = $("settingsPanel");
const settingsClose = $("settingsClose");

const state = {
  me: null,
  following: [],
  followers: [],
  mutual: [],
  notFollowingBack: [],
  notFollowedByMe: [],
  counts: null,
  liked: [],
  activeTab: "mutual",
  activeSection: "relationships",
  query: "",
  botQuery: "",
  igTabId: null,
  lang: "en",
  statusIsIdle: true,
  likedLoaded: false,
};

const ALL_TABS = ["following", "followers", "mutual", "notBack", "notMe"];
const SECTIONS = ["relationships", "analytics", "bots", "liked"];
const sectionNav = $("sectionNav");
const loadLikedBtn = $("loadLikedBtn");
const botSearchInput = $("botSearchInput");

/* ---------- i18n ---------- */

function t(key, vars = {}) {
  const pack = I18N[state.lang] || I18N.en;
  let s = pack[key] ?? I18N.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

function applyStaticI18n() {
  document.documentElement.lang = state.lang === "de" ? "de" : "en";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    // Don't overwrite live @username in account line
    if (el.id === "accountLine" && state.me?.username) return;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;
    if (el.id === "status" && !state.statusIsIdle) return;
    el.innerHTML = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
    if (el.hasAttribute("aria-label")) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-title")));
    }
  });

  // Language toggle UI
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });

  if (!state.me?.username) {
    accountLine.textContent = t("tagline");
  }

  // Re-render dynamic lists so button labels update
  if (state.counts) {
    renderAll();
    renderAnalytics();
    renderBots();
    renderLiked();
    if (state.statusIsIdle === false && state.counts) {
      setStatus(
        t("doneSummary", {
          notBack: state.counts.notFollowingBack,
          notMe: state.counts.notFollowedByMe,
          mutual: state.counts.mutual,
        }),
        "ok"
      );
      state.statusIsIdle = false;
    }
  }
}

function switchSection(name) {
  if (!SECTIONS.includes(name)) name = "relationships";
  state.activeSection = name;

  document.querySelectorAll(".section-btn").forEach((btn) => {
    const on = btn.dataset.section === name;
    btn.classList.toggle("active", on);
  });

  for (const s of SECTIONS) {
    const el = $(`section-${s}`);
    if (!el) continue;
    el.classList.toggle("hidden", s !== name);
  }

  if (name === "analytics") renderAnalytics();
  if (name === "bots") renderBots();
  if (name === "liked") renderLiked();
}

function miniAvatar(u) {
  if (u.profilePic) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.style.width = "28px";
    img.style.height = "28px";
    img.src = u.profilePic;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    return img;
  }
  const d = placeholderAvatar(u.username);
  d.style.width = "28px";
  d.style.height = "28px";
  d.style.fontSize = "11px";
  return d;
}

function renderAnalytics() {
  const summaryEl = $("analyticsSummary");
  const ranksEl = $("analyticsRankings");
  if (!summaryEl || !ranksEl || !window.IGAnalytics) return;

  if (!state.counts) {
    summaryEl.innerHTML = `<div class="empty">${escapeHtml(t("needAnalysisFirst"))}</div>`;
    ranksEl.replaceChildren();
    return;
  }

  const A = window.IGAnalytics;
  const s = A.buildAnalyticsSummary(state);

  summaryEl.innerHTML = `
    <div class="metric"><strong>${A.formatPct(s.mutualRate)}</strong><span data-i18n-skip>${escapeHtml(t("metricMutualRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.notBackRate)}</strong><span>${escapeHtml(t("metricNotBackRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.oneWayFollowerRate)}</strong><span>${escapeHtml(t("metricOneWayFollowers"))}</span></div>
    <div class="metric"><strong>${s.coverage.followingWithFollowerCount}/${s.coverage.followingTotal}</strong><span>${escapeHtml(t("metricCoverage"))}</span></div>
  `;

  ranksEl.replaceChildren();

  const blocks = [
    {
      title: t("rankTopFollowers"),
      rows: s.topByFollowers,
      value: (u) => t("rankFollowers", { n: A.formatCount(u.followerCount) }),
    },
    {
      title: t("rankTopFollowing"),
      rows: s.topByFollowing,
      value: (u) => t("rankFollowing", { n: A.formatCount(u.followingCount) }),
    },
    {
      title: t("rankWorstRatio"),
      rows: s.worstRatio,
      value: (u) => {
        const r = A.ratioFollowingToFollowers(u);
        return t("rankRatio", { n: r != null ? r.toFixed(1) : "—" });
      },
    },
  ];

  for (const block of blocks) {
    const wrap = document.createElement("div");
    wrap.className = "rank-block";
    const h = document.createElement("h3");
    h.textContent = block.title;
    wrap.appendChild(h);

    if (!block.rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.style.padding = "12px";
      empty.textContent = t("emptyList");
      wrap.appendChild(empty);
    } else {
      block.rows.forEach((u, i) => {
        const a = document.createElement("a");
        a.className = "rank-row";
        a.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        const idx = document.createElement("span");
        idx.className = "rank-idx";
        idx.textContent = String(i + 1);
        a.appendChild(idx);
        a.appendChild(miniAvatar(u));
        const meta = document.createElement("div");
        meta.className = "rank-meta";
        meta.innerHTML = `<div class="name">@${escapeHtml(u.username)}</div><div class="sub">${escapeHtml(u.fullName || "")}</div>`;
        a.appendChild(meta);
        const val = document.createElement("span");
        val.className = "rank-val";
        val.textContent = block.value(u);
        a.appendChild(val);
        wrap.appendChild(a);
      });
    }
    ranksEl.appendChild(wrap);
  }
}

function renderBots() {
  const panel = $("panel-bots");
  if (!panel || !window.IGAnalytics) return;
  panel.replaceChildren();

  if (!state.followers.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = state.counts ? t("botNeedFollowers") : t("needAnalysisFirst");
    panel.appendChild(empty);
    return;
  }

  let list = window.IGAnalytics.sortByBotScoreDesc(state.followers);
  const q = state.botQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q)
    );
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noSearchResults");
    panel.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const u of list.slice(0, 200)) {
    const row = document.createElement("div");
    row.className = "user-card";
    row.dataset.userId = u.id;

    const link = document.createElement("a");
    link.className = "user-link";
    link.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.appendChild(buildAvatar(u));
    const meta = document.createElement("div");
    meta.className = "user-meta";
    const iFollow = state.following.some((x) => x.id === u.id);
    const sub = [
      u.followerCount != null
        ? `${window.IGAnalytics.formatCount(u.followerCount)} fl.`
        : null,
      u.followingCount != null
        ? `${window.IGAnalytics.formatCount(u.followingCount)} fg.`
        : null,
      (u.botReasons || []).slice(0, 2).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
    meta.innerHTML = `<div class="name">@${escapeHtml(u.username)}</div><div class="full">${escapeHtml(sub)}</div>`;
    link.appendChild(meta);
    row.appendChild(link);

    const actions = document.createElement("div");
    actions.className = "user-actions";

    const pill = document.createElement("span");
    pill.className =
      "score-pill " + (u.botScore >= 55 ? "high" : u.botScore >= 30 ? "mid" : "low");
    pill.textContent = t("botScore", { n: u.botScore });
    actions.appendChild(pill);

    // Remove from your followers (they no longer follow you)
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn action remove-follower";
    removeBtn.textContent = t("removeFollower");
    removeBtn.title = t("removeFollowerUser", { user: u.username });
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFriendship(u, "remove_follower", "bots", removeBtn, row);
    });
    actions.appendChild(removeBtn);

    // Unfollow if you follow them
    if (iFollow) {
      const unf = document.createElement("button");
      unf.type = "button";
      unf.className = "btn action unfollow";
      unf.textContent = t("unfollow");
      unf.title = t("unfollowUser", { user: u.username });
      unf.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFriendship(u, "unfollow", "bots", unf, row);
      });
      actions.appendChild(unf);
    }

    row.appendChild(actions);
    frag.appendChild(row);
  }
  panel.appendChild(frag);
}

function renderPostsSummary() {
  const el = $("postsSummary");
  if (!el) return;
  if (!state.liked.length) {
    el.classList.add("hidden");
    el.replaceChildren();
    return;
  }
  const likes = state.liked.map((p) => p.likeCount).filter((n) => n != null);
  const comments = state.liked.map((p) => p.commentCount).filter((n) => n != null);
  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const fmt = window.IGAnalytics?.formatCount || ((n) => String(n ?? "—"));
  const avgL = avg(likes);
  const avgC = avg(comments);
  const topL = likes.length ? Math.max(...likes) : null;
  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="metric"><strong>${fmt(state.liked.length)}</strong><span>${escapeHtml(t("metricPostCount"))}</span></div>
    <div class="metric"><strong>${avgL != null ? fmt(avgL) : "—"}</strong><span>${escapeHtml(t("metricAvgLikes"))}</span></div>
    <div class="metric"><strong>${avgC != null ? fmt(avgC) : "—"}</strong><span>${escapeHtml(t("metricAvgComments"))}</span></div>
    <div class="metric"><strong>${topL != null ? fmt(topL) : "—"}</strong><span>${escapeHtml(t("metricTopLikes"))}</span></div>
  `;
}

function renderLiked() {
  const panel = $("panel-liked");
  if (!panel) return;
  panel.replaceChildren();
  renderPostsSummary();

  if (!state.likedLoaded && !state.liked.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("postsHint");
    panel.appendChild(empty);
    return;
  }

  if (!state.liked.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("likedEmpty");
    panel.appendChild(empty);
    return;
  }

  const fmt = window.IGAnalytics?.formatCount || ((n) => String(n ?? "—"));
  const frag = document.createDocumentFragment();
  state.liked.forEach((post, i) => {
    const a = document.createElement("a");
    a.className = "liked-card";
    a.href = post.permalink || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const idx = document.createElement("span");
    idx.className = "rank-idx";
    idx.textContent = String(i + 1);
    a.appendChild(idx);

    if (post.thumb) {
      const img = document.createElement("img");
      img.className = "liked-thumb";
      img.src = post.thumb;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      a.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "liked-thumb";
      a.appendChild(ph);
    }

    const meta = document.createElement("div");
    meta.className = "liked-meta";
    const cap = (post.caption || "").slice(0, 100);
    const statsLine = [
      post.likeCount != null ? t("postsLikes", { n: fmt(post.likeCount) }) : null,
      post.commentCount != null
        ? t("postsComments", { n: fmt(post.commentCount) })
        : null,
      post.playCount != null ? t("postsViews", { n: fmt(post.playCount) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    meta.innerHTML = `<div class="author">${escapeHtml(statsLine || "—")}</div><div class="caption">${escapeHtml(cap || "(no caption)")}</div>`;
    a.appendChild(meta);
    frag.appendChild(a);
  });
  panel.appendChild(frag);
}

async function loadLikedPosts() {
  if (!loadLikedBtn) return;
  loadLikedBtn.disabled = true;
  setStatus(t("loadingLiked"));
  try {
    const tabId = await resolveIgTabId();
    if (!tabId) throw new Error(t("noIgTab"));
    await ensureContentScript(tabId);
    // Own posts feed (liked endpoint often returns HTTP 400 on web)
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "FETCH_OWN_POSTS",
      mode: "own",
      maxPages: 10,
    });
    if (!res?.ok) throw new Error(res?.error || t("actionFailed"));
    state.liked = res.posts || res.liked || [];
    state.likedLoaded = true;
    try {
      await chrome.storage.local.set({
        lastLiked: { liked: state.liked, mode: "own", finishedAt: Date.now() },
      });
    } catch {
      /* ignore */
    }
    renderLiked();
    setStatus(t("likedLoaded", { n: state.liked.length }), "ok");
  } catch (err) {
    setStatus(escapeHtml(err?.message || String(err)), "error");
  } finally {
    loadLikedBtn.disabled = false;
  }
}

async function setLanguage(lang) {
  if (!I18N[lang]) return;
  state.lang = lang;
  try {
    await chrome.storage.local.set({ lang });
  } catch {
    /* ignore */
  }
  applyStaticI18n();
}

/* ---------- header / UI helpers ---------- */

function setHeaderLogoFallback() {
  if (!headerLogo) return;
  headerLogo.classList.remove("has-photo");
  headerLogo.innerHTML = '<span class="logo-fallback">IG</span>';
}

function setHeaderAccount(me) {
  if (!me?.username) {
    accountLine.textContent = t("tagline");
    setHeaderLogoFallback();
    return;
  }

  accountLine.textContent = `@${me.username}`;
  if (!headerLogo) return;

  const pic = me.profilePicData || me.profilePic;
  if (!pic) {
    setHeaderLogoFallback();
    return;
  }

  const img = document.createElement("img");
  img.className = "logo-photo";
  img.alt = `@${me.username}`;
  img.src = pic;
  img.addEventListener(
    "error",
    async () => {
      if (me.profilePic && !me.profilePicData) {
        try {
          const tabId = await resolveIgTabId();
          if (tabId) {
            await ensureContentScript(tabId);
            const res = await chrome.tabs.sendMessage(tabId, {
              type: "FETCH_AVATAR",
              url: me.profilePic,
            });
            if (res?.ok && res.dataUrl) {
              me.profilePicData = res.dataUrl;
              img.src = res.dataUrl;
              return;
            }
          }
        } catch {
          /* fallback */
        }
      }
      setHeaderLogoFallback();
    },
    { once: true }
  );
  img.addEventListener(
    "load",
    () => {
      headerLogo.classList.add("has-photo");
      headerLogo.replaceChildren(img);
    },
    { once: true }
  );

  headerLogo.classList.add("has-photo");
  headerLogo.replaceChildren(img);
}

function setStatus(text, kind = "") {
  statusEl.innerHTML = text;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
  state.statusIsIdle = false;
}

function setIdleStatus() {
  statusEl.innerHTML = t("statusIdle");
  statusEl.className = "status";
  state.statusIsIdle = true;
}

function show(el, yes = true) {
  el.classList.toggle("hidden", !yes);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function placeholderAvatar(username) {
  const d = document.createElement("div");
  d.className = "avatar placeholder";
  d.textContent = (username || "?").slice(0, 1).toUpperCase();
  return d;
}

function buildAvatar(u) {
  const wrap = document.createElement("div");
  wrap.className = "avatar-wrap";

  if (!u.profilePic) {
    wrap.appendChild(placeholderAvatar(u.username));
    return wrap;
  }

  const img = document.createElement("img");
  img.className = "avatar";
  img.src = u.profilePic;
  img.alt = `@${u.username}`;
  img.referrerPolicy = "no-referrer";
  img.loading = "lazy";
  img.decoding = "async";

  img.onerror = async () => {
    img.onerror = null;
    try {
      const tabId = await resolveIgTabId();
      if (!tabId) {
        img.replaceWith(placeholderAvatar(u.username));
        return;
      }
      await ensureContentScript(tabId);
      const res = await chrome.tabs.sendMessage(tabId, {
        type: "FETCH_AVATAR",
        url: u.profilePic,
      });
      if (res?.ok && res.dataUrl) {
        img.src = res.dataUrl;
        u.profilePicData = res.dataUrl;
      } else {
        img.replaceWith(placeholderAvatar(u.username));
      }
    } catch {
      img.replaceWith(placeholderAvatar(u.username));
    }
  };

  if (u.profilePicData) {
    img.src = u.profilePicData;
  }

  wrap.appendChild(img);
  return wrap;
}

/**
 * @param {object} u
 * @param {"mutual"|"notBack"|"notMe"} listKey
 */
function userCard(u, listKey) {
  const row = document.createElement("div");
  row.className = "user-card";
  row.dataset.userId = u.id;

  const link = document.createElement("a");
  link.className = "user-link";
  link.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = t("openProfile", { user: u.username });

  link.appendChild(buildAvatar(u));

  const meta = document.createElement("div");
  meta.className = "user-meta";
  meta.innerHTML = `
    <div class="name">@${escapeHtml(u.username)}</div>
    <div class="full">${escapeHtml(u.fullName || "")}</div>
  `;
  link.appendChild(meta);
  row.appendChild(link);

  const actions = document.createElement("div");
  actions.className = "user-actions";

  if (u.isPrivate) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t("private");
    actions.appendChild(tag);
  }

  const canUnfollow =
    listKey === "notBack" || listKey === "following" || listKey === "mutual";
  const canFollow =
    listKey === "notMe" ||
    (listKey === "followers" && !state.following.some((x) => x.id === u.id));

  if (canUnfollow) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn action unfollow";
    btn.textContent = t("unfollow");
    btn.title = t("unfollowUser", { user: u.username });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFriendship(u, "unfollow", listKey, btn, row);
    });
    actions.appendChild(btn);
  }

  if (canFollow) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn action follow";
    btn.textContent = t("follow");
    btn.title = t("followUser", { user: u.username });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFriendship(u, "follow", listKey, btn, row);
    });
    actions.appendChild(btn);
  }

  row.appendChild(actions);
  return row;
}

async function handleFriendship(u, action, listKey, btn, row) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "…";

  try {
    const tabId = await resolveIgTabId();
    if (!tabId) {
      throw new Error(t("noIgTab"));
    }
    await ensureContentScript(tabId);
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "FRIENDSHIP",
      action,
      userId: u.id,
    });

    if (!res?.ok) {
      throw new Error(res?.error || t("actionFailed"));
    }

    if (action === "follow" && res.outgoingRequest && !res.following) {
      btn.textContent = t("requested");
      btn.classList.add("done");
      setStatus(t("followRequestSent", { user: escapeHtml(u.username) }), "ok");
      // pending request: remove from "you don't follow" views
      removeUserFromLists(u.id, ["notMe"]);
      row.classList.add("removing");
      setTimeout(() => {
        row.remove();
        refreshPanelsAfterAction();
      }, 180);
      updateBadgesAndStats();
      persistState();
      return;
    }

    if (action === "remove_follower") {
      // They no longer follow you
      removeUserFromLists(u.id, ["followers", "mutual", "notMe", "notFollowedByMe"]);
      // If you still follow them → not following back
      if (state.following.some((x) => x.id === u.id)) {
        if (!state.notFollowingBack.some((x) => x.id === u.id)) {
          state.notFollowingBack.push(u);
          state.notFollowingBack.sort((a, b) =>
            a.username.localeCompare(b.username, undefined, {
              sensitivity: "base",
            })
          );
        }
      }
      if (state.counts) {
        state.counts.followers = state.followers.length;
        state.counts.mutual = state.mutual.length;
        state.counts.notFollowedByMe = state.notFollowedByMe.length;
        state.counts.notFollowingBack = state.notFollowingBack.length;
      }
      setStatus(t("followerRemoved", { user: escapeHtml(u.username) }), "ok");
      row.classList.add("removing");
      setTimeout(() => {
        row.remove();
        refreshPanelsAfterAction();
      }, 180);
      updateBadgesAndStats();
      persistState();
      return;
    }

    if (action === "unfollow") {
      // Remove from following-related lists; keep on followers if they still follow
      removeUserFromLists(u.id, ["following", "mutual", "notBack"]);
      if (state.counts) {
        state.counts.following = state.following.length;
        state.counts.mutual = state.mutual.length;
        state.counts.notFollowingBack = state.notFollowingBack.length;
        // if they follow you, they belong in notFollowedByMe now
        if (state.followers.some((x) => x.id === u.id)) {
          if (!state.notFollowedByMe.some((x) => x.id === u.id)) {
            state.notFollowedByMe.push(u);
            state.notFollowedByMe.sort((a, b) =>
              a.username.localeCompare(b.username, undefined, {
                sensitivity: "base",
              })
            );
          }
          state.counts.notFollowedByMe = state.notFollowedByMe.length;
        }
      }
      setStatus(t("unfollowed", { user: escapeHtml(u.username) }), "ok");
      // From bots list: stay visible (still a follower) but drop unfollow control
      if (listKey === "bots") {
        updateBadgesAndStats();
        persistState();
        renderBots();
        return;
      }
    } else {
      // follow: add to following; if they follow you → mutual, else notBack
      if (!state.following.some((x) => x.id === u.id)) {
        state.following.push(u);
        state.following.sort((a, b) =>
          a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
        );
      }
      removeUserFromLists(u.id, ["notMe", "notFollowedByMe"]);
      const theyFollow = state.followers.some((x) => x.id === u.id);
      if (theyFollow) {
        if (!state.mutual.some((x) => x.id === u.id)) {
          state.mutual.push(u);
          state.mutual.sort((a, b) =>
            a.username.localeCompare(b.username, undefined, {
              sensitivity: "base",
            })
          );
        }
        removeUserFromLists(u.id, ["notBack"]);
      } else if (!state.notFollowingBack.some((x) => x.id === u.id)) {
        state.notFollowingBack.push(u);
        state.notFollowingBack.sort((a, b) =>
          a.username.localeCompare(b.username, undefined, {
            sensitivity: "base",
          })
        );
      }
      if (state.counts) {
        state.counts.following = state.following.length;
        state.counts.mutual = state.mutual.length;
        state.counts.notFollowingBack = state.notFollowingBack.length;
        state.counts.notFollowedByMe = state.notFollowedByMe.length;
      }
      setStatus(t("nowFollowing", { user: escapeHtml(u.username) }), "ok");
    }

    row.classList.add("removing");
    setTimeout(() => {
      row.remove();
      refreshPanelsAfterAction();
    }, 180);

    updateBadgesAndStats();
    persistState();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = label;
    setStatus(escapeHtml(err?.message || String(err)), "error");
  }
}

function listForKey(key) {
  if (key === "following") return state.following;
  if (key === "followers") return state.followers;
  if (key === "mutual") return state.mutual;
  if (key === "notBack") return state.notFollowingBack;
  return state.notFollowedByMe;
}

function removeUserFromLists(userId, keys) {
  const filter = (arr) => arr.filter((x) => x.id !== userId);
  for (const key of keys) {
    if (key === "following") state.following = filter(state.following);
    if (key === "followers") state.followers = filter(state.followers);
    if (key === "mutual") state.mutual = filter(state.mutual);
    if (key === "notBack") state.notFollowingBack = filter(state.notFollowingBack);
    if (key === "notMe" || key === "notFollowedByMe") {
      state.notFollowedByMe = filter(state.notFollowedByMe);
    }
  }
  if (state.counts) {
    state.counts.following = state.following.length;
    state.counts.followers = state.followers.length;
    state.counts.mutual = state.mutual.length;
    state.counts.notFollowingBack = state.notFollowingBack.length;
    state.counts.notFollowedByMe = state.notFollowedByMe.length;
  }
}

function panelIdFor(key) {
  return `panel-${key}`;
}

function refreshPanelsAfterAction() {
  renderAll();
  // keep current tab visible after re-render
  switchTab(state.activeTab, { force: true });
}

function updateBadgesAndStats() {
  if (!state.counts) return;
  $("statFollowing").textContent = state.counts.following;
  $("statFollowers").textContent = state.counts.followers;
  $("badgeMutual").textContent = state.counts.mutual;
  $("badgeNotBack").textContent = state.counts.notFollowingBack;
  $("badgeNotMe").textContent = state.counts.notFollowedByMe;
}

async function persistState() {
  if (!state.counts || !state.me) return;
  const result = {
    type: "RESULT",
    ok: true,
    me: state.me,
    counts: state.counts,
    following: state.following,
    followers: state.followers,
    mutual: state.mutual,
    notFollowingBack: state.notFollowingBack,
    notFollowedByMe: state.notFollowedByMe,
    finishedAt: Date.now(),
  };
  try {
    await chrome.storage.local.set({ lastResult: result });
  } catch {
    /* ignore */
  }
}

function filtered(list) {
  const q = state.query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (u) =>
      u.username.toLowerCase().includes(q) ||
      (u.fullName || "").toLowerCase().includes(q)
  );
}

function renderPanel(panelId, list, listKey) {
  const panel = $(panelId);
  panel.replaceChildren();
  const items = filtered(list);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = state.query ? t("noSearchResults") : t("emptyList");
    panel.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const u of items) frag.appendChild(userCard(u, listKey));
  panel.appendChild(frag);
}

function renderAll() {
  renderPanel("panel-following", state.following, "following");
  renderPanel("panel-followers", state.followers, "followers");
  renderPanel("panel-mutual", state.mutual, "mutual");
  renderPanel("panel-notBack", state.notFollowingBack, "notBack");
  renderPanel("panel-notMe", state.notFollowedByMe, "notMe");
}

function switchTab(name, { force = false } = {}) {
  if (!ALL_TABS.includes(name)) name = "mutual";
  if (!force && state.activeTab === name) {
    // still ensure panels match
  }
  state.activeTab = name;

  // Top tiles (following / followers)
  document.querySelectorAll(".stat-btn").forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  // Bottom relationship tabs
  document.querySelectorAll("#tabs .tab").forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  for (const key of ALL_TABS) {
    const panel = $(panelIdFor(key));
    if (!panel) continue;
    const on = key === name;
    panel.classList.toggle("active", on);
    panel.hidden = !on;
  }
}

async function getIgTab() {
  const tabsFound = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tab = tabsFound[0];
  if (!tab?.id || !tab.url?.includes("instagram.com")) {
    const all = await chrome.tabs.query({ url: "https://www.instagram.com/*" });
    if (all[0]?.id) {
      state.igTabId = all[0].id;
      return all[0];
    }
    throw new Error(t("openIgFirst"));
  }
  state.igTabId = tab.id;
  return tab;
}

async function resolveIgTabId() {
  if (state.igTabId) {
    try {
      const tTab = await chrome.tabs.get(state.igTabId);
      if (tTab?.url?.includes("instagram.com")) return state.igTabId;
    } catch {
      state.igTabId = null;
    }
  }
  try {
    const tab = await getIgTab();
    return tab.id;
  } catch {
    return null;
  }
}

async function ensureContentScript(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (res?.ok) return;
  } catch {
    /* inject */
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

function formatProgress(msg) {
  if (msg.stage === "user" && msg.me) {
    return t("progressAccount", { user: msg.me.username });
  }
  if (msg.stage === "following") {
    const total =
      msg.total != null ? t("totalApprox", { n: msg.total }) : "";
    return t("progressFollowing", { loaded: msg.loaded ?? 0, total });
  }
  if (msg.stage === "followers") {
    const total =
      msg.total != null ? t("totalApprox", { n: msg.total }) : "";
    return t("progressFollowers", { loaded: msg.loaded ?? 0, total });
  }
  return msg.message || t("loading");
}

function onProgress(msg) {
  show(progressWrap, true);
  if (msg.stage === "user" && msg.me) {
    state.me = msg.me;
    setHeaderAccount(msg.me);
    progressFill.style.width = "10%";
  }
  if (msg.stage === "following") {
    progressFill.style.width = "40%";
  }
  if (msg.stage === "followers") {
    progressFill.style.width = "75%";
  }
  if (msg.stage === "liked" || msg.stage === "posts") {
    progressFill.style.width = "50%";
    const text = t("progressLiked", { loaded: msg.loaded ?? 0 });
    progressText.textContent = text;
    setStatus(text);
    return;
  }
  const text = formatProgress(msg);
  progressText.textContent = text.replace(/<[^>]+>/g, "");
  setStatus(text);
}

function onResult(msg, { keepTab = false } = {}) {
  startBtn.disabled = false;
  show(progressWrap, false);

  if (!msg.ok) {
    setStatus(escapeHtml(msg.error || t("unknownError")), "error");
    return;
  }

  state.me = msg.me;
  state.following = msg.following || [];
  state.followers = msg.followers || [];
  state.mutual = msg.mutual || [];
  state.notFollowingBack = msg.notFollowingBack || [];
  state.notFollowedByMe = msg.notFollowedByMe || [];
  state.counts = msg.counts;

  // Older cached results may lack full lists — rebuild when possible
  if (!state.following.length && state.mutual.length) {
    const map = new Map();
    for (const u of [...state.mutual, ...state.notFollowingBack]) map.set(u.id, u);
    state.following = [...map.values()].sort((a, b) =>
      a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
    );
  }
  if (!state.followers.length && state.mutual.length) {
    const map = new Map();
    for (const u of [...state.mutual, ...state.notFollowedByMe]) map.set(u.id, u);
    state.followers = [...map.values()].sort((a, b) =>
      a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
    );
  }
  if (state.counts) {
    state.counts.following = state.following.length || state.counts.following;
    state.counts.followers = state.followers.length || state.counts.followers;
  }

  setHeaderAccount(msg.me);
  updateBadgesAndStats();

  show(stats, true);
  show(tabs, true);
  show(searchRow, true);
  show(panels, true);
  show(sectionNav, true);
  renderAll();
  renderAnalytics();
  renderBots();
  if (!keepTab) switchTab("mutual");
  else switchTab(state.activeTab || "mutual", { force: true });
  switchSection(state.activeSection || "relationships");

  setStatus(
    t("doneSummary", {
      notBack: msg.counts.notFollowingBack,
      notMe: msg.counts.notFollowedByMe,
      mutual: msg.counts.mutual,
    }),
    "ok"
  );
}

/* ---------- settings ---------- */

function openSettings() {
  show(settingsPanel, true);
  settingsBtn?.setAttribute("aria-expanded", "true");
}

function closeSettings() {
  show(settingsPanel, false);
  settingsBtn?.setAttribute("aria-expanded", "false");
}

settingsBtn?.addEventListener("click", () => {
  if (settingsPanel.classList.contains("hidden")) openSettings();
  else closeSettings();
});
settingsClose?.addEventListener("click", closeSettings);

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
});

/* ---------- messaging / init ---------- */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PROGRESS") onProgress(msg);
  if (msg?.type === "RESULT") onResult(msg);
});

async function init() {
  const stored = await chrome.storage.local.get(["lang", "lastResult", "lastLiked"]);
  if (stored.lang && I18N[stored.lang]) {
    state.lang = stored.lang;
  }
  applyStaticI18n();
  show(sectionNav, true);

  if (stored.lastLiked?.liked?.length) {
    state.liked = stored.lastLiked.liked;
    state.likedLoaded = true;
    renderLiked();
  }

  if (stored.lastResult?.ok) {
    onResult(stored.lastResult, { keepTab: true });
    if (stored.lastResult.finishedAt) {
      const agoMin = Math.round(
        (Date.now() - stored.lastResult.finishedAt) / 60000
      );
      const ago =
        agoMin > 0 ? t("lastResultAgo", { n: agoMin }) : "";
      setStatus(t("lastResult", { ago }), "ok");
    }
  }

  loadHeaderAccount();
}

async function loadHeaderAccount() {
  try {
    const tabId = await resolveIgTabId();
    if (!tabId) return;
    await ensureContentScript(tabId);
    const res = await chrome.tabs.sendMessage(tabId, { type: "GET_ME" });
    if (res?.ok && res.me) {
      state.me = { ...(state.me || {}), ...res.me };
      setHeaderAccount(state.me);
    }
  } catch {
    /* no IG tab */
  }
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  show(progressWrap, true);
  progressFill.style.width = "8%";
  progressText.textContent = t("connecting");
  setStatus(t("starting"));
  closeSettings();

  try {
    const tab = await getIgTab();
    await ensureContentScript(tab.id);
    const res = await chrome.tabs.sendMessage(tab.id, { type: "ANALYZE" });
    if (!res?.started && res?.error) {
      throw new Error(res.error);
    }
    progressText.textContent = t("loadingLists");
  } catch (err) {
    startBtn.disabled = false;
    show(progressWrap, false);
    setStatus(err?.message || String(err), "error");
  }
});

document.querySelectorAll("#tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".stat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchSection("relationships");
    switchTab(btn.dataset.tab);
  });
});

document.querySelectorAll(".section-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchSection(btn.dataset.section));
});

loadLikedBtn?.addEventListener("click", () => loadLikedPosts());

botSearchInput?.addEventListener("input", () => {
  state.botQuery = botSearchInput.value;
  renderBots();
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderAll();
  switchTab(state.activeTab, { force: true });
});

exportBtn.addEventListener("click", () => {
  if (!state.counts) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    account: state.me,
    counts: state.counts,
    following: state.following,
    followers: state.followers,
    mutual: state.mutual,
    notFollowingBack: state.notFollowingBack,
    notFollowedByMe: state.notFollowedByMe,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instagram-follow-check-${state.me?.username || "export"}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

init();
