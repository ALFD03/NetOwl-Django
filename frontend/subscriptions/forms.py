"""
Formularios HTML para la interfaz de usuario del analizador de churn.

Define los formularios utilizados en las vistas para seleccionar el período
de análisis mensual y para la carga de archivos CSV (suscripciones y logs).

Dependencias:
    - django.forms
    - datetime (estándar)
"""

from datetime import datetime

from django import forms


class MonthForm(forms.Form):
    """
    Formulario para seleccionar un mes y año de análisis.

    El usuario escoge un período (formato YYYY-MM) mediante un selector
    visual (month-picker) para ejecutar el cálculo de churn de ese mes.

    Atributos:
        month : Campo de texto con longitud máxima 7 (YYYY-MM).
                readonly = True  → el valor se selecciona desde un calendario JS.
                autocomplete off → evita sugerencias del navegador.
    """
    month = forms.CharField(
        label="Mes",
        max_length=7,
        widget=forms.TextInput(
            attrs={
                "class": "form-control month-picker",
                "placeholder": "Seleccione mes y año",
                "autocomplete": "off",
                "readonly": True,
            }
        ),
    )


class CSVUploadForm(forms.Form):
    """
    Formulario para la carga de archivos CSV.

    Utilizado tanto para importar suscripciones como logs. El atributo
    accept=".csv" en el input filtra los archivos en el diálogo del
    navegador.

    Atributos:
        csv_file : Campo de archivo que acepta únicamente extensión .csv.
    """
    csv_file = forms.FileField(
        label="Archivo CSV",
        widget=forms.FileInput(
            attrs={
                "class": "form-control",
                "accept": ".csv",
            }
        ),
    )
