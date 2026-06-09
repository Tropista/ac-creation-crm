import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { getPermissions } from "../utils/permissions";
import { pageToPath } from "../utils/routes";

const TYPE_LABELS = {
  action: { label: "Action", icon: "AC", color: "#a855f7" },
  client: { label: "Client", icon: "CL", color: "#3b82f6" },
  quote: { label: "Devis", icon: "DE", color: "#ec4899" },
  invoice: { label: "Facture", icon: "FA", color: "#10b981" },
  product: { label: "Produit", icon: "PR", color: "#f59e0b" },
  supplier: { label: "Fournisseur", icon: "FO", color: "#8b5cf6" },
  file: { label: "Fichier", icon: "FI", color: "#0ea5e9" },
  note: { label: "Note", icon: "NO", color: "#64748b" },
  payment: { label: "Paiement", icon: "PA", color: "#22c55e" },
  lead: { label: "Lead", icon: "LE", color: "#f97316" },
  sav: { label: "SAV", icon: "SA", color: "#ef4444" },
};

const QUICK_ACTIONS = [
  {
    type: "action",
    id: "new-quote",
    label: "Nouveau devis",
    sub: "Créer un devis",
    page: "quotes",
    action: "newDocument",
    docType: "quote",
    keywords: "creer ajouter devis nouveau",
  },
  {
    type: "action",
    id: "new-invoice",
    label: "Nouvelle facture",
    sub: "Créer une facture",
    page: "invoices",
    action: "newDocument",
    docType: "invoice",
    keywords: "creer ajouter facture nouvelle",
  },
  {
    type: "action",
    id: "add-payment",
    label: "Ajouter un paiement",
    sub: "Ouvrir les factures et paiements",
    page: "invoices",
    action: "navigate",
    keywords: "paiement encaissement regler facture",
  },
  {
    type: "action",
    id: "today",
    label: "Vue Aujourd'hui",
    sub: "Relances, atelier, impayés, SAV",
    page: "today",
    action: "navigate",
    keywords: "aujourd'hui aujourd hui jour taches priorites",
  },
  {
    type: "action",
    id: "automations",
    label: "Automatisations et relances",
    sub: "Alertes intelligentes et relances email",
    page: "automations",
    action: "navigate",
    keywords: "alertes notifications relances automation automatisation",
  },
];

function joinParts(parts) {
  return parts.filter(Boolean).join(" · ");
}

function buildItems(data) {
  const items = [];
  const clients = data.clients || [];
  const clientById = new Map(clients.map((client) => [String(client.id), client]));

  for (const client of clients) {
    items.push({
      type: "client",
      id: client.id,
      label: client.name || client.company || client.email || "Client",
      sub: joinParts([client.email, client.phone, client.company]),
      page: "clients",
      localStorageKey: "crm_open_client_id",
    });
  }

  for (const quote of data.quotes || []) {
    const client = clientById.get(String(quote.clientId));
    items.push({
      type: "quote",
      id: quote.id,
      label: quote.number || "Devis",
      sub: joinParts([client?.name || "Client", quote.status, quote.totalTTC ? `${quote.totalTTC} €` : ""]),
      page: "quotes",
      docType: "quote",
    });
  }

  for (const invoice of data.invoices || []) {
    const client = clientById.get(String(invoice.clientId));
    items.push({
      type: "invoice",
      id: invoice.id,
      label: invoice.number || "Facture",
      sub: joinParts([client?.name || "Client", invoice.status, invoice.totalTTC ? `${invoice.totalTTC} €` : ""]),
      page: "invoices",
      docType: "invoice",
    });
  }

  for (const product of data.products || []) {
    if (product.archived) continue;
    items.push({
      type: "product",
      id: product.id,
      label: product.name || product.sku || "Produit",
      sub: joinParts([product.sku, product.category, product.supplier]),
      page: "products",
      localStorageKey: "crm_open_product_id",
    });
  }

  for (const supplier of data.suppliers || []) {
    items.push({
      type: "supplier",
      id: supplier.id,
      label: supplier.name || supplier.email || "Fournisseur",
      sub: joinParts([supplier.contact, supplier.email, supplier.phone]),
      page: "suppliers",
      localStorageKey: "crm_select_supplier_id",
    });
  }

  for (const file of data.clientFiles || []) {
    const client = clientById.get(String(file.clientId));
    items.push({
      type: "file",
      id: file.id,
      label: file.name || "Fichier client",
      sub: joinParts([client?.name || "Client", file.mimeType, file.source]),
      page: "clients",
      targetId: file.clientId,
      localStorageKey: "crm_open_client_id",
    });
  }

  for (const note of data.clientNotes || []) {
    const client = clientById.get(String(note.clientId));
    items.push({
      type: "note",
      id: note.id,
      label: note.title || String(note.content || note.text || "Note").slice(0, 90),
      sub: joinParts([client?.name || "Client", note.createdAt || note.date]),
      page: "clients",
      targetId: note.clientId,
      localStorageKey: "crm_open_client_id",
    });
  }

  for (const payment of data.payments || []) {
    const client = clientById.get(String(payment.clientId));
    items.push({
      type: "payment",
      id: payment.id,
      label: payment.invoiceNumber || "Paiement",
      sub: joinParts([client?.name, payment.amount ? `${Number(payment.amount).toLocaleString("fr-FR")} €` : "", payment.method]),
      page: "invoices",
    });
  }

  for (const lead of data.leads || []) {
    items.push({
      type: "lead",
      id: lead.id,
      label: lead.name || lead.company || lead.email || "Lead",
      sub: joinParts([lead.source, lead.status, lead.email]),
      page: "leads",
      localStorageKey: "crm_open_lead_id",
    });
  }

  for (const sav of data.afterSalesCases || []) {
    const client = clientById.get(String(sav.clientId));
    items.push({
      type: "sav",
      id: sav.id,
      label: sav.title || sav.reference || "SAV",
      sub: joinParts([client?.name, sav.status, sav.invoiceNumber]),
      page: "sav",
    });
  }

  return items;
}

