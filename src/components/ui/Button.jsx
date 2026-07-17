import { forwardRef } from "react";

const baseClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variantClass = {
  primary:
    "bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:ring-primary-500",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-primary-200 hover:bg-slate-50 focus-visible:ring-primary-500",
  danger:
    "bg-feedback-error text-white shadow-sm hover:bg-red-600 focus-visible:ring-feedback-error",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-primary-500",
};

function Spinner() {
  return (
    <svg
      className="size-4 shrink-0 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export const Button = forwardRef(function Button(
  {
    variant = "primary",
    loading = false,
    disabled,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      {...(loading ? { "aria-busy": "true" } : {})}
      className={[baseClass, variantClass[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading ? <Spinner /> : null}
      <span
        className={[
          "inline-flex items-center justify-center gap-2",
          loading ? "opacity-90" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </span>
    </button>
  );
});

Button.displayName = "Button";
