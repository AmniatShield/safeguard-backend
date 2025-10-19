# server.py
from flask import Flask, request, jsonify, render_template_string
from joblib import load
import numpy as np
import os
import datetime

# ---------- تنظیمات ----------
MODEL_PATH = "model2.pkl"
SCALER_PATH = "scaler.joblib"
EXPECTED_ORDER = [
    "max_entropy","total_raw_size","total_virtual_size","avg_entropy",
    "entry_point","num_sections","num_high_entropy_sections",
    "SetFileAttributes","FindFirstFileExW","machine_type",
    "OpenProcess","CryptGenRandom","Bind","BitBlt","Send"
]
# مسیر لاگ ساده (اختیاری)
LOG_PATH = "predictions.log"
# -----------------------------

app = Flask(__name__)

# بارگذاری یک‌باره مدل و scaler
if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
    raise FileNotFoundError("Model or scaler not found. Put model2.pkl and scaler.joblib next to server.py")

model = load(MODEL_PATH)
scaler = load(SCALER_PATH)

EXPECTED_FEATURE_COUNT = scaler.mean_.shape[0] if hasattr(scaler, "mean_") else None

def log_prediction(sample_name, features, pred, label, meta=None):
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    entry = {
        "time": timestamp,
        "sample": sample_name,
        "features": features,
        "prediction": int(pred),
        "label": label,
        "meta": meta
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(jsonify(entry).get_data(as_text=True) + "\n")

@app.route("/")
def index():
    return "Malware classification server is running."

@app.route("/predict", methods=["POST"])
def predict():
    """
    انتظار: JSON body: {"features": [f1,f2,...], "sample": "optional-name"}
    خروجی: {"prediction": 0/1, "label": "Ransomware"|"Trojan"}
    """
    print('Recived Something!')
    try:
        data = request.get_json(force=True)
    except Exception:
        return jsonify({"error":"Invalid JSON"}), 400

    if not data or "features" not in data:
        return jsonify({"error":"Provide JSON with key 'features'"}), 400

    features = data["features"]
    sample_name = data.get("sample", None)

    # تبدیل به numpy و چک طول
    try:
        x = np.array(features, dtype=float).reshape(1, -1)
    except Exception as e:
        return jsonify({"error":"Features must be numeric list", "detail": str(e)}), 400

    if EXPECTED_FEATURE_COUNT is not None and x.shape[1] != EXPECTED_FEATURE_COUNT:
        return jsonify({"error":"Wrong feature length", "got": x.shape[1], "expected": EXPECTED_FEATURE_COUNT}), 400

    # نرمال‌سازی و پیش‌بینی
    try:
        x_scaled = scaler.transform(x)
        pred = int(model.predict(x_scaled)[0])
    except Exception as e:
        return jsonify({"error":"Model/scaler error", "detail": str(e)}), 500

    label = "Trojan" if pred == 1 else "Ransomware"

    # لاگ ساده
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.utcnow().isoformat()} | sample={sample_name} | pred={pred} | label={label}\n")
    except Exception:
        pass

    return jsonify({"prediction": pred, "label": label})

# ---- یک UI ساده که تست کنه ----
SIMPLE_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Malware Classifier - UI</title>
</head>
<body>
  <h2>Malware Classifier (Simple UI)</h2>
  <p>Paste features as JSON array (order must be exact):</p>
  <textarea id="features" rows="4" cols="100">[/* put features here */]</textarea><br>
  <button onclick="send()">Classify</button>
  <pre id="result"></pre>

<script>
async function send(){
  let txt = document.getElementById('features').value;
  let features;
  try { features = JSON.parse(txt); } catch(e){ alert('Invalid JSON'); return; }
  const resp = await fetch('/predict', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({features: features})
  });
  const j = await resp.json();
  document.getElementById('result').innerText = JSON.stringify(j, null, 2);
}
</script>
</body>
</html>
"""

@app.route("/ui")
def ui():
    return render_template_string(SIMPLE_HTML)

if __name__ == "__main__":
    # فقط برای توسعه. در production از gunicorn یا systemd استفاده کن.
    app.run(host="0.0.0.0", port=5000)