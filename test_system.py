import urllib.request
import json
import time
import subprocess
import os
import sys

def run_tests():
    print("Testing server endpoints...")
    base_url = "http://localhost:3000"

    # 1. Health check
    try:
        with urllib.request.urlopen(f"{base_url}/api/health") as r:
            assert r.status == 200
            data = json.loads(r.read().decode())
            assert data.get('status') == 'ok'
            print("✓ /api/health passed")
    except Exception as e:
        print("✗ /api/health failed:", e)
        return False

    # 2. Dataset info
    try:
        with urllib.request.urlopen(f"{base_url}/api/dataset-info") as r:
            assert r.status == 200
            data = json.loads(r.read().decode())
            assert data.get('total_pairs') == 170
            print(f"✓ /api/dataset-info passed (total: {data['total_pairs']})")
    except Exception as e:
        print("✗ /api/dataset-info failed:", e)
        return False

    # 3. Pairs selection
    try:
        with urllib.request.urlopen(f"{base_url}/api/pairs?n=5") as r:
            assert r.status == 200
            data = json.loads(r.read().decode())
            trials = data.get('trials', [])
            assert len(trials) == 5
            print(f"✓ /api/pairs?n=5 passed (got {len(trials)} trials)")
            sample = trials[0]
            print(f"  Sample trial: {sample['id']} ({sample['object_name']})")
    except Exception as e:
        print("✗ /api/pairs failed:", e)
        return False

    # 4. Image static serving
    try:
        p_img = sample['present_image']
        a_img = sample['absent_image']
        m_img = sample['mask_image']

        with urllib.request.urlopen(f"{base_url}/images/{p_img}") as r:
            assert r.status == 200
            assert len(r.read()) > 1000
        print(f"✓ Static image serving passed: /images/{p_img}")

        with urllib.request.urlopen(f"{base_url}/images/{a_img}") as r:
            assert r.status == 200
            assert len(r.read()) > 1000
        print(f"✓ Static image serving passed: /images/{a_img}")

        with urllib.request.urlopen(f"{base_url}/masks/{m_img}") as r:
            assert r.status == 200
            assert len(r.read()) > 500
        print(f"✓ Static mask serving passed: /masks/{m_img}")
    except Exception as e:
        print("✗ Static image serving failed:", e)
        return False

    # 5. Frontend assets serving
    try:
        for path in ['/', '/public/style.css', '/public/app.js']:
            with urllib.request.urlopen(f"{base_url}{path}") as r:
                assert r.status == 200
                assert len(r.read()) > 100
                print(f"✓ Static web asset passed: {path}")
    except Exception as e:
        print("✗ Static web asset failed:", e)
        return False

    # 6. Save session
    try:
        test_payload = {
            "session_id": "test_verification_session",
            "timestamp": "2026-10-20T19:00:00Z",
            "parameters": {
                "n": 2,
                "t_interval_ms": 250,
                "image_duration_ms": 1000,
                "mode": "single_transition",
                "feedback": True,
                "tolerance_px": 15
            },
            "summary": {
                "total_trials": 2,
                "correct_count": 2,
                "accuracy_percent": 100.0,
                "mean_rt_ms": 1250.0,
                "median_rt_ms": 1250.0,
                "fastest_rt_ms": 1200.0,
                "total_duration_sec": 10
            },
            "trials": [
                {
                    "trial_index": 1,
                    "id": "010_L_filler_candle",
                    "trial_str": "010",
                    "category": "filler",
                    "side": "L",
                    "object_name": "candle",
                    "accurate": True,
                    "response_time_ms": 1200.5,
                    "click_x": 107,
                    "click_y": 371,
                    "target_x": 107.0,
                    "target_y": 371.0,
                    "distance_px": 0.0,
                    "skipped": False,
                    "present_image": "010_L_filler_present_candle.jpg",
                    "absent_image": "010_L_filler_absent_candle.jpg",
                    "mask_image": "010_L_filler_mask.png"
                }
            ]
        }
        req = urllib.request.Request(
            f"{base_url}/api/save-session",
            data=json.dumps(test_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req) as r:
            assert r.status == 200
            res = json.loads(r.read().decode())
            assert res.get('success') == True
            print("✓ /api/save-session passed")

        # Verify files created in results/
        assert os.path.exists("results/test_verification_session.json")
        assert os.path.exists("results/test_verification_session.csv")
        print("✓ Session files written to disk verified (.json and .csv)")
    except Exception as e:
        print("✗ Save session failed:", e)
        return False

    print("\n🎉 ALL SERVER AND API TESTS PASSED SUCCESSFULLY!")
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
