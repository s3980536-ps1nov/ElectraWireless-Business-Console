import { useState, useMemo } from "react";
import { usePersonalFinanceStore, useFilteredTransactions } from "@/store/personalFinanceStore";
import { TransactionFormModal } from "@/components/pf/TransactionFormModal";
import type { Transaction } from "@/store/personalFinanceStore";
import { CATEGORIES, getCategoryColor } from "@/lib/categories";
import { C_BORDER, C_SUCCESS, C_ERROR, C_PRIMARY } from "@/lib/colors";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });

const fmtAmt = (n: number) => {
  const abs = Math.abs(n).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  return n >= 0 ? `+${abs}` : abs;
};

// ── Filters bar ───────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  category: string;
  type: "all" | "income" | "expense";
}

function FiltersBar({
  filters,
  onChange,
  total,
  visible,
  onAdd,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  total: number;
  visible: number;
  onAdd: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    padding: "7px 11px",
    border: `1px solid ${C_BORDER}`,
    borderRadius: 8,
    background: "rgba(255,255,255,0.70)",
    color: "hsl(242 44% 30%)",
    fontSize: 12,
    outline: "none",
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      {/* Search */}
      <input
        type="text"
        placeholder="Search description…"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        style={{ ...inputStyle, width: 200 }}
      />

      {/* Category */}
      <select
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value })}
        style={{ ...inputStyle, cursor: "pointer" }}
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Type toggle */}
      <div style={{ display: "flex", border: `1px solid ${C_BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        {(["all", "income", "expense"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange({ ...filters, type: t })}
            style={{
              padding: "7px 13px",
              fontSize: 11,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: filters.type === t ? C_PRIMARY : "rgba(255,255,255,0.70)",
              color: filters.type === t ? "#fff" : "hsl(245 16% 55%)",
              textTransform: "capitalize",
              transition: "all 0.12s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Count */}
      <span style={{ fontSize: 11, color: "hsl(245 16% 55%)", marginLeft: 2 }}>
        {visible} of {total}
      </span>

      {/* Spacer + add button */}
      <div style={{ flex: 1 }} />
      <button
        onClick={onAdd}
        style={{
          background: C_PRIMARY,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "7px 16px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add Transaction
      </button>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

type SortKey = "date" | "amount" | "description" | "category";
type SortDir = "asc" | "desc";

function TransactionRow({
  tx,
  onDelete,
}: {
  tx: Transaction;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? "rgba(47,36,133,0.04)" : "transparent", transition: "background 0.1s" }}
    >
      {/* Date */}
      <td style={{ padding: "10px 14px", fontSize: 12, color: "hsl(245 16% 50%)", whiteSpace: "nowrap" }}>
        {fmtDate(tx.date)}
      </td>

      {/* Description */}
      <td style={{ padding: "10px 14px", fontSize: 12.5, color: "hsl(242 44% 28%)", maxWidth: 260 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {tx.description}
        </div>
      </td>

      {/* Category */}
      <td style={{ padding: "10px 14px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: `${getCategoryColor(tx.category)}18`,
            border: `1px solid ${getCategoryColor(tx.category)}30`,
            borderRadius: 20,
            padding: "3px 9px",
            fontSize: 11,
            fontWeight: 600,
            color: getCategoryColor(tx.category),
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: getCategoryColor(tx.category), flexShrink: 0 }} />
          {tx.category}
        </span>
      </td>

      {/* Amount */}
      <td
        style={{
          padding: "10px 14px",
          textAlign: "right",
          fontWeight: 700,
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          color: tx.amount >= 0 ? C_SUCCESS : C_ERROR,
          whiteSpace: "nowrap",
        }}
      >
        {fmtAmt(tx.amount)}
      </td>

      {/* Source badge */}
      <td style={{ padding: "10px 14px" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "hsl(245 16% 55%)",
            background: "rgba(255,255,255,0.70)",
            border: `1px solid ${C_BORDER}`,
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {tx.source}
        </span>
      </td>

      {/* Delete */}
      <td style={{ padding: "10px 10px", textAlign: "right" }}>
        <button
          onClick={() => onDelete(tx.id)}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: hovered ? C_ERROR : "transparent",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 4px",
            transition: "color 0.1s",
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortTh({
  label,
  col,
  current,
  dir,
  align = "left",
  onClick,
}: {
  label: string;
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  align?: "left" | "right";
  onClick: (col: SortKey) => void;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onClick(col)}
      style={{
        padding: "10px 14px",
        textAlign: align,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: active ? C_PRIMARY : "hsl(245 16% 49%)",
        borderBottom: `1px solid ${C_BORDER}`,
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

// ── Main TransactionsTab ──────────────────────────────────────────────────────

export function TransactionsTab() {
  const transactions      = useFilteredTransactions();
  const deleteTransaction = usePersonalFinanceStore((s) => s.deleteTransaction);

  const [filters, setFilters] = useState<Filters>({ search: "", category: "", type: "all" });
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAdd, setShowAdd] = useState(false);

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("desc"); }
  }

  const visible = useMemo(() => {
    let list = [...transactions];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) => t.description.toLowerCase().includes(q));
    }
    if (filters.category) {
      list = list.filter((t) => t.category === filters.category);
    }
    if (filters.type !== "all") {
      list = list.filter((t) => filters.type === "income" ? t.amount >= 0 : t.amount < 0);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date")        cmp = a.date.localeCompare(b.date);
      else if (sortKey === "amount") cmp = a.amount - b.amount;
      else if (sortKey === "description") cmp = a.description.localeCompare(b.description);
      else if (sortKey === "category")    cmp = a.category.localeCompare(b.category);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [transactions, filters, sortKey, sortDir]);

  // Footer totals from visible rows
  const visibleIncome   = visible.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const visibleExpenses = visible.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        total={transactions.length}
        visible={visible.length}
        onAdd={() => setShowAdd(true)}
      />

      {/* Table */}
      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          border: `1.5px solid ${C_BORDER}`,
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.80)", backdropFilter: "blur(8px)" }}>
                <SortTh label="Date"        col="date"        current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTh label="Description" col="description" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTh label="Category"    col="category"    current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTh label="Amount"      col="amount"      current={sortKey} dir={sortDir} onClick={handleSort} align="right" />
                <th style={{ padding: "10px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 49%)", borderBottom: `1px solid ${C_BORDER}` }}>
                  Source
                </th>
                <th style={{ borderBottom: `1px solid ${C_BORDER}`, width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} onDelete={deleteTransaction} />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: 40, textAlign: "center", color: "hsl(245 16% 55%)", fontSize: 13, fontStyle: "italic" }}
                  >
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${C_BORDER}`,
            background: "rgba(255,255,255,0.40)",
            display: "flex",
            gap: 24,
            fontSize: 12,
            color: "hsl(245 16% 49%)",
          }}
        >
          <span>
            Income:{" "}
            <strong style={{ color: C_SUCCESS }}>
              {visibleIncome.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}
            </strong>
          </span>
          <span>
            Expenses:{" "}
            <strong style={{ color: C_ERROR }}>
              {visibleExpenses.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}
            </strong>
          </span>
          <span style={{ marginLeft: "auto", color: "hsl(245 16% 55%)" }}>
            {visible.length} transaction{visible.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {showAdd && <TransactionFormModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
