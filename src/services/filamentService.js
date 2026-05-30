import { getSupabase, isSupabaseConfigured } from "../supabase";

export const MOVEMENT_TYPES = {
  ADD: "add",
  USE: "use",
  CORRECTION: "correction",
};

export const STOCK_LEVEL = {
  OK: "ok",
  LOW: "low",
  CRITICAL: "critical",
};

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Poids net de filament utilisable (g) à l'achat.
 * `spoolWeightFullG` = filament neuf seul, sans la bobine vide (ex. 1000 g sur l'étiquette).
 * `spoolWeightEmptyG` sert uniquement à la pesée sur balance (bobine vide), pas soustrait ici.
 *
 * Ancienne formule (v1) : full − empty — incorrecte si full était déjà le net filament.
 */
export function calcUsableWeightG(filament = {}) {
  return Math.max(0, n(filament.spoolWeightFullG));
}

export function calcPricePerGram(filament = {}) {
  const usable = calcUsableWeightG(filament);
  if (usable <= 0) return 0;
  return n(filament.purchasePrice) / usable;
}

/**
 * Détecte les bobines enregistrées avec l'ancienne formule (full − empty).
 * Signal : price_per_gram stocké = prix / (full − empty) alors que le nouveau calcul diffère.
 */
export function isLegacyFilamentWeightCalc(filament = {}) {
  const full = n(filament.spoolWeightFullG);
  const empty = n(filament.spoolWeightEmptyG);
  const purchase = n(filament.purchasePrice);
  const storedPrice = n(filament.pricePerGram);

  if (empty <= 0 || full <= empty || purchase <= 0 || storedPrice <= 0) return false;

  const legacyUsable = full - empty;
  const legacyPrice = purchase / legacyUsable;
  const newPrice = purchase / full;

  return (
    Math.abs(storedPrice - legacyPrice) < 0.00001 &&
    Math.abs(storedPrice - newPrice) > 0.00001
  );
}

/**
 * Corrige le reste si l'ancienne formule avait soustrait la bobine vide du net filament :
 * reste réel = reste_enregistré + poids_bobine_vide (plafonné au net d'achat).
 */
export function migrateLegacyFilamentWeights(filament = {}) {
  if (!isLegacyFilamentWeightCalc(filament)) return filament;

  const full = n(filament.spoolWeightFullG);
  const empty = n(filament.spoolWeightEmptyG);
  const remaining = n(filament.remainingWeightG);

  return {
    ...filament,
    remainingWeightG: Math.min(full, remaining + empty),
  };
}

export function enrichFilament(filament = {}) {
  const migrated = migrateLegacyFilamentWeights(filament);
  const usableWeightG = calcUsableWeightG(migrated);
  const pricePerGram = calcPricePerGram(migrated);
  const remainingWeightG = n(migrated.remainingWeightG);
  const remainingPercent =
    usableWeightG > 0 ? Math.min(100, Math.max(0, (remainingWeightG / usableWeightG) * 100)) : 0;
  const remainingValue = remainingWeightG * pricePerGram;

  return {
    ...migrated,
    usableWeightG,
    pricePerGram,
    remainingWeightG,
    remainingPercent,
    remainingValue,
    stockLevel: getStockLevel({ ...migrated, remainingWeightG, alertThresholdG: migrated.alertThresholdG }),
  };
}

export function getStockLevel(filament = {}) {
  const remaining = n(filament.remainingWeightG);
  const threshold = n(filament.alertThresholdG) || 100;

  if (remaining <= 0) return STOCK_LEVEL.CRITICAL;
  if (remaining <= threshold) return STOCK_LEVEL.LOW;
  return STOCK_LEVEL.OK;
}

export function calcPrintQuote({
  filament,
  grams = 0,
  hours = 0,
  electricityPricePerKwh = 0.2,
  powerKw = 0.2,
  marginCoef = 2,
  machineFee = 0,
  laborHours = 0,
  laborRate = 25,
  vatRate = 17,
} = {}) {
  const enriched = enrichFilament(filament || {});
  const weightG = Math.max(0, n(grams));
  const printHours = Math.max(0, n(hours));
  const filamentCost = weightG * enriched.pricePerGram;
  const electricityCost = n(powerKw) * printHours * n(electricityPricePerKwh);
  const laborCost = n(laborHours) * n(laborRate);
  const productionCost = filamentCost + electricityCost + n(machineFee) + laborCost;
  const totalHT = productionCost * Math.max(0, n(marginCoef));
  const vatAmount = totalHT * (n(vatRate) / 100);
  const totalTTC = totalHT + vatAmount;

  return {
    filamentCost,
    electricityCost,
    laborCost,
    machineFee: n(machineFee),
    productionCost,
    totalHT,
    vatAmount,
    totalTTC,
    pricePerGram: enriched.pricePerGram,
  };
}

export function getFilaments(data = {}) {
  return (data.filaments || []).map(enrichFilament);
}

export function getFilamentById(data = {}, filamentId) {
  const filament = (data.filaments || []).find((entry) => String(entry.id) === String(filamentId));
  return filament ? enrichFilament(filament) : null;
}

export function getFilamentMovements(data = {}, { filamentId = "", limit = 0 } = {}) {
  let movements = [...(data.filamentMovements || [])];
  if (filamentId) {
    movements = movements.filter((entry) => String(entry.filamentId) === String(filamentId));
  }
  movements.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  if (limit > 0) {
    movements = movements.slice(0, limit);
  }
  return movements;
}

function normalizeFilamentInput(payload = {}, existing = null) {
  const spoolWeightFullG = n(payload.spoolWeightFullG ?? existing?.spoolWeightFullG ?? 1000);
  const spoolWeightEmptyG = n(payload.spoolWeightEmptyG ?? existing?.spoolWeightEmptyG ?? 0);
  const purchasePrice = n(payload.purchasePrice ?? existing?.purchasePrice ?? 0);
  const draft = {
    name: String(payload.name ?? existing?.name ?? "").trim(),
    brand: String(payload.brand ?? existing?.brand ?? "").trim(),
    material: String(payload.material ?? existing?.material ?? "PLA").trim(),
    color: String(payload.color ?? existing?.color ?? "").trim(),
    diameter: n(payload.diameter ?? existing?.diameter ?? 1.75),
    spoolWeightFullG,
    spoolWeightEmptyG,
    remainingWeightG:
      payload.remainingWeightG != null
        ? n(payload.remainingWeightG)
        : existing?.remainingWeightG != null
          ? n(existing.remainingWeightG)
          : Math.max(0, spoolWeightFullG),
    purchasePrice,
    supplier: String(payload.supplier ?? existing?.supplier ?? "").trim(),
    storageLocation: String(payload.storageLocation ?? existing?.storageLocation ?? "").trim(),
    alertThresholdG: n(payload.alertThresholdG ?? existing?.alertThresholdG ?? 100),
    notes: String(payload.notes ?? existing?.notes ?? "").trim(),
  };

  const pricePerGram = calcPricePerGram({ ...draft, purchasePrice });
  return enrichFilament({
    ...(existing || {}),
    ...draft,
    pricePerGram,
    updatedAt: nowIso(),
  });
}

export function createFilament(data = {}, payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("Le nom de la bobine est obligatoire.");
  }

  const filament = normalizeFilamentInput(payload, {
    id: uid(),
    createdAt: nowIso(),
  });

  return {
    ...data,
    filaments: [...(data.filaments || []), filament],
  };
}

