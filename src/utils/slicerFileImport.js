import { strFromU8, unzipSync } from "fflate";

const SLICER_EXTENSIONS = {
  "3mf": "3mf",
  gcode: "gcode",
  gc: "gcode",
};

const DEFAULT_FILAMENT_DENSITY = 1.24;

/**
 * @typedef {Object} SlicerFilamentUsage
 * @property {string} [name]
 * @property {string} [type]
 * @property {number} grams
 */

/**
 * @typedef {Object} SlicerImportResult
 * @property {boolean} success
 * @property {'3mf'|'gcode'|null} sourceType
 * @property {string} [projectName]
 * @property {number} [totalGrams]
 * @property {SlicerFilamentUsage[]} [filaments]
 * @property {number} [printTimeMinutes]
 * @property {number} [printTimeHours]
 * @property {boolean} partial
 * @property {string[]} warnings
 * @property {string} [error]
 */

function getExtension(fileName = "") {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

function decodeText(bytes) {
  try {
    return strFromU8(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function parseXmlAttributes(attrString = "") {
  const attrs = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parsePositiveNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function gramsFromLengthMeters(lengthM, diameterMm = 1.75, density = DEFAULT_FILAMENT_DENSITY) {
  if (!lengthM || lengthM <= 0) return null;
  const radiusM = (diameterMm / 2) * 0.001;
  const volumeCm3 = Math.PI * radiusM * radiusM * lengthM * 1_000_000;
  return volumeCm3 * density;
}

function parseDurationToMinutes(text = "") {
  if (!text) return null;

  const dayMatch = text.match(/(\d+)\s*d/i);
  const hourMatch = text.match(/(\d+)\s*h/i);
  const minuteMatch = text.match(/(\d+)\s*m(?!s)/i);
  const secondMatch = text.match(/(\d+)\s*s/i);

  const days = dayMatch ? Number(dayMatch[1]) : 0;
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number(secondMatch[1]) : 0;

  const total = days * 24 * 60 + hours * 60 + minutes + seconds / 60;
  return total > 0 ? total : null;
}

function projectNameFromPath(value = "") {
  const normalized = String(value).replace(/\\/g, "/").trim();
  if (!normalized) return "";
  const base = normalized.split("/").pop() || normalized;
  return base.replace(/\.(3mf|stl|step|obj|gcode|gc)$/i, "") || base;
}

function buildResult(base) {
  const warnings = [...(base.warnings || [])];
  const partial =
    Boolean(base.partial) ||
    !base.totalGrams ||
    !base.printTimeMinutes ||
    !base.projectName;

  return {
    success: true,
    sourceType: base.sourceType ?? null,
    projectName: base.projectName,
    totalGrams: base.totalGrams,
    filaments: base.filaments,
    printTimeMinutes: base.printTimeMinutes,
    printTimeHours:
      base.printTimeHours ??
      (base.printTimeMinutes != null ? base.printTimeMinutes / 60 : undefined),
    partial,
    warnings,
    error: undefined,
  };
}

function fail(message, partialResult = {}) {
  return {
    success: false,
    sourceType: partialResult.sourceType ?? null,
    projectName: partialResult.projectName,
    totalGrams: partialResult.totalGrams,
    filaments: partialResult.filaments,
    printTimeMinutes: partialResult.printTimeMinutes,
    printTimeHours: partialResult.printTimeHours,
    partial: Boolean(partialResult.partial),
    warnings: partialResult.warnings || [],
    error: message,
  };
}

function aggregateFilamentUsage(entries, { diameterMm, density, warnings }) {
  const filaments = [];
  for (const entry of entries) {
    let grams = parsePositiveNumber(entry.used_g ?? entry.usedG);
    const lengthM = parsePositiveNumber(entry.used_m ?? entry.usedM);

    if ((!grams || grams <= 0) && lengthM && lengthM > 0) {
      grams = gramsFromLengthMeters(lengthM, diameterMm, density);
      if (grams != null) {
        warnings.push("Poids filament estimé à partir de la longueur (used_m).");
      }
    }

    if (grams == null || grams <= 0) continue;

    filaments.push({
      name: entry.name || entry.id || entry.type || undefined,
      type: entry.type || undefined,
      grams,
    });
  }

  if (filaments.length === 0) return { filaments: [], totalGrams: null };

  const totalGrams = filaments.reduce((sum, item) => sum + item.grams, 0);

  if (filaments.length > 1) {
    warnings.push(
      `${filaments.length} filaments détectés — total ${totalGrams.toFixed(1)} g (somme de tous les filaments).`
    );
  }

  return { filaments, totalGrams };
}

function extractFilamentsFromSliceInfoXml(xml = "") {
  const entries = [];
  const tagRe = /<filament\b([^>]*)\/?>/gi;
  let match;
  while ((match = tagRe.exec(xml)) !== null) {
    entries.push(parseXmlAttributes(match[1]));
  }
  return entries;
}

function extractFilamentsFromModelSettings(text = "") {
  const entries = [];

  const arrayMatch = text.match(/"filament"\s*:\s*\[([\s\S]*?)\]/i);
  if (arrayMatch) {
    const block = arrayMatch[1];
    const objectRe = /\{[^{}]*\}/g;
    let match;
    while ((match = objectRe.exec(block)) !== null) {
      try {
        const parsed = JSON.parse(match[0].replace(/(\w+)\s*:/g, '"$1":'));
        entries.push(parsed);
      } catch {
        const attrs = parseXmlAttributes(match[0].replace(/[{}]/g, " "));
        if (Object.keys(attrs).length) entries.push(attrs);
      }
    }
  }

  const usedGRe = /"used_g"\s*:\s*([0-9.]+)/gi;
  const usedMRe = /"used_m"\s*:\s*([0-9.]+)/gi;
  if (entries.length === 0) {
    const grams = [];
    let gMatch;
    while ((gMatch = usedGRe.exec(text)) !== null) grams.push({ used_g: gMatch[1] });
    let mMatch;
    while ((mMatch = usedMRe.exec(text)) !== null) {
      const idx = grams.length;
      grams[idx] = { ...(grams[idx] || {}), used_m: mMatch[1] };
    }
    entries.push(...grams);
  }

  return entries;
}

function extractProjectNameFromModelSettings(text = "") {
  const nameMatch =
    text.match(/"name"\s*:\s*"([^"]+)"/i) ||
    text.match(/<metadata[^>]*name="Title"[^>]*>([^<]+)</i) ||
    text.match(/"plate_name"\s*:\s*"([^"]+)"/i);
  if (nameMatch?.[1]) return nameMatch[1].trim();

  const pathMatch =
    text.match(/"from"\s*:\s*"([^"]+)"/i) ||
    text.match(/"source_file"\s*:\s*"([^"]+)"/i) ||
    text.match(/"model_name"\s*:\s*"([^"]+)"/i);
  if (pathMatch?.[1]) return projectNameFromPath(pathMatch[1]);

  return "";
}

