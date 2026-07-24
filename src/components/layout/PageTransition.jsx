import { useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PageLoadingProvider } from "../../contexts/PageLoadingContext";
import { BrandMark } from "../brand/BrandLogo";

const OVERLAY_FADE_MS = 150;

function PageLoadingOverlay({ leaving }) {
  return (
    <div
      className={[
        "page-loading-overlay absolute inset-0 z-20 flex flex-col items-center justify-center gap-4",
        leaving ? "is-leaving" : "",
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando página"
    >
      <div className="page-loading-backdrop absolute inset-0" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-6 py-5 shadow-sm">
        <span className="relative flex size-11 items-center justify-center overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-800">
          <span
            className="page-loading-pulse absolute -inset-2 rounded-xl bg-primary-400/20"
            aria-hidden
          />
          <BrandMark className="relative size-7" />
        </span>
        <p className="text-sm font-medium text-slate-600">
          Carregando informações…
        </p>
        <span
          className="size-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function PageTransition() {
  const location = useLocation();
  const pathKey = `${location.pathname}${location.search}`;
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [overlayLeaving, setOverlayLeaving] = useState(false);
  const [trackedPathKey, setTrackedPathKey] = useState(pathKey);

  if (pathKey !== trackedPathKey) {
    setTrackedPathKey(pathKey);
    setOverlayMounted(false);
    setOverlayLeaving(false);
  }

  const handleLoadingChange = useCallback((loading) => {
    if (loading) {
      setOverlayLeaving(false);
      setOverlayMounted(true);
      return;
    }

    setOverlayLeaving(true);
    window.setTimeout(() => {
      setOverlayMounted(false);
      setOverlayLeaving(false);
    }, OVERLAY_FADE_MS);
  }, []);

  return (
    <PageLoadingProvider
      pathKey={pathKey}
      onLoadingChange={handleLoadingChange}
    >
      <div className="relative min-h-[12rem]">
        {overlayMounted ? (
          <PageLoadingOverlay leaving={overlayLeaving} />
        ) : null}
        <div key={pathKey} className="page-enter">
          <Outlet />
        </div>
      </div>
    </PageLoadingProvider>
  );
}
