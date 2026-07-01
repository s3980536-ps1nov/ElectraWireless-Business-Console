import { useState, useEffect } from "react";
import { SpreadsheetPage } from "@/pages/SpreadsheetPage";
import { BusinessConsoleDashboard } from "@/pages/BusinessConsoleDashboard";
import LoginScreen from "./LoginScreen";
import { useProjectionStore } from "@/store/projectionStore";
import type { AccountType } from "@/store/projectionStore";
import { useSpreadsheetStore } from "@/store/spreadsheetStore";
import { loadInvestmentOnboarding } from "@/services/investmentApi";
import { useInvestmentContextStore } from "@/store/investmentContextStore";

const GradientBg = () => (
  <div className="fixed inset-0 -z-10 bg-gradient-to-r from-[#D7D5F7] via-[#F9E1E7] to-[#F1E0F4]" />
);

export default function App() {
  const setAccountType    = useProjectionStore((s) => s.setAccountType);
  const accountType       = useProjectionStore((s) => s.accountType);
  const spreadsheetOpen   = useSpreadsheetStore((s) => s.isOpen);
  const activeTab         = useProjectionStore((s) => s.activeTab);
  const setAllInvestment  = useInvestmentContextStore((s) => s.setAll);

  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("ew-nav");
      if (saved) return JSON.parse(saved).loggedIn ?? false;
    } catch {}
    return false;
  });

  useEffect(() => {
    localStorage.setItem("ew-nav", JSON.stringify({ loggedIn, accountType }));
  }, [loggedIn, accountType]);

  useEffect(() => {
    if (!loggedIn) return;
    loadInvestmentOnboarding().then((profile) => {
      if (profile) setAllInvestment(profile);
    });
  }, [loggedIn]);

  const currentView = () => {
    if (!loggedIn) {
      return (
        <LoginScreen
          onSelect={(type: AccountType) => {
            setAccountType(type);
            setLoggedIn(true);
          }}
        />
      );
    }

    return <BusinessConsoleDashboard />;
  };

  const goHome = () => {
    setLoggedIn(false);
  };

  return (
    <>
      <GradientBg />
      {currentView()}
      {/* SpreadsheetPage overlay — suppressed when user is on the embedded Your Data tab */}
      {spreadsheetOpen && activeTab !== "your-data" && <SpreadsheetPage />}
      {loggedIn && (
        <button
          onClick={goHome}
          title="Go to Home"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "24px",
            zIndex: 9999,
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)";
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
            <polyline points="9 21 9 12 15 12 15 21" />
          </svg>
        </button>
      )}
    </>
  );
}
