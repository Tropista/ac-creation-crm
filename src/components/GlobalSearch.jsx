import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { pageToPath } from "../utils/routes";

const TYPE_LABELS = {
  client:  { label: "Client",  icon: "👤", color: "#3b82f6" },
  quote:   { label: "Devis",   icon: "📋", color: "#ec4899" },
  invoice: { label: "Facture", icon: "💶", color: "#10b981" },
};

function buildItems(data) {
  const items = [];
  for (const c of (data.clients || [])) {
    items.push({ type: "client", id: c.id, label: c.name || c.company || c.email || "—", sub: c.email || "" });
  }
  for (const q of (data.quotes || [])) {
    const client = (data.clients || []).find((c) => c.id === q.clientId);
    items.push({ type: "quote", id: q.id, label: q.number || "—", sub: `${client?.name || "?"} · ${q.status || ""}` });
  }
  for (const inv of (data.invoices || [])) {
    const client = (data.clients || []).find((c) => c.id === inv.clientId);
    items.push({ type: "invoice", id: inv.id, label: inv.number || "—", sub: `${client?.name || "?"} · ${inv.status || ""}` });
  }
  return items;
}

export default function GlobalSearch({ isOpen, onClose, data, onOpenDoc }) {
  const [query, setQuery]     = useState("");
  const [cursor, setCursor]   = useState(0);
  const inputRef              = useRef(null);
  const navigate              = useNavigate();

  const allItems = useMemo(() => buildItems(data), [data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 8);
    return allItems.filter((item) =>
      item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [query, allItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => { setCursor(0); }, [results]);

  function open(item) {
    if (item.type === "quote") {
      onOpenDoc?.({ id: item.id, type: "quote" });
      navigate(pageToPath("quotes"));
    } else if (item.type === "invoice") {
      onOpenDoc?.({ id: item.id, type: "invoice" });
      navigate(pageToPath("invoices"));
    } else {
      localStorage.setItem("crm_open_client_id", item.id);
      window.dispatchEvent(new CustomEvent("crm:openClient", { detail: { id: item.id } }));
      navigate(pageToPath("clients"));
      onClose();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && results[cursor]) open(results[cursor]);
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(600px, 92vw)", background: "var(--surface)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}
      >
        {/* Input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Rechercher un client, devis, facture…"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 15, color: "var(--text)", outline: "none" }}
          />
          <kbd style={{ fontSize: 11, color: "var(--muted)", padding: "2px 6px", background: "var(--surface-2)", borderRadius: 4, border: "1px solid var(--border)" }}>Échap</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {results.length === 0 ? (
            <p style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 13, margin: 0, textAlign: "center" }}>Aucun résultat.</p>
          ) : (
            results.map((item, i) => {
              const t = TYPE_LABELS[item.type];
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => open(item)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", padding: "10px 16px", border: "none",
                    background: i === cursor ? "var(--table-hover)" : "transparent",
                    cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: t.color + "20", color: t.color, fontWeight: 600, flexShrink: 0 }}>
                    {t.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 11, color: "var(--muted)" }}>
          <span>↑↓ naviguer</span>
          <span>↵ ouvrir</span>
          <span style={{ marginLeft: "auto" }}>Ctrl+K pour fermer</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
