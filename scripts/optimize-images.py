"""يحوّل الصور الأصلية في assets-source/images إلى WebP بأحجام الموقع في public/img.

التشغيل:  npm run images   (يتطلب Python 3 و Pillow:  pip install Pillow)
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-source" / "images"
OUT = ROOT / "public" / "img"

# لكل صورة: ملفها الأصلي، والعروض المطلوبة بالبكسل، ومعالجة اختيارية قبل التصغير:
#   rotate:  (درجات، مركز الدوران) لتعديل ميل الصورة
#   crop:    (يسار، أعلى، يمين، أسفل) بعد التدوير
#   restore: نسبة تصحيح الألوان الباهتة (0 بلا تصحيح، 1 كامل)
IMAGES = {
    "cell-wide": {"file": "cell-wide.png", "widths": [1600, 960]},  # بطل الرئيسية (حاسبة)
    "cell-tall": {"file": "cell-tall.png", "widths": [1083, 720]},  # بطل الرئيسية (موبايل)
    "steadfast": {"file": "steadfast.png", "widths": [1254, 720]},  # السيرة: ثباتٌ في القيد
    "prayer-chains": {"file": "prayer-chains.png", "widths": [1254, 720]},  # السيرة: دعاءٌ في المطمورة
    "turban": {"file": "turban.png", "widths": [1254, 720]},  # السيرة: العمامة الخضراء
    # الهيئة، «بالأمس»: صورة مطبوعة قديمة مصوّرة داخل الألبوم؛ تُعدَّل ويُقصّ منها إطار 16:9
    "majlis-then": {
        "file": "majlis-then.webp",
        "rotate": (-0.5, (765, 995)),
        "crop": (52, 600, 1478, 1402),
        "restore": 0.55,
        "widths": [1280, 720],
    },
    # الهيئة، «اليوم»: مجلس السادة، 16:9 أصلًا
    "majlis-now": {"file": "majlis-now.webp", "widths": [1280, 720]},
}


def prepare(spec: dict) -> Image.Image:
    image = Image.open(SRC / spec["file"]).convert("RGB")
    if "rotate" in spec:
        angle, center = spec["rotate"]
        image = image.rotate(angle, resample=Image.BICUBIC, center=center, fillcolor=(255, 255, 255))
    if "crop" in spec:
        image = image.crop(spec["crop"])
    if spec.get("restore"):
        image = Image.blend(image, ImageOps.autocontrast(image, cutoff=1), spec["restore"])
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, spec in IMAGES.items():
        image = prepare(spec)
        for width in spec["widths"]:
            width = min(width, image.width)
            height = round(image.height * width / image.width)
            resized = image if width == image.width else image.resize((width, height), Image.LANCZOS)
            target = OUT / f"{name}-{width}.webp"
            resized.save(target, "WEBP", quality=80, method=6)
            print(f"{target.relative_to(ROOT)}  {width}x{height}  {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
