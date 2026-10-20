import os
from PIL import Image, ImageEnhance

def generate_favicons():
    # Source image
    src_path = 'assets/comics/comic-crab-v4.png'
    if not os.path.exists(src_path):
        src_path = 'paper-comics/assets/comics/comic-crab-v4.png'

    src = Image.open(src_path)

    # Optimal crop box centered tightly on the crab character (no surfer foot, full claw, expressive eyes)
    # Box: (630, 195, 1220, 785) -> 590x590
    crop_box = (630, 195, 1220, 785)
    crab_crop = src.crop(crop_box)

    # Master high-res 512x512
    master_512 = crab_crop.resize((512, 512), Image.Resampling.LANCZOS)

    # 192x192
    img_192 = master_512.resize((192, 192), Image.Resampling.LANCZOS)

    # 180x180 (Apple touch icon)
    img_180 = master_512.resize((180, 180), Image.Resampling.LANCZOS)

    # 48x48
    img_48 = master_512.resize((48, 48), Image.Resampling.LANCZOS)
    img_48 = ImageEnhance.Sharpness(img_48).enhance(1.2)

    # 32x32
    img_32 = master_512.resize((32, 32), Image.Resampling.LANCZOS)
    img_32 = ImageEnhance.Sharpness(img_32).enhance(1.35)

    # 16x16
    img_16 = master_512.resize((16, 16), Image.Resampling.LANCZOS)
    img_16 = ImageEnhance.Sharpness(img_16).enhance(1.6)
    img_16 = ImageEnhance.Contrast(img_16).enhance(1.15)

    # Target folders: root and paper-comics
    folders = ['.', 'paper-comics']

    for folder in folders:
        os.makedirs(folder, exist_ok=True)
        
        # Save PNG icons
        master_512.save(os.path.join(folder, 'android-chrome-512x512.png'), format='PNG', optimize=True)
        img_192.save(os.path.join(folder, 'android-chrome-192x192.png'), format='PNG', optimize=True)
        img_180.save(os.path.join(folder, 'apple-touch-icon.png'), format='PNG', optimize=True)
        img_48.save(os.path.join(folder, 'favicon-48x48.png'), format='PNG', optimize=True)
        img_32.save(os.path.join(folder, 'favicon-32x32.png'), format='PNG', optimize=True)
        img_16.save(os.path.join(folder, 'favicon-16x16.png'), format='PNG', optimize=True)

        # Save multi-size favicon.ico
        img_48.save(
            os.path.join(folder, 'favicon.ico'),
            format='ICO',
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=[img_32, img_16]
        )
        print(f"Generated favicons in {folder}/")

    # Generate site.webmanifest
    manifest_content = """{
  "name": "GARRET - На волне!",
  "short_name": "Garret Surf",
  "icons": [
    {
      "src": "/android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#103f58",
  "background_color": "#e7ddc2",
  "display": "standalone"
}
"""
    for folder in folders:
        with open(os.path.join(folder, 'site.webmanifest'), 'w', encoding='utf-8') as f:
            f.write(manifest_content)

    print("Favicon generation completed successfully!")

if __name__ == '__main__':
    generate_favicons()
