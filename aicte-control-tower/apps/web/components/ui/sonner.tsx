"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CheckCircle,
  Info,
  Warning,
  XCircle,
  CircleNotch,
} from "@phosphor-icons/react";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CheckCircle size={18} weight="fill" aria-hidden="true" />,
        info: <Info size={18} weight="fill" aria-hidden="true" />,
        warning: <Warning size={18} weight="fill" aria-hidden="true" />,
        error: <XCircle size={18} weight="fill" aria-hidden="true" />,
        loading: <CircleNotch size={18} className="animate-spin" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--line)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
