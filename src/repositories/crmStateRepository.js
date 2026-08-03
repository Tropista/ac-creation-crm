/**
 * Repository transactionnel pour le snapshot CRM.
 * L'adaptateur ne connaît ni React, ni Vite, ni Electron et peut être remplacé
 * plus tard par un repository Supabase côté serveur.
 */
export class CrmStateRepository {
  #state;

  constructor(initialState = {}) {
    this.#state = initialState;
  }

  read() {
    return this.#state;
  }

  replace(nextState) {
    this.#state = nextState;
    return this.#state;
  }

  transaction(operation) {
    const previousState = this.#state;
    try {
      const result = operation(previousState);
      if (!result || typeof result !== "object") {
        throw new Error("CRM_TRANSACTION_INVALID_RESULT");
      }
      this.#state = result;
      return result;
    } catch (error) {
      this.#state = previousState;
      throw error;
    }
  }
}

export function createCrmStateRepository(initialState) {
  return new CrmStateRepository(initialState);
}
