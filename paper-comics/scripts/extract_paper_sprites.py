"""
Extract papercraft sprites, HUD elements, and textures from concept image
"""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import os

source_path = 'C:/Users/amazi/.gemini/antigravity/brain/c5c8bd3d-6ce5-49cf-9456-e3d69c34303f/.user_uploaded/media_1790867373024.jpg'
src = Image.open(source_path).convert('RGBA')
w, h = src.size

os.makedirs('assets/sprites', exist_ok=True)

# 1. HELPER: Cut out element by removing beige background outside white sticker border
def isolate_sticker(crop_box, bg_threshold=42):
    cropped = src.crop(crop_box)
    cw, ch = cropped.size
    
    # Sample background color from corners
    corners = [(2, 2), (cw - 3, 2), (2, ch - 3), (cw - 3, ch - 3)]
    bg_colors = [np.array(cropped.getpixel(pt)[:3]) for pt in corners]
    bg_mean = np.mean(bg_colors, axis=0)
    
    arr = np.array(cropped)
    rgb = arr[:, :, :3].astype(float)
    
    # Distance to background beige
    diff = np.linalg.norm(rgb - bg_mean, axis=2)
    
    # Create mask using flood fill from border to prevent cutting inside white shirt
    mask = Image.new('L', (cw, ch), 0)
    # Flood-fill background from corners
    diff_img = (diff > bg_threshold).astype(np.uint8) * 255
    diff_pil = Image.fromarray(diff_img)
    
    # Floodfill background
    from collections import deque
    q = deque()
    visited = set()
    for x in range(cw):
        q.append((x, 0))
        q.append((x, ch - 1))
    for y in range(ch):
        q.append((0, y))
        q.append((cw - 1, y))
        
    alpha = np.ones((ch, cw), dtype=np.uint8) * 255
    
    while q:
        x, y = q.popleft()
        if (x, y) in visited or x < 0 or x >= cw or y < 0 or y >= ch:
            continue
        visited.add((x, y))
        
        # If it is close to background color, mark transparent
        d = np.linalg.norm(rgb[y, x] - bg_mean)
        # Check if color is beige/paper or torn edge
        is_bg = d < bg_threshold or (rgb[y, x, 0] > 200 and rgb[y, x, 1] > 190 and rgb[y, x, 2] > 170 and d < bg_threshold * 1.5)
        if is_bg:
            alpha[y, x] = 0
            q.append((x + 1, y))
            q.append((x - 1, y))
            q.append((x, y + 1))
            q.append((x, y - 1))
            
    # Smooth alpha slightly
    alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(radius=0.7))
    arr[:, :, 3] = np.array(alpha_img)
    return Image.fromarray(arr)

# 1. EXTRACT SURFER POSES
print("Extracting Surfer Poses...")
# 01 Norma
pose_norma = isolate_sticker((65, 805, 185, 955), bg_threshold=40)
pose_norma.save('assets/sprites/surfer_norma.png')

# 02 Turn
pose_turn = isolate_sticker((238, 805, 375, 955), bg_threshold=42)
pose_turn.save('assets/sprites/surfer_turn.png')

# 03 Jump
pose_jump = isolate_sticker((405, 792, 550, 955), bg_threshold=42)
pose_jump.save('assets/sprites/surfer_jump.png')

# Hero Surfer (Large in center of wave)
hero_surfer = isolate_sticker((180, 290, 420, 595), bg_threshold=55)
hero_surfer.save('assets/sprites/surfer_hero.png')

# 2. EXTRACT BOTTLE CAPS (Жестяные пробки с зубчиками)
print("Extracting Bottle Caps...")
# Yellow Fish Cap
cap_fish = isolate_sticker((15, 545, 100, 635), bg_threshold=50)
cap_fish.save('assets/sprites/cap_fish.png')

# Red Palm Cap
cap_palm = isolate_sticker((312, 160, 396, 248), bg_threshold=50)
cap_palm.save('assets/sprites/cap_palm.png')

# 3. EXTRACT HUD ELEMENTS
print("Extracting HUD Elements...")
# Beer Cup HUD with progress bar
hud_beer = src.crop((8, 8, 192, 130))
# Make border clean
hud_beer.save('assets/sprites/hud_beer.png')

# Beer Cup standalone
beer_cup = isolate_sticker((15, 12, 125, 105), bg_threshold=60)
beer_cup.save('assets/sprites/beer_cup.png')

# Collection Ribbon
hud_collection = src.crop((192, 4, 424, 106))
hud_collection.save('assets/sprites/hud_collection.png')

# Score Odometer
hud_score = src.crop((420, 8, 570, 108))
hud_score.save('assets/sprites/hud_score.png')

# Trick Sticker ("ТРЮК +250")
hud_trick = isolate_sticker((418, 198, 565, 322), bg_threshold=48)
hud_trick.save('assets/sprites/hud_trick.png')

# 4. EXTRACT ENVIRONMENT ELEMENTS
print("Extracting Environment Cutouts...")
# Town on Cliff
bg_town = isolate_sticker((0, 150, 205, 435), bg_threshold=65)
bg_town.save('assets/sprites/bg_town.png')

# Jump Ramp with Arrow Sign
ramp_chevron = isolate_sticker((385, 425, 572, 565), bg_threshold=60)
ramp_chevron.save('assets/sprites/ramp_chevron.png')

# Seagulls
seagull_1 = isolate_sticker((105, 130, 195, 220), bg_threshold=45)
seagull_1.save('assets/sprites/seagull_1.png')
seagull_2 = isolate_sticker((470, 115, 545, 185), bg_threshold=45)
seagull_2.save('assets/sprites/seagull_2.png')

# Sun cutout
sun_disc = src.crop((160, 95, 435, 390))
sun_disc.save('assets/sprites/bg_sun.png')

# 5. EXTRACT CRAFT PAPER TEXTURE
# Sample clean paper background for page textures
paper_sample = src.crop((30, 800, 230, 1000))
paper_sample.save('assets/sprites/paper_texture.png')

# Wave texture patch with halftone print
wave_patch = src.crop((120, 600, 480, 800))
wave_patch.save('assets/sprites/wave_paper_texture.png')

print("All papercraft sprites extracted successfully!")
