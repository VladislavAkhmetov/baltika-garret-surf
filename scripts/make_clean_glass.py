import numpy as np
from PIL import Image, ImageFilter, ImageDraw

mug = Image.open('paper-comics/assets/comics/mug-paper-frame.png')
w, h = mug.size
arr = np.array(mug)

# Center of cylinder is ~785.
# Right edge: glass body ends around 1120, paper border extends to 1210 (radius ~ 335 from center 785).
# On the left: center 785 - 335 = 450!
# Between x=0 and x=420 is the handle.
# Where the handle connected at top: y in [240, 400], x around 380..460
# Where the handle connected at bottom: y in [800, 1020], x around 350..470
# The left faceted column of the glass is between x=450 and x=560.
# The right faceted column of the glass is between x=1010 and x=1120.

# Notice that the right faceted column and the left faceted column are symmetrical facets of the glass!
# We can mirror the clean right faceted column (with its highlights and paper border) onto the left side!
# Let's inspect!
print(f'Mug size: {w}x{h}')

# Let's create a glass canvas of the same size
glass = mug.copy()
g_arr = np.array(glass)

# Erase the handle completely: everything to the left of the left facet (x < 370)
g_arr[:, :370] = 0

# Now, between y=230..420 and y=790..1030, where the handle joined x=370..470:
# The right facet (x around 1010..1220) is completely clean and has the exact faceted glass texture and paper border.
# Let's see what happens if we take the right facet (from x=1000 to 1230), flip it horizontally,
# and blend it into the left facet (x=340 to 570)!
right_facet = arr[:, 980:1230]
flipped_left = np.fliplr(right_facet)

# Where handle was attached, we can blend flipped_left into the left side
# Let's test this!
result = g_arr.copy()

# For the outer contour on the left (x from 340 to 480):
# Replace the cut/handle region with the mirrored clean right facet
for y in range(h):
    for x in range(330, 520):
        src_x = x - 330
        if src_x < flipped_left.shape[1]:
            # If the current pixel is in the handle attachment zone or transparent on the left:
            if x < 440 or (y >= 230 and y <= 420 and x < 480) or (y >= 800 and y <= 1040 and x < 480):
                result[y, x] = flipped_left[y, src_x]

Image.fromarray(result).save('scratch_clean_glass_test.png')
print('Saved scratch_clean_glass_test.png')
