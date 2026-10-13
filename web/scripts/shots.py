"""Screenshot the app in preview mode. Usage: python scripts/shots.py <base_url> <out_dir>"""
import sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h, mobile in (("desktop", 1440, 900, False), ("phone", 390, 844, True)):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.goto(f"{base}/login")
        pg.fill("#pw", "x"); pg.click("button[type=submit]"); pg.wait_for_load_state("networkidle")
        for path in ("/", "/growth", "/machine"):
            pg.goto(f"{base}{path}?range=7"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(600)
            pg.screenshot(path=f"{out}/{name}{path.replace('/', '_') or '_today'}.png", full_page=True)
        pg.goto(f"{base}/login"); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{out}/{name}_login.png")
        ctx.close()
    b.close()
print("ok")
