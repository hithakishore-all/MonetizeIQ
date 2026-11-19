#!/usr/bin/env python3
"""Record the MonetizeIQ captioned walkthrough from the real app (offline mode).

  cd app && make video        (or: python3 scripts/video/record.py)

Starts the server on a free port, drives the web console with Playwright (one browser context per
persona), captures the Chrome screencast, then encodes docs/media/monetizeiq-walkthrough.mp4 with
chapters.json and a poster. Needs: Python 3, playwright (pip), Chrome or Chromium, ffmpeg, Node.
"""
import asyncio
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(os.path.dirname(APP), "docs", "media")
WORK = os.path.join("/tmp", "miq-video")
CHROME = os.environ.get("CHROME_PATH") or shutil.which("google-chrome") or shutil.which("chromium") or None
W, H = 1280, 800

PERSONAS = {
    "riley": ("Riley", "head of pricing", "#E040A0"),
    "sam": ("Sam", "deal desk lead", "#06B6D4"),
    "jordan": ("Jordan", "enterprise AE", "#F59E0B"),
}
TOTAL = 17


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


class Recorder:
    def __init__(self):
        self.frames, self.segments, self.chapters = [], [], []
        self.cdp, self.seg_start, self.offset = None, None, 0.0
        os.makedirs(os.path.join(WORK, "frames"), exist_ok=True)

    def vtime(self):
        return self.offset + (time.monotonic() - self.seg_start)

    async def start(self, context, page):
        self.cdp = await context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", lambda p: asyncio.ensure_future(self._frame(p)))
        self.seg_start = time.monotonic()
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H})

    async def _frame(self, p):
        n = len(self.frames)
        path = os.path.join(WORK, "frames", f"{n:06d}.jpg")
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(p["data"]))
        self.frames.append((self.vtime(), path))
        try:
            await self.cdp.send("Page.screencastFrameAck", {"sessionId": p["sessionId"]})
        except Exception:
            pass

    async def stop(self):
        await self.cdp.send("Page.stopScreencast")
        end = self.vtime()
        self.segments.append((self.offset, end))
        self.offset = end

    def chapter(self, title, who):
        self.chapters.append({"t": round(self.vtime(), 2), "title": title, "persona": PERSONAS[who][0], "color": PERSONAS[who][2]})


class Director:
    def __init__(self, page, rec, who):
        self.page, self.rec, self.who, self.step = page, rec, who, 0

    async def cap(self, n, title, body):
        name, role, color = PERSONAS[self.who]
        await self.page.evaluate("a=>window.__fw.cap(a[0],a[1],a[2],a[3])", [f"{n:02d} / {TOTAL} · {name} · {role}", title, body, color])
        self.rec.chapter(title, self.who)

    async def to(self, loc):
        await loc.scroll_into_view_if_needed()
        b = await loc.bounding_box()
        x = b["x"] + (60 if b["width"] > 240 else b["width"] / 2)
        y = b["y"] + b["height"] / 2
        await self.page.evaluate("a=>window.__fw.cur(a[0],a[1])", [x, y])
        await asyncio.sleep(0.85)
        return x, y

    async def click(self, loc):
        x, y = await self.to(loc)
        await self.page.evaluate("a=>window.__fw.ripple(a[0],a[1])", [x, y])
        await asyncio.sleep(0.25)
        await loc.click()
        await asyncio.sleep(0.9)

    async def show(self, loc, label, secs=3.5, top=100):
        await loc.evaluate("(e,t)=>{const r=e.getBoundingClientRect();window.scrollBy({top:r.top-t,behavior:'smooth'})}", top)
        await asyncio.sleep(0.8)
        b = await loc.bounding_box()
        h = min(b["height"], H - b["y"] - 24)
        await self.page.evaluate("a=>window.__fw.hl(a[0],a[1],a[2],a[3],a[4])", [b["x"], b["y"], b["width"], h, label])
        await asyncio.sleep(secs)

    async def nohl(self):
        await self.page.evaluate("()=>window.__fw.nohl()")


async def persona(browser, url, who):
    ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
    await ctx.add_init_script(path=os.path.join(HERE, "overlay.js"))
    page = await ctx.new_page()
    await page.goto(url)
    await page.wait_for_timeout(1500)
    return ctx, page


