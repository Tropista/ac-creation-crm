import { describe, expect, it } from "vitest";
import {
  isLmdtModelImageUrl,
  isLmdtPackshotImageUrl,
  resolveCatalogImageUrl,
} from "./lmdtImages.js";

describe("lmdtImages", () => {
  const packshot =
    "https://media.lamaisonduteeshirt.com/abc/pr:200x300greybg/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC1ibGFuay1USC8xNzgwLndlYnA";
  const model =
    "https://media.lamaisonduteeshirt.com/def/pr:200x300/aHR0cDovL21lZGlhMi5kZXNpZ25wYXJ0bmVyLmZyL2MvcC8xNzUvMTc1LTE5OS0xLmpwZw";

  it("detects packshot and model URLs", () => {
    expect(isLmdtPackshotImageUrl(packshot)).toBe(true);
    expect(isLmdtModelImageUrl(model)).toBe(true);
    expect(isLmdtModelImageUrl(packshot)).toBe(false);
  });

  it("prefers packshot over model when merging", () => {
    expect(resolveCatalogImageUrl(packshot, model)).toBe(packshot);
    expect(resolveCatalogImageUrl(model, packshot)).toBe(packshot);
    expect(resolveCatalogImageUrl(model, "")).toBe("");
    expect(resolveCatalogImageUrl("", model)).toBe("");
  });
});
