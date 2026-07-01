import * as XLSX from "xlsx";
import Papa from "papaparse";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataStandard = "standard-csv" | "pl-statement" | "superstore" | "custom";
export type WizardStep = "standard" | "upload" | "confirm";

export interface ParsedData {
  headers: string[];
  rows: (string | number | null)[][];
  /** Formula strings (with leading =) for each cell, parallel to rows. Undefined for non-XLSX or cells with no formula. */
  formulas?: (string | null)[][];
}

/** Per-cell visual style extracted from an Excel file. All fields optional — only set when non-default. */
export interface CellStyle {
  bgColor?: string;    // CSS hex e.g. "#FFEB9C"
  fontColor?: string;  // CSS hex
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;   // pt
  numFmt?: string;     // Excel number format string e.g. "0.00%", "$#,##0"
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
  hAlign?: "left" | "center" | "right";
  wrapText?: boolean;
}

/** A merged cell range (0-indexed, relative to the sheet's used range). */
export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** One sheet inside a workbook — all rows preserved (row 0 is typically the header row) */
export interface SheetData {
  name: string;
  rows: (string | number | null)[][];
  formulas: (string | null)[][];
  /** Per-cell styles, parallel to rows. null means no explicit style. */
  styles: (CellStyle | null)[][];
  /** Merged cell regions for this sheet. */
  merges: MergeRange[];
  /** Column widths in Excel character units (wch). undefined = use default. */
  colWidths: (number | undefined)[];
}

/** Full workbook returned by parseWorkbook */
export interface WorkbookData {
  fileName: string;
  sheets: SheetData[];
}

export interface ExtractedValues {
  startingMRR?: number;
  growthRate?: number;
  cogsPercent?: number;
  marketingSpend?: number;
  payroll?: number;
}

export interface ColumnMapping {
  date: string;
  revenue: string;
  cogs: string;
  marketing: string;
  payroll: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const STANDARDS: { id: DataStandard; title: string; description: string; hint: string }[] = [
  {
    id: "standard-csv",
    title: "Standard CSV",
    description: "Two-column format: date and revenue",
    hint: "e.g. 2024-01, 18000",
  },
  {
    id: "pl-statement",
    title: "P&L Statement",
    description: "JP Morgan-style: rows = line items, columns = months",
    hint: "Revenue, COGS, Marketing, Payroll rows",
  },
  {
    id: "superstore",
    title: "Superstore / Retail",
    description: "Order Date, Sales, Profit columns",
    hint: "Aggregated by month automatically",
  },
  {
    id: "custom",
    title: "Custom",
    description: "Map your own column names manually",
    hint: "Full control over column mapping",
  },
];

export const SLIDER_RANGES = {
  startingMRR:    { min: 1000,  max: 100000, step: 1000 },
  growthRate:     { min: 0,     max: 30,     step: 1    },
  cogsPercent:    { min: 5,     max: 60,     step: 1    },
  marketingSpend: { min: 500,   max: 30000,  step: 500  },
  payroll:        { min: 5000,  max: 150000, step: 5000 },
};

export const FIELD_LABELS: Record<keyof ExtractedValues, string> = {
  startingMRR:    "Starting MRR",
  growthRate:     "Growth Rate",
  cogsPercent:    "COGS %",
  marketingSpend: "Marketing Spend",
  payroll:        "Payroll",
};

export const ORDERED_FIELDS = [
  "startingMRR",
  "growthRate",
  "cogsPercent",
  "marketingSpend",
  "payroll",
] as const;

// ── Utilities ─────────────────────────────────────────────────────────────────

export function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

export function parseFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const raw = results.data as (string | number | null)[][];
          if (raw.length < 2) { reject(new Error("File appears empty or has only one row.")); return; }
          // Skip preamble lines (e.g. CBA/ANZ bank metadata before the real header row)
          // by finding the first row that has the widest column count.
          const maxCols = Math.max(...raw.map((r) => r.length));
          const headerIdx = maxCols > 1 ? raw.findIndex((r) => r.length === maxCols) : 0;
          const headers = raw[headerIdx].map((h) => String(h ?? "").trim());
          resolve({ headers, rows: raw.slice(headerIdx + 1) });
        },
        error: (err: Error) => reject(err),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result as ArrayBuffer, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const ref = ws["!ref"];
          if (!ref) { reject(new Error("Spreadsheet appears empty.")); return; }

          const range = XLSX.utils.decode_range(ref);
          const allRows: (string | number | null)[][] = [];
          const allFormulas: (string | null)[][] = [];

          for (let r = range.s.r; r <= range.e.r; r++) {
            const row: (string | number | null)[] = [];
            const formulaRow: (string | null)[] = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
              const cell = ws[XLSX.utils.encode_cell({ r, c })];
              row.push(cell ? (cell.v ?? null) : null);
              formulaRow.push(cell?.f ? `=${cell.f}` : null);
            }
            allRows.push(row);
            allFormulas.push(formulaRow);
          }

          if (allRows.length < 2) { reject(new Error("Spreadsheet appears empty.")); return; }
          const headers = allRows[0].map((h) => String(h ?? "").trim());
          resolve({ headers, rows: allRows.slice(1), formulas: allFormulas.slice(1) });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error("Unsupported file type. Please upload a .csv or .xlsx file."));
    }
  });
}

