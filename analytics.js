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

/**
 * @param {object} state analysis state
 */
function buildAnalyticsSummary(state) {
  const following = state.following || [];
  const followers = state.followers || [];
  const mutual = state.mutual || [];
  const notBack = state.notFollowingBack || [];
  const notMe = state.notFollowedByMe || [];

  const fCount = following.length;
  const frCount = followers.length;

  const mutualRate = fCount ? mutual.length / fCount : 0;
  const notBackRate = fCount ? notBack.length / fCount : 0;
  const oneWayFollowerRate = frCount ? notMe.length / frCount : 0;

  const withFollowers = following.filter((u) => num(u.followerCount) != null);
  const withFollowing = following.filter((u) => num(u.followingCount) != null);
  const withRatio = following.filter((u) => ratioFollowingToFollowers(u) != null);

  const topByFollowers = [...withFollowers]
    .sort((a, b) => (num(b.followerCount) || 0) - (num(a.followerCount) || 0))
    .slice(0, 25);

  const topByFollowing = [...withFollowing]
    .sort((a, b) => (num(b.followingCount) || 0) - (num(a.followingCount) || 0))
    .slice(0, 25);

  const worstRatio = [...withRatio]
    .sort(
      (a, b) =>
        (ratioFollowingToFollowers(b) || 0) - (ratioFollowingToFollowers(a) || 0)
    )
    .slice(0, 25);

  const coverage = {
    followingWithFollowerCount: withFollowers.length,
    followingWithFollowingCount: withFollowing.length,
    followingTotal: fCount,
  };

  return {
    mutualRate,
    notBackRate,
    oneWayFollowerRate,
    topByFollowers,
    topByFollowing,
    worstRatio,
    coverage,
    mutualCount: mutual.length,
    notBackCount: notBack.length,
    notMeCount: notMe.length,
    followingCount: fCount,
    followersCount: frCount,
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
  };
}
