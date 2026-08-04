import { memo, useState } from "react";
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

export const SimulationLineCard = memo(function SimulationLineCard({
  row,
  cultureOptions,
  productOptions,
  isReadOnly,
  canOverrideFloor,
  onVolumeChange,
  onCulturaChange,
  onProductChange,
  onPropostaChange,
  onOverrideChange,
  onClearOverride,
  onRemove,
}) {
  const selectClass = "text-xs";
  const [overridesOpen, setOverridesOpen] = useState(false);
  const hasOverride = Boolean(row.overrides);

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
        />
        <Select
          label="Produto"
          size="compact"
          placeholder="Selecione…"
          value={row.productId ?? ""}
          onChange={(e) => onProductChange(e.target.value)}
          options={productOptions.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={isReadOnly}
          className={selectClass}
        />
        <div className="rounded-xl border border-primary-200/80 bg-primary-50/60 p-2 sm:col-span-2">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-primary-800">
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
                emphasized
              />
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
