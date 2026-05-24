/** Remove supplier source URL lines from catalog item descriptions. */
export function stripSourceFromDescription(text = "") {
  if (!text) return "";

  const cleaned = String(text)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^source\s*:\s*https?:\/\//i.test(trimmed)) return false;
      if (/^https?:\/\/[^\s]*lamaisonduteeshirt\.com/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}
