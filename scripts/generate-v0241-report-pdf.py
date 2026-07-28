from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reports" / "JiraActivityAnalyzer_v0.2.41_implementation_report.md"
OUTPUT = ROOT / "reports" / "JiraActivityAnalyzer_v0.2.41_implementation_report.pdf"
FONT_PATH = Path("C:/Windows/Fonts/NotoSansTC-VF.ttf")

if not FONT_PATH.exists():
    raise SystemExit(f"Required report font is missing: {FONT_PATH}")

pdfmetrics.registerFont(TTFont("NotoTC", str(FONT_PATH)))
base = getSampleStyleSheet()
body = ParagraphStyle(
    "BodyTC", parent=base["BodyText"], fontName="NotoTC", fontSize=8.7,
    leading=13, textColor=colors.HexColor("#243247"), spaceAfter=5
)
heading1 = ParagraphStyle(
    "H1TC", parent=body, fontSize=20, leading=26,
    textColor=colors.HexColor("#0B3A75"), alignment=TA_CENTER, spaceAfter=14
)
heading2 = ParagraphStyle(
    "H2TC", parent=body, fontSize=13, leading=17,
    textColor=colors.HexColor("#0F5DB8"), spaceBefore=10, spaceAfter=6
)
bullet = ParagraphStyle("BulletTC", parent=body, leftIndent=12, firstLineIndent=-7)
small = ParagraphStyle("SmallTC", parent=body, fontSize=7.2, leading=10)


def footer(canvas, document):
    canvas.saveState()
    canvas.setFont("NotoTC", 7)
    canvas.setFillColor(colors.HexColor("#667085"))
    canvas.drawString(18 * mm, 10 * mm, "Jira Activity Analyzer v0.2.41 - Implementation Report")
    canvas.drawRightString(192 * mm, 10 * mm, f"Page {document.page}")
    canvas.restoreState()


def table_cell(value, header=False):
    style = ParagraphStyle(
        "Cell", parent=small, leading=9,
        textColor=colors.white if header else colors.HexColor("#243247")
    )
    return Paragraph(escape(value).replace("`", ""), style)


def build_story():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            story.append(Spacer(1, 2.5 * mm))
            index += 1
            continue
        if line.startswith("# "):
            story.append(Paragraph(escape(line[2:]), heading1))
            index += 1
            continue
        if line.startswith("## "):
            story.append(Paragraph(escape(line[3:]), heading2))
            index += 1
            continue
        if line.startswith("|") and index + 1 < len(lines) and lines[index + 1].strip().startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                raw = [part.strip() for part in lines[index].strip().strip("|").split("|")]
                if all(set(part) <= set("-:") for part in raw):
                    index += 1
                    continue
                rows.append(raw)
                index += 1
            column_count = max(len(row) for row in rows)
            data = []
            for row_index, row in enumerate(rows):
                row += [""] * (column_count - len(row))
                data.append([table_cell(value, row_index == 0) for value in row])
            table = Table(data, colWidths=[174 * mm / column_count] * column_count, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#155FB8")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B8C5D6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FC")])
            ]))
            story.extend([table, Spacer(1, 3 * mm)])
            continue
        if line.startswith("- "):
            story.append(Paragraph("- " + escape(line[2:]).replace("`", ""), bullet))
            index += 1
            continue
        story.append(Paragraph(escape(line).replace("`", ""), body))
        index += 1
    return story


document = SimpleDocTemplate(
    str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
    topMargin=16 * mm, bottomMargin=17 * mm,
    title="Jira Activity Analyzer v0.2.41 Implementation Report", author="Codex"
)
document.build(build_story(), onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
