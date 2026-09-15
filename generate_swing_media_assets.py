#!/usr/bin/env python3
from pathlib import Path
import base64, shutil, subprocess, textwrap, wave
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "swing-trading"
WORK = ROOT / ".swing_media_work"
PDF_B64 = ROOT / "Vixale_Trading_Guide.pdf.b64"
W, H = 1280, 720
GREEN = (8, 122, 72)
DARK = (16, 23, 19)
MUTED = (94, 108, 101)
BG = (248, 251, 249)
LINE = (221, 232, 226)
WARN = (255, 247, 231)
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SCENES = [
("How to Follow Vixale Swing Trading", "Potential Candidates -> Active Portfolio -> Closed Trades", "Vixale Swing Trading is a research and model-portfolio system. This walkthrough explains what the public portfolio means and how a user can follow it in a broker account. The website does not place orders in your broker account, and this guide does not reveal Vixale's proprietary selection method."),
("Potential Candidates -> Active Portfolio -> Closed Trades", "Potential Candidates = watch. Active Portfolio = act. Closed Trades = completed model positions.", "Potential Candidates are stocks under research review. They are not trade entries. Do not buy a stock just because it appears there, and do not treat a high Research Score as a buy instruction. Research Score is simply a proprietary Vixale research metric shown from zero to one hundred. Active Portfolio is different. When a symbol appears there, that addition is the actionable portfolio event. Closed Trades contains model positions that have exited."),
("One portfolio update per trading day", "10:00-11:00 AM ET", "The Swing Trading portfolio is updated once per trading day during the ten A M to eleven A M Eastern Time window. After the updated portfolio is published, check Active Portfolio for additions and removals. Act on those changes as soon as practical. Potential Candidates remain watch-only until they actually move into Active Portfolio."),
("ACTIVE PORTFOLIO = ACTION", "+10% target from your actual broker fill", "For a new addition, enter the position as soon as practical, then record your actual broker fill price. Your profit target is based on that real fill, not on a website quote. Multiply the actual entry price by one point one zero to calculate the plus ten percent profit target. After entry, place a good-till-canceled sell limit at approximately that target."),
("HOOD EXAMPLE", "+10% target may fill intraday", "HOOD is the profit-target example. Conceptually, HOOD enters Active Portfolio, the user enters the position, and a plus ten percent G T C sell limit is calculated from the user's actual fill. If HOOD reaches that target during the trading day, the target can execute intraday. The completed model position then appears in Closed Trades with the exit reason target."),
("FCX EXAMPLE", "The -5% rule is a morning-review rule", "F C X illustrates the stop rule. Multiply the user's actual entry price by zero point nine five to calculate the five percent stop reference. This is not an automatic intraday stop-loss order. The stop condition is evaluated during the scheduled morning review. If the current review price is more than five percent below the user's entry, close the position at market as soon as practical."),
("MU EXAMPLE", "Research removal is also an exit instruction", "M U shows the third exit path. A position does not have to reach the plus ten percent target or the five percent morning stop before it can leave the model portfolio. If the symbol no longer satisfies Vixale's research requirements, Trading Lab can remove it from Active Portfolio. That removal is the exit instruction. Close the position at market as soon as practical."),
("Target, morning stop, or research removal", "Keep the three paths separate", "The profit target is plus ten percent from the user's actual entry and may execute intraday through a G T C sell limit. The stop reference is five percent below actual entry, but it is evaluated during the morning review, not as an intraday stop order. Research removal is independent of both price thresholds."),
("CHECK -> ADD -> MANAGE -> REMOVE", "Potential Candidates = watch. Active Portfolio = act. Removed = exit.", "The beginner routine is check, add, manage, remove. Check the updated portfolio during the ten to eleven A M Eastern update window. Add a new symbol when it appears in Active Portfolio. Manage the plus ten percent target from your actual entry and perform the scheduled morning stop check. Remove the position promptly when Vixale removes it from Active Portfolio."),
("Follow the portfolio. Keep execution in your control.", "Educational model-portfolio guide", "Vixale Swing Trading is a research and model-portfolio system. These examples are educational. Actual fills and execution prices may differ, and trading involves risk. Always verify the symbol, quantity, order type, and your broker fill before placing a target or closing a position."),
]

def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def wrap(draw, text, fnt, width):
    words = text.split()
    lines, cur = [], ""
    for word in words:
        test = (cur + " " + word).strip()
        if draw.textlength(test, font=fnt) <= width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines

