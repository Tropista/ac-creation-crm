import { getDeliveryUrgencyMeta } from "../utils/quoteDelivery";

export default function DeliveryUrgencyBadge({ quote, referenceDate, showLater = false }) {
  const meta = getDeliveryUrgencyMeta(quote, referenceDate);
  if (!meta) return null;
  if (!showLater && meta.key === "later") return null;

  return (
    <span
      className={`delivery-urgency delivery-urgency--${meta.key}`}
      title={`Urgence livraison : ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}
