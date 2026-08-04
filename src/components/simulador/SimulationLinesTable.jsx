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

const SimulationLinesTableRow = memo(function SimulationLinesTableRow({
  row,
  cell,
  cultureOptions,
  productOptions,
  isReadOnly,
  canOverrideFloor,
  showMargem,
  colSpan,
  onVolumeChange,
  onCulturaChange,
  onProductChange,
  onPropostaChange,
  onOverrideChange,
  onClearOverride,
  onRemove,
}) {
  const [overridesOpen, setOverridesOpen] = useState(false);
  const hasOverride = Boolean(row.overrides);

  return (
    <>
    <tr
      className={[
        "border-b border-slate-100 transition-colors",
        getLineAutonomiaTintClass(row.isLineBelowFloor),
      ].join(" ")}
    >
      <td className={cell}>
        <EditableNumber
          value={row.volume}
          onChange={(v) => onVolumeChange(row.id, v)}
          disabled={isReadOnly}
          ariaLabel="Volume da linha"
          className="text-sm"
          centered
        />
      </td>
      <td className={`${cell} min-w-[7rem]`}>
        <Select
          aria-label="Cultura da linha"
          size="compact"
          placeholder="Selecione…"
          value={row.cultura ?? ""}
          onChange={(e) => onCulturaChange(row.id, e.target.value)}
          options={cultureOptions.map((c) => ({ value: c, label: c }))}
          disabled={isReadOnly}
        />
      </td>
      <td className={`${cell} min-w-[10rem]`}>
        <Select
          aria-label="Produto da linha"
          size="compact"
          placeholder="Selecione…"
          value={row.productId ?? ""}
          onChange={(e) => onProductChange(row.id, e.target.value)}
          options={productOptions.map((p) => ({ value: p.id, label: p.nome }))}
          disabled={isReadOnly}
        />
      </td>
      <td className={`finance-text ${cell} font-medium text-slate-800`}>
        {formatBRL(row.precoUnitario)}
      </td>
      <td className={`finance-text ${cell} font-medium text-slate-900`}>
        {formatBRL(row.valorTotal)}
      </td>
      <td className={`${cell} bg-primary-50/70`}>
        <EditableNumber
          value={row.proposta}
          onChange={(p) => onPropostaChange(row.id, p)}
          disabled={isReadOnly}
          min={0}
          step={0.01}
          decimals={2}
          ariaLabel="Proposta unitária"
          className="text-sm"
          centered
          emphasized
        />
      </td>
      <td className={`finance-text ${cell} font-medium text-slate-900`}>
        {formatBRL(row.propostaTotal)}
      </td>
      {showMargem ? (
        <td className={`finance-text ${cell} font-semibold text-slate-800`}>
          {formatPercent(row.margemLucro)}
        </td>
      ) : null}
      <td className={cell}>
        <LineAutonomiaBadge
          isLineBelowFloor={row.isLineBelowFloor}
          canOverrideFloor={canOverrideFloor}
        />
      </td>
      <td className={cell}>
        <div className="inline-flex items-center justify-center gap-0.5">
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
          <RemoveLineButton
            onClick={() => onRemove(row.id)}
            disabled={isReadOnly}
          />
        </div>
      </td>
    </tr>
    {canOverrideFloor && overridesOpen ? (
      <tr className="border-b border-slate-100 bg-slate-50/40">
        <td colSpan={colSpan} className="px-3 pb-3">
          <LineCostOverrideEditor
            row={row}
            onOverrideChange={(field, value) =>
              onOverrideChange(row.id, field, value)
            }
            onClearOverride={() => onClearOverride(row.id)}
          />
        </td>
      </tr>
    ) : null}
    </>
  );
});

export function SimulationLinesTable({
  lines,
  cultureOptions,
  productOptions,
  isReadOnly,
  canOverrideFloor,
  showMargem: showMargemProp,
  onVolumeChange,
  onCulturaChange,
  onProductChange,
  onPropostaChange,
  onOverrideChange,
  onClearOverride,
  onRemove,
}) {
  const cell = "px-3 py-2.5 text-center align-middle";
  const showMargem = showMargemProp ?? canOverrideFloor;
  const colSpan = showMargem ? 10 : 9;

  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 lg:block">
      <table className="min-w-full border-collapse text-center text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <th className={cell}>Volume</th>
            <th className={cell}>Cultura</th>
            <th className={cell}>Produto</th>
            <th className={cell}>Valor unit.</th>
            <th className={cell}>Valor total</th>
            <th className={`${cell} bg-primary-50/80 text-primary-800`}>
              Proposta unit.
            </th>
            <th className={cell}>Proposta total</th>
            {showMargem ? <th className={cell}>Margem</th> : null}
            <th className={cell}>Status</th>
            <th className={`${cell} w-24`} />
          </tr>
        </thead>
        <tbody>
          {lines.map((row) => (
            <SimulationLinesTableRow
              key={row.id}
              row={row}
              cell={cell}
              cultureOptions={cultureOptions}
              productOptions={productOptions}
              isReadOnly={isReadOnly}
              canOverrideFloor={canOverrideFloor}
              showMargem={showMargem}
              colSpan={colSpan}
              onVolumeChange={onVolumeChange}
              onCulturaChange={onCulturaChange}
              onProductChange={onProductChange}
              onPropostaChange={onPropostaChange}
              onOverrideChange={onOverrideChange}
              onClearOverride={onClearOverride}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