export function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%\s]/g, ""));
  return isNaN(n) ? null : n;
}

export function avgGrowthRate(values: number[]): number | null {
  if (values.length < 2) return null;
  const rates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      rates.push(((values[i] - values[i - 1]) / values[i - 1]) * 100);
    }
  }
  if (rates.length === 0) return null;
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}

// ── Extraction by standard ────────────────────────────────────────────────────

export function extractStandardCSV(data: ParsedData): ExtractedValues {
  const hi = (patterns: RegExp[]) =>
    data.headers.findIndex((h) => patterns.some((p) => p.test(h)));

  const revIdx = hi([/revenue/i, /\bsales\b/i, /\bmrr\b/i, /\barr\b/i, /income/i, /amount/i]);
  if (revIdx < 0) return {};

  const revenues = data.rows
    .map((r) => toNum(r[revIdx]))
    .filter((v): v is number => v !== null && v > 0);

  if (revenues.length === 0) return {};

  const gr = avgGrowthRate(revenues);
  return {
    startingMRR: revenues[0],
    ...(gr !== null ? { growthRate: clamp(0, 30, Math.round(gr)) } : {}),
  };
}

export function extractPLStatement(data: ParsedData): ExtractedValues {
  const findRow = (patterns: RegExp[]) =>
    data.rows.find((r) => patterns.some((p) => p.test(String(r[0] ?? ""))));

  const monthValues = (row: (string | number | null)[]) =>
    row.slice(1).map(toNum).filter((v): v is number => v !== null);

  const revenueRow = findRow([/revenue/i, /\bsales\b/i, /total revenue/i, /\bincome\b/i]);
  const cogsRow    = findRow([/cogs/i, /cost of goods/i, /cost of sales/i]);
  const mktRow     = findRow([/marketing/i, /advertising/i, /\bads\b/i]);
  const payRow     = findRow([/payroll/i, /salary/i, /salaries/i, /wages/i, /\bstaff\b/i]);

  const result: ExtractedValues = {};

  if (revenueRow) {
    const revs = monthValues(revenueRow);
    if (revs.length > 0) {
      result.startingMRR = revs[0];
      const gr = avgGrowthRate(revs);
      if (gr !== null) result.growthRate = clamp(0, 30, Math.round(gr));

      if (cogsRow) {
        const cogs = monthValues(cogsRow);
        const pcts = revs
          .map((r, i) => (r > 0 && cogs[i] != null ? (cogs[i] / r) * 100 : null))
          .filter((v): v is number => v !== null);
        if (pcts.length > 0) {
          result.cogsPercent = clamp(5, 60, Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length));
        }
      }
    }
  }

  if (mktRow) {
    const vals = monthValues(mktRow);
    if (vals.length > 0) {
      result.marketingSpend = clamp(500, 30000, Math.round(vals.reduce((s, v) => s + v, 0) / vals.length / 500) * 500);
    }
  }

  if (payRow) {
    const vals = monthValues(payRow);
    if (vals.length > 0) {
      result.payroll = clamp(5000, 150000, Math.round(vals.reduce((s, v) => s + v, 0) / vals.length / 5000) * 5000);
    }
  }

  return result;
}

