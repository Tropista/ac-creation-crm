import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase.js", () => ({
  isSupabaseConfigured: true,
  getSupabase: vi.fn(),
}));

vi.mock("./dataService.js", () => ({
  loadData: vi.fn(() => ({ clientCatalogItems: [], catalogSelections: [] })),
  saveData: vi.fn(),
}));

vi.mock("../utils/catalogShare.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadPublicCatalogCache: vi.fn(() => null),
    savePublicCatalogCache: vi.fn(() => ({ ok: true })),
  };
});

import { getSupabase } from "../supabase.js";
import {
  chunkIds,
  fetchPublicCatalogProducts,
  isRetryableSupabaseError,
  submitPublicCatalogSelection,
} from "./catalogService.js";
import { loadPublicCatalogCache, savePublicCatalogCache } from "../utils/catalogShare.js";

describe("catalogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("isRetryableSupabaseError detects transient HTTP failures", () => {
    expect(isRetryableSupabaseError({ status: 503 })).toBe(true);
    expect(isRetryableSupabaseError({ code: 502 })).toBe(true);
    expect(isRetryableSupabaseError({ message: "Service Unavailable" })).toBe(true);
    expect(isRetryableSupabaseError({ message: "Not found" })).toBe(false);
  });

  it("fetchPublicCatalogProducts returns snapshots without live fetch when images exist", async () => {
    const snapshots = [
      {
        id: "p1",
        name: "T-shirt",
        imageUrl: "https://cdn.example.com/p1.webp",
        colors: [{ name: "Noir", imageUrl: "https://cdn.example.com/p1-noir.webp" }],
      },
    ];

    const products = await fetchPublicCatalogProducts(
      { productIds: ["p1"], productSnapshots: snapshots },
      ["p1"]
    );

    expect(products).toEqual(snapshots);
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it("fetchPublicCatalogProducts falls back to snapshots when live merge fails", async () => {
    const snapshots = [
      {
        id: "p1",
        name: "T-shirt",
        imageUrl: "",
        colors: [{ name: "Noir" }],
      },
    ];

    getSupabase.mockResolvedValue({
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: { status: 503, message: "503" } }),
        }),
      }),
    });

    const products = await fetchPublicCatalogProducts(
      { productIds: ["p1"], productSnapshots: snapshots },
      ["p1"]
    );

    expect(products).toEqual(snapshots);
  });

  it("fetchPublicCatalogProducts only queries selection product ids in batches", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `id-${index}`);
    const inCalls = [];

    getSupabase.mockResolvedValue({
      from: (table) => ({
        select: () => ({
          in: (_column, batchIds) => {
            inCalls.push({ table, batchIds: [...batchIds] });
            const data = batchIds.map((id) => ({
              id,
              data: {
                id,
                name: id,
                imageUrl: "https://cdn.example.com/item.webp",
                colors: [{ name: "Noir", imageUrl: "https://cdn.example.com/noir.webp" }],
              },
            }));
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    });

    await fetchPublicCatalogProducts({ productIds: ids }, ids);

    expect(inCalls).toHaveLength(2);
    expect(inCalls.every((call) => call.table === "client_catalog_items")).toBe(true);
    expect(inCalls.every((call) => call.batchIds.length <= 100)).toBe(true);
    expect(
      inCalls.every((call) => call.batchIds.every((id) => ids.includes(id)))
    ).toBe(true);
    expect(new Set(inCalls.flatMap((call) => call.batchIds)).size).toBe(ids.length);
  });

  it("submitPublicCatalogSelection enregistre clientSubmission dans Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const shareId = "share-123";
    const currentSelection = {
      id: shareId,
      shareId,
      title: "Sélection test",
      status: "open",
      productIds: ["p1"],
      updatedAt: "2026-05-24T10:00:00.000Z",
    };

    loadPublicCatalogCache.mockReturnValue(currentSelection);
    getSupabase.mockResolvedValue({
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: shareId, data: currentSelection }, error: null }),
          }),
        }),
        upsert: upsert,
      }),
    });

    const result = await submitPublicCatalogSelection(shareId, {
      clientName: "Client Test",
      clientEmail: "client@example.com",
      choices: [{ productId: "p1", quantity: 2 }],
      productSheet: "Fiche produit",
    });

    expect(result.status).toBe("submitted");
    expect(result.clientSubmission.clientName).toBe("Client Test");
    expect(result.clientSubmission.productSheet).toBe("Fiche produit");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: shareId,
        data: expect.objectContaining({
          status: "submitted",
          clientSubmission: expect.objectContaining({
            clientName: "Client Test",
            submittedAt: expect.any(String),
          }),
        }),
      }),
      { onConflict: "id" }
    );
    expect(savePublicCatalogCache).toHaveBeenCalled();
  });
});
