"""Siembra las dos encuestas con las preguntas de las que se parte.

Todo se edita después en Encuestas › Preguntas: las listas de motivos,
problemas y empresas son un punto de partida genérico. No se siembra nada en
una encuesta que ya tenga preguntas.
"""

from django.db import migrations

GOOD = ["Buena", "Normal", "Mala"]
WELL = ["Bien", "Normal", "Mal"]
YES_NO = ["Sí", "No"]

SUPPORT_REASON = "Soporte técnico o atención al cliente"

SURVEYS = {
    "instalados": ("Encuesta de instalados", [
        {"text": "¿El tiempo de instalación fue adecuado?", "options": WELL},
        {"text": "Calidad del vendedor", "options": GOOD},
        {"text": "Calidad de la instalación", "options": GOOD},
        {"text": "Atención de la cuadrilla", "options": GOOD},
        {"text": "Calidad del servicio", "options": GOOD},
        {"text": "¿Nos recomendaría?", "options": YES_NO},
    ]),
    "bajas": ("Encuesta de bajas", [
        {"key": "reason", "text": "¿Cuál es el motivo de su baja?", "options": [
            "Fallas constantes del servicio", SUPPORT_REASON, "Precio", "Mudanza",
            "Se cambió a otra empresa", "Ya no necesita el servicio", "Otro",
        ]},
        {"text": "Mientras estuvo con nosotros, ¿cuáles fueron los problemas que presentó?", "kind": "multiple",
         "options": [
             "Lentitud", "Cortes o intermitencia", "Fallas del equipo", "Visitas técnicas sin resolver",
             "Facturación", "Ninguno",
         ]},
        {"text": "¿Se sintió a gusto con el soporte técnico y la atención al cliente?", "options": WELL,
         "hide_if": ("reason", [SUPPORT_REASON])},
        {"text": "Si mejoráramos nuestros defectos, ¿volvería con nosotros?", "options": ["Sí", "No", "No lo sé"]},
        {"key": "switch", "text": "¿Se está cambiando de empresa?", "options": YES_NO},
        {"text": "¿A cuál empresa?", "options": ["Otra"], "show_if": ("switch", ["Sí"])},
    ]),
}


def seed(apps, schema_editor):
    Survey = apps.get_model("surveys", "Survey")
    Question = apps.get_model("surveys", "Question")
    Option = apps.get_model("surveys", "Option")

    for slug, (name, questions) in SURVEYS.items():
        survey, _ = Survey.objects.get_or_create(slug=slug, defaults={"name": name})
        if survey.questions.exists():
            continue
        by_key = {}
        for position, spec in enumerate(questions, start=1):
            q = Question.objects.create(
                survey=survey, text=spec["text"], kind=spec.get("kind", "unica"), position=position,
            )
            options = {
                text: Option.objects.create(question=q, text=text, position=i)
                for i, text in enumerate(spec["options"], start=1)
            }
            if "key" in spec:
                by_key[spec["key"]] = (q, options)
            for mode, field in (("mostrar", "show_if"), ("ocultar", "hide_if")):
                if field in spec:
                    key, texts = spec[field]
                    parent, parent_options = by_key[key]
                    q.condition_question = parent
                    q.condition_mode = mode
                    q.save()
                    q.condition_options.set([parent_options[t] for t in texts])


class Migration(migrations.Migration):

    dependencies = [
        ("surveys", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
