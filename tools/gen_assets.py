#!/usr/bin/env python3
"""Генерация графики через Gemini-совместимый API (модель gemini-3.1-flash-image),
вырезание фона и сжатие в WebP.

    GEMINI_BASE_URL=http://127.0.0.1:8317 GEMINI_API_KEY=... python3 tools/gen_assets.py [имя ...]

Ключ и адрес берутся только из окружения, в репозиторий они не попадают.
Сырые ответы кэшируются в tools/.raw (в .gitignore), готовые файлы лежат в public/img.
"""
import base64, io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageFilter

BASE = os.environ.get('GEMINI_BASE_URL', 'http://127.0.0.1:8317').rstrip('/')
KEY = os.environ.get('GEMINI_API_KEY', '')
MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', '.raw')
OUT = os.path.join(ROOT, 'public', 'img')
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)

STYLE = ('Minimalist soft 3D render of a premium board game component, matte ceramic clay material with a subtle satin sheen, '
         'soft diffused studio lighting from the top left, clean simple geometry, high-end product photography look. ')
CUT = ('Plain pure white seamless background, the object floats alone in the exact center with generous empty margin around it, '
       'no cast shadow, no floor, no reflection, no text, no watermark, square composition.')

# Палитра игроков: бирюза, коралл, шафран, шалфей
PLAYERS = [('teal', '#1fb5a8', 'a smooth sphere'), ('coral', '#f2687b', 'a rounded cube'),
           ('saffron', '#f5b83d', 'a cone with a rounded tip'), ('sage', '#8fc27a', 'a torus ring standing upright')]

JOBS = {}
for i, (nm, hexc, shape) in enumerate(PLAYERS):
    JOBS[f'pawn{i}'] = dict(cut=True, size=192, prompt=STYLE + f'A single game pawn: {shape} in solid {nm} color ({hexc}) resting on a short round cylindrical base of the same color. ' + CUT)
JOBS['bonus_wall'] = dict(cut=True, size=128, prompt=STYLE + 'A tiny stack of three small cream-colored bricks, icon style. ' + CUT)
JOBS['bonus_again'] = dict(cut=True, size=128, prompt=STYLE + 'A single cream-colored six-sided die with dark pips, icon style. ' + CUT)
JOBS['bonus_freeze'] = dict(cut=True, size=128, prompt=STYLE + 'A single faceted pale blue ice crystal snowflake gem, icon style. ' + CUT)
JOBS['trophy'] = dict(cut=True, size=320, prompt=STYLE + 'A simple elegant trophy cup in soft gold color, minimal geometry. ' + CUT)
JOBS['table'] = dict(cut=False, size=1280, quality=62, prompt='Seamless top-down texture of a dark charcoal slate surface with very subtle fine grain and soft vignette lighting, minimal, premium, no objects, no text, wide composition.')


def generate(name, prompt):
    cache = os.path.join(RAW, name + '.img')
    if os.path.exists(cache):
        return open(cache, 'rb').read()
    body = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                       'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '1:1'}}}).encode()
    req = urllib.request.Request(f'{BASE}/v1beta/models/{MODEL}:generateContent', body,
                                 {'Content-Type': 'application/json', 'x-goog-api-key': KEY})
    with urllib.request.urlopen(req, timeout=240) as r:
        d = json.load(r)
    for p in d['candidates'][0]['content']['parts']:
        if 'inlineData' in p:
            raw = base64.b64decode(p['inlineData']['data'])
            open(cache, 'wb').write(raw)
            return raw
    raise RuntimeError(f'{name}: нет картинки в ответе: {str(d)[:300]}')


HOLES = False


def cutout(img):
    """Убирает белый фон, связанный с краями кадра, и подрезает по содержимому."""
    rgb = img.convert('RGB'); a = np.asarray(rgb).astype(int)
    near = Image.fromarray(((a.min(axis=2) > 228) * 255).astype('uint8'))
    seed = np.zeros(near.size[::-1], bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    nearm = np.asarray(near) > 0
    bg = seed & nearm
    holes = bool(HOLES)
    while True:  # заливка фона от краёв кадра (без scipy)
        grown = np.asarray(Image.fromarray((bg * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5))) > 0
        grown &= nearm
        if grown.sum() == bg.sum():
            break
        bg = grown
    if HOLES:
        bg = bg | (a.min(axis=2) > 236)  # у предметов с дыркой прозрачным делаем и внутренний фон
    alpha = Image.fromarray(((~bg) * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
    out = rgb.convert('RGBA'); out.putalpha(alpha)
    return out.crop(out.getbbox())


def tint(img, hexc):
    """Перекрашивает светлую деталь в цвет игрока, сохраняя объём (по яркости)."""
    h = hexc.lstrip('#'); rgb = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)
    a = np.asarray(img).astype(float); lum = a[..., :3].mean(axis=2, keepdims=True) / 255.0
    a[..., :3] = np.clip(rgb * (0.35 + 0.85 * lum), 0, 255)
    return Image.fromarray(a.astype('uint8'), 'RGBA')


def fit(img, size):
    img = img.copy(); img.thumbnail((size, size), Image.LANCZOS)
    pad = Image.new('RGBA', (size, size), (0, 0, 0, 0)); pad.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
    return pad


def save(img, name, q=82):
    path = os.path.join(OUT, name + '.webp'); img.save(path, 'WEBP', quality=q, method=6)
    print(f'  {name}.webp  {os.path.getsize(path) // 1024} КБ')


def run(name):
    job = JOBS[name]
    img = Image.open(io.BytesIO(generate(name, job['prompt'])))
    if job['cut']:
        global HOLES
        HOLES = name == 'pawn3'
        img = cutout(img)
        if job.get('tint'):
            for i, (_, hexc, _) in enumerate(PLAYERS):
                save(fit(tint(img, hexc), job['size']), f'wall{i}')
            return
        save(fit(img, job['size']), name)
    else:
        img = img.convert('RGB'); img.thumbnail((job['size'], job['size']), Image.LANCZOS)
        save(img, name, job.get('quality', 70))


if __name__ == '__main__':
    names = sys.argv[1:] or list(JOBS)
    if not KEY:
        sys.exit('Задайте GEMINI_API_KEY (и при необходимости GEMINI_BASE_URL)')
    with ThreadPoolExecutor(4) as ex:
        for n, f in [(n, ex.submit(run, n)) for n in names]:
            try: f.result()
            except Exception as e: print(f'  ✗ {n}: {e}')
