#!/usr/bin/env python3
"""
Data Conversion Utility for Change Blindness Experiment
Converts Excel (.xlsx) <-> CSV (.csv) for database files and trial outputs.
Works with pure Python 3 standard library (no third-party dependencies required).
"""

import sys
import os
import csv
import json
import zipfile
import xml.etree.ElementTree as ET

def xlsx_to_csv(xlsx_path, csv_path=None):
    """Extracts rows from an .xlsx spreadsheet and writes a standard CSV file."""
    if not os.path.isfile(xlsx_path):
        raise FileNotFoundError(f"Input file not found: {xlsx_path}")

    if not csv_path:
        csv_path = os.path.splitext(xlsx_path)[0] + ".csv"

    with zipfile.ZipFile(xlsx_path, 'r') as z:
        # Load shared strings
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for elem in tree.iter():
                if elem.tag.endswith('}t'):
                    shared_strings.append(elem.text or '')

        # Load worksheet 1
        sheet_path = 'xl/worksheets/sheet1.xml'
        if sheet_path not in z.namelist():
            # Try finding first sheet
            sheets = [n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')]
            if not sheets:
                raise ValueError("No worksheets found in XLSX archive")
            sheet_path = sheets[0]

        sheet_tree = ET.fromstring(z.read(sheet_path))
        rows = []
        for row in sheet_tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
            row_vals = []
            for cell in row.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                cell_type = cell.attrib.get('t')
                val_elem = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                val = val_elem.text if val_elem is not None else ''
                if cell_type == 's' and val.isdigit():
                    idx = int(val)
                    val = shared_strings[idx] if idx < len(shared_strings) else val
                elif cell_type == 'inlineStr':
                    t_elem = cell.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    if t_elem is not None and t_elem.text:
                        val = t_elem.text
                row_vals.append(val)
            rows.append(row_vals)

    # Pad rows so all rows have equal columns if needed
    max_cols = max((len(r) for r in rows), default=0)
    for r in rows:
        while len(r) < max_cols:
            r.append('')

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"✓ Converted XLSX -> CSV: {xlsx_path} -> {csv_path} ({len(rows)} rows)")
    return csv_path

def csv_to_xlsx(csv_path, xlsx_path=None, sheet_name="Trial Results"):
    """Converts a CSV file into a genuine .xlsx workbook using standard library."""
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(f"Input file not found: {csv_path}")

    if not xlsx_path:
        xlsx_path = os.path.splitext(csv_path)[0] + ".xlsx"

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        all_rows = list(reader)

    if not all_rows:
        headers = []
        data_rows = []
    else:
        headers = all_rows[0]
        data_rows = all_rows[1:]

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\n'
        '  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n'
        '</Types>'
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\n'
        '</Relationships>'
    )

    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\n'
        '</Relationships>'
    )

    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n'
        '  <sheets>\n'
        f'    <sheet name="{sheet_name}" sheetId="1" r:id="rId1"/>\n'
        '  </sheets>\n'
        '</workbook>'
    )

    def col_letter(col_idx):
        result = ''
        while col_idx >= 0:
            result = chr(col_idx % 26 + 65) + result
            col_idx = col_idx // 26 - 1
        return result

    def escape_xml(s):
        return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

    sheet_rows = []
    # Header row
    if headers:
        header_cells = []
        for c_idx, h in enumerate(headers):
            ref = f"{col_letter(c_idx)}1"
            header_cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape_xml(h)}</t></is></c>')
        sheet_rows.append(f'<row r="1">{"".join(header_cells)}</row>')

    # Data rows
    for r_idx, row in enumerate(data_rows, start=2):
        cells = []
        for c_idx, val in enumerate(row):
            ref = f"{col_letter(c_idx)}{r_idx}"
            if val is None or val == '':
                continue
            # Number check
            try:
                num = float(val)
                if not (val.startswith('0') and len(val) > 1 and not val.startswith('0.')):
                    cells.append(f'<c r="{ref}"><v>{num}</v></c>')
                    continue
            except ValueError:
                pass
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape_xml(val)}</t></is></c>')
        sheet_rows.append(f'<row r="{r_idx}">{"".join(cells)}</row>')

    sheet1 = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n'
        '  <sheetData>\n'
        f'    {"".join(sheet_rows)}\n'
        '  </sheetData>\n'
        '</worksheet>'
    )

    with zipfile.ZipFile(xlsx_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', rels)
        z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        z.writestr('xl/workbook.xml', workbook)
        z.writestr('xl/worksheets/sheet1.xml', sheet1)

    print(f"✓ Converted CSV -> XLSX: {csv_path} -> {xlsx_path} ({len(all_rows)} rows)")
    return xlsx_path

def convert_all():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    results_dir = os.path.join(base_dir, 'results')
    db_dir = os.path.join(base_dir, 'CBDatabase')

    # 1. Convert Excel database to CSV
    db_xlsx = os.path.join(db_dir, 'CBDatabase_Size_Eccentricity_RT.xlsx')
    if os.path.exists(db_xlsx):
        xlsx_to_csv(db_xlsx)

    # 2. Convert all CSV sessions in results/ to XLSX as well
    if os.path.exists(results_dir):
        for f in os.listdir(results_dir):
            if f.endswith('.csv'):
                csv_path = os.path.join(results_dir, f)
                xlsx_path = os.path.splitext(csv_path)[0] + '.xlsx'
                csv_to_xlsx(csv_path, xlsx_path)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg.endswith('.xlsx'):
            out = sys.argv[2] if len(sys.argv) > 2 else None
            xlsx_to_csv(arg, out)
        elif arg.endswith('.csv'):
            out = sys.argv[2] if len(sys.argv) > 2 else None
            csv_to_xlsx(arg, out)
        elif arg == '--all':
            convert_all()
        else:
            print("Usage:")
            print("  python3 export_utils.py <file.xlsx> [output.csv]")
            print("  python3 export_utils.py <file.csv> [output.xlsx]")
            print("  python3 export_utils.py --all")
    else:
        convert_all()
