"""Lo que las vistas de Encuestas leen y escriben.

La lista de cada mes se **abre** (`open_period`) copiando la ficha de los
clientes que Suscripciones tiene en ese momento; volver a abrirla suma a los
que faltaban sin tocar lo ya atendido.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from services.surveys.analytics import loader, rules
from services.surveys.analytics.config import (
    CHURNED,
    COMPLETED,
    INSTALLED,
    NO_ANSWER,
    OFFERED_MONTHS,
    PENDING,
    REFUSED,
    TEXT,
)
from services.surveys.models import Answer, Question, Respondent, Survey

# Cuántos textos libres trae `results` por pregunta.
MAX_RESULT_TEXTS = 200

# Campos de la ficha que se copian de Suscripciones.
CARD_FIELDS = (
    "client", "ci", "seller", "channel", "branch", "zone", "service_type", "campaign", "phone1", "phone2",
)


class NoList(RuntimeError):
    """La fuente no pudo dar la lista del mes (el mensaje dice por qué)."""


class MonthNotClosed(ValueError):
    """Se pidió abrir una encuesta sobre un mes que todavía no cierra."""


def current_month(today: date | None = None) -> str:
    """El mes en curso (`YYYY-MM`), en hora local."""
    today = today or timezone.localdate()
    return f"{today.year:04d}-{today.month:02d}"


def offered_months(today: date | None = None) -> list[str]:
    """Los meses ya cerrados, del más reciente al más antiguo; el mes en curso no se ofrece."""
    today = today or timezone.localdate()
    year, month = today.year, today.month
    months = []
    for _ in range(OFFERED_MONTHS):
        month -= 1
        if month == 0:
            year, month = year - 1, 12
        months.append(f"{year:04d}-{month:02d}")
    return months


# --- Preguntas -------------------------------------------------------------------


def _question_out(q: Question, *, with_counts: bool) -> dict[str, Any]:
    return {
        "id": q.id,
        "text": q.text,
        "kind": q.kind,
        "required": q.required,
        "active": q.active,
        "position": q.position,
        "condition_question": q.condition_question_id,
        "condition_mode": q.condition_mode,
        "condition_options": sorted(o.id for o in q.condition_options.all()),
        "answers": q.answers.count() if with_counts else None,
        "options": [
            {
                "id": o.id,
                "text": o.text,
                "active": o.active,
                "position": o.position,
                "answers": o.answers.count() if with_counts else None,
            }
            for o in q.options.all()
        ],
    }


def questions_out(survey: Survey, *, include_inactive: bool) -> list[dict[str, Any]]:
    """Las preguntas en su orden, con opciones.

    Sin `include_inactive` es lo que se pregunta hoy (activas, con opciones
    activas): el formulario. Con él es la configuración, con lo desactivado y
    cuántas respuestas tiene cada cosa (decide si se borra o se desactiva).
    """
    qs = survey.questions.prefetch_related("options", "condition_options").order_by("position", "id")
    if not include_inactive:
        qs = qs.filter(active=True)
    out = []
    for q in qs:
        item = _question_out(q, with_counts=include_inactive)
        if not include_inactive:
            item["options"] = [o for o in item["options"] if o["active"]]
        out.append(item)
    return out


# --- Abrir el mes ------------------------------------------------------------------


def _fit(value: str, field: str) -> str:
    """El valor cortado al largo de su columna: una ficha rara no tumba la apertura."""
    return (value or "")[: Respondent._meta.get_field(field).max_length]


def open_period(survey: Survey, period: str) -> dict[str, int]:
    """Copia la lista de clientes del mes; devuelve cuántos se sumaron.

    Idempotente: suma a los que faltan, pone al día la ficha de los
    **pendientes** y no toca a quien ya se atendió. Nunca borra a nadie.
    """
    if period >= current_month():
        raise MonthNotClosed("La encuesta se hace sobre un mes ya terminado, cuando la data está completa.")

    res = {INSTALLED: loader.get_installed, CHURNED: loader.get_churned}[survey.slug](period)
    if res.get("status") == "error" or not res.get("rows"):
        raise NoList(res.get("message") or "No hay clientes para ese mes.")

    existing = {r.order: r for r in Respondent.objects.filter(survey=survey, period=period)}
    new: list[Respondent] = []
    changed: list[Respondent] = []
    for row in res["rows"]:
        order = _fit(row["order"], "order")
        card = {f: _fit(row.get(f, ""), f) for f in CARD_FIELDS}
        current = existing.get(order)
        if current is None:
            new.append(Respondent(survey=survey, period=period, order=order, **card))
        elif current.status == PENDING and any(getattr(current, f) != v for f, v in card.items()):
            for f, v in card.items():
                setattr(current, f, v)
            changed.append(current)

    with transaction.atomic():
        Respondent.objects.bulk_create(new, batch_size=1000, ignore_conflicts=True)
        if changed:
            Respondent.objects.bulk_update(changed, list(CARD_FIELDS), batch_size=1000)
    return {"new": len(new), "updated": len(changed), "total": len(existing) + len(new)}


# --- Leer ----------------------------------------------------------------------------


def _status_counts(counts: dict[str, int]) -> dict[str, int]:
    return {
        "total": sum(counts.values()),
        "completed": counts.get(COMPLETED, 0),
        "no_answer": counts.get(NO_ANSWER, 0),
        "refused": counts.get(REFUSED, 0),
        "pending": counts.get(PENDING, 0),
    }


def progress_by_month(survey: Survey, months: list[str]) -> list[dict[str, Any]]:
    """Por mes, cuántos encuestados hay y cómo van. Sin lista: `open` falso."""
    by_month: dict[str, dict[str, int]] = {}
    for row in Respondent.objects.filter(survey=survey).values("period", "status").annotate(n=Count("id")):
        by_month.setdefault(row["period"], {})[row["status"]] = row["n"]
    # Los meses con datos entran aunque ya no se ofrezcan: tienen historia.
    return [
        {"period": m, "open": m in by_month, **_status_counts(by_month.get(m, {}))}
        for m in sorted(set(months) | set(by_month), reverse=True)
    ]


def respondents_out(survey: Survey, period: str) -> list[dict[str, Any]]:
    """La lista del mes, una fila por cliente, sin las respuestas."""
    qs = Respondent.objects.filter(survey=survey, period=period).select_related("handled_by")
    return [
        {
            "id": r.id,
            "order": r.order,
            **{f: getattr(r, f) for f in CARD_FIELDS},
            "status": r.status,
            "handled_by": r.handled_by.get_username() if r.handled_by else None,
            "handled_at": timezone.localtime(r.handled_at).isoformat() if r.handled_at else None,
        }
        for r in qs
    ]


def answers_of(respondent: Respondent) -> dict[str, dict]:
    """`{"options": {pregunta: [opciones]}, "texts": {pregunta: texto}}`."""
    options: dict[int, list[int]] = {}
    texts: dict[int, str] = {}
    for question_id, option_id, text in respondent.answers.values_list("question_id", "option_id", "text"):
        if option_id is None:
            texts[question_id] = text
        else:
            options.setdefault(question_id, []).append(option_id)
    return {"options": options, "texts": texts}


# --- Contestar -------------------------------------------------------------------------


def _rules_for(survey: Survey, already_chosen: set[int]) -> list[rules.Question]:
    """Las preguntas activas como las espera `rules`.

    Una opción desactivada después de contestada se sigue admitiendo si ya era
    la respuesta del cliente.
    """
    out = []
    qs = survey.questions.filter(active=True).prefetch_related("options", "condition_options").order_by("position", "id")
    for q in qs:
        out.append({
            "id": q.id,
            "text": q.text,
            "kind": q.kind,
            "required": q.required,
            "options": {o.id for o in q.options.all() if o.active or o.id in already_chosen},
            "condition_question": q.condition_question_id,
            "condition_mode": q.condition_mode,
            "condition_options": {o.id for o in q.condition_options.all()},
        })
    return out


def save_answers(respondent_id: int, chosen: rules.Chosen, texts: dict[int, str], user: User) -> Respondent:
    """Registra lo que contestó un cliente y lo da por completado.

    Reemplaza sus respuestas a las preguntas de hoy; las de preguntas ya
    desactivadas se conservan. Levanta `rules.InvalidAnswers` si no vale.
    """
    with transaction.atomic():
        r = Respondent.objects.select_for_update().select_related("survey").get(pk=respondent_id)
        previous = set(r.answers.filter(option__isnull=False).values_list("option_id", flat=True))
        questions = _rules_for(r.survey, previous)
        clean, clean_texts = rules.validate(questions, chosen, texts)

        r.answers.filter(question_id__in=[q["id"] for q in questions]).delete()
        Answer.objects.bulk_create(
            [Answer(respondent=r, question_id=qid, option_id=oid) for qid, opts in clean.items() for oid in sorted(opts)]
            + [Answer(respondent=r, question_id=qid, text=text) for qid, text in clean_texts.items()]
        )
        r.status = COMPLETED
        r.handled_by = user
        r.handled_at = timezone.now()
        r.save(update_fields=["status", "handled_by", "handled_at"])
    return r


def change_status(respondent_id: int, status: str, user: User) -> Respondent:
    """Pone a un cliente en pendiente, «no contesta» o «rechazó».

    Volver a pendiente desde completada borra sus respuestas: la encuesta se
    rehace. Los otros dos estados solo valen para quien aún no contestó.
    """
    with transaction.atomic():
        r = Respondent.objects.select_for_update().get(pk=respondent_id)
        if r.status == COMPLETED and status != PENDING:
            raise ValueError("Ya contestó: para cambiarlo primero hay que reabrir su encuesta.")
        if status == PENDING:
            r.answers.all().delete()
            r.handled_by, r.handled_at = None, None
        else:
            r.handled_by, r.handled_at = user, timezone.now()
        r.status = status
        r.save(update_fields=["status", "handled_by", "handled_at"])
    return r


# --- Resultados ------------------------------------------------------------------------


def results(survey: Survey, period: str) -> dict[str, Any]:
    """Cómo contestaron los encuestados del mes, pregunta por pregunta.

    El % de cada opción es sobre quienes eligieron alguna opción de esa
    pregunta (una condicionada solo la ven algunos). Los textos van aparte.
    Lo contestado se muestra como se contestó, aunque la pregunta haya cambiado
    de tipo; lo desactivado aparece solo si tiene respuestas en el mes.
    """
    base = Respondent.objects.filter(survey=survey, period=period)
    counts = {row["status"]: row["n"] for row in base.values("status").annotate(n=Count("id"))}

    answers = Answer.objects.filter(respondent__in=base)
    with_option = answers.filter(option__isnull=False)
    per_option = {
        (row["question_id"], row["option_id"]): row["n"]
        for row in with_option.values("question_id", "option_id").annotate(n=Count("id"))
    }
    chose_any = {
        row["question_id"]: row["n"]
        for row in with_option.values("question_id").annotate(n=Count("respondent_id", distinct=True))
    }
    answered = {
        row["question_id"]: row["n"]
        for row in answers.values("question_id").annotate(n=Count("respondent_id", distinct=True))
    }
    texts: dict[int, list[str]] = {}
    for question_id, text in answers.filter(option__isnull=True).order_by("id").values_list("question_id", "text"):
        texts.setdefault(question_id, []).append(text)

    questions = []
    for q in survey.questions.prefetch_related("options").order_by("position", "id"):
        base_pct = chose_any.get(q.id, 0)
        written = texts.get(q.id, [])
        if not q.active and not base_pct and not written:
            continue
        options = []
        for o in q.options.all():
            n = per_option.get((q.id, o.id), 0)
            if not o.active and not n:
                continue
            options.append({"id": o.id, "text": o.text, "n": n, "pct": round(100 * n / base_pct, 1) if base_pct else None})
        questions.append({
            "id": q.id,
            "text": q.text,
            "kind": q.kind,
            "active": q.active,
            "answered": answered.get(q.id, 0),
            "options": options if (q.kind != TEXT or base_pct) else [],
            "texts": written[:MAX_RESULT_TEXTS],
            "texts_total": len(written),
        })
    return {**_status_counts(counts), "questions": questions}


def delete_period(survey: Survey, period: str) -> dict[str, int]:
    """Quita de la encuesta a los clientes de un mes, con lo que contestaron. No se deshace."""
    with transaction.atomic():
        base = Respondent.objects.select_for_update().filter(survey=survey, period=period)
        total = base.count()
        completed = base.filter(status=COMPLETED).count()
        base.delete()
    return {"total": total, "completed": completed}
