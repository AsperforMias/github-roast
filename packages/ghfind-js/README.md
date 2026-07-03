# ghfind

Official JavaScript/TypeScript SDK for **[ghfind.com](https://ghfind.com)** — score any
GitHub account **0–100** for value and trustworthiness, with roasts, head-to-head
battles, leaderboards, and developer discovery.

- **Deterministic scoring, no LLM.** `scan`, `score`, `getScore`, and the battle
  winner are pure computation on GitHub data — same input, same score.
- **Bring your own model.** The only LLM parts are the *roast prose* and *battle
  commentary*. `roast()` accepts a `byoKey` so you can run it through your own
  OpenAI-compatible provider — or just take the structured `scan()` output and feed
  your own model.
- **Atomic capabilities.** One method per endpoint, so agents and apps can compose
  exactly what they need.
- **Score anywhere.** Three ways to get a score, so it works with or without a token:
  1. **Remote, no token** — `getScore()` / `scan()` call ghfind; the server does the
     crawl + deterministic scoring for you.
  2. **Local, your own token** — `ghfind/local` bundles the real open-source scoring
     core and scores entirely on your machine and quota (never touches ghfind).
  3. **Data & discovery** — leaderboards, developer directory, battles, badges.

```bash
npm install ghfind
```

## Quick start

```ts
import { GhFind } from "ghfind";

const gh = new GhFind(); // defaults to https://ghfind.com

// Cheapest: get a deterministic score (no LLM). Works for ANY GitHub account —
// unseen ones are scored live on demand. `source` is "indexed" or "live".
const s = await gh.getScore("torvalds");
console.log(s.final_score, s.tier, s.percentile, s.source);

// Need the full evidence payload (metrics, repo/PR signals, red flags)?
const scan = await gh.scan("torvalds");
console.log(scan.scoring.final_score, scan.scoring.red_flags);
```

## Capabilities

| Method | Endpoint | LLM? | What you get |
| --- | --- | --- | --- |
| `getScore(username)` | `GET /api/score/{u}` | no | Deterministic score for any account. Indexed accounts return stored data; unseen ones are scored live on demand. 404 only if the login doesn't exist. |
| `scan(username)` | `POST /api/scan` | no | Full factual payload: metrics, repo/PR signals, sub-scores, red flags, final score. |
| `score(username)` | `POST /api/scan` | no | Just the `scoring` block. |
| `roast(input)` | `POST /api/scan` + `/api/roast` | yes* | Human-facing roast report + AI-adjusted score. `*` pass `byoKey` for your own model. |
| `vs(a, b)` | `POST /api/vs-verdict` | yes* | Head-to-head verdict. Winner is deterministic; prose is LLM. |
| `leaderboard(opts)` | `GET /api/leaderboard` | no | Ranked profiles (trending / score / heat / progress). |
| `developers(opts)` | `GET /api/developers` | no | Discover developers by language / org / repo. |
| `searchUsers(q)` | `GET /api/search-users` | no | Prefix autocomplete over scored accounts. |
| `stats()` | `GET /api/stats` | no | Platform totals. |
| `getGitHubUser(u)` / `userExists(u)` | `GET api.github.com/users/{u}` | no | Confirm a GitHub account exists — client-side, on **your** IP/quota, not ghfind's. No token required. |
| `badgeUrl` / `cardUrl` / `vsCardUrl` | image routes | no | Build image URLs (no request). |

Introspect them at runtime via the exported `catalog`.

## Confirm a user exists before scoring (no token needed)

`getGitHubUser` / `userExists` hit GitHub's public API directly from the caller,
so you can validate a handle before spending a call on the (heavier) scoring API —
handy to skip typos and to keep ghfind from doing a live crawl for a nonexistent
account. No GitHub token is required (optional token raises GitHub's ~60/h
unauthenticated limit).

```ts
if (await gh.userExists("torvalds")) {
  const s = await gh.getScore("torvalds");
}

// Or let the SDK do it for you — fails fast, never calls ghfind for a bad handle:
const s = await gh.getScore("torvalds", { verifyExists: true });
```

## Score locally with your own token (no server)

Import from `ghfind/local` to run the **same open-source scoring engine** the
website uses — bundled from ghfind's source, so results are identical — entirely
on your own machine and GitHub token. No ghfind server, no LLM, no rate limits but
GitHub's own. Node-only (it makes many authenticated GitHub API calls).

```ts
import { collectAndScore } from "ghfind/local";

const scan = await collectAndScore("torvalds", { token: process.env.GITHUB_TOKEN });
console.log(scan.scoring.final_score, scan.scoring.tier, scan.scoring.red_flags);

// Already have metrics? Score them purely (no I/O):
import { scoreMetrics } from "ghfind/local";
const scoring = scoreMetrics(metrics);
```

Pick per situation: **have a token → score local** (scales infinitely, offline
from ghfind); **no token → `new GhFind().getScore(user)`** (ghfind scores it for
you). Same numbers either way.

## Options

```ts
const gh = new GhFind({
  host: "https://ghfind.com",   // or GHFIND_HOST env var
  apiKey: process.env.GHFIND_API_KEY, // sent as Authorization: Bearer <key>
});
```

## Roast with your own model

```ts
const { report, meta } = await gh.roast({
  username: "torvalds",
  lang: "en",
  byoKey: { baseURL: "https://api.openai.com/v1", apiKey: "sk-...", model: "gpt-4o" },
});
console.log(meta?.final_score, report);
```

## Errors

Non-2xx responses throw `GhFindError` with `status`, `code`, and `body`:

```ts
import { GhFindError } from "ghfind";
try {
  const s = await gh.getScore("someone");
} catch (e) {
  if (e instanceof GhFindError && e.status === 404) {
    // The only 404: this GitHub login doesn't exist.
    console.log("no such GitHub user");
  }
}
```

Machine-readable API spec: <https://ghfind.com/openapi.json> · Agent notes: <https://ghfind.com/llms.txt>

Python SDK: [`ghfind` on PyPI](https://pypi.org/project/ghfind/). License: AGPL-3.0-or-later.
