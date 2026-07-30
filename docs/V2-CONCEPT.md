# Instagram Follow Checker – v2 Concept

**Branch:** `feature/v2-insights-analytics`  
**Status:** MVP on this branch (relationships + charts + bots; Posts/Admire coming soon).  
**Deferred:** Impersonator (other-account analysis) was removed — unreliable with web session limits.

---

## Product vision

Keep the **single product purpose** (understand Instagram relationships in the browser), but organize the UI into **top-level sections**:

| Section | Purpose |
|---------|---------|
| **Relationships** | v1: following/followers, mutual, not back, not following |
| **Analytics** | Doughnut charts + rates from list buckets (mutual / not back / not you) |
| **Bots** | Heuristic “likely low-quality / bot-like” scores on **your followers** |
| **Posts / Admire** | Coming soon (post fans, story viewers — blocked or fragile on web) |

English UI default; German remains in Settings.

---

## Architecture

```
┌─────────────────────────────────────────┐
│ Header · account · settings             │
├─────────────────────────────────────────┤
│ [ Relationships ] [ Analytics ] [ Bots ] [ Liked ]   ← primary nav
├─────────────────────────────────────────┤
│ Section-specific sub-nav / filters      │
│ List / ranking / cards                  │
└─────────────────────────────────────────┘
```

- **Content script** still owns Instagram session fetches.
- **Popup** owns navigation, i18n, rendering, local cache.
- **analytics.js** pure functions: bot score, sort ranks, summarize (testable, no Chrome APIs).

### Data sources (session only, no official Graph API)

| Source | Endpoint pattern | Used for |
|--------|------------------|----------|
| Following / followers pages | `/api/v1/friendships/{id}/following|followers/` | Relationships + analytics base |
| User fields on list items | often include counts, private, verified, anonymous pic | Bot heuristics without N extra calls |
| Liked feed | `/api/v1/feed/liked/` | Liked posts section |
| Optional deep enrich (future) | `/api/v1/users/{id}/info/` | Sample only — rate-limit risk |

---

## Feature details

### 1. Relationships (v1, kept)

Unchanged product core. Top tiles + three relationship tabs + follow/unfollow.

### 2. Analytics

Derived **only** from already loaded lists (no “most followers” rankings — public counts are rarely on list payloads):

- Mutual rate, not-back rate, one-way follower rate  
- Doughnut: following split (mutual vs not back)  
- Doughnut: followers split (mutual vs you don’t follow)  
- Doughnut: network mix (three buckets)  

### 3. Bots (heuristic – not ground truth)

**Not a detection guarantee.** Score 0–100 from signals such as:

| Signal | Why it can look bot-like |
|--------|---------------------------|
| Following ≫ followers | Mass-follow behaviour |
| Very low / zero media | Empty content farms |
| Anonymous / missing profile pic | Disposable accounts |
| Username: many digits / spammy pattern | Generated handles |
| Unverified + private + empty profile | Low-signal shells |

UI: sort followers by score, show top risk list, explain “heuristic only” disclaimer.

**Future (not in MVP):** sample enrich via user info API with hard caps + delays; ML is out of scope.

### 4. Liked posts

- Paginated **liked media** for the logged-in user  
- Show thumbnail, caption snippet, author, open post  
- **Future:** which of your followers also liked the same posts (heavy; needs per-post likers → rate limits)

### 5. Extra ideas (roadmap)

| Idea | Feasibility | Notes |
|------|-------------|--------|
| Mutual rate over time | Medium | Store snapshots in `chrome.storage` |
| “Ghost” followers (never appear in activity) | Hard | Activity APIs incomplete / private |
| Export CSV rankings | Easy | Build on JSON export |
| Batch unfollow filter “score > 70” | Easy but risky | ToS / rate limits — gated UX |
| Story viewers / close friends | Hard / invasive | Likely blocked |
| Competitor account compare | Medium | Requires viewing other profiles |

---

## Privacy & store implications

v2 still processes **website content** only in the browser.  
Liked posts are **your** activity, still local.  

Update **PRIVACY.md** + store form if Liked/Analytics ship to production (describe additional local processing).  
Bot labels must never be marketed as “official bot detection”.

---

## MVP scope (this branch)

- [x] Primary nav: Relationships / Analytics / Bots / Liked  
- [x] Enrich list user model with optional counts + signals  
- [x] Analytics rankings + rates  
- [x] Bot score heuristic + sorted list  
- [x] Liked posts fetch + UI  
- [x] EN/DE strings  
- [x] Concept doc  

Out of scope for MVP: background workers, Chrome Web Store release of v2, mass actions.

---

## Risks

1. Instagram changes endpoints → Liked/list fields disappear  
2. Rate limits if we later enrich thousands of profiles  
3. False positives on bot scores (influencers, creators, new users)  
4. Store review: keep single purpose wording broad enough (“relationship insights”) without claiming Meta affiliation  

---

## Suggested versioning

- Branch work: `2.0.0-beta` in manifest  
- Merge to `main` when stable → `2.0.0` release
