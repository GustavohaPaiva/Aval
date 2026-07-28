import { EditableNumber } from "../ui/EditableNumber";
import { formatBRL } from "../../utils/money";

const COST_FIELDS = [
  { key: "custoUsd", label: "Custo (USD)", decimals: 2, step: 0.01 },
  { key: "descontoUsd", label: "Desconto (USD)", decimals: 2, step: 0.01 },
  { key: "taxa", label: "Taxa câmbio", decimals: 4, step: 0.0001 },
  { key: "frete", label: "Frete (R$)", decimals: 2, step: 0.01 },
];

const RATE_FIELDS = [
  {
    key: "taxaAntecipacao",
    label: "Antecipação (% / 30d)",
    decimals: 2,
    step: 0.1,
  },
  { key: "taxaJuros", label: "Juros (% / 30d)", decimals: 2, step: 0.1 },
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
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Ajustes de parâmetros (revisão do gestor)
        </span>
        {hasOverride ? (
          <button
            type="button"
            onClick={onClearOverride}
            className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
          >
            Restaurar catálogo
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COST_FIELDS.map((field) => {
          const isOverridden = row.overrides?.[field.key] != null;
          return (
            <div key={field.key}>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                {field.label}
                {isOverridden ? (
                  <span className="ml-1 text-primary-600">•</span>
                ) : null}
              </label>
              <EditableNumber
                value={Number(breakdown[field.key] ?? 0)}
                onChange={(v) => onOverrideChange(field.key, v)}
                min={0}
                step={field.step}
                decimals={field.decimals}
                ariaLabel={field.label}
                className="text-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {RATE_FIELDS.map((field) => {
          const isOverridden = row.overrides?.[field.key] != null;
          return (
            <div key={field.key}>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                {field.label}
                {isOverridden ? (
                  <span className="ml-1 text-primary-600">•</span>
                ) : null}
              </label>
              <EditableNumber
                value={Number(breakdown[field.key] ?? 0)}
                onChange={(v) => onOverrideChange(field.key, v)}
                min={0}
                step={field.step}
                decimals={field.decimals}
                ariaLabel={field.label}
                className="text-sm"
              />
            </div>
          );
        })}
      </div>

      <p className="finance-text mt-2 text-[11px] text-slate-500">
        Custo R$ {formatBRL(breakdown.custoBrl)} · Custo ICMS{" "}
        {formatBRL(breakdown.custoIcms)} · Frete {formatBRL(breakdown.frete)} →
        Tabela {formatBRL(row.precoUnitario)}
      </p>
    </div>
  );
}
