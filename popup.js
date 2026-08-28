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

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });

  if (typeof isSettingsOpen === "function") {
    syncSettingsToggleUi(isSettingsOpen());
  }

  if (!state.me?.username) {
    accountLine.textContent = t("tagline");
  }

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

function setHeaderLogoFallback() {
  if (!headerLogo) return;
  headerLogo.classList.remove("has-photo");
  headerLogo.innerHTML = '<span class="logo-fallback">FC</span>';
}
