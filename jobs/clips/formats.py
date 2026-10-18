"""Clip formats. Each: make_<name>(items, rng, work) -> dict(frame, dur, wav, title, caption).
items: list of dicts {name, game, price, image(PIL)}. rng: numpy Generator (seeded per clip, so every clip is unique).
"""
import math, os
from PIL import Image, ImageDraw
from engine import *
from engine import _w, _draw

def _item_phrase(it): return it["name"].strip().rstrip(".!")

# ---------------------------------------------------------------- 1. texts (iMessage thread)
def make_texts(items, rng, work):
    it = items[0]; p = price_text(it["price"]); sp = speak_price(it["price"]); name = _item_phrase(it); game = it["game"]
    mate = str(rng.choice(["Josh", "Kieran", "Alfie", "Tyler", "Mason", "Leo"]))
    hook = str(rng.choice([f"bro how have you got {name}", f"wait how did you get {name}", f"since when do you have {name}", f"nah where did {name} come from"]))
    MSGS = [("them", hook, None), ("me", "bought it", None), ("them", "with robux??", "with robux?"), ("me", f"nah. real money. {p}", f"nah. real money. {sp}."),
            ("them", f"{p} 😭 where", f"{sp}?! where?"), ("me", "safeswap.gg", "safe swap dot G G"), ("them", str(rng.choice(["that's a scam surely", "100% a scam", "no way that's legit"])), None),
            ("me", "thought that too. ordered one to test it", None), ("me", "IMG", None), ("me", str(rng.choice(["it turned up. that was it", "landed in my inventory. done", "took like 10 mins. mad"])), None),
            ("them", f"wait so it's actually {p}", f"wait, so it's actually {sp}?"), ("me", "yeah lol", "yeah."), ("them", str(rng.choice(["omw", "sending me the link", "say less"])), None)]
    VOICE = {"me": ("am_adam", 1.08), "them": (str(rng.choice(["am_michael", "am_eric", "am_liam"])), 1.1)}
    t = 0.15; segs = []
    for n_, (who, typed, spoken) in enumerate(MSGS):
        if typed == "IMG": segs.append(dict(who=who, typed=typed, start=t, vo=None, dur=0.9, dots=0)); t += 1.4; continue
        v = say(spoken or typed, *VOICE[who]); d = len(v) / SR; dots = 0 if n_ == 0 else (0.7 if who == "them" else 0.4)
        segs.append(dict(who=who, typed=typed, start=t + dots, vo=v, dur=d, dots=dots)); t += dots + d + 0.35
    DUR = t + 2.0
    card = listing_card(it, 470, ("Checked", GREEN))
    ME = (10, 132, 255); THEM = (38, 38, 41)
    f = F(50, 400, "Geist"); lh = 62; PAD = 30; MAXW = 700
    def wrap(txt):
        out, line = [], ""
        for w in txt.split(" "):
            if _w((line + " " + w).strip(), f) <= MAXW: line = (line + " " + w).strip()
            else: out.append(line); line = w
        return out + [line] if line else out
    def frame(t):
        img = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(img, "RGBA")
        items_ = []; y = 300
        for sg in segs:
            if t < sg["start"] - sg["dots"]: break
            k = t - sg["start"]
            if k < 0: items_.append(("dots", y, sg["who"], t - (sg["start"] - sg["dots"]))); y += 110; continue
            s = back(min(1, k / 0.22), 1.8)
            if sg["typed"] == "IMG": items_.append(("img", y, s)); y += card.height + 18; continue
            lines = wrap(sg["typed"]); bw = max(_w(l, f) for l in lines) + PAD * 2; bh = len(lines) * lh + PAD * 1.2
            items_.append(("bub", y, sg["who"], lines, bw, bh, s)); y += bh + 18
        off = max(0, y - (H - 300))
        for it_ in items_:
            kind, yy = it_[0], it_[1] - off
            if kind == "dots":
                _, _, who, k = it_; x0 = 40 if who == "them" else W - 40 - 170
                d.rounded_rectangle([x0, yy, x0 + 170, yy + 90], 45, fill=THEM if who == "them" else ME)
                for i in range(3):
                    a = 0.4 + 0.6 * max(0, math.sin(k * 6 - i * 0.9)); d.ellipse([x0 + 40 + i * 40 - 11, yy + 34, x0 + 40 + i * 40 + 11, yy + 56], fill=(*INK, int(255 * a)))
            elif kind == "img":
                _, _, s = it_; cw, ch = int(card.width * s), int(card.height * s)
                if cw > 1: cc = card.resize((cw, ch), Image.LANCZOS); img.paste(cc, (int(W - 40 - card.width + (card.width - cw) / 2), int(yy + (card.height - ch) / 2)), cc)
            else:
                _, _, who, lines, bw, bh, s = it_; me = who == "me"; x0 = (W - 40 - bw) if me else 40
                cx, cy = (x0 + bw if me else x0), yy + bh
                d.rounded_rectangle([cx - (cx - x0) * s, cy - bh * s, cx + (x0 + bw - cx) * s, cy], int(40 * s), fill=ME if me else THEM)
                if s > 0.9:
                    for j, ln in enumerate(lines): _draw(img, d, x0 + PAD, yy + PAD * 0.6 + lh / 2 + j * lh, ln, f, INK)
        d.rectangle([0, 0, W, 250], fill=(22, 22, 24)); d.line([0, 250, W, 250], fill=(50, 50, 54), width=2)
        d.text((40, 110), "‹", font=F(70, 400, "Geist"), fill=ME, anchor="lm")
        d.ellipse([W / 2 - 60, 40, W / 2 + 60, 160], fill=(120, 120, 128)); d.text((W / 2, 100), mate[0], font=F(60, 600, "Geist"), fill=INK, anchor="mm")
        d.text((W / 2, 205), f"{mate} ›", font=F(34, 400, "Geist"), fill=INK, anchor="mm")
        d.rectangle([0, H - 220, W, H], fill=(0, 0, 0)); d.rounded_rectangle([110, H - 190, W - 40, H - 100], 45, outline=(60, 60, 64), width=3)
        d.text((150, H - 145), "iMessage", font=F(40, 400, "Geist"), fill=DIM, anchor="lm")
        d.rounded_rectangle([W / 2 - 110, H - 34, W / 2 + 110, H - 24], 5, fill=INK)
        return img
    m = Mixer(DUR)
    for sg in segs:
        m.put(sent() if sg["who"] == "me" else recv(), sg["start"], 0.8)
        if sg["vo"] is not None: m.put(sg["vo"], sg["start"] + 0.12, voice=True)
    wav = os.path.join(work, "a.wav"); m.write(wav, mgain=0.0)
    return dict(frame=frame, dur=DUR, wav=wav, thumb_at=segs[6]["start"] + 0.3,
                title=f"Texts · {name} for {p}", caption=f"{hook} 😭 {p} on safeswap.gg #safeswap #roblox #{game.lower().replace(' ', '')}")

