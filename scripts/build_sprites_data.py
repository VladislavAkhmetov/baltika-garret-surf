"""
Build js/sprites-data.js containing base64 data URIs for all extracted papercraft sprites.
This guarantees zero CORS errors on file://, mobile WebViews, and fast offline playback.
"""
import base64
import os

sprites = [
    'surfer_norma.png',
    'surfer_turn.png',
    'surfer_jump.png',
    'cap_fish.png',
    'cap_palm.png',
    'cap_empty.png',
    'chevron_sign.png',
    'hud_beer.png',
    'hud_collection.png',
    'hud_score.png',
    'hud_trick.png',
    'bg_town.png',
    'bg_town_transparent.png',
    'bg_rocks.png',
    'bg_sun.png',
    'beer_cup.png',
    'cherry_beer_cup.png',
    'wave_paper_texture.png',
    'paper_texture.png',
    'seagull_1.png',
    'seagull_2.png',
    'ref_foam_crest.png',
    'ref_left_steps.png',
    'ref_flat_water.png'
]

lines = ['window.SPRITE_ASSETS = {']
for s in sprites:
    path = os.path.join('assets', 'sprites', s)
    if os.path.exists(path):
        with open(path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')
            key = s.replace('.png', '').replace('-', '_')
            lines.append(f'  "{key}": "data:image/png;base64,{b64}",')
            print(f'Encoded {s}: {len(b64) // 1024} KB')
    else:
        print(f'Missing: {s}')

lines.append('};')

output_path = os.path.join('js', 'sprites-data.js')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f'Successfully generated {output_path} ({os.path.getsize(output_path) // 1024} KB)')
