import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "small" | "medium" | "large";
  icon?: IconName;
  trailingIcon?: IconName;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "medium",
  icon,
  trailingIcon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} {...props}>
      {icon && <Icon name={icon} size={size === "small" ? 16 : 18} />}
      <span>{children}</span>
      {trailingIcon && <Icon name={trailingIcon} size={size === "small" ? 16 : 18} />}
    </button>
  );
}
