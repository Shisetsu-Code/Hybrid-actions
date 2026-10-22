"""Compare this game's saved command image with its reopened screen; no OCR."""
import base64, io, json, sys
from PIL import Image, ImageChops, ImageStat, ImageFilter
p = json.load(sys.stdin)
def load(key):
    image = Image.open(io.BytesIO(base64.b64decode(p[key])))
    image.load()
    return image.convert('RGB')
a, b = load('reference'), load('current')
def difference(left, right):
    left = left.resize((64, 64)).filter(ImageFilter.GaussianBlur(1))
    right = right.resize((64, 64)).filter(ImageFilter.GaussianBlur(1))
    return sum(ImageStat.Stat(ImageChops.difference(left, right)).mean) / 3
x, y = p['x'], p['y']
def target(image):
    w, h = image.size
    return image.crop((max(0, int((x-.08)*w)), max(0, int((y-.06)*h)), min(w, int((x+.08)*w)), min(h, int((y+.06)*h))))
scene, point = difference(a, b), difference(target(a), target(b))
print(json.dumps({'match': a.size == b.size and scene <= 12 and point <= 8, 'sceneDifference': scene, 'targetDifference': point}))
