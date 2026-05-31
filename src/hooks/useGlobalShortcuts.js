import { useEffect } from "react";

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function useGlobalShortcuts(shortcuts = []) {
  useEffect(() => {
    function onKeyDown(e) {
      if (isTyping()) return;
      for (const { key, ctrl = false, handler } of shortcuts) {
        const ctrlMatch = ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
        if (e.key.toLowerCase() === key.toLowerCase() && ctrlMatch) {
          e.preventDefault();
          handler();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