export function updateFilament(data = {}, filamentId, payload = {}) {
  const filaments = data.filaments || [];
  const index = filaments.findIndex((entry) => String(entry.id) === String(filamentId));
  if (index < 0) {
    throw new Error("Bobine introuvable.");
  }

  const updated = normalizeFilamentInput(payload, filaments[index]);
  const nextFilaments = [...filaments];
  nextFilaments[index] = { ...filaments[index], ...updated, id: filaments[index].id };

  return { ...data, filaments: nextFilaments };
}

export function deleteFilament(data = {}, filamentId) {
  return {
    ...data,
    filaments: (data.filaments || []).filter((entry) => String(entry.id) !== String(filamentId)),
  };
}

export function createFilamentMovement(data = {}, movement = {}) {
  const filament = getFilamentById(data, movement.filamentId);
  if (!filament) {
    throw new Error("Bobine introuvable pour le mouvement.");
  }

  const type = movement.type || MOVEMENT_TYPES.CORRECTION;
  const quantityG = Math.abs(n(movement.quantityG));
  if (quantityG <= 0) {
    throw new Error("La quantité du mouvement doit être supérieure à 0.");
  }

  let nextRemaining = n(filament.remainingWeightG);
  if (type === MOVEMENT_TYPES.ADD) {
    nextRemaining += quantityG;
  } else if (type === MOVEMENT_TYPES.USE) {
    if (quantityG > nextRemaining) {
      throw new Error(
        `Stock insuffisant : ${quantityG.toFixed(1)} g demandés, ${nextRemaining.toFixed(1)} g disponibles.`
      );
    }
    nextRemaining -= quantityG;
  } else {
    nextRemaining = quantityG;
  }

  const materialCost =
    movement.materialCost != null
      ? n(movement.materialCost)
      : type === MOVEMENT_TYPES.USE
        ? quantityG * filament.pricePerGram
        : 0;

  const entry = {
    id: movement.id || uid(),
    filamentId: filament.id,
    type,
    quantityG,
    reason: String(movement.reason || "").trim(),
    printJobName: String(movement.printJobName || "").trim(),
    relatedDocumentId: String(movement.relatedDocumentId || "").trim(),
    materialCost,
    stockAfterG: nextRemaining,
    createdAt: movement.createdAt || nowIso(),
  };

  const nextData = updateFilament(data, filament.id, { remainingWeightG: nextRemaining });

  return {
    ...nextData,
    filamentMovements: [entry, ...(nextData.filamentMovements || data.filamentMovements || [])],
    movement: entry,
    filament: getFilamentById(
      { ...nextData, filamentMovements: [entry, ...(data.filamentMovements || [])] },
      filament.id
    ),
  };
}