function extractPrintTimeFromSliceInfo(xml = "") {
  const timeMatch =
    xml.match(/<prediction[^>]*>([^<]+)<\/prediction>/i) ||
    xml.match(/prediction\s*=\s*"([^"]+)"/i) ||
    xml.match(/print_time\s*=\s*"([^"]+)"/i) ||
    xml.match(/<time[^>]*>([^<]+)</i);
  return timeMatch ? parseDurationToMinutes(timeMatch[1]) : null;
}

function findZipEntry(files, candidates) {
  const keys = Object.keys(files);
  for (const candidate of candidates) {
    const found = keys.find((key) => key.toLowerCase().endsWith(candidate.toLowerCase()));
    if (found) return found;
  }
  return null;
}

function parse3mfBuffer(bytes, fileName) {
  const warnings = [];
  let archive;

  try {
    archive = unzipSync(bytes);
  } catch {
    return fail("Fichier 3MF invalide ou corrompu (archive ZIP illisible).");
  }

  const sliceInfoKey = findZipEntry(archive, [
    "Metadata/slice_info.config",
    "slice_info.config",
  ]);
  const modelSettingsKey = findZipEntry(archive, [
    "Metadata/model_settings.config",
    "model_settings.config",
  ]);
  const projectSettingsKey = findZipEntry(archive, [
    "Metadata/project_settings.config",
    "project_settings.config",
  ]);

  const sliceInfoText = sliceInfoKey ? decodeText(archive[sliceInfoKey]) : "";
  const modelSettingsText = modelSettingsKey ? decodeText(archive[modelSettingsKey]) : "";
  const projectSettingsText = projectSettingsKey ? decodeText(archive[projectSettingsKey]) : "";

  if (!sliceInfoText && !modelSettingsText) {
    return fail(
      "Aucune donnée de tranche trouvée. Exportez un 3MF depuis Bambu Studio après avoir tranché la pièce (Fichier → Exporter → Exporter la plaque tranchée)."
    );
  }

  let projectName =
    extractProjectNameFromModelSettings(modelSettingsText) ||
    extractProjectNameFromModelSettings(projectSettingsText) ||
    projectNameFromPath(fileName);

  const diameterMatch =
    projectSettingsText.match(/"default_filament_diameter"\s*:\s*"([0-9.]+)"/i) ||
    projectSettingsText.match(/filament_diameter[^0-9]*([0-9.]+)/i) ||
    sliceInfoText.match(/filament_diameter[^0-9]*([0-9.]+)/i);
  const densityMatch =
    projectSettingsText.match(/"default_filament_density"\s*:\s*"([0-9.]+)"/i) ||
    projectSettingsText.match(/filament_density[^0-9]*([0-9.]+)/i) ||
    sliceInfoText.match(/filament_density[^0-9]*([0-9.]+)/i);

  const diameterMm = parsePositiveNumber(diameterMatch?.[1]) ?? 1.75;
  const density = parsePositiveNumber(densityMatch?.[1]) ?? DEFAULT_FILAMENT_DENSITY;

  const sliceFilaments = extractFilamentsFromSliceInfoXml(sliceInfoText);
  const modelFilaments = extractFilamentsFromModelSettings(modelSettingsText);
  const filamentEntries = sliceFilaments.length ? sliceFilaments : modelFilaments;

  const { filaments, totalGrams } = aggregateFilamentUsage(filamentEntries, {
    diameterMm,
    density,
    warnings,
  });

  let printTimeMinutes = extractPrintTimeFromSliceInfo(sliceInfoText);
  if (!printTimeMinutes) {
    const settingsTime =
      modelSettingsText.match(/"print_time"\s*:\s*"([^"]+)"/i) ||
      projectSettingsText.match(/"print_time"\s*:\s*"([^"]+)"/i);
    if (settingsTime?.[1]) printTimeMinutes = parseDurationToMinutes(settingsTime[1]);
  }

  if (!totalGrams) {
    warnings.push("Poids filament non trouvé dans le 3MF — renseignez les grammes manuellement.");
  }
  if (!printTimeMinutes) {
    warnings.push("Durée d'impression non trouvée dans le 3MF.");
  }

  if (!totalGrams && !printTimeMinutes && !projectName) {
    return fail("Impossible d'extraire des données utiles de ce fichier 3MF.", {
      sourceType: "3mf",
      warnings,
      partial: true,
    });
  }

  return buildResult({
    sourceType: "3mf",
    projectName,
    totalGrams: totalGrams ?? undefined,
    filaments,
    printTimeMinutes: printTimeMinutes ?? undefined,
    warnings,
    partial: !totalGrams || !printTimeMinutes,
  });
}

