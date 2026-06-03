import type React from "react";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";

// ── Progress + deadline helpers ───────────────────────────────────────────────

export function progressColor(pct: number): string {
  if (pct >= 100) return C_SUCCESS;
  if (pct >= 60)  return C_PRIMARY;
  return C_WARNING;
}

export function daysUntil(deadline: string): number {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  const color = days < 0 ? C_ERROR : days < 30 ? C_WARNING : "hsl(245 16% 55%)";
  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 20,
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}

// ── Shared style tokens ───────────────────────────────────────────────────────

export const inputStyle: React.CSSProperties = {
  flex: 1,
  border: `1px solid ${C_BORDER}`,
  borderRadius: 6,
  padding: "7px 10px",
  fontSize: 12,
  outline: "none",
  background: "rgba(255,255,255,0.80)",
  color: "hsl(242 44% 30%)",
  minWidth: 0,
};

export const inputWrapStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 4,
  minWidth: 0,
};

export const prefixStyle: React.CSSProperties = {
  fontSize: 12,
  color: "hsl(245 16% 55%)",
  flexShrink: 0,
};

export const btnPrimaryStyle: React.CSSProperties = {
  background: C_PRIMARY,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 16px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

export const btnSecondaryStyle: React.CSSProperties = {
  background: "transparent",
  color: "hsl(245 16% 55%)",
  border: `1px solid ${C_BORDER}`,
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12,
  cursor: "pointer",
};
