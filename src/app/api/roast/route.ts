import { NextRequest, NextResponse } from "next/server";
import { getPercentile, recordScore } from "@/lib/db";
import { LlmConfig, LlmQuotaError, chatStream, defaultLlmConfig } from "@/lib/llm";
import { beatPercent } from "@/lib/percentile";
import { buildRoastMessages } from "@/lib/prompt";
import { clampScore, tierFor } from "@/lib/score";
import type { RoastMeta, ScanResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream sentinel: the first line is `\x1eMETA {json}\n`, the rest is the report. */
export const META_PREFIX = "META ";

interface ByoKey {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

interface RoastBody {
  scan?: ScanResult;
  byoKey?: ByoKey;
}

function resolveConfig(byo?: ByoKey): { config: LlmConfig; isDefault: boolean } | null {
  if (byo?.apiKey && byo.baseURL && byo.model) {
    return { config: { baseURL: byo.baseURL, apiKey: byo.apiKey, model: byo.model }, isDefault: false };
  }
  const config = defaultLlmConfig();
  return config ? { config, isDefault: true } : null;
}

/** Parse `@@ADJUST <int>@@` from the model's leading line; clamp to [-10, 10]. */
function parseDelta(head: string): number {
  const m = head.match(/@@ADJUST\s*([+-]?\d+(?:\.\d+)?)\s*@@/);
  if (!m) return 0;
  const n = Math.round(parseFloat(m[1]));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-10, Math.min(10, n));
}

export async function POST(req: NextRequest) {
  let body: RoastBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const scan = body.scan;
  if (!scan?.metrics || !scan.scoring) {
    return NextResponse.json({ error: "missing_scan" }, { status: 400 });
  }

  const resolved = resolveConfig(body.byoKey);
  if (!resolved) {
    return NextResponse.json({ error: "no_llm_configured", useByoKey: true }, { status: 400 });
  }
  const { config, isDefault } = resolved;

  const generator = chatStream(config, buildRoastMessages(scan));

  // Read the leading control line (`@@ADJUST n@@`) before streaming the report.
  // Pulling tokens up-front also surfaces quota/auth failures as a JSON status.
  let head = "";
  try {
    while (!head.includes("\n") && head.length < 2000) {
      const { done, value } = await generator.next();
      if (done) break;
      head += value;
    }
  } catch (e) {
    if (e instanceof LlmQuotaError) {
      return NextResponse.json(
        { error: "llm_quota", useByoKey: true, status: e.status },
        { status: 402 },
      );
    }
    console.error("roast failed:", e);
    return NextResponse.json({ error: "roast_failed" }, { status: 502 });
  }

  const delta = parseDelta(head);
  // Strip the control line so it never reaches the rendered report.
  let report = head;
  const newlineAt = head.indexOf("\n");
  if (/@@ADJUST/.test(head) && newlineAt >= 0) {
    report = head.slice(newlineAt + 1);
  }

  const adjusted = clampScore(scan.scoring.final_score + delta);
  const { tier, tier_label } = tierFor(adjusted);

  // Persist the AI-adjusted score for the leaderboard — only for the default
  // (operator) model, so a user can't inflate their public rank with a BYO model.
  if (isDefault) {
    await recordScore({
      username: scan.metrics.username,
      display_name: scan.metrics.name,
      avatar_url: scan.metrics.avatar_url,
      profile_url: scan.metrics.profile_url,
      final_score: adjusted,
      tier,
      scanned_at: Date.now(),
    });
  }
  const counts = await getPercentile(adjusted);
  const percentile = counts ? { beat: beatPercent(counts.below, counts.total), total: counts.total } : null;

  const meta: RoastMeta = { final_score: adjusted, tier, tier_label, delta, percentile };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(META_PREFIX + JSON.stringify(meta) + "\n"));
        if (report) controller.enqueue(encoder.encode(report));
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        console.error("roast stream error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