# ---------------------------------------------------------------- 2. notes (phone note, typed)
def make_notes(items, rng, work):
    it = items[0]; p = price_text(it["price"]); sp = speak_price(it["price"]); name = _item_phrase(it); game = it["game"]
    opener = str(rng.choice([f"ok so i did the maths on {name}", f"so about {name} in {game}", f"random find: {name}"]))
    LINES = [("t", opener.replace("ok so i", "ok so I"), opener), ("a", "you can grind for days and get nothing.", "you can grind for DAYS and get nothing"),
             ("c", "then someone in the discord sent me this", "then someone in the discord sent me this"), ("img", None, None),
             ("d", f"{sp}. for {name}.", f"{p}. for {name}."), ("e", "thought it was a scam so I actually checked.", "thought it was a scam so i actually checked"),
             ("f", "it's a real marketplace. you pay through Stripe and the money's held until it arrives.", "it's a real marketplace. you pay through stripe + money is held until it arrives"),
             ("g", str(rng.choice(["so yeah. stop grinding.", "so yeah. that's that.", "anyway. you're welcome."])), str(rng.choice(["so yeah. stop grinding lol", "so yeah. that's that", "anyway. you're welcome"]))),
             ("h", None, "safeswap.gg"), ("i", "what would you actually buy for a quid though?", "what would you actually buy for a quid tho")]
    GAP = {"t": .25, "a": .4, "c": .2, "img": 1.0, "d": .45, "e": .25, "f": .35, "g": .5, "h": .6, "i": 1.8}
    t = 0.1; segs = []
    for key, spoken, typed in LINES:
        v = say(spoken, "am_adam", 1.1) if spoken else None; d = len(v) / SR if v is not None else (0.5 if key == "img" else 0.9)
        segs.append(dict(key=key, start=t, vo=v, dur=d, typed=typed, tdur=(min(1.1, d * 0.6) if key == "t" else max(0.4, d * 0.85)))); t += d + GAP[key]
    DUR = t
    card = listing_card(it, 520)
    NBG = (28, 28, 30); YEL = (255, 214, 10)
    def wrap(txt, f, maxw):
        out, line = [], ""
        for w in txt.split(" "):
            if f.getlength((line + " " + w).strip()) <= maxw: line = (line + " " + w).strip()
            else: out.append(line); line = w
        return out + [line] if line else out
    def frame(t):
        img = Image.new("RGB", (W, H), NBG); d = ImageDraw.Draw(img, "RGBA"); X = 70; MAXW = W - 140; LIMIT = H - 520
        rows = []; y = 260; cursor = None
        for i, sg in enumerate(segs):
            if t < sg["start"]: break
            k = t - sg["start"]
            if sg["key"] == "img": rows.append(("img", y, back(min(1, k / 0.35), 1.5))); y += card.height + 36; continue
            if sg["key"] == "h" and k < 0.3: break
            typed = sg["typed"]; n = len(typed) if k >= sg["tdur"] else int(len(typed) * clamp(k / sg["tdur"]))
            title = sg["key"] == "t"; f = F(66, 700, "Geist") if title else F(50, 400, "Geist"); col = INK if sg["key"] != "h" else YEL
            lines = wrap(typed[:n], f, MAXW) or [""]; lh = 84 if title else 68
            rows.append(("txt", y, lines, f, col, lh))
            if n < len(typed) or i == len(segs) - 1: cursor = (X + f.getlength(lines[-1]) + 6, y + (len(lines) - 1) * lh, lh)
            y += len(lines) * lh + (30 if title else 22)
        off = max(0, y - LIMIT)
        for r in rows:
            if r[0] == "img":
                _, yy, s = r; cw, ch = int(card.width * s), int(card.height * s)
                if cw > 1: cc = card.resize((cw, ch), Image.LANCZOS); img.paste(cc, (int(X + card.width / 2 - cw / 2), int(yy - off + card.height / 2 - ch / 2)), cc)
            else:
                _, yy, lines, f, col, lh = r
                for j, ln in enumerate(lines): d.text((X, yy - off + j * lh), ln, font=f, fill=col, anchor="lm")
        if cursor and int(t * 2.5) % 2 == 0: lx, ly, lh = cursor; d.rectangle([lx, ly - off - lh * .4, lx + 4, ly - off + lh * .4], fill=YEL)
        d.rectangle([0, 0, W, 215], fill=NBG); d.text((40, 90), "‹ Notes", font=F(40, 400, "Geist"), fill=YEL, anchor="lm"); d.text((W - 40, 90), "Done", font=F(40, 600, "Geist"), fill=YEL, anchor="rm")
        d.rounded_rectangle([0, H - 420, W, H], 0, fill=(38, 38, 40))
        for r_, row in enumerate(["qwertyuiop", "asdfghjkl", "zxcvbnm"]):
            kw = 92; tot = len(row) * kw + (len(row) - 1) * 12; x0 = W / 2 - tot / 2
            for c_, ch in enumerate(row):
                x = x0 + c_ * (kw + 12); yy = H - 370 + r_ * 110; d.rounded_rectangle([x, yy, x + kw, yy + 84], 12, fill=(78, 78, 82)); d.text((x + kw / 2, yy + 42), ch, font=F(40, 400, "Geist"), fill=INK, anchor="mm")
        d.rounded_rectangle([W / 2 - 300, H - 124, W / 2 + 300, H - 40], 12, fill=(78, 78, 82)); d.text((W / 2, H - 82), "space", font=F(34, 400, "Geist"), fill=INK, anchor="mm")
        return img
    m = Mixer(DUR)
    for sg in segs:
        if sg["vo"] is not None: m.put(sg["vo"], sg["start"], voice=True)
        if sg["typed"]:
            n = len(sg["typed"]); per = sg["tdur"] / max(1, n)
            for i in range(n):
                if sg["typed"][i] != " " or rng.random() < 0.5: m.put(keyclick(), sg["start"] + i * per, float(rng.uniform(0.25, 0.45)))
        if sg["key"] == "img": m.put(pop(420), sg["start"], 0.35)
    wav = os.path.join(work, "a.wav"); m.write(wav, mgain=0.0)
    return dict(frame=frame, dur=DUR, wav=wav, thumb_at=segs[4]["start"] + 0.5, title=f"Notes · {name} for {p}",
                caption=f"did the maths on {name}… {p} 😭 #safeswap #roblox #{game.lower().replace(' ', '')}")

