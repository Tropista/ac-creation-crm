import { describe, expect, it } from "vitest";
import {
  extractImgSrcFromHtml,
  extractUrlFromText,
  looksLikeImageUrl,
  normalizePastedImageUrl,
  parseDropPayload,
  patchClientCatalogItemImage,
} from "./catalogImageOverride.js";

describe("catalogImageOverride", () => {
  it("extracts img src from html drag payload", () => {
    const html =
      '<meta charset="utf-8"><img src="https://www.lamaisonduteeshirt.com/media/catalog/product/p-blank-TH/3128.webp" />';
    expect(extractImgSrcFromHtml(html)).toContain("3128.webp");
  });

  it("normalizes external and data URLs", () => {
    expect(normalizePastedImageUrl("https://example.com/a.webp")).toBe(
      "https://example.com/a.webp"
    );
    expect(normalizePastedImageUrl("data:image/jpeg;base64,abc")).toBe(
      "data:image/jpeg;base64,abc"
    );
    expect(normalizePastedImageUrl("not-a-url")).toBeNull();
  });

  it("accepts LMDT media URLs", () => {
    const url =
      "https://www.lamaisonduteeshirt.com/media/catalog/product/p-blank-TH/3128.webp";
    expect(looksLikeImageUrl(url)).toBe(true);
  });

  it("parses html drop before plain text", () => {
    const dataTransfer = {
      files: [],
      getData(type) {
        if (type === "text/html") {
          return '<img src="https://cdn.example.com/packshot.jpg" />';
        }
        if (type === "text/plain") {
          return "https://www.lamaisonduteeshirt.com/produits/tee-shirts";
        }
        return "";
      },
    };

    expect(parseDropPayload(dataTransfer)).toEqual({
      kind: "url",
      url: "https://cdn.example.com/packshot.jpg",
    });
  });

  it("extracts first non-comment line from uri-list", () => {
    const text = "# comment\nhttps://example.com/image.png\n";
    expect(extractUrlFromText(text)).toBe("https://example.com/image.png");
  });

  it("patches client catalog item imageUrl", () => {
    const data = {
      clientCatalogItems: [
        { id: "a", name: "Regent", imageUrl: "old" },
        { id: "b", name: "Other", imageUrl: "" },
      ],
    };

    const next = patchClientCatalogItemImage(data, "a", "https://example.com/new.webp");
    expect(next.clientCatalogItems[0].imageUrl).toBe("https://example.com/new.webp");
    expect(next.clientCatalogItems[0].updatedAt).toBeTruthy();
    expect(next.clientCatalogItems[1].imageUrl).toBe("");
  });
});