def slide(title, subtitle, index):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 9), fill=GREEN)
    d.text((72, 56), f"VIXALE  /  SWING TRADING  /  {index:02d}", fill=GREEN, font=font(18, True))
    y = 122
    tf = font(48, True)
    for line in wrap(d, title, tf, W - 144):
        d.text((72, y), line, fill=DARK, font=tf)
        y += 62
    sf = font(26)
    y += 18
    for line in wrap(d, subtitle, sf, W - 144):
        d.text((72, y), line, fill=MUTED, font=sf)
        y += 38
    if index == 2:
        boxes = [("POTENTIAL CANDIDATES", "WATCH"), ("ACTIVE PORTFOLIO", "ACT"), ("CLOSED TRADES", "REVIEW")]
        bx, by, bw, bh = 72, 390, 340, 150
        for i, (a, b) in enumerate(boxes):
            x = bx + i * (bw + 42)
            d.rounded_rectangle((x, by, x + bw, by + bh), radius=18, fill=(255, 255, 255), outline=LINE, width=2)
            d.text((x + 24, by + 28), a, fill=MUTED, font=font(17, True))
            d.text((x + 24, by + 78), b, fill=GREEN, font=font(34, True))
            if i < 2:
                d.text((x + bw + 8, by + 58), "->", fill=GREEN, font=font(34, True))
    elif index == 3:
        d.rounded_rectangle((72, 410, 1208, 540), radius=22, fill=(255, 255, 255), outline=LINE, width=2)
        d.text((108, 445), "UPDATE WINDOW", fill=MUTED, font=font(18, True))
        d.text((108, 485), "10:00-11:00 AM ET", fill=GREEN, font=font(40, True))
    elif index in (5, 6, 7):
        labels = {
            5: ("TARGET", "+10% GTC SELL LIMIT", "May execute intraday"),
            6: ("STOP REFERENCE", "5% BELOW ACTUAL ENTRY", "Evaluate during morning review"),
            7: ("RESEARCH REMOVAL", "REMOVED FROM ACTIVE PORTFOLIO", "Exit at market as soon as practical"),
        }[index]
        d.rounded_rectangle((72, 405, 1208, 565), radius=22, fill=(255, 255, 255), outline=LINE, width=2)
        d.text((106, 435), labels[0], fill=MUTED, font=font(18, True))
        d.text((106, 478), labels[1], fill=DARK, font=font(30, True))
        d.text((106, 525), labels[2], fill=GREEN, font=font(20, True))
        if index == 6:
            d.rounded_rectangle((320, 585, 960, 650), radius=16, fill=WARN, outline=(236, 214, 174), width=2)
            d.text((378, 602), "NOT AN INTRADAY STOP ORDER", fill=(119, 87, 40), font=font(22, True))
    elif index == 8:
        labels = [("+10% TARGET", "INTRADAY-CAPABLE"), ("-5% STOP REF", "MORNING REVIEW"), ("RESEARCH REMOVAL", "INDEPENDENT EXIT")]
        for i, (a, b) in enumerate(labels):
            x = 72 + i * 380
            d.rounded_rectangle((x, 410, x + 350, 550), radius=18, fill=(255, 255, 255), outline=LINE, width=2)
            d.text((x + 22, 440), a, fill=DARK, font=font(18, True))
            d.text((x + 22, 490), b, fill=GREEN, font=font(21, True))
    elif index == 9:
        labels = ["CHECK", "ADD", "MANAGE", "REMOVE"]
        for i, a in enumerate(labels):
            x = 72 + i * 285
            d.ellipse((x, 420, x + 145, 565), fill=(255, 255, 255), outline=GREEN, width=3)
            d.text((x + 22, 473), a, fill=DARK, font=font(22, True))
            if i < 3:
                d.text((x + 175, 468), "->", fill=GREEN, font=font(30, True))
    d.text((72, 676), "VIXALE • SWING TRADING", fill=MUTED, font=font(14))
    d.text((1000, 676), "Educational model-portfolio guide", fill=MUTED, font=font(14))
    return im

def run(cmd):
    subprocess.run(cmd, check=True)

def audio_duration(wav_path):
    with wave.open(str(wav_path), "rb") as w:
        return w.getnframes() / float(w.getframerate())

