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
  topFans: [],
  postsScannedForLikers: 0,
  postsTopic: "posts",
  postsQuery: "",
  activeTab: "mutual",
  activeSection: "relationships",
  analyticsTopic: "topFollowers",
  analyticsQuery: "",
  analyticsCache: null,
  query: "",
  botQuery: "",
  igTabId: null,
  lang: "en",
  statusIsIdle: true,
  likedLoaded: false,
  analysisRuns: 0,
  postsLoads: 0,
  analysisRunning: false,
  impersonating: false,
  impersonatorUsername: "",
  readOnly: false,
  viewer: null,
};

const impersonatorToggle = $("impersonatorToggle");
const impersonatorUsername = $("impersonatorUsername");
const impersonatorBanner = $("impersonatorBanner");
const impersonatorBannerUser = $("impersonatorBannerUser");

function isReadOnly() {
  return Boolean(state.readOnly || state.impersonating);
}

function updateImpersonatorUi() {
  const on = Boolean(state.impersonating);
  if (impersonatorToggle) impersonatorToggle.checked = on;
  if (impersonatorUsername) {
    impersonatorUsername.disabled = !on;
    if (state.impersonatorUsername) {
      impersonatorUsername.value = state.impersonatorUsername;
    }
  }
  if (impersonatorBanner) {
    show(impersonatorBanner, on);
    if (impersonatorBannerUser) {
      const name = state.me?.username || state.impersonatorUsername || "…";
      impersonatorBannerUser.textContent = t("impersonatorBannerUser", {
        user: name,
      });
    }
  }
  // Hide action-heavy bots tools label already; renderers check isReadOnly()
}

async function persistImpersonatorSettings() {
  try {
    await chrome.storage.local.set({
      impersonating: state.impersonating,
      impersonatorUsername: state.impersonatorUsername,
    });
  } catch {
    /* ignore */
  }
}

const BOT_SCORE_MIN = 25;
const tipModal = $("tipModal");
const tipModalContinue = $("tipModalContinue");
const tipModalCancel = $("tipModalCancel");
let tipModalResolver = null;

const ALL_TABS = ["following", "followers", "mutual", "notBack", "notMe"];
const SECTIONS = ["relationships", "analytics", "bots", "liked", "admire"];
const sectionNav = $("sectionNav");
const botSearchInput = $("botSearchInput");
const navAdmire = $("navAdmire");
let logoClickCount = 0;
let logoClickTimer = null;

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

function unlockAdmireTab() {
  if (!navAdmire || !sectionNav) return;
  navAdmire.classList.remove("hidden");
  sectionNav.classList.add("has-secret");
  setStatus(t("admireUnlocked"), "ok");
}

