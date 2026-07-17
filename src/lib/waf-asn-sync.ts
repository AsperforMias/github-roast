import {
  buildProxyFarmWafRule,
  extractWafRules,
  isCurrentProxyFarmWafRule,
  WAF_ASN_RULE_NAME,
  type WafRule,
} from "./waf-asn";

export type WafSyncStatus = "dry-run" | "created" | "up-to-date" | "drift";

export type WafSyncResult = {
  status: WafSyncStatus;
  rule: WafRule;
};

type WafSyncOptions = {
  apply: boolean;
  apiBase: string;
  token?: string;
  projectId?: string;
  teamId?: string;
  fetchImpl?: typeof fetch;
};

function endpoint(options: WafSyncOptions, suffix: string): string {
  const url = new URL(`${options.apiBase.replace(/\/$/, "")}${suffix}`);
  if (options.projectId) url.searchParams.set("projectId", options.projectId);
  if (options.teamId) url.searchParams.set("teamId", options.teamId);
  return url.toString();
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Synchronize the source-controlled ASN denylist to Vercel's control plane.
 * A changed existing rule deliberately reports `drift` rather than overwrite:
 * the Firewall API's update operations can also alter unrelated configuration,
 * so an operator must review that change in the Vercel audit log first.
 */
export async function syncProxyFarmWafRule(options: WafSyncOptions): Promise<WafSyncResult> {
  const rule = buildProxyFarmWafRule();
  if (!options.apply) return { status: "dry-run", rule };

  if (!options.token || !options.projectId) {
    throw new Error("--apply requires VERCEL_TOKEN and VERCEL_PROJECT_ID");
  }

  const request = options.fetchImpl ?? fetch;
  const current = await request(endpoint(options, "/v1/security/firewall/config/active"), {
    headers: authHeaders(options.token),
  });
  if (!current.ok) {
    throw new Error(`could not read Vercel Firewall configuration (${current.status})`);
  }

  const existing = extractWafRules(await current.json()).find((item) => item.name === WAF_ASN_RULE_NAME);
  if (existing) {
    return { status: isCurrentProxyFarmWafRule(existing) ? "up-to-date" : "drift", rule };
  }

  const response = await request(endpoint(options, "/v1/security/firewall/config"), {
    method: "PATCH",
    headers: authHeaders(options.token),
    body: JSON.stringify({ action: "rules.insert", id: null, value: rule }),
  });
  if (!response.ok) {
    throw new Error(`could not create Vercel Firewall rule (${response.status})`);
  }
  return { status: "created", rule };
}
