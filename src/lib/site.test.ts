import { describe, expect, it } from "vitest";

import { SITE } from "./site";

describe("SITE constants", () => {
  it("names the project consistently for the brand generator and metadata", () => {
    expect(SITE.name).toBe("clarifier");
  });

  it("uses https for every external URL", () => {
    expect(SITE.portfolioUrl.startsWith("https://")).toBe(true);
    expect(SITE.repoUrl.startsWith("https://")).toBe(true);
    expect(SITE.url.startsWith("https://")).toBe(true);
  });
});
