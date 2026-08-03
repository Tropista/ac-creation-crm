import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "./assets.js";

describe("resolveAssetUrl", () => {
  it("joins the Vite base URL with a relative path", () => {
    expect(resolveAssetUrl("logo.png")).toMatch(/logo\.png$/);
    expect(resolveAssetUrl("icons/app.svg")).toMatch(/icons\/app\.svg$/);
  });

  it("strips leading slashes before joining", () => {
    expect(resolveAssetUrl("/logo.png")).toBe(resolveAssetUrl("logo.png"));
  });
});
