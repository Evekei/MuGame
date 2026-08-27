from math import log2
from typing import Any


def ratio(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 6)


def normalize_distribution(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        return {}
    return {
        key: ratio(weight, total)
        for key, weight in sorted(weights.items())
        if weight > 0
    }


def weighted_jaccard(left: dict[str, float], right: dict[str, float]) -> float:
    keys = set(left) | set(right)
    if not keys:
        return 0.0
    intersection = sum(min(left.get(key, 0), right.get(key, 0)) for key in keys)
    union = sum(max(left.get(key, 0), right.get(key, 0)) for key in keys)
    return ratio(intersection, union)


def diversity_from_counts(counts: dict[str, float]) -> dict[str, Any]:
    total = sum(counts.values())
    if total <= 0:
        return {"unique_count": 0, "top_share": 0.0, "shannon_entropy": 0.0}
    probabilities = [count / total for count in counts.values() if count > 0]
    return {
        "unique_count": len(probabilities),
        "top_share": ratio(max(counts.values()), total),
        "shannon_entropy": round(
            -sum(probability * log2(probability) for probability in probabilities),
            6,
        ),
    }