export function extractSuperstore(data: ParsedData): ExtractedValues {
  const hi = (patterns: RegExp[]) =>
    data.headers.findIndex((h) => patterns.some((p) => p.test(h)));

  const dateIdx  = hi([/order.?date/i, /\bdate\b/i, /\bmonth\b/i, /\bperiod\b/i]);
  const salesIdx = hi([/\bsales\b/i, /revenue/i, /amount/i]);
  if (dateIdx < 0 || salesIdx < 0) return {};

  const byMonth: Record<string, number> = {};
  data.rows.forEach((row) => {
    const raw = String(row[dateIdx] ?? "");
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const sale = toNum(row[salesIdx]);
    if (sale !== null) byMonth[key] = (byMonth[key] ?? 0) + sale;
  });

  const revenues = Object.keys(byMonth).sort().map((k) => byMonth[k]);
  if (revenues.length === 0) return {};

  const gr = avgGrowthRate(revenues);
  return {
    startingMRR: revenues[0],
    ...(gr !== null ? { growthRate: clamp(0, 30, Math.round(gr)) } : {}),
  };
}

export function extractCustom(data: ParsedData, mapping: ColumnMapping): ExtractedValues {
  const colIdx = (name: string) => data.headers.indexOf(name);
  const getColValues = (name: string): number[] => {
    if (!name) return [];
    const idx = colIdx(name);
    if (idx < 0) return [];
    return data.rows.map((r) => toNum(r[idx])).filter((v): v is number => v !== null && v >= 0);
  };

  const revVals  = getColValues(mapping.revenue);
  const cogsVals = getColValues(mapping.cogs);
  const mktVals  = getColValues(mapping.marketing);
  const payVals  = getColValues(mapping.payroll);

  const result: ExtractedValues = {};

  if (revVals.length > 0) {
    result.startingMRR = clamp(1000, 100000, revVals[0]);
    const gr = avgGrowthRate(revVals);
    if (gr !== null) result.growthRate = clamp(0, 30, Math.round(gr));
  }

  if (cogsVals.length > 0 && revVals.length > 0) {
    const pcts = revVals
      .map((r, i) => (r > 0 && cogsVals[i] != null ? (cogsVals[i] / r) * 100 : null))
      .filter((v): v is number => v !== null);
    if (pcts.length > 0) {
      result.cogsPercent = clamp(5, 60, Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length));
    }
  }

  if (mktVals.length > 0) {
    result.marketingSpend = clamp(500, 30000, Math.round(mktVals.reduce((s, v) => s + v, 0) / mktVals.length / 500) * 500);
  }

  if (payVals.length > 0) {
    result.payroll = clamp(5000, 150000, Math.round(payVals.reduce((s, v) => s + v, 0) / payVals.length / 5000) * 5000);
  }

  return result;
}

// ── Theme colour resolution ───────────────────────────────────────────────────

/**
 * Fallback Office theme palette used when the theme XML cannot be parsed.
 * Index matches Excel's theme colour slot (dk1, lt1, dk2, lt2, accent1–6, hlink, folHlink).
 */
const OFFICE_DEFAULT_THEME: string[] = [
  "#000000", "#FFFFFF", "#44546A", "#E7E6E6",
  "#4472C4", "#ED7D31", "#A9D18E", "#FFC000",
  "#4BACC6", "#70AD47", "#0563C1", "#954F72",
];

/**
 * Parse the clrScheme colours out of xl/theme/theme1.xml.
 * Each colour is either a sysClr (use lastClr) or srgbClr (use val).
 * Returns a 12-element array of #RRGGBB strings.
 */
function parseThemeColors(xml: string): string[] {
  const tags = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  return tags.map((tag, i) => {
    const sysMatch  = xml.match(new RegExp(`<a:${tag}[^>]*>[^<]*<a:sysClr[^>]+lastClr="([0-9a-fA-F]{6})"`, "i"));
    const srgbMatch = xml.match(new RegExp(`<a:${tag}[^>]*>[^<]*<a:srgbClr[^>]+val="([0-9a-fA-F]{6})"`, "i"));
    const hex = sysMatch?.[1] ?? srgbMatch?.[1];
    return hex ? `#${hex}` : OFFICE_DEFAULT_THEME[i];
  });
}

