import pandas as pd
import numpy as np
import time
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.preprocessing import MinMaxScaler

# LSTM Model
class LSTMPredictor(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(input_size=1, hidden_size=32, batch_first=True)
        self.fc = nn.Linear(32, 1)  # ✅ removed sigmoid

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out

# Create sequences
def create_sequences(data, seq_len):
    X, y = [], []
    for i in range(len(data) - seq_len):
        X.append(data[i:i+seq_len])
        y.append(data[i+seq_len])
    return np.array(X), np.array(y)

# Load CSV
input_file = "Sample - Superstore.csv"
df = pd.read_csv(input_file, encoding="latin1")

numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
exclude_cols = ["Row ID", "Postal Code"]
numeric_cols = [col for col in numeric_cols if col not in exclude_cols]

results = []

SEQ_LEN = 10
EPOCHS = 20

total_cols = len(numeric_cols)
start_total = time.time()

print(f"\nStarting LSTM anomaly detection + prediction on {total_cols} columns...\n")

# Process each column
for col_idx, target_col in enumerate(numeric_cols, 1):

    col_start = time.time()
    print(f"[{col_idx}/{total_cols}] Processing: {target_col}")

    col_data = df[[target_col]].dropna()

    if len(col_data) < SEQ_LEN + 5:
        print("   Skipped (not enough data)\n")
        continue

    # Scale data
    scaler = MinMaxScaler()
    scaled_data = scaler.fit_transform(col_data.values)

    # Pre-filter anomalies BEFORE training
    q_low = np.percentile(scaled_data, 5)
    q_high = np.percentile(scaled_data, 95)

    filtered_data = scaled_data[
        (scaled_data >= q_low) & (scaled_data <= q_high)
    ].reshape(-1, 1)

    if len(filtered_data) < SEQ_LEN + 5:
        print("   Skipped (not enough filtered data)\n")
        continue

    # Create sequences
    X_seq, y_seq = create_sequences(filtered_data, SEQ_LEN)

    X = torch.tensor(X_seq, dtype=torch.float32)
    y = torch.tensor(y_seq, dtype=torch.float32)

    # Train LSTM
    model = LSTMPredictor()
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.01)

    print("   Training LSTM...")
    for epoch in range(EPOCHS):
        model.train()
        optimizer.zero_grad()

        outputs = model(X)
        loss = criterion(outputs, y)

        loss.backward()
        optimizer.step()

        if (epoch + 1) % 5 == 0:
            print(f"      Epoch {epoch+1}/{EPOCHS} - loss: {loss.item():.6f}")

    # Predict on FULL dataset
    X_full, y_full = create_sequences(scaled_data, SEQ_LEN)

    X_full_t = torch.tensor(X_full, dtype=torch.float32)

    model.eval()
    with torch.no_grad():
        predictions = model(X_full_t).numpy()

    errors = np.abs(predictions.flatten() - y_full.flatten())

    threshold = np.percentile(errors, 95)
    anomaly_mask = errors > threshold

    anomaly_indices = col_data.index[SEQ_LEN:][anomaly_mask]

    print(f"   Found {len(anomaly_indices)} anomalies")

    if len(anomaly_indices) == 0:
        print("   No anomalies\n")
        continue

    # Convert back to original scale
    pred_rescaled = scaler.inverse_transform(predictions)
    actual_rescaled = scaler.inverse_transform(y_full)

    # Define NORMAL range
    normal_values = actual_rescaled[~anomaly_mask]

    lower_bound = np.percentile(normal_values, 5)
    upper_bound = np.percentile(normal_values, 95)
    median_value = np.median(normal_values)

    # Store results
    for i_idx, idx in enumerate(col_data.index[SEQ_LEN:]):

        if not anomaly_mask[i_idx]:
            continue

        predicted_value = float(pred_rescaled[i_idx][0])
        original_value = float(actual_rescaled[i_idx][0])

        # 🔒 Clamp prediction to normal range
        predicted_value = max(lower_bound, min(upper_bound, predicted_value))

        # 🔒 Validate prediction (fallback if still bad)
        if predicted_value < lower_bound or predicted_value > upper_bound:
            predicted_value = median_value

        predicted_value = round(predicted_value, 2)
        original_value = round(original_value, 2)

        if original_value == 0:
            percent_diff = 0.0
        else:
            percent_diff = round(
                abs(original_value - predicted_value) / abs(original_value) * 100,
                2
            )

        results.append({
            "Row": idx,
            "Column": target_col,
            "Original Value": original_value,
            "Predicted Value": predicted_value,
            "Difference": round(abs(original_value - predicted_value), 2),
            "Percent Difference (%)": percent_diff
        })

    col_time = time.time() - col_start
    print(f"   Done in {col_time:.2f}s\n")

# Save results
results_df = pd.DataFrame(results)

output_file = "anomaly_predictions_LSTM_improved.csv"
results_df.to_csv(output_file, index=False)

total_time = time.time() - start_total

print("====================================")
print(f"Done! Saved to {output_file}")
print(f"Total anomalies: {len(results_df)}")
print(f"Total runtime: {total_time:.2f}s")
print("====================================")

if results_df.empty:
    print("No anomalies detected — try increasing epochs or lowering threshold.")
