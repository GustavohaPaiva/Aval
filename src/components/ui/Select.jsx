import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconChevronDown, IconSearch } from "../icons";
import { useDropdownPosition } from "../../hooks/useDropdownPosition";
import { filterSelectOptions } from "../../utils/selectUtils";
import { DropdownPortal } from "./DropdownPortal";

const SEARCH_AUTO_THRESHOLD = 8;

const TRIGGER_DEFAULT =
  "h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 pr-9 text-left text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const TRIGGER_COMPACT =
  "h-9 w-full rounded-xl border border-gray-200 bg-white px-2 pr-8 text-left text-sm text-slate-800 transition-[border-color,box-shadow] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-slate-50";

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

function createSyntheticChangeEvent(value) {
  return {
    target: { value },
    currentTarget: { value },
  };
}

function resolveOptions(options, placeholder) {
  const list = Array.isArray(options) ? options : [];
  const hasEmpty = list.some(
    (opt) => opt.value === "" || opt.value === null,
  );

  if (placeholder && !hasEmpty) {
    return [{ value: "", label: placeholder }, ...list];
  }

  return list;
}

function getSelectableOptions(allOptions) {
  return allOptions.filter(
    (opt) => opt.value !== "" && opt.value !== null && opt.value !== undefined,
  );
}

export const Select = forwardRef(function Select(
  {
    label,
    placeholder,
    options = [],
    error,
    id: idProp,
    className = "",
    value = "",
    onChange,
    onBlur,
    disabled = false,
    searchable,
    searchPlaceholder = "Buscar…",
    emptyMessage = "Nenhum resultado encontrado",
    size = "default",
    "aria-label": ariaLabel,
    required,
    autoOpen = false,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const selectId = idProp ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const errorId = `${selectId}-error`;
  const hasError = Boolean(error);

  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  useImperativeHandle(ref, () => triggerRef.current);

  const allOptions = useMemo(
    () => resolveOptions(options, placeholder),
    [options, placeholder],
  );

  const selectableOptions = useMemo(
    () => getSelectableOptions(allOptions),
    [allOptions],
  );

  const placeholderOption = allOptions.find((opt) => opt.value === "");

  const isSearchable =
    searchable ?? selectableOptions.length > SEARCH_AUTO_THRESHOLD;

  const filteredOptions = useMemo(() => {
    const base =
      !isSearchable || !query.trim()
        ? selectableOptions
        : filterSelectOptions(selectableOptions, query);

    if (!placeholderOption) return base;

    const matchesPlaceholder =
      !query.trim() ||
      filterSelectOptions([placeholderOption], query).length > 0;

    return matchesPlaceholder ? [placeholderOption, ...base] : base;
  }, [isSearchable, placeholderOption, query, selectableOptions]);

  const dropdownStyle = useDropdownPosition(isOpen, triggerRef);

  const selectedOption = allOptions.find(
    (opt) => String(opt.value) === String(value),
  );

  const displayLabel =
    selectedOption?.label ||
    placeholderOption?.label ||
    placeholder ||
    "Selecione…";

  const isPlaceholder = !selectedOption || selectedOption.value === "";

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setQuery("");
    setHighlightIndex(0);
  }, [disabled]);

  const selectValue = useCallback(
    (nextValue) => {
      onChange?.(createSyntheticChangeEvent(String(nextValue)));
      close();
      triggerRef.current?.focus();
    },
    [close, onChange],
  );

  useEffect(() => {
    if (!autoOpen || disabled) return;
    open();
  }, [autoOpen, disabled, open]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      close();
      onBlur?.();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [close, isOpen, onBlur]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      if (isSearchable) {
        searchRef.current?.focus();
      } else {
        listRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isOpen, isSearchable]);

  const activeHighlightIndex = Math.min(
    highlightIndex,
    Math.max(0, filteredOptions.length - 1),
  );

  const handleTriggerKeyDown = (event) => {
    if (disabled) return;

    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (!isOpen) open();
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
    }
  };

  const handleListKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      close();
      onBlur?.();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[activeHighlightIndex];
      if (option) selectValue(option.value);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      listRef.current?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    handleListKeyDown(event);
  };

  const triggerBase =
    size === "compact" ? TRIGGER_COMPACT : TRIGGER_DEFAULT;

  const triggerClasses = joinClasses(
    triggerBase,
    className,
    "relative cursor-pointer",
    isPlaceholder && "text-slate-400",
    !isPlaceholder && "text-slate-900",
    isOpen && "border-primary-500 ring-2 ring-primary-500/20",
    hasError && "border-feedback-error",
    disabled && "cursor-not-allowed opacity-50",
  );

  const handleTriggerClick = () => {
    if (isOpen) close();
    else open();
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}
      <div className="relative min-w-0">
        {required ? (
          <input
            type="text"
            tabIndex={-1}
            aria-hidden
            value={value ?? ""}
            required
            onChange={() => {}}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />
        ) : null}
        <button
          {...rest}
          ref={triggerRef}
          id={selectId}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-label={ariaLabel ?? label}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          disabled={disabled}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          onBlur={() => {
            if (!isOpen) onBlur?.();
          }}
          className={triggerClasses}
        >
          <span className="block min-w-0 truncate pr-1">{displayLabel}</span>
          <IconChevronDown
            className={joinClasses(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-200",
              size === "compact" ? "right-2 size-3.5" : "right-3 size-4",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {isOpen && dropdownStyle ? (
          <DropdownPortal>
            <div style={dropdownStyle}>
              <div
                ref={listRef}
                id={listboxId}
                role="listbox"
                tabIndex={-1}
                onKeyDown={handleListKeyDown}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg ring-1 ring-slate-900/5"
              >
                {isSearchable ? (
                  <div className="border-b border-slate-100 p-2">
                    <div className="relative">
                      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchRef}
                        type="text"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setHighlightIndex(0);
                        }}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={searchPlaceholder}
                        className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                      />
                    </div>
                  </div>
                ) : null}

                <ul className="max-h-60 overflow-y-auto p-1.5">
                  {filteredOptions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-slate-500">
                      {emptyMessage}
                    </li>
                  ) : (
                    filteredOptions.map((option, index) => {
                      const isSelected =
                        String(option.value) === String(value);
                      const isHighlighted = index === activeHighlightIndex;

                      return (
                        <li key={String(option.value)} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onMouseEnter={() => setHighlightIndex(index)}
                            onClick={() => selectValue(option.value)}
                            className={joinClasses(
                              "flex w-full cursor-pointer items-center rounded-xl px-3 py-2 text-left text-sm transition-colors",
                              size === "compact" && "text-[13px]",
                              isHighlighted || isSelected
                                ? "bg-primary-50 text-primary-800"
                                : "text-slate-800 hover:bg-slate-50",
                            )}
                          >
                            <span className="wrap-break-word whitespace-normal">
                              {option.label}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          </DropdownPortal>
        ) : null}
      </div>
      {hasError ? (
        <p id={errorId} className="text-xs font-medium text-feedback-error">
          {error}
        </p>
      ) : null}
    </div>
  );
});

Select.displayName = "Select";
