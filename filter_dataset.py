#!/usr/bin/env python3
"""
Filter dataset to only the 26 selected trials specified by the user.
Deletes all other images and masks from CBDatabase/Images and CBDatabase/Masks.
Regenerates data/pairs.json with full metadata and benchmarks.
"""

import os
import json
import zipfile
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(BASE_DIR, 'CBDatabase', 'Images')
MASK_DIR = os.path.join(BASE_DIR, 'CBDatabase', 'Masks')
DATA_FILE = os.path.join(BASE_DIR, 'data', 'pairs.json')
EXCEL_FILE = os.path.join(BASE_DIR, 'CBDatabase', 'CBDatabase_Size_Eccentricity_RT.xlsx')

requested_items = [
    '01_L_filler_present_mirror.jpg',
    '01_practice_present_plant.jpg',
    '022_R_filler_present_lamp.jpg',
    '0119_L_window_neither_painting.jpg',
    '02_practice_present_painting.jpg',
    '06_L_filler_present_vase.jpg',
    '08_L_filler_present_bottle.jpg',
    '014_L_filler_present_lamp.jpg',
    '016_L_filler_present_art.jpg',
    '018_L_filler_present_plant.jpg',
    '019_L_filler_present_lamp_sized.jpg',
    '022_L_filler_present_lamp.jpg',
    '040_R_filler_present_painting.jpg',
    '045_R_filler_present_musicdock.jpg',
    '048_L_filler_present_art.jpg',
    '048_R_filler_present_art.jpg',
    '060_L_filler_present_pillow.jpg',
    '071_L_filler_present_art.jpg',
    '0128_R_window_in_pot.jpg',
    '0127_R_window_in_light.jpg',
    '113_L_window_neither_plant.jpg',
    '108_L_mirrorONLY_in_boa.jpg',
    '0100_L_mirrorONLY_in_mirror.jpg',
    '098_L_mirrorONLY_in_slippers.jpg',
    '084_L_filler_present_light.jpg',
    '076_R_filler_present_hook.jpg'
]

# 1. Parse Excel data for benchmarks
excel_data = {}
if os.path.exists(EXCEL_FILE):
    with zipfile.ZipFile(EXCEL_FILE) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for elem in tree.iter():
                if elem.tag.endswith('}t'):
                    shared_strings.append(elem.text or '')

        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        for idx, row in enumerate(sheet_tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')):
            if idx < 2: continue
            cells = []
            for cell in row.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                t = cell.attrib.get('t')
                v = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = v.text if v is not None else ''
                if t == 's' and val.isdigit():
                    val = shared_strings[int(val)]
                cells.append(val)
            if len(cells) >= 12 and cells[0].isdigit():
                def to_float(val):
                    try: return float(val)
                    except: return None
                img_no = int(cells[0])
                excel_data[img_no] = {
                    'size_L': to_float(cells[1]),
                    'size_R': to_float(cells[2]),
                    'ecc_L': to_float(cells[3]),
                    'ecc_R': to_float(cells[4]),
                    'x_L': to_float(cells[5]),
                    'y_L': to_float(cells[6]),
                    'x_R': to_float(cells[7]),
                    'y_R': to_float(cells[8]),
                    'rt_L': to_float(cells[10]),
                    'rt_R': to_float(cells[11])
                }

# 2. Build 26 pair metadata
all_images = set(os.listdir(IMG_DIR))
all_masks = set(os.listdir(MASK_DIR))

pairs = []
keep_images = set()
keep_masks = set()

for idx, req in enumerate(requested_items, start=1):
    actual_name = req
    if req not in all_images and ('0' + req) in all_images:
        actual_name = '0' + req

    tokens = actual_name.split('_')
    trial_str = tokens[0]
    trial_num = int(trial_str) if trial_str.isdigit() else idx

    if tokens[1] == 'practice':
        side = 'P'
        category = 'practice'
    else:
        side = tokens[1]
        category = tokens[2]
        if category == 'mirrorONLY': category = 'mirror'

    if '_present_' in actual_name:
        present_img = actual_name
        absent_img = actual_name.replace('_present_', '_absent_')
        parts = actual_name.split('_present_')
        obj_name = parts[1].rsplit('.', 1)[0]
        mask_name = parts[0] + '_mask.png'
    elif '_in_' in actual_name:
        present_img = actual_name
        absent_img = actual_name.replace('_in_', '_neither_')
        parts = actual_name.split('_in_')
        obj_name = parts[1].rsplit('.', 1)[0]
        prefix = actual_name.rsplit('.', 1)[0]
        c1 = prefix + '_mask.png'
        c2 = parts[0] + '_in_mask.png'
        mask_name = c1 if c1 in all_masks else (c2 if c2 in all_masks else None)
    elif '_neither_' in actual_name:
        absent_img = actual_name
        present_img = actual_name.replace('_neither_', '_in_')
        parts = actual_name.split('_neither_')
        obj_name = parts[1].rsplit('.', 1)[0]
        c1 = present_img.rsplit('.', 1)[0] + '_mask.png'
        c2 = parts[0] + '_in_mask.png'
        mask_name = c1 if c1 in all_masks else (c2 if c2 in all_masks else None)
    else:
        raise ValueError(f"Unknown naming pattern: {actual_name}")

    # Benchmark lookup
    bench = excel_data.get(trial_num, {})
    if side == 'L':
        bench_x = bench.get('x_L')
        bench_y = bench.get('y_L')
        bench_rt = bench.get('rt_L')
        bench_size = bench.get('size_L')
        bench_ecc = bench.get('ecc_L')
    elif side == 'R':
        bench_x = bench.get('x_R')
        bench_y = bench.get('y_R')
        bench_rt = bench.get('rt_R')
        bench_size = bench.get('size_R')
        bench_ecc = bench.get('ecc_R')
    else:
        bench_x, bench_y, bench_rt, bench_size, bench_ecc = None, None, None, None, None

    keep_images.add(present_img)
    keep_images.add(absent_img)
    keep_masks.add(mask_name)

    pair_id = f"{tokens[0]}_{side}_{category}_{obj_name}"
    pairs.append({
        'id': pair_id,
        'trial_index': idx,
        'trial_num': trial_num,
        'trial_str': trial_str,
        'prefix': f"{tokens[0]}_{side}_{category}",
        'side': side,
        'category': category,
        'object_name': obj_name,
        'present_image': present_img,
        'absent_image': absent_img,
        'mask_image': mask_name,
        'benchmark': {
            'x': bench_x,
            'y': bench_y,
            'rt_sec': bench_rt,
            'rt_ms': round(bench_rt * 1000, 1) if bench_rt else None,
            'area_pixels': bench_size,
            'eccentricity': bench_ecc
        }
    })

# Write data/pairs.json
with open(DATA_FILE, 'w', encoding='utf-8') as f:
    json.dump(pairs, f, indent=2)

print(f"✓ Updated data/pairs.json with exactly {len(pairs)} trials.")
