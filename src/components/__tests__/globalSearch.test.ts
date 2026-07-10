import { describe, expect, it } from "vitest";
import { buildGlobalSearchRows, nextSearchIndex } from "@/lib/global-search";

describe("GlobalSearch model", () => {
  it("flattens grouped API results in developer, project, facet order", () => {
    const rows = buildGlobalSearchRows({
      users: [
        {
          username: "alice",
          display_name: "Alice",
          avatar_url: null,
          final_score: 90,
          tier: "顶级",
        },
      ],
      repos: [
        {
          repo_key: "acme/tool",
          name_with_owner: "Acme/Tool",
          owner_login: "acme",
          name: "Tool",
          description: null,
          stars: 100,
          forks: null,
          language: "TypeScript",
          topics: [],
          href: "/developers/repo/acme/tool",
        },
      ],
      facets: [
        {
          type: "language",
          value: "TypeScript",
          count: 20,
          href: "/developers/language/TypeScript",
        },
      ],
    });
    expect(rows.map((row) => [row.group, row.href])).toEqual([
      ["users", "/u/alice"],
      ["repos", "/developers/repo/acme/tool"],
      ["facets", "/developers/language/TypeScript"],
    ]);
  });

  it("moves keyboard selection within bounds and supports Escape reset", () => {
    expect(nextSearchIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextSearchIndex(2, "ArrowDown", 3)).toBe(2);
    expect(nextSearchIndex(0, "ArrowUp", 3)).toBe(-1);
    expect(nextSearchIndex(1, "Escape", 3)).toBe(-1);
  });
});
