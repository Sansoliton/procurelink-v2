"""
Requirement text parser — pure regex, no AI.
Extracts line items from free-form text like:
  "50x stainless steel flanges DN50 PN16"
  "qty: 200 hex bolts M12x60 grade 8.8"
  "10 metres of 2 inch pipe, schedule 40"
"""
import re
from typing import List
from app.schemas import LineItemCreate

# Quantity patterns: "50x", "50 x", "qty: 50", "qty 50", "50 ea", bare number at start
QTY_PATTERNS = [
    r"^(\d+(?:\.\d+)?)\s*[xX×]\s+",             # 50x, 50 x, 50×
    r"(?i)^qty[:\s]+(\d+(?:\.\d+)?)\s+",         # qty: 50, qty 50
    r"^(\d+(?:\.\d+)?)\s+(?=\w)",                 # bare number at start
]

UNIT_MAP = {
    r"\b(ea|each|pcs?|pieces?|units?|nos?)\b": "ea",
    r"\b(m|metres?|meters?)\b": "m",
    r"\b(mm)\b": "mm",
    r"\b(kg|kilograms?)\b": "kg",
    r"\b(l|litres?|liters?)\b": "l",
    r"\b(sets?)\b": "set",
    r"\b(pairs?)\b": "pair",
    r"\b(rolls?)\b": "roll",
    r"\b(lengths?)\b": "length",
}

CATEGORY_KEYWORDS = {
    "flanges": ["flange", "flanges"],
    "fasteners": ["bolt", "nut", "screw", "washer", "fastener", "rivet"],
    "pipe": ["pipe", "tube", "tubing", "conduit"],
    "fittings": ["elbow", "tee", "coupling", "reducer", "fitting", "connector"],
    "valves": ["valve", "gate", "ball valve", "check valve"],
    "gaskets": ["gasket", "seal", "o-ring", "packing"],
    "structural": ["beam", "channel", "angle", "plate", "bar", "rod"],
    "electrical": ["cable", "wire", "conduit", "terminal", "switch", "breaker"],
    "general": [],
}


def _extract_qty(text: str):
    for pattern in QTY_PATTERNS:
        m = re.match(pattern, text, re.IGNORECASE)
        if m:
            qty = float(m.group(1))
            remainder = text[m.end():].strip()
            return qty, remainder
    return None, text


def _extract_unit(text: str):
    for pattern, unit in UNIT_MAP.items():
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            cleaned = text[:m.start()].strip() + " " + text[m.end():].strip()
            return unit, cleaned.strip()
    return None, text


def _detect_category(description: str) -> str:
    desc_lower = description.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_lower:
                return category
    return "general"


def _clean_numbering(line: str) -> str:
    """Remove leading list numbers like '1.' '1)' '- ' '* '"""
    return re.sub(r"^[\d]+[.)]\s*|^[-*•]\s*", "", line).strip()


def parse_text_to_items(raw_text: str) -> List[LineItemCreate]:
    """
    Parse free-form requirement text into structured line items.
    Splits on newlines and common delimiters.
    """
    if not raw_text or not raw_text.strip():
        return []

    # Split into candidate lines
    lines = re.split(r"\n+|;\s*", raw_text)
    items = []

    for i, line in enumerate(lines):
        line = _clean_numbering(line.strip())
        if len(line) < 3:
            continue

        qty, remainder = _extract_qty(line)
        unit, description = _extract_unit(remainder)

        # Clean up description
        description = re.sub(r"\s+", " ", description).strip()
        description = description.rstrip(".,;")

        if not description:
            continue

        category = _detect_category(description)

        items.append(LineItemCreate(
            description=description,
            quantity=qty,
            unit=unit,
            category=category,
            sort_order=i,
        ))

    return items
