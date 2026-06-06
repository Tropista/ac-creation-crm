import { useMemo, useState } from "react";
import { clientName, statusClass } from "../../utils/documents";
import {
  addDays,
  buildDeliveryWeekCalendar,
  countWeekDeliveries,
  formatWeekRangeLabel,
  startOfWeekMonday,
} from "../../utils/quoteDeliveryCalendar";
import DeliveryUrgencyBadge from "../DeliveryUrgencyBadge";

export default function DeliveryCalendarCard({ quotes, data, onGoToAtelier }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => addDays(startOfWeekMonday(new Date()), weekOffset * 7),
    [weekOffset]
  );
  const calendar = useMemo(
    () => buildDeliveryWeekCalendar(quotes, weekStart, new Date()),
    [quotes, weekStart]
  );
  const weekCount = countWeekDeliveries(calendar);

  return (
    <div className="card dashboard-action-card" data-testid="delivery-week-calendar">
      <div className="dashboard-action-card__header">
        <div>
          <h3>Calendrier livraisons</h3>
          <p className="muted">
            {weekCount === 0
              ? "Aucune livraison prévue cette semaine."
              : `${weekCount} livraison(s) prévue(s) — semaine du ${formatWeekRangeLabel(weekStart)}`}
          </p>
        </div>
        <div className="dashboard-delivery-nav">
          <button
            type="button"
            className="ghost"
            onClick={() => setWeekOffset((v) => v - 1)}
            aria-label="Semaine précédente"
          >
            ←
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            Cette semaine
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setWeekOffset((v) => v + 1)}
            aria-label="Semaine suivante"
          >
            →
          </button>
          <button type="button" className="ghost" onClick={onGoToAtelier}>
            Atelier →
          </button>
        </div>
      </div>
      <div className="dashboard-delivery-week">
        {calendar.map((day) => (
          <div
            key={day.date.toISOString()}
            className={`dashboard-delivery-day${day.isToday ? " dashboard-delivery-day--today" : ""}`}
          >
            <header className="dashboard-delivery-day__head">
              <strong>{day.label}</strong>
              {day.items.length > 0 ? <span>{day.items.length}</span> : null}
            </header>
            {day.items.length === 0 ? (
              <p className="muted dashboard-delivery-day__empty">—</p>
            ) : (
              <ul className="dashboard-delivery-day__list">
                {day.items.map(({ quote, overdue }) => (
                  <li
                    key={quote.id}
                    className={overdue ? "dashboard-delivery-item--overdue" : ""}
                  >
                    <strong>{quote.number}</strong>
                    <em>{clientName(data, quote.clientId)}</em>
                    <DeliveryUrgencyBadge quote={quote} />
                    <span className={statusClass(quote.status)}>{quote.status}</span>
                    {overdue ? <span className="dashboard-delivery-overdue-tag">Retard</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
