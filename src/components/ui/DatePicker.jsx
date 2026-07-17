import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { IconCalendar, IconChevronDown } from "../icons";
import { useDropdownPosition } from "../../hooks/useDropdownPosition";
import { DropdownPortal } from "./DropdownPortal";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const TRIGGER_CLASS =
  "flex h-11 w-full items-center gap-2 rounded-2xl border bg-white px-3 text-left text-sm shadow-sm transition-[border-color,box-shadow] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function parseISODate(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplay(value) {
  const date = parseISODate(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
}

function createSyntheticChangeEvent(value) {
  return {
    target: { value },
    currentTarget: { value },
  };
}

function buildCalendarDays(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  return cells;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const DatePicker = forwardRef(function DatePicker(
  {
    label,
    placeholder = "Selecione a data…",
    value = "",
    onChange,
    onBlur,
    error,
    id: idProp,
    disabled = false,
    className = "",
  },
  ref,
) {
  const generatedId = useId();
  const inputId = idProp ?? generatedId;
  const errorId = `${inputId}-error`;
  const hasError = Boolean(error);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selectedDate = parseISODate(value);
  const today = new Date();

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    () => selectedDate?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    () => selectedDate?.getMonth() ?? today.getMonth(),
  );

  useImperativeHandle(ref, () => triggerRef.current);

  const dropdownStyle = useDropdownPosition(isOpen, triggerRef, 320);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    if (selectedDate) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
    }
    setIsOpen(true);
  }, [disabled, selectedDate, today]);

  const selectDate = useCallback(
    (day) => {
      const next = toISO(new Date(viewYear, viewMonth, day));
      onChange?.(createSyntheticChangeEvent(next));
      close();
      triggerRef.current?.focus();
    },
    [close, onChange, viewMonth, viewYear],
  );

  const clearDate = useCallback(() => {
    onChange?.(createSyntheticChangeEvent(""));
    close();
    triggerRef.current?.focus();
  }, [close, onChange]);

  const goToPreviousMonth = useCallback(() => {
    setViewMonth((month) => {
      if (month === 0) {
        setViewYear((year) => year - 1);
        return 11;
      }
      return month - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth((month) => {
      if (month === 11) {
        setViewYear((year) => year + 1);
        return 0;
      }
      return month + 1;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
      onBlur?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
        onBlur?.();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen, onBlur]);

  const displayValue = formatDisplay(value);
  const calendarDays = buildCalendarDays(viewYear, viewMonth);

  return (
    <div className={["flex w-full flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}

      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        onClick={() => (isOpen ? close() : open())}
        className={[
          TRIGGER_CLASS,
          hasError
            ? "border-feedback-error focus:border-feedback-error focus:ring-feedback-error/25"
            : "border-gray-200",
        ].join(" ")}
      >
        <IconCalendar className="size-4 shrink-0 text-slate-400" />
        <span
          className={[
            "min-w-0 flex-1 truncate",
            displayValue ? "text-slate-900" : "text-slate-400",
          ].join(" ")}
        >
          {displayValue || placeholder}
        </span>
        <IconChevronDown
          className={[
            "size-4 shrink-0 text-slate-400 transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm font-medium text-feedback-error"
        >
          {error}
        </p>
      ) : null}

      {isOpen && dropdownStyle ? (
        <DropdownPortal>
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Selecionar data"
            style={dropdownStyle}
            className="w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="flex size-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Mês anterior"
              >
                ‹
              </button>
              <span className="text-sm font-semibold text-slate-800">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                type="button"
                onClick={goToNextMonth}
                className="flex size-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Próximo mês"
              >
                ›
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((day) => (
                <span
                  key={day}
                  className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                if (day == null) {
                  return <span key={`empty-${index}`} aria-hidden />;
                }

                const cellDate = new Date(viewYear, viewMonth, day);
                const isSelected = selectedDate
                  ? isSameDay(cellDate, selectedDate)
                  : false;
                const isToday = isSameDay(cellDate, today);

                return (
                  <button
                    key={`${viewYear}-${viewMonth}-${day}`}
                    type="button"
                    onClick={() => selectDate(day)}
                    className={[
                      "flex size-9 items-center justify-center rounded-xl text-sm transition-colors",
                      isSelected
                        ? "bg-primary-600 font-semibold text-white"
                        : isToday
                          ? "bg-primary-50 font-medium text-primary-700"
                          : "text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {value ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={clearDate}
                  className="w-full rounded-xl px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  Limpar data
                </button>
              </div>
            ) : null}
          </div>
        </DropdownPortal>
      ) : null}
    </div>
  );
});

DatePicker.displayName = "DatePicker";
