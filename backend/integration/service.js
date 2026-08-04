import { processIntegrationEvent } from "./application.js";

export class CrmIntegrationService {
  constructor({ repository, versionInfo, startedAt = Date.now() }) {
    this.repository = repository;
    this.versionInfo = versionInfo;
    this.startedAt = startedAt;
  }

  async health() {
    await Promise.all([this.repository.status(), this.repository.initialize()]);
    return {
      application: "healthy",
      database: "healthy",
      repositories: "healthy",
      services: "healthy",
      atelier: "healthy",
      production: "healthy",
    };
  }

  version() {
    return this.versionInfo;
  }

  async status() {
    const metrics = await this.repository.status();
    return {
      healthy: true,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      ...metrics,
      production: "healthy",
      atelier: "healthy",
      version: this.versionInfo.version,
    };
  }

  async event(event) {
    const existing = await this.repository.findEvent(event.id);
    if (existing && existing.status !== "failed") {
      return {
        accepted: true,
        duplicate: true,
        eventId: event.id,
        ...(existing.result || {}),
      };
    }
    const started = existing
      ? await this.repository.restartEvent(event)
      : await this.repository.startEvent(event);
    if (!started) {
      const stored = await this.repository.findEvent(event.id);
      return {
        accepted: true,
        duplicate: true,
        eventId: event.id,
        ...(stored?.result || {}),
      };
    }
    try {
      const result = await processIntegrationEvent(this.repository, event);
      const externalIds = result.state.integrationResult || {};
      const response = {
        accepted: true,
        duplicate: result.duplicate,
        eventId: event.id,
        ...externalIds,
        externalIds,
        targetId: externalIds.orderId || externalIds.customerId,
        status: externalIds.reviewStatus || "completed",
        version: this.versionInfo.version,
      };
      await this.repository.completeEvent(event.id, response);
      return response;
    } catch (error) {
      await this.repository.failEvent(
        event.id,
        error.message || "CRM_EVENT_FAILED",
      );
      throw error;
    }
  }

  async ack(ack) {
    const event = await this.repository.findEvent(ack.eventId);
    if (!event) {
      throw Object.assign(new Error("CRM_ACK_EVENT_NOT_FOUND"), {
        status: 404,
      });
    }
    await this.repository.acknowledge(ack);
    return { acknowledged: true, eventId: ack.eventId };
  }
}
