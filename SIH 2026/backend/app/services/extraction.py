"""Document text extraction: PyMuPDF text layers + RapidOCR fallback with line boxes."""
import io
import logging
from typing import Any

import fitz
from PIL import Image

from app.config import get_settings

logger = logging.getLogger("resilient.extraction")


def _ocr_module():
    try:
        from rapidocr_onnxruntime import RapidOCR  # type: ignore

        return RapidOCR()
    except Exception as exc:  # noqa: BLE001
        logger.warning("RapidOCR unavailable: %s", exc)
        return None


class OcrEngine:
    _instance: Any = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = _ocr_module()
        return cls._instance


def count_document_pages(data: bytes, file_ext: str) -> int:
    """Actual page count of the stored file: 1 for a valid image, PDF page count otherwise."""
    try:
        doc = fitz.open(stream=data, filetype=file_ext if file_ext in ("pdf", "png", "jpeg") else "pdf")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not open file as a document: {exc}") from exc
    try:
        return int(doc.page_count)
    finally:
        doc.close()


def parse_ocr_result(raw, width: float, height: float) -> list[dict[str, Any]]:
    """Normalise RapidOCR 1.4 output: each entry is ``[quad, text, score]``.

    The installed engine returns a flat triple. Anything else is a real incompatibility
    and must surface as an explicit extraction failure instead of being swallowed.
    """
    lines: list[dict[str, Any]] = []
    for index, item in enumerate(raw or []):
        if not isinstance(item, (list, tuple)) or len(item) != 3:
            raise ValueError(
                f"Unexpected OCR output entry at index {index}: expected (box, text, score) "
                f"but received {type(item).__name__} with {len(item) if hasattr(item, '__len__') else 'no'} parts"
            )
        quad, text_value, score = item
        text = str(text_value).strip()
        if not text:
            continue
        try:
            conf = float(score)
        except (TypeError, ValueError):
            conf = 0.5
        lines.append(
            {
                "text": text[:400],
                "bbox": _normalize_radio(quad, width, height),
                "conf": round(conf, 4),
                "source": "ocr",
            }
        )
    return lines


def _normalize_radio(quad, width: float, height: float) -> list[float]:
    xs = [p[0] for p in quad]
    ys = [p[1] for p in quad]
    x0, x1 = min(xs) / width, max(xs) / width
    y0, y1 = min(ys) / height, max(ys) / height
    clamp = lambda v: max(0.0, min(1.0, float(v)))  # noqa: E731
    return [round(clamp(x0), 4), round(clamp(y0), 4), round(clamp(x1), 4), round(clamp(y1), 4)]


def extract_document(data: bytes, file_ext: str) -> dict[str, Any]:
    """Returns {page_count, text_layer_chars, ocr_used, mean_ocr_confidence, pages, pdf_metadata, quality}."""
    settings = get_settings()
    result: dict[str, Any] = {
        "page_count": 0,
        "text_layer_chars": 0,
        "ocr_used": False,
        "mean_ocr_confidence": None,
        "pages": [],
        "pdf_metadata": {},
        "quality": {},
    }

    try:
        doc = fitz.open(stream=data, filetype=file_ext if file_ext in ("pdf", "png", "jpeg") else "pdf")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not open file as a document: {exc}") from exc

    result["page_count"] = doc.page_count
    if doc.page_count == 0:
        raise ValueError("Document has no pages")

    meta = doc.metadata or {}
    result["pdf_metadata"] = {
        "producer": meta.get("producer"),
        "creator": meta.get("creator"),
        "creation_date": meta.get("creationDate"),
        "mod_date": meta.get("modDate"),
        "format": meta.get("format"),
        "title": meta.get("title"),
        "author": meta.get("author"),
    }
    result["pdf_metadata"]["is_encrypted"] = doc.is_encrypted

    text_layer_chars = 0
    ocr_pages = []
    confidences: list[float] = []

    for page_index in range(doc.page_count):
        page = doc.load_page(page_index)
        page_no = page_index + 1
        width, height = float(page.rect.width), float(page.rect.height)
        page_text = page.get_text("text") or ""
        page_text_stripped = page_text.strip()
        lines: list[dict[str, Any]] = []
        quality: dict[str, Any] = {"method_notes": ""}

        if len(page_text_stripped) >= settings.OCR_TEXT_MIN_CHARS:
            for rect in page.get_text("blocks"):
                x0, y0, x1, y1 = rect[:4]
                block_text = str(rect[4]).strip()
                if not block_text:
                    continue
                lines.append(
                    {
                        "text": block_text[:400],
                        "bbox": [
                            max(0.0, x0 / width),
                            max(0.0, y0 / height),
                            min(1.0, x1 / width),
                            min(1.0, y1 / height),
                        ],
                        "conf": 0.99,
                        "source": "text_layer",
                    }
                )
            text_layer_chars += len(page_text_stripped)
            text_source = "text_layer"
            page_conf = 0.99
        else:
            text_source = "ocr"
            result["ocr_used"] = True
            pix = page.get_pixmap(dpi=settings.OCR_DPI, colorspace=fitz.csRGB)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            pw, ph = img.size
            ocr = OcrEngine.get()
            page_conf = None
            if ocr is not None:
                np_image = __import__("numpy").array(img)
                raw, _elapsed = ocr(np_image)
                lines = parse_ocr_result(raw, pw, ph)
                page_confidences = [line["conf"] for line in lines]
                confidences.extend(page_confidences)
                page_text_stripped = "\n".join(line["text"] for line in lines)
                page_conf = round(sum(page_confidences) / len(page_confidences), 4) if page_confidences else 0.0
            else:
                quality["method_notes"] = "OCR engine unavailable; page treated as unreadable"
                page_text_stripped = ""
            if page_conf is None:
                page_conf = 0.0

            # low-information check: very few detected lines on a large page
            if ph and len(lines) < 3:
                quality["suspiciously_sparse"] = True

        if text_source == "ocr" and not lines:
            text_source = "none"

        result["pages"].append(
            {
                "page_no": page_no,
                "width": width,
                "height": height,
                "text_source": text_source,
                "text": page_text_stripped[:8000],
                "lines": lines[:600],
                "ocr_confidence": page_conf,
                "quality": quality,
            }
        )

    ocr_pages = [p for p in result["pages"] if p["text_source"] == "ocr"]
    result["text_layer_chars"] = text_layer_chars
    result["mean_ocr_confidence"] = (
        round(sum(confidences) / len(confidences), 4) if confidences else None
    )
    result["quality"] = {
        "ocr_pages": len(ocr_pages),
        "total_pages": result["page_count"],
        "mean_ocr_confidence": result["mean_ocr_confidence"],
        **{k: v for p in ocr_pages for k, v in p["quality"].items()},
    }
    doc.close()
    return result
