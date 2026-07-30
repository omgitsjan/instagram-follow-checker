/**
 * Pure analytics helpers for v2 (no Chrome APIs).
 * Bot scores are heuristics only — not ground truth.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} u mapped user
 * @returns {{ score: number, reasons: string[] }}
 */
function computeBotScore(u) {
  let score = 0;
  const reasons = [];

  const followers = num(u.followerCount);
  const following = num(u.followingCount);
  const media = num(u.mediaCount);

  if (u.hasAnonymousProfilePic || !u.profilePic) {
    score += 18;
    reasons.push("no_or_anonymous_pic");
  }

  if (u.isVerified) {
    score = Math.max(0, score - 40);
    reasons.push("verified_dampened");
  }

  // Username patterns: many trailing digits / long digit runs
  const un = (u.username || "").toLowerCase();
  if (/\d{4,}$/.test(un) || (un.match(/\d/g) || []).length >= 5) {
    score += 16;
    reasons.push("digit_heavy_username");
  }
  if (/^[a-z]+\d{3,}$/i.test(un)) {
    score += 8;
    reasons.push("name_plus_digits");
  }

  if (media === 0) {
    score += 14;
    reasons.push("zero_posts");
  } else if (media != null && media <= 2) {
    score += 6;
    reasons.push("very_few_posts");
  }

  if (following != null && followers != null) {
    if (followers === 0 && following >= 50) {
      score += 22;
      reasons.push("zero_followers_many_following");
    } else if (followers > 0 && following / followers >= 10 && following >= 200) {
      score += 20;
      reasons.push("extreme_following_ratio");
    } else if (followers > 0 && following / followers >= 5 && following >= 100) {
      score += 12;
      reasons.push("high_following_ratio");
    }

    if (following >= 2000 && (followers == null || followers < 100)) {
      score += 10;
      reasons.push("mass_following");
    }
  } else if (following != null && following >= 1500) {
    score += 8;
    reasons.push("high_following_unknown_followers");
  }

  if (u.isPrivate && media === 0 && (following == null || following > 100)) {
    score += 6;
    reasons.push("private_empty");
  }

  // Full name empty is weak signal
  if (!(u.fullName || "").trim()) {
    score += 4;
    reasons.push("empty_display_name");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons };
}

function withBotScores(users) {
  return (users || []).map((u) => {
    const { score, reasons } = computeBotScore(u);
    return { ...u, botScore: score, botReasons: reasons };
  });
}

function sortByBotScoreDesc(users) {
  return withBotScores(users).sort(
    (a, b) => b.botScore - a.botScore || a.username.localeCompare(b.username)
  );
}

function ratioFollowingToFollowers(u) {
  const f = num(u.followerCount);
  const g = num(u.followingCount);
  if (f == null || g == null || f === 0) return null;
  return g / f;
}

function countBy(users, pred) {
  let n = 0;
  for (const u of users || []) {
    if (pred(u)) n += 1;
  }
  return n;
}

/**
 * Charts + rates only from list data we already have
 * (mutual / notBack / notMe / following / followers + list flags).
 */
