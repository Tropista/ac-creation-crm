import { createCrmStateRepository } from "./crmStateRepository";

const COLLECTIONS = {
  clients: "clients",
  quotes: "quotes",
  invoices: "invoices",
  payments: "payments",
  products: "products",
  deliveryNotes: "delivery_notes",
};

function rowsToItems(rows = []) {
  return rows.map((row) => ({ id: row.id, ...(row.data || {}) }));
}

export class SupabaseCrmIntegrationRepository {
  constructor(client) {
    if (!client) throw new Error("SUPABASE_CLIENT_REQUIRED");
    this.client = client;
    this.stateRepository = createCrmStateRepository({});
  }

  async initialize() {
    const entries = await Promise.all(
      Object.entries(COLLECTIONS).map(async ([key, table]) => {
        const { data, error } = await this.client.from(table).select("id,data");
        if (error) throw error;
        return [key, rowsToItems(data)];
      }),
    );
    const { data: settings, error } = await this.client
      .from("settings")
      .select("data")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;
    this.stateRepository.replace({
      ...Object.fromEntries(entries),
      settings: settings?.data || {},
    });
    return this.read();
  }

  read() {
    return this.stateRepository.read();
  }

  transaction(operation) {
    return this.stateRepository.transaction(operation);
  }

  async persist(previousState, nextState) {
    const changes = {};
    for (const [key, table] of Object.entries(COLLECTIONS)) {
      const previous = new Map(
        (previousState[key] || []).map((item) => [item.id, item]),
      );
      const changed = (nextState[key] || []).filter(
        (item) =>
          JSON.stringify(previous.get(item.id)) !== JSON.stringify(item),
      );
      if (changed.length) changes[table] = changed;
    }
    if (!Object.keys(changes).length) return;
    const { error } = await this.client.rpc("persist_crm_integration_state", {
      changes,
    });
    if (error) throw error;
  }

  async reserveNonce({ keyId, nonce, timestamp, expiresAt }) {
    const { error: cleanupError } = await this.client
      .from("crm_integration_nonces")
      .delete()
      .lt("expires_at", new Date().toISOString());
    if (cleanupError) throw cleanupError;
    const { error } = await this.client.from("crm_integration_nonces").insert({
      key_id: keyId,
      nonce,
      request_timestamp: new Date(timestamp).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
    });
    if (error?.code === "23505") return false;
    if (error) throw error;
    return true;
  }

  async findEvent(eventId) {
    const { data, error } = await this.client
      .from("crm_integration_events")
      .select("id,status,result,error_code")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async startEvent(event) {
    const { error } = await this.client.from("crm_integration_events").insert({
      id: event.id,
      event_type: event.type,
      event_version: event.version,
      occurred_at: event.occurredAt,
      payload: event.payload,
      status: "processing",
    });
    if (error?.code === "23505") return false;
    if (error) throw error;
    return true;
  }

  async completeEvent(eventId, result) {
    const { error } = await this.client
      .from("crm_integration_events")
      .update({
        status: "completed",
        result,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (error) throw error;
  }

  async failEvent(eventId, errorCode) {
    const { error } = await this.client
      .from("crm_integration_events")
      .update({
        status: "failed",
        error_code: errorCode,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    if (error) throw error;
  }

  async acknowledge(ack) {
    const { error } = await this.client.from("crm_integration_acks").upsert(
      {
        event_id: ack.eventId,
        received_at: ack.receivedAt,
        metadata: ack.metadata || {},
      },
      { onConflict: "event_id" },
    );
    if (error) throw error;
  }

  async logCall(entry) {
    const { error } = await this.client
      .from("crm_integration_logs")
      .insert(entry);
    if (error) console.error("[crm-integration-log]", error.message);
  }

  async status() {
    const [events, pending, deadLetters, retries] = await Promise.all([
      this.client
        .from("crm_integration_events")
        .select("*", { count: "exact", head: true }),
      this.client
        .from("crm_integration_events")
        .select("*", { count: "exact", head: true })
        .eq("status", "processing"),
      this.client
        .from("crm_integration_events")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed"),
      this.client
        .from("crm_integration_events")
        .select("*", { count: "exact", head: true })
        .gt("retry_count", 0),
    ]);
    const error = [events, pending, deadLetters, retries].find(
      (result) => result.error,
    )?.error;
    if (error) throw error;
    return {
      events: events.count || 0,
      pending: pending.count || 0,
      deadLetters: deadLetters.count || 0,
      retry: retries.count || 0,
    };
  }
}
