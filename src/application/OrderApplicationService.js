export class OrderApplicationService {
  constructor({ repository, steps = [], logger = null }) {
    if (!repository) throw new Error("ORDER_REPOSITORY_REQUIRED");
    this.repository = repository;
    this.steps = steps;
    this.logger = logger;
    this.processedKeys = new Set();
  }

  async create(command) {
    const key = command?.idempotencyKey || command?.id;
    if (!key) throw new Error("ORDER_IDEMPOTENCY_KEY_REQUIRED");
    if (this.processedKeys.has(key)) {
      return { created: false, duplicate: true, state: this.repository.read() };
    }
    const state = this.repository.transaction((initialState) =>
      this.steps.reduce(
        (currentState, step) => step(currentState, command),
        initialState,
      ),
    );
    this.processedKeys.add(key);
    await this.logger?.({
      action: "Order application workflow",
      target: command.id || key,
      details: "completed",
    });
    return { created: true, duplicate: false, state };
  }
}