function parseFilamentLinesFromGcode(text = "") {
  const filaments = [];
  const warnings = [];

  const totalPatterns = [
    /;\s*total filament used\s*\[g\]\s*=\s*([0-9.,]+)/i,
    /;\s*total filament used\s*=\s*([0-9.,]+)\s*g/i,
    /;\s*total filament used\s*\[g\]\s*:\s*([0-9.,]+)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    const grams = parsePositiveNumber(match?.[1]);
    if (grams != null && grams > 0) {
      return { filaments: [{ grams }], totalGrams: grams, warnings };
    }
  }

  const indexedRe = /;\s*filament used\s*\[(\d+)\]\s*=\s*([0-9.,]+)\s*g/gi;
  let indexedMatch;
  while ((indexedMatch = indexedRe.exec(text)) !== null) {
    const grams = parsePositiveNumber(indexedMatch[2]);
    if (grams != null && grams > 0) {
      filaments.push({ name: `Filament ${indexedMatch[1]}`, grams });
    }
  }

  if (filaments.length === 0) {
    const perExtruderRe = /;\s*filament used\s*\[g\]\s*=\s*([0-9.,]+)/gi;
    let match;
    while ((match = perExtruderRe.exec(text)) !== null) {
      const grams = parsePositiveNumber(match[1]);
      if (grams != null && grams > 0) {
        filaments.push({ grams });
      }
    }
  }

  if (filaments.length === 0) {
    const lengthMmMatch = text.match(/;\s*filament used\s*\[mm\]\s*=\s*([0-9.,]+)/i);
    const lengthM = lengthMmMatch ? parsePositiveNumber(lengthMmMatch[1]) / 1000 : null;
    const diameterMatch = text.match(/;\s*filament_diameter\s*:\s*([0-9.,]+)/i);
    const densityMatch = text.match(/;\s*filament_density\s*:\s*([0-9.,]+)/i);
    const diameterMm = parsePositiveNumber(diameterMatch?.[1]) ?? 1.75;
    const density = parsePositiveNumber(densityMatch?.[1]) ?? DEFAULT_FILAMENT_DENSITY;
    const grams = lengthM ? gramsFromLengthMeters(lengthM, diameterMm, density) : null;
    if (grams != null && grams > 0) {
      warnings.push("Poids filament estimé à partir de la longueur (filament used [mm]).");
      filaments.push({ grams });
    }
  }

  if (filaments.length === 0) {
    return { filaments: [], totalGrams: null, warnings };
  }

  const totalGrams = filaments.reduce((sum, item) => sum + item.grams, 0);
  if (filaments.length > 1) {
    warnings.push(
      `${filaments.length} filaments détectés — total ${totalGrams.toFixed(1)} g (somme de tous les filaments).`
    );
  }

  return { filaments, totalGrams, warnings };
}

