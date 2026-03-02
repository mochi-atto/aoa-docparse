# backend/tests/test_ocr.py
import fitz  # pymupdf
import pytesseract
from PIL import Image
import io

# Uncomment if Tesseract isn't on your PATH:
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

doc = fitz.open("sample_docs/sample_utility.pdf")
page = doc[0]
pix = page.get_pixmap(dpi=300)
img = Image.open(io.BytesIO(pix.tobytes("png")))
text = pytesseract.image_to_string(img)
print(text[:500])