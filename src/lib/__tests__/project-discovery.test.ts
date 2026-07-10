import { describe, expect, it, vi } from "vitest";
import {
  createCachedLoader,
  projectListCacheKey,
  relatedProjectsCacheKey,
} from "../project-discovery";

describe("project discovery cache", () => {
  it("builds deterministic cache keys", () => {
    expect(projectListCacheKey({ sort: "quality", language: null, limit: 24, offset: 0 })).toBe(
      "projects:list:quality:all:24:0",
    );
    expect(
      projectListCacheKey({ sort: "momentum", language: "TypeScript", limit: 12, offset: 24 }),
    ).toBe("projects:list:momentum:typescript:12:24");
    expect(relatedProjectsCacheKey("OpenAI/SDK", 6)).toBe("projects:related:openai/sdk:6");
  });

  it("falls back to the database loader when cache reads fail", async () => {
    const dbLoad = vi.fn(async () => ["fresh"]);
    const cacheSet = vi.fn(async () => undefined);
    const load = createCachedLoader<string[]>({
      cacheGet: async () => {
        throw new Error("redis unavailable");
      },
      cacheSet,
      dbLoad,
    });

    await expect(load("key")).resolves.toEqual(["fresh"]);
    expect(dbLoad).toHaveBeenCalledOnce();
    expect(cacheSet).toHaveBeenCalledWith("key", ["fresh"]);
  });

  it("single-flights concurrent misses and does not cache empty arrays", async () => {
    let release!: (value: string[]) => void;
    const dbLoad = vi.fn(() => new Promise<string[]>((resolve) => (release = resolve)));
    const cacheSet = vi.fn(async () => undefined);
    const load = createCachedLoader<string[]>({
      cacheGet: async () => null,
      cacheSet,
      dbLoad,
    });

    const first = load("same");
    const second = load("same");
    await vi.waitFor(() => expect(dbLoad).toHaveBeenCalledOnce());
    release(["one"]);
    await expect(Promise.all([first, second])).resolves.toEqual([["one"], ["one"]]);
    expect(dbLoad).toHaveBeenCalledOnce();

    const emptyLoad = createCachedLoader<string[]>({
      cacheGet: async () => null,
      cacheSet,
      dbLoad: async () => [],
    });
    await emptyLoad("empty");
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });
});