def fmt_vtt(sec):
    ms = int(round(sec * 1000))
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def generate_media():
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("how-to-follow-vixale-swing-trading.mp4.b64.part*"):
        p.unlink()
    segments = []
    vtt = ["WEBVTT", ""]
    start = 0.0
    tts = shutil.which("espeak-ng") or shutil.which("espeak")
    if not tts:
        raise RuntimeError("espeak/espeak-ng required")
    for i, (title, subtitle, narration) in enumerate(SCENES, 1):
        png = WORK / f"slide-{i:02d}.png"
        wav = WORK / f"scene-{i:02d}.wav"
        mp4 = WORK / f"scene-{i:02d}.mp4"
        slide(title, subtitle, i).save(png)
        run([tts, "-v", "en-us", "-s", "148", "-w", str(wav), narration])
        dur = audio_duration(wav) + 0.35
        run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", str(png), "-i", str(wav), "-t", f"{dur:.3f}", "-vf", "scale=960:540,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-tune", "stillimage", "-c:a", "aac", "-b:a", "24k", "-shortest", str(mp4)])
        segments.append(mp4)
        end = start + dur
        vtt += [str(i), f"{fmt_vtt(start)} --> {fmt_vtt(end)}", narration, ""]
        start = end
    concat = WORK / "concat.txt"
    concat.write_text("".join(f"file '{p.as_posix()}'\n" for p in segments))
    final = WORK / "how-to-follow-vixale-swing-trading.mp4"
    run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(final)])
    data = base64.b64encode(final.read_bytes()).decode()
    chunk = 180000
    for n, pos in enumerate(range(0, len(data), chunk), 1):
        (OUT / f"how-to-follow-vixale-swing-trading.mp4.b64.part{n:02d}").write_text(data[pos:pos + chunk])
    poster = WORK / "poster.jpg"
    slide(*SCENES[0][:2], 1).resize((1280, 720)).save(poster, quality=80, optimize=True)
    (OUT / "how-to-follow-vixale-swing-trading-poster.jpg.b64").write_text(base64.b64encode(poster.read_bytes()).decode())
    (OUT / "how-to-follow-vixale-swing-trading.en.vtt").write_text("\n".join(vtt), encoding="utf-8")

def pdf_text(c, x, y, text, size=10, bold=False, color="#425049", leading=14, width=72):
    c.setFillColor(HexColor(color))
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    for para in text.split("\n"):
        lines = textwrap.wrap(para, width=width) or [""]
        for line in lines:
            c.drawString(x, y, line)
            y -= leading
        y -= 3
    return y

