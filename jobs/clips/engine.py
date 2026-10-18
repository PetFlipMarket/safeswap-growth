"""Shared rendering engine for the clip formats: fonts, sound, voice, the SafeSwap listing card, captions, render.

Every format is a function (items, rng, ctx) -> Clip(frame(t), duration, audio builder). This module is the only
place that knows about fonts, Kokoro, ffmpeg or PIL tricks, so formats stay short.
"""
import io, math, os, re, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.signal import butter, lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, SR = 1080, 1920, 30, 44100
KOKORO_DIR = os.environ.get("KOKORO_DIR", os.path.join(HERE, "..", "kokoro"))

# ---- brand (matches safeswap.gg) ----
BG = (12, 11, 16); CARD = (22, 20, 29); LINE = (38, 34, 48); INK = (244, 242, 248); DIM = (168, 163, 184); MUTE = (140, 135, 156)
PURPLE = (139, 108, 240); PURPLE2 = (168, 139, 255); GREEN = (94, 230, 168); AMBER = (255, 184, 92); RED = (255, 143, 128); LIME = (190, 255, 80)
HASHTAGS = ["#safeswap", "#roblox", "#robloxtrading"]
BIO = "SafeSwap — Roblox items for real money. Paid through Stripe, money held until it's delivered. safeswap.gg"

# ---- fonts ----
_fc = {}
def F(size, w=700, fam="Bricolage"):
    k = (fam, int(size), w)
    if k not in _fc:
        f = ImageFont.truetype(os.path.join(HERE, "fonts", fam + ".ttf"), max(4, int(size)))
        try: f.set_variation_by_axes([w])
        except Exception: pass
        _fc[k] = f
    return _fc[k]
_EMO = None
def emoji(ch, size):
    global _EMO
    if _EMO is None:
        for p in ("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", os.path.join(HERE, "fonts", "NotoColorEmoji.ttf")):
            if os.path.exists(p): _EMO = ImageFont.truetype(p, 109); break
    if _EMO is None: return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0)); ImageDraw.Draw(im).text((10, 10), ch, font=_EMO, embedded_color=True)
    im = im.crop(im.getbbox() or (0, 0, 1, 1)); s = size / im.height
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)

# ---- easing ----
def clamp(x, a=0, b=1): return max(a, min(b, x))
def ease(x): x = clamp(x); return 1 - (1 - x) ** 3
def back(x, c1=1.7):
    x = clamp(x); c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

# ---- sound ----
_rng = np.random.default_rng(5)
def lp(x, c, o=2): b, a = butter(o, c / (SR / 2)); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo / (SR / 2), hi / (SR / 2)], btype="band"); return lfilter(b, a, x)
def tick(f=1500):
    t = np.arange(int(0.08 * SR)) / SR
    return (np.sin(2 * np.pi * f * t) * 0.6 + lp(_rng.standard_normal(len(t)), 5000) * 0.3) * np.exp(-t * 60)
def ding():
    out = np.zeros(int(1.2 * SR))
    for f, dt, g in ((1046, 0, 0.6), (1318, 0.07, 0.5), (1568, 0.14, 0.5)):
        t = np.arange(int(1.0 * SR)) / SR
        s = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t * 4) * g
        st = int(dt * SR); out[st:st + len(s)] += s
    return out * 0.6
def whoosh(d=0.5):
    n = int(d * SR); x = _rng.standard_normal(n); out = np.zeros(n)
    for i in range(0, n, 1024):
        f = 400 + 3500 * i / n; out[i:i + 1024] = bp(x[i:i + 1024], f * 0.5, min(18000, f * 1.5))
    return out * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5 * 0.5
def boom():
    t = np.arange(int(1.5 * SR)) / SR
    s = np.tanh(np.sin(2 * np.pi * np.cumsum(42 + 120 * np.exp(-t * 18)) / SR) * np.exp(-t * 2.3) * 3) * 0.9
    out = s.copy()
    for dl, g in ((0.09, 0.3), (0.18, 0.2)):
        n = int(dl * SR); out[n:] += s[:-n] * g
    return out
def pop(f=650):
    t = np.arange(int(0.12 * SR)) / SR
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 1.5 * np.exp(-t * 45))) / SR) * np.exp(-t * 28) * 0.7
def riser(d=1.0):
    n = int(d * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / d) ** 2) / SR) * 0.25 + bp(_rng.standard_normal(n), 2000, 9000) * 0.25
    return s * (t / d) ** 2
