import { useState } from "react";
import { usePersonalFinanceStore } from "@/store/personalFinanceStore";
import { PERIODS } from "@/lib/periodFilter";
import { BankStatementModal } from "@/components/pf/BankStatementModal";
import { TransactionFormModal } from "@/components/pf/TransactionFormModal";
import { CategoryReviewTable } from "@/components/pf/CategoryReviewTable";
import { BudgetPanel } from "@/components/pf/BudgetPanel";
import { PFInsightsPanel } from "@/components/pf/PFInsightsPanel";
import { GoalsTab } from "@/components/pf/GoalsTab";
import { OverviewTab } from "@/components/pf/OverviewTab";
import { CashFlowTab } from "@/components/pf/CashFlowTab";
import { TransactionsTab } from "@/components/pf/TransactionsTab";
import { C_PRIMARY, C_BORDER } from "@/lib/colors";

const TABS = [
  { key: "overview",      label: "Overview" },
  { key: "transactions",  label: "Transactions" },
  { key: "budgets",       label: "Budgets" },
  { key: "cashflow",      label: "Cash Flow" },
  { key: "insights",      label: "Insights" },
  { key: "goals",         label: "Goals" },
];


// ── Empty state landing screen ────────────────────────────────────────────────

function EmptyState({
  onImport,
  onAddManual,
  onDemo,
}: {
  onImport: () => void;
  onAddManual: () => void;
  onDemo: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          border: "2px solid rgba(255,255,255,0.70)",
          borderRadius: 24,
          boxShadow: "0 8px 48px rgba(120,100,180,0.12)",
          padding: "52px 56px",
          maxWidth: 560,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 0,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(47,36,133,0.08)",
            border: "1.5px solid rgba(47,36,133,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C_PRIMARY} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: "hsl(242 44% 28%)", marginBottom: 10 }}>
          No financial data yet
        </div>
        <div style={{ fontSize: 13.5, color: "hsl(245 16% 49%)", lineHeight: 1.7, marginBottom: 36, maxWidth: 380 }}>
          Import your bank statement to automatically categorise transactions, or add them one by one manually.
        </div>

        {/* Primary CTAs */}
        <div style={{ display: "flex", gap: 12, width: "100%", marginBottom: 16 }}>
          <button
            onClick={onImport}
            style={{
              flex: 1,
              background: C_PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "13px 20px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              letterSpacing: "0.02em",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload Bank Statement (CSV)
          </button>

          <button
            onClick={onAddManual}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.80)",
              color: C_PRIMARY,
              border: `1.5px solid rgba(47,36,133,0.30)`,
              borderRadius: 10,
              padding: "13px 20px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              letterSpacing: "0.02em",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Add Transaction Manually
          </button>
        </div>

        {/* Demo data shortcut */}
        <button
          onClick={onDemo}
          style={{
            background: "none",
            border: "none",
            fontSize: 12,
            color: "hsl(245 16% 55%)",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Or load demo data to explore the dashboard
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PersonalFinancePage() {
  const flowStep        = usePersonalFinanceStore((s) => s.flowStep);
  const activeTab       = usePersonalFinanceStore((s) => s.activeTab);
  const setActiveTab    = usePersonalFinanceStore((s) => s.setActiveTab);
  const loadDemoData    = usePersonalFinanceStore((s) => s.loadDemoData);
  const transactions    = usePersonalFinanceStore((s) => s.transactions);
  const reset           = usePersonalFinanceStore((s) => s.reset);
  const activePeriod    = usePersonalFinanceStore((s) => s.activePeriod);
  const setActivePeriod = usePersonalFinanceStore((s) => s.setActivePeriod);

  const [showImport,    setShowImport]   = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);

  function renderContent() {
    if (flowStep === "empty") {
      return (
        <EmptyState
          onImport={() => setShowImport(true)}
          onAddManual={() => setShowAddManual(true)}
          onDemo={loadDemoData}
        />
      );
    }

    if (flowStep === "review") {
      return (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <CategoryReviewTable />
        </div>
      );
    }

    // dashboard — tabbed view
    return (
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: `1.5px solid ${C_BORDER}`,
            background: "rgba(255,255,255,0.30)",
            backdropFilter: "blur(12px)",
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflowY: "auto",
          }}
        >
          {/* Transaction count chip */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(247 20% 55%)" }}>
              Data Sources
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 20,
                background: "rgba(47,36,133,0.10)",
                color: C_PRIMARY,
                border: "1px solid rgba(47,36,133,0.18)",
              }}
            >
              {transactions.length} txn{transactions.length !== 1 ? "s" : ""}
            </span>
          </div>

          <button
            onClick={() => setShowImport(true)}
            style={{
              background: C_PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            ↑ Import Bank Statement
          </button>

          <button
            onClick={() => setShowAddManual(true)}
            style={{
              background: "transparent",
              border: `1.5px solid ${C_BORDER}`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: "hsl(247 57% 33%)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            + Add Transaction
          </button>

          {/* Period selector */}
          <div style={{ marginTop: 8, borderTop: `1px solid hsl(244 25% 85%)`, paddingTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(247 20% 55%)", marginBottom: 10 }}>
              Period
            </div>
            {PERIODS.map((period) => {
              const isActive = activePeriod === period;
              return (
                <button
                  key={period}
                  onClick={() => setActivePeriod(period)}
                  style={{
                    display: "block",
                    width: "100%",
                    background: isActive ? "rgba(47,36,133,0.08)" : "transparent",
                    border: "none",
                    textAlign: "left",
                    padding: "6px 8px",
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? C_PRIMARY : "hsl(247 30% 45%)",
                    cursor: "pointer",
                    borderRadius: 6,
                    transition: "all 0.12s",
                  }}
                >
                  {isActive && <span style={{ marginRight: 4 }}>›</span>}
                  {period}
                </button>
              );
            })}
          </div>

          {/* Start over */}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid hsl(244 25% 88%)` }}>
            <button
              onClick={() => {
                if (window.confirm("Clear all data and start over?")) reset();
              }}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: "hsl(245 16% 60%)",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                padding: 0,
              }}
            >
              ← Start over
            </button>
          </div>
        </div>

        {/* Tab content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {activeTab === "overview"     && <OverviewTab />}
          {activeTab === "transactions" && <TransactionsTab />}
          {activeTab === "budgets"      && <BudgetPanel />}
          {activeTab === "cashflow"     && <CashFlowTab />}
          {activeTab === "insights"     && <PFInsightsPanel />}
          {activeTab === "goals"        && <GoalsTab />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 border-b border-border bg-white/40 backdrop-blur-md flex-shrink-0 relative z-50">
        {/* Tabs — only show when on dashboard */}
        {flowStep === "dashboard" && (
          <div className="flex gap-0 items-center">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    "bg-transparent border-none text-[12.5px] px-[18px] py-2.5 cursor-pointer tracking-[0.03em] transition-all duration-150 border-b-2 -mb-px",
                    isActive
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-muted-foreground font-normal hover:text-foreground/80",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Empty / review step minimal header */}
        {flowStep !== "dashboard" && (
          <div className="flex items-center py-2.5 gap-2">
            <span className="text-[12.5px] font-semibold text-primary">Personal Finance</span>
            {flowStep === "review" && (
              <span className="text-[11px] text-muted-foreground">
                — Step 2 of 2: review &amp; confirm transactions
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {/* Modals */}
      {showImport    && <BankStatementModal    onClose={() => setShowImport(false)} />}
      {showAddManual && <TransactionFormModal  onClose={() => setShowAddManual(false)} />}
    </div>
  );
}
