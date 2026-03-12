#!/usr/bin/env python3
"""PDF Export Bridge for ArchFlow.

Generates PDF output from ADF floor JSON data using reportlab or
fallback to minimal PDF generation if reportlab is unavailable.
Supports architectural drawing sheets, title blocks, viewports,
and all ADF entity types.
"""

import json
import math
import sys
import os
from typing import Any

# ---------------------------------------------------------------------------
# Try import reportlab; fallback to a minimal built-in PDF writer
# ---------------------------------------------------------------------------
HAVE_REPORTLAB = False
RL: dict[str, Any] = {
    'A4': (595.28, 841.89), 'A3': (841.89, 1190.55), 'A2': (1190.55, 1683.78),
    'A1': (1683.78, 2383.94), 'A0': (2383.94, 3370.39),
    'landscape': lambda s: (max(s), min(s)),
    'portrait': lambda s: (min(s), max(s)),
    'canvas': None, 'HexColor': None, 'black': None, 'white': None, 'gray': None,
    'mm': 2.834645669,
}
try:
    import reportlab.lib.pagesizes as _rp  # type: ignore
    import reportlab.lib.units as _ru  # type: ignore
    import reportlab.pdfgen.canvas as _rc  # type: ignore
    import reportlab.lib.colors as _rcol  # type: ignore
    RL.update({
        'A4': _rp.A4, 'A3': _rp.A3, 'A2': _rp.A2, 'A1': _rp.A1, 'A0': _rp.A0,
        'landscape': _rp.landscape, 'portrait': _rp.portrait,
        'canvas': _rc, 'HexColor': _rcol.HexColor,
        'black': _rcol.black, 'white': _rcol.white, 'gray': _rcol.gray,
        'mm': _ru.mm,
    })
    HAVE_REPORTLAB = True
except ImportError:
    pass

mm: float = RL['mm']

# Paper sizes in points (fallback)
PAPER_SIZES_PT = {
    'A4': (595.28, 841.89), 'A3': (841.89, 1190.55), 'A2': (1190.55, 1683.78),
    'A1': (1683.78, 2383.94), 'A0': (2383.94, 3370.39),
    'ARCH_A': (648, 864), 'ARCH_B': (864, 1296), 'ARCH_C': (1296, 1728),
    'ARCH_D': (1728, 2592), 'ARCH_E': (2592, 3456),
    'ANSI_A': (612, 792), 'ANSI_B': (792, 1224), 'ANSI_C': (1224, 1584), 'ANSI_D': (1584, 2448),
}


def _bounds(entities: list[dict]) -> tuple[float, float, float, float]:
    """Compute bounding box of entities in mm."""
    xs, ys = [], []
    for e in entities:
        if 'x1' in e:
            xs += [e['x1'], e.get('x2', e['x1'])]
            ys += [e['y1'], e.get('y2', e['y1'])]
        elif 'x' in e:
            xs.append(e['x']); ys.append(e['y'])
        elif 'cx' in e:
            r = e.get('r', e.get('radius', 0))
            xs += [e['cx'] - r, e['cx'] + r]
            ys += [e['cy'] - r, e['cy'] + r]
        if 'points' in e:
            for p in e['points']:
                xs.append(p['x']); ys.append(p['y'])
    if not xs:
        return 0, 0, 210, 297  # default A4
    return min(xs), min(ys), max(xs), max(ys)


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip('#')
    if len(h) == 6:
        return int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return 0, 0, 0


# ── Reportlab-based PDF export ─────────────────────────────────────────────

