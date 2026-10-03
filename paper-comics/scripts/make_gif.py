import os
import glob
from PIL import Image

def build_gif():
    frames_dir = os.path.join(os.path.dirname(__file__), "..", ".frames")
    files = sorted(glob.glob(os.path.join(frames_dir, "frame_*.png")))
    if not files:
        print("No frames found")
        return

    images = []
    for f in files:
        im = Image.open(f)
        # Resize to crisp portrait size for lightweight GIF
        im = im.resize((270, 585), Image.Resampling.LANCZOS)
        im_p = im.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
        images.append(im_p)

    out_paths = [
        os.path.join(os.path.dirname(__file__), "..", "gameplay-screencast.gif"),
        os.path.join(os.path.dirname(__file__), "..", "review", "phase1", "checkpoint_a.gif")
    ]

    for out_path in out_paths:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        images[0].save(
            out_path,
            save_all=True,
            append_images=images[1:],
            duration=90, # ~11 fps
            loop=0,
            optimize=True
        )
        print("Saved GIF:", out_path, "Size:", os.path.getsize(out_path), "bytes")

if __name__ == "__main__":
    build_gif()
