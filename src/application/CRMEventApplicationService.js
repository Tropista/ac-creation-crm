export class CRMEventApplicationService {
  constructor({ repository, handlers = {}, logger = null }) {
    if (!repository) throw new Error("CRM_EVENT_REPOSITORY_REQUIRED");
    this.repository = repository;
    this.handlers = handlers;
    this.logger = logger;
    this.processedEventIds = new Set();
  }

  async handle(event) {
    if (!event?.id || !event?.type) throw new Error("CRM_EVENT_INVALID");
    if (this.processedEventIds.has(event.id)) {
      return {
        processed: false,
        duplicate: true,
        state: this.repository.read(),
      };
    }
    const handler = this.handlers[event.type];
    if (!handler) throw new Error(`CRM_EVENT_UNSUPPORTED:${event.type}`);
    const state = this.repository.transaction((currentState) =>
      handler(currentState, event.payload, event),
    );
    this.processedEventIds.add(event.id);
    await this.logger?.({
      action: "CRM event processed",
      target: event.type,
      details: event.id,
    });
    return { processed: true, duplicate: false, state };
  }
}
