"""Quita el cumplimiento general del periodo.

El % de supervisores y coordinadoras de oficina sale ahora del % Ventas de su
site (`calculo._cumplimientos`) o se escribe a mano por persona; un % general
para todos ya no existe, a peticion del usuario. Los cierres ya hechos no lo
necesitan: lo que pagaron esta congelado en `ComisionPago`.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('comisiones', '0010_tarifas_oficina'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='comisionperiodo',
            name='cumplimiento_general_pct',
        ),
    ]