# ---------------------------------------------------------------- 3. scam lines
SCAM_POOL = [("xX_Trader_Xx", "you go first bro i got 500 vouches", "You go first. I've got five hundred vouches."),
             ("MM_Services", "my middleman is in this server. join", "My middleman's in this server. Join it."),
             ("Fast_Deals", "send now, offer ends in 2 mins", "Send it now, the offer ends in two minutes."),
             ("Legit_Buyer", "ill pay you after trust", "I'll pay you after."),
             ("Giveaway_Host", "won the giveaway! just pay the fee", "You won the giveaway, just pay the fee."),
             ("Rich_Trader", "add me on discord to finish the trade", "Add me on Discord to finish the trade.")]
def make_scam(items, rng, work):
    it = items[0]; picks = [SCAM_POOL[i] for i in rng.choice(len(SCAM_POOL), 4, replace=False)]
    hook = str(rng.choice(["Every Roblox trade scam uses one of these four lines.", "If someone sends you one of these four lines, it's a scam.", "Four lines. Every Roblox scam uses one of them."]))
    LINES = [("hook", hook)] + [(f"l{i+1}", s[2]) for i, s in enumerate(picks)] + [
        ("pat", "Notice the pattern? A stranger. No receipt. No one to go to."),
        ("fix", "That's the whole reason SafeSwap exists. You pay at checkout, not to a person. Every order's tracked. Every seller's rated."),
        ("end", "If someone DMs you one of these... comment which one. Someone else needs to see it.")]
    GAP = {"hook": .15, "l1": .55, "l2": .55, "l3": .55, "l4": .7, "pat": .5, "fix": .5, "end": 1.5}
    segs, DUR = build_lines(LINES, GAP, 0.1, "am_adam", 1.15)
    card = listing_card(it, 560, ("Checked", GREEN)); BUB = (40, 41, 46)
    def bubble(img, d, y, name, txt, s):
        if s < 0.02: return
        f = F(40, 500, "Geist"); fn = F(28, 700, "Geist"); w = min(f.getlength(txt) + 70, W - 400); x0 = 80; cy = y + 60
        d.rounded_rectangle([x0, cy - 60 * s, x0 + w * s, cy + 60 * s], int(34 * s), fill=BUB)
        if s > 0.85: d.text((x0 + 34, cy - 24), name, font=fn, fill=(120, 150, 255), anchor="lm"); d.text((x0 + 34, cy + 20), txt, font=f, fill=INK, anchor="lm")
    def flag(img, x, y, s, rot):
        if s < 0.02: return
        st = Image.new("RGBA", (560, 150), (0, 0, 0, 0)); dr = ImageDraw.Draw(st)
        dr.rounded_rectangle([4, 4, 556, 146], 30, outline=(255, 59, 48), width=10, fill=(255, 59, 48, 40)); dr.text((280, 75), "SCAM", font=F(96, 800), fill=(255, 59, 48), anchor="mm")
        paste_scaled(img, st.rotate(rot, expand=True, resample=Image.BICUBIC), x, y, s)
    def frame(t):
        img = Image.new("RGB", (W, H), (10, 10, 12)); d = ImageDraw.Draw(img, "RGBA")
        HK, PT, FX, EN = segs["hook"], segs["pat"], segs["fix"], segs["end"]
        if t < PT["start"]:
            k = t - HK["start"]; caption(img, d, hook.rstrip("."), 380, 72, INK, back(k / 0.15, 2), w=700, maxw=W - 160)
            for i in range(4):
                sg = segs[f"l{i+1}"]
                if t >= sg["start"]:
                    kk = t - sg["start"]; name, txt, _ = picks[i]; y = 640 + i * 250
                    bubble(img, d, y, name, txt, back(kk / 0.2, 2.2)); ft = sg["start"] + sg["dur"] * 0.85
                    if t >= ft:
                        flag(img, W - 230, y + 60, back((t - ft) / 0.14, 2.8) * 0.62, -10 + 4 * i)
                        if t - ft < 0.08: d.rectangle([0, 0, W, H], fill=(255, 59, 48, int(70 * (1 - (t - ft) / 0.08))))
        elif t < FX["start"]:
            k = t - PT["start"]; caption(img, d, "notice the pattern?", 520, 80, DIM, back(k / 0.2), w=700)
            for i, (word, w_) in enumerate((("stranger", "A STRANGER"), ("no", "NO RECEIPT"), ("one", "NO ONE TO GO TO"))):
                tt = wtime(PT, word, last=(word == "one"))
                if t >= tt: caption(img, d, w_, 760 + i * 180, 112 if i < 2 else 92, INK, back((t - tt) / 0.18, 2.4))
        elif t < EN["start"]:
            k = t - FX["start"]; paste_scaled(img, card, 330, 820, back(k / 0.35, 1.6) * 0.95)
            for i, (word, lab) in enumerate((("checkout", "PAY AT\nCHECKOUT"), ("tracked", "EVERY ORDER\nTRACKED"), ("rated", "EVERY SELLER\nRATED"))):
                tt = wtime(FX, word)
                if t >= tt:
                    ss = back((t - tt) / 0.2, 2.4); y = 560 + i * 260; e = emoji("✅", 70 * ss); img.paste(e, (640, int(y - e.height / 2)), e)
                    for j, ln in enumerate(lab.split("\n")): d.text((730, y - 28 + j * 56), ln, font=F(48 * ss, 700, "Geist"), fill=GREEN if i == 0 else INK, anchor="lm")
            st = wtime(FX, "safeswap")
            if t >= st: caption(img, d, "that's the whole reason safeswap exists", 1420, 44, DIM, back((t - st) / 0.2), w=700)
        else:
            k = t - EN["start"]; caption(img, d, "been sent one of these?", 700, 84, INK, back(k / 0.2, 2), w=700)
            ct = wtime(EN, "comment")
            if t >= ct:
                s = back((t - ct) / 0.2, 2.3)
                for i, p_ in enumerate(picks):
                    d.rounded_rectangle([140, 860 + i * 120 - 44 * s, W - 140, 860 + i * 120 + 44 * s], int(30 * s), fill=BUB); caption(img, d, f"{i+1}  {p_[1][:28]}", 860 + i * 120, 44, INK, s, w=700)
                caption(img, d, "comment the number", 1420, 56, DIM, s, w=700); e = emoji("👇", 70 * s); img.paste(e, (int(W / 2 - e.width / 2), 1480), e)
            caption(img, d, "safeswap.gg", 1620, 48, DIM, ease((k - 1.0) / 0.3), w=700)
        progress(d, t, DUR, (255, 59, 48) if t < PT["start"] else GREEN)
        return img
    m = Mixer(DUR); m.segs(segs)
    for i in range(4):
        sg = segs[f"l{i+1}"]; m.put(pop(380), sg["start"], 0.5); m.put(buzz(), sg["start"] + sg["dur"] * 0.85, 0.9); m.put(boom(), sg["start"] + sg["dur"] * 0.85, 0.4)
    for w_ in ("stranger", "no"): m.put(boom(), wtime(segs["pat"], w_), 0.5)
    m.put(whoosh(0.4), segs["fix"]["start"] - 0.1, 0.5)
    for w_ in ("checkout", "tracked", "rated"): m.put(ding(), wtime(segs["fix"], w_), 0.35)
    m.put(pop(600), wtime(segs["end"], "comment"), 0.5)
    wav = os.path.join(work, "a.wav"); m.write(wav, 120, 0.3, int(rng.integers(0, 2)))
    return dict(frame=frame, dur=DUR, wav=wav, thumb_at=segs["l4"]["end"] - 0.2, title="Scam lines · " + picks[0][1][:30],
                caption=f"{hook.lower()} 🚩 comment the number #safeswap #roblox #robloxscams")

