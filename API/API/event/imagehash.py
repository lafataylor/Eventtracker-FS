"""
Perceptual image hashing for duplicate flyer detection.
2026-09-19: First slice—dhash (difference hash) and hamming distance.

dhash is robust to JPEG compression and minor resizing because it compares
relative brightness between adjacent pixels, not absolute values.
"""
import io
from PIL import Image


def dhash(image_bytes):
    """
    Compute a 64-bit difference hash (dhash) from raw image bytes.

    Algorithm:
      1. Convert to greyscale
      2. Resize to 9x8 (9 columns so we can compare 8 pairs)
      3. For each row, compare each pixel with its right neighbour
      4. Pack the 64 comparisons into a hash

    Returns a 16-character lowercase hex string (64 bits).
    Raises ValueError if image_bytes cannot be decoded as an image.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise ValueError(f"Cannot decode image: {e}")

    # Convert to greyscale and resize to 9 wide x 8 tall
    grey = img.convert("L").resize((9, 8), Image.LANCZOS)
    pixels = list(grey.getdata())

    # Build the hash: compare each pixel to its right neighbour
    # 8 rows × 8 comparisons = 64 bits
    bits = []
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits.append(1 if left > right else 0)

    # Pack into integer, then to hex
    hash_int = 0
    for bit in bits:
        hash_int = (hash_int << 1) | bit

    return f"{hash_int:016x}"


def hamming(a, b):
    """
    Compute the Hamming distance between two hex hash strings.
    Returns the number of bits that differ.
    """
    int_a = int(a, 16)
    int_b = int(b, 16)
    xor = int_a ^ int_b
    return bin(xor).count("1")
