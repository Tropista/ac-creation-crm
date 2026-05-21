export default function PaginationControls({
  page,
  totalPages,
  onPageChange,
  totalItems,
  perPage
}) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalItems);

  return (
    <div className="pagination-controls">
      <span>{start}-{end} sur {totalItems}</span>

      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        ← Précédent
      </button>

      <strong>Page {page} / {totalPages}</strong>

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Suivant →
      </button>
    </div>
  );
}
