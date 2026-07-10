import type { DiscoverySearchResult } from "@/lib/search";
import type { Tier } from "@/lib/types";

export type GlobalSearchGroup = "users" | "repos" | "facets";

export interface GlobalSearchRow {
  key: string;
  group: GlobalSearchGroup;
  label: string;
  meta: string;
  href: string;
  avatarUrl?: string | null;
  tier?: Tier;
}

export function buildGlobalSearchRows(result: DiscoverySearchResult): GlobalSearchRow[] {
  return [
    ...result.users.map((user) => ({
      key: `user:${user.username}`,
      group: "users" as const,
      label: `@${user.username}`,
      meta: user.display_name ?? user.final_score.toFixed(1),
      href: `/u/${user.username}`,
      avatarUrl: user.avatar_url,
      tier: user.tier,
    })),
    ...result.repos.map((repo) => ({
      key: `repo:${repo.repo_key}`,
      group: "repos" as const,
      label: repo.name_with_owner,
      meta: `${repo.language ?? "—"} · ★${repo.stars.toLocaleString()}`,
      href: repo.href,
    })),
    ...result.facets.map((facet) => ({
      key: `facet:${facet.type}:${facet.value}`,
      group: "facets" as const,
      label: facet.value,
      meta: `${facet.type} · ${facet.count}`,
      href: facet.href,
    })),
  ];
}

export function nextSearchIndex(
  current: number,
  key: "ArrowDown" | "ArrowUp" | "Escape",
  count: number,
): number {
  if (key === "Escape" || count <= 0) return -1;
  if (key === "ArrowDown") return Math.min(current + 1, count - 1);
  return Math.max(current - 1, -1);
}
