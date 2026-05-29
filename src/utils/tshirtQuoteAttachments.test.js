import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  attachConfiguratorExportsToDraft,
  CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
  formatConfiguratorAttachmentErrors,
  withTimeout,
} from "./tshirtQuoteAttachments";

vi.mock("../services/quoteAttachmentStorage", () => ({
  uploadQuoteAttachmentFileWithLocalFallback: vi.fn(async (file) => ({
    url: `blob:mock-${file.name}`,
    storagePath: "",
    localBlobId: file.size > 500 * 1024 ? "idb-zip" : "",
    source: file.size > 500 * 1024 ? "local-idb" : "local",
  })),
}));

describe("withTimeout", () => {
  it("résout si la promesse finit avant le délai", async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it("rejette si la promesse dépasse le délai", async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(
      withTimeout(slow, 20, "trop lent")
    ).rejects.toThrow("trop lent");
  });
});

describe("tshirtQuoteAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expose un délai d'attachement de 60 s", () => {
    expect(CONFIGURATOR_ATTACHMENT_TIMEOUT_MS).toBe(60_000);
  });

  it("joint ZIP et PDF au brouillon", async () => {
    const zipBlob = new Blob(["zip-content-large"], { type: "application/zip" });
    Object.defineProperty(zipBlob, "size", { value: 600 * 1024 });
    const pdfBlob = new Blob(["pdf"], { type: "application/pdf" });

    const result = await attachConfiguratorExportsToDraft(
      { source: "configurateur t-shirt", lines: [], notes: "Notes atelier" },
      { zipBlob, pdfBlob }
    );

    expect(result.attachments).toHaveLength(2);
    expect(result.attachments.some((entry) => entry.name.endsWith(".zip"))).toBe(true);
    expect(result.attachments.some((entry) => entry.name.endsWith(".pdf"))).toBe(true);
    expect(result.attachmentErrors).toHaveLength(0);
    expect(result.notes).toBe("Notes atelier");
  });

  it("signale l'échec ZIP sans bloquer le PDF", async () => {
    const { uploadQuoteAttachmentFileWithLocalFallback } = await import(
      "../services/quoteAttachmentStorage"
    );
    uploadQuoteAttachmentFileWithLocalFallback.mockImplementation(async (file) => {
      if (file.name.endsWith(".zip")) {
        throw new Error("ZIP trop lourd");
      }
      return { url: "data:application/pdf;base64,AA==", storagePath: "", source: "local" };
    });

    const result = await attachConfiguratorExportsToDraft(
      { lines: [] },
      {
        zipBlob: new Blob(["zip"], { type: "application/zip" }),
        pdfBlob: new Blob(["pdf"], { type: "application/pdf" }),
      }
    );

    expect(result.attachments).toHaveLength(1);
    expect(result.attachmentErrors).toHaveLength(1);
    expect(result.attachmentErrors[0].kind).toBe("zip");
    expect(formatConfiguratorAttachmentErrors(result.attachmentErrors)).toContain("ZIP trop lourd");
  });

  it("signale un upload ZIP expiré sans bloquer", async () => {
    vi.useFakeTimers();
    const { uploadQuoteAttachmentFileWithLocalFallback } = await import(
      "../services/quoteAttachmentStorage"
    );
    uploadQuoteAttachmentFileWithLocalFallback.mockImplementation(async (file) => {
      if (/\.zip$/i.test(file?.name || "")) {
        return new Promise(() => {});
      }
      return { url: "data:application/pdf;base64,AA==", storagePath: "", source: "local" };
    });

    const pending = attachConfiguratorExportsToDraft(
      { lines: [] },
      {
        zipBlob: new Blob(["zip"], { type: "application/zip" }),
        pdfBlob: new Blob(["pdf"], { type: "application/pdf" }),
      }
    );
    await vi.advanceTimersByTimeAsync(CONFIGURATOR_ATTACHMENT_TIMEOUT_MS + 50);
    const result = await pending;
    vi.useRealTimers();

    expect(result.attachments.some((entry) => entry.name.endsWith(".pdf"))).toBe(true);
    expect(result.attachmentErrors.some((entry) => entry.kind === "zip")).toBe(true);
    expect(formatConfiguratorAttachmentErrors(result.attachmentErrors)).toContain("60 s");
  });
});
