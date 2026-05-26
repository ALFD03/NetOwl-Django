from datetime import datetime

from django import forms


class MonthForm(forms.Form):
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
    csv_file = forms.FileField(
        label="Archivo CSV",
        widget=forms.FileInput(
            attrs={
                "class": "form-control",
                "accept": ".csv",
            }
        ),
    )
