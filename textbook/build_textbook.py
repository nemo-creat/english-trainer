# -*- coding: utf-8 -*-
"""Сборка PDF-учебника: python3 build_textbook.py <выходной.pdf>
Слова и фразы берутся из ../cards.json, остальное из content.py."""
import json
import os
import sys
import zlib
from collections import Counter

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, KeepTogether, NextPageTemplate, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import content as C  # noqa: E402

FONT_DIR = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FONT_DIR + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B", FONT_DIR + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DV-I", FONT_DIR + "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("DV-BI", FONT_DIR + "DejaVuSans-BoldOblique.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV-I", boldItalic="DV-BI")

ACCENT = colors.HexColor("#0B6FA4")
INK = colors.HexColor("#1F2933")
MUTED = colors.HexColor("#6B7785")
RED = colors.HexColor("#C0392B")
LINE = colors.HexColor("#D5DCE4")
BG_RULE, BG_WARN, BG_TIP, BG_ZEBRA = (colors.HexColor(x) for x in ("#EAF4FB", "#FDEDEC", "#FFF8E1", "#F5F7FA"))

W, H = A4
LM = RM = 20 * mm
TM, BM = 20 * mm, 20 * mm
CW = W - LM - RM  # ширина содержимого


def S(name, **kw):
    base = dict(fontName="DV", fontSize=10.2, leading=15, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


ST = {
    "body": S("body", spaceAfter=6),
    "cell": S("cell", fontSize=9.4, leading=13),
    "cellh": S("cellh", fontName="DV-B", fontSize=9.2, leading=12, textColor=colors.white),
    "part": S("PartTitle", fontName="DV-B", fontSize=22, leading=28, textColor=ACCENT, spaceBefore=0, spaceAfter=10),
    "chapter": S("ChapterTitle", fontName="DV-B", fontSize=18, leading=23, textColor=ACCENT, spaceBefore=4, spaceAfter=4),
    "intro": S("intro", fontName="DV-I", fontSize=10.5, textColor=MUTED, spaceAfter=10),
    "h2": S("h2", fontName="DV-B", fontSize=12, leading=16, spaceBefore=10, spaceAfter=5),
    "box": S("box", fontSize=10, leading=14.5),
    "boxlabel": S("boxlabel", fontName="DV-B", fontSize=8.5, leading=11, textColor=ACCENT),
    "small": S("small", fontSize=8.5, leading=11, textColor=MUTED),
    "cover1": S("cover1", fontName="DV-B", fontSize=34, leading=42, textColor=ACCENT, alignment=TA_LEFT),
    "cover2": S("cover2", fontSize=15, leading=22, textColor=INK),
    "cover3": S("cover3", fontSize=10, leading=15, textColor=MUTED),
    "toc": S("toc", fontName="DV-B", fontSize=22, leading=28, textColor=ACCENT, spaceAfter=12),
}


def m(s):
    """Разметка [[en]] и {{ошибка}} → теги reportlab."""
    s = s.replace("&", "&amp;")
    s = s.replace("[[", '<font color="#0B6FA4"><b>').replace("]]", "</b></font>")
    s = s.replace("{{", '<font color="#C0392B"><strike>').replace("}}", "</strike></font>")
    return s.replace("\n", "<br/>")


def para(s, style="body"):
    return Paragraph(m(s), ST[style])


def box(label, paragraphs, bg, bar):
    inner = [Paragraph(label, ST["boxlabel"])] + paragraphs
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def table(headers, rows, fracs, style_cell="cell", zebra=True):
    widths = [CW * f for f in fracs]
    data = [[Paragraph(m(h), ST["cellh"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(m(c), ST[style_cell]) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if zebra:
        for i in range(2, len(data), 2):
            cmds.append(("BACKGROUND", (0, i), (-1, i), BG_ZEBRA))
    t.setStyle(TableStyle(cmds))
    return t


def blocks_to_flowables(blocks):
    out = []
    for b in blocks:
        kind = b[0]
        if kind == "p":
            out.append(para(b[1]))
        elif kind == "rule":
            out.append(box("ПРАВИЛО", [para(b[1], "box")], BG_RULE, ACCENT))
            out.append(Spacer(1, 6))
        elif kind == "tip":
            out.append(box("ЗАПОМНИ", [para(b[1], "box")], BG_TIP, colors.HexColor("#F0B429")))
            out.append(Spacer(1, 6))
        elif kind == "bullets":
            for item in b[1]:
                out.append(para("•  " + item))
        elif kind == "ex":
            rows = [["[[%s]]" % en, ru] for en, ru in b[1]]
            t = Table([[Paragraph(m(a), ST["cell"]), Paragraph(m(c), ST["cell"])] for a, c in rows],
                      colWidths=[CW * 0.55, CW * 0.45])
            t.setStyle(TableStyle([
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            out += [t, Spacer(1, 7)]
        elif kind == "warn":
            ps = []
            for wrong, right, why in b[1]:
                ps.append(Paragraph(m("✗ {{%s}}<br/>✓ [[%s]]<br/><font color='#6B7785' size='8.8'>%s</font>" % (wrong, right, why)),
                                    ST["box"]))
                ps.append(Spacer(1, 3))
            out.append(box("ТИПИЧНАЯ ОШИБКА", ps, BG_WARN, RED))
            out.append(Spacer(1, 6))
        elif kind == "table":
            out += [table(b[1], b[2], b[3]), Spacer(1, 8)]
        else:
            raise ValueError(kind)
    return out


class Doc(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
                         title="Английский с Claude: учебник Сергея", author="Claude и Сергей",
                         subject="Правила, слова и разбор ошибок по ходу занятий", **kw)
        self._n = 0

    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name in ("PartTitle", "ChapterTitle"):
            level = 0 if f.style.name == "PartTitle" else 1
            text = f.getPlainText()
            key = "toc_%08x" % (zlib.crc32(text.encode("utf-8")) & 0xFFFFFFFF)  # стабильный ключ между проходами
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level, 0)
            self.notify("TOCEntry", (level, text, self.page, key))


def footer(canv, doc):
    canv.saveState()
    canv.setStrokeColor(LINE)
    canv.line(LM, 14 * mm, W - RM, 14 * mm)
    canv.setFont("DV", 8)
    canv.setFillColor(MUTED)
    canv.drawString(LM, 9.5 * mm, "Английский с Claude · учебник Сергея · " + C.VERSION)
    canv.drawRightString(W - RM, 9.5 * mm, "стр. %d" % doc.page)
    canv.restoreState()


def cover(canv, doc):
    canv.saveState()
    canv.setFillColor(ACCENT)
    canv.rect(0, H - 14 * mm, W, 14 * mm, stroke=0, fill=1)
    canv.restoreState()


def build(out_path):
    cards = json.load(open(os.path.join(HERE, "..", "cards.json"), encoding="utf-8"))["cards"]
    words = {c["id"][2:]: c for c in cards if c["type"] == "word"}
    phrases = [c for c in cards if c["type"] == "phrase"]
    by_type = Counter(c["type"] for c in cards)
    by_lesson = Counter(c["lesson"] for c in cards)

    doc = Doc(out_path)
    frame = Frame(LM, BM, CW, H - TM - BM, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=cover),
        PageTemplate(id="main", frames=[frame], onPage=footer),
    ])

    story = []
    # --- обложка
    story += [Spacer(1, 60 * mm), Paragraph("Английский<br/>с Claude", ST["cover1"]), Spacer(1, 8 * mm),
              Paragraph("Учебник Сергея", ST["cover2"]),
              Paragraph("Правила, слова и разбор ошибок. Растёт вместе с нашими занятиями.", ST["cover3"]),
              Spacer(1, 90 * mm), Paragraph(C.VERSION, ST["cover3"]),
              Paragraph("Карточек в приложении: %d (слов %d, фраз %d, пропусков %d, правил %d)" % (
                  len(cards), by_type["word"], by_type["phrase"], by_type["cloze"], by_type["rule"]), ST["cover3"]),
              NextPageTemplate("main"), PageBreak()]

    # --- оглавление
    toc = TableOfContents()
    toc.levelStyles = [
        S("toc0", fontName="DV-B", fontSize=11, leading=18, spaceBefore=8, textColor=ACCENT),
        S("toc1", fontSize=10, leading=15, leftIndent=12),
    ]
    toc.dotsMinLevel = 0
    story += [Paragraph("Оглавление", ST["toc"]), toc, PageBreak()]

    # --- о учебнике
    story += [Paragraph("О учебнике", ST["part"])] + blocks_to_flowables(C.PREFACE) + [PageBreak()]

    # --- часть I. грамматика
    story += [Paragraph("Часть I. Грамматика", ST["part"]),
              para("Номера глав 1–8 совпадают с нашим стартовым набором из восьми правил.", "intro")]
    for ch in C.CHAPTERS:
        story.append(CondPageBreak(80 * mm))  # новая глава с новой страницы, если места мало
        mark = "✓" if ch["status"] == "done" else "○"
        story.append(Paragraph("%d. %s  %s" % (ch["n"], ch["title"], mark), ST["chapter"]))
        story.append(para(ch["intro"], "intro"))
        for i, sec in enumerate(ch["sections"], 1):
            head = Paragraph("%d.%d  %s" % (ch["n"], i, m(sec["h"])), ST["h2"])
            fl = blocks_to_flowables(sec["blocks"])
            story.append(KeepTogether([head] + fl[:1]))
            story += fl[1:]
    story.append(PageBreak())

    # --- часть II. словарь
    story += [Paragraph("Часть II. Словарь по темам", ST["part"]),
              para("Слова берутся из приложения: когда на занятии появляется новое слово, оно попадает и в карточки, и сюда.", "intro")]
    used = set()
    for theme, ids in C.VOCAB_THEMES:
        rows = []
        for i in ids:
            c = words[i]
            used.add(i)
            ex = "%s<br/><font color='#6B7785'>%s</font>" % (c.get("ex", ""), c.get("exRu", "")) if c.get("ex") else ""
            rows.append(["[[%s]]" % c["en"], c["ru"], ex])
        story += [CondPageBreak(55 * mm), Paragraph(m(theme), ST["h2"]), table(["English", "Перевод", "Пример"], rows, [0.2, 0.3, 0.5]), Spacer(1, 6)]
    rest = [words[i] for i in words if i not in used]
    if rest:
        rows = [["[[%s]]" % c["en"], c["ru"], c.get("ex", "")] for c in rest]
        story += [Paragraph("Новые слова (ещё без темы)", ST["h2"]), table(["English", "Перевод", "Пример"], rows, [0.2, 0.3, 0.5])]
    story.append(PageBreak())

    # --- часть III. фразы
    story += [Paragraph("Часть III. Фразы", ST["part"]),
              para("Готовые предложения из наших диалогов. Их удобно повторять вслух.", "intro")]
    rows = [["[[%s]]" % c["en"], c["ru"], c.get("note", "")] for c in phrases]
    story += [table(["English", "Перевод", "Заметка"], rows, [0.38, 0.32, 0.30]), PageBreak()]

    # --- часть IV. ошибки
    story += [Paragraph("Часть IV. Журнал ошибок", ST["part"]),
              para("Ошибки это нормальная часть учёбы. Здесь собраны твои реальные варианты и правильные формы. Последний столбец показывает, где правило.", "intro")]
    rows = [[d, "{{%s}}" % w, "[[%s]]" % r, ref] for d, w, r, ref in C.MISTAKES]
    story += [table(["Дата", "Было", "Стало", "Глава"], rows, [0.09, 0.31, 0.38, 0.22]), PageBreak()]

    # --- часть V. журнал занятий
    story += [Paragraph("Часть V. Журнал занятий", ST["part"])]
    rows = []
    for d, t, what in C.LESSONS:
        key = {"12 ноября": "2026-11-12", "13 ноября": "2026-11-13", "14 ноября": "2026-11-14"}.get(d)
        n = by_lesson.get(key, 0)
        rows.append([d, "<b>%s</b>" % t, what + ("<br/><font color='#6B7785'>Новых карточек: %d</font>" % n if n else "")])
    story += [table(["Дата", "Тема", "Что прошли"], rows, [0.16, 0.22, 0.62]),
              Spacer(1, 10), Paragraph("Что дальше", ST["h2"])]
    for s in C.NEXT_STEPS:
        story.append(para("•  " + s))

    doc.multiBuild(story)
    return out_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "textbook.pdf"
    print(build(out))
