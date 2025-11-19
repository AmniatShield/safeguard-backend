#!/usr/bin/env python3
# collector.py (full, ready-to-use)
import os
import pefile
import math
import json
import numpy as np
import requests
import sys
import argparse

def entropy(data):
    if not data or len(data) == 0:
        return 0.0
    counter = [0] * 256
    for byte in data:
        counter[byte] += 1
    ent = 0.0
    length = len(data)
    for count in counter:
        if count > 0:
            p = count / length
            ent -= p * math.log2(p)
    return ent

def safe_log1p(x):
    return math.log1p(max(0, x))

def extract_resilient_features(filepath):
    features = {
        'max_section_entropy': 0.0,
        'text_section_entropy': 0.0,
        'entropy_std': 0.0,
        'overlay_size_log': 0.0,
        'entrypoint_in_overlay': 0,
        'writable_executable_sections_count': 0,
        'tls_callbacks_present': 0,
        'relocation_density': 0.0,
        'text_size_ratio': 0.0,
        'entrypoint_entropy': 0.0,
        'has_certificate': 0,
        'aslr_enabled': 0,
        'nx_enabled': 0,
        'executable_percentage': 0.0,
        'large_constant_blob_ratio': 0.0,
        'uses_dynamic_resolution_flag': 0
    }

    pe = None
    try:
        pe = pefile.PE(filepath, fast_load=False)

        # --- Section-based features ---
        try:
            sections = pe.sections
            total_virtual_size = sum(sec.Misc_VirtualSize for sec in sections) if sections else 1
            entropies = []
            exec_size = 0
            high_ent_size = 0
            text_entropy = 0.0
            text_size = 0
            wx_count = 0

            for sec in sections:
                data = sec.get_data()
                sec_ent = entropy(data) if data else 0.0
                entropies.append(sec_ent)

                # text section
                name = sec.Name.decode(errors='ignore').strip('\x00').lower()
                if '.text' in name or name.startswith('text'):
                    text_entropy = sec_ent
                    text_size = sec.Misc_VirtualSize

                # Writable + executable
                # Characteristics bits: IMAGE_SCN_MEM_WRITE (0x80000000), IMAGE_SCN_MEM_EXECUTE (0x20000000)
                if (sec.Characteristics & 0x20000000) and (sec.Characteristics & 0x80000000):
                    wx_count += 1

                # executable section size
                if sec.Characteristics & 0x20000000:
                    exec_size += sec.Misc_VirtualSize

                # High entropy blob size
                if sec_ent > 7.0:
                    high_ent_size += sec.Misc_VirtualSize

            features['max_section_entropy'] = round(max(entropies) if entropies else 0.0, 3)
            features['text_section_entropy'] = round(text_entropy, 3)
            features['entropy_std'] = round(np.std(entropies) if entropies else 0.0, 3)
            features['writable_executable_sections_count'] = wx_count
            features['executable_percentage'] = round(exec_size / total_virtual_size if total_virtual_size > 0 else 0.0, 3)
            features['large_constant_blob_ratio'] = round(high_ent_size / total_virtual_size if total_virtual_size > 0 else 0.0, 3)
            features['text_size_ratio'] = round(text_size / total_virtual_size if total_virtual_size > 0 else 0.0, 3)

        except Exception:
            pass

        # --- Overlay ---
        try:
            file_size = os.path.getsize(filepath)
            if sections:
                last_sec = sections[-1]
                end_of_sections = last_sec.PointerToRawData + last_sec.SizeOfRawData
                overlay_size = file_size - end_of_sections if file_size > end_of_sections else 0
                features['overlay_size_log'] = round(safe_log1p(overlay_size), 3)

                ep_rva = pe.OPTIONAL_HEADER.AddressOfEntryPoint
                # Guard: compute sum of virtual sizes of sections as approximation of sections end
                sections_virtual_sum = sum(sec.Misc_VirtualSize for sec in sections) if sections else 0
                ep_in_overlay = 1 if ep_rva >= pe.OPTIONAL_HEADER.SizeOfHeaders + sections_virtual_sum else 0
                features['entrypoint_in_overlay'] = ep_in_overlay

        except Exception:
            pass

        # --- TLS callbacks ---
        try:
            tls_dir = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_TLS']]
            features['tls_callbacks_present'] = 1 if tls_dir.VirtualAddress != 0 and hasattr(pe, 'DIRECTORY_ENTRY_TLS') and pe.DIRECTORY_ENTRY_TLS.struct.Callbacks else 0
        except Exception:
            pass

        # --- Relocations ---
        try:
            reloc_dir = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_BASERELOC']]
            reloc_entries = reloc_dir.Size // 8 if reloc_dir.Size > 0 else 0
            total_virtual_size = sum(sec.Misc_VirtualSize for sec in sections) if sections else 1
            features['relocation_density'] = round(reloc_entries / total_virtual_size if total_virtual_size > 0 else 0.0, 6)
        except Exception:
            pass

        # --- Entry point entropy ---
        try:
            ep_rva = pe.OPTIONAL_HEADER.AddressOfEntryPoint
            ep_data = pe.get_data(ep_rva, 128)
            features['entrypoint_entropy'] = round(entropy(ep_data), 3) if ep_data else 0.0
        except Exception:
            pass

        # --- Certificate ---
        try:
            cert_dir = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_SECURITY']]
            features['has_certificate'] = 1 if cert_dir.Size > 0 else 0
        except Exception:
            pass

        # --- ASLR & NX ---
        try:
            dll_chars = pe.OPTIONAL_HEADER.DllCharacteristics
            features['aslr_enabled'] = 1 if (dll_chars & 0x0040) else 0
            features['nx_enabled'] = 1 if (dll_chars & 0x0100) else 0
        except Exception:
            pass

        # --- Dynamic API resolution ---
        try:
            has_dynamic = 0
            if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
                for entry in pe.DIRECTORY_ENTRY_IMPORT:
                    for imp in entry.imports:
                        if imp.name:
                            name = imp.name.decode(errors='ignore').lower()
                            if 'loadlibrary' in name or 'getprocaddress' in name:
                                has_dynamic = 1
                                break
                    if has_dynamic:
                        break
            features['uses_dynamic_resolution_flag'] = has_dynamic
        except Exception:
            pass

    except Exception:
        pass

    finally:
        if pe:
            try:
                pe.close()
            except Exception:
                pass

    # Ensure all numeric
    for k, v in features.items():
        if v is None or isinstance(v, str):
            features[k] = 0.0

    return features


