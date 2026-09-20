"""
Tests for image hashing used in duplicate flyer detection.
2026-09-19: First slice—dhash and hamming distance.
"""
import io
import random
from django.test import TestCase
from PIL import Image

from event.imagehash import dhash, hamming


def make_flyer_image(seed, width=800, height=1000):
    """
    Build a flyer-like image in memory: a dozen random coloured rectangles
    on a white background. Deterministic given seed.
    """
    rng = random.Random(seed)
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    pixels = img.load()

    for _ in range(12):
        # Random rectangle bounds
        x1 = rng.randint(0, width - 100)
        y1 = rng.randint(0, height - 100)
        x2 = rng.randint(x1 + 50, min(x1 + 300, width))
        y2 = rng.randint(y1 + 50, min(y1 + 300, height))
        # Random colour
        color = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255))
        for x in range(x1, x2):
            for y in range(y1, y2):
                pixels[x, y] = color

    return img


def image_to_jpeg_bytes(img, quality=95):
    """Save PIL Image to JPEG bytes at given quality."""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


class DHashTests(TestCase):
    """Tests for dhash() and hamming()."""

    def test_same_image_different_jpeg_quality_within_6_bits(self):
        """Same image saved as JPEG at quality 95 and 30 should be within 6 bits."""
        img = make_flyer_image(seed=42)
        bytes_q95 = image_to_jpeg_bytes(img, quality=95)
        bytes_q30 = image_to_jpeg_bytes(img, quality=30)

        hash_q95 = dhash(bytes_q95)
        hash_q30 = dhash(bytes_q30)

        distance = hamming(hash_q95, hash_q30)
        self.assertLessEqual(
            distance, 6,
            f"Same image at q95 vs q30 should differ by <=6 bits, got {distance}"
        )

    def test_same_image_resized_within_6_bits(self):
        """Same image resized to 320x320 should be within 6 bits of original."""
        img = make_flyer_image(seed=42)
        bytes_original = image_to_jpeg_bytes(img, quality=95)

        img_resized = img.resize((320, 320), Image.LANCZOS)
        bytes_resized = image_to_jpeg_bytes(img_resized, quality=95)

        hash_original = dhash(bytes_original)
        hash_resized = dhash(bytes_resized)

        distance = hamming(hash_original, hash_resized)
        self.assertLessEqual(
            distance, 6,
            f"Original vs 320x320 resize should differ by <=6 bits, got {distance}"
        )

    def test_different_images_more_than_12_bits_apart(self):
        """Two different images should be more than 12 bits apart."""
        img1 = make_flyer_image(seed=42)
        img2 = make_flyer_image(seed=999)

        bytes1 = image_to_jpeg_bytes(img1, quality=95)
        bytes2 = image_to_jpeg_bytes(img2, quality=95)

        hash1 = dhash(bytes1)
        hash2 = dhash(bytes2)

        distance = hamming(hash1, hash2)
        self.assertGreater(
            distance, 12,
            f"Different images should differ by >12 bits, got {distance}"
        )

    def test_hash_against_itself_is_zero(self):
        """A hash compared to itself should have 0 differing bits."""
        img = make_flyer_image(seed=42)
        bytes_img = image_to_jpeg_bytes(img, quality=95)
        h = dhash(bytes_img)

        self.assertEqual(hamming(h, h), 0)

    def test_non_image_bytes_raises_valueerror(self):
        """Bytes that are not an image should raise ValueError."""
        bad_bytes = b"this is not an image at all"

        with self.assertRaises(ValueError):
            dhash(bad_bytes)

    def test_dhash_returns_16_char_hex_string(self):
        """dhash should return a 16 character hex string (64 bits)."""
        img = make_flyer_image(seed=42)
        bytes_img = image_to_jpeg_bytes(img, quality=95)
        h = dhash(bytes_img)

        self.assertEqual(len(h), 16)
        # Should be valid hex
        int(h, 16)  # Raises if not valid hex
