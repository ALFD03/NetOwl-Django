from django.urls import path

from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("import/subscriptions/", views.import_subscriptions, name="import_subscriptions"),
    path("import/logs/", views.import_logs, name="import_logs"),
    path("results/", views.results_list, name="results_list"),
    path("results/<str:periodo>/", views.results_detail, name="results_detail"),
]