def keyclick():
    n = int(0.03 * SR); return lp(_rng.standard_normal(n), 3500) * np.exp(-np.arange(n) / SR * 180) * 0.5
def sent():
    n = int(0.22 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * (700 + 900 * tt / 0.22) * tt) * np.exp(-tt * 14) * 0.5 + lp(_rng.standard_normal(n), 2500) * np.exp(-tt * 30) * 0.2
def recv():
    n = int(0.35 * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1047 * tt) * np.exp(-tt * 12) + np.sin(2 * np.pi * 1319 * np.clip(tt - 0.08, 0, 1)) * np.exp(-np.clip(tt - 0.08, 0, 1) * 12) * (tt > 0.08)) * 0.35
def buzz():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * 110 * tt)) * 0.25 * np.exp(-tt * 9) + np.sin(2 * np.pi * 220 * tt) * 0.2 * np.exp(-tt * 9)
def music(N, bpm=120, seed=0):
    r = np.random.default_rng(seed); beat = 60 / bpm; out = np.zeros(N)
    prog = [[[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]], [[45, 48, 52, 55], [50, 53, 57, 60], [41, 45, 48, 52], [43, 47, 50, 53]]][seed % 2]
    t = 0.0; i = 0
    while t < N / SR:
        ch = prog[(i // 4) % 4]; si = int(t * SR)
        if i % 4 == 0:
            tt = np.arange(int(beat * 4 * SR)) / SR
            pad = sum(np.sin(2 * np.pi * 440 * 2 ** ((n - 69) / 12) * tt) for n in ch)
            pad = lp(pad, 900) * np.minimum(1, tt / 0.3) * np.exp(-tt * 0.4) * 0.12
            fb = 440 * 2 ** ((ch[0] - 24 - 69) / 12)
            pad += np.sin(2 * np.pi * fb * tt) * np.exp(-tt * 1.2) * 0.35
            e = min(N, si + len(pad)); out[si:e] += pad[:e - si]
        tt = np.arange(int(0.25 * SR)) / SR
        k = np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-tt * 30)) / SR) * np.exp(-tt * 14) * (0.5 if i % 2 == 0 else 0)
        h = bp(r.standard_normal(len(tt)), 6000, 12000) * np.exp(-tt * 50) * (0.06 if i % 2 else 0.03)
        sn = (bp(r.standard_normal(len(tt)), 1500, 6000) * np.exp(-tt * 22) * 0.18) if i % 4 == 2 else 0
        x = k + h + sn; e = min(N, si + len(x)); out[si:e] += x[:e - si]
        i += 1; t += beat
    return out * 0.5

# ---- voice ----
_K = None
def say(txt, voice="am_adam", speed=1.12):
    global _K
    if _K is None:
        from kokoro_onnx import Kokoro
        _K = Kokoro(os.path.join(KOKORO_DIR, "kokoro-v1.0.onnx"), os.path.join(KOKORO_DIR, "voices-v1.0.bin"))
    s, sr = _K.create(txt, voice=voice, speed=speed, lang="en-us")
    y = np.interp(np.linspace(0, len(s) - 1, int(len(s) * SR / sr)), np.arange(len(s)), s)
    nz = np.where(np.abs(y) > 0.01)[0]
    if len(nz) == 0: return y
    return y[max(0, nz[0] - 200): nz[-1] + 500] * 0.95

def build_lines(lines, gaps, t0=0.3, voice="am_adam", speed=1.12):
    """lines: [(key, text)]; returns segs with word times so visuals can sync to speech."""
    t = t0; segs = {}
    for key, txt in lines:
        v = say(txt, voice, speed); d = len(v) / SR
        ws = txt.split(); lens = [len(re.sub(r"[^\w]", "", w)) + 2 for w in ws]; tot = sum(lens); acc = 0; wt = []
        for w_, L in zip(ws, lens): wt.append((t + d * acc / tot * 0.97, w_)); acc += L
        g = gaps.get(key, 0.4); segs[key] = dict(start=t, vo=v, dur=d, words=wt, end=t + d + g); t += d + g
    return segs, t
def wtime(seg, word, last=False):
    hits = [tt for tt, w in seg["words"] if re.sub(r"[^\w]", "", w).lower().startswith(word.lower())]
    return (hits[-1] if last else hits[0]) if hits else seg["start"]

