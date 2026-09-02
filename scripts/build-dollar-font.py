#!/usr/bin/env python3
# ============================================================================
#  scripts/build-dollar-font.py — builds public/fonts/olune-dollar*.woff2
#
#  Why this exists
#  ---------------
#  Unicode has exactly one dollar sign (U+0024). Whether it draws with one
#  vertical bar or two is purely a decision the typeface makes — it carries no
#  currency meaning, and both NZD and USD are written with the same character.
#  But the two-bar form reads as "American" to a lot of people, and Bodoni Moda
#  (the marketing site's display face) draws it with two bars, so NZ prices on
#  the pricing cards looked like US prices.
#
#  Rather than borrow a single-bar "$" from some unrelated font — which would
#  sit visibly wrong beside Bodoni's numerals — this takes Bodoni Moda's own
#  dollar glyph and deletes one of its two bars, centring the survivor on the
#  S. The result is the typeface's real glyph, minus a stroke.
#
#  The output is a one-glyph font (~1KB per style) mapped over U+0024 only, so
#  it is layered in front of Bodoni via `unicode-range` in app/globals.css and
#  touches nothing else on the page.
#
#  This is a one-off developer tool, not part of the build. Re-run it only if
#  the marketing display face changes:
#
#      pip install fonttools brotli
#      python3 scripts/build-dollar-font.py
#
#  Bodoni Moda is licensed under the SIL Open Font License 1.1; the licence
#  travels with this derivative in public/fonts/OFL.txt.
# ============================================================================

import os
import re
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.subset import Options, Subsetter

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "fonts")
UA = "Mozilla/5.0 (compatible; olune-font-build)"
FAMILY = "Olune Dollar"

STYLES = [
    ("normal", "opsz,wght@6..96,500", "olune-dollar.woff2"),
    ("italic", "ital,opsz,wght@1,6..96,500", "olune-dollar-italic.woff2"),
]


def fetch_bodoni(spec: str) -> str:
    """Resolve a Google Fonts css2 request to the static Bodoni Moda TTF."""
    url = f"https://fonts.googleapis.com/css2?family=Bodoni+Moda:{spec}&display=swap"
    css = urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA})
    ).read().decode()
    urls = re.findall(r"url\((https://[^)]+)\)", css)
    if not urls:
        sys.exit(f"no font url in the css for {spec}")
    return urls[-1]


def single_bar(ttf_url: str, out_path: str) -> None:
    with urllib.request.urlopen(
        urllib.request.Request(ttf_url, headers={"User-Agent": UA})
    ) as r:
        font = TTFont(r)

    # Strip everything but the dollar sign — this ships as a one-glyph overlay.
    opts = Options()
    opts.glyph_names = True
    opts.notdef_outline = True
    opts.layout_features = []
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=[0x24])
    subsetter.subset(font)

    glyph = font["glyf"]["dollar"]
    glyph.expand(font["glyf"])

    # Bodoni draws the dollar as three contours: the S, then the two bars.
    ends = glyph.endPtsOfContours
    if len(ends) != 3:
        sys.exit(f"expected 3 contours in Bodoni's dollar, found {len(ends)}")
    first_bar = (ends[0] + 1, ends[1])
    coords = list(glyph.coordinates)

    # Slide the first bar onto the axis the pair straddled, then drop the
    # second. Measuring off the pair rather than off the S keeps the bar where
    # the designer put it — the S's own bbox is skewed by its terminals.
    pair_xs = [coords[i][0] for i in range(first_bar[0], ends[2] + 1)]
    bar_xs = [coords[i][0] for i in range(first_bar[0], first_bar[1] + 1)]
    shift = round((min(pair_xs) + max(pair_xs)) / 2 - (min(bar_xs) + max(bar_xs)) / 2)
    for i in range(first_bar[0], first_bar[1] + 1):
        coords[i] = (coords[i][0] + shift, coords[i][1])

    keep = range(0, first_bar[1] + 1)
    flags = list(glyph.flags)
    glyph.coordinates = GlyphCoordinates([coords[i] for i in keep])
    glyph.flags = bytearray([flags[i] for i in keep])
    glyph.endPtsOfContours = [ends[0], first_bar[1]]
    glyph.numberOfContours = 2
    glyph.program.fromBytecode(b"")  # hinting was written for the old outline
    glyph.recalcBounds(font["glyf"])

    # Rename: this is a modified font and must not claim to be Bodoni Moda.
    names = font["name"]
    for record in list(names.names):
        if record.nameID in (1, 3, 4, 6, 16):
            value = FAMILY
            if record.nameID == 6:
                value = FAMILY.replace(" ", "")
            elif record.nameID == 3:
                value = f"{FAMILY} — derived from Bodoni Moda (SIL OFL 1.1)"
            names.setName(value, record.nameID, record.platformID, record.platEncID, record.langID)

    font.flavor = "woff2"
    font.save(out_path)
    print(f"wrote {out_path} ({os.path.getsize(out_path)} bytes)")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for _style, spec, filename in STYLES:
        single_bar(fetch_bodoni(spec), os.path.join(OUT_DIR, filename))


if __name__ == "__main__":
    main()
