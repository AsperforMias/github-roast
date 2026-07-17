import proxyFarmAsns from "../../config/proxy-farm-asns.json";

export type WafCondition = {
  type: "geo_as_number";
  op: "inc";
  value: string[];
};

export type WafRule = {
  active: boolean;
  name: string;
  description: string;
  conditionGroup: Array<{ conditions: WafCondition[] }>;
  action: { mitigate: { action: "deny" } };
};

type RemoteWafRule = {
  id?: string;
  name?: string;
  active?: boolean;
  conditionGroup?: unknown;
  action?: unknown;
};

export const WAF_ASN_RULE_NAME = proxyFarmAsns.ruleName;
export const PROXY_FARM_ASNS = Object.freeze([...proxyFarmAsns.asns]);

function normalizedAsns(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => /^\d+$/.test(value)))].sort(
    (a, b) => Number(a) - Number(b),
  );
}

/** The canonical Vercel WAF custom rule. `geo_as_number` is evaluated by Vercel
 * before a request reaches the deployment, unlike a Next.js middleware check. */
export function buildProxyFarmWafRule(): WafRule {
  return {
    active: true,
    name: WAF_ASN_RULE_NAME,
    description: proxyFarmAsns.description,
    conditionGroup: [
      {
        conditions: [
          {
            type: "geo_as_number",
            op: "inc",
            value: [...PROXY_FARM_ASNS],
          },
        ],
      },
    ],
    action: { mitigate: { action: "deny" } },
  };
}

/** Accept the two documented Firewall response envelopes (`rules` and
 * `active.rules`) without assuming a particular API version. */
export function extractWafRules(payload: unknown): RemoteWafRule[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.rules)) return root.rules.filter(isRemoteWafRule);
  if (root.active && typeof root.active === "object") {
    const active = root.active as Record<string, unknown>;
    if (Array.isArray(active.rules)) return active.rules.filter(isRemoteWafRule);
  }
  return [];
}

function isRemoteWafRule(value: unknown): value is RemoteWafRule {
  return !!value && typeof value === "object";
}

function asnValues(rule: RemoteWafRule): string[] {
  if (!Array.isArray(rule.conditionGroup)) return [];
  for (const group of rule.conditionGroup) {
    if (!group || typeof group !== "object") continue;
    const conditions = (group as { conditions?: unknown }).conditions;
    if (!Array.isArray(conditions)) continue;
    for (const condition of conditions) {
      if (!condition || typeof condition !== "object") continue;
      const item = condition as { type?: unknown; op?: unknown; value?: unknown };
      if (item.type !== "geo_as_number" || item.op !== "inc" || !Array.isArray(item.value)) continue;
      return item.value.filter((value): value is string => typeof value === "string");
    }
  }
  return [];
}

/** A matching name alone is not enough: a stale WAF rule is reported as drift
 * so the sync command never silently claims a changed denylist is deployed. */
export function isCurrentProxyFarmWafRule(rule: RemoteWafRule): boolean {
  const action = rule.action as { mitigate?: { action?: unknown } } | undefined;
  return (
    rule.name === WAF_ASN_RULE_NAME &&
    rule.active === true &&
    action?.mitigate?.action === "deny" &&
    JSON.stringify(normalizedAsns(asnValues(rule))) === JSON.stringify(normalizedAsns(PROXY_FARM_ASNS))
  );
}
