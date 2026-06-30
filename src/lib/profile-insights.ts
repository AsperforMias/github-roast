/**
 * Pure aggregation helpers that turn a snapshot's `top_repos` into the
 * "Stack & Domains" view: a language breakdown (by byte size across all repos,
 * with a primary-language fallback) and a deduped, frequency-ranked topic list.
 *
 * Kept side-effect free and dependency-light so they're trivially unit-tested
 * (see profile-insights.test.ts) and reusable by future domain classification.
 */
import type { TopRepo } from "./types";

export interface LanguageShare {
  name: string;
  pct: number; // 0–100, rounded to whole percent
}

/**
 * Aggregate per-repo language byte sizes into top-N languages with percentages.
 * Falls back to counting primary `language` when no repo carries a `languages`
 * breakdown (older snapshots / REST-degraded scans). Returns [] when neither
 * signal is present.
 */
export function aggregateLanguages(repos: TopRepo[], topN = 6): LanguageShare[] {
  const sizes = new Map<string, number>();
  let total = 0;

  for (const r of repos) {
    if (Array.isArray(r.languages)) {
      for (const l of r.languages) {
        if (!l?.name || !(l.size > 0)) continue;
        sizes.set(l.name, (sizes.get(l.name) ?? 0) + l.size);
        total += l.size;
      }
    }
  }

  // Fallback: no byte breakdowns anywhere — count repos by primary language.
  if (total === 0) {
    for (const r of repos) {
      if (!r.language) continue;
      sizes.set(r.language, (sizes.get(r.language) ?? 0) + 1);
      total += 1;
    }
  }

  if (total === 0) return [];

  return [...sizes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, size]) => ({ name, pct: Math.round((size / total) * 100) }));
}

/**
 * Collect repo topics across all repos, deduped and ranked by how many repos
 * carry each topic (ties keep first-seen order). Returns up to `topN` topics.
 */
export function collectTopics(repos: TopRepo[], topN = 12): string[] {
  const counts = new Map<string, number>();
  for (const r of repos) {
    if (!Array.isArray(r.topics)) continue;
    for (const raw of r.topics) {
      const t = typeof raw === "string" ? raw.trim() : "";
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name);
}
