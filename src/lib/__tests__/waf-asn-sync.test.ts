import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { syncProxyFarmWafRule } from "@/lib/waf-asn-sync";
import { PROXY_FARM_ASNS, WAF_ASN_RULE_NAME } from "@/lib/waf-asn";

type RecordedRequest = { method: string; url: string; body: unknown };

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  server.close();
  await once(server, "close");
  server = undefined;
});

async function withMockFirewall(rules: unknown[] = []) {
  const requests: RecordedRequest[] = [];
  server = createServer(async (req, res) => {
    const body = await new Promise<string>((resolve) => {
      let value = "";
      req.on("data", (chunk) => {
        value += chunk;
      });
      req.on("end", () => resolve(value));
    });
    requests.push({ method: req.method ?? "", url: req.url ?? "", body: body ? JSON.parse(body) : null });

    if (req.method === "GET" && req.url?.startsWith("/v1/security/firewall/config/active")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ rules }));
      return;
    }
    if (req.method === "PATCH" && req.url?.startsWith("/v1/security/firewall/config?")) {
      res.setHeader("content-type", "application/json");
      res.end("{}");
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock firewall did not bind a TCP port");
  return { apiBase: `http://127.0.0.1:${address.port}`, requests };
}

describe("syncProxyFarmWafRule", () => {
  it("is inert without --apply", async () => {
    const result = await syncProxyFarmWafRule({ apply: false, apiBase: "https://example.test" });
    expect(result.status).toBe("dry-run");
    expect(result.rule.conditionGroup[0]?.conditions[0]?.value).toEqual(PROXY_FARM_ASNS);
  });

  it("creates the exact ASN deny rule through the Vercel Firewall control plane", async () => {
    const mock = await withMockFirewall();
    const result = await syncProxyFarmWafRule({
      apply: true,
      apiBase: mock.apiBase,
      token: "test-token",
      projectId: "project_test",
      teamId: "team_test",
    });

    expect(result.status).toBe("created");
    expect(mock.requests).toHaveLength(2);
    expect(mock.requests[0]).toMatchObject({ method: "GET" });
    expect(mock.requests[1]).toMatchObject({ method: "PATCH" });
    expect(mock.requests[1]?.url).toContain("projectId=project_test");
    expect(mock.requests[1]?.body).toEqual({
      action: "rules.insert",
      id: null,
      value: {
        active: true,
        name: WAF_ASN_RULE_NAME,
        description: expect.any(String),
        conditionGroup: [
          {
            conditions: [
              {
                type: "geo_as_number",
                op: "inc",
                value: PROXY_FARM_ASNS,
              },
            ],
          },
        ],
        action: { mitigate: { action: "deny" } },
      },
    });
  });

  it("does not duplicate an already-current live rule", async () => {
    const mock = await withMockFirewall([
      {
        id: "rule_1",
        name: WAF_ASN_RULE_NAME,
        active: true,
        conditionGroup: [
          { conditions: [{ type: "geo_as_number", op: "inc", value: [...PROXY_FARM_ASNS].reverse() }] },
        ],
        action: { mitigate: { action: "deny" } },
      },
    ]);
    const result = await syncProxyFarmWafRule({
      apply: true,
      apiBase: mock.apiBase,
      token: "test-token",
      projectId: "project_test",
    });

    expect(result.status).toBe("up-to-date");
    expect(mock.requests).toHaveLength(1);
  });

  it("reports drift rather than overwriting a live rule", async () => {
    const mock = await withMockFirewall([
      {
        id: "rule_1",
        name: WAF_ASN_RULE_NAME,
        active: true,
        conditionGroup: [{ conditions: [{ type: "geo_as_number", op: "inc", value: ["123"] }] }],
        action: { mitigate: { action: "deny" } },
      },
    ]);
    const result = await syncProxyFarmWafRule({
      apply: true,
      apiBase: mock.apiBase,
      token: "test-token",
      projectId: "project_test",
    });

    expect(result.status).toBe("drift");
    expect(mock.requests).toHaveLength(1);
  });
});