async def run(url):
    from playwright.async_api import async_playwright
    rec = Recorder()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else await p.chromium.launch()

        # ---- Riley: market map and outcome lab
        ctx, page = await persona(browser, url + "#map", "riley")
        d = Director(page, rec, "riley")
        await rec.start(ctx, page)
        await page.evaluate("()=>window.__fw.card('MonetizeIQ','Price the work, not the seat.','A pricing cockpit for AI agents: where AI fits, how outcomes are measured, and what each pricing model does to your book.','no sound · all companies and numbers are fictional')")
        rec.chapter("Title", "riley")
        await asyncio.sleep(4.5)
        await page.evaluate("()=>window.__fw.nocard()")
        await asyncio.sleep(0.6)
        await d.cap(1, "Four ways to meter AI", "Effort, work completed, an outcome event or measured lift. Each step up proves more value and needs more evidence.")
        await d.to(page.locator("#meters .meter").nth(3))
        await d.show(page.locator("#meters"), "4 meters · effort → lift", 4.5)
        await d.cap(2, "Where AI fits", "Twelve AI categories across industries, each scored on how ready it is for outcome pricing.")
        await d.show(page.locator("#tiles"), "12 categories", 3.5, top=150)
        await d.click(page.locator('.tile[data-c="field"]'))
        await d.cap(3, "Service intelligence is a lift outcome", "Savings come from fewer parts per job and fewer avoidable truck rolls, measured against a baseline.")
        await d.show(page.locator("#detail .formula"), "Savings formula", 5)
        await d.cap(4, "Measure it, then credit it", "Top right is ready for outcome pricing. Bottom left needs usage credits plus a lift bonus.")
        await d.show(page.locator("#bubble"), "Readiness map", 4.5)
        await d.nohl()
        await d.click(page.locator("#to-lab"))
        await d.cap(5, "What the AI is worth", "The outcome lab turns fewer parts and dispatches into dollars, then splits them between vendor and customer.")
        await d.show(page.locator("#labout"), "Value · fee · customer keeps", 4.5)
        await d.cap(6, "Better AI, bigger shared value", "Cutting parts per job from 1.6 to 1.2 raises the value created, and the vendor's fee with it.")
        await d.to(page.locator("#l0ai"))
        for v in ["1.5", "1.4", "1.3", "1.2"]:
            await page.locator("#l0ai").evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}", v)
            await asyncio.sleep(0.35)
        await d.show(page.locator("#labout"), "Value created rises", 3.5)
        await page.evaluate("()=>window.__fw.nocap()")
        await d.nohl()
        await rec.stop()

        # ---- Sam: pricing cockpit and token economics
        ctx2, page = await persona(browser, url + "#cockpit", "sam")
        d = Director(page, rec, "sam")
        await rec.start(ctx2, page)
        await d.cap(7, "One book, four pricing models", "96 fictional support accounts priced as seat, credit, hybrid and outcome by the same engine.")
        await d.show(page.locator("#kpis"), "Revenue · margin · tokens", 4.5)
        await d.cap(8, "Who pays more, who pays less", "The bridge shows how today's seat revenue becomes hybrid revenue, account by account.")
        await d.show(page.locator("#bridge").locator(".."), "Revenue bridge", 4.5)
        await d.nohl()
        await d.click(page.locator('#model button[data-v="credit"]'))
        await d.cap(9, "Token cost moves margin", "With per-action credits, margin falls as model prices rise. Seat and outcome revenue ignore tokens.")
        await d.show(page.locator("#curve").locator(".."), "Margin vs. model price", 4.5)
        await d.nohl()
        await d.click(page.locator('#cmode button[data-v="pass"]'))
        await d.cap(10, "Passing tokens through", "Cost-plus credits lock the margin, but revenue shrinks every time model prices fall.")
        await d.show(page.locator("#curve").locator(".."), "Pass-through: flat margin", 4.5)
        await page.evaluate("()=>window.__fw.nocap()")
        await d.nohl()
        await rec.stop()

        # ---- Jordan: scenarios, guardrails, refused approval
        ctx3, page = await persona(browser, url + "#scenarios", "jordan")
        d = Director(page, rec, "jordan")
        await rec.start(ctx3, page)
        await d.click(page.locator('.sc[data-n="2"]'))
        await page.wait_for_selector("#decide .banner")
        await d.cap(11, "A light adopter is protected", "Pure outcome would cut this bill by three quarters, so MonetizeIQ recommends a hybrid floor instead.")
        await d.show(page.locator("#decide .banner").first, "Recommendation", 4.5)
        await d.nohl()
        await page.goto(url + "#scenarios"); await asyncio.sleep(0.8)
        await d.click(page.locator('.sc[data-n="3"]'))
        await d.cap(12, "The gate says no", "Revenue intelligence scores 43 on readiness, so pure outcome pricing is blocked.")
        await d.show(page.locator("#gate .banner.crit"), "Readiness gate", 4.5)
        await d.nohl()
        await page.goto(url + "#scenarios"); await asyncio.sleep(0.8)
        await d.click(page.locator('.sc[data-n="8"]'))
        await page.wait_for_selector("#decide .banner")
        await d.cap(13, "Stale data, no quote", "Usage is 52 days old, so the recommendation is withheld until the feed is refreshed.")
        await d.show(page.locator("#decide .banner").first, "Withheld · stale data", 4.5)
        await d.nohl()
        await page.goto(url + "#scenarios"); await asyncio.sleep(0.8)
        await d.click(page.locator('.sc[data-n="1"]'))
        await page.wait_for_selector("#acting")
        await page.select_option("#acting", "jordan")
        await d.cap(14, "Only the owner approves", "Jordan doesn't own Ulvane Home, so the approval is refused and written to the audit log.")
        await d.click(page.locator("#decide .btn:not(.ghost)"))
        await d.show(page.locator("#decide-out"), "403 · not the owner", 4)
        await page.evaluate("()=>window.__fw.nocap()")
        await d.nohl()
        await rec.stop()

        # ---- Riley: approval, audit trail, ask the pane
        ctx4, page = await persona(browser, url + "#scenarios", "riley")
        d = Director(page, rec, "riley")
        await rec.start(ctx4, page)
        await d.click(page.locator('.sc[data-n="1"]'))
        await page.wait_for_selector("#acting")
        await page.select_option("#acting", "riley")
        await d.cap(15, "The owner approves", "Riley records the decision. Billing doesn't change; the decision and its inputs are audited.")
        await d.click(page.locator("#decide .btn:not(.ghost)"))
        await d.show(page.locator("#decide-out"), "Decision recorded", 4)
        await d.cap(16, "Every billed outcome is traceable", "Each line carries its source record, tokens, cost to serve, status and evidence ID.")
        await d.show(page.locator("#acct table"), "Audit trail", 5)
        await d.nohl()
        await d.cap(17, "Ask the pane", "What-if answers come from the same engine, with an option to apply them to the screen.")
        await d.click(page.locator("#askq"))
        await page.locator("#askq").press_sequentially("What if token prices drop 50%?", delay=45)
        await page.keyboard.press("Enter")
        await asyncio.sleep(0.8)
        await d.show(page.locator("#answers .ans").first, "What-if answer", 5)
        await page.evaluate("()=>window.__fw.nocap()")
        await d.nohl()
        await page.evaluate("()=>window.__fw.card('MonetizeIQ','Everyone is building the meter. MonetizeIQ picks the model.','Live demo: hithakishore-all.github.io/monetizeiq  ·  Code: github.com/hithakishore-all/monetizeiq','Web console · Slack bot · Postgres · automated tests · fictional data')")
        rec.chapter("Links", "riley")
        await asyncio.sleep(5)
        await rec.stop()
        await browser.close()
    return rec