# ---- drawing ----
def rounded(im, r):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = im.convert("RGBA"); out.putalpha(m); return out
def paste_scaled(img, layer, cx, cy, s, a=1.0):
    if s <= 0.02 or a <= 0.01: return
    l = layer if abs(s - 1) < 0.005 else layer.resize((max(1, int(layer.width * s)), max(1, int(layer.height * s))), Image.BILINEAR)
    al = l.getchannel("A")
    if a < 0.999: al = al.point(lambda v: int(v * a))
    img.paste(l, (int(cx - l.width / 2), int(cy - l.height / 2)), al)
def shadow(img, x, y, w, h, r=28, a=160, blur=24):
    sh = Image.new("RGBA", (int(w) + 100, int(h) + 100), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([50, 50, w + 50, h + 50], r, fill=(0, 0, 0, a))
    sh = sh.filter(ImageFilter.GaussianBlur(blur)); img.paste(sh, (int(x - 50), int(y - 30)), sh)

def _w(txt, f): return sum(f.getlength(ch) if ord(ch) < 0x2600 else f.size * 1.15 for ch in txt)
def _draw(img, d, x, y, txt, f, col):
    for ch in txt:
        if ord(ch) >= 0x2600:
            e = emoji(ch, f.size * 1.05); img.paste(e, (int(x), int(y - e.height / 2)), e); x += f.size * 1.15
        else: d.text((x, y), ch, font=f, fill=col, anchor="lm"); x += f.getlength(ch)
def caption(img, d, txt, y, size=64, col=INK, s=1.0, hl=(), hlcol=PURPLE2, maxw=W - 140, w=800, fam="Bricolage", x=None):
    """Centred, wrapped, with per-word highlight and emoji. s scales font (for pop-in)."""
    if s < 0.02 or not txt: return
    f = F(size * s, w, fam); gap = f.getlength(" "); words = txt.split(" "); lines = []; cur = []
    def width(ws): return sum(_w(x_, f) for x_ in ws) + gap * (len(ws) - 1)
    for wd in words:
        if cur and width(cur + [wd]) > maxw: lines.append(cur); cur = [wd]
        else: cur.append(wd)
    if cur: lines.append(cur)
    lh = size * s * 1.12; y0 = y - lh * (len(lines) - 1) / 2; cx = W / 2 if x is None else x
    for i, ln in enumerate(lines):
        xx = cx - width(ln) / 2
        for wd in ln:
            c = hlcol if re.sub(r"[^\w]", "", wd).lower() in hl else col
            _draw(img, d, xx, y0 + i * lh, wd, f, c); xx += _w(wd, f) + gap
def chip(d, txt, y, s=1.0, col=DIM, fill=CARD):
    if s < 0.02: return
    f = F(26 * s, 600, "GeistMono"); w = f.getlength(txt) + 36 * s; h = 48 * s
    d.rounded_rectangle([W / 2 - w / 2, y - h / 2, W / 2 + w / 2, y + h / 2], int(h / 2), fill=fill, outline=LINE, width=2)
    d.text((W / 2, y + 1), txt, font=f, fill=col, anchor="mm")
def header(d, right="SAFESWAP"):
    d.text((60, 90), "SafeSwap", font=F(34, 700), fill=INK, anchor="lm")
    d.text((W - 60, 90), right, font=F(22, 600, "GeistMono"), fill=MUTE, anchor="rm")
def progress(d, t, dur, col=PURPLE): d.rectangle([0, H - 8, W * clamp(t / dur), H], fill=col)

# ---- the listing card (looks like a safeswap.gg tile) ----
def price_text(p):
    p = float(p); return f"£{p:,.2f}" if p >= 1 else f"{int(round(p * 100))}p"
def speak_price(p):
    p = float(p)
    if p < 1: n = int(round(p * 100)); return f"{n} pence" if n != 1 else "one penny"
    if abs(p - round(p)) < 0.005: return f"{int(round(p))} pound{'s' if round(p) != 1 else ''}"
    return f"{int(p)} pound{'s' if int(p) != 1 else ''} {int(round((p - int(p)) * 100))}"
_cards = {}
def listing_card(it, width=520, badge=None):
    """A SafeSwap-style tile: square image, game, name, price, cart button. it: dict(name, game, price, image(PIL) )"""
    k = (id(it["image"]), width, badge)
    if k in _cards: return _cards[k]
    s = width / 390; pad = int(14 * s); imw = width - 2 * pad
    im = it["image"].convert("RGB"); side = min(im.size); im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2)).resize((imw, imw), Image.LANCZOS)
    h = imw + int(150 * s) + 2 * pad
    c = Image.new("RGBA", (width, h), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    d.rounded_rectangle([0, 0, width - 1, h - 1], int(28 * s), fill=CARD, outline=LINE, width=2)
    c.paste(rounded(im, int(22 * s)), (pad, pad))
    y = pad + imw + int(26 * s)
    d.text((pad + 4, y), str(it.get("game", "Roblox")), font=F(22 * s, 600, "Geist"), fill=MUTE, anchor="lm")
    name = str(it["name"]); f = F(30 * s, 700, "Geist")
    while f.getlength(name) > width - 2 * pad - 8 and len(name) > 6: name = name[:-2].rstrip() + "…"
    d.text((pad + 4, y + int(38 * s)), name, font=f, fill=INK, anchor="lm")
    d.text((pad + 4, y + int(90 * s)), price_text(it["price"]), font=F(40 * s, 800, "Bricolage"), fill=INK, anchor="lm")
    r = int(26 * s); bx, by = width - pad - r - 4, y + int(90 * s)
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=PURPLE)
    d.text((bx, by), "+", font=F(34 * s, 700), fill=INK, anchor="mm")
    if badge:
        txt, col = badge; f2 = F(20 * s, 700, "Geist"); tw = f2.getlength(txt) + int(22 * s)
        d.rounded_rectangle([pad + int(10 * s), pad + int(10 * s), pad + int(10 * s) + tw, pad + int(46 * s)], int(18 * s), fill=col)
        d.text((pad + int(10 * s) + tw / 2, pad + int(28 * s)), txt, font=f2, fill=(21, 11, 51), anchor="mm")
    _cards[k] = c; return c

