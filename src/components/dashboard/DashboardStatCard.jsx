export default function DashboardStatCard({ label, value, onClick, className = "", detail }) {
  return (
    <button
      type="button"
      className={`card stat stat--clickable${className ? ` ${className}` : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em className="stat-detail">{detail}</em> : null}
    </button>
  );
}
