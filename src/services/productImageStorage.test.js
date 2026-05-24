import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();
const mockFrom = vi.fn(() => ({
  upload: mockUpload,
  getPublicUrl: mockGetPublicUrl,
}));

vi.mock("../supabase.js", () => ({
  isSupabaseConfigured: true,
  hasSupabaseAuthSession: vi.fn(async () => true),
  getSupabase: vi.fn(async () => ({
    storage: {
      from: mockFrom,
    },
  })),
}));

vi.mock("../utils/productImages.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    compressProductImageFile: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
  };
});

import {
  PRODUCT_IMAGES_BUCKET,
  formatProductImageUploadError,
  getProductImagePublicUrl,
  uploadProductImageBlob,
} from "./productImageStorage.js";

describe("productImageStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/ac-creation-products/p1/test.jpg" },
    });
  });

  it("upload vers le bucket ac-creation-products", async () => {
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    const url = await uploadProductImageBlob(blob, { productId: "prod-1" });

    expect(mockFrom).toHaveBeenCalledWith(PRODUCT_IMAGES_BUCKET);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^prod-1\/.+\.jpg$/),
      blob,
      expect.objectContaining({ contentType: "image/jpeg" })
    );
    expect(url).toContain("ac-creation-products");
  });

  it("résout l'URL publique", () => {
    const supabase = { storage: { from: mockFrom } };
    const url = getProductImagePublicUrl(supabase, "prod-1/test.jpg");
    expect(mockFrom).toHaveBeenCalledWith(PRODUCT_IMAGES_BUCKET);
    expect(url).toContain("ac-creation-products");
  });

  it("formate une erreur RLS Storage en français", () => {
    const message = formatProductImageUploadError({
      code: "42501",
      message: "new row violates row-level security policy",
    });
    expect(message).toContain("Import refusé");
    expect(message).toContain("Storage");
    expect(message).toContain("SUPABASE.md");
  });

  it("relance une erreur RLS depuis uploadProductImageBlob", async () => {
    mockUpload.mockResolvedValue({
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    const blob = new Blob(["jpeg"], { type: "image/jpeg" });

    await expect(uploadProductImageBlob(blob, { productId: "prod-1" })).rejects.toThrow(
      /Import refusé/
    );
  });
});
