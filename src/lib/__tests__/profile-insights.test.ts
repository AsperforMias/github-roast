import { describe, expect, it } from "vitest";
import { aggregateLanguages, collectTopics } from "../profile-insights";
import type { TopRepo } from "../types";

function repo(partial: Partial<TopRepo>): TopRepo {
  return {
    name: "r",
    stars: 0,
    forks: 0,
    open_issues: 0,
    size: 0,
    language: null,
    description: null,
    pushed_at: null,
    ...partial,
  };
}

describe("aggregateLanguages", () => {
  it("sums byte sizes across repos and returns rounded percentages", () => {
    const repos = [
      repo({ languages: [{ name: "Python", size: 70 }, { name: "Cuda", size: 30 }] }),
      repo({ languages: [{ name: "Python", size: 100 }] }),
    ];
    const out = aggregateLanguages(repos);
    expect(out[0]).toEqual({ name: "Python", pct: 85 }); // 170/200
    expect(out[1]).toEqual({ name: "Cuda", pct: 15 }); // 30/200
  });

  it("respects topN", () => {
    const repos = [
      repo({
        languages: [
          { name: "A", size: 50 },
          { name: "B", size: 40 },
          { name: "C", size: 30 },
        ],
      }),
    ];
    expect(aggregateLanguages(repos, 2).map((l) => l.name)).toEqual(["A", "B"]);
  });

  it("falls back to primary language counts when no byte breakdown exists", () => {
    const repos = [
      repo({ language: "Rust" }),
      repo({ language: "Rust" }),
      repo({ language: "Go" }),
    ];
    const out = aggregateLanguages(repos);
    expect(out).toEqual([
      { name: "Rust", pct: 67 },
      { name: "Go", pct: 33 },
    ]);
  });

  it("returns [] when there is no language signal", () => {
    expect(aggregateLanguages([repo({}), repo({})])).toEqual([]);
    expect(aggregateLanguages([])).toEqual([]);
  });
});

describe("collectTopics", () => {
  it("dedupes and ranks by repo frequency", () => {
    const repos = [
      repo({ topics: ["llm", "inference"] }),
      repo({ topics: ["llm", "cuda"] }),
      repo({ topics: ["llm"] }),
    ];
    expect(collectTopics(repos)).toEqual(["llm", "inference", "cuda"]);
  });

  it("trims blanks and respects topN", () => {
    const repos = [repo({ topics: ["  a  ", "", "b", "c"] })];
    expect(collectTopics(repos, 2)).toEqual(["a", "b"]);
  });

  it("handles repos without topics", () => {
    expect(collectTopics([repo({}), repo({ topics: [] })])).toEqual([]);
  });
});
