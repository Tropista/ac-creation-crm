import { createCrmStateRepository } from "./crmStateRepository.js";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

const COLLECTIONS = {
  clients: "clients",
  quotes: "quotes",
  invoices: "invoices",
  payments: "payments",
  products: "products",
  deliveryNotes: "delivery_notes",
};

function validateResourceBytes(resource, bytes, payload) {
  const descriptor = String(
    resource.mimeType || resource.format || resource.name || "",
  ).toLowerCase();
  const ascii = (start, end) => bytes.subarray(start, end).toString("ascii");
  let dimensions = null;
  if (/png/.test(descriptor)) {
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error(`CRM_RESOURCE_PNG_INVALID:${resource.id}`);
    dimensions = {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  } else if (/svg/.test(descriptor)) {
    if (!/<svg(?:\s|>)[\s\S]*<\/svg>\s*$/i.test(bytes.toString("utf8").trim()))
      throw new Error(`CRM_RESOURCE_SVG_INVALID:${resource.id}`);
  } else if (/woff2/.test(descriptor) && ascii(0, 4) !== "wOF2")
    throw new Error(`CRM_RESOURCE_FONT_INVALID:${resource.id}`);
  else if (/woff/.test(descriptor) && ascii(0, 4) !== "wOFF")
    throw new Error(`CRM_RESOURCE_FONT_INVALID:${resource.id}`);
  else if (/otf/.test(descriptor) && ascii(0, 4) !== "OTTO")
    throw new Error(`CRM_RESOURCE_FONT_INVALID:${resource.id}`);
  else if (
    /ttf/.test(descriptor) &&
    !bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]))
  )
    throw new Error(`CRM_RESOURCE_FONT_INVALID:${resource.id}`);
  if (
    resource.role === "preview" &&
    dimensions &&
    Math.max(dimensions.width, dimensions.height) < 1200
  )
    throw new Error(`CRM_RESOURCE_PREVIEW_TOO_SMALL:${resource.id}`);
  if (resource.role === "production" && dimensions) {
    const production = payload.items?.[0]?.snapshot?.production;
    const widthMm = Number(production?.dimensions?.width || 210);
    const heightMm = Number(production?.dimensions?.height || 90);
    const dpi = Number(production?.resolutionDpi || 300);
    if (
      dimensions.width !== Math.round((widthMm / 25.4) * dpi) ||
      dimensions.height !== Math.round((heightMm / 25.4) * dpi)
    )
      throw new Error(`CRM_RESOURCE_PRINT_DIMENSIONS_INVALID:${resource.id}`);
  }
  return dimensions;
}

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

  async ingestEventResources(event) {
    const resources = Array.isArray(event?.payload?.resources)
      ? event.payload.resources
      : [];
    if (!resources.length) return event;
    const bucket = await this.client.storage.getBucket(
      "crm-production-private",
    );
    if (bucket.error) {
      const created = await this.client.storage.createBucket(
        "crm-production-private",
        { public: false, fileSizeLimit: 52428800 },
      );
      if (created.error && !/already exists/i.test(created.error.message))
        throw new Error("CRM_PRODUCTION_BUCKET_UNAVAILABLE");
    }
    const orderId = String(event.payload.id || event.aggregateId || event.id);
    const durable = [];
    for (const resource of resources) {
      if (!resource?.signedUrl || !resource?.id)
        throw new Error(
          `CRM_RESOURCE_REFERENCE_INVALID:${resource?.id || "unknown"}`,
        );
      const response = await fetch(resource.signedUrl);
      if (!response.ok)
        throw new Error(`CRM_RESOURCE_DOWNLOAD_FAILED:${resource.id}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error(`CRM_RESOURCE_EMPTY:${resource.id}`);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (resource.checksum && checksum !== resource.checksum)
        throw new Error(`CRM_RESOURCE_CHECKSUM_MISMATCH:${resource.id}`);
      const dimensions = validateResourceBytes(resource, bytes, event.payload);
      const safeName = String(resource.name || resource.id).replace(
        /[^a-zA-Z0-9._-]+/g,
        "-",
      );
      const path = `orders/${orderId}/${resource.id}-${safeName}`;
      const upload = await this.client.storage
        .from("crm-production-private")
        .upload(path, bytes, {
          contentType: resource.mimeType || "application/octet-stream",
          upsert: true,
        });
      if (upload.error)
        throw new Error(`CRM_RESOURCE_COPY_FAILED:${resource.id}`);
      const signed = await this.client.storage
        .from("crm-production-private")
        .createSignedUrl(path, 604800);
      if (signed.error || !signed.data?.signedUrl)
        throw new Error(`CRM_RESOURCE_SIGNING_FAILED:${resource.id}`);
      durable.push({
        ...resource,
        signedUrl: signed.data.signedUrl,
        bucket: "crm-production-private",
        storagePath: path,
        size: bytes.length,
        checksum,
        dimensions,
        binaryVerified: true,
        copiedAt: new Date().toISOString(),
      });
    }
    const byId = new Map(durable.map((resource) => [resource.id, resource]));
    const roles = new Set(durable.map((resource) => resource.role));
    const errors = [];
    if (!roles.has("preview")) errors.push("Preview_HD.png manquant");
    if (!roles.has("production")) errors.push("Impression_1_1.png manquant");
    if (durable.some((resource) => /demo\//i.test(JSON.stringify(resource))))
      errors.push("Ressource de demonstration interdite");
    return {
      ...event,
      payload: {
        ...event.payload,
        resources: durable,
        assets: (event.payload.assets || []).map(
          (resource) => byId.get(resource.id) || resource,
        ),
        fonts: (event.payload.fonts || []).map(
          (resource) => byId.get(resource.id) || resource,
        ),
        resourceValidation: { complete: errors.length === 0, errors },
      },
    };
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

  async restartEvent(event) {
    const { data, error } = await this.client
      .from("crm_integration_events")
      .update({
        event_type: event.type,
        event_version: event.version,
        occurred_at: event.occurredAt,
        payload: event.payload,
        status: "processing",
        result: null,
        error_code: null,
        processed_at: null,
      })
      .eq("id", event.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
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
