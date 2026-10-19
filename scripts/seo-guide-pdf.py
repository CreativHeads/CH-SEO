"""Plain-language SEO Studio guide. Run: python scripts/seo-guide-pdf.py"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import Color, white, HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, NextPageTemplate, PageBreak,
    Paragraph, Spacer, Table, TableStyle, KeepTogether, ListFlowable, ListItem, Flowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("Body", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", r"C:\Windows\Fonts\segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", r"C:\Windows\Fonts\segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("Light", r"C:\Windows\Fonts\segoeuil.ttf"))

INK = HexColor("#1B1730")
MUTED = HexColor("#5E5872")
PURPLE = HexColor("#4C3BC0")
PURPLE_DEEP = HexColor("#2A2158")
SOFT = HexColor("#F4F1FB")
LINE = HexColor("#E3DEEF")
GREEN = HexColor("#0E6B46")
GREEN_BG = HexColor("#E8F6EF")
AMBER = HexColor("#8A5600")
AMBER_BG = HexColor("#FFF5E6")
RED = HexColor("#9B2330")
RED_BG = HexColor("#FDECEE")
PAGE_W, PAGE_H = A4
LEFT = 18 * mm
RIGHT = 18 * mm
TOP = 22 * mm
BOTTOM = 16 * mm
CONTENT_W = PAGE_W - LEFT - RIGHT

def S(name, **kw):
    base = dict(fontName="Body", fontSize=10.5, leading=15.5, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)

styles = {
    "h1": S("h1", fontName="Body-Bold", fontSize=22, leading=26, textColor=PURPLE_DEEP, spaceAfter=6),
    "lead": S("lead", fontSize=12, leading=17.5, textColor=MUTED, spaceAfter=12),
    "h2": S("h2", fontName="Body-Bold", fontSize=13, leading=17, textColor=PURPLE_DEEP, spaceBefore=2, spaceAfter=4),
    "body": S("body", fontSize=10.5, leading=15.5, spaceAfter=7),
    "small": S("small", fontSize=9, leading=12.5, textColor=MUTED),
    "cardTitle": S("cardTitle", fontName="Body-Bold", fontSize=11, leading=14, textColor=PURPLE_DEEP, spaceAfter=3),
    "cardBody": S("cardBody", fontSize=10, leading=14.2, textColor=INK),
    "step": S("step", fontSize=10.5, leading=14.5),
    "tocItem": S("tocItem", fontSize=11, leading=16),
    "tocNum": S("tocNum", fontName="Body-Bold", fontSize=11, leading=16, textColor=PURPLE),
    "footer": S("footer", fontSize=8, leading=10, textColor=MUTED),
    "eyebrow": S("eyebrow", fontName="Body-Bold", fontSize=8.5, leading=11, textColor=PURPLE, tracking=0.6),
    "coverKicker": S("coverKicker", fontName="Body-Bold", fontSize=9, leading=12, textColor=HexColor("#C9C0F0")),
    "coverTitle": S("coverTitle", fontName="Light", fontSize=36, leading=40, textColor=white),
    "coverSub": S("coverSub", fontSize=13, leading=18, textColor=HexColor("#E4DEF8")),
    "bullet": S("bullet", fontSize=10.5, leading=15, leftIndent=12, bulletIndent=0, spaceAfter=3),
}

def P(text, style="body"):
    return Paragraph(text, styles[style])

def card(title, text, bg=SOFT, bar=PURPLE):
    inner = [
        Paragraph(title, styles["cardTitle"]),
        Paragraph(text, styles["cardBody"]),
    ]
    data = [[inner]]
    t = Table(data, colWidths=[CONTENT_W - 8])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBEFORE", (0, 0), (0, -1), 3.5, bar),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t

class Num(Flowable):
    def __init__(self, n):
        super().__init__()
        self.n = str(n)
        self.width = 16
        self.height = 16
    def draw(self):
        self.canv.setFillColor(PURPLE)
        self.canv.circle(8, 8, 8, fill=1, stroke=0)
        self.canv.setFillColor(white)
        self.canv.setFont("Body-Bold", 8.5)
        self.canv.drawCentredString(8, 5.2, self.n)

def steps(items):
    rows = []
    for i, text in enumerate(items, 1):
        rows.append([Num(i), Paragraph(text, styles["step"])])
    t = Table(rows, colWidths=[22, CONTENT_W - 22])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 6),
        ("LEFTPADDING", (1, 0), (1, -1), 4),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (-1, -1), white),
    ]))
    return t

def bullets(items):
    bits = []
    for item in items:
        bits.append(Paragraph("•  " + item, styles["bullet"]))
    return bits

class HRule(Flowable):
    def __init__(self, color=LINE, space=8):
        super().__init__()
        self.color = color
        self.space = space
        self.height = space
    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(0.6)
        self.canv.line(0, self.space / 2, self.width, self.space / 2)

def feature(num, group, title, lead, blocks, doing):
    story = []
    story.append(Paragraph(f"{num}   ·   {group.upper()}", styles["eyebrow"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(title, styles["h1"]))
    story.append(Paragraph(lead, styles["lead"]))
    for title_, text, tone in blocks:
        bg, bar = SOFT, PURPLE
        if tone == "do":
            bg, bar = GREEN_BG, GREEN
        elif tone == "wait":
            bg, bar = AMBER_BG, AMBER
        elif tone == "stop":
            bg, bar = RED_BG, RED
        story.append(Spacer(1, 6))
        story.append(card(title_, text, bg, bar))
    if doing:
        story.append(Spacer(1, 12))
        story.append(Paragraph("What you do", styles["h2"]))
        story.append(steps(doing))
    return story

def draw_cover(c, doc):
    c.saveState()
    c.setFillColor(PURPLE_DEEP)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(PURPLE)
    c.rect(0, 0, 8 * mm, PAGE_H, fill=1, stroke=0)
    c.setFillColor(HexColor("#3A2E86"))
    c.circle(PAGE_W + 30, PAGE_H - 20, 140, fill=1, stroke=0)
    c.setFillColor(HexColor("#C9C0F0"))
    c.setFont("Body-Bold", 9)
    c.drawString(LEFT, PAGE_H - 32 * mm, "CREATIVHEADS")
    c.setFillColor(white)
    c.setFont("Light", 34)
    c.drawString(LEFT, PAGE_H - 58 * mm, "SEO Studio")
    c.setFont("Light", 22)
    c.drawString(LEFT, PAGE_H - 70 * mm, "a simple guide")
    c.setStrokeColor(HexColor("#8B7FE0"))
    c.setLineWidth(1)
    c.line(LEFT, PAGE_H - 78 * mm, LEFT + 42 * mm, PAGE_H - 78 * mm)
    c.setFillColor(HexColor("#E4DEF8"))
    c.setFont("Body", 12)
    text = [
        "Click this. You land on the next screen.",
        "Then click the next thing.",
        "No technical knowledge needed.",
    ]
    y = PAGE_H - 92 * mm
    for line in text:
        c.drawString(LEFT, y, line)
        y -= 16
    band_y = 32 * mm
    row_h = 22 * mm
    items = [
        ("1", "Prepare", "Studio writes a suggestion. The website stays as it is."),
        ("2", "Approve", "A person reads the before and after, then clicks Approve."),
        ("3", "Update", "WordPress changes only after that yes."),
    ]
    band_h = row_h * len(items) + 8 * mm
    c.setFillColor(HexColor("#241C4E"))
    c.roundRect(LEFT, band_y, CONTENT_W, band_h, 8, fill=1, stroke=0)
    for i, (n, title, line) in enumerate(items):
        cy = band_y + band_h - 12 * mm - i * row_h
        c.setFillColor(PURPLE)
        c.circle(LEFT + 16, cy, 8, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Body-Bold", 8)
        c.drawCentredString(LEFT + 16, cy - 3, n)
        c.setFont("Body-Bold", 11)
        c.drawString(LEFT + 32, cy - 3, title)
        c.setFillColor(HexColor("#D9D2F4"))
        c.setFont("Body", 10)
        c.drawString(LEFT + 108, cy - 3, line)
    c.setFillColor(HexColor("#C9C0F0"))
    c.setFont("Body", 9)
    c.drawString(LEFT, 16 * mm, "seo.creativheads.com")
    c.drawRightString(PAGE_W - RIGHT, 16 * mm, "October 2026")
    c.restoreState()

def draw_body(c, doc):
    c.saveState()
    c.setFillColor(PURPLE)
    c.rect(0, PAGE_H - 7, PAGE_W, 7, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Body", 8)
    c.drawString(LEFT, PAGE_H - 14 * mm, "SEO Studio  ·  a simple guide")
    c.drawRightString(PAGE_W - RIGHT, PAGE_H - 14 * mm, "CreativHeads")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.4)
    c.line(LEFT, 12 * mm, PAGE_W - RIGHT, 12 * mm)
    c.setFillColor(MUTED)
    c.setFont("Body", 8)
    c.drawString(LEFT, 7 * mm, "Nothing goes on the live website until someone approves it.")
    c.drawRightString(PAGE_W - RIGHT, 7 * mm, str(doc.page))
    c.restoreState()

def build():
    out = r"D:\CH SEO Agentic\docs\SEO-Studio-Guide.pdf"
    doc = BaseDocTemplate(
        out, pagesize=A4,
        leftMargin=LEFT, rightMargin=RIGHT, topMargin=TOP, bottomMargin=BOTTOM,
        title="SEO Studio — a simple guide",
        author="CreativHeads",
    )
    cover_frame = Frame(LEFT, BOTTOM, CONTENT_W, PAGE_H - TOP - BOTTOM, id="cover", showBoundary=0)
    body_frame = Frame(LEFT, BOTTOM, CONTENT_W, PAGE_H - TOP - BOTTOM, id="body", showBoundary=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover),
        PageTemplate(id="body", frames=[body_frame], onPage=draw_body),
    ])
    story = [NextPageTemplate("body"), PageBreak()]
    story.extend(onboarding())
    doc.build(story)
    print(out)

def hop(where, click, land):
    label = ParagraphStyle("hl", fontName="Body-Bold", fontSize=8, leading=10, textColor=PURPLE)
    value = ParagraphStyle("hv", fontName="Body", fontSize=10, leading=13, textColor=INK)
    def cell(k, v, bg):
        inner = [Paragraph(k, label), Spacer(1, 3), Paragraph(v, value)]
        t = Table([[inner]], colWidths=[CONTENT_W / 3 - 8])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t
    row = Table([[
        cell("YOU ARE ON", where, SOFT),
        cell("CLICK", click, GREEN_BG),
        cell("YOU LAND ON", land, HexColor("#EEF0FF")),
    ]], colWidths=[CONTENT_W / 3] * 3)
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return row

def stop(num, title, lead, clicks, see, nxt):
    bits = [
        Paragraph(f"STOP {num}", styles["eyebrow"]),
        Spacer(1, 4),
        Paragraph(title, styles["h1"]),
        Paragraph(lead, styles["lead"]),
        Paragraph("Click in this order", styles["h2"]),
        steps(clicks),
        Spacer(1, 8),
        card("You should see", see, SOFT, PURPLE),
        Spacer(1, 8),
        card("Then go here", nxt, GREEN_BG, GREEN),
    ]
    return bits

def onboarding():
    story = []
    story.append(Paragraph("Your first day, click by click", styles["h1"]))
    story.append(Paragraph(
        "Do these stops in order. Each box tells you where you are, what to click, and which screen opens next. "
        "The website does not change until Stop 6, when you click Approve.",
        styles["lead"]))
    path = [
        ("1", "Sign in", "Open seo.creativheads.com and sign in.", "Overview, the list of clients."),
        ("2", "Open the client", "Click the client name, or Open workspace.", "That client’s dashboard."),
        ("3", "Connect once", "Settings, then the WordPress plugin, then Client settings.", "WordPress shows Connected."),
        ("4", "Find problems", "Left menu, Site Audit, then Run new crawl.", "A list of problems, one row each."),
        ("5", "Prepare a fix", "Click the row, then Send for approval, then Continue.", "New items waiting in Approvals."),
        ("6", "Say yes", "Left menu, Approvals, then Approve.", "WordPress is updated for that one item."),
        ("7", "Look at the site", "Open the page named in the approval.", "The new heading, title, or link is there."),
    ]
    rows = []
    head = ParagraphStyle("ph", fontName="Body-Bold", fontSize=8.5, leading=11, textColor=white)
    cell = ParagraphStyle("pc", fontName="Body", fontSize=9.5, leading=12.5, textColor=INK)
    num = ParagraphStyle("pn", fontName="Body-Bold", fontSize=11, leading=13, textColor=PURPLE)
    rows.append([Paragraph(x, head) for x in ["", "Stop", "Click", "You land on"]])
    for n, name, click, land in path:
        rows.append([
            Paragraph(n, num),
            Paragraph(name, ParagraphStyle("pn2", fontName="Body-Bold", fontSize=9.5, leading=12.5, textColor=PURPLE_DEEP)),
            Paragraph(click, cell),
            Paragraph(land, cell),
        ])
    table = Table(rows, colWidths=[12 * mm, 32 * mm, 78 * mm, CONTENT_W - 122 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PURPLE_DEEP),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, SOFT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 1), (-1, -2), 0.3, LINE),
    ]))
    story.append(table)
    story.append(Spacer(1, 12))
    story.append(card(
        "Do Stop 3 only the first time",
        "After WordPress says Connected, you skip Stop 3. Every later day starts at Stop 2, then Site Audit, then Approvals.",
        AMBER_BG, AMBER))

    story.append(PageBreak())
    story.extend(stop(
        "1", "Sign in",
        "This is the front door. You are not inside a client yet.",
        [
            "Open a browser and go to seo.creativheads.com.",
            "Sign in with the email your Admin gave you.",
            "Wait until the page finishes loading. Do not click around while it is still blank.",
        ],
        "The heading All Clients Portfolio Overview, and a list or cards of websites. The pink Safe mode label is at the top. The left menu shows Overview.",
        "Stop 2. Click one client.",
    ))
    story.append(Spacer(1, 10))
    story.append(hop("Sign-in page", "your email, then sign in", "Overview"))

    story.append(PageBreak())
    story.extend(stop(
        "2", "Open one client",
        "Everything after this belongs to the client whose name is at the top. Check that name before every approval.",
        [
            "On Overview, find the website, for example Level8.",
            "Click the client name, or the button Open workspace.",
            "Look at the top bar. The client name must be the one you meant.",
        ],
        "The Client dashboard: clicks, visits, and the latest audit for that one site. The left menu now has Site Audit, Schema, Approvals, Keywords, Content Plan, and Content Pipeline under that client’s name.",
        "First time on this website: Stop 3. Already connected: skip to Stop 4.",
    ))
    story.append(Spacer(1, 10))
    story.append(hop("Overview", "the client name", "Client dashboard"))

    story.append(PageBreak())
    story.extend(stop(
        "3", "Connect WordPress, once",
        "An approval can write to the site only after this connection works. Ask an Admin if you do not see Settings.",
        [
            "Click Settings in the left menu.",
            "In the WordPress plugin box, click Download plugin. Save ch-seo-connector.zip.",
            "In the client’s WordPress, open Plugins, Add Plugin, Upload Plugin. Choose the zip, Install Now, then Activate. If it is already there, choose Replace current with uploaded.",
            "Back in SEO Studio, on Settings, click Client settings next to this client.",
            "Open the tab Integrations &amp; connections. On the WordPress card, click Connect WordPress.",
            "Paste the WordPress username and the application password (WordPress: Users, Profile, Application Passwords, name it SEO Studio). Click Save &amp; test.",
        ],
        "A green Connected on the WordPress card, and a line that mentions connector 1.2. If it says an older number, upload the plugin again and click Test connection.",
        "Stop 4. Left menu, Site Audit.",
    ))
    story.append(Spacer(1, 8))
    story.append(hop("Settings", "Download plugin, then Client settings", "WordPress: Connected"))

    story.append(PageBreak())
    story.extend(stop(
        "4", "Run Site Audit",
        "This visit reads the pages and builds the list. It does not change the website.",
        [
            "Click Site Audit in the left menu.",
            "At the top right, click Run new crawl. A box explains it. Click Continue.",
            "The crawl takes a while. When you come back, click Check crawl if it is still running.",
            "When the list appears, click the first row, or the button Inspect.",
        ],
        "A list of problems. Each row has a name, how urgent it is, and how many pages. The right side explains the one you clicked, with a few page addresses.",
        "Stop 5, if the right side shows Send for approval. If that button is missing, pick the next row.",
    ))
    story.append(Spacer(1, 8))
    story.append(hop("Client dashboard", "left menu, Site Audit", "The problem list"))

    story.append(PageBreak())
    story.extend(stop(
        "5", "Send one problem for approval",
        "This prepares the change. The live page stays the same until Stop 6.",
        [
            "On the right-hand panel, click Send for approval.",
            "Read the box. It names the client. Click Continue.",
            "Wait until it finishes. A message tells you how many items were prepared.",
            "If the message is red, read it. Do not click it again and again. The last page of this guide says what to do.",
        ],
        "A success message, and a number on Approvals in the left menu. Titles, descriptions, picture text, missing main headings, broken links, and redirects can be prepared this way. Slow pages and compression have no Send for approval button. Leave those.",
        "Stop 6. Click Approvals in the left menu.",
    ))
    story.append(Spacer(1, 8))
    story.append(hop("Site Audit, right panel", "Send for approval, then Continue", "Approvals, with new items"))

    story.append(PageBreak())
    story.extend(stop(
        "6", "Approve it",
        "This is the only click that writes to the website.",
        [
            "Click Approvals in the left menu.",
            "Click one item. Read the current value and the proposed value.",
            "Check the client name at the top is still the right website.",
            "If the new text is true, click Approve. If it is wrong, click Reject and write a short note.",
            "Approve a few, not the whole list, the first time.",
        ],
        "The item leaves the waiting list. A title, description, heading, link, or redirect is now stored in WordPress. An article is saved as a WordPress draft, not published.",
        "Stop 7. Open the live page named on that item.",
    ))
    story.append(Spacer(1, 8))
    story.append(hop("Approvals", "Approve", "WordPress now has that change"))

    story.append(PageBreak())
    story.extend(stop(
        "7", "Check the live page",
        "Studio can store the change and the public page can still look old for a few minutes if a cache is on.",
        [
            "From the approval, open the page address.",
            "Look for the thing you approved: the main heading, the Google title, the picture text, or the link.",
            "If it looks right, go back to Approvals and approve the next few of the same kind.",
            "If it looks wrong, stop and tell an Admin. Do not approve the rest.",
        ],
        "The page a visitor would see, with the change you approved. For a missing main heading, the words stay the same. The heading is now the main one.",
        "You are set up. The next pages are the other screens, each as a short click path.",
    ))

    story.append(PageBreak())
    story.append(Paragraph("The other screens, as click paths", styles["h1"]))
    story.append(Paragraph(
        "You do not do these on day one. When you need one, follow its clicks. Each one still ends in Approvals if it changes the website.",
        styles["lead"]))

    later = [
        ("Schema", "Client dashboard", "Schema, in the left menu", "Schema",
         ["Click Schema.", "Click Send for approval, then Continue.", "Go to Approvals and approve the labels you agree with.", "Back on Schema, click Test page in Google if you want Google’s own check."],
         "Hidden labels for the business, a question and answer, or an article. Studio only uses facts already on the page."),
        ("Keywords", "Client dashboard", "Keywords, in the left menu", "Keywords",
         ["Click Keywords.", "To bring in searches the site already gets, use the import from Search Console if you see it.", "For new ideas, click the research button, type one topic, and Continue. This is a paid lookup.", "For a search sitting around positions 4 to 20, click Send for approval. Then go to Approvals."],
         "A list of searches, with how often people look for them and where the site sits in Google."),
        ("Content Plan", "Client dashboard", "Content Plan, in the left menu", "The month’s calendar",
         ["Click Content Plan.", "Use the arrows to pick the month.", "Click Add topic and type the title.", "The topic sits on a day. It is not written yet."],
         "A calendar of what to write. Nothing is published."),
        ("Content Pipeline", "Content Plan", "the topic, or Content Pipeline in the left menu", "The draft",
         ["Open the topic from the plan, or click Content Pipeline and open the item.", "Read the draft. Tick the checks that are true.", "Click Submit for review.", "A person who can approve clicks Approve. WordPress saves a draft. Publish it in WordPress only when you mean to."],
         "The article, still a draft. Safe mode does not publish it."),
        ("AI Visibility", "Client dashboard", "AI Visibility, in the left menu", "AI Visibility",
         ["Click AI Visibility.", "Save a real customer question.", "Run a check for one engine. This is a paid lookup.", "If the brand is missing, turn that question into a content brief. That brief goes through Content Pipeline."],
         "Whether ChatGPT, Gemini, or a similar tool mentioned the brand and linked the site."),
        ("Reports", "Client dashboard", "Reports, in the left menu", "Reports",
         ["Click Reports.", "Create the report for the month.", "Read it and add two or three plain sentences.", "Submit, then Approve. The numbers stay frozen."],
         "A monthly pack you can download as a PDF."),
    ]
    for title, where, click, land, clicks, see in later:
        story.append(Spacer(1, 8))
        story.append(KeepTogether([
            Paragraph(title, styles["h2"]),
            hop(where, click, land),
            Spacer(1, 6),
            steps(clicks),
            Spacer(1, 4),
            card("You should see", see),
        ]))

    story.append(PageBreak())
    story.append(Paragraph("If a click shows a red message", styles["h1"]))
    story.append(Paragraph("Go back to the screen named here. Do not start again from Stop 1.", styles["lead"]))
    troubles = [
        ("Page builder / H1 message", "Go to Stop 3 and upload the plugin again, version 1.2. Then return to Site Audit, click the Missing H1 row, and click Send for approval."),
        ("Nothing was sent for approval", "Stay on Site Audit. Read the sentence. Pick another row, or open Approvals. The items may already be waiting there."),
        ("A fixed page is still in the list", "Click Site Audit again. Studio checks the live address. You do not need Run new crawl for that."),
        ("Approve did not change what I see", "Open the exact address on the approval. Wait a minute and refresh. If it is still old, tell an Admin before you approve more."),
        ("There is no Send for approval button", "Click the next row. Speed, compression, and heavy code stay on the list for the person who looks after hosting."),
    ]
    for title, text in troubles:
        story.append(Spacer(1, 6))
        story.append(card(title, text, AMBER_BG, AMBER))
    story.append(Spacer(1, 10))
    story.append(card(
        "Every later morning",
        "Sign in. Click the client. Click Site Audit. Click a row that has Send for approval. Continue. Click Approvals. Approve a few. Open one live page.",
        GREEN_BG, GREEN))
    return story


if __name__ == '__main__':
    build()