def _export_reportlab(data: dict, out_path: str) -> str:
    """Full-featured PDF export using reportlab."""
    entities = data.get('entities', [])
    paper = data.get('paperSize', 'A3')
    orient = data.get('orientation', 'landscape')
    title = data.get('title', 'ArchFlow Drawing')
    scale_str = data.get('scale', '1:100')
    drawn_by = data.get('drawnBy', 'ArchFlow')

    # Parse scale
    parts = scale_str.replace(' ', '').split(':')
    pdf_scale = 1.0
    if len(parts) == 2:
        try:
            pdf_scale = float(parts[0]) / float(parts[1])
        except (ValueError, ZeroDivisionError):
            pdf_scale = 0.01

    # Paper size
    size_map = {
        'A4': RL['A4'], 'A3': RL['A3'], 'A2': RL['A2'], 'A1': RL['A1'], 'A0': RL['A0'],
    }
    page_size = size_map.get(paper, RL['A3'])
    if orient == 'landscape':
        page_size = RL['landscape'](page_size)
    else:
        page_size = RL['portrait'](page_size)

    pw, ph = page_size
    margin = 15 * mm

    c = RL['canvas'].Canvas(out_path, pagesize=page_size)
    c.setTitle(title)
    c.setAuthor(drawn_by)

    # ── Title block ────────────────────────────────────────────────────
    c.setStrokeColor(RL['black'])
    c.setLineWidth(0.5)
    # Outer border
    c.rect(margin, margin, pw - 2 * margin, ph - 2 * margin)
    # Inner border
    c.rect(margin + 2, margin + 2, pw - 2 * margin - 4, ph - 2 * margin - 4)

    # Title block area (bottom-right)
    tb_w, tb_h = 180 * mm, 50 * mm
    tb_x = pw - margin - tb_w
    tb_y = margin
    c.setLineWidth(0.8)
    c.rect(tb_x, tb_y, tb_w, tb_h)
    # Title block internal lines
    c.line(tb_x, tb_y + 15 * mm, tb_x + tb_w, tb_y + 15 * mm)
    c.line(tb_x, tb_y + 30 * mm, tb_x + tb_w, tb_y + 30 * mm)
    c.line(tb_x + 90 * mm, tb_y, tb_x + 90 * mm, tb_y + 30 * mm)
    # Title block text
    c.setFont('Helvetica-Bold', 14)
    c.drawString(tb_x + 5 * mm, tb_y + 35 * mm, title)
    c.setFont('Helvetica', 8)
    c.drawString(tb_x + 5 * mm, tb_y + 20 * mm, f'Scale: {scale_str}')
    c.drawString(tb_x + 5 * mm, tb_y + 10 * mm, f'Drawn by: {drawn_by}')
    c.drawString(tb_x + 5 * mm, tb_y + 3 * mm, 'ArchFlow CAD/BIM')
    c.drawString(tb_x + 95 * mm, tb_y + 20 * mm, f'Paper: {paper} {orient.title()}')
    import datetime
    c.drawString(tb_x + 95 * mm, tb_y + 10 * mm, f'Date: {datetime.date.today().isoformat()}')

    # ── Calculate drawing area → PDF transformation ────────────────────
    draw_area_x = margin + 5 * mm
    draw_area_y = margin + tb_h + 5 * mm
    draw_area_w = pw - 2 * margin - 10 * mm
    draw_area_h = ph - 2 * margin - tb_h - 10 * mm

    bx0, by0, bx1, by1 = _bounds(entities)
    ew = max(bx1 - bx0, 1)
    eh = max(by1 - by0, 1)

    # Scale to fit drawing area (mm → points)
    fit_scale = min(draw_area_w / (ew * mm * pdf_scale), draw_area_h / (eh * mm * pdf_scale))
    s = fit_scale * pdf_scale

    def tx(x_mm: float) -> float:
        return draw_area_x + (x_mm - bx0) * mm * s

    def ty(y_mm: float) -> float:
        return draw_area_y + draw_area_h - (y_mm - by0) * mm * s  # flip Y

    # ── Render entities ────────────────────────────────────────────────
    c.setLineWidth(0.3)
    for ent in entities:
        etype = ent.get('type', '')
        col = ent.get('color', '#000000')
        try:
            c.setStrokeColor(RL['HexColor'](col))
        except Exception:
            c.setStrokeColor(RL['black'])

        lw = ent.get('lineweight', 0.25)
        c.setLineWidth(max(0.1, lw))

        if etype == 'line':
            c.line(tx(ent['x1']), ty(ent['y1']), tx(ent['x2']), ty(ent['y2']))

        elif etype == 'wall':
            c.setLineWidth(max(0.5, lw))
            c.line(tx(ent['x1']), ty(ent['y1']), tx(ent['x2']), ty(ent['y2']))
            # Draw wall thickness
            thick = ent.get('thickness', 200) * mm * s * 0.5
            ax, ay = ent['x2'] - ent['x1'], ent['y2'] - ent['y1']
            length = math.sqrt(ax * ax + ay * ay)
            if length > 0:
                nx, ny = -ay / length, ax / length
                pts = [
                    (tx(ent['x1']) + nx * thick, ty(ent['y1']) - ny * thick),
                    (tx(ent['x2']) + nx * thick, ty(ent['y2']) - ny * thick),
                    (tx(ent['x2']) - nx * thick, ty(ent['y2']) + ny * thick),
                    (tx(ent['x1']) - nx * thick, ty(ent['y1']) + ny * thick),
                ]
                path = c.beginPath()
                path.moveTo(*pts[0])
                for p in pts[1:]:
                    path.lineTo(*p)
                path.close()
                c.drawPath(path, stroke=1, fill=0)

        elif etype == 'circle':
            cx, cy = tx(ent['cx']), ty(ent['cy'])
            r = ent.get('r', ent.get('radius', 0)) * mm * s
            c.circle(cx, cy, r)

        elif etype == 'arc':
            cx, cy = tx(ent['cx']), ty(ent['cy'])
            r = ent.get('r', 0) * mm * s
            sa = math.degrees(ent.get('startAngle', 0))
            ea = math.degrees(ent.get('endAngle', math.pi))
            c.arc(cx - r, cy - r, cx + r, cy + r, sa, ea - sa)

        elif etype == 'rectangle':
            rx, ry = tx(ent['x']), ty(ent['y'] + ent.get('height', 0))
            rw = ent.get('width', 0) * mm * s
            rh = ent.get('height', 0) * mm * s
            c.rect(rx, ry, rw, rh)

        elif etype in ('polyline', 'spline'):
            pts_key = 'points' if 'points' in ent else 'controlPoints'
            pts = ent.get(pts_key, [])
            if len(pts) >= 2:
                path = c.beginPath()
                path.moveTo(tx(pts[0]['x']), ty(pts[0]['y']))
                for p in pts[1:]:
                    path.lineTo(tx(p['x']), ty(p['y']))
                if ent.get('closed'):
                    path.close()
                c.drawPath(path, stroke=1, fill=0)

        elif etype == 'polygon':
            pts = ent.get('points', [])
            if len(pts) >= 3:
                path = c.beginPath()
                path.moveTo(tx(pts[0]['x']), ty(pts[0]['y']))
                for p in pts[1:]:
                    path.lineTo(tx(p['x']), ty(p['y']))
                path.close()
                c.drawPath(path, stroke=1, fill=0)

        elif etype == 'ellipse':
            ex, ey = tx(ent['cx']), ty(ent['cy'])
            rx = ent.get('rx', 0) * mm * s
            ry = ent.get('ry', 0) * mm * s
            c.ellipse(ex - rx, ey - ry, ex + rx, ey + ry)

        elif etype == 'text':
            px, py = tx(ent['x']), ty(ent['y'])
            h = max(4, ent.get('height', 200) * mm * s * 0.4)
            c.setFont('Helvetica', min(h, 48))
            try:
                c.setFillColor(RL['HexColor'](col))
            except Exception:
                c.setFillColor(RL['black'])
            c.drawString(px, py, str(ent.get('content', '')))
            c.setFillColor(RL['black'])

        elif etype == 'dimension':
            # Draw dimension line + text
            c.line(tx(ent['x1']), ty(ent['y1']), tx(ent['x2']), ty(ent['y2']))
            mp_x = (tx(ent['x1']) + tx(ent['x2'])) / 2
            mp_y = (ty(ent['y1']) + ty(ent['y2'])) / 2
            d = math.sqrt((ent['x2'] - ent['x1']) ** 2 + (ent['y2'] - ent['y1']) ** 2)
            c.setFont('Helvetica', 6)
            c.drawCentredString(mp_x, mp_y + 3, f'{d:.0f}')

        elif etype == 'door':
            # Simple door arc representation
            px, py = tx(ent['x']), ty(ent['y'])
            dw = ent.get('width', 900) * mm * s
            c.line(px, py, px + dw, py)
            c.arc(px - dw * 0.1, py - dw * 0.1, px + dw * 1.1, py + dw * 1.1, 0, 90)

        elif etype == 'window':
            px, py = tx(ent['x']), ty(ent['y'])
            ww = ent.get('width', 1200) * mm * s
            c.setLineWidth(0.5)
            c.line(px, py - 2, px + ww, py - 2)
            c.line(px, py + 2, px + ww, py + 2)
            c.line(px, py - 2, px, py + 2)
            c.line(px + ww, py - 2, px + ww, py + 2)

        elif etype == 'hatch':
            pts = ent.get('boundary', [])
            if len(pts) >= 3:
                path = c.beginPath()
                path.moveTo(tx(pts[0]['x']), ty(pts[0]['y']))
                for p in pts[1:]:
                    path.lineTo(tx(p['x']), ty(p['y']))
                path.close()
                c.setStrokeColor(RL['gray'])
                c.drawPath(path, stroke=1, fill=0)
                # Hatch lines
                angle = ent.get('angle', math.pi / 4)
                hscale = ent.get('scale', 1)
                bx0h = min(p['x'] for p in pts)
                by0h = min(p['y'] for p in pts)
                bx1h = max(p['x'] for p in pts)
                by1h = max(p['y'] for p in pts)
                spacing = max(2, 4 * hscale)
                c.setLineWidth(0.15)
                y_pos = by0h
                while y_pos <= by1h:
                    c.line(tx(bx0h), ty(y_pos), tx(bx1h), ty(y_pos))
                    y_pos += spacing / (mm * s) if mm * s > 0 else spacing

        elif etype == 'room':
            pts = ent.get('points', [])
            if len(pts) >= 3:
                path = c.beginPath()
                path.moveTo(tx(pts[0]['x']), ty(pts[0]['y']))
                for p in pts[1:]:
                    path.lineTo(tx(p['x']), ty(p['y']))
                path.close()
                c.setStrokeColor(RL['gray'])
                c.setDash(3, 2)
                c.drawPath(path, stroke=1, fill=0)
                c.setDash()
                # Room label
                center_x = sum(p['x'] for p in pts) / len(pts)
                center_y = sum(p['y'] for p in pts) / len(pts)
                c.setFont('Helvetica', 7)
                c.setFillColor(RL['black'])
                name = ent.get('name', 'Room')
                area = ent.get('area', 0)
                c.drawCentredString(tx(center_x), ty(center_y), f'{name}')
                c.drawCentredString(tx(center_x), ty(center_y) - 8, f'{area:.1f} m²')

        # MEP devices — draw a small symbol
        elif etype in ('sprinkler', 'diffuser', 'outlet', 'switch_mep',
                       'panel_board', 'transformer', 'valve', 'pump'):
            px, py = tx(ent['x']), ty(ent['y'])
            sz = 3 * mm
            c.circle(px, py, sz, stroke=1, fill=0)
            c.setFont('Helvetica', 4)
            c.drawCentredString(px, py - 1.5, etype[0].upper())

        # Point
        elif etype == 'point':
            px, py = tx(ent['x']), ty(ent['y'])
            c.circle(px, py, 1, stroke=1, fill=1)

    c.showPage()
    c.save()
    return out_path


