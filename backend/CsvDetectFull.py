import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.preprocessing import MinMaxScaler

# ── LSTM Model ─────────────────────────────────────────────
class LSTMPredictor(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(input_size=1, hidden_size=32, batch_first=True)
        self.fc = nn.Linear(32, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

# ── Sequence helper ─────────────────────────────────────────
def create_sequences(data, seq_len):
    X, y = [], []
    for i in range(len(data) - seq_len):
        X.append(data[i:i+seq_len])
        y.append(data[i+seq_len])
    return np.array(X), np.array(y)

# ── Cell ID helpers ─────────────────────────────────────────
def col_index_to_letter(index: int) -> str:
    result = ""
    n = index + 1
    while n > 0:
        result = chr(65 + (n - 1) % 26) + result
        n = (n - 1) // 26
    return result

def to_cell_id(sheet_index: int, row_index: int, col_index: int) -> str:
    return f"S{sheet_index + 1}_{col_index_to_letter(col_index)}{row_index + 1}"

# ── DataFrame reconstruction ────────────────────────────────
def cell_map_to_dataframe(cell_map: dict, sheet_index: int):
    sheet_cells = {k: v for k, v in cell_map.items() if v.get("sheetIndex") == sheet_index}
    if not sheet_cells:
        return None, 1

    max_row = max(v["rowIndex"] for v in sheet_cells.values())
    max_col = max(v["colIndex"] for v in sheet_cells.values())

    grid = [[None] * (max_col + 1) for _ in range(max_row + 1)]
    for entry in sheet_cells.values():
        grid[entry["rowIndex"]][entry["colIndex"]] = entry["value"]

    raw_headers = grid[0]
    headers = [str(h) if h is not None else f"Col{i}" for i, h in enumerate(raw_headers)]
    df = pd.DataFrame(grid[1:], columns=headers)

    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df, 1

# ── MAIN DETECTOR ───────────────────────────────────────────
def detect_anomalies(cell_map: dict, sheet_index: int = 0) -> dict:

    df, offset = cell_map_to_dataframe(cell_map, sheet_index)

    if df is None or df.empty:
        return {"anomalies": [], "totalAnomalies": 0, "columnsAnalyzed": []}

    exclude = {"row id", "postal code", "id"}
    numeric_cols = [
        col for col in df.select_dtypes(include=["number"]).columns
        if col.lower() not in exclude
    ]

    results = []
    columns_analyzed = []

    SEQ_LEN = 10
    EPOCHS = 15

    for target_col in numeric_cols:

        col_idx = df.columns.get_loc(target_col)

        # ── Missing values ─────────────────────────────
        blank_mask = df[target_col].isnull()
        for df_row_idx in df.index[blank_mask]:
            sheet_row = int(df_row_idx) + offset
            results.append({
                "cellId": to_cell_id(sheet_index, sheet_row, col_idx),
                "column": target_col,
                "rowIndex": sheet_row,
                "colIndex": col_idx,
                "originalValue": None,
                "predictedValue": None,
                "difference": None,
                "severity": "high",
                "reason": "missing",
            })

        col_data = df[[target_col]].dropna()

        if len(col_data) < SEQ_LEN + 5:
            continue

        columns_analyzed.append(target_col)

        # ── Scaling ─────────────────────────────
        scaler = MinMaxScaler()
        scaled = scaler.fit_transform(col_data.values)

        # ── Filter training data (remove extremes)
        q_low, q_high = np.percentile(scaled, [5, 95])
        filtered = scaled[(scaled >= q_low) & (scaled <= q_high)].reshape(-1, 1)

        if len(filtered) < SEQ_LEN + 5:
            continue

        # ── Train LSTM ─────────────────────────
        X_seq, y_seq = create_sequences(filtered, SEQ_LEN)

        X = torch.tensor(X_seq, dtype=torch.float32)
        y = torch.tensor(y_seq, dtype=torch.float32)

        model = LSTMPredictor()
        optimizer = optim.Adam(model.parameters(), lr=0.01)
        loss_fn = nn.MSELoss()

        for _ in range(EPOCHS):
            optimizer.zero_grad()
            loss = loss_fn(model(X), y)
            loss.backward()
            optimizer.step()

        # ── Predict full data ───────────────────
        X_full, y_full = create_sequences(scaled, SEQ_LEN)
        X_full_t = torch.tensor(X_full, dtype=torch.float32)

        with torch.no_grad():
            preds = model(X_full_t).numpy()

        errors = np.abs(preds.flatten() - y_full.flatten())
        threshold = np.percentile(errors, 95)
        anomaly_mask = errors > threshold

        pred_rescaled = scaler.inverse_transform(preds)
        actual_rescaled = scaler.inverse_transform(y_full)

        normal_vals = actual_rescaled[~anomaly_mask]

        lower = np.percentile(normal_vals, 5)
        upper = np.percentile(normal_vals, 95)
        median = np.median(normal_vals)

        for i_idx, df_row_idx in enumerate(col_data.index[SEQ_LEN:]):

            if not anomaly_mask[i_idx]:
                continue

            original = float(actual_rescaled[i_idx][0])
            predicted = float(pred_rescaled[i_idx][0])

            # Clamp + validate
            predicted = max(lower, min(upper, predicted))
            if predicted < lower or predicted > upper:
                predicted = median

            predicted = round(predicted, 2)
            original = round(original, 2)

            diff = round(abs(original - predicted), 2)

            pct = (diff / abs(original) * 100) if original != 0 else 100
            severity = "high" if pct > 50 else "medium" if pct > 20 else "low"

            sheet_row = int(df_row_idx) + offset

            results.append({
                "cellId": to_cell_id(sheet_index, sheet_row, col_idx),
                "column": target_col,
                "rowIndex": sheet_row,
                "colIndex": col_idx,
                "originalValue": original,
                "predictedValue": predicted,
                "difference": diff,
                "severity": severity,
                "reason": "outlier",
            })

    severity_order = {"high": 0, "medium": 1, "low": 2}
    results.sort(key=lambda x: (severity_order[x["severity"]], -(x["difference"] or 0)))

    return {
        "anomalies": results,
        "totalAnomalies": len(results),
        "columnsAnalyzed": columns_analyzed,
    }