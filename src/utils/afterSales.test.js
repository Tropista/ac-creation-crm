import { describe, expect, it } from "vitest";
import { isStaleAfterSalesCase, normalizeAfterSalesCase } from "./afterSales.js";

describe("afterSales", () => {
  it("normalise un dossier SAV", () => {
    const entry = normalizeAfterSalesCase({ subject: "Défaut", type: "Autre" });
    expect(entry.status).toBe("Ouvert");
    expect(entry.type).toBe("Autre");
  });

  it("détecte un SAV stale", () => {
    const old = new Date();
    old.setDate(old.getDate() - 20);
    expect(
      isStaleAfterSalesCase(
        normalizeAfterSalesCase({
          status: "En cours",
          updatedAt: old.toISOString(),
        })
      )
    ).toBe(true);
  });
});
