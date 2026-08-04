import { useCallback, useEffect, useState } from "react";

const DEFAULT_MAX_HEIGHT = 240;
const GAP = 4;
const MAX_PANEL_REM = 28;
const REM_PX = 16;

/**
 * Calcula posição fixed para dropdown portaled, com flip vertical e clamp horizontal.
 *
 * @param {boolean} isOpen
 * @param {React.RefObject<HTMLElement | null>} triggerRef
 * @param {number} [maxHeight]
 * @param {{ preferredWidth?: number }} [options] preferredWidth em px (ex.: calendário)
 */
export function useDropdownPosition(
  isOpen,
  triggerRef,
  maxHeight = DEFAULT_MAX_HEIGHT,
  options = {},
) {
  const { preferredWidth } = options;
  const [style, setStyle] = useState(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUpward = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    const maxWidthPx = Math.min(
      window.innerWidth - 2 * GAP,
      MAX_PANEL_REM * REM_PX,
    );
    const minWidth = Math.min(rect.width, maxWidthPx);

    const hasFixedWidth =
      typeof preferredWidth === "number" && preferredWidth > 0;
    const widthPx = hasFixedWidth
      ? Math.min(preferredWidth, maxWidthPx)
      : null;
    const clampWidth = widthPx ?? maxWidthPx;

    let left = rect.left;
    if (left + clampWidth > window.innerWidth - GAP) {
      left = window.innerWidth - GAP - clampWidth;
    }
    left = Math.max(GAP, left);

    setStyle({
      position: "fixed",
      left,
      minWidth,
      width: widthPx ?? "max-content",
      maxWidth: maxWidthPx,
      top: openUpward ? undefined : rect.bottom + GAP,
      bottom: openUpward ? window.innerHeight - rect.top + GAP : undefined,
      zIndex: 100,
    });
  }, [triggerRef, maxHeight, preferredWidth]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleReposition = () => updatePosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);

    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, updatePosition]);

  return isOpen ? style : null;
}
