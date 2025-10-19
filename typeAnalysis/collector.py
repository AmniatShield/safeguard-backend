# windows_collector_final.py
"""
Windows collector (final):
- اجرا می‌کند strings64.exe برای استخراج رشته‌ها (طول >= 6)
- استخراج ویژگی‌های PE (entropy, sizes, header)
- تولید پرچم‌های API (0/1) بر اساس خروجی strings
- ساختن لیست ویژگی‌ها دقیقا با ترتیب تعیین‌شده
- ارسال JSON { "features": [ ... ] } به سرور اوبونتو
"""
import os
import sys
import subprocess
import json
import re
from collections import Counter

# try to import optional deps; provide fallback for entropy if scipy not present
try:
    import pefile
except Exception as e:
    print("Missing dependency 'pefile'. Install with: pip install pefile")
    raise

try:
    from scipy.stats import entropy as scipy_entropy
    def compute_entropy_from_counts(counts, length):
        probs = [c / length for c in counts]
        return float(scipy_entropy(probs, base=2)) if len(probs) else 0.0
except Exception:
    # fallback simple entropy implementation (base 2)
    def compute_entropy_from_counts(counts, length):
        from math import log2
        if length == 0:
            return 0.0
        ent = 0.0
        for c in counts:
            p = c / length
            if p > 0:
                ent -= p * log2(p)
        return float(ent)

try:
    import requests
except Exception as e:
    print("Missing dependency 'requests'. Install with: pip install requests")
    raise

# ================== CONFIG ==================
# مسیر کامل به strings64.exe — حتماً مسیر درست را بگذار
STRINGS_EXE_PATH = r"C:\Tools\Sysinternals\strings64.exe"

# آدرس سرور اوبونتو (endpoint)
SERVER_URL = "http://192.168.122.1:5000/predict"

# لیست API ها (همان ترتیبی که در دیتا بود)
APIS = [
    'SetFileAttributes', 'FindFirstFileExW', 'OpenProcess',
    'CryptGenRandom', 'Bind', 'BitBlt', 'Send'
]

# ترتیب نهایی ویژگی‌ها (دقیقاً همان که گفتی)
FEATURE_ORDER = [
    "max_entropy",
    "total_raw_size",
    "total_virtual_size",
    "avg_entropy",
    "entry_point",
    "num_sections",
    "num_high_entropy_sections",
    "SetFileAttributes",
    "FindFirstFileExW",
    "machine_type",           # <-- مهم: دقیقا بعد از FindFirstFileExW
    "OpenProcess",
    "CryptGenRandom",
    "Bind",
    "BitBlt",
    "Send"
]
# ============================================

def run_strings64(malware_path, strings_exe=STRINGS_EXE_PATH, min_len=6):
    """
    اجرا می‌کند strings64.exe -nobanner -n <min_len> <malware_path>
    برمی‌گرداند set از خطوط (lowercase) خروجی یا empty set در صورت خطا.
    """
    if not os.path.exists(strings_exe):
        raise FileNotFoundError(f"strings64.exe not found at: {strings_exe}")
    if not os.path.exists(malware_path):
        raise FileNotFoundError(f"malware file not found: {malware_path}")

    cmd = [strings_exe, "-nobanner", "-n", str(min_len), malware_path]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
        out = proc.stdout.decode(errors='ignore')
        lines = [ln.strip().lower() for ln in out.splitlines() if ln.strip()]
        return set(lines)
    except subprocess.CalledProcessError as e:
        print("[!] strings64 failed:", e)
        return set()
    except Exception as e:
        print("[!] Error running strings64:", e)
        return set()

def compute_section_entropies_and_sizes(pe):
    entropies = []
    raw_sizes = []
    virt_sizes = []
    for sec in pe.sections:
        try:
            data = sec.get_data()
            if data:
                counts = Counter(data).values()
                length = len(data)
                ent = compute_entropy_from_counts(list(counts), length)
                entropies.append(ent)
            else:
                entropies.append(0.0)
            raw_sizes.append(int(getattr(sec, 'SizeOfRawData', 0)))
            virt_sizes.append(int(getattr(sec, 'Misc_VirtualSize', 0)))
        except Exception:
            entropies.append(0.0)
            raw_sizes.append(int(getattr(sec, 'SizeOfRawData', 0)))
            virt_sizes.append(int(getattr(sec, 'Misc_VirtualSize', 0)))
    return entropies, raw_sizes, virt_sizes

