from flask import Flask, request, jsonify
import os
from inference import MultiModelInferencer
import logging
import json
import time

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# تنظیمات
MODELS_DIR = os.environ.get('MODELS_DIR', '/opt/mal_sandbox/models')
AUTH_TOKEN = os.environ.get('INFERENCE_AUTH_TOKEN', 'CHANGE_ME_SECRET_TOKEN')

# بارگذاری مدل‌ها در شروع
inferencer = MultiModelInferencer(MODELS_DIR)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status':'ok'})

@app.route('/analyze', methods=['POST'])
def analyze():
    # احراز هویت ساده با توکن در هدر
    token = request.headers.get('X-Auth-Token', '')
    if token != AUTH_TOKEN:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json()
    if not data:
        return jsonify({'error': 'invalid json'}), 400

    # data باید object فیچرها باشه یا {"features": {...}}
    features = data.get('features') if isinstance(data, dict) and 'features' in data else data

    try:
        res = inferencer.predict_percentages(features)

        # -----------------------------------------
        # ذخیره JSON ورودی کالکتور روی دیسک
        # -----------------------------------------
        timestamp = int(time.time() * 1000)
        filename = f"collector.json"
        save_path = os.path.join(os.getcwd(), filename)

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(features, f, indent=4, ensure_ascii=False)

        app.logger.info(f"Saved collector JSON input to: {save_path}")
        # -----------------------------------------

        return jsonify({'ok': True, 'result': res})

    except Exception as e:
        app.logger.exception("inference failed")
        return jsonify({'ok': False, 'error': str(e)}), 500


if __name__ == '__main__':
    # برای production از gunicorn / systemd و nginx استفاده کن
    app.run(host='0.0.0.0', port=5000, debug=False)

