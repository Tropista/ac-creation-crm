import express from "express";
import { verifyHmacRequest } from "./security.js";
import { validateAck, validateEventEnvelope } from "./validation.js";

function errorResponse(error) {
  return {
    error: {
      code: error.message || "CRM_INTEGRATION_ERROR",
      message: "La requête d'intégration CRM a été refusée.",
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

export function createIntegrationRouter({ service, repository, keys, ttlMs }) {
  const router = express.Router();

  router.use(async (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      void repository.logCall({
        ip: req.ip || req.socket?.remoteAddress || "unknown",
        method: req.method,
        path: req.originalUrl,
        event_id: req.body?.id || req.body?.eventId || null,
        duration_ms: Date.now() - startedAt,
        result: res.statusCode < 400 ? "success" : "error",
        error_code: res.locals.errorCode || null,
      });
    });
    try {
      const auth = verifyHmacRequest(
        {
          keyId: req.get("X-CRM-Key-Id"),
          timestamp: req.get("X-CRM-Timestamp"),
          nonce: req.get("X-CRM-Nonce"),
          signature: req.get("X-CRM-Signature"),
          rawBody: req.rawBody || "",
        },
        { keys, ttlMs },
      );
      const reserved = await repository.reserveNonce({
        ...auth,
        expiresAt: auth.timestamp + ttlMs,
      });
      if (!reserved) {
        throw Object.assign(new Error("CRM_AUTH_NONCE_REPLAYED"), {
          status: 409,
        });
      }
      next();
    } catch (error) {
      res.locals.errorCode = error.message;
      res.status(error.status || 500).json(errorResponse(error));
    }
  });

  router.get("/health", async (_req, res) => {
    try {
      res.json(await service.health());
    } catch (error) {
      res.locals.errorCode = error.message;
      res.status(503).json(errorResponse(error));
    }
  });

  router.get("/version", (_req, res) => res.json(service.version()));

  router.get("/status", async (_req, res) => {
    try {
      res.json(await service.status());
    } catch (error) {
      res.locals.errorCode = error.message;
      res.status(503).json(errorResponse(error));
    }
  });

  router.post("/events", async (req, res) => {
    try {
      const event = validateEventEnvelope(req.body);
      const result = await service.event(event);
      res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      res.locals.errorCode = error.message;
      res.status(error.status || 422).json(errorResponse(error));
    }
  });

  router.post("/ack", async (req, res) => {
    try {
      res.json(await service.ack(validateAck(req.body)));
    } catch (error) {
      res.locals.errorCode = error.message;
      res.status(error.status || 422).json(errorResponse(error));
    }
  });

  return router;
}
