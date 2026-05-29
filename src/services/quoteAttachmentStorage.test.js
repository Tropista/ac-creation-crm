import { describe, expect, it, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
const hasSupabaseAuthSessionMock = vi.fn(async () => true);

vi.mock("../supabase.js", () => ({
  getSupabase: vi.fn(async () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/file.zip" } }),
      }),
    },
  })),
  hasSupabaseAuthSession: (...args) => hasSupabaseAuthSessionMock(...args),
  isSupabaseConfigured: true,
}));

vi.mock("../utils/quoteAttachmentLocalStore.js", () => ({
  storeLocalQuoteAttachmentBlob: vi.fn(async () => "local-blob-id"),
}));

vi.mock("../utils/quoteAttachments.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fileToDataUrl: vi.fn(async (file) => `data:${file.type || "application/octet-stream"};base64,QUFB`),
    isLargeBase64Attachment: vi.fn((url) => String(url).length > 600_000),
  };
});

import { storeLocalQuoteAttachmentBlob } from "../utils/quoteAttachmentLocalStore.js";
import { fileToDataUrl, isLargeBase64Attachment } from "../utils/quoteAttachments.js";
import { uploadQuoteAttachmentFileWithLocalFallback } from "./quoteAttachmentStorage.js";

describe("uploadQuoteAttachmentFileWithLocalFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasSupabaseAuthSessionMock.mockResolvedValue(true);
    uploadMock.mockRejectedValue({ message: "new row violates row-level security policy" });
    fileToDataUrl.mockImplementation(
      async (file) => `data:${file.type || "application/octet-stream"};base64,QUFB`
    );
    isLargeBase64Attachment.mockImplementation((url) => String(url).length > 600_000);
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
  });

  it("repli local si l'upload cloud échoue (RLS, taille, etc.)", async () => {
    const file = new File(["zip-content"], "export.zip", { type: "application/zip" });
    const result = await uploadQuoteAttachmentFileWithLocalFallback(file, { quoteId: "draft" });

    expect(uploadMock).toHaveBeenCalled();
    expect(result.source).toBe("local");
    expect(result.url).toMatch(/^data:application\/zip/);
    expect(storeLocalQuoteAttachmentBlob).not.toHaveBeenCalled();
  });

  it("utilise IndexedDB pour les fichiers volumineux après échec cloud", async () => {
    isLargeBase64Attachment.mockReturnValue(true);
    const largeContent = "x".repeat(700 * 1024);
    const file = new File([largeContent], "export.zip", { type: "application/zip" });

    const result = await uploadQuoteAttachmentFileWithLocalFallback(file, { quoteId: "draft" });

    expect(result.source).toBe("local-idb");
    expect(result.localBlobId).toBe("local-blob-id");
    expect(storeLocalQuoteAttachmentBlob).toHaveBeenCalledWith(file);
  });
});
