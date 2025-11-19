# inference.py
import numpy as np
import joblib
from tensorflow import keras
import os

# ترتیب فیچرها — این ترتیب باید دقیقا با خروجی collector.py مطابقت کنه
feature_order = [
    'max_section_entropy',
    'text_section_entropy',
    'entropy_std',
    'overlay_size_log',
    'entrypoint_in_overlay',
    'writable_executable_sections_count',
    'tls_callbacks_present',
    'relocation_density',
    'text_size_ratio',
    'entrypoint_entropy',
    'has_certificate',
    'aslr_enabled',
    'nx_enabled',
    'executable_percentage',
    'large_constant_blob_ratio',
    'uses_dynamic_resolution_flag'
]

class MultiModelInferencer:
    def __init__(self, models_dir):
        self.models_dir = models_dir
        # model file names (همانی که گفتی)
        self.model_files = {
            'T': 'T_model.keras',
            'R': 'R_model.keras',
            'S': 'S_model.keras',
            'C': 'C_model.keras',
            'D': 'D_model.keras'
        }
        self.scaler_files = {
            'T': 'T_scaler.pkl',
            'R': 'R_scaler.pkl',
            'S': 'S_scaler.pkl',
            'C': 'C_scaler.pkl',
            'D': 'D_scaler.pkl'
        }
        self.models = {}
        self.scalers = {}
        self._load_models_and_scalers()

    def _load_models_and_scalers(self):
        for k, fname in self.model_files.items():
            path = os.path.join(self.models_dir, fname)
            if not os.path.exists(path):
                raise FileNotFoundError(f"Model file not found: {path}")
            self.models[k] = keras.models.load_model(path)
        for k, fname in self.scaler_files.items():
            path = os.path.join(self.models_dir, fname)
            if not os.path.exists(path):
                raise FileNotFoundError(f"Scaler file not found: {path}")
            self.scalers[k] = joblib.load(path)

    def _make_feature_vector(self, features_dict):
        # features_dict: mapping feature_name -> value
        x = []
        for name in feature_order:
            v = features_dict.get(name, 0)
            # Ensure numeric scalar
            try:
                v = float(v)
            except:
                v = 0.0
            x.append(v)
        arr = np.array(x, dtype=np.float32).reshape(1, -1)
        return arr

    def predict_percentages(self, features_dict):
        x_raw = self._make_feature_vector(features_dict)

        # scale and predict for each model
        results = {}
        preds = []
        for k in ['T','R','S','C','D']:
            scaler = self.scalers[k]
            model = self.models[k]
            x_scaled = scaler.transform(x_raw)
            # model.predict ممکنه خروجی (1,1) یا (1,) بده — استانداردسازی
            res = model.predict(x_scaled)
            # flatten to scalar
            val = float(np.asarray(res).reshape(-1)[0])
            results[k] = val
            preds.append(val)

        # تبدیل به درصد
        arr = np.array(preds, dtype=np.float64)
        # اگر جمع صفر بود، برای جلوگیری از تقسیم صفر مقدار یکنواخت اختصاص بده
        total = arr.sum()
        if total == 0 or np.isnan(total):
            # fallback: softmax-like normalize to uniform small probabilities
            arr = np.ones_like(arr) / arr.size
            total = arr.sum()

        percentages = (arr / total) * 100.0

        mapping = {
            'T': 'Trojan',
            'R': 'Ransomware',
            'S': 'Safe',
            'C': 'Coinminer',
            'D': 'Dropper'
        }

        out = {}
        for i, k in enumerate(['T','R','S','C','D']):
            pct = float(max(0.0, percentages[i]))  # negative guard
            out[mapping[k]] = round(pct, 2)

        # همچنین برگردون مقادیر خام (اختیاری، برای دیباگ)
        raw_scores = {mapping[k]: float(results[k]) for k in results}
        return {'percentages': out, 'raw_scores': raw_scores}
