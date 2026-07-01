import { useState, useRef, useCallback } from "react";
import { C_SUCCESS, C_ERROR, C_PRIMARY, C_BORDER } from "@/lib/colors";
import { useSpreadsheetStore } from "@/store/spreadsheetStore";
import { parseWorkbook } from "@/lib/importUtils";
import type { ExtractedValues } from "@/lib/importUtils";

interface ImportFinancialDataStepProps {
  onBack: () => void;
  onSkip: () => void;
  onApply: (extracted: ExtractedValues) => void;
}

export default function ImportFinancialDataStep({ onBack, onSkip, onApply }: ImportFinancialDataStepProps) {
  const openWorkbook = useSpreadsheetStore((s) => s.openWorkbook);
  const [isDragging, setIsDragging]   = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [file, setFile]               = useState<File | null>(null);
  const [parseError, setParseError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setParseError(null);
    setIsLoading(true);
    try {
      const wb = await parseWorkbook(f);
      // Open full-screen spreadsheet; when user clicks Apply, advance onboarding
      openWorkbook(wb, (values) => onApply(values));
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [openWorkbook, onApply]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  return (
    <div>
      {/* Step header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground font-extrabold text-xs flex items-center justify-center flex-shrink-0">
            1
          </div>
          <span className="text-muted-foreground text-xs tracking-widest uppercase">
            Step 1 of 3
          </span>
        </div>
        <h2 className="text-foreground text-2xl font-extrabold tracking-tight mb-1">
          Import Financial Data
        </h2>
        <p className="text-muted-foreground text-sm">
          Upload your spreadsheet — it'll open in a full editor so you can review and edit before applying.
        </p>
      </div>

      {/* How it works */}
      <div
        className="rounded-xl px-4 py-3.5 mb-5"
        style={{ backgroundColor: "rgba(47,36,133,0.05)", border: "1px solid rgba(47,36,133,0.12)" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "hsl(245 16% 49%)" }}>
          How it works
        </p>
        <ol className="flex flex-col gap-1.5">
          {[
            { step: "Upload",  desc: "Select a .csv or .xlsx file — all sheets load automatically." },
            { step: "Review",  desc: "A full spreadsheet editor opens. Edit cells, view formulas." },
            { step: "Apply",   desc: "Click \"Apply to Dashboard\" to proceed to the setup sliders." },
          ].map(({ step, desc }, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className="mt-0.5 flex-shrink-0 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: "rgba(47,36,133,0.15)", color: "hsl(245 57% 33%)" }}
              >
                {i + 1}
              </span>
              <span>
                <span className="font-semibold" style={{ color: "hsl(245 57% 33%)" }}>{step}:</span>{" "}
                <span className="text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? C_PRIMARY : file && !parseError ? C_SUCCESS : C_BORDER}`,
          borderRadius: "12px",
          padding: "36px 20px",
          textAlign: "center",
          cursor: "pointer",
          backgroundColor: isDragging ? "rgba(47,36,133,0.07)" : file && !parseError ? "rgba(29,158,117,0.05)" : "rgba(255,255,255,0.50)",
          transition: "all 0.15s",
          marginBottom: "12px",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Parsing file…</p>
        ) : file && !parseError ? (
          <>
            <p className="text-sm font-semibold" style={{ color: C_SUCCESS }}>✓ {file.name}</p>
            <p className="text-xs text-muted-foreground mt-1">Opening editor…</p>
          </>
        ) : (
          <>
            <div className="text-3xl opacity-25 mb-2">⊞</div>
            <p className="text-sm font-medium text-muted-foreground">Drag & drop or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">.csv or .xlsx — all sheets loaded automatically</p>
          </>
        )}
      </div>

      {parseError && (
        <div
          className="rounded-lg px-3.5 py-2.5 text-xs mb-4"
          style={{ backgroundColor: `${C_ERROR}1a`, border: `1px solid ${C_ERROR}44`, color: C_ERROR }}
        >
          {parseError}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={onBack}
          className="bg-transparent border border-border text-muted-foreground rounded-lg px-5 py-2.5 text-sm font-medium hover:border-muted-foreground transition-colors duration-150 font-sans"
        >
          ← Back
        </button>
        <button
          onClick={onSkip}
          className="bg-transparent border border-border text-muted-foreground rounded-lg px-5 py-2.5 text-sm font-medium hover:border-muted-foreground transition-colors duration-150 font-sans"
        >
          Skip importing data
        </button>
      </div>
    </div>
  );
}
