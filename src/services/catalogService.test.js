import { describe, expect, it } from "vitest";
import { chunkIds } from "./catalogService.js";

describe("catalogService", () => {
  it("chunkIds splits unique ids into batches", () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const chunks = chunkIds(ids, 100);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });

  it("chunkIds deduplicates ids", () => {
    expect(chunkIds(["a", "a", "b"], 10)).toEqual([["a", "b"]]);
  });
});