def pdf_header(c, kicker, title, subtitle):
    c.setFillColor(HexColor("#087a48"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(54, 742, kicker.upper())
    c.setFillColor(HexColor("#101713"))
    c.setFont("Helvetica-Bold", 24)
    c.drawString(54, 710, title)
    return pdf_text(c, 54, 685, subtitle, 10, color="#68756e", width=86)

def pdf_footer(c, page):
    c.setStrokeColor(HexColor("#dfe8e3"))
    c.line(54, 44, 558, 44)
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#7a8580"))
    c.drawString(54, 28, "Vixale Trading Guide • Educational execution guide")
    c.drawRightString(558, 28, str(page))

def generate_pdf():
    p = WORK / "Vixale_Trading_Guide.pdf"
    c = canvas.Canvas(str(p), pagesize=letter)
    y = pdf_header(c, "Beginner Guide", "How to Trade Vixale", "A beginner-facing execution guide for Day Trading, Swing Trading, and Options. Vixale publishes signals or portfolio instructions; users execute in their own broker platform.")
    y = pdf_text(c, 54, y - 15, "DAY TRADING", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "Signal -> broker execution -> published target -> Stop Ref monitoring. Stop Ref is a close-based reference when specified, not a simple intrabar touch.", 10, width=84)
    y = pdf_text(c, 54, y - 8, "SWING TRADING", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "Once-daily portfolio update during 10:00-11:00 AM ET. Potential Candidates = watch. Active Portfolio = act. Closed Trades = completed model positions.", 10, width=84)
    y = pdf_text(c, 54, y - 8, "OPTIONS", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "Watch 6:00-8:30 PM ET -> sell the instructed ES straddle for credit -> place the buyback target -> follow later hedge, adjustment, or exit instructions.", 10, width=84)
    pdf_footer(c, 1)
    c.showPage()
    y = pdf_header(c, "Prime / Edge", "Day Trading Workflow", "Use the published signal details. The guide explains execution only and does not reveal strategy-generation logic.")
    for n, (h, t) in enumerate([("Receive the signal", "Watch Telegram and/or the Vixale website for the new Prime or Edge signal."), ("Execute in your broker", "Enter the published symbol and entry instruction in your own broker platform."), ("Place the target", "Use the published profit-taking limit."), ("Monitor Stop Ref", "When a Stop Ref is specified, follow the applicable candle-close instruction rather than treating a simple intrabar touch as an automatic broker stop.")], 1):
        y = pdf_text(c, 54, y - 10, f"{n}. {h}", 11, True, "#17211d")
        y = pdf_text(c, 72, y, t, 10, width=80)
    y = pdf_text(c, 54, y - 8, "Example: BUY 100 AAPL @ $300 • TGT $302 • STOP REF $299", 10, True, "#103f2d")
    pdf_footer(c, 2)
    c.showPage()
    y = pdf_header(c, "Swing Trading", "How to Follow Vixale Swing Trading", "The public Swing workflow is based on one daily portfolio update. Exact market prices in examples are intentionally omitted.")
    items = [("Check after the update", "The portfolio is updated once per trading day during 10:00-11:00 AM ET. Review Active Portfolio for additions and removals."), ("Add new Active Portfolio positions", "A new symbol appearing in Active Portfolio is the actionable addition. Enter as soon as practical and record your actual broker fill."), ("Manage the +10% target", "Calculate 1.10 x your actual entry. The target may execute intraday through a GTC sell limit."), ("Apply the morning -5% stop rule", "Calculate 0.95 x actual entry as the stop reference. It is evaluated during the scheduled morning review and is not an automatic intraday stop order."), ("Honor research removal", "Removal from Active Portfolio is an independent exit instruction. Close at market as soon as practical instead of waiting for the target or stop.")]
    for n, (h, t) in enumerate(items, 1):
        y = pdf_text(c, 54, y - 6, f"{n}. {h}", 10.5, True, "#17211d")
        y = pdf_text(c, 72, y, t, 9.5, width=82)
    y = pdf_text(c, 54, y - 5, "HOOD = +10% target example • FCX = morning -5% stop example • MU = research-removal example", 9.5, True, "#087a48", width=86)
    pdf_footer(c, 3)
    c.showPage()
    y = pdf_header(c, "Options • ES Straddles", "Options Workflow", "The beginner Options workflow is the ES short-straddle credit workflow.")
    items = [("Watch 6:00-8:30 PM ET", "Monitor the published Options instruction."), ("SELL the instructed ES straddle", "Open the specified call + put combination for the published credit."), ("Place BUY TO CLOSE target", "Use about 10% below entry credit and round to the nearest 0.25 ES option price increment."), ("Follow updates", "Use later hedge, adjustment, or exit instructions when published.")]
    for n, (h, t) in enumerate(items, 1):
        y = pdf_text(c, 54, y - 8, f"{n}. {h}", 11, True, "#17211d")
        y = pdf_text(c, 72, y, t, 10, width=80)
    y = pdf_text(c, 54, y - 4, "Illustrative example", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "SELL 1 ES straddle @ 33.00 credit\n33.00 x 0.90 = 29.70\nRounded BUY TO CLOSE target = 29.75\nES multiplier = 50\nIllustrative profit if filled = (33.00 - 29.75) x 50 = $162.50", 10, width=80)
    pdf_footer(c, 4)
    c.showPage()
    y = pdf_header(c, "Quick Reference", "Daily Routine", "Use this page as a compact execution reminder.")
    y = pdf_text(c, 54, y - 15, "DAY TRADING", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "Signal -> broker -> published target -> Stop Ref monitoring", 11, width=80)
    y = pdf_text(c, 54, y - 14, "SWING TRADING", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "10:00-11:00 AM ET update -> additions/removals -> +10% GTC target -> scheduled morning -5% stop check -> research removal if published", 11, width=80)
    y = pdf_text(c, 54, y - 14, "OPTIONS", 11, True, "#087a48")
    y = pdf_text(c, 54, y, "6:00-8:30 PM ET -> SELL ES straddle for credit -> BUY TO CLOSE about 10% lower -> follow updates", 11, width=80)
    y = pdf_text(c, 54, y - 18, "Risk reminder", 11, True, "#a33b45")
    y = pdf_text(c, 54, y, "Examples are educational. Actual fills, spreads, commissions, margin requirements, and execution can differ. Trading involves risk and results are not guaranteed.", 10, width=82)
    pdf_footer(c, 5)
    c.save()
    PDF_B64.write_text(base64.b64encode(p.read_bytes()).decode())

if __name__ == "__main__":
    generate_media()
    generate_pdf()
    print("generated", OUT)
