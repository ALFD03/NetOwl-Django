from django.urls import path, include

urlpatterns = [
    path("", include("frontend.analyzer_app.urls")),
]