export function applyFilamentForPrint(
  data = {},
  { filamentId, grams, projectName = "", reason = "", relatedDocumentId = "" } = {}
) {
  const weightG = n(grams);
  if (!filamentId) {
    throw new Error("Sélectionnez une bobine.");
  }
  if (weightG <= 0) {
    throw new Error("Indiquez un poids consommé supérieur à 0 g.");
  }

  const filament = getFilamentById(data, filamentId);
  if (!filament) {
    throw new Error("Bobine introuvable.");
  }
  if (weightG > filament.remainingWeightG) {
    throw new Error(
      `Stock insuffisant pour « ${filament.name} » : ${weightG.toFixed(1)} g demandés, ${filament.remainingWeightG.toFixed(1)} g restants.`
    );
  }

  const result = createFilamentMovement(data, {
    filamentId,
    type: MOVEMENT_TYPES.USE,
    quantityG: weightG,
    printJobName: String(projectName || "").trim(),
    reason: reason || "Impression validée",
    relatedDocumentId,
    materialCost: weightG * filament.pricePerGram,
  });

  const belowThreshold = result.filament.remainingWeightG <= n(result.filament.alertThresholdG);

  return {
    ...result,
    belowThreshold,
    thresholdMessage: belowThreshold
      ? `Alerte stock : « ${result.filament.name} » sous le seuil (${result.filament.remainingWeightG.toFixed(0)} g restants).`
      : "",
  };
}

/** Alias conservé pour compatibilité (ne pas appeler depuis un composant React — préfixe « use »). */
export const useFilamentForPrint = applyFilamentForPrint;