def extract_features(malware_path, strings_set=None):
    """
    باز می‌گرداند dict از ویژگی‌ها (با کلیدهای مشابه FEATURE_ORDER و برخی اضافی برای لاگ).
    توجه: machine_type عددی برمی‌گردد.
    """
    if not os.path.exists(malware_path):
        raise FileNotFoundError("malware not found: " + malware_path)

    pe = pefile.PE(malware_path, fast_load=True)
    features = {}

    entropies, raw_sizes, virt_sizes = compute_section_entropies_and_sizes(pe)

    features['max_entropy'] = float(max(entropies)) if entropies else 0.0
    features['total_raw_size'] = int(sum(raw_sizes))
    features['total_virtual_size'] = int(sum(virt_sizes))
    features['avg_entropy'] = float(sum(entropies) / len(entropies)) if entropies else 0.0
    features['entry_point'] = int(getattr(pe.OPTIONAL_HEADER, 'AddressOfEntryPoint', 0))
    features['num_sections'] = int(getattr(pe.FILE_HEADER, 'NumberOfSections', 0))
    # آستانه سال قبل شما 5 بود؛ نگه می‌داریم
    features['num_high_entropy_sections'] = int(sum(1 for e in entropies if e > 5.0))

    # machine_type (عددی)
    mcode = int(getattr(pe.FILE_HEADER, 'Machine', 0))
    features['machine_type'] = mcode

    # flags برای APIها: بررسی در strings_set (case-insensitive)
    sset = strings_set if strings_set is not None else set()
    # ابتدا مقداردهی همه apiها به 0
    for api in APIS:
        features[api] = 0
    # بعد اگر در strings بودند مقدار 1 بگذار
    if sset:
        for api in APIS:
            api_l = api.lower()
            found = 0
            if api_l in sset:
                found = 1
            else:
                # substring match
                for s in sset:
                    if api_l in s:
                        found = 1
                        break
            features[api] = int(found)

    return features

def build_ordered_feature_list(features_dict):
    """
    بررسی می‌کند همه کلیدها موجودند، سپس لیست ordered را طبق FEATURE_ORDER می‌سازد.
    """
    missing = [k for k in FEATURE_ORDER if k not in features_dict]
    if missing:
        raise ValueError(f"Missing features required by order: {missing}")
    ordered = [features_dict[k] for k in FEATURE_ORDER]
    return ordered

def send_features_to_server(features_list, server_url=SERVER_URL, timeout=30):
    payload = {"features": features_list}
    headers = {'Content-Type': 'application/json'}
    print("[+] Sending payload to", server_url)
    r = requests.post(server_url, json=payload, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.json()

def main(malware_path, strings_exe_path=None, server_url=None):
    global STRINGS_EXE_PATH, SERVER_URL
    if strings_exe_path:
        STRINGS_EXE_PATH = strings_exe_path
    if server_url:
        SERVER_URL = server_url

    print("[*] Sample:", malware_path)
    # 1) استخراج strings با strings64 (طول >=6)
    try:
        strings_set = run_strings64(malware_path, STRINGS_EXE_PATH, min_len=6)
        print(f"[+] Extracted {len(strings_set)} unique strings (len>=6).")
    except Exception as e:
        print("[!] strings extraction error:", e)
        strings_set = set()

    # 2) استخراج ویژگی‌ها
    try:
        feats = extract_features(malware_path, strings_set)
    except Exception as e:
        print("[!] Feature extraction failed:", e)
        return

    # 3) ساخت لیست ordered مطابق FEATURE_ORDER
    try:
        ordered = build_ordered_feature_list(feats)
    except Exception as e:
        print("[!] Error building ordered feature list:", e)
        print("Available keys:", list(feats.keys()))
        return

    print("[+] Ordered features:", ordered)

    # 4) ارسال به سرویس اوبونتو
    try:
        resp = send_features_to_server(ordered, SERVER_URL)
        print("[+] Server response:", json.dumps(resp, indent=2))
    except Exception as e:
        print("[!] Error sending to server:", e)
        # fallback: ذخیره محلی
        outfn = os.path.basename(malware_path) + ".features.json"
        with open(outfn, "w", encoding="utf-8") as fo:
            json.dump({"features": ordered, "meta": feats}, fo, indent=2)
        print("[+] Saved features locally to", outfn)

if __name__ == "__main__":
    # usage:
    # python windows_collector_final.py C:\path\to\sample.exe [C:\path\to\strings64.exe] [http://UBUNTU:5000/predict]
    if len(sys.argv) < 2:
        print("Usage: python windows_collector_final.py sample.exe [strings64.exe_path] [server_url]")
        sys.exit(1)
    sample = sys.argv[1]
    s_exe = sys.argv[2] if len(sys.argv) >= 3 else None
    srv = sys.argv[3] if len(sys.argv) >= 4 else None
    main(sample, s_exe, srv)
