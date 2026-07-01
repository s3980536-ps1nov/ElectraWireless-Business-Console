import { useState, useRef, useEffect } from "react";
import { useProjectionStore } from "@/store/projectionStore";
import { InputPanel } from "@/components/InputPanel";
import { OutputPanel } from "@/components/OutputPanel";
import { FinancialSummaryBar } from "@/components/FinancialSummaryBar";
import { SectorScreens, type SectorId } from "@/components/SectorScreens";
import { useProphetSync } from "@/hooks/useProphetSync";
import { SpreadsheetPage } from "@/pages/SpreadsheetPage";

const ALL_TABS = [
  { key: "projection", label: "Projection" },
  { key: "pl",         label: "P&L Forecast" },
  { key: "scenarios",  label: "Scenarios" },
  { key: "runway",     label: "Cash Runway" },
  { key: "sensitivity",label: "Sensitivity" },
  { key: "valuation",  label: "Valuation" },
  { key: "summary",    label: "Summary" },
  { key: "documents",  label: "Documents" },
  { key: "your-data",  label: "Your Data" },
];

// Tabs hidden by default for user accounts
const USER_RESTRICTED_TABS = new Set(["scenarios", "sensitivity", "valuation"]);

export function ProjectionPage({ onReset }: { onReset?: () => void } = {}) {
  const { activeTab, setActiveTab, accountType, reset } = useProjectionStore();
  useProphetSync();

  const [activeSector, setActiveSector] = useState<SectorId | null>(null);
  const [addedTabs, setAddedTabs] = useState<Set<string>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close add-menu when clicking outside
  useEffect(() => {
    if (!showAddMenu) return;
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddMenu]);

  const isUserAccount = accountType === "user";

  // Tabs visible in the nav row
  const visibleTabs = isUserAccount
    ? ALL_TABS.filter((t) => !USER_RESTRICTED_TABS.has(t.key) || addedTabs.has(t.key))
    : ALL_TABS;

  // Tabs available to add via the '+' button
  const addableTabs = ALL_TABS.filter(
    (t) => USER_RESTRICTED_TABS.has(t.key) && !addedTabs.has(t.key)
  );

  function handleAddTab(key: string) {
    setAddedTabs((prev) => new Set([...prev, key]));
    setShowAddMenu(false);
    setActiveTab(key);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 border-b border-border bg-white/40 backdrop-blur-md flex-shrink-0 relative z-50">

        {/* Tab Row + Sectors dropdown in one line */}
        <div className="flex gap-0 items-center">
          {visibleTabs.map((tab) => {
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

          {/* Add tool button — only shown for user accounts with remaining addable tabs */}
          {isUserAccount && addableTabs.length > 0 && (
            <div className="relative ml-1" ref={addMenuRef}>
              <button
                onClick={() => setShowAddMenu((v) => !v)}
                title="Add tool"
                className={[
                  "flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-all duration-150 border",
                  showAddMenu
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/60 hover:text-primary",
                ].join(" ")}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
              </button>

              {showAddMenu && (
                <div className="absolute top-[calc(100%+6px)] left-0 bg-white/95 backdrop-blur-md border border-border rounded-[8px] overflow-hidden z-[200] min-w-[160px] shadow-[0_8px_24px_rgba(47,36,133,0.12)]">
                  <p className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase px-3.5 pt-2.5 pb-1">
                    Add tool
                  </p>
                  {addableTabs.map((tab, i) => (
                    <button
                      key={tab.key}
                      onClick={() => handleAddTab(tab.key)}
                      className={[
                        "block w-full text-left text-xs px-3.5 py-2 cursor-pointer transition-colors duration-100 text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                        i < addableTabs.length - 1 ? "border-b border-border/50" : "pb-2.5",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Clear all data */}
          <button
            onClick={() => {
              if (!window.confirm("Clear all Financial Projections data? This resets your sliders, saved scenarios, and will restart onboarding.")) return;
              reset();
              onReset?.();
            }}
            className="flex items-center gap-1.5 ml-3 px-3 py-1.5 text-[11px] font-semibold text-destructive bg-destructive/[0.07] border border-destructive/[0.25] rounded-lg cursor-pointer transition-all duration-150 hover:bg-destructive/[0.14] hover:border-destructive/[0.50] whitespace-nowrap flex-shrink-0"
          >
            Clear Data
          </button>

          {/* Dashboard button — shown when a sector screen is active */}
          {activeSector && (
            <button
              onClick={() => setActiveSector(null)}
              className="flex items-center gap-1.5 ml-3 px-3.5 py-1.5 text-[12px] font-semibold text-primary bg-primary/[0.10] border border-primary/[0.35] rounded-lg cursor-pointer transition-all duration-150 hover:bg-primary/[0.18] hover:border-primary/[0.60] whitespace-nowrap flex-shrink-0"
            >
              ← Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === "your-data" ? (
          <SpreadsheetPage mode="embedded" />
        ) : (
          <>
            <InputPanel
              onSensitivityClick={() => setActiveTab("sensitivity")}
              activeSector={activeSector}
              setActiveSector={setActiveSector}
            />
            <div className="flex flex-col flex-1 overflow-hidden">
              <FinancialSummaryBar />
              {activeSector ? (
                <SectorScreens activeSector={activeSector} onBack={() => setActiveSector(null)} />
              ) : (
                <OutputPanel activeTab={activeTab} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
