import { createPortal } from "react-dom";

export function DropdownPortal({ children }) {
  return createPortal(children, document.body);
}
