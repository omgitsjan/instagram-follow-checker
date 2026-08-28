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
const appMain = $("appMain");

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
};

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
  document.title = t("appTitle");

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

  // Keep gear/X label in the open language
  if (typeof isSettingsOpen === "function") {
    syncSettingsToggleUi(isSettingsOpen());
  }

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

function switchSection(name) {
  if (!SECTIONS.includes(name)) name = "relationships";
  state.activeSection = name;
  // Leaving settings full-page if open
  closeSettings();

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

function chartLabel(key) {
  const map = {
    mutual: t("chartMutual"),
    notBack: t("chartNotBack"),
    notMe: t("chartNotMe"),
    following: t("following"),
    followers: t("followers"),
    public: t("chartPublic"),
    private: t("chartPrivate"),
    verified: t("chartVerified"),
    notVerified: t("chartNotVerified"),
    riskHigh: t("chartRiskHigh"),
    riskMid: t("chartRiskMid"),
    riskFlagged: t("chartRiskFlagged"),
    riskClean: t("chartRiskClean"),
  };
  return map[key] || key;
}

function buildChartCard(title, segments, centerText, centerSub) {
  const card = document.createElement("div");
  card.className = "chart-card";

  const h = document.createElement("h3");
  h.className = "chart-title";
  h.textContent = title;
  card.appendChild(h);

  const body = document.createElement("div");
  body.className = "chart-body";

  const canvas = document.createElement("canvas");
  canvas.className = "chart-canvas";
  body.appendChild(canvas);

  const legend = document.createElement("ul");
  legend.className = "chart-legend";
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  for (const seg of segments) {
    const li = document.createElement("li");
    const pct = total > 0 ? Math.round(((Number(seg.value) || 0) / total) * 100) : 0;
    li.innerHTML = `
      <span class="swatch" style="background:${seg.color}"></span>
      <span class="lab">${escapeHtml(chartLabel(seg.key || seg.label))}</span>
      <span class="num">${escapeHtml(String(seg.value))} · ${pct}%</span>`;
    legend.appendChild(li);
  }
  body.appendChild(legend);
  card.appendChild(body);

  // Draw after in DOM
  requestAnimationFrame(() => {
    if (window.IGAnalytics?.drawDoughnut) {
      window.IGAnalytics.drawDoughnut(canvas, segments, {
        size: 132,
        hole: 0.58,
        centerText,
        centerSub,
      });
    }
  });

  return card;
}

function renderAnalytics() {
  const summaryEl = $("analyticsSummary");
  const panel = $("panel-analytics");
  if (!summaryEl || !panel || !window.IGAnalytics) return;

  if (!state.counts) {
    summaryEl.innerHTML = `<div class="empty" style="grid-column:1/-1">${escapeHtml(t("needAnalysisFirst"))}</div>`;
    panel.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("needAnalysisFirst");
    panel.appendChild(empty);
    state.analyticsCache = null;
    return;
  }

  const A = window.IGAnalytics;
  const s = A.buildAnalyticsSummary(state);
  state.analyticsCache = s;

  summaryEl.innerHTML = `
    <div class="metric"><strong>${A.formatCount(s.followingCount)}</strong><span>${escapeHtml(t("following"))}</span></div>
    <div class="metric"><strong>${A.formatCount(s.followersCount)}</strong><span>${escapeHtml(t("followers"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.mutualRate)}</strong><span>${escapeHtml(t("metricMutualRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.notBackRate)}</strong><span>${escapeHtml(t("metricNotBackRate"))}</span></div>
    <div class="metric"><strong>${A.formatPct(s.oneWayFollowerRate)}</strong><span>${escapeHtml(t("metricOneWayFollowers"))}</span></div>
    <div class="metric"><strong>${A.formatCount(s.botFlaggedCount)}</strong><span>${escapeHtml(t("metricBotFlagged"))}</span></div>
  `;

  panel.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "charts-grid";
  wrap.appendChild(
    buildChartCard(
      t("chartFollowingTitle"),
      s.followingSplit,
      A.formatCount(s.followingCount),
      t("following")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartFollowersTitle"),
      s.followersSplit,
      A.formatCount(s.followersCount),
      t("followers")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartNetworkTitle"),
      s.networkMix,
      A.formatPct(s.mutualRate),
      t("metricMutualRate")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartAudienceTitle"),
      s.audienceBalance,
      A.formatCount(s.followingCount + s.followersCount),
      t("chartAudienceCenter")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartPrivacyTitle"),
      s.followersPrivacy,
      A.formatCount(s.followersCount),
      t("followers")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartVerifiedTitle"),
      s.followingVerified,
      A.formatCount(s.verifiedFollowing),
      t("chartVerified")
    )
  );
  wrap.appendChild(
    buildChartCard(
      t("chartBotRiskTitle"),
      s.followersBotRisk,
      A.formatCount(s.botFlaggedCount),
      t("metricBotFlagged")
    )
  );
  panel.appendChild(wrap);
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

    // Remove from your followers
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
  headerLogo.innerHTML = '<span class="logo-fallback">FC</span>';
}
