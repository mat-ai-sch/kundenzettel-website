from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

SRC_DIR = Path(r"C:\Users\Schürmann\.cursor\projects\w-WUNDERWERKstatt-Chat\assets")
DST_DIR = Path(r"W:\WUNDERWERKstatt_Chat\portal\public\media\demo")


def encode(src: Path, dst: Path, ax: int, ay: int, px: float, py: float) -> None:
    vf = (
        "scale=1200:2133:force_original_aspect_ratio=increase,"
        "crop=1200:2133,"
        f"crop=1080:1920:(in_w-1080)/2+{ax}*sin(2*PI*t/{px}):(in_h-1920)/2+{ay}*cos(2*PI*t/{py})"
    )
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        str(src),
        "-t",
        "5",
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "22",
        "-movflags",
        "+faststart",
        str(dst),
    ]
    print(" ".join(cmd))
    subprocess.check_call(cmd)


def main() -> int:
    DST_DIR.mkdir(parents=True, exist_ok=True)
    clips = [
        ("anna-blickfang-hand.jpg", "anna-blickfang-hand.mp4", 22, 16, 3.1, 2.4),
        ("anna-blickfang-table.jpg", "anna-blickfang-table.mp4", 18, 20, 2.7, 3.3),
    ]
    for jpg, mp4, ax, ay, px, py in clips:
        src = SRC_DIR / jpg
        if not src.exists():
            print(f"missing {src}", file=sys.stderr)
            return 1
        still = DST_DIR / jpg
        shutil.copyfile(src, still)
        encode(still, DST_DIR / mp4, ax, ay, px, py)
    pdf = Path(r"W:\WUNDERWERKstatt_Chat\portal\public\media\Sideboard_Masse.pdf")
    if pdf.exists():
        pdf.unlink()
        print("removed Sideboard_Masse.pdf")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
