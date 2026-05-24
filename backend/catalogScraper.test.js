import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
import axios from "axios";
import { refreshLmdtProductColors, resolveFetchRetries } from "./catalogScraper.js";

vi.mock("axios");

describe("catalogScraper", () => {
  it("defaults fetch retries when options.retries is omitted", () => {
    expect(resolveFetchRetries({})).toBe(2);
    expect(resolveFetchRetries({ retries: undefined })).toBe(2);
    expect(resolveFetchRetries({ retries: 0 })).toBe(0);
    expect(resolveFetchRetries({ retries: "3" })).toBe(3);
  });

  it("refreshLmdtProductColors returns imageUrl per color from detail HTML", async () => {
    const productHtml = readFileSync("tmp-lmdt-regent-live.html", "utf8");
    axios.get.mockResolvedValue({ data: productHtml });

    const results = await refreshLmdtProductColors([
      "https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
    expect(results[0].colors.length).toBeGreaterThan(10);

    const blanc = results[0].colors.find((color) => color.name === "blanc");
    expect(blanc?.imageUrl).toContain("media.lamaisonduteeshirt.com");
    expect(results[0].colors.every((color) => color.imageUrl)).toBe(true);
  });
});
