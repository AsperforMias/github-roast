import "./_env.mjs";
import { syncProxyFarmWafRule } from "../src/lib/waf-asn-sync";

const apply = process.argv.includes("--apply");

try {
  const result = await syncProxyFarmWafRule({
    apply,
    apiBase: process.env.VERCEL_API_BASE_URL ?? "https://api.vercel.com",
    token: process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "drift") {
    console.error(
      "The deployed rule has the same name but a different definition. Review it in Vercel Firewall before changing it; this script will not overwrite a live WAF rule.",
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