export default function GlobalSearch({ isOpen, onClose, data, onOpenDoc, currentRole = "Admin" }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const allItems = useMemo(() => {
    const pages = new Set(getPermissions(currentRole).pages || []);
    return [
      ...QUICK_ACTIONS.filter((item) => pages.has(item.page || "dashboard")),
      ...buildItems(data).filter((item) => pages.has(item.page || "dashboard")),
    ];
  }, [data, currentRole]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 10);
    return allItems
      .filter((item) =>
        `${item.label} ${item.sub} ${TYPE_LABELS[item.type]?.label || ""}`
          .concat(" ", item.keywords || "")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
  }, [query, allItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleEsc(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    setCursor(0);
  }, [results]);

  function open(item) {
    if (item.type === "action") {
      navigate(pageToPath(item.page || "dashboard"));
      onClose();
      if (item.action === "newDocument") {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("crm:new-item", { cancelable: true }));
        }, 80);
      }
      return;
    }

    if (item.docType) {
      onOpenDoc?.({ id: item.id, type: item.docType });
      navigate(pageToPath(item.page));
      onClose();
      return;
    }

    if (item.localStorageKey) {
      localStorage.setItem(item.localStorageKey, item.targetId || item.id);
    }
    if (item.type === "client") {
      window.dispatchEvent(new CustomEvent("crm:openClient", { detail: { id: item.id } }));
    }
    navigate(pageToPath(item.page || "dashboard"));
    onClose();
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => Math.min(current + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && results[cursor]) open(results[cursor]);
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(640px, 92vw)", background: "var(--surface)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 18 }}>Rechercher</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Client, devis, facture, produit, fichier, note..."
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 15, color: "var(--text)", outline: "none" }}
          />
          <kbd style={{ fontSize: 11, color: "var(--muted)", padding: "2px 6px", background: "var(--surface-2)", borderRadius: 4, border: "1px solid var(--border)" }}>Echap</kbd>
        </div>

        <div data-testid="global-search-results" style={{ maxHeight: 390, overflowY: "auto" }}>
          {results.length === 0 ? (
            <p style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 13, margin: 0, textAlign: "center" }}>Aucun résultat.</p>
          ) : (
            results.map((item, index) => {
              const type = TYPE_LABELS[item.type] || TYPE_LABELS.client;
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  onClick={() => open(item)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    width: "100%", padding: "10px 16px", border: "none",
                    background: index === cursor ? "var(--table-hover)" : "transparent",
                    cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onMouseEnter={() => setCursor(index)}
                >
                  <span style={{ fontSize: 11, fontWeight: 900, color: type.color, width: 24 }}>{type.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sub}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: `${type.color}20`, color: type.color, fontWeight: 700, flexShrink: 0 }}>
                    {type.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 16, fontSize: 11, color: "var(--muted)" }}>
          <span>Haut/bas naviguer</span>
          <span>Entrée ouvrir</span>
          <span style={{ marginLeft: "auto" }}>Ctrl+K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