def encode(rec):
    os.makedirs(OUT, exist_ok=True)
    lines = ["ffconcat version 1.0"]
    frames = sorted(rec.frames)
    for i, (t, path) in enumerate(frames):
        seg_end = next(e for s, e in rec.segments if s <= t <= e + 1e-6)
        nxt = frames[i + 1][0] if i + 1 < len(frames) and frames[i + 1][0] <= seg_end else seg_end
        lines += [f"file '{path}'", f"duration {max(0.001, nxt - t):.4f}"]
    lines.append(f"file '{frames[-1][1]}'")
    lst = os.path.join(WORK, "frames.ffconcat")
    with open(lst, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    part = os.path.join(OUT, "monetizeiq-walkthrough.part.mp4")
    final = os.path.join(OUT, "monetizeiq-walkthrough.mp4")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=30,format=yuv420p",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", "-an", part])
    if r.returncode != 0:
        sys.exit("ffmpeg failed")
    os.replace(part, final)
    poster_t = next(c["t"] for c in rec.chapters if c["title"].startswith("Every billed")) + 3
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{poster_t:.2f}", "-i", final, "-frames:v", "1", "-q:v", "3",
                    os.path.join(OUT, "monetizeiq-walkthrough-poster.jpg")], check=True)
    with open(os.path.join(OUT, "chapters.json"), "w") as fh:
        json.dump(rec.chapters, fh, indent=2)
    with open(os.path.join(WORK, "timeline.json"), "w") as fh:
        json.dump({"segments": rec.segments, "frames": len(frames)}, fh)
    print(f"video: {final} ({os.path.getsize(final) / 1e6:.1f} MB, {rec.segments[-1][1]:.0f}s, {len(rec.chapters)} chapters)")


def main():
    shutil.rmtree(WORK, ignore_errors=True)
    port = free_port()
    srv = subprocess.Popen(["node", "src/index.js", "--offline", "--no-slack", f"--port={port}"], cwd=APP,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        rec = asyncio.run(run(f"http://127.0.0.1:{port}/"))
    finally:
        srv.terminate()
    encode(rec)


if __name__ == "__main__":
    main()
