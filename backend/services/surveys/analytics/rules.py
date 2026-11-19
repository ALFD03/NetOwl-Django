"""Qué preguntas se hacen según lo ya contestado, y si las respuestas valen.

Funciones puras: reciben las preguntas como dicts y lo elegido como
`{id de pregunta: {ids de opción}}`, y los textos como `{id de pregunta: texto}`.
El cliente repite `visible` (`frontend/src/features/surveys/lib/rules.ts`):
**los dos tienen que decir lo mismo**, y el servidor es quien manda.

Cada pregunta es `{"id", "text", "kind", "required", "options": {ids permitidos},
"condition_question": id | None, "condition_mode": "mostrar" | "ocultar" | "",
"condition_options": {ids}}`.
"""

from __future__ import annotations

from typing import Any

from services.surveys.analytics.config import MAX_TEXT, MULTIPLE, SHOW_IF, SINGLE, TEXT

Question = dict[str, Any]
Chosen = dict[int, set[int]]


class InvalidAnswers(ValueError):
    """Lo enviado no es una encuesta contestada como toca (400)."""


def visible(questions: list[Question], chosen: Chosen) -> set[int]:
    """Los ids de las preguntas que se hacen con esas respuestas.

    Sin condición siempre se hace. Con condición mira la respuesta a la
    pregunta de la que depende **solo si esa se hace**. Sin respuesta,
    «mostrar si» no se cumple y «ocultar si» tampoco. Depender de una
    pregunta ausente (desactivada) o de un ciclo nunca cumple «mostrar si».

    >>> q = [
    ...     {"id": 1, "condition_question": None},
    ...     {"id": 2, "condition_question": 1, "condition_mode": "mostrar", "condition_options": {10}},
    ...     {"id": 3, "condition_question": 1, "condition_mode": "ocultar", "condition_options": {11}},
    ... ]
    >>> sorted(visible(q, {}))
    [1, 3]
    >>> sorted(visible(q, {1: {10}}))
    [1, 2, 3]
    >>> sorted(visible(q, {1: {11}}))
    [1]
    """
    by_id = {q["id"]: q for q in questions}
    memo: dict[int, bool] = {}

    def asked(qid: int, visiting: tuple[int, ...] = ()) -> bool:
        if qid in memo:
            return memo[qid]
        q = by_id[qid]
        parent = q.get("condition_question")
        mode = q.get("condition_mode") or ""
        if not parent or not mode:
            result = True
        else:
            reachable = parent in by_id and parent not in visiting and parent != qid
            given = chosen.get(parent, set()) if reachable and asked(parent, visiting + (qid,)) else set()
            matches = bool(given & set(q.get("condition_options") or ()))
            result = matches if mode == SHOW_IF else not matches
        memo[qid] = result
        return result

    return {q["id"] for q in questions if asked(q["id"])}


def validate(
    questions: list[Question], chosen: Chosen, texts: dict[int, str] | None = None
) -> tuple[Chosen, dict[int, str]]:
    """Las respuestas que valen, o `InvalidAnswers` con la razón.

    Devuelve `(opciones, textos)` de las preguntas que se hacen; lo contestado
    a una que no se hace se descarta sin error. Una obligatoria necesita al
    menos una opción, o un texto no vacío.

    >>> q = [{"id": 1, "kind": "unica", "required": True, "options": {10, 11}, "condition_question": None}]
    >>> validate(q, {1: {10}})
    ({1: {10}}, {})
    >>> validate(q, {})  # doctest: +IGNORE_EXCEPTION_DETAIL
    Traceback (most recent call last):
    ...
    InvalidAnswers: Falta responder: la pregunta 1.
    >>> t = [{"id": 2, "kind": "texto", "required": False, "options": set(), "condition_question": None}]
    >>> validate(t, {}, {2: "  todo bien  "})
    ({}, {2: 'todo bien'})
    >>> validate(t, {}, {2: "   "})
    ({}, {})
    """
    texts = texts or {}
    asked = visible(questions, chosen)
    clean: Chosen = {}
    clean_texts: dict[int, str] = {}
    missing: list[str] = []
    for q in questions:
        if q["id"] not in asked:
            continue
        if q["kind"] not in (SINGLE, MULTIPLE, TEXT):
            raise InvalidAnswers("Tipo de pregunta desconocido.")
        if q["kind"] == TEXT:
            given_text = " ".join(str(texts.get(q["id"]) or "").split())
            if len(given_text) > MAX_TEXT:
                raise InvalidAnswers(f"Una respuesta de texto admite hasta {MAX_TEXT} caracteres.")
            answered = bool(given_text)
            if answered:
                clean_texts[q["id"]] = given_text
        else:
            given = set(chosen.get(q["id"], set()))
            if not given <= set(q["options"]):
                raise InvalidAnswers("Una de las opciones elegidas no es de su pregunta o ya no está disponible.")
            if q["kind"] == SINGLE and len(given) > 1:
                raise InvalidAnswers("Esa pregunta admite una sola opción.")
            answered = bool(given)
            if answered:
                clean[q["id"]] = given
        if not answered and q.get("required", True):
            missing.append(str(q.get("text") or f"la pregunta {q['id']}"))
    if missing:
        raise InvalidAnswers("Falta responder: " + "; ".join(missing) + ".")
    return clean, clean_texts
