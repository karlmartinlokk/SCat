"""Render the README demo GIF from the exported sprites (needs Pillow).

Usage: python3 sprite-tools/make_readme_gif.py frontend/public/sprites docs/images/scat-demo.gif
"""
import json, sys
from PIL import Image
src = sys.argv[1]
d = json.load(open(f"{src}/atlas.json"))
cat = Image.open(f"{src}/cat_sheet.png").convert("RGBA")
ovl = Image.open(f"{src}/overlays_sheet.png").convert("RGBA")
W, H = d["meta"]["scene"]["w"], d["meta"]["scene"]["h"]
ox, oy = d["meta"]["cat"]["origin"]["x"], d["meta"]["cat"]["origin"]["y"]
SCALE = 6
PAD = 1  # transparent pixels kept around the cat (before scaling)
BG = (0, 0, 0, 0)  # transparent

def frames_of(state, loops=1):
    out = []
    for _ in range(loops):
        out += d["cat"][state]["frames"]
    return out

def render(cf, overlay=None, t=0):
    img = Image.new("RGBA", (W, H), BG)
    img.alpha_composite(cat.crop((cf["x"], cf["y"], cf["x"]+cf["w"], cf["y"]+cf["h"])), (ox, oy))
    if overlay:
        o = d["overlays"][overlay]
        fs = o["frames"]; total = sum(f["duration"] for f in fs); tt = t % total
        for f in fs:
            if tt < f["duration"]: break
            tt -= f["duration"]
        off = o["offset"]
        img.alpha_composite(ovl.crop((f["x"], f["y"], f["x"]+f["w"], f["y"]+f["h"])), (ox+off["x"], oy+off["y"]))
    return img

seq = [("idle", 2, None), ("curious", 1, "review_bubble"), ("merged", 1, None), ("idle", 1, None),
       ("sick", 1, None), ("recover", 1, None), ("idle", 1, None), ("sleep", 2, None)]
imgs, durs = [], []
for state, loops, overlay in seq:
    t = 0
    for f in frames_of(state, loops):
        if overlay:  # step in 110 ms slices so the bubble animates
            left = f["duration"]
            while left > 0:
                step = min(110, left)
                imgs.append(render(f, overlay, t)); durs.append(step); t += step; left -= step
        else:
            imgs.append(render(f)); durs.append(f["duration"])
# Crop every frame to the same square around everything that is ever drawn
# (cat, bubble, sparkles, Zzz), so the animation does not jump between frames.
boxes = [i.getchannel("A").getbbox() for i in imgs]
boxes = [b for b in boxes if b]
l = min(b[0] for b in boxes) - PAD; t = min(b[1] for b in boxes) - PAD
r = max(b[2] for b in boxes) + PAD; btm = max(b[3] for b in boxes) + PAD
side = max(r - l, btm - t)
cx, cy = (l + r) / 2, (t + btm) / 2
l, t = round(cx - side / 2), round(cy - side / 2)
canvas = []
for i in imgs:
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(i, (-l, -t))  # also pads with transparency if the square sticks out of the scene
    canvas.append(sq.resize((side * SCALE, side * SCALE), Image.NEAREST))
imgs = canvas
print("crop", (l, t, l + side, t + side), "->", side * SCALE, "px")

# GIF timing is in 10 ms units; keep >= 20 ms
durs = [max(20, round(x/10)*10) for x in durs]

# Pixel art uses an exact palette, so map colours 1:1 and reserve index 0 for transparency.
colours = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) for h in d["meta"]["palette"]]
def to_p(img):
    px = img.load(); w, h = img.size
    p = Image.new("P", (w, h), 0)
    pp = p.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            if (r, g, b) not in colours:  # nearest palette colour for any stray value
                colours.append((r, g, b))
            pp[x, y] = colours.index((r, g, b)) + 1
    return p
frames_p = [to_p(i) for i in imgs]
flat = [255, 0, 255] + [c for col in colours for c in col]
flat += [0] * (768 - len(flat))
for f in frames_p:
    f.putpalette(flat)
frames_p[0].save(sys.argv[2], save_all=True, append_images=frames_p[1:], duration=durs, loop=0,
                 transparency=0, disposal=2, optimize=False)
imgs[0].save(sys.argv[2].replace(".gif", "_still.png"))
print(len(imgs), "frames", sum(durs), "ms")
