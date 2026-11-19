"""`/api/surveys/`: las encuestas de instalados y de bajas, y sus preguntas.

Ver es `can_view_surveys`; abrir el mes y registrar respuestas,
`can_answer_surveys`; editar preguntas y opciones, `can_manage_surveys`;
borrar un mes con lo contestado (no se deshace), `can_delete_surveys`.
"""

from __future__ import annotations

import re
from functools import wraps
from typing import Annotated, Any, Literal

from django.db import transaction
from django.db.models import Max
from pydantic import AfterValidator, BaseModel, Field

from services.config.api import ApiError, endpoint
from services.config.auth import has_permission
from services.surveys.analytics import queries, rules
from services.surveys.analytics.config import (
    CHURNED,
    CONDITION_MODES,
    INSTALLED,
    MAX_TEXT,
    OPTION_KINDS,
    QUESTION_KINDS,
    TEXT,
)
from services.surveys.models import Option, Question, Respondent, Survey

VIEW = ["can_view_surveys"]
ANSWER = ["can_answer_surveys"]
MANAGE = ["can_manage_surveys"]
DELETE = ["can_delete_surveys"]

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


# --- Cuerpos y parámetros ----------------------------------------------------------------


def _month(value: str) -> str:
    if not _MONTH.match(value):
        raise ValueError("El mes tiene que ser YYYY-MM.")
    return value


def _squeeze(value: str) -> str:
    """Sin espacios de más; vacío no vale."""
    value = " ".join(value.split())
    if not value:
        raise ValueError("Es obligatorio.")
    return value


Month = Annotated[str, AfterValidator(_month)]
SurveySlug = Literal["instalados", "bajas"]
Direction = Literal["up", "down"]


class PeriodQuery(BaseModel):
    period: str | None = None


class MonthQuery(BaseModel):
    survey: SurveySlug
    period: Month


class IdQuery(BaseModel):
    id: int


class IdBody(BaseModel):
    id: int


class MonthBody(BaseModel):
    survey: SurveySlug
    period: Month


class DeleteMonthBody(MonthBody):
    confirmation: str = ""


class AnswersBody(BaseModel):
    id: int
    options: dict[int, list[int]]
    texts: dict[int, str] = {}


class StatusBody(BaseModel):
    id: int
    status: Literal["pendiente", "no_contesta", "rechazo"]


class MoveBody(BaseModel):
    id: int
    direction: Direction


class QuestionBody(BaseModel):
    id: int | None = None
    survey: SurveySlug | None = None
    text: Annotated[str, AfterValidator(_squeeze), Field(max_length=200)]
    kind: Literal["unica", "multiple", "texto"]
    required: bool = True
    active: bool = True
    condition_question: int | None = None
    condition_mode: Literal["mostrar", "ocultar", ""] = ""
    condition_options: list[int] = []


class OptionBody(BaseModel):
    id: int | None = None
    question: int | None = None
    text: Annotated[str, AfterValidator(_squeeze), Field(max_length=120)]
    active: bool = True


# --- Apoyo ------------------------------------------------------------------------------


