# ghfind (Python)

Official Python SDK for **[ghfind.com](https://ghfind.com)** — score any GitHub
account **0–100** for value and trustworthiness, with roasts, head-to-head battles,
leaderboards, and developer discovery.

- **Deterministic scoring, no LLM.** `scan`, `score`, `get_score`, and the battle
  winner are pure computation on GitHub data.
- **Bring your own model.** The only LLM parts are the *roast prose* and *battle
  commentary*. `roast(..., byo_key=...)` runs the LLM through your own
  OpenAI-compatible provider — or just take the structured `scan()` output and feed
  your own model.
- **Score anywhere.** Works with or without a token: no token → `get_score()` calls
  ghfind (server crawls + scores); with a token → `ghfind.local` runs the same
  open-source engine entirely on your machine (see below).
- **Zero dependencies.** Standard-library only.

```bash
pip install ghfind
```

## Quick start

```python
from ghfind import GhFind

gh = GhFind()  # defaults to https://ghfind.com

# Cheapest: get a deterministic score (no LLM). Works for ANY GitHub account —
# unseen ones are scored live on demand. s["source"] is "indexed" or "live".
s = gh.get_score("torvalds")
print(s["final_score"], s["tier"], s["percentile"], s["source"])

# Need the full evidence payload (metrics, repo/PR signals, red flags)?
scan = gh.scan("torvalds")
print(scan["scoring"]["final_score"], scan["scoring"]["red_flags"])
```

## Capabilities

| Method | Endpoint | LLM? | What you get |
| --- | --- | --- | --- |
| `get_score(username)` | `GET /api/score/{u}` | no | Deterministic score for any account. Indexed accounts return stored data; unseen ones are scored live on demand. 404 only if the login doesn't exist. |
| `scan(username)` | `POST /api/scan` | no | Full factual payload: metrics, signals, sub-scores, red flags, final score. |
| `score(username)` | `POST /api/scan` | no | Just the `scoring` block. |
| `roast(username, byo_key=...)` | `POST /api/scan` + `/api/roast` | yes* | Roast report + AI-adjusted score. `*` pass `byo_key` for your own model. |
| `vs(a, b)` | `POST /api/vs-verdict` | yes* | Head-to-head verdict. Winner is deterministic; prose is LLM. |
| `leaderboard(view, window)` | `GET /api/leaderboard` | no | Ranked profiles. |
| `developers(type, value)` | `GET /api/developers` | no | Discover developers by language / org / repo. |
| `search_users(q)` | `GET /api/search-users` | no | Prefix autocomplete. |
| `stats()` | `GET /api/stats` | no | Platform totals. |
| `get_github_user(u)` / `user_exists(u)` | `GET api.github.com/users/{u}` | no | Confirm a GitHub account exists — client-side, on **your** IP/quota, not ghfind's. No token required. |
| `badge_url` / `card_url` / `vs_card_url` | image routes | no | Build image URLs. |

Introspect them at runtime via `from ghfind import CATALOG`.

## Confirm a user exists before scoring (no token needed)

```python
if gh.user_exists("torvalds"):
    s = gh.get_score("torvalds")

# Or let the SDK do it for you — fails fast, never calls ghfind for a bad handle:
s = gh.get_score("torvalds", verify_exists=True)
```

`get_github_user` / `user_exists` hit GitHub's public API directly, on **your**
IP/quota (not ghfind's). No GitHub token required (pass one to raise GitHub's
~60/h anon limit).

## Score locally with your own token (no server)

`ghfind.local` runs the **same open-source scoring engine** the website uses —
a faithful port of ghfind's `score()` + `collect()`, verified bit-for-bit against
the TS/website output — entirely on your own machine and GitHub token. No ghfind
server, no LLM, no rate limits but GitHub's own.

```python
import os
from ghfind.local import collect_and_score

scan = collect_and_score("torvalds", token=os.environ["GITHUB_TOKEN"])
print(scan["scoring"]["final_score"], scan["scoring"]["tier"], scan["scoring"]["red_flags"])

# Already have metrics? Score them purely (no I/O):
from ghfind.local import score_metrics
scoring = score_metrics(metrics)
```

Pick per situation: **have a token → score local** (scales infinitely, offline
from ghfind); **no token → `GhFind().get_score(user)`** (ghfind scores it for you).
Same numbers either way.

## Options & errors

```python
gh = GhFind(host="https://ghfind.com", api_key="...")  # or GHFIND_HOST env var

from ghfind import GhFindError
try:
    gh.get_score("someone")
except GhFindError as e:
    if e.status == 404:
        print("no such GitHub user")  # the only 404
```

Machine-readable API spec: <https://ghfind.com/openapi.json> · Agent notes: <https://ghfind.com/llms.txt>

JS/TS SDK: [`ghfind` on npm](https://www.npmjs.com/package/ghfind). License: AGPL-3.0-or-later.
