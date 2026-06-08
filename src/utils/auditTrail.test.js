import { describe, expect, it, vi } from "vitest";
import { deleteItemWithAudit, getRestorableDeletedItems, restoreDeletedItem } from "./auditTrail.js";

describe("auditTrail", () => {
  it("conserve un snapshot supprimé et permet la restauration", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "id-fixed" });

    const data = {
      clients: [{ id: "c1", name: "Client" }],
      deletedItems: [],
      logs: [],
    };

    const afterDelete = deleteItemWithAudit(data, {
      collection: "clients",
      itemId: "c1",
      user: "Admin",
      role: "Admin",
    });

    expect(afterDelete.clients).toHaveLength(0);
    expect(getRestorableDeletedItems(afterDelete)).toHaveLength(1);
    expect(afterDelete.logs[0].action).toBe("Suppression");

    const afterRestore = restoreDeletedItem(afterDelete, afterDelete.deletedItems[0].id);
    expect(afterRestore.clients).toHaveLength(1);
    expect(getRestorableDeletedItems(afterRestore)).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});
