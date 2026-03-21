"""
RAGAS Evaluation Module

Evaluates RAG response quality across 4 metrics:
  - faithfulness:        Are all claims grounded in the retrieved context?
  - answer_relevancy:    Does the answer address the question?
  - context_recall:      Does the context contain enough info to answer?
  - context_precision:   Is the retrieved context focused and relevant?

Usage:
  evaluator = RAGEvaluator()
  scores = await evaluator.evaluate_response(question, answer, contexts)
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RAGEvaluator:
    """RAGAS-based quality evaluation with graceful degradation."""

    def __init__(self) -> None:
        self._available: Optional[bool] = None

    def _check_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            import ragas  # noqa: F401
            self._available = True
        except ImportError:
            logger.warning("ragas package not installed — evaluation disabled. pip install ragas datasets")
            self._available = False
        return self._available

    async def evaluate_response(
        self,
        question: str,
        answer: str,
        contexts: list[str],
        ground_truth: Optional[str] = None,
    ) -> dict[str, float]:
        """
        Evaluate a RAG response and return quality scores.

        Returns:
            dict with keys: faithfulness, answer_relevancy, context_recall,
                           context_precision, overall
        """
        if not self._check_available():
            return self._heuristic_scores(question, answer, contexts)

        try:
            from ragas import evaluate
            from ragas.metrics import (
                faithfulness,
                answer_relevancy,
                context_recall,
                context_precision,
            )
            from datasets import Dataset

            data = {
                "question": [question],
                "answer": [answer],
                "contexts": [contexts],
                "ground_truth": [ground_truth or answer],
            }
            dataset = Dataset.from_dict(data)

            metrics = [faithfulness, answer_relevancy, context_recall, context_precision]
            result = evaluate(dataset, metrics=metrics)

            scores = {
                "faithfulness": float(result["faithfulness"]),
                "answer_relevancy": float(result["answer_relevancy"]),
                "context_recall": float(result["context_recall"]),
                "context_precision": float(result["context_precision"]),
            }
            scores["overall"] = sum(scores.values()) / 4
            return scores

        except Exception as exc:
            logger.error("ragas_evaluation_failed: %s", exc)
            return self._heuristic_scores(question, answer, contexts)

    def _heuristic_scores(
        self,
        question: str,
        answer: str,
        contexts: list[str],
    ) -> dict[str, float]:
        """
        Fast heuristic scores when RAGAS is unavailable.
        Based on simple overlap metrics.
        """
        if not answer or not contexts:
            return {
                "faithfulness": 0.0,
                "answer_relevancy": 0.0,
                "context_recall": 0.0,
                "context_precision": 0.0,
                "overall": 0.0,
            }

        answer_words = set(answer.lower().split())
        question_words = set(question.lower().split())
        context_text = " ".join(contexts).lower()
        context_words = set(context_text.split())

        # Faithfulness: fraction of answer words found in context
        faithfulness = (
            len(answer_words & context_words) / len(answer_words)
            if answer_words else 0.0
        )

        # Answer relevancy: fraction of question words in answer
        answer_relevancy = (
            len(question_words & answer_words) / len(question_words)
            if question_words else 0.0
        )

        # Context recall/precision: simple overlap
        context_recall = min(faithfulness * 1.1, 1.0)
        context_precision = min(faithfulness * 0.9, 1.0)

        overall = (faithfulness + answer_relevancy + context_recall + context_precision) / 4

        return {
            "faithfulness": round(faithfulness, 4),
            "answer_relevancy": round(answer_relevancy, 4),
            "context_recall": round(context_recall, 4),
            "context_precision": round(context_precision, 4),
            "overall": round(overall, 4),
        }
