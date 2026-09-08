type PagerProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  /** Sustantivo en plural para el resumen: "ventas", "gastos", "clientes". */
  itemLabel: string;
  onPrev: () => void;
  onNext: () => void;
};

/**
 * Paginador de presentacion: el filtrado sigue siendo sobre el dataset
 * completo, esto solo evita renderizar una tabla infinita. `page` ya viene
 * clampeado por quien lo usa.
 */
export function Pager({
  page,
  totalPages,
  totalItems,
  itemLabel,
  onPrev,
  onNext,
}: PagerProps) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
      <button
        type="button"
        onClick={onPrev}
        disabled={page <= 1}
        className="rounded border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Anterior
      </button>
      <span>
        Pagina {page} de {totalPages} ({totalItems} {itemLabel})
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className="rounded border border-slate-300 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Siguiente
      </button>
    </div>
  );
}