/**
 * Extract theme colours from the workbook's raw file bundle.
 * SheetJS exposes raw files when bookFiles:true is passed to XLSX.read().
 */
function extractThemeColors(wb: XLSX.WorkBook): string[] {
  try {
    const files = (wb as Record<string, any>).Files as Record<string, Uint8Array> | undefined;
    if (!files) return OFFICE_DEFAULT_THEME;
    const key = Object.keys(files).find(k => /xl\/theme\/theme\d*\.xml$/i.test(k));
    if (!key) return OFFICE_DEFAULT_THEME;
    return parseThemeColors(new TextDecoder().decode(files[key]));
  } catch {
    return OFFICE_DEFAULT_THEME;
  }
}

/**
 * Apply an Excel tint value to a base hex colour.
 * Positive tint → blend towards white. Negative tint → blend towards black.
 */
function applyTint(hex: string, tint: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  let nr: number, ng: number, nb: number;
  if (tint < 0) {
    nr = r * (1 + tint); ng = g * (1 + tint); nb = b * (1 + tint);
  } else {
    nr = r + (255 - r) * tint; ng = g + (255 - g) * tint; nb = b + (255 - b) * tint;
  }
  return `#${clamp(nr).toString(16).padStart(2, "0")}${clamp(ng).toString(16).padStart(2, "0")}${clamp(nb).toString(16).padStart(2, "0")}`;
}

/**
 * Resolve a SheetJS colour descriptor to a CSS #RRGGBB string.
 * Handles both explicit rgb values and theme+tint references.
 */
function xlsxColorToCss(
  color: { rgb?: string; theme?: number; tint?: number } | undefined,
  themeColors: string[],
): string | undefined {
  if (!color) return undefined;

  if (color.rgb) {
    const rgb = color.rgb;
    const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  }

  if (color.theme !== undefined) {
    const base = themeColors[color.theme];
    if (!base) return undefined;
    return color.tint ? applyTint(base, color.tint) : base;
  }

  return undefined;
}

// ── Style extraction ──────────────────────────────────────────────────────────

/** Extract a CellStyle from a SheetJS cell's .s property. Returns null if no meaningful style. */
function extractCellStyle(s: Record<string, any> | undefined, themeColors: string[]): CellStyle | null {
  if (!s) return null;
  const style: CellStyle = {};

  // SheetJS flattens fill props onto the style object directly (patternType, fgColor at top level)
  if (s.patternType !== "none") {
    const bg = xlsxColorToCss(s.fgColor ?? s.fill?.fgColor, themeColors);
    if (bg && bg.toLowerCase() !== "#ffffff") style.bgColor = bg;
  }

  const fc = xlsxColorToCss(s.font?.color, themeColors);
  if (fc && fc.toLowerCase() !== "#000000") style.fontColor = fc;

  if (s.font?.bold)   style.bold   = true;
  if (s.font?.italic) style.italic = true;
  if (s.font?.sz && s.font.sz !== 11) style.fontSize = s.font.sz as number;

  const numFmt = s.numFmt as string | undefined;
  if (numFmt && numFmt !== "General" && numFmt !== "@") style.numFmt = numFmt;

  if (s.border?.top?.style)    style.borderTop    = true;
  if (s.border?.bottom?.style) style.borderBottom = true;
  if (s.border?.left?.style)   style.borderLeft   = true;
  if (s.border?.right?.style)  style.borderRight  = true;

  const ha = s.alignment?.horizontal as string | undefined;
  if (ha === "left" || ha === "center" || ha === "right") style.hAlign = ha;
  if (s.alignment?.wrapText) style.wrapText = true;

  return Object.keys(style).length > 0 ? style : null;
}

/**
 * Apply a stored Excel number-format string to a numeric value for display.
 * Only handles the most common patterns — full Excel format parsing is out of scope.
 */
