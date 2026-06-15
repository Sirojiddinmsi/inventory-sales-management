import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
  type LucideIcon
} from "lucide-react";
import {
  useEffect,
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      className={`button button-${variant} button-${size} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }
>(({ label, error, className = "", ...props }, ref) => (
  <label className="field">
    {label && <span className="field-label">{label}</span>}
    <input ref={ref} className={`input ${error ? "input-error" : ""} ${className}`} {...props} />
    {error && <span className="field-error">{error}</span>}
  </label>
));
Input.displayName = "Input";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }
>(({ label, error, className = "", children, ...props }, ref) => (
  <label className="field">
    {label && <span className="field-label">{label}</span>}
    <select ref={ref} className={`input ${error ? "input-error" : ""} ${className}`} {...props}>
      {children}
    </select>
    {error && <span className="field-error">{error}</span>}
  </label>
));
Select.displayName = "Select";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }
>(({ label, error, className = "", ...props }, ref) => (
  <label className="field">
    {label && <span className="field-label">{label}</span>}
    <textarea
      ref={ref}
      className={`input textarea ${error ? "input-error" : ""} ${className}`}
      {...props}
    />
    {error && <span className="field-error">{error}</span>}
  </label>
));
Textarea.displayName = "Textarea";

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input className="input" {...props} />
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  className = "",
  bodyClassName = "",
  footerClassName = ""
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal-wide" : ""} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Yopish">
            <X size={20} />
          </button>
        </div>
        <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <div className={`modal-footer ${footerClassName}`.trim()}>{footer}</div>}
      </section>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  title,
  actions
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue"
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "orange" | "purple" | "red";
}) {
  return (
    <Card className="stat-card">
      <div className={`stat-icon stat-${tone}`}>
        <Icon size={21} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function DataTable({
  children,
  loading,
  empty,
  minWidth = 760
}: {
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  minWidth?: number;
}) {
  if (loading) {
    return (
      <div className="table-state">
        <LoaderCircle className="spin" />
        <span>Ma’lumotlar yuklanmoqda...</span>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="table-state">
        <AlertTriangle />
        <span>Ma’lumot topilmadi</span>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table style={{ minWidth }}>{children}</table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>Jami: {total}</span>
      <div>
        <button
          className="icon-button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Oldingi sahifa"
        >
          <ChevronLeft size={18} />
        </button>
        <strong>
          {page} / {Math.max(totalPages, 1)}
        </strong>
        <button
          className="icon-button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Keyingi sahifa"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  loading,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  message: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Bekor qilish</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>O‘chirish</Button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}
