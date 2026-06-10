import argparse
from backend.database import DBConnector
from backend.models import Periodo
from backend.analyzer import ChurnRateAnalyzer
from backend.imports import import_subscriptions_csv, import_logs_csv


def cmd_import_subs(args):
    count = import_subscriptions_csv(args.csv_path)
    print(f"Importadas {count} suscripciones")


def cmd_import_logs(args):
    count = import_logs_csv(args.csv_path)
    print(f"Importados {count} logs")


def cmd_analyze(args):
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = ChurnRateAnalyzer(db, periodo)
    analyzer.run()


def cmd_run_all(args):
    count_subs = import_subscriptions_csv(args.subs_csv)
    print(f"Importadas {count_subs} suscripciones")
    count_logs = import_logs_csv(args.logs_csv)
    print(f"Importados {count_logs} logs")
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = ChurnRateAnalyzer(db, periodo)
    analyzer.run()


def main():
    parser = argparse.ArgumentParser(
        prog="cli",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="""NetOwl Churn Analysis – CLI entrypoint

            Comandos:
            - import subs <csv_path>: Importa suscripciones desde un CSV
            - import logs <csv_path>: Importa logs desde un CSV
            - analyze <YYYY-MM>: Analiza el churn rate para el mes dado
            - run-all <YYYY-MM> <subs_csv> <logs_csv>: Ejecuta todo el proceso de importación y análisis para el mes dado
            """
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # import subs <csv_path>
    p_import = sub.add_parser("import")
    p_import_sub = p_import.add_subparsers(dest="import_type", required=True)

    p_subs = p_import_sub.add_parser("subs")
    p_subs.add_argument("csv_path")
    p_subs.set_defaults(func=cmd_import_subs)

    p_logs = p_import_sub.add_parser("logs")
    p_logs.add_argument("csv_path")
    p_logs.set_defaults(func=cmd_import_logs)

    # analyze <YYYY-MM>
    p_analyze = sub.add_parser("analyze")
    p_analyze.add_argument("year_month", help="Mes a analizar en formato YYYY-MM")
    p_analyze.set_defaults(func=cmd_analyze)

    # run-all <YYYY-MM> <subs_csv> <logs_csv>
    p_run = sub.add_parser("run-all")
    p_run.add_argument("year_month", help="Mes a analizar en formato YYYY-MM")
    p_run.add_argument("subs_csv")
    p_run.add_argument("logs_csv")
    p_run.set_defaults(func=cmd_run_all)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
