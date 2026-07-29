import { EditableNumber } from "../ui/EditableNumber";
import { formatBRL } from "../../utils/money";

const FIELDS = [
  { key: "custoUsd", label: "Custo USD", decimals: 2, step: 0.01 },
  { key: "descontoUsd", label: "Desconto", decimals: 2, step: 0.01 },
  { key: "taxa", label: "Câmbio", decimals: 4, step: 0.0001 },
  { key: "frete", label: "Frete R$", decimals: 2, step: 0.01 },
  { key: "taxaAntecipacao", label: "Antecip. %", decimals: 2, step: 0.1 },
  { key: "taxaJuros", label: "Juros %", decimals: 2, step: 0.1 },
];

export function LineCostOverrideEditor({
  row,
  onOverrideChange,
  onClearOverride,
}) {
  const breakdown = row.custoBreakdown;
  if (!breakdown) return null;

  const hasOverride = Boolean(row.overrides);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Ajustes de parâmetros
        </span>
        {hasOverride ? (
          <button
            type="button"
            onClick={onClearOverride}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
          >
            Restaurar catálogo
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
        {FIELDS.map((field) => {
          const isOverridden = row.overrides?.[field.key] != null;
          return (
            <div key={field.key} className="min-w-0">
              <label className="mb-0.5 block truncate text-[10px] font-medium text-slate-500">
                {field.label}
                {isOverridden ? (
                  <span className="ml-0.5 text-primary-600">•</span>
                ) : null}
              </label>
              <EditableNumber
                value={Number(breakdown[field.key] ?? 0)}
                onChange={(v) => onOverrideChange(field.key, v)}
                min={0}
                step={field.step}
                decimals={field.decimals}
                ariaLabel={field.label}
                className="text-xs"
                inputClassName="h-7 min-w-0 rounded-lg px-1.5 text-xs"
              />
            </div>
          );
        })}
      </div>

      <p className="finance-text mt-1.5 text-[10px] leading-snug text-slate-500">
        Custo R$ {formatBRL(breakdown.custoBrl)} · ICMS{" "}
        {formatBRL(breakdown.custoIcms)} · Frete {formatBRL(breakdown.frete)} →
        Tabela {formatBRL(row.precoUnitario)}
      </p>
    </div>
  );
}