# ── Minimal PDF writer (no reportlab) ──────────────────────────────────────

def _export_minimal(data: dict, out_path: str) -> str:
    """Minimal PDF export without reportlab — basic lines and text."""
    entities = data.get('entities', [])
    paper = data.get('paperSize', 'A3')
    orient = data.get('orientation', 'landscape')
    title = data.get('title', 'ArchFlow Drawing')

    pw, ph = PAPER_SIZES_PT.get(paper, PAPER_SIZES_PT['A3'])
    if orient == 'landscape':
        pw, ph = max(pw, ph), min(pw, ph)
    else:
        pw, ph = min(pw, ph), max(pw, ph)

    bx0, by0, bx1, by1 = _bounds(entities)
    ew = max(bx1 - bx0, 1)
    eh = max(by1 - by0, 1)
    margin = 40
    daw = pw - 2 * margin
    dah = ph - 2 * margin - 60  # reserve title block
    s = min(daw / (ew * mm), dah / (eh * mm))

    def tx(x_mm: float) -> float:
        return margin + (x_mm - bx0) * mm * s

    def ty(y_mm: float) -> float:
        return ph - margin - 60 - (y_mm - by0) * mm * s

    lines_pdf: list[str] = []
    stream_ops: list[str] = []

    # Border
    stream_ops.append(f'0.5 w')
    stream_ops.append(f'{margin} {margin} {pw - 2*margin} {ph - 2*margin} re S')

    # Title block
    tb_y = margin
    stream_ops.append(f'{pw - margin - 200} {tb_y} 200 50 re S')
    # Title text
    stream_ops.append('BT')
    stream_ops.append('/F1 10 Tf')
    stream_ops.append(f'{pw - margin - 195} {tb_y + 35} Td')
    safe_title = title.replace('(', '\\(').replace(')', '\\)')
    stream_ops.append(f'({safe_title}) Tj')
    stream_ops.append('ET')

    stream_ops.append('0.3 w')
    for ent in entities:
        etype = ent.get('type', '')
        if etype == 'line' or etype == 'wall':
            x1, y1 = tx(ent['x1']), ty(ent['y1'])
            x2, y2 = tx(ent['x2']), ty(ent['y2'])
            lw = 0.5 if etype == 'wall' else 0.3
            stream_ops.append(f'{lw} w')
            stream_ops.append(f'{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S')
        elif etype == 'circle':
            cx, cy = tx(ent['cx']), ty(ent['cy'])
            r = ent.get('r', ent.get('radius', 0)) * mm * s
            # Approximate circle with cubic Bezier
            k = 0.5522847498
            stream_ops.append(f'{cx+r:.2f} {cy:.2f} m')
            stream_ops.append(f'{cx+r:.2f} {cy+r*k:.2f} {cx+r*k:.2f} {cy+r:.2f} {cx:.2f} {cy+r:.2f} c')
            stream_ops.append(f'{cx-r*k:.2f} {cy+r:.2f} {cx-r:.2f} {cy+r*k:.2f} {cx-r:.2f} {cy:.2f} c')
            stream_ops.append(f'{cx-r:.2f} {cy-r*k:.2f} {cx-r*k:.2f} {cy-r:.2f} {cx:.2f} {cy-r:.2f} c')
            stream_ops.append(f'{cx+r*k:.2f} {cy-r:.2f} {cx+r:.2f} {cy-r*k:.2f} {cx+r:.2f} {cy:.2f} c S')
        elif etype == 'rectangle':
            rx, ry = tx(ent['x']), ty(ent['y'] + ent.get('height', 0))
            rw = ent.get('width', 0) * mm * s
            rh = ent.get('height', 0) * mm * s
            stream_ops.append(f'{rx:.2f} {ry:.2f} {rw:.2f} {rh:.2f} re S')
        elif etype in ('polyline', 'polygon'):
            pts = ent.get('points', [])
            if len(pts) >= 2:
                stream_ops.append(f'{tx(pts[0]["x"]):.2f} {ty(pts[0]["y"]):.2f} m')
                for p in pts[1:]:
                    stream_ops.append(f'{tx(p["x"]):.2f} {ty(p["y"]):.2f} l')
                if ent.get('closed') or etype == 'polygon':
                    stream_ops.append('h S')
                else:
                    stream_ops.append('S')
        elif etype == 'text':
            px, py = tx(ent['x']), ty(ent['y'])
            h = max(4, min(24, ent.get('height', 200) * mm * s * 0.3))
            content = str(ent.get('content', '')).replace('(', '\\(').replace(')', '\\)')
            stream_ops.append('BT')
            stream_ops.append(f'/F1 {h:.1f} Tf')
            stream_ops.append(f'{px:.2f} {py:.2f} Td')
            stream_ops.append(f'({content}) Tj')
            stream_ops.append('ET')
        elif etype == 'dimension':
            x1, y1 = tx(ent['x1']), ty(ent['y1'])
            x2, y2 = tx(ent['x2']), ty(ent['y2'])
            stream_ops.append(f'{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S')
            d = math.sqrt((ent['x2'] - ent['x1']) ** 2 + (ent['y2'] - ent['y1']) ** 2)
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            dim_text = f'{d:.0f}'.replace('(', '\\(').replace(')', '\\)')
            stream_ops.append(f'BT /F1 5 Tf {mx:.2f} {my + 3:.2f} Td ({dim_text}) Tj ET')

    # Build PDF file
    stream_content = '\n'.join(stream_ops)
    stream_bytes = stream_content.encode('latin-1')

    objects: list[str] = []
    # Obj 1: Catalog
    objects.append('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj')
    # Obj 2: Pages
    objects.append('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj')
    # Obj 3: Page
    objects.append(f'3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pw:.2f} {ph:.2f}] '
                   f'/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj')
    # Obj 4: Contents stream
    objects.append(f'4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n{stream_content}\nendstream\nendobj')
    # Obj 5: Font
    objects.append('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj')

    # Write PDF
    with open(out_path, 'wb') as f:
        f.write(b'%PDF-1.4\n')
        offsets = []
        for obj in objects:
            offsets.append(f.tell())
            f.write(obj.encode('latin-1'))
            f.write(b'\n')
        xref_offset = f.tell()
        f.write(b'xref\n')
        f.write(f'0 {len(objects) + 1}\n'.encode())
        f.write(b'0000000000 65535 f \n')
        for off in offsets:
            f.write(f'{off:010d} 00000 g \n'.encode())
        f.write(b'trailer\n')
        f.write(f'<< /Size {len(objects) + 1} /Root 1 0 R >>\n'.encode())
        f.write(b'startxref\n')
        f.write(f'{xref_offset}\n'.encode())
        f.write(b'%%EOF\n')

    return out_path