function switchSection(name) {
  if (!SECTIONS.includes(name)) name = "relationships";
  // Guard secret tab if still locked
  if (name === "admire" && navAdmire?.classList.contains("hidden")) {
    name = "relationships";
  }
  state.activeSection = name;

  document.querySelectorAll(".section-btn").forEach((btn) => {
    if (btn.classList.contains("hidden")) return;
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
  // posts + admire are static "coming soon" panels
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

function getAnalyticsTopicMeta() {
  const A = window.IGAnalytics;
  if (!A || !state.analyticsCache) return null;
  const s = state.analyticsCache;
  const topics = {
    topFollowers: {
      key: "topFollowers",
      title: t("rankTopFollowers"),
      rows: s.topByFollowers,
      value: (u) => t("rankFollowers", { n: A.formatCount(u.followerCount) }),
    },
    topFollowing: {
      key: "topFollowing",
      title: t("rankTopFollowing"),
      rows: s.topByFollowing,
      value: (u) => t("rankFollowing", { n: A.formatCount(u.followingCount) }),
    },
    worstRatio: {
      key: "worstRatio",
      title: t("rankWorstRatio"),
      rows: s.worstRatio,
      value: (u) => {
        const r = A.ratioFollowingToFollowers(u);
        return t("rankRatio", { n: r != null ? r.toFixed(1) : "—" });
      },
    },
  };
  return topics[state.analyticsTopic] || topics.topFollowers;
}

function switchAnalyticsTopic(topic) {
  if (!["topFollowers", "topFollowing", "worstRatio"].includes(topic)) {
    topic = "topFollowers";
  }
  state.analyticsTopic = topic;
  document.querySelectorAll("[data-analytics-topic]").forEach((btn) => {
    const on = btn.dataset.analyticsTopic === topic;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  renderAnalyticsList();
}

function renderAnalyticsSummaryOnly() {
  const summaryEl = $("analyticsSummary");
  const topicsEl = $("analyticsTopics");
  const searchRow = $("analyticsSearchRow");
  if (!summaryEl || !window.IGAnalytics) return;

  if (!state.counts) {
    summaryEl.innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(t("needAnalysisFirst"))}</div>`;
    show(topicsEl, false);
    show(searchRow, false);
    const panel = $("panel-analytics");
    if (panel) {
      panel.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("needAnalysisFirst");
      panel.appendChild(empty);
    }
    state.analyticsCache = null;
    return;
  }

  const A = window.IGAnalytics;
  const s = A.buildAnalyticsSummary(state);
  state.analyticsCache = s;

  const cov = s.coverage.followingWithFollowerCount;
  const total = s.coverage.followingTotal;
  summaryEl.innerHTML = `
    <div class="metric"><strong>${A.formatPct(s.mutualRate)}</strong><span>${escapeHtml(t("metricMutualRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.notBackRate)}</strong><span>${escapeHtml(t("metricNotBackRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.oneWayFollowerRate)}</strong><span>${escapeHtml(t("metricOneWayFollowers"))}</span></div>
    <div class="metric"><strong>${cov}/${total}</strong><span>${escapeHtml(t("metricCoverage"))}</span></div>
  `;

  const b1 = $("badgeTopFollowers");
  const b2 = $("badgeTopFollowing");
  const b3 = $("badgeWorstRatio");
  if (b1) b1.textContent = String(s.topByFollowers.length);
  if (b2) b2.textContent = String(s.topByFollowing.length);
  if (b3) b3.textContent = String(s.worstRatio.length);

  show(topicsEl, true);
  show(searchRow, true);

  // Empty ranking lists → explain enrich / private accounts
  if (
    s.topByFollowers.length === 0 &&
    s.topByFollowing.length === 0 &&
    s.worstRatio.length === 0
  ) {
    const panel = $("panel-analytics");
    if (panel) {
      panel.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("analyticsNoCounts");
      panel.appendChild(empty);
    }
    document.querySelectorAll("[data-analytics-topic]").forEach((btn) => {
      const on = btn.dataset.analyticsTopic === state.analyticsTopic;
      btn.classList.toggle("active", on);
    });
    return;
  }

  switchAnalyticsTopic(state.analyticsTopic);
}

function renderAnalyticsList() {
  const panel = $("panel-analytics");
  if (!panel || !window.IGAnalytics) return;
  panel.replaceChildren();

  const topic = getAnalyticsTopicMeta();
  if (!topic) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("needAnalysisFirst");
    panel.appendChild(empty);
    return;
  }

  let rows = topic.rows || [];
  const q = state.analyticsQuery.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q)
    );
  }

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = q ? t("noSearchResults") : t("emptyList");
    panel.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  rows.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "user-card";

    const link = document.createElement("a");
    link.className = "user-link";
    link.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = t("openProfile", { user: u.username });

    const idx = document.createElement("span");
    idx.className = "rank-idx";
    idx.textContent = String(i + 1);
    link.appendChild(idx);
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
    const val = document.createElement("span");
    val.className = "rank-val";
    val.textContent = topic.value(u);
    actions.appendChild(val);
    row.appendChild(actions);
    frag.appendChild(row);
  });
  panel.appendChild(frag);
}

function renderAnalytics() {
  renderAnalyticsSummaryOnly();
}

function exportAnalyticsList() {
  const topic = getAnalyticsTopicMeta();
  if (!topic) return;
  let rows = topic.rows || [];
  const q = state.analyticsQuery.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q)
    );
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    section: "analytics",
    topic: topic.key,
    topicTitle: topic.title,
    account: state.me,
    query: state.analyticsQuery || null,
    count: rows.length,
    users: rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instagram-analytics-${topic.key}-${state.me?.username || "export"}.json`;
  a.click();
  URL.revokeObjectURL(url);
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

  // Hide low-risk accounts (score < 25) — most likely not bots
  let list = window.IGAnalytics.sortByBotScoreDesc(state.followers).filter(
    (u) => (u.botScore ?? 0) >= BOT_SCORE_MIN
  );
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
    empty.textContent = q ? t("noSearchResults") : t("botsNoneAboveThreshold");
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

    if (!isReadOnly()) {
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
    }

    row.appendChild(actions);
    frag.appendChild(row);
  }
  panel.appendChild(frag);
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
    !isReadOnly() &&
    (listKey === "notBack" || listKey === "following" || listKey === "mutual");
  const canFollow =
    !isReadOnly() &&
    (listKey === "notMe" ||
      (listKey === "followers" && !state.following.some((x) => x.id === u.id)));

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
  if (isReadOnly()) {
    setStatus(t("impersonatorReadOnly"), "error");
    return;
  }
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
  if (msg.stage === "enrich") {
    return t("progressEnrich", {
      target: msg.target || "",
      enriched: msg.enriched ?? 0,
      total: msg.total ?? 0,
    });
  }
  return msg.message || t("loading");
}

/** Confirm re-run / second heavy action with tip popover */
function askTipConfirm() {
  return new Promise((resolve) => {
    tipModalResolver = resolve;
    if (!tipModal) {
      resolve(true);
      return;
    }
    // Refresh i18n inside modal
    tipModal.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    tipModal.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (key) el.innerHTML = t(key);
    });
    show(tipModal, true);
  });
}

function closeTipModal(result) {
  show(tipModal, false);
  if (tipModalResolver) {
    const r = tipModalResolver;
    tipModalResolver = null;
    r(result);
  }
}

function onProgress(msg) {
  show(progressWrap, true);
  if (msg.stage === "user" && msg.me) {
    state.me = msg.me;
    setHeaderAccount(msg.me);
    progressFill.style.width = "8%";
  }
  if (msg.stage === "following") {
    progressFill.style.width = "28%";
  }
  if (msg.stage === "followers") {
    progressFill.style.width = "48%";
  }
  if (msg.stage === "enrich") {
    const base = msg.target === "followers" ? 72 : 55;
    const frac =
      msg.total > 0 ? (msg.enriched || 0) / msg.total : 0;
    progressFill.style.width = `${base + Math.round(frac * 12)}%`;
  }
  if (msg.stage === "liked" || msg.stage === "posts") {
    if (msg.phase === "likers") {
      progressFill.style.width = `${30 + Math.round((60 * (msg.postIndex || 0)) / Math.max(1, msg.postTotal || 1))}%`;
      const text = t("progressLikers", {
        i: msg.postIndex || 0,
        n: msg.postTotal || 0,
        fans: msg.fans || 0,
      });
      progressText.textContent = text.replace(/<[^>]+>/g, "");
      setStatus(text);
      return;
    }
    progressFill.style.width = "35%";
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
  state.analysisRunning = false;
  show(progressWrap, false);

  if (!msg.ok) {
    setStatus(escapeHtml(msg.error || t("unknownError")), "error");
    return;
  }

  state.me = msg.me;
  state.viewer = msg.viewer || null;
  state.readOnly = Boolean(msg.readOnly || msg.impersonating);
  state.impersonating = Boolean(msg.impersonating);
  if (msg.me?.username && state.impersonating) {
    state.impersonatorUsername = msg.me.username;
  }
  state.following = msg.following || [];
  state.followers = msg.followers || [];
  state.mutual = msg.mutual || [];
  state.notFollowingBack = msg.notFollowingBack || [];
  state.notFollowedByMe = msg.notFollowedByMe || [];
  state.counts = msg.counts;
  updateImpersonatorUi();

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
  // Always refresh derived sections from the same global result
  state.analyticsCache = null;
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
    }) +
      " " +
      t("doneGlobalHint"),
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
  const stored = await chrome.storage.local.get([
    "lang",
    "lastResult",
    "lastLiked",
    "impersonating",
    "impersonatorUsername",
  ]);
  if (stored.lang && I18N[stored.lang]) {
    state.lang = stored.lang;
  }
  state.impersonating = Boolean(stored.impersonating);
  state.impersonatorUsername = stored.impersonatorUsername || "";
  // Don't keep stale readOnly from old result if impersonator off
  applyStaticI18n();
  updateImpersonatorUi();
  show(sectionNav, true);

  // Secret Admire: click logo 5 times quickly
  headerLogo?.addEventListener("click", () => {
    logoClickCount += 1;
    if (logoClickTimer) clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => {
      logoClickCount = 0;
    }, 2000);
    if (logoClickCount >= 5) {
      logoClickCount = 0;
      unlockAdmireTab();
    }
  });

  if (stored.lastResult?.ok) {
    // Drop cached impersonation result if mode is off
    if (stored.lastResult.impersonating && !state.impersonating) {
      /* skip auto-load of foreign account snapshot */
    } else {
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
  }

  impersonatorToggle?.addEventListener("change", async () => {
    state.impersonating = Boolean(impersonatorToggle.checked);
    if (!state.impersonating) {
      state.readOnly = false;
      state.impersonatorUsername = "";
      if (impersonatorUsername) impersonatorUsername.value = "";
    } else {
      state.impersonatorUsername = (impersonatorUsername?.value || "").replace(
        /^@+/,
        ""
      );
    }
    await persistImpersonatorSettings();
    updateImpersonatorUi();
    setStatus(
      state.impersonating ? t("impersonatorOn") : t("impersonatorOff"),
      "ok"
    );
  });

  impersonatorUsername?.addEventListener("change", async () => {
    state.impersonatorUsername = (impersonatorUsername.value || "")
      .trim()
      .replace(/^@+/, "");
    await persistImpersonatorSettings();
    updateImpersonatorUi();
  });

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

async function runGlobalAnalysis() {
  if (state.analysisRunning) {
    setStatus(t("analysisRunning"), "error");
    return;
  }

  // Second+ run in this popup session → tip / own-risk popover
  if (state.analysisRuns >= 1) {
    const ok = await askTipConfirm();
    if (!ok) return;
  }

  state.analysisRunning = true;
  startBtn.disabled = true;
  show(progressWrap, true);
  progressFill.style.width = "8%";
  progressText.textContent = t("connecting");
  setStatus(t("starting"));
  closeSettings();

  try {
    if (state.impersonating) {
      const name = (impersonatorUsername?.value || state.impersonatorUsername || "")
        .trim()
        .replace(/^@+/, "");
      if (!name) {
        throw new Error(t("impersonatorNeedUser"));
      }
      state.impersonatorUsername = name;
      await persistImpersonatorSettings();
    }

    const tab = await getIgTab();
    // Force fresh content script so enrich + latest code is active
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE",
      impersonating: state.impersonating,
      targetUsername: state.impersonating ? state.impersonatorUsername : null,
    });
    if (!res?.started && res?.error) {
      throw new Error(res.error);
    }
    state.analysisRuns += 1;
    progressText.textContent = t("loadingLists");
  } catch (err) {
    state.analysisRunning = false;
    startBtn.disabled = false;
    show(progressWrap, false);
    setStatus(err?.message || String(err), "error");
  }
}

startBtn.addEventListener("click", () => {
  runGlobalAnalysis();
});

tipModalContinue?.addEventListener("click", () => closeTipModal(true));
tipModalCancel?.addEventListener("click", () => closeTipModal(false));
tipModal?.addEventListener("click", (e) => {
  if (e.target === tipModal) closeTipModal(false);
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

botSearchInput?.addEventListener("input", () => {
  state.botQuery = botSearchInput.value;
  renderBots();
});

document.querySelectorAll("[data-analytics-topic]").forEach((btn) => {
  btn.addEventListener("click", () =>
    switchAnalyticsTopic(btn.dataset.analyticsTopic)
  );
});

$("analyticsSearchInput")?.addEventListener("input", (e) => {
  state.analyticsQuery = e.target.value;
  renderAnalyticsList();
});

$("analyticsExportBtn")?.addEventListener("click", () => exportAnalyticsList());

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
