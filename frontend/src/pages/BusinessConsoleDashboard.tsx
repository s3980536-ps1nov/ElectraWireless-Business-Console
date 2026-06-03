import { useState } from "react";
import { ConsoleTopBar } from "@/components/ConsoleTopBar";
import { ConsoleSidebar, type ConsoleTool } from "@/components/ConsoleSidebar";
import { ConsoleAISidebar } from "@/components/ConsoleAISidebar";
import { ProjectionPage } from "@/pages/ProjectionPage";
import { PersonalFinancePage } from "@/pages/PersonalFinancePage";
import { InvestmentPage } from "@/pages/InvestmentPage";
import { ConsoleHome } from "@/pages/ConsoleHome";
import ProfileSelector from "@/ProfileSelector";
import OnboardingFlow from "@/OnboardingFlow";
import InvestmentOnboardingFlow from "@/InvestmentOnboardingFlow";
import { useProjectionStore } from "@/store/projectionStore";
import { usePersonalFinanceStore } from "@/store/personalFinanceStore";
import { useInvestmentContextStore } from "@/store/investmentContextStore";
import { deleteAllHoldings, resetInvestmentOnboarding } from "@/services/investmentApi";
import { PROFILE_PRESETS, DEFAULT_PRESET } from "@/lib/profilePresets";
import type { ProfilePreset } from "@/lib/profilePresets";

type OnboardStage = "idle" | "profile-selector" | "onboarding-flow" | "investment-onboarding";

export function BusinessConsoleDashboard() {
  const [activeTool, setActiveTool]           = useState<ConsoleTool>("home");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [onboardStage, setOnboardStage]       = useState<OnboardStage>("idle");
  const [profilePreset, setProfilePreset]     = useState<ProfilePreset | null>(null);
  const [projectionOnboarded, setProjectionOnboarded] = useState(false);

  const accountType         = useProjectionStore((s) => s.accountType);
  const resetPF             = usePersonalFinanceStore((s) => s.reset);
  const investmentOnboarded = useInvestmentContextStore((s) => s.completedAt !== null);
  const resetInvestmentCtx  = useInvestmentContextStore((s) => s.reset);

  function handleOpenProjection() {
    setActiveTool("projection");
    if (!projectionOnboarded) {
      setOnboardStage("profile-selector");
    }
  }

  function handleOpenInvestment() {
    setActiveTool("investment");
    if (!investmentOnboarded) {
      setOnboardStage("investment-onboarding");
    }
  }

  async function handleResetInvestment() {
    if (!window.confirm("This will delete all holdings, snapshots, and market prices. Are you sure?")) return;

    // Local reset is independent of the backend — always re-trigger onboarding
    // so the user can recover even when the server is unreachable.
    resetInvestmentCtx();
    setOnboardStage("investment-onboarding");

    try {
      await Promise.all([
        deleteAllHoldings(),
        resetInvestmentOnboarding(),
      ]);
    } catch (err) {
      console.warn("Local reset succeeded but server-side state could not be fully cleared:", err);
    }
  }

  function renderMainContent() {
    if (activeTool === "home") {
      return (
        <ConsoleHome
          onOpenProjection={handleOpenProjection}
          onOpenPersonal={() => setActiveTool("personal")}
          onOpenInvestment={() => setActiveTool("investment")}
        />
      );
    }

    if (activeTool === "projection") {
      if (onboardStage === "profile-selector") {
        return (
          <ProfileSelector
            accountType={accountType ?? "user"}
            onSelect={(profileId) => {
              setProfilePreset(PROFILE_PRESETS[profileId] ?? DEFAULT_PRESET);
              setOnboardStage("onboarding-flow");
            }}
            onBack={() => {
              setOnboardStage("idle");
              setActiveTool("home");
            }}
          />
        );
      }

      if (onboardStage === "onboarding-flow") {
        return (
          <OnboardingFlow
            initialValues={profilePreset ?? DEFAULT_PRESET}
            onComplete={() => {
              setOnboardStage("idle");
              setProjectionOnboarded(true);
            }}
            onBack={() => {
              setProfilePreset(null);
              setOnboardStage("profile-selector");
            }}
          />
        );
      }

      return <ProjectionPage />;
    }

    if (activeTool === "personal") {
      return <PersonalFinancePage />;
    }

    if (activeTool === "investment") {
      if (onboardStage === "investment-onboarding") {
        return (
          <InvestmentOnboardingFlow
            onComplete={() => setOnboardStage("idle")}
            onBack={() => {
              setOnboardStage("idle");
              setActiveTool("home");
            }}
          />
        );
      }
      return <InvestmentPage />;
    }

    return null;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <ConsoleTopBar sidebarExpanded={sidebarExpanded} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <ConsoleSidebar
          activeTool={activeTool}
          onSelect={(tool) => {
            if (tool === "home") {
              resetPF();
              localStorage.removeItem("elly-pf-store");
            }
            if (tool === "projection") { handleOpenProjection(); return; }
            if (tool === "investment") { handleOpenInvestment(); return; }
            setActiveTool(tool);
          }}
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded((e) => !e)}
          onResetInvestment={handleResetInvestment}
        />

        <div className="flex-1 overflow-hidden min-w-0">
          {renderMainContent()}
        </div>

        {activeTool !== "investment" && <ConsoleAISidebar activeTool={activeTool} />}
      </div>
    </div>
  );
}
