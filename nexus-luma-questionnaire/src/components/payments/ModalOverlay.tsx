import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ModalOverlayProps {
  isOpen: boolean;
  onRequestClose: () => void;
  /** True while a payment is actively being confirmed — blocks accidental close. */
  isBusy?: boolean;
  labelledBy: string;
  describedBy?: string;
  children: React.ReactNode;
  closeButton: React.ReactNode;
}

/**
 * Handles the overlay, the open/close transition, escape-to-close,
 * click-outside-to-close, and rendering via a portal. Focus trapping is
 * handled by the containerRef passed in via children (see useModalFocusTrap).
 */
export function ModalOverlay({
  isOpen,
  onRequestClose,
  isBusy,
  labelledBy,
  describedBy,
  children,
  closeButton,
}: ModalOverlayProps) {
  const [mounted, setMounted] = useState(isOpen);
  const [visualState, setVisualState] = useState<"open" | "closing">("open");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Next tick so the "open" transition actually animates in.
      const id = requestAnimationFrame(() => setVisualState("open"));
      return () => cancelAnimationFrame(id);
    }
    if (mounted) {
      setVisualState("closing");
      const timeout = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        onRequestClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, isBusy, onRequestClose]);

  if (!mounted) return null;

  function handleOverlayClick(event: React.MouseEvent) {
    if (event.target === overlayRef.current && !isBusy) {
      onRequestClose();
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="nl-overlay"
      data-state={visualState}
      onMouseDown={handleOverlayClick}
    >
      <div
        className="nl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {closeButton}
        {children}
      </div>
    </div>,
    document.body
  );
}