def send_to_server(features_dict, server_url, auth_token=None, timeout=10):
    headers = {'Content-Type': 'application/json'}
    if auth_token:
        headers['X-Auth-Token'] = auth_token
    payload = {'features': features_dict}
    try:
        resp = requests.post(server_url.rstrip('/') + '/analyze', json=payload, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[ERROR] sending to server failed: {e}")
        return None

def save_json(filepath, output_json):
    feats = extract_resilient_features(filepath)
    with open(output_json, "w") as f:
        json.dump(feats, f, indent=4)
    print(f"[OK] JSON saved → {output_json}")
    return feats

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Collector and sender')
    parser.add_argument('input_exe', help='input exe path')
    parser.add_argument('output_json', help='output json path')
    parser.add_argument('--server', help='server base URL, e.g. http://10.0.2.2:5000', default=None)
    parser.add_argument('--token', help='auth token for server', default=None)
    parser.add_argument('--timeout', help='request timeout seconds', type=int, default=10)
    args = parser.parse_args()

    if not os.path.exists(args.input_exe):
        print(f"[ERROR] input file not found: {args.input_exe}")
        sys.exit(1)

    feats = save_json(args.input_exe, args.output_json)
    if args.server:
        print(f"[INFO] Sending features to server {args.server} ...")
        res = send_to_server(feats, args.server, auth_token=args.token, timeout=args.timeout)
        print("[SERVER RESPONSE]")
        print(json.dumps(res, indent=4))
