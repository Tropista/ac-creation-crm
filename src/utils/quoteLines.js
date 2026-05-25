export function lineHasProductionDetails(line) {
  if (!line) return false;
  return Boolean(
    line.taille ||
      line.couleur ||
      line.emplacementMarquage ||
      line.technique
  );
}

export function formatLineProductionLabel(line) {
  if (!line) return "";
  const parts = [];
  if (line.taille) parts.push(`Taille : ${line.taille}`);
  if (line.couleur) parts.push(`Couleur : ${line.couleur}`);
  if (line.emplacementMarquage) parts.push(`Emplacement : ${line.emplacementMarquage}`);
  if (line.technique) parts.push(`Technique : ${line.technique}`);
  return parts.join(" · ");
}

export function formatLineDescriptionWithProduction(line) {
  const description = line?.description || "—";
  const details = formatLineProductionLabel(line);
  return details ? `${description} (${details})` : description;
}

export function summarizeQuoteProductionLines(lines = []) {
  return (lines || [])
    .filter(lineHasProductionDetails)
    .map((line) => {
      const label = formatLineProductionLabel(line);
      const prefix = line.description ? `${line.description} — ` : "";
      return `${prefix}${label}`;
    });
}
