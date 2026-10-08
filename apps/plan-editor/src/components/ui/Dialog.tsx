import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const menuTrigger = previous?.closest("details")?.querySelector("summary");
    const panel = ref.current!;
    const focusables = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, summary, [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getClientRects().length > 0,
      );
    (
      panel.querySelector<HTMLElement>('input:not([type="checkbox"])') ?? panel
    ).focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", handle);
    return () => {
      panel.removeEventListener("keydown", handle);
      if (previous?.isConnected && previous.getClientRects().length) previous.focus();
      else if (menuTrigger?.isConnected) menuTrigger.focus();
    };
  }, []);
  return (
    <div className="cf-dialog-overlay">
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`cf-dialog ${className}`}
      >
        <header className="cf-dialog-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="cf-icon-button"
            aria-label={`ปิด${title}`}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