def placeholder_image(name, seed=0):
    r = np.random.default_rng(seed); hue = r.integers(0, 360)
    im = Image.new("RGB", (600, 600), BG); d = ImageDraw.Draw(im)
    import colorsys
    c1 = tuple(int(255 * v) for v in colorsys.hsv_to_rgb(hue / 360, 0.55, 0.75)); c2 = tuple(int(255 * v) for v in colorsys.hsv_to_rgb(((hue + 40) % 360) / 360, 0.6, 0.35))
    for y in range(600):
        k = y / 600; d.line([(0, y), (600, y)], fill=tuple(int(c1[i] * (1 - k) + c2[i] * k) for i in range(3)))
    d.text((300, 300), name[:1].upper(), font=F(300, 800), fill=(255, 255, 255), anchor="mm")
    return im

# ---- mixing + rendering ----
class Mixer:
    def __init__(self, dur): self.N = int(dur * SR); self.vo = np.zeros(self.N); self.fx = np.zeros(self.N); self.mask = np.zeros(self.N)
    def put(self, s, t, g=1.0, voice=False):
        i = int(t * SR)
        if i < 0: s = s[-i:]; i = 0
        e = min(self.N, i + len(s))
        if e > i:
            (self.vo if voice else self.fx)[i:e] += s[:e - i] * g
            if voice: self.mask[i:e] = 1
    def segs(self, segs):
        for sg in segs.values(): self.put(sg["vo"], sg["start"], voice=True)
    def write(self, path, bpm=120, mgain=0.3, seed=0, duck=0.5):
        mus = music(self.N, bpm, seed) * mgain * (1 - duck * np.clip(lp(self.mask, 5, 1), 0, 1))
        mix = self.vo + self.fx + mus
        mix = np.tanh(mix / max(1, np.abs(mix).max() / 0.95) * 1.1) * 0.92
        with wave.open(path, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.stack([mix, mix], 1) * 32767).astype(np.int16).tobytes())

def render(frame, dur, wav, out, thumb_at=1.0, crf=21):
    n = int(dur * FPS)
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
                          "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    thumb = None
    for i in range(n):
        im = frame(i / FPS)
        if thumb is None and i / FPS >= thumb_at: thumb = im.copy()
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    if p.returncode: raise RuntimeError("ffmpeg failed")
    tp = out.rsplit(".", 1)[0] + ".jpg"; (thumb or frame(0)).resize((540, 960), Image.LANCZOS).save(tp, quality=88)
    return out, tp

def contact_sheet(frame, times, path):
    ims = [frame(x).resize((300, 533)) for x in times]
    sh = Image.new("RGB", (300 * len(ims), 533))
    for i, im in enumerate(ims): sh.paste(im, (i * 300, 0))
    sh.save(path)
