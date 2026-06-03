import { Home, BarChart2, Wallet, TrendingUp, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConsoleTool = "home" | "projection" | "personal" | "investment";

interface NavItem {
  tool: ConsoleTool;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}

const HOME_ITEM: NavItem = {
  tool: "home",
  label: "Home",
  sublabel: "Dashboard",
  icon: <Home size={18} />,
};

const TOOL_ITEMS: NavItem[] = [
  {
    tool: "projection",
    label: "Financial",
    sublabel: "Projections",
    icon: <BarChart2 size={18} />,
  },
  {
    tool: "personal",
    label: "Personal",
    sublabel: "Finance",
    icon: <Wallet size={18} />,
  },
  {
    tool: "investment",
    label: "Investment",
    sublabel: "Intelligence",
    icon: <TrendingUp size={18} />,
  },
];

interface SidebarNavButtonProps {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
  onClick: () => void;
}

function SidebarNavButton({ item, isActive, expanded, onClick }: SidebarNavButtonProps) {
  const { label, sublabel, icon } = item;
  return (
    <button
      onClick={onClick}
      title={!expanded ? `${label} ${sublabel}`.trim() : undefined}
      className={cn(
        "flex items-center border-none rounded-[9px] cursor-pointer w-full text-left transition-all duration-150 whitespace-nowrap overflow-hidden outline outline-[1.5px]",
        expanded ? "gap-2.5 justify-start py-[9px] px-2.5" : "gap-0 justify-center py-[11px] px-0",
        isActive
          ? "bg-primary/10 text-primary outline-primary/[0.18]"
          : "bg-transparent text-[hsl(247_16%_44%)] outline-transparent hover:bg-primary/[0.05] hover:text-[hsl(247_20%_30%)]"
      )}
    >
      {expanded && (
        <div
          className={cn(
            "w-[3px] h-7 rounded-sm flex-shrink-0 transition-colors duration-150",
            isActive ? "bg-primary" : "bg-transparent"
          )}
        />
      )}
      <span className={cn("flex flex-shrink-0", isActive ? "text-primary" : "")}>
        {icon}
      </span>
      {expanded && (
        <div className="leading-[1.25] min-w-0 overflow-hidden">
          <div className={cn("text-[11.5px] tracking-[0.01em]", isActive ? "font-bold" : "font-medium")}>
            {label}
          </div>
          <div className="text-[10.5px] font-normal opacity-[0.72] mt-px">
            {sublabel}
          </div>
        </div>
      )}
    </button>
  );
}

interface ConsoleSidebarProps {
  activeTool: ConsoleTool;
  onSelect: (tool: ConsoleTool) => void;
  expanded: boolean;
  onToggle: () => void;
  onResetInvestment?: () => void;
}

export function ConsoleSidebar({ activeTool, onSelect, expanded, onToggle, onResetInvestment }: ConsoleSidebarProps) {
  return (
    <div
      className={cn(
        "flex-shrink-0 h-full flex flex-col bg-white/[0.28] backdrop-blur-[20px] border-r-[1.5px] border-border overflow-hidden z-10",
        "transition-[width] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        expanded ? "w-[200px]" : "w-[56px]"
      )}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "flex items-center h-10 border-none bg-transparent cursor-pointer text-[hsl(247_20%_58%)] flex-shrink-0 border-b border-primary/[0.08] w-full transition-colors duration-150 hover:text-primary",
          expanded ? "justify-end px-3.5" : "justify-center"
        )}
      >
        {expanded ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
        <SidebarNavButton
          item={HOME_ITEM}
          isActive={activeTool === HOME_ITEM.tool}
          expanded={expanded}
          onClick={() => onSelect(HOME_ITEM.tool)}
        />

        {expanded && (
          <div className="text-[9.5px] font-bold tracking-[0.10em] uppercase text-[hsl(247_20%_62%)] px-2.5 mb-1.5 mt-2 whitespace-nowrap">
            Tools
          </div>
        )}

        {TOOL_ITEMS.map((item) => (
          <SidebarNavButton
            key={item.tool}
            item={item}
            isActive={activeTool === item.tool}
            expanded={expanded}
            onClick={() => onSelect(item.tool)}
          />
        ))}

        {activeTool === "investment" && onResetInvestment && (
          <div className={expanded ? "mt-2 px-0" : "mt-2"}>
            {expanded && (
              <div className="text-[9.5px] font-bold tracking-[0.10em] uppercase text-[hsl(247_20%_62%)] px-2.5 mb-1.5 whitespace-nowrap">
                Danger Zone
              </div>
            )}
            <button
              onClick={onResetInvestment}
              title="Reset all investment data"
              className={cn(
                "flex items-center border-none rounded-[9px] cursor-pointer w-full text-left transition-all duration-150 whitespace-nowrap overflow-hidden outline outline-[1.5px]",
                "bg-transparent text-red-400 outline-transparent hover:bg-red-50 hover:text-red-600",
                expanded ? "gap-2.5 justify-start py-[9px] px-2.5" : "gap-0 justify-center py-[11px] px-0"
              )}
            >
              {expanded && <div className="w-[3px] h-7 rounded-sm flex-shrink-0 bg-transparent" />}
              <span className="flex flex-shrink-0"><Trash2 size={18} /></span>
              {expanded && (
                <div className="leading-[1.25] min-w-0 overflow-hidden">
                  <div className="text-[11.5px] tracking-[0.01em] font-medium">Reset All</div>
                  <div className="text-[10.5px] font-normal opacity-[0.72] mt-px">Investment Data</div>
                </div>
              )}
            </button>
          </div>
        )}

      </nav>

      {/* Footer */}
      {expanded && (
        <div className="px-5 py-3 border-t border-primary/[0.08] text-[9.5px] text-[hsl(247_10%_66%)] tracking-[0.03em] whitespace-nowrap overflow-hidden">
          ElectraWireless © 2026
        </div>
      )}
    </div>
  );
}
