"""Encuestas: las preguntas, sus opciones, a quién se le hacen y qué contestó.

Hay dos encuestas fijas (`analytics/config.SURVEYS`), la de instalados y la de
bajas, que se hacen sobre el mes ya cerrado con la lista de Suscripciones. Las
preguntas y opciones se editan desde la web.

Cada encuestado es una **copia** de la ficha del cliente al abrir el mes: las
tablas de suscripciones se truncan en cada importación, así que releerlas
cambiaría la lista de un mes que ya se está llamando.
"""

from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models
from django.db.models.functions import Lower

from services.surveys.analytics.config import (
    CONDITION_MODES,
    PENDING,
    QUESTION_KINDS,
    SINGLE,
    STATUSES,
)


class Survey(models.Model):
    """Una de las dos encuestas; la migración `0002` las siembra con sus preguntas."""

    slug = models.SlugField(max_length=20, unique=True)
    name = models.CharField(max_length=60)

    class Meta:
        db_table = "surveys_survey"
        ordering = ["id"]

    def __str__(self):
        return self.name


class Question(models.Model):
    """Una pregunta de una encuesta.

    Con respuestas no se borra: se desactiva (`active`) y sus resultados siguen
    en los meses donde se contestó. La condición la hace depender de otra:
    «mostrar si» o «ocultar si» la respuesta a `condition_question` es una de
    `condition_options`. La evalúa `rules.visible`.
    """

    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="questions")
    text = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=QUESTION_KINDS, default=SINGLE)
    required = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    position = models.PositiveSmallIntegerField(default=0)

    condition_question = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="dependents"
    )
    condition_mode = models.CharField(max_length=10, choices=CONDITION_MODES, blank=True, default="")
    condition_options = models.ManyToManyField("Option", blank=True, related_name="conditions")

    class Meta:
        db_table = "surveys_question"
        ordering = ["survey_id", "position", "id"]
        constraints = [
            models.UniqueConstraint(Lower("text"), "survey", name="survey_question_text_unique"),
        ]

    def __str__(self):
        return self.text


class Option(models.Model):
    """Una respuesta posible de una pregunta. Con respuestas se desactiva, no se borra."""

    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=120)
    active = models.BooleanField(default=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "surveys_option"
        ordering = ["question_id", "position", "id"]
        constraints = [
            models.UniqueConstraint(Lower("text"), "question", name="survey_option_text_unique"),
        ]

    def __str__(self):
        return self.text


class Respondent(models.Model):
    """Un cliente al que se le hace una encuesta en un mes.

    `period` es el mes **sobre el que se pregunta** (la de octubre es `2026-10`
    aunque se llame en noviembre); `order` es el Id de la suscripción. El resto
    es la copia de su ficha.
    """

    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="respondents")
    period = models.CharField(max_length=7)
    order = models.CharField(max_length=60)

    client = models.CharField(max_length=200, blank=True, default="")
    ci = models.CharField(max_length=40, blank=True, default="")
    seller = models.CharField(max_length=200, blank=True, default="")
    channel = models.CharField(max_length=200, blank=True, default="")
    branch = models.CharField(max_length=100, blank=True, default="")
    zone = models.CharField(max_length=100, blank=True, default="")
    service_type = models.CharField(max_length=100, blank=True, default="")
    campaign = models.CharField(max_length=100, blank=True, default="")
    phone1 = models.CharField(max_length=60, blank=True, default="")
    phone2 = models.CharField(max_length=60, blank=True, default="")

    status = models.CharField(max_length=12, choices=STATUSES, default=PENDING)
    handled_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "surveys_respondent"
        ordering = ["zone", "branch", "order"]
        constraints = [
            models.UniqueConstraint(fields=["survey", "period", "order"], name="survey_respondent_unique_per_month"),
        ]
        indexes = [models.Index(fields=["survey", "period"], name="survey_respondent_month_idx")]

    def __str__(self):
        return f"{self.order} · {self.period}"


class Answer(models.Model):
    """Lo que contestó un encuestado en una pregunta: una opción, o un texto.

    Una fila por opción elegida, o una sola con `text` y sin opción si la
    pregunta es de texto libre. `PROTECT` impide borrar una pregunta u opción
    con historia. Si la pregunta cambia de tipo, lo ya contestado se conserva
    tal como se dio.
    """

    respondent = models.ForeignKey(Respondent, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="answers")
    option = models.ForeignKey(Option, null=True, blank=True, on_delete=models.PROTECT, related_name="answers")
    text = models.TextField(blank=True, default="")

    class Meta:
        db_table = "surveys_answer"
        constraints = [
            models.UniqueConstraint(
                fields=["respondent", "question", "option"], name="survey_answer_unique",
                condition=models.Q(option__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["respondent", "question"], name="survey_answer_text_unique",
                condition=models.Q(option__isnull=True),
            ),
            models.CheckConstraint(
                condition=models.Q(option__isnull=False) | ~models.Q(text=""), name="survey_answer_has_content",
            ),
        ]
        indexes = [models.Index(fields=["question", "option"], name="survey_answer_option_idx")]