function parsePrintTimeFromGcode(text = "") {
  const patterns = [
    /;\s*estimated printing time \(normal mode\)\s*=\s*([0-9dhms\s]+)/i,
    /;\s*model printing time:\s*([0-9dhms\s]+)/i,
    /;\s*total estimated time:\s*([0-9dhms\s]+)/i,
    /;\s*estimated printing time\s*=\s*([0-9dhms\s]+)/i,
    /;\s*print time\s*=\s*([0-9dhms\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const minutes = parseDurationToMinutes(match?.[1]);
    if (minutes != null) return minutes;
  }

  return null;
}

function parseProjectNameFromGcode(text = "", fileName = "") {
  const patterns = [
    /;\s*model name\s*:\s*(.+)/i,
    /;\s*project name\s*:\s*(.+)/i,
    /;\s*title\s*:\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return projectNameFromPath(fileName);
}

function parseGcodeText(text, fileName) {
  const warnings = [];
  const { filaments, totalGrams, warnings: filamentWarnings } = parseFilamentLinesFromGcode(text);
  warnings.push(...filamentWarnings);

  const printTimeMinutes = parsePrintTimeFromGcode(text);
  const projectName = parseProjectNameFromGcode(text, fileName);

  if (!totalGrams) {
    warnings.push("Poids filament non trouvé dans le G-code — renseignez les grammes manuellement.");
  }
  if (!printTimeMinutes) {
    warnings.push("Durée d'impression non trouvée dans le G-code.");
  }

  if (!totalGrams && !printTimeMinutes) {
    return fail(
      "Impossible d'extraire filament ou durée de ce G-code. Préférez un export 3MF tranché ou un G-code Bambu/Orca récent.",
      { sourceType: "gcode", projectName, warnings, partial: true }
    );
  }

  return buildResult({
    sourceType: "gcode",
    projectName,
    totalGrams: totalGrams ?? undefined,
    filaments,
    printTimeMinutes: printTimeMinutes ?? undefined,
    warnings,
    partial: !totalGrams || !printTimeMinutes,
  });
}

function parseGcodeBuffer(bytes, fileName) {
  const text = decodeText(bytes);
  if (!text.trim()) {
    return fail("Fichier G-code vide ou illisible.");
  }
  return parseGcodeText(text, fileName);
}

/**
 * Parse un fichier slicer (3MF ou G-code) depuis un buffer.
 * @param {Uint8Array|ArrayBuffer} buffer
 * @param {string} fileName
 * @returns {SlicerImportResult}
 */
export function parseSlicerBuffer(buffer, fileName = "") {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const ext = SLICER_EXTENSIONS[getExtension(fileName)];

  if (!ext) {
    return fail("Format non pris en charge. Utilisez un fichier .3mf, .gcode ou .gc.");
  }

  if (ext === "3mf") {
    return parse3mfBuffer(bytes, fileName);
  }

  return parseGcodeBuffer(bytes, fileName);
}

/**
 * Parse un objet File (navigateur).
 * @param {File} file
 * @returns {Promise<SlicerImportResult>}
 */
export async function parseSlicerFile(file) {
  if (!file) {
    return fail("Aucun fichier sélectionné.");
  }

  try {
    const buffer = await file.arrayBuffer();
    return parseSlicerBuffer(new Uint8Array(buffer), file.name || "");
  } catch {
    return fail("Lecture du fichier impossible.");
  }
}

/**
 * Applique le résultat d'import au formulaire calcul (retourne patch + messages).
 * @param {SlicerImportResult} result
 * @returns {{ patch: Record<string, unknown>, toastMessage: string, toastType: 'success'|'warning'|'error' }}
 */
export function buildCalcFormPatchFromImport(result) {
  if (!result.success) {
    return {
      patch: {},
      toastMessage: result.error || "Import impossible.",
      toastType: "error",
    };
  }

  const patch = {};
  if (result.projectName) patch.projectName = result.projectName;
  if (result.totalGrams != null) patch.grams = Number(result.totalGrams.toFixed(1));
  if (result.printTimeHours != null) patch.hours = Number(result.printTimeHours.toFixed(2));

  const found = [
    result.projectName ? "nom" : null,
    result.totalGrams != null ? `${result.totalGrams.toFixed(1)} g` : null,
    result.printTimeHours != null ? `${result.printTimeHours.toFixed(2)} h` : null,
  ].filter(Boolean);

  let toastMessage = found.length
    ? `Import réussi — ${found.join(", ")}.`
    : "Import partiel — vérifiez les champs.";

  if (result.warnings?.length) {
    toastMessage += ` ${result.warnings[0]}`;
  }

  return {
    patch,
    toastMessage,
    toastType: result.partial ? "warning" : "success",
  };
}

export {
  parseDurationToMinutes,
  gramsFromLengthMeters,
  parseGcodeText,
  parse3mfBuffer,
  projectNameFromPath,
};
