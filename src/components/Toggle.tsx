interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled, compact }: ToggleProps) {
  return (
    <div className={`toggle-row ${compact ? "toggle-row--compact" : ""} ${disabled ? "is-disabled" : ""}`}>
      <span className="toggle-row__copy">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__description">{description}</span>}
      </span>
      <button
        type="button"
        className={`switch ${checked ? "is-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}