export function applyNumFmt(value: string | number | null, numFmt: string | undefined): string {
  if (value == null || numFmt == null) return String(value ?? "");
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return String(value);

  if (numFmt.includes("%")) {
    const match = numFmt.match(/\.0+/);
    const decimals = match ? match[0].length - 1 : 0;
    return `${(n * (numFmt.startsWith("0") ? 1 : 100)).toFixed(decimals)}%`;
  }
  if (numFmt.includes("$")) return `$${n.toLocaleString("en-US", { minimumFractionDigits: numFmt.includes(".00") ? 2 : 0, maximumFractionDigits: numFmt.includes(".00") ? 2 : 0 })}`;
  if (numFmt.includes("#,##0")) return n.toLocaleString("en-US", { minimumFractionDigits: numFmt.includes(".00") ? 2 : 0, maximumFractionDigits: numFmt.includes(".00") ? 2 : 0 });
  if (numFmt.match(/^0+\.0+$/)) {
    const decimals = (numFmt.split(".")[1] ?? "").length;
    return n.toFixed(decimals);
  }
  return String(value);
}

// ── Workbook parser (all sheets) ──────────────────────────────────────────────

/** Empty SheetData used as a fallback for sheets with no content. */
function emptySheet(name: string): SheetData {
  return { name, rows: [], formulas: [], styles: [], merges: [], colWidths: [] };
}

export function parseWorkbook(file: File): Promise<WorkbookData> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const raw = results.data as (string | number | null)[][];
          if (raw.length === 0) { reject(new Error("File appears empty.")); return; }
          resolve({
            fileName: file.name,
            sheets: [{
              name: "Sheet1",
              rows: raw,
              formulas: raw.map(r => r.map(() => null)),
              styles: raw.map(r => r.map(() => null)),
              merges: [],
              colWidths: [],
            }],
          });
        },
        error: (err: Error) => reject(err),
      });

    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result as ArrayBuffer, { type: "array", cellStyles: true, cellNF: true, bookFiles: true });
          const themeColors = extractThemeColors(wb);
          console.log("[ELLY] theme colours resolved:", themeColors);
          const sheets: SheetData[] = wb.SheetNames.map((name) => {
            const ws = wb.Sheets[name];
            const ref = ws["!ref"];
            if (!ref) return emptySheet(name);
            const range = XLSX.utils.decode_range(ref);
            const rows: (string | number | null)[][] = [];
            const formulas: (string | null)[][] = [];
            const styles: (CellStyle | null)[][] = [];
            let debugCount = 0;
            for (let r = range.s.r; r <= range.e.r; r++) {
              const row: (string | number | null)[] = [];
              const fRow: (string | null)[] = [];
              const sRow: (CellStyle | null)[] = [];
              for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                row.push(cell ? (cell.v ?? null) : null);
                fRow.push(cell?.f ? `=${cell.f}` : null);
                const rawStyle = cell?.s ? { ...cell.s, numFmt: cell.s.numFmt ?? cell.z ?? undefined } : undefined;
                // Log first 5 cells that have any style so we can inspect the raw structure
                if (rawStyle && debugCount < 5) {
                  console.log(`[ELLY] cell ${XLSX.utils.encode_cell({ r, c })} raw style:`, JSON.parse(JSON.stringify(rawStyle)));
                  debugCount++;
                }
                sRow.push(extractCellStyle(rawStyle as Record<string, any> | undefined, themeColors));
              }
              rows.push(row);
              formulas.push(fRow);
              styles.push(sRow);
            }

            // Merged cell ranges — normalise to sheet's top-left corner
            const rawMerges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> =
              (ws["!merges"] as typeof rawMerges | undefined) ?? [];
            const merges: MergeRange[] = rawMerges.map((m) => ({
              s: { r: m.s.r - range.s.r, c: m.s.c - range.s.c },
              e: { r: m.e.r - range.s.r, c: m.e.c - range.s.c },
            }));

            // Column widths (Excel character units → pixel estimate: 1 wch ≈ 8px + 8px padding)
            const rawCols = (ws["!cols"] as Array<{ wch?: number; wpx?: number } | null> | undefined) ?? [];
            const colWidths: (number | undefined)[] = rawCols.map((col) => col?.wch);

            return { name, rows, formulas, styles, merges, colWidths };
          });
          resolve({ fileName: file.name, sheets });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);

    } else {
      reject(new Error("Unsupported file type. Please upload a .csv or .xlsx file."));
    }
  });
}

export function fmtImportValue(key: keyof ExtractedValues, v: number): string {
  if (key === "startingMRR" || key === "marketingSpend" || key === "payroll") {
    return `$${v.toLocaleString("en-US")}`;
  }
  return `${v}%`;
}
