from django.urls import path, include

urlpatterns = [
    path("", include("analyzer_app.urls")),
]