# ---------------------------------------------------------------- 4. discover (grid of real listings)
def make_discover(items, rng, work):
    its = items[:6]; it = its[0]; game = it["game"]; name = _item_phrase(it)
    cheapest = min(float(x["price"]) for x in its); games = sorted({x["game"] for x in its})
    hook = str(rng.choice([f"Wait. You can just... buy {game} items? With real money?", f"Hold on. People are buying {game} items for real money?", f"Since when can you buy {game} stuff with actual money?"]))
    others = ", ".join(g for g in games if g != game)[:60]
    LINES = [("h", hook), ("s1", f"Yeah. {name}. {speak_price(it['price'])}." + (f" And it's not just {game}. {others} too." if others else "")),
             ("s2", f"Prices start at {speak_price(cheapest)}."),
             ("s3", "And before anyone says scam: your money is held until the item lands. Paid through Stripe. Every sale's public."),
             ("s4", "What would you buy first? Comment it.")]
    GAP = {"h": .3, "s1": .5, "s2": .5, "s3": .5, "s4": 1.8}
    segs, DUR = build_lines(LINES, GAP, 0.1, "am_adam", 1.15)
    cards = [listing_card(x, 320) for x in its]; big = listing_card(it, 560, ("Checked", GREEN))
    def grid(img, k, s):
        cols = 3; gx, gy = 24, 24; cw, ch = cards[0].width, cards[0].height
        x0 = W / 2 - (cols * cw + (cols - 1) * gx) / 2; y0 = 280
        for i, c in enumerate(cards):
            ss = back(clamp((k - i * 0.08) / 0.3), 2) * s
            paste_scaled(img, c, x0 + (i % cols) * (cw + gx) + cw / 2, y0 + (i // cols) * (ch + gy) + ch / 2, ss)
    def frame(t):
        img = Image.new("RGB", (W, H), (9, 9, 12)); d = ImageDraw.Draw(img, "RGBA")
        Hh, S1, S2, S3, S4 = (segs[k] for k in ("h", "s1", "s2", "s3", "s4"))
        if t < S1["start"]:
            k = t - Hh["start"]; grid(img, k, 1.0)
            caption(img, d, "wait.", 1300, 100, INK, back(k / 0.2, 2.2)); bt = wtime(Hh, "buy")
            if t >= bt: caption(img, d, f"you can just buy {game} items?", 1420, 54, INK, back((t - bt) / 0.2))
            rt = wtime(Hh, "real")
            if t >= rt: caption(img, d, "with real money?", 1510, 56, DIM, back((t - rt) / 0.2))
        elif t < S2["start"]:
            k = t - S1["start"]; paste_scaled(img, big, W / 2, 700, back(k / 0.3, 1.8))
            caption(img, d, "yeah.", 1180, 120, LIME, back(k / 0.2, 2.2))
            nt = wtime(S1, "and")
            if t >= nt and others: caption(img, d, f"not just {game} — {others}", 1330, 40, DIM, back((t - nt) / 0.2), w=600, fam="Geist", maxw=W - 160)
        elif t < S3["start"]:
            k = t - S2["start"]; grid(img, 1 + k, 0.8); caption(img, d, "prices start at", 1300, 64, INK, back(k / 0.2))
            pt = wtime(S2, "at")
            if t >= pt: caption(img, d, price_text(cheapest), 1480, 190, LIME, back((t - pt) / 0.25, 2.4))
        elif t < S4["start"]:
            k = t - S3["start"]; caption(img, d, "before anyone says scam:", 420, 48, DIM, back(k / 0.2), w=600, fam="Geist")
            for i, (wd, txt) in enumerate((("your", "money is HELD until it lands"), ("paid", "paid through Stripe"), ("every", "every sale is public"))):
                tt = wtime(S3, wd)
                if t >= tt:
                    s = back((t - tt) / 0.25, 2); e = emoji("✅", 64 * s); y = 620 + i * 200; img.paste(e, (int(W / 2 - 420), int(y - e.height / 2)), e)
                    caption(img, d, txt, y, 56, INK, s, hl=("held", "stripe"), x=W / 2 + 50, maxw=760)
            caption(img, d, "safeswap.gg", 1400, 50, DIM, ease((k - 0.8) / 0.3), w=600, fam="GeistMono")
        else:
            k = t - S4["start"]; caption(img, d, "what would you buy first?", 760, 84, INK, back(k / 0.2, 2), w=800)
            ct = wtime(S4, "comment")
            if t >= ct:
                s = back((t - ct) / 0.2, 2.2); d.rounded_rectangle([90, 920 - 60 * s, W - 90, 920 + 60 * s], int(40 * s), fill=(30, 30, 34)); caption(img, d, "comment it 👇", 920, 50, DIM, s, w=600)
            caption(img, d, "safeswap.gg", 1400, 50, DIM, ease((k - 0.9) / 0.3), w=600, fam="GeistMono")
        progress(d, t, DUR); return img
    m = Mixer(DUR); m.segs(segs)
    for i in range(6): m.put(pop(500 + i * 40), segs["h"]["start"] + i * 0.08, 0.4)
    m.put(boom(), wtime(segs["s1"], "yeah"), 0.5); m.put(boom(), wtime(segs["s2"], "at"), 0.7); m.put(ding(), wtime(segs["s2"], "at"), 0.4)
    for k in ("s3", "s4"): m.put(whoosh(0.35), segs[k]["start"] - 0.1, 0.4)
    for wd in ("your", "paid", "every"): m.put(pop(450), wtime(segs["s3"], wd), 0.45)
    m.put(pop(650), wtime(segs["s4"], "comment"), 0.5)
    wav = os.path.join(work, "a.wav"); m.write(wav, 124, 0.3, int(rng.integers(0, 2)))
    return dict(frame=frame, dur=DUR, wav=wav, thumb_at=0.9, title=f"Discover · {game}",
                caption=f"wait you can just buy {game.lower()} items with real money?? from {price_text(cheapest)} #safeswap #roblox #{game.lower().replace(' ', '')}")

# ---------------------------------------------------------------- 5. spotlight (would you buy it)
def make_spotlight(items, rng, work):
    it = items[0]; p = price_text(it["price"]); sp = speak_price(it["price"]); name = _item_phrase(it); game = it["game"]
    hook = str(rng.choice([f"{name}... for {sp}?!", f"Someone's selling {name} for {sp}.", f"{sp}. For {name}. In {game}."]))
    LINES = [("cold", hook), ("title", "Would you buy it?"), ("ctx", str(rng.choice(["Real listing, live right now. Money's held until it lands.", "That's a live listing. Paid through Stripe, held until delivered.", "It's up right now. Checked seller, money held till it arrives."]))),
             ("ask", "Yes or no? Two seconds."), ("outro", str(rng.choice(["If yes wins, I'm buying it. Results tomorrow.", "Comment yes or no. I'll buy it if yes wins.", "Yes or no in the comments. Results tomorrow."])))]
    GAP = {"cold": .3, "title": .1, "ctx": .4, "ask": .05, "outro": 1.6}
    segs, DUR = build_lines(LINES, GAP, 0.15, "am_adam", 1.15)
    A = segs["ask"]; TIMER = dict(start=A["end"], dur=2.0); O = segs["outro"]
    # push outro after the timer
    shift = TIMER["dur"] + 0.1
    for k in ("outro",): segs[k]["start"] += shift; segs[k]["end"] += shift; segs[k]["words"] = [(tt + shift, w) for tt, w in segs[k]["words"]]
    DUR += shift
    card = listing_card(it, 600, ("Live", PURPLE2))
    def frame(t):
        img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img, "RGBA")
        d.ellipse([W / 2 - 520, 260, W / 2 + 520, 1300], fill=(*PURPLE, 14))
        C, T_, X, A_, O_ = segs["cold"], segs["title"], segs["ctx"], segs["ask"], segs["outro"]
        if t >= T_["start"]:
            hs = back((t - T_["start"]) / 0.25, 2.4); caption(img, d, "WOULD YOU BUY IT?", 190, 86, INK, hs, w=800); chip(d, f"{game.upper()}  ·  LIVE LISTING", 275, hs)
        zs = (1.25 - 0.25 * ease(t / 0.9)) if t < O_["start"] else 1.0
        fl = 6 * math.sin(t * 2.2); paste_scaled(img, card, W / 2, 720 + fl, zs * 0.95)
        pt = wtime(C, "for") if "for" in hook.lower() else C["start"] + C["dur"] * 0.4
        if t >= pt and t < O_["start"]:
            k = t - pt; ps = back(k / 0.22, 2.6)
            d.text((W / 2 + 2, 1330 + 2), p, font=F(190 * ps, 800), fill=(0, 0, 0), anchor="mm"); d.text((W / 2, 1330), p, font=F(190 * ps, 800), fill=LIME, anchor="mm")
            if k < 0.12: d.rectangle([0, 0, W, H], fill=(255, 255, 255, int(110 * (1 - k / 0.12))))
        if X["start"] <= t < A_["start"]: caption(img, d, "money held until it lands · paid via Stripe", 1470, 38, DIM, back((t - X["start"]) / 0.25), w=600, fam="Geist")
        if A_["start"] <= t < O_["start"]:
            k = t - A_["start"]; s = back(k / 0.25, 2.2)
            for off, lab, col in ((-250, "YES", GREEN), (250, "NO", (255, 90, 80))):
                pulse = 1 + (0.05 * math.sin((t - TIMER["start"]) * 14) if t >= TIMER["start"] else 0); w_, h_ = 400 * s * pulse, 150 * s * pulse; cx = W / 2 + off
                d.rounded_rectangle([cx - w_ / 2, 1600 - h_ / 2, cx + w_ / 2, 1600 + h_ / 2], int(40 * s), fill=col); d.text((cx, 1600), lab, font=F(84 * s, 800), fill=(10, 10, 14), anchor="mm")
            if TIMER["start"] <= t < TIMER["start"] + TIMER["dur"]:
                kk = t - TIMER["start"]; r = 70; d.ellipse([W / 2 - r - 10, 1600 - r - 10, W / 2 + r + 10, 1600 + r + 10], fill=BG)
                d.arc([W / 2 - r, 1600 - r, W / 2 + r, 1600 + r], -90, -90 + 360 * (1 - kk / TIMER["dur"]), fill=LIME, width=14); d.text((W / 2, 1602), str(2 - int(kk)), font=F(80, 800), fill=INK, anchor="mm")
        if t >= O_["start"]:
            k = t - O_["start"]; s = back(k / 0.3)
            for off, lab, col in ((-250, "YES", GREEN), (250, "NO", (255, 90, 80))):
                w_, h_ = 400 * s, 150 * s; cx = W / 2 + off; d.rounded_rectangle([cx - w_ / 2, 1380 - h_ / 2, cx + w_ / 2, 1380 + h_ / 2], int(40 * s), fill=col); d.text((cx, 1380), lab, font=F(84 * s, 800), fill=(10, 10, 14), anchor="mm")
            e = emoji("👇", 110 * s); img.paste(e, (int(W / 2 - e.width / 2), int(1480 + 8 * math.sin(k * 6))), e)
            rt = wtime(O_, "results") if "results" in LINES[4][1].lower() else wtime(O_, "comment")
            if t >= rt: caption(img, d, "RESULTS TOMORROW" if "results" in LINES[4][1].lower() else "COMMENT YES OR NO", 1660, 64, LIME, back((t - rt) / 0.25, 2.6), w=800)
        progress(d, t, DUR); return img
    m = Mixer(DUR); m.segs(segs)
    m.put(whoosh(0.6), -0.1, 0.5); m.put(boom(), pt_ := (wtime(segs["cold"], "for") if "for" in hook.lower() else segs["cold"]["start"] + segs["cold"]["dur"] * 0.4), 0.8); m.put(ding(), pt_, 0.5)
    m.put(whoosh(0.35), segs["title"]["start"] - 0.15, 0.45); m.put(pop(350), segs["title"]["start"], 0.6); m.put(pop(500), segs["ask"]["start"], 0.6)
    for j in range(2): m.put(tick(1500 if j == 0 else 1900), TIMER["start"] + j, 0.7)
    m.put(riser(2.0), TIMER["start"], 0.45); m.put(whoosh(), segs["outro"]["start"] - 0.2, 0.45); m.put(boom(), segs["outro"]["start"] + 0.6, 0.5)
    wav = os.path.join(work, "a.wav"); m.write(wav, 140, 0.45, int(rng.integers(0, 2)))
    return dict(frame=frame, dur=DUR, wav=wav, thumb_at=segs["title"]["start"] + 0.4, title=f"Would you buy it · {name} {p}",
                caption=f"{name} for {p}?? yes or no 👇 #safeswap #roblox #{game.lower().replace(' ', '')} #wouldyoubuyit")

FORMATS = {"texts": (make_texts, 1), "notes": (make_notes, 1), "scam": (make_scam, 1), "discover": (make_discover, 6), "spotlight": (make_spotlight, 1)}