function buildAnalyticsSummary(state) {
  const following = state.following || [];
  const followers = state.followers || [];
  const mutual = state.mutual || [];
  const notBack = state.notFollowingBack || [];
  const notMe = state.notFollowedByMe || [];

  const fCount = following.length;
  const frCount = followers.length;
  const mutualCount = mutual.length;
  const notBackCount = notBack.length;
  const notMeCount = notMe.length;

  const mutualRate = fCount ? mutualCount / fCount : 0;
  const notBackRate = fCount ? notBackCount / fCount : 0;
  const oneWayFollowerRate = frCount ? notMeCount / frCount : 0;
  const mutualOfFollowers = frCount ? mutualCount / frCount : 0;

  // Doughnut datasets from known buckets only
  const followingSplit = [
    { key: "mutual", label: "mutual", value: mutualCount, color: "#3dd68c" },
    { key: "notBack", label: "notBack", value: notBackCount, color: "#f5a524" },
  ];
  const followersSplit = [
    { key: "mutual", label: "mutual", value: mutualCount, color: "#3dd68c" },
    { key: "notMe", label: "notMe", value: notMeCount, color: "#6ea8fe" },
  ];
  // Unique-ish network view (three exclusive buckets for the relationship graph)
  const networkMix = [
    { key: "mutual", label: "mutual", value: mutualCount, color: "#3dd68c" },
    { key: "notBack", label: "notBack", value: notBackCount, color: "#f5a524" },
    { key: "notMe", label: "notMe", value: notMeCount, color: "#6ea8fe" },
  ];

  // Relative audience size (different lists — still useful as balance snapshot)
  const audienceBalance = [
    { key: "following", label: "following", value: fCount, color: "#c084fc" },
    { key: "followers", label: "followers", value: frCount, color: "#38bdf8" },
  ];

  // Privacy among followers (always available on list payloads)
  const privateFollowers = countBy(followers, (u) => u.isPrivate);
  const publicFollowers = Math.max(0, frCount - privateFollowers);
  const followersPrivacy = [
    { key: "public", label: "public", value: publicFollowers, color: "#3dd68c" },
    { key: "private", label: "private", value: privateFollowers, color: "#9a9aab" },
  ];

  // Verified among accounts you follow
  const verifiedFollowing = countBy(following, (u) => u.isVerified);
  const otherFollowing = Math.max(0, fCount - verifiedFollowing);
  const followingVerified = [
    { key: "verified", label: "verified", value: verifiedFollowing, color: "#6ea8fe" },
    { key: "notVerified", label: "notVerified", value: otherFollowing, color: "#4a4a5a" },
  ];

  // Bot-risk tiers among followers (local heuristic, same as Bots section)
  const scored = withBotScores(followers);
  let riskHigh = 0;
  let riskMid = 0;
  let riskFlagged = 0;
  let riskClean = 0;
  for (const u of scored) {
    const s = u.botScore ?? 0;
    if (s >= 55) riskHigh += 1;
    else if (s >= 30) riskMid += 1;
    else if (s >= 25) riskFlagged += 1;
    else riskClean += 1;
  }
  const followersBotRisk = [
    { key: "riskHigh", label: "riskHigh", value: riskHigh, color: "#ff6b6b" },
    { key: "riskMid", label: "riskMid", value: riskMid, color: "#f5a524" },
    { key: "riskFlagged", label: "riskFlagged", value: riskFlagged, color: "#e8d44d" },
    { key: "riskClean", label: "riskClean", value: riskClean, color: "#3dd68c" },
  ];

  return {
    mutualRate,
    notBackRate,
    oneWayFollowerRate,
    mutualOfFollowers,
    mutualCount,
    notBackCount,
    notMeCount,
    followingCount: fCount,
    followersCount: frCount,
    followingSplit,
    followersSplit,
    networkMix,
    audienceBalance,
    followersPrivacy,
    followingVerified,
    followersBotRisk,
    privateFollowers,
    verifiedFollowing,
    botFlaggedCount: riskHigh + riskMid + riskFlagged,
  };
}

function formatCount(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

function formatPct(rate) {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * Draw a doughnut chart on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{ value: number, color: string, label?: string }[]} segments
 */
function drawDoughnut(canvas, segments, options = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssSize = options.size || 140;
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const outer = cssSize * 0.42;
  const inner = outer * (options.hole ?? 0.58);
  const total = segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);

  ctx.clearRect(0, 0, cssSize, cssSize);

  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = "#2e2e3a";
    ctx.fill();
    ctx.fillStyle = "#9a9aab";
    ctx.font = "600 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", cx, cy);
    return;
  }

  let angle = -Math.PI / 2;
  for (const seg of segments) {
    const v = Math.max(0, Number(seg.value) || 0);
    if (v <= 0) continue;
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.arc(cx, cy, outer, angle, angle + slice);
    ctx.arc(cx, cy, inner, angle + slice, angle, true);
    ctx.closePath();
    ctx.fillStyle = seg.color || "#833ab4";
    ctx.fill();
    angle += slice;
  }

  // center label
  if (options.centerText != null) {
    ctx.fillStyle = "#f4f4f8";
    ctx.font = "700 14px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(options.centerText), cx, cy - 6);
    if (options.centerSub) {
      ctx.fillStyle = "#9a9aab";
      ctx.font = "600 9px Segoe UI, system-ui, sans-serif";
      ctx.fillText(String(options.centerSub), cx, cy + 10);
    }
  }
}

// Export for popup (classic script tags → globals)
if (typeof window !== "undefined") {
  window.IGAnalytics = {
    computeBotScore,
    withBotScores,
    sortByBotScoreDesc,
    buildAnalyticsSummary,
    formatCount,
    formatPct,
    ratioFollowingToFollowers,
    drawDoughnut,
  };
}