def _conflicts(view):
    """Las reglas del módulo que no se cumplen responden 400 o 409."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except rules.InvalidAnswers as exc:
            raise ApiError(str(exc)) from exc
        except (queries.MonthNotClosed, queries.NoList) as exc:
            raise ApiError(str(exc), 409) from exc
    return wrapped


def _ok(message: str, **extra: Any) -> dict[str, Any]:
    return {"status": "success", "message": message, **extra}


def _survey(slug: str | None) -> Survey:
    survey = Survey.objects.filter(slug=slug or "").first()
    if survey is None:
        raise ApiError("Esa encuesta no existe.")
    return survey


# --- Páginas ---------------------------------------------------------------------------


def _survey_page(request, slug: str, requested: str | None) -> dict[str, Any]:
    survey = _survey(slug)
    offered = queries.offered_months()
    return {
        "slug": slug,
        "name": survey.name,
        "period": requested if requested and _MONTH.match(requested) else offered[0],
        "periods": queries.progress_by_month(survey, offered),
        "questions": queries.questions_out(survey, include_inactive=False),
        "max_text": MAX_TEXT,
        "can_answer": has_permission(request.user, ANSWER[0]),
        "can_manage": has_permission(request.user, MANAGE[0]),
        "can_delete": has_permission(request.user, DELETE[0]),
    }


@endpoint(perms=VIEW, query=PeriodQuery)
def installed(request, query: PeriodQuery):
    """La encuesta de satisfacción de los instalados del mes (`?period=YYYY-MM`)."""
    return _survey_page(request, INSTALLED, query.period)


@endpoint(perms=VIEW, query=PeriodQuery)
def churned(request, query: PeriodQuery):
    """La encuesta de las bajas del mes (`?period=YYYY-MM`)."""
    return _survey_page(request, CHURNED, query.period)


@endpoint(perms=MANAGE)
def survey_settings(request):
    """Las preguntas y opciones de las dos encuestas, con lo desactivado."""
    return {
        "surveys": [
            {"slug": s.slug, "name": s.name, "questions": queries.questions_out(s, include_inactive=True)}
            for s in Survey.objects.order_by("id")
        ],
        "kinds": [{"value": v, "label": t} for v, t in QUESTION_KINDS],
        "modes": [{"value": v, "label": t} for v, t in CONDITION_MODES],
        "max_text": MAX_TEXT,
    }


# --- Lectura -----------------------------------------------------------------------------


@endpoint(perms=VIEW, query=MonthQuery, nullable=True)
def respondents(request, query: MonthQuery):
    """La lista de un mes con el estado de cada cliente y los resultados.

    Lleva teléfonos y cédulas en bloque: es una de las lecturas que se auditan.
    """
    survey = _survey(query.survey)
    return {
        "respondents": queries.respondents_out(survey, query.period),
        "results": queries.results(survey, query.period),
    }


@endpoint(perms=VIEW, query=IdQuery)
def answers(request, query: IdQuery):
    """Lo que contestó un encuestado (`?id=`), para abrir su formulario."""
    return queries.answers_of(Respondent.objects.get(pk=query.id))


# --- Atender --------------------------------------------------------------------------------


@endpoint(methods=["POST"], perms=ANSWER, rate="10/m", body=MonthBody)
@_conflicts
def period_open(request, body: MonthBody):
    """Abre la encuesta de un mes copiando la lista de Suscripciones.

    Repetirlo suma a los que faltaban y actualiza a los pendientes.
    """
    r = queries.open_period(_survey(body.survey), body.period)
    return _ok(
        f"{r['total']} clientes en la lista de {body.period}: {r['new']} nuevos, {r['updated']} actualizados.", **r
    )


@endpoint(methods=["POST"], perms=DELETE, rate="10/m", body=DeleteMonthBody)
def period_delete(request, body: DeleteMonthBody):
    """Borra un mes con lo contestado en él; `confirmation` es el mes escrito a mano."""
    if body.confirmation.strip() != body.period:
        raise ApiError("Escribe el mes tal cual para confirmar.")
    r = queries.delete_period(_survey(body.survey), body.period)
    if r["total"] == 0:
        raise ApiError(f"{body.period} no tiene lista en esta encuesta.", 409)
    return _ok(f"Se borró {body.period}: {r['total']} clientes, {r['completed']} con respuestas.", **r)


@endpoint(methods=["POST"], perms=ANSWER, rate="120/m", body=AnswersBody)
@_conflicts
def answers_save(request, body: AnswersBody):
    """Registra lo que contestó un cliente y lo da por completado."""
    chosen = {question: set(options) for question, options in body.options.items()}
    r = queries.save_answers(body.id, chosen, body.texts, request.user)
    return _ok("Respuestas guardadas.", respondent_status=r.status)


@endpoint(methods=["POST"], perms=ANSWER, rate="120/m", body=StatusBody)
def status_save(request, body: StatusBody):
    """Pone a un cliente en pendiente, «no contesta» o «rechazó».

    Volver a pendiente a quien ya contestó borra sus respuestas.
    """
    try:
        r = queries.change_status(body.id, body.status, request.user)
    except ValueError as exc:
        raise ApiError(str(exc), 409) from None
    return _ok("Estado actualizado.", respondent_status=r.status)


# --- Configuración ---------------------------------------------------------------------------


def _cycle(question_id: int | None, parent: Question) -> bool:
    """Si hacer que `question_id` dependa de `parent` cierra un ciclo."""
    seen: set[int] = set()
    current: Question | None = parent
    while current is not None and current.id not in seen:
        if current.id == question_id:
            return True
        seen.add(current.id)
        current = current.condition_question
    return False


def _condition(question: Question, body: QuestionBody) -> tuple[Question | None, str, list[Option]]:
    """De qué pregunta depende, en qué modo y con qué opciones; o el error que lo impide."""
    if not body.condition_question:
        return None, "", []
    parent = Question.objects.get(pk=body.condition_question, survey=question.survey)
    if not body.condition_mode:
        raise ApiError("Falta decir si la pregunta se muestra o se oculta.")
    ids = set(body.condition_options)
    if not ids:
        raise ApiError("Elige con qué respuestas se cumple la condición.")
    options = list(Option.objects.filter(question=parent, id__in=ids))
    if len(options) != len(ids):
        raise ApiError("Una de las opciones de la condición no es de esa pregunta.")
    if parent.kind not in OPTION_KINDS:
        raise ApiError("Solo se puede depender de una pregunta de opciones, no de una de texto libre.")
    if _cycle(question.pk, parent):
        raise ApiError("La condición no puede depender de la propia pregunta ni de una que dependa de ella.")
    return parent, body.condition_mode, options


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=QuestionBody)
def question_save(request, body: QuestionBody):
    """Crea o edita una pregunta.

    El tipo se puede cambiar con respuestas (las dadas se conservan), pero no
    a texto si otra pregunta depende de su respuesta.
    """
    with transaction.atomic():
        if body.id:
            question = Question.objects.select_for_update().get(pk=body.id)
            if body.kind == TEXT and question.dependents.exists():
                raise ApiError(
                    "Otras preguntas dependen de su respuesta: quítales la condición antes de volverla de texto.", 409
                )
        else:
            survey = _survey(body.survey)
            position = (survey.questions.aggregate(m=Max("position"))["m"] or 0) + 1
            question = Question(survey=survey, position=position)

        if Question.objects.filter(survey=question.survey, text__iexact=body.text).exclude(pk=question.pk).exists():
            raise ApiError("Ya hay una pregunta con ese texto en esta encuesta.", 409)

        parent, mode, options = _condition(question, body)
        question.text = body.text
        question.kind = body.kind
        question.required = body.required
        question.active = body.active
        question.condition_question = parent
        question.condition_mode = mode
        question.save()
        question.condition_options.set(options)
    return _ok("Pregunta guardada.", id=question.id)


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=IdBody)
def question_delete(request, body: IdBody):
    """Borra una pregunta que nadie ha contestado ni otra usa como condición."""
    question = Question.objects.get(pk=body.id)
    if question.answers.exists():
        raise ApiError("Ya tiene respuestas: no se borra, desactívala para dejar de preguntarla.", 409)
    if question.dependents.exists():
        raise ApiError("Otras preguntas dependen de esta: quítales la condición primero.", 409)
    question.delete()
    return _ok("Pregunta eliminada.")


def _move(queryset, pk: int, direction: str) -> None:
    """Cambia de lugar un elemento con su vecino. `queryset` ya viene ordenado y acotado."""
    with transaction.atomic():
        items = list(queryset.select_for_update())
        ids = [x.pk for x in items]
        i = ids.index(pk)
        j = i - 1 if direction == "up" else i + 1
        if not 0 <= j < len(items):
            return
        items[i], items[j] = items[j], items[i]
        # Se renumera todo: las posiciones pueden venir repetidas.
        for position, x in enumerate(items, start=1):
            if x.position != position:
                x.position = position
                x.save(update_fields=["position"])


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=MoveBody)
def question_move(request, body: MoveBody):
    """Sube o baja una pregunta en su encuesta."""
    question = Question.objects.get(pk=body.id)
    _move(Question.objects.filter(survey=question.survey).order_by("position", "id"), question.pk, body.direction)
    return _ok("Orden actualizado.")


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=OptionBody)
def option_save(request, body: OptionBody):
    """Crea o edita una opción.

    Renombrar cambia el texto también en los meses ya contestados: sirve para
    una errata, no para cambiar de significado.
    """
    with transaction.atomic():
        if body.id:
            option = Option.objects.select_for_update().get(pk=body.id)
        else:
            if not body.question:
                raise ApiError("Falta la pregunta.")
            question = Question.objects.get(pk=body.question)
            position = (question.options.aggregate(m=Max("position"))["m"] or 0) + 1
            option = Option(question=question, position=position)
        if Option.objects.filter(question=option.question, text__iexact=body.text).exclude(pk=option.pk).exists():
            raise ApiError("Ya hay una opción con ese texto en esta pregunta.", 409)
        option.text = body.text
        option.active = body.active
        option.save()
    return _ok("Opción guardada.", id=option.id)


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=IdBody)
def option_delete(request, body: IdBody):
    """Borra una opción que nadie ha elegido ni una condición usa."""
    option = Option.objects.get(pk=body.id)
    if option.answers.exists():
        raise ApiError("Ya se eligió en alguna encuesta: no se borra, desactívala para dejar de ofrecerla.", 409)
    if option.conditions.exists():
        raise ApiError("Una condición de otra pregunta la usa: cámbiala primero.", 409)
    option.delete()
    return _ok("Opción eliminada.")


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", body=MoveBody)
def option_move(request, body: MoveBody):
    """Sube o baja una opción en su pregunta."""
    option = Option.objects.get(pk=body.id)
    _move(Option.objects.filter(question=option.question).order_by("position", "id"), option.pk, body.direction)
    return _ok("Orden actualizado.")
