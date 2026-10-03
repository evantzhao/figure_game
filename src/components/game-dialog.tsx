'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal keeps keyboard focus inside and restores it to the opener. */
export function GameDialog({ open, onClose, title, wide = false, children }: {
  open: boolean; onClose: () => void; title: string; wide?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`game-dialog${wide ? ' analysis-dialog' : ''}`} aria-label={title}
    onCancel={onClose} onClose={onClose}>
    <div className="dialog-heading"><h2>{title}</h2><button className="button secondary" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>Back to board ×</button></div>
    {open && children}
  </dialog>;
}
