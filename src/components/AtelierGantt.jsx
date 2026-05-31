import { useState, useMemo } from "react";
import { parseDocumentDate } from "../utils/invoices";
import { resolveProcessType } from "../utils/production";
import { clientName } from "../utils/documents";

const DAYS_SHOWN = 14;

const PROCESS_COLORS = {
  laser:   { bg: "#fde68a", border: "#f59e0b", text: "#92400e" },
  dtf:     { bg: "#fbcfe8", border: "#ec4899", text: "#9d174d" },
  uvdtf:   { bg: "#e9d5ff", border: "#a855f7", text: "#6b21a8" },
  print3d: { bg: "#99f6e4", border: "#14b8a6", text: "#134e4a" },
  tshirt:  { bg: "#fed7aa", border: "#f97316", text: "#7c2d12" },
  other:   { bg: "#e2e8f0", border: "#94a3b8", text: "#334155" },
};

const STATUS_DOT = {
  "Accepté":       "#3b82f6",
  "En production": "#f97316",
  "Prêt":          "#22c55e",
  "Livré":         "#94a3b8",
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function parseQuoteDate(quote) {
  // Use acceptedAt first, fall back to quote date
  if (quote.acceptedAt) {
    const d = new Date(quote.acceptedAt);
    if (!isNaN(d.getTime())) return startOfDay(d);
  }
  const d = parseDocumentDate(quote.date);
  return d ? startOfDay(d) : null;
}

function parseDeliveryDate(quote) {
  if (!quote.promisedDeliveryDate) return null;
  const d = parseDocumentDate(quote.promisedDeliveryDate);
  return d ? startOfDay(d) : null;
}

export default function AtelierGantt({ quotes = [], data = {}, onQuoteClick }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const windowStart = useMemo(() => {
    const today = startOfDay(new Date());
    return addDays(today, weekOffset * 7);
  }, [weekOffset]);

  const windowEnd = addDays(windowStart, DAYS_SHOWN);

  // Header days
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(windowStart, i));

  // Active quotes with computed positions
  const rows = useMemo(() => {
    const pipeline = quotes.filter((q) =>
      ["Accepté", "En production", "Prêt"].includes(q.status)
    );

    return pipeline
      .map((q) => {
        const start = parseQuoteDate(q);
        const end   = parseDeliveryDate(q);
        if (!start) return null;

        const startOffset = daysBetween(windowStart, start);
        const endOffset   = end ? daysBetween(windowStart, end) : startOffset + 3;

        // Clamp to window
        const clampedStart = Math.max(0, Math.min(DAYS_SHOWN, startOffset));
        const clampedEnd   = Math.max(clampedStart + 1, Math.min(DAYS_SHOWN, endOffset + 1));

        const left  = (clampedStart / DAYS_SHOWN) * 100;
        const width = ((clampedEnd - clampedStart) / DAYS_SHOWN) * 100;
        const isVisible = clampedStart < DAYS_SHOWN && clampedEnd > 0;

        const process = resolveProcessType(q)?.key || "other";
        const colors  = PROCESS_COLORS[process] || PROCESS_COLORS.other;
        const client  = clientName(data, q.clientId);

        return { q, left, width, isVisible, colors, client, process, startOffset, endOffset };
      })
      .filter(Boolean)
      .sort((a, b) => a.startOffset - b.startOffset);
  }, [quotes, windowStart, data]);

  const today = startOfDay(new Date());
  const todayOffset = daysBetween(windowStart, today);
  const todayVisible = todayOffset >= 0 && todayOffset < DAYS_SHOWN;

  const windowLabel = `${windowStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${addDays(windowEnd, -1).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Gantt atelier</h3>
          <span style={{ fontSize: 12, color: "var(--text-muted, #6b7280)" }}>{windowLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ghost" onClick={() => setWeekOffset((v) => v - 1)}>←</button>
          <button type="button" className="ghost" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Aujourd'hui</button>
          <button type="button" className="ghost" onClick={() => setWeekOffset((v) => v + 1)}>→</button>
        </div>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <div style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-muted, #6b7280)", fontWeight: 600, background: "var(--surface, #f8fafc)" }}>
          Commande
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${DAYS_SHOWN}, 1fr)` }}>
          {days.map((day) => {
            const isToday = daysBetween(today, day) === 0;
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div key={day.toISOString()} style={{
                padding: "6px 2px",
                fontSize: 10,
                textAlign: "center",
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "#ec4899" : isWeekend ? "var(--text-muted, #9ca3af)" : "var(--text, #374151)",
                background: isWeekend ? "var(--surface, #f8fafc)" : "transparent",
                borderLeft: "1px solid var(--border, #f1f5f9)",
              }}>
                {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                <br />
                {day.getDate()}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gantt rows */}
      <div style={{ overflowY: "auto", maxHeight: 480 }}>
        {rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted, #6b7280)", fontSize: 14 }}>
            Aucune commande en cours sur cette période.
          </div>
        ) : (
          rows.map(({ q, left, width, isVisible, colors, client }) => (
            <div
              key={q.id}
              style={{ display: "grid", gridTemplateColumns: "180px 1fr", borderBottom: "1px solid var(--border, #f1f5f9)", minHeight: 38 }}
            >
              {/* Label column */}
              <div style={{ padding: "6px 12px", fontSize: 12, display: "flex", flexDirection: "column", justifyContent: "center", borderRight: "1px solid var(--border, #e5e7eb)", background: "var(--card-bg, #fff)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_DOT[q.status] || "#94a3b8", flexShrink: 0 }} />
                  <strong style={{ fontSize: 11 }}>{q.number}</strong>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted, #6b7280)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client}</span>
              </div>

              {/* Bar column */}
              <div style={{ position: "relative", background: "var(--card-bg, #fff)" }}>
                {/* Weekend shading */}
                {days.map((day, i) => (day.getDay() === 0 || day.getDay() === 6) && (
                  <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / DAYS_SHOWN) * 100}%`, width: `${(1 / DAYS_SHOWN) * 100}%`, background: "var(--surface, #f8fafc)" }} />
                ))}

                {/* Today line */}
                {todayVisible && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(todayOffset / DAYS_SHOWN) * 100}%`, width: 1, background: "#ec4899", opacity: 0.5, zIndex: 2 }} />
                )}

                {/* Bar */}
                {isVisible && (
                  <button
                    type="button"
                    onClick={() => onQuoteClick?.(q)}
                    title={`${q.number} — ${client} — ${q.status}`}
                    style={{
                      position: "absolute",
                      top: "50%",
                      transform: "translateY(-50%)",
                      left: `${left}%`,
                      width: `${Math.max(width, 1)}%`,
                      height: 22,
                      background: colors.bg,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 4,
                      cursor: "pointer",
                      padding: "0 4px",
                      fontSize: 10,
                      color: colors.text,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      zIndex: 3,
                      textAlign: "left",
                    }}
                  >
                    {width > 8 ? q.number : ""}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 16px", borderTop: "1px solid var(--border, #e5e7eb)", fontSize: 11, color: "var(--text-muted, #6b7280)" }}>
        {Object.entries(PROCESS_COLORS).map(([key, c]) => (
          <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 8, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 2, display: "inline-block" }} />
            {key === "print3d" ? "3D" : key === "uvdtf" ? "UV-DTF" : key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 1, height: 10, background: "#ec4899", display: "inline-block" }} /> Aujourd'hui
        </span>
      </div>
    </div>
  );
}
