# Live exercise: start image matching with an AI assistant

For the 2026-09-19 call. The owner asked to be walked through "how to do it".
This is the first slice of image matching, small enough to finish on a call
(about 15 minutes) and real enough to keep: a function that fingerprints a
flyer and a function that says how different two fingerprints are.

Why a slice and not the whole feature: the whole thing is about three hours
(store a fingerprint per event, compute it nightly for new flyers, add "same
flyer, same day" to the grouping on the review page). The slice shows the
whole way of working: brief, failing test, code, green tests, pull request.

## Before the call (once)

```
cd ~/Documents/Eventtracker-FS
git checkout main && git pull
export LAFASLIST_VENV=~/.venvs/lafaslist
make test          # expect OK, about 12 seconds
```

## On the call

```
git checkout -b image-fingerprint
claude
```

Paste this, exactly:

```
Read AGENTS.md first. We want to flag duplicate events whose flyers are the
same image. Do the first slice only, test first:

1. Write API/API/event/test_imagehash.py. Build the test images in the test
   itself with Pillow (no network, no files on disk): one flyer-like image
   with a dozen random coloured rectangles, and a second one from a different
   seed. Tests: the same image saved as JPEG at quality 95 and at quality 30
   is within 6 bits; the same image resized to 320x320 is within 6 bits; a
   different image is more than 12 bits away; a hash against itself is 0;
   bytes that are not an image raise ValueError.
2. Run the tests and show me that they fail because the module is missing.
3. Add API/API/event/imagehash.py with dhash(image_bytes) returning a 16
   character hex string (64-bit difference hash: greyscale, resize to 9x8,
   compare each pixel with its right neighbour) and hamming(a, b) returning
   the number of differing bits. Pillow only, no new dependencies.
4. Run the new tests, then the whole suite with make test.

Do not touch models, migrations, the scraper, or anything on the server.
Stop when the tests pass and show me the diff.
```

What he will see, in order: it reads the briefing file, writes the failing
test, runs it and shows the failure, writes the function, runs the tests, then
the whole suite (394 plus the new ones), and shows the diff.

Then type: `commit this on the branch and open a pull request`. Show him the
pull request link. Nothing is live: a pull request is a proposal. The site
only changes when it is reviewed, merged and deployed.

## If it stalls

Say "this is normal, it is a junior developer, let me nudge it", and type what
you see is wrong in plain words. If the call is running short, stop after the
failing test and the function, and finish the pull request afterwards.

## Reference (what a correct answer looks like)

Checked on 2026-09-19 with Pillow 12: the same flyer re-compressed or resized
differs by 0 to 1 bits; different flyers differ by 24 to 33 bits.

```python
import io
from PIL import Image

def dhash(image_bytes, size=8):
    try:
        im = (Image.open(io.BytesIO(image_bytes)).convert("L")
              .resize((size + 1, size), Image.LANCZOS))
    except Exception as exc:
        raise ValueError("not an image") from exc
    px, bits = im.tobytes(), 0
    for y in range(size):
        for x in range(size):
            left, right = px[y * (size + 1) + x], px[y * (size + 1) + x + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return "%016x" % bits

def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")
```

## What is left after the call (about three hours)

1. A small database change to store each event's fingerprint.
2. Compute it nightly for new flyers (they are public files; about 300 a night).
3. Add "same flyer, same day" as a fourth reason in the wide net, so those
   pairs join the groups on the review page.
4. Honest expectation, measured on 74 of his real pairs: about 3 in 100
   candidates share artwork. It catches reposts of the same flyer under
   different titles, which nothing else can; it is not the main signal.
