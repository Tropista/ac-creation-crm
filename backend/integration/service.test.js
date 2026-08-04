import { describe, expect, it, vi } from "vitest";
import { CrmIntegrationService } from "./service.js";

const event = { id: "event-1", type: "order.created", payload: {} };

describe("CrmIntegrationService", () => {
  it("rejoue explicitement un evenement precedent en echec", async () => {
    const repository = {
      findEvent: vi
        .fn()
        .mockResolvedValueOnce({ id: event.id, status: "failed" })
        .mockResolvedValueOnce({ id: event.id, status: "processing" }),
      restartEvent: vi.fn().mockResolvedValue(false),
      startEvent: vi.fn(),
    };
    const service = new CrmIntegrationService({
      repository,
      versionInfo: { version: "test" },
    });

    const result = await service.event(event);

    expect(repository.restartEvent).toHaveBeenCalledWith(event);
    expect(repository.startEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accepted: true, duplicate: true });
  });

  it("conserve l'idempotence d'un evenement termine", async () => {
    const repository = {
      findEvent: vi.fn().mockResolvedValue({
        id: event.id,
        status: "completed",
        result: { targetId: "order-1" },
      }),
      restartEvent: vi.fn(),
      startEvent: vi.fn(),
    };
    const service = new CrmIntegrationService({
      repository,
      versionInfo: { version: "test" },
    });

    const result = await service.event(event);

    expect(result).toMatchObject({
      accepted: true,
      duplicate: true,
      targetId: "order-1",
    });
    expect(repository.restartEvent).not.toHaveBeenCalled();
  });
});
