import { useState, useEffect } from "react";
import { usePersonalFinanceStore, useFilteredTransactions } from "@/store/personalFinanceStore";
import { fetchInsights } from "@/services/personalFinanceApi";
import type { PFInsight } from "@/services/personalFinanceApi";
import { C_ERROR, C_WARNING, C_PRIMARY } from "@/lib/colors";

function severityColor(s: PFInsight["severity"]) {
  if (s === "danger")  return C_ERROR;
  if (s === "warning") return C_WARNING;
  return C_PRIMARY;
}

function severityIcon(s: PFInsight["severity"]) {
  if (s === "danger")  return "⛔";
  if (s === "warning") return "⚠️";
  return "💡";
}

function typeLabel(t: PFInsight["type"]) {
  if (t === "overspending") return "Overspending";
  if (t === "risk")         return "Risk Zone";
  return "Opportunity";
}

export function PFInsightsPanel() {
  const transactions = useFilteredTransactions();
  const budgets      = usePersonalFinanceStore((s) => s.budgets);

  const [insights,  setInsights]  = useState<PFInsight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(false);
  const [open,      setOpen]      = useState(true);

  useEffect(() => {
    if (transactions.length === 0) return;
    setLoading(true);
    fetchInsights(transactions, budgets)
      .then(setInsights)
      .finally(() => setLoading(false));
  }, [transactions, budgets]);

  const visible = insights.filter((i) => !dismissed.has(i.id));
  const dismiss = (id: string) => setDismissed((p) => new Set([...p, id]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(255,255,255,0.55)",
          border: `1.5px solid hsl(244 25% 82%)`,
          borderLeft: `3px solid ${C_PRIMARY}`,
          borderRadius: "10px",
          cursor: "pointer",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: C_PRIMARY, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            ELLY Insights
          </span>
          {visible.length > 0 && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "20px",
                backgroundColor: `${severityColor(visible[0].severity)}1a`,
                color: severityColor(visible[0].severity),
                border: `1px solid ${severityColor(visible[0].severity)}40`,
              }}
            >
              {visible.length} active
            </span>
          )}
        </div>
        <span style={{ fontSize: "10px", color: "hsl(245 16% 55%)" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <>
          {loading && (
            <div style={{ fontSize: "13px", color: "hsl(245 16% 55%)", padding: "16px" }}>
              Analysing transactions…
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div
              style={{
                background: "rgba(29,158,117,0.08)",
                border: "1.5px solid rgba(29,158,117,0.25)",
                borderRadius: "10px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "18px" }}>✅</span>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1D9E75", marginBottom: "2px" }}>
                  Everything looks healthy
                </div>
                <div style={{ fontSize: "12px", color: "hsl(245 16% 49%)" }}>
                  No overspending or risk alerts this period. Keep it up!
                </div>
              </div>
            </div>
          )}

          {!loading && visible.map((insight) => {
            const color = severityColor(insight.severity);
            return (
              <div
                key={insight.id}
                style={{
                  background: `${color}0d`,
                  border: `1px solid ${color}2a`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: "10px",
                  padding: "14px 16px",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: "18px", flexShrink: 0, lineHeight: 1 }}>{severityIcon(insight.severity)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color }}>{insight.title}</span>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: `${color}15`,
                        color,
                      }}
                    >
                      {typeLabel(insight.type)}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "hsl(245 16% 40%)", lineHeight: 1.5 }}>
                    {insight.message}
                  </div>
                </div>
                <button
                  onClick={() => dismiss(insight.id)}
                  title="Dismiss"
                  style={{
                    background: "none",
                    border: "none",
                    color: "hsl(245 16% 60%)",
                    cursor: "pointer",
                    fontSize: "14px",
                    lineHeight: 1,
                    padding: "2px",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Dismissed count */}
          {dismissed.size > 0 && (
            <button
              onClick={() => setDismissed(new Set())}
              style={{
                background: "none",
                border: "none",
                fontSize: "11px",
                color: "hsl(245 16% 55%)",
                cursor: "pointer",
                textDecoration: "underline",
                textAlign: "left",
                padding: 0,
              }}
            >
              Show {dismissed.size} dismissed alert{dismissed.size > 1 ? "s" : ""}
            </button>
          )}

          {/* Rule reference */}
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(255,255,255,0.40)",
              border: `1px solid hsl(244 25% 85%)`,
              borderRadius: "8px",
            }}
          >
            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: "8px" }}>
              Active Rules
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {[
                { icon: "⛔", text: "Overspending — category exceeds monthly budget" },
                { icon: "⛔", text: "Risk Zone — total expenses exceed total income" },
                { icon: "⚠️", text: "Spending Spike — category up >30% vs prior month" },
              ].map(({ icon, text }) => (
                <div key={text} style={{ fontSize: "11px", color: "hsl(245 16% 49%)", display: "flex", gap: "6px" }}>
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
