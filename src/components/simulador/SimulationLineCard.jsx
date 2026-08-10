import { memo, useMemo, useState } from "react";
import { EditableNumber } from "../ui/EditableNumber";
import { Select } from "../ui/Select";
import { IconSliders } from "../icons";
import { RemoveLineButton } from "./RemoveLineButton";
import { LineCostOverrideEditor } from "./LineCostOverrideEditor";
import {
  LineAutonomiaBadge,
  getLineAutonomiaTintClass,
} from "./LineAutonomiaBadge";
import { formatBRL, formatPercent } from "../../utils/money";
import { formatProdutoDisplayNome } from "../../constants/mapeamentoCampos";

function filterProductsByFornecedor(productOptions, fornecedorId) {
  if (!fornecedorId) return productOptions;
  return productOptions.filter(
    (p) => String(p.fornecedorId ?? "") === String(fornecedorId),
  );
}

function productOptionLabel(product, omitFornecedor) {
  const label = formatProdutoDisplayNome({
    nome: product.nome,
    referencia_complementar: product.referenciaComplementar,
    fornecedor_nome: product.fornecedorNome,
    omitFornecedor,
  });
  return label || product.displayNome || product.nome || "—";
}

export const SimulationLineCard = memo(function SimulationLineCard({
  row,
  cultureOptions,
  productOptions,
  fornecedorOptions = [],
  isReadOnly,
  canOverrideFloor,
  onVolumeChange,
  onCulturaChange,
  onFornecedorChange,
  onProductChange,
  onPropostaChange,
  onDescontoPctChange,
  onOverrideChange,
  onClearOverride,
  onRemove,
}) {
  const selectClass = "text-xs";
  const [overridesOpen, setOverridesOpen] = useState(false);
  const hasOverride = Boolean(row.overrides);
  const filteredProducts = useMemo(
    () => filterProductsByFornecedor(productOptions, row.fornecedorId),
    [productOptions, row.fornecedorId],
  );

  return (
    <article
      className={[
        "rounded-2xl border bg-white p-3 shadow-sm transition-colors",
        getLineAutonomiaTintClass(row.isLineBelowFloor, { asCard: true }),
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Vol.
          </span>
          <EditableNumber
            value={row.volume}
            onChange={onVolumeChange}
            disabled={isReadOnly}
            ariaLabel="Volume da linha"
            className="text-sm"
          />
        </div>
        <div className="min-w-0 text-right">
          <p className="finance-text text-sm font-semibold text-slate-900">
            {formatBRL(row.valorTotal)}
          </p>
          <p className="finance-text text-[11px] text-slate-500">
            {formatBRL(row.propostaTotal)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {canOverrideFloor ? (
            <button
              type="button"
              onClick={() => setOverridesOpen((open) => !open)}
              title="Ajustes de parâmetros"
              className={[
                "relative inline-flex size-9 items-center justify-center rounded-2xl transition-colors",
                overridesOpen || hasOverride
                  ? "bg-primary-50 text-primary-700"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
              ].join(" ")}
            >
              <IconSliders className="size-4" />
              {hasOverride && !overridesOpen ? (
                <span
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary-500"
                  aria-hidden
                />
              ) : null}
              <span className="sr-only">Parâmetros</span>
            </button>
          ) : null}
          <RemoveLineButton onClick={onRemove} disabled={isReadOnly} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2 sm:grid-cols-2">
        <Select
          label="Cultura"
          size="compact"
          placeholder="Selecione…"
          value={row.cultura ?? ""}
          onChange={(e) => onCulturaChange(e.target.value)}
          options={cultureOptions.map((c) => ({ value: c, label: c }))}
          disabled={isReadOnly}
          className={selectClass}
          editableHint
        />
        <Select
          label="Fornecedor"
          size="compact"
          placeholder="Selecione…"
          value={row.fornecedorId ?? ""}
          onChange={(e) => onFornecedorChange(e.target.value)}
          options={fornecedorOptions.map((f) => ({
            value: f.id,
            label: f.nome,
          }))}
          disabled={isReadOnly}
          className={selectClass}
          editableHint
        />
        <Select
          label="Produto"
          size="compact"
          placeholder="Selecione…"
          value={row.productId ?? ""}
          onChange={(e) => onProductChange(e.target.value)}
          options={filteredProducts.map((p) => ({
            value: p.id,
            label: productOptionLabel(p, Boolean(row.fornecedorId)),
          }))}
          disabled={isReadOnly}
          className={selectClass}
          editableHint
        />
        <div className="rounded-xl border border-slate-100 bg-white p-2 sm:col-span-2">
          <div className="flex items-end justify-between gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Desconto %
                </label>
                <EditableNumber
                  value={row.descontoPct ?? 0}
                  onChange={onDescontoPctChange}
                  disabled={isReadOnly}
                  min={0}
                  step={0.01}
                  decimals={2}
                  ariaLabel="Desconto percentual"
                  className="text-sm"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Proposta un.
                </label>
                <EditableNumber
                  value={row.proposta}
                  onChange={onPropostaChange}
                  disabled={isReadOnly}
                  min={0}
                  step={0.01}
                  decimals={2}
                  ariaLabel="Proposta unitária"
                  className="text-sm"
                />
              </div>
            </div>
            <LineAutonomiaBadge
              isLineBelowFloor={row.isLineBelowFloor}
              canOverrideFloor={canOverrideFloor}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <p className="finance-text text-[11px] text-slate-500">
          Tabela {formatBRL(row.precoUnitario)}
        </p>
        {canOverrideFloor ? (
          <p className="finance-text text-[11px] font-semibold text-slate-700">
            Margem {formatPercent(row.margemLucro)}
          </p>
        ) : null}
      </div>

      {canOverrideFloor && overridesOpen ? (
        <div className="mt-2">
          <LineCostOverrideEditor
            row={row}
            onOverrideChange={onOverrideChange}
            onClearOverride={onClearOverride}
          />
        </div>
      ) : null}
    </article>
  );
});
