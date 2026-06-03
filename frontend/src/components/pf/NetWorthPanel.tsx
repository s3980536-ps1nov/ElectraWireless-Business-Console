import { useState } from "react";
import { usePersonalFinanceStore } from "@/store/personalFinanceStore";
import { C_BORDER, C_SUCCESS, C_ERROR, C_PRIMARY, C_WARNING } from "@/lib/colors";

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function NetWorthInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color: string;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");
  const [focused, setFocused] = useState(false);

  const commit = () => {
    const n = parseFloat(draft.replace(/[,$\s]/g, ""));
    if (!isNaN(n) && n >= 0) onChange(n);
    else { setDraft(value > 0 ? String(value) : ""); }
    setFocused(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)" }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: focused ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
          border: `1.5px solid ${focused ? color : C_BORDER}`,
          borderRadius: 8,
          padding: "0 10px",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <span style={{ fontSize: 13, color: "hsl(245 16% 55%)", marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={focused ? draft : (value > 0 ? value.toLocaleString() : "")}
          onFocus={() => { setDraft(value > 0 ? String(value) : ""); setFocused(true); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setFocused(false); setDraft(value > 0 ? String(value) : ""); } }}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: 600,
            color: "hsl(242 44% 28%)",
            width: "100%",
            padding: "9px 0",
          }}
        />
      </div>
    </div>
  );
}

export function NetWorthPanel() {
  const assets       = usePersonalFinanceStore((s) => s.assets);
  const liabilities  = usePersonalFinanceStore((s) => s.liabilities);
  const setAssets    = usePersonalFinanceStore((s) => s.setAssets);
  const setLiabilities = usePersonalFinanceStore((s) => s.setLiabilities);

  const netWorth = assets - liabilities;
  const total    = assets + liabilities;
  const assetPct = total > 0 ? (assets / total) * 100 : 50;
  const netColor = netWorth > 0 ? C_SUCCESS : netWorth < 0 ? C_ERROR : C_WARNING;

  const isEmpty = assets === 0 && liabilities === 0;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)" }}>
          Net Worth
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "2px 7px",
            borderRadius: 4,
            background: "rgba(47,36,133,0.07)",
            color: C_PRIMARY,
            border: `1px solid rgba(47,36,133,0.15)`,
          }}
        >
          Manual entry
        </span>
      </div>

      {/* Inputs row */}
      <div style={{ display: "flex", gap: 12 }}>
        <NetWorthInput label="Total Assets"      value={assets}      onChange={setAssets}      color={C_SUCCESS} />
        <NetWorthInput label="Total Liabilities" value={liabilities} onChange={setLiabilities} color={C_ERROR}   />

        {/* Net worth KPI */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)" }}>
            Net Worth
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: isEmpty ? "rgba(255,255,255,0.40)" : `${netColor}0d`,
              border: `1.5px solid ${isEmpty ? C_BORDER : `${netColor}30`}`,
              borderRadius: 8,
              padding: "9px 12px",
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: isEmpty ? "hsl(245 16% 65%)" : netColor,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {isEmpty ? "—" : fmt(netWorth)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown bar */}
      {!isEmpty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 8, borderRadius: 6, overflow: "hidden", display: "flex" }}>
            <div
              style={{
                width: `${assetPct}%`,
                background: C_SUCCESS,
                borderRadius: liabilities === 0 ? 6 : "6px 0 0 6px",
                transition: "width 0.4s ease",
              }}
            />
            <div
              style={{
                flex: 1,
                background: C_ERROR,
                borderRadius: assets === 0 ? 6 : "0 6px 6px 0",
                transition: "flex 0.4s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: C_SUCCESS, fontWeight: 600 }}>Assets {fmt(assets)}</span>
            <span style={{ color: C_ERROR, fontWeight: 600 }}>Liabilities {fmt(liabilities)}</span>
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {isEmpty && (
        <div style={{ fontSize: 11.5, color: "hsl(245 16% 58%)", lineHeight: 1.6 }}>
          Enter your total assets (savings, property, investments) and liabilities (loans, credit cards) to calculate your net worth.
        </div>
      )}
    </div>
  );
}
