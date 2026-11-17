"""Generate the small cat tray icon used by Electron."""
from PIL import Image, ImageDraw

SIZE = 32
img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cream = (244, 214, 166, 255)
cream_dark = (239, 190, 148, 255)
outline = (122, 75, 42, 255)
eye = (43, 27, 22, 255)
pink = (224, 107, 94, 255)
white = (255, 255, 255, 255)

# Ears behind the head.
draw.polygon([(8, 22), (13, 3), (29, 15)], fill=cream, outline=outline)
draw.polygon([(56, 22), (51, 3), (35, 15)], fill=cream, outline=outline)
draw.polygon([(13, 18), (16, 8), (25, 15)], fill=cream_dark)
draw.polygon([(51, 18), (48, 8), (39, 15)], fill=cream_dark)

# Head.
draw.ellipse((5, 13, 59, 61), fill=cream, outline=outline)
# Cheeks.
draw.ellipse((10, 34, 28, 52), fill=(255, 235, 204, 255))
draw.ellipse((36, 34, 54, 52), fill=(255, 235, 204, 255))
# Eyes with highlights.
for cx in (22, 42):
    draw.ellipse((cx - 4, 28, cx + 4, 36), fill=eye)
    draw.ellipse((cx - 2, 29, cx, 32), fill=white)
# Nose and mouth.
draw.polygon([(28, 40), (36, 40), (32, 45)], fill=pink)
draw.arc((25, 43, 32, 50), start=0, end=110, fill=outline, width=2)
draw.arc((32, 43, 39, 50), start=70, end=180, fill=outline, width=2)

img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
img.save("app/assets/tray.png")
print("wrote app/assets/tray.png")
