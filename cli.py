import argparse
from backend.database import DBConnector
from backend.models import Periodo
from backend.subscriptions import (
    MetricsAnalyzer, import_subscriptions_csv, import_logs_csv, import_gratis_csv,
)
from backend.subscriptions.lifetime import run_lifecycle_analysis
from backend.crm import run_crm_analysis, import_crm_csv
from backend.support import import_support_csv, run_support_analysis

def cmd_import_subs(args):
    count = import_subscriptions_csv(args.csv_path)
    print(f"Importadas {count} suscripciones")

def cmd_import_logs(args):
    count = import_logs_csv(args.csv_path)
    print(f"Importados {count} logs")

def cmd_import_gratis(args):
    count = import_gratis_csv(args.csv_path)
    print(f"Importadas {count} suscripciones con plan gratuito")

def cmd_analyze(args):
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = MetricsAnalyzer(db, periodo)
    analyzer.run()

def cmd_lifecycle(args):
    metrics = run_lifecycle_analysis()
    print(f"\nResultados guardados en lifetime_metricas / lifetime_periodos / lifetime_dimensiones")

def cmd_run_all(args):
    count_subs = import_subscriptions_csv(args.subs_csv)
    print(f"Importadas {count_subs} suscripciones")
    count_logs = import_logs_csv(args.logs_csv)
    print(f"Importados {count_logs} logs")
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = MetricsAnalyzer(db, periodo)
    analyzer.run()

# CRM Commands
def cmd_crm_import(args):
    rows_clients, rows_logs = import_crm_csv(args.csv_path)
    print(f"Importados {rows_clients} clientes | {rows_logs} logs")

def cmd_crm_analyze(args):
    periodo = getattr(args, "year_month", None)
    run_crm_analysis(periodo)

def cmd_crm_run_all(args):
    rows_clients, rows_logs = import_crm_csv(args.csv_path)
    print(f"Importados {rows_clients} clientes | {rows_logs} logs")
    periodo = getattr(args, "year_month", None)
    run_crm_analysis(periodo)
    
# Support Commands
def cmd_support_import(args):
    count = import_support_csv(args.csv_path)
    print(f"Importados {count} tickets de soporte técnico")

def cmd_support_analyze(args):
    periodo = getattr(args, "year_month", None)
    run_support_analysis(periodo)

def cmd_support_run_all(args):
    count = import_support_csv(args.csv_path)
    print(f"Importados {count} tickets de soporte técnico")
    periodo = getattr(args, "year_month", None)
    run_support_analysis(periodo)


def main():
    parser = argparse.ArgumentParser(
        prog="cli",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="NetOwl Analytics – CLI entrypoint"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # Imports
    p_import = sub.add_parser("import")
    p_import_sub = p_import.add_subparsers(dest="import_type", required=True)

    p_subs = p_import_sub.add_parser("subs")
    p_subs.add_argument("csv_path")
    p_subs.set_defaults(func=cmd_import_subs)

    p_logs = p_import_sub.add_parser("logs")
    p_logs.add_argument("csv_path")
    p_logs.set_defaults(func=cmd_import_logs)

    p_gratis = p_import_sub.add_parser("gratis")
    p_gratis.add_argument("csv_path")
    p_gratis.set_defaults(func=cmd_import_gratis)

    p_crm = p_import_sub.add_parser("crm")
    p_crm.add_argument("csv_path")
    p_crm.set_defaults(func=cmd_crm_import)

    p_support = p_import_sub.add_parser("support")
    p_support.add_argument("csv_path")
    p_support.set_defaults(func=cmd_support_import)

    # Subscriptions Analysis
    p_analyze = sub.add_parser("analyze")
    p_analyze.add_argument("year_month", help="Mes a analizar en formato YYYY-MM")
    p_analyze.set_defaults(func=cmd_analyze)

    p_lifecycle = sub.add_parser("lifecycle")
    p_lifecycle.set_defaults(func=cmd_lifecycle)

    p_run = sub.add_parser("run-all")
    p_run.add_argument("year_month", help="Mes a analizar en formato YYYY-MM")
    p_run.add_argument("subs_csv")
    p_run.add_argument("logs_csv")
    p_run.set_defaults(func=cmd_run_all)

    # CRM Analysis
    p_crm_analyze = sub.add_parser("crm-analyze", help="Analiza métricas CRM")
    p_crm_analyze.add_argument("year_month", nargs="?", default=None, help="Mes opcional (YYYY-MM)")
    p_crm_analyze.set_defaults(func=cmd_crm_analyze)

    p_crm_run = sub.add_parser("crm-run-all", help="Importa y analiza CRM")
    p_crm_run.add_argument("csv_path")
    p_crm_run.add_argument("year_month", nargs="?", default=None, help="Mes opcional (YYYY-MM)")
    p_crm_run.set_defaults(func=cmd_crm_run_all)

    # Support Analysis
    p_support_analyze = sub.add_parser("support-analyze", help="Analiza métricas de Soporte Técnico")
    p_support_analyze.add_argument("year_month", nargs="?", default=None, help="Mes opcional (YYYY-MM)")
    p_support_analyze.set_defaults(func=cmd_support_analyze)

    p_support_run = sub.add_parser("support-run-all", help="Importa y analiza Soporte Técnico completo")
    p_support_run.add_argument("csv_path")
    p_support_run.add_argument("year_month", nargs="?", default=None, help="Mes opcional (YYYY-MM)")
    p_support_run.set_defaults(func=cmd_support_run_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()