# ── Command dispatch ───────────────────────────────────────────────────────

def cmd_check(_: dict) -> dict:
    return {'ok': True, 'reportlab': HAVE_REPORTLAB, 'version': '1.0.0'}


def cmd_export_pdf(params: dict) -> dict:
    """Export floor data to PDF.
    params: { floor: {...}, outPath: str, paperSize?, orientation?, title?, scale?, drawnBy? }
    """
    floor = params.get('floor', {})
    out_path = params.get('outPath', 'output.pdf')
    data = {
        'entities': floor.get('entities', []),
        'paperSize': params.get('paperSize', 'A3'),
        'orientation': params.get('orientation', 'landscape'),
        'title': params.get('title', 'ArchFlow Drawing'),
        'scale': params.get('scale', '1:100'),
        'drawnBy': params.get('drawnBy', 'ArchFlow'),
    }

    if HAVE_REPORTLAB:
        result = _export_reportlab(data, out_path)
    else:
        result = _export_minimal(data, out_path)

    return {'ok': True, 'path': result, 'engine': 'reportlab' if HAVE_REPORTLAB else 'minimal'}


DISPATCH = {
    'check': cmd_check,
    'export_pdf': cmd_export_pdf,
}


def main():
    raw = sys.stdin.read()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {e}'}))
        sys.exit(1)

    command = req.get('command', 'check')
    params = req.get('params', {})
    handler = DISPATCH.get(command)
    if not handler:
        print(json.dumps({'error': f'Unknown command: {command}'}))
        sys.exit(1)

    try:
        result = handler(params)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
