"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function StudioDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const onCancel = (event: Event) => { event.preventDefault(); close.current(); };
    dialog.addEventListener("cancel", onCancel);
    return () => { dialog.removeEventListener("cancel", onCancel); dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="studio-dialog studio" aria-labelledby="studio-dialog-title"><div className="dialog-heading"><h2 id="studio-dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div>{children}</dialog>;
}
