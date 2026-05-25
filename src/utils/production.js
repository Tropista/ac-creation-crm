const PROCESS_PATTERNS = [
  { key: "laser", label: "Laser CO2", patterns: [/laser/i, /co2/i, /découpe/i, /gravure/i] },
  { key: "dtf", label: "DTF", patterns: [/dtf/i, /transfert/i, /mycolor/i] },
  { key: "uvdtf", label: "UV-DTF", patterns: [/uv-dtf/i, /uv dtf/i, /tristar/i] },
  { key: "print3d", label: "Impression 3D", patterns: [/impression 3d/i, /3d print/i, /\bpla\b/i, /\bpetg\b/i] },
  { key: "tshirt", label: "T-shirt", patterns: [/t-shirt/i, /tshirt/i, /textile/i, /flex/i, /vinyle/i] },
  { key: "other", label: "Autre", patterns: [] },
];

export const PROCESS_TYPES = PROCESS_PATTERNS.map(({ key, label }) => ({ key, label }));

export const QUOTE_PRIORITY_OPTIONS = [
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
  { value: "urgent", label: "Urgente" },
];

export const PRODUCTION_STATUSES = ["En production", "Prêt", "Livré"];

export const ATELIER_PIPELINE_STATUSES = [
  "Accepté",
  ...PRODUCTION_STATUSES,
];

export const QUOTE_STATUSES = [
  "Brouillon",
  "Envoyé",
  "Accepté",
  "Refusé",
  ...PRODUCTION_STATUSES,
];

const PIPELINE_STATUS_ORDER = Object.fromEntries(
  ATELIER_PIPELINE_STATUSES.map((status, index) => [status, index])
);

export function isProductionStatus(status) {
  return PRODUCTION_STATUSES.includes(String(status || "").trim());
}

export function isQuoteInProductionQueue(quote) {
  const status = String(quote?.status || "").trim();
  return status === "Accepté" || isProductionStatus(status);
}

export function isAtelierPipelineQuote(quote) {
  return ATELIER_PIPELINE_STATUSES.includes(String(quote?.status || "").trim());
}

export function getNextProductionStatus(status) {
  const normalized = String(status || "").trim();
  const index = ATELIER_PIPELINE_STATUSES.indexOf(normalized);
  if (index === -1 || index >= ATELIER_PIPELINE_STATUSES.length - 1) {
    return null;
  }
  return ATELIER_PIPELINE_STATUSES[index + 1];
}

export function advanceProductionStatus(status) {
  return getNextProductionStatus(status);
}

function compareAtelierQuotes(a, b) {
  const statusDiff =
    (PIPELINE_STATUS_ORDER[a?.status] ?? 99) -
    (PIPELINE_STATUS_ORDER[b?.status] ?? 99);
  if (statusDiff !== 0) return statusDiff;

  const dateA = Date.parse(String(a?.date || ""));
  const dateB = Date.parse(String(b?.date || ""));
  if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
    return dateB - dateA;
  }

  return String(a?.number || "").localeCompare(String(b?.number || ""));
}

export function inferProcessType(quote) {
  const haystack = [
    quote?.description,
    ...(quote?.lines || []).map(
      (line) =>
        `${line.description || ""} ${line.category || ""} ${line.sku || ""} ${line.technique || ""}`
    ),
  ]
    .join(" ")
    .toLowerCase();

  for (const entry of PROCESS_PATTERNS) {
    if (entry.key === "other") continue;
    if (entry.patterns.some((pattern) => pattern.test(haystack))) {
      return entry;
    }
  }

  return PROCESS_PATTERNS.find((entry) => entry.key === "other");
}

export function resolveProcessType(quote) {
  const explicit = String(quote?.processType || "").trim();
  if (explicit) {
    const match = PROCESS_PATTERNS.find((entry) => entry.key === explicit);
    if (match) return match;
  }

  return inferProcessType(quote);
}

export function getProductionQueue(quotes = []) {
  const queue = quotes.filter(isQuoteInProductionQueue);

  const byProcess = {};
  for (const entry of PROCESS_PATTERNS) {
    byProcess[entry.key] = { ...entry, items: [] };
  }

  for (const quote of queue) {
    const process = resolveProcessType(quote);
    byProcess[process.key].items.push(quote);
  }

  return {
    total: queue.length,
    byProcess: Object.values(byProcess).filter(
      (group) => group.items.length > 0 || group.key !== "other"
    ),
    items: queue,
  };
}

export function getAtelierBoard(quotes = []) {
  const pipeline = quotes.filter(isAtelierPipelineQuote);

  const byProcess = {};
  for (const entry of PROCESS_PATTERNS) {
    byProcess[entry.key] = { ...entry, items: [] };
  }

  for (const quote of pipeline) {
    const process = resolveProcessType(quote);
    byProcess[process.key].items.push(quote);
  }

  for (const group of Object.values(byProcess)) {
    group.items.sort(compareAtelierQuotes);
  }

  return {
    total: pipeline.length,
    byProcess: Object.values(byProcess),
    items: pipeline,
  };
}

export function getAtelierStatusBoard(quotes = []) {
  const pipeline = quotes.filter(isAtelierPipelineQuote);

  const byStatus = ATELIER_PIPELINE_STATUSES.map((status) => ({
    status,
    items: pipeline
      .filter((quote) => quote.status === status)
      .sort(compareAtelierQuotes),
  }));

  return {
    total: pipeline.length,
    byStatus,
    items: pipeline,
  };
}
