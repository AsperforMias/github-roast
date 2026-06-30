import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "../BrandMark";

describe("BrandMark", () => {
  it("renders the selected developer-network mark as a decorative SVG", () => {
    const html = renderToStaticMarkup(<BrandMark />);

    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-brand-part="code-core"');
    expect(html).toContain('data-brand-part="social-orbit"');
  });
});
