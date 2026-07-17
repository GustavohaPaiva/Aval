import { useCallback, useEffect, useState } from "react";

const DEFAULT_MAX_HEIGHT = 240;
const GAP = 4;

/**
 * Calcula posição fixed para dropdown portaled, com flip para cima quando necessário.
 */
export function useDropdownPosition(isOpen, triggerRef, maxHeight = DEFAULT_MAX_HEIGHT) {
  const [style, setStyle] = useState(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUpward = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    setStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      width: "max-content",
      maxWidth: "min(90vw, 28rem)",
      top: openUpward ? undefined : rect.bottom + GAP,
      bottom: openUpward ? window.innerHeight - rect.top + GAP : undefined,
      zIndex: 100,
    });
  }, [triggerRef, maxHeight]);

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
