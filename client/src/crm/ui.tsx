import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet crm"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet-heading">
        <strong>{title}</strong>
        <button onClick={onClose}>Отмена</button>
      </div>
      <div className="sheet-content">{children}</div>
    </dialog>
  );
}
export function Load({ loading, error }: { loading: boolean; error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : loading ? (
    <p className="muted" role="status">
      Загрузка…
    </p>
  ) : null;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Form({
  submit,
  children,
  label = "Сохранить",
  disabled = false,
  onDone,
}: {
  submit: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await submit(data);
      setSaved(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className="form">
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="success">
          Сохранено
        </p>
      )}
      <button className="primary" disabled={busy || disabled}>
        {busy ? "Сохраняем…" : label}
      </button>
    </form>
  );
}
export function Action({
  run,
  children,
  disabled = false,
  confirm,
}: {
  run: () => Promise<unknown>;
  children: ReactNode;
  disabled?: boolean;
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="action">
      <button
        type="button"
        disabled={busy || disabled}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          try {
            await run();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Ошибка");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
