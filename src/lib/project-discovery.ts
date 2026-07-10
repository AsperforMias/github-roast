import {
  getDeveloperCommonProjects,
  getProjects,
  getRelatedProjects,
  type ProjectListItem,
  type RelatedProject,
} from "@/lib/db";
import type { ProjectSort } from "@/lib/projects";
import { getCachedProjectValue, setCachedProjectValue } from "@/lib/redis";

type CacheLoaderDeps<T> = {
  cacheGet: (key: string) => Promise<T | null>;
  cacheSet: (key: string, value: T) => Promise<void>;
  dbLoad: (key: string) => Promise<T>;
};

export function createCachedLoader<T>(deps: CacheLoaderDeps<T>) {
  const inflight = new Map<string, Promise<T>>();
  return async (key: string): Promise<T> => {
    try {
      const cached = await deps.cacheGet(key);
      if (cached !== null) return cached;
    } catch {
      // Redis is best-effort; the database remains the source of truth.
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const run = (async () => {
      const value = await deps.dbLoad(key);
      const shouldCache = !Array.isArray(value) || value.length > 0;
      if (shouldCache) {
        try {
          await deps.cacheSet(key, value);
        } catch {
          // Cache writes must never break a discovery page.
        }
      }
      return value;
    })();
    inflight.set(key, run);
    try {
      return await run;
    } finally {
      inflight.delete(key);
    }
  };
}

export interface ProjectListCacheOptions {
  sort: ProjectSort;
  language: string | null;
  limit: number;
  offset: number;
}

export function projectListCacheKey(options: ProjectListCacheOptions): string {
  const language = options.language?.trim().toLowerCase() || "all";
  return `projects:list:${options.sort}:${language}:${options.limit}:${options.offset}`;
}

export function relatedProjectsCacheKey(repoKey: string, limit: number): string {
  return `projects:related:${repoKey.trim().toLowerCase()}:${limit}`;
}

const listOptions = new Map<string, ProjectListCacheOptions>();
const projectListLoader = createCachedLoader<ProjectListItem[]>({
  cacheGet: getCachedProjectValue,
  cacheSet: setCachedProjectValue,
  dbLoad: async (key) => {
    const options = listOptions.get(key);
    return options ? getProjects(options) : [];
  },
});

export async function getProjectsCached(options: ProjectListCacheOptions) {
  const key = projectListCacheKey(options);
  listOptions.set(key, options);
  try {
    return await projectListLoader(key);
  } finally {
    listOptions.delete(key);
  }
}

const relatedOptions = new Map<string, { repoKey: string; limit: number }>();
const relatedLoader = createCachedLoader<RelatedProject[]>({
  cacheGet: getCachedProjectValue,
  cacheSet: setCachedProjectValue,
  dbLoad: async (key) => {
    const options = relatedOptions.get(key);
    return options ? getRelatedProjects(options.repoKey, options.limit) : [];
  },
});

export async function getRelatedProjectsCached(repoKey: string, limit = 6) {
  const key = relatedProjectsCacheKey(repoKey, limit);
  relatedOptions.set(key, { repoKey, limit });
  try {
    return await relatedLoader(key);
  } finally {
    relatedOptions.delete(key);
  }
}

export async function getDeveloperCommonProjectsCached(
  usernameA: string,
  usernameB: string,
  limit = 6,
) {
  const [a, b] = [usernameA.toLowerCase(), usernameB.toLowerCase()].sort();
  const key = `projects:common:${a}:${b}:${limit}`;
  const load = createCachedLoader<ProjectListItem[]>({
    cacheGet: getCachedProjectValue,
    cacheSet: setCachedProjectValue,
    dbLoad: () => getDeveloperCommonProjects(a, b, limit),
  });
  return load(key);
}