export function filamentToDbRow(filament = {}) {
  return {
    id: filament.id,
    name: filament.name,
    brand: filament.brand || null,
    material: filament.material || null,
    color: filament.color || null,
    diameter: n(filament.diameter) || 1.75,
    spool_weight_full_g: n(filament.spoolWeightFullG),
    spool_weight_empty_g: n(filament.spoolWeightEmptyG),
    remaining_weight_g: n(filament.remainingWeightG),
    purchase_price: n(filament.purchasePrice),
    price_per_gram: n(filament.pricePerGram),
    supplier: filament.supplier || null,
    storage_location: filament.storageLocation || null,
    alert_threshold_g: n(filament.alertThresholdG) || 100,
    notes: filament.notes || null,
    created_at: filament.createdAt || nowIso(),
    updated_at: filament.updatedAt || nowIso(),
  };
}

export function dbRowToFilament(row = {}) {
  return enrichFilament({
    id: row.id,
    name: row.name || "",
    brand: row.brand || "",
    material: row.material || "",
    color: row.color || "",
    diameter: n(row.diameter) || 1.75,
    spoolWeightFullG: n(row.spool_weight_full_g),
    spoolWeightEmptyG: n(row.spool_weight_empty_g),
    remainingWeightG: n(row.remaining_weight_g),
    purchasePrice: n(row.purchase_price),
    pricePerGram: n(row.price_per_gram),
    supplier: row.supplier || "",
    storageLocation: row.storage_location || "",
    alertThresholdG: n(row.alert_threshold_g) || 100,
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function movementToDbRow(movement = {}) {
  return {
    id: movement.id,
    filament_id: movement.filamentId,
    type: movement.type,
    quantity_g: n(movement.quantityG),
    reason: movement.reason || null,
    print_job_name: movement.printJobName || null,
    related_document_id: movement.relatedDocumentId || null,
    material_cost: movement.materialCost != null ? n(movement.materialCost) : null,
    stock_after_g: movement.stockAfterG != null ? n(movement.stockAfterG) : null,
    created_at: movement.createdAt || nowIso(),
  };
}

export function dbRowToMovement(row = {}) {
  return {
    id: row.id,
    filamentId: row.filament_id,
    type: row.type,
    quantityG: n(row.quantity_g),
    reason: row.reason || "",
    printJobName: row.print_job_name || "",
    relatedDocumentId: row.related_document_id || "",
    materialCost: row.material_cost != null ? n(row.material_cost) : 0,
    stockAfterG: row.stock_after_g != null ? n(row.stock_after_g) : 0,
    createdAt: row.created_at,
  };
}

export async function pushFilamentChangesToSupabase({ filaments = [], movements = [] } = {}) {
  if (!isSupabaseConfigured) return { ok: true, storage: "local" };

  try {
    const supabase = await getSupabase();
    if (filaments.length) {
      const { error } = await supabase
        .from("filaments")
        .upsert(filaments.map(filamentToDbRow), { onConflict: "id" });
      if (error) throw error;
    }
    if (movements.length) {
      const { error } = await supabase
        .from("filament_movements")
        .upsert(movements.map(movementToDbRow), { onConflict: "id" });
      if (error) throw error;
    }
    return { ok: true, storage: "supabase" };
  } catch (error) {
    console.warn("[filamentService] Sync Supabase échouée — données locales conservées.", error);
    return { ok: false, storage: "local", error };
  }
}

export async function loadFilamentsFromSupabase() {
  if (!isSupabaseConfigured) return { filaments: [], movements: [] };

  try {
    const supabase = await getSupabase();
    const [filamentsRes, movementsRes] = await Promise.all([
      supabase.from("filaments").select("*").order("created_at", { ascending: true }),
      supabase
        .from("filament_movements")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (filamentsRes.error?.code === "PGRST205" || filamentsRes.error?.code === "42P01") {
      return { filaments: [], movements: [] };
    }
    if (filamentsRes.error) throw filamentsRes.error;

    const movements =
      movementsRes.error && (movementsRes.error.code === "PGRST205" || movementsRes.error.code === "42P01")
        ? []
        : (movementsRes.data || []).map(dbRowToMovement);

    return {
      filaments: (filamentsRes.data || []).map(dbRowToFilament),
      movements,
    };
  } catch (error) {
    console.warn("[filamentService] Chargement Supabase impossible.", error);
    return { filaments: [], movements: [] };
  }
}
