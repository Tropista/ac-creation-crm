import { describe, expect, it } from "vitest";

import {
  getBase64ByteSize,
  isBase64DataUrl,
  isHttpImageUrl,
  isLargeBase64Image,
  sanitizeProductForPersistence,
  sanitizeProductsForPersistence,
  shouldStripProductImageFromStorage,
} from "./productImages.js";

function makeBase64DataUrl(sizeBytes) {
  const base64Length = Math.ceil((sizeBytes * 4) / 3);
  const payload = "A".repeat(base64Length);
  return `data:image/jpeg;base64,${payload}`;
}

describe("productImages", () => {
  it("détecte les URLs HTTP et les data URLs", () => {
    expect(isHttpImageUrl("https://cdn.example.com/p.jpg")).toBe(true);
    expect(isHttpImageUrl("data:image/jpeg;base64,abc")).toBe(false);
    expect(isBase64DataUrl("data:image/jpeg;base64,abc")).toBe(true);
  });

  it("estime la taille base64", () => {
    const small = makeBase64DataUrl(1024);
    expect(getBase64ByteSize(small)).toBeGreaterThan(900);
    expect(getBase64ByteSize(small)).toBeLessThan(1100);
  });

  it("conserve les URLs HTTP et les petites images base64", () => {
    const url = "https://example.com/product.jpg";
    const small = makeBase64DataUrl(2048);

    expect(shouldStripProductImageFromStorage(url)).toBe(false);
    expect(shouldStripProductImageFromStorage(small)).toBe(false);
    expect(sanitizeProductForPersistence({ id: "p1", imageUrl: url }).imageUrl).toBe(url);
    expect(sanitizeProductForPersistence({ id: "p1", imageUrl: small }).imageUrl).toBe(small);
  });

  it("retire les images base64 trop lourdes à la persistance", () => {
    const large = makeBase64DataUrl(150 * 1024);

    expect(isLargeBase64Image(large)).toBe(true);
    expect(shouldStripProductImageFromStorage(large)).toBe(true);
    expect(sanitizeProductForPersistence({ id: "p1", imageUrl: large }).imageUrl).toBe("");
    expect(
      sanitizeProductsForPersistence([
        { id: "p1", imageUrl: large },
        { id: "p2", imageUrl: "https://cdn.example.com/a.jpg" },
      ])
    ).toEqual([
      { id: "p1", imageUrl: "" },
      { id: "p2", imageUrl: "https://cdn.example.com/a.jpg" },
    ]);
  });
});
