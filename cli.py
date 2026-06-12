"""
NetOwl Churn Analysis – CLI entrypoint.

Provides a command-line interface for importing data, running churn analysis,
and executing the full ETL + analysis pipeline.

Dependencies (backend packages):
    - backend.database.DBConnector   : Database connection manager.
    - backend.models.Periodo         : Period representation for analysis.
    - backend.analyzer.MetricsAnalyzer : Core churn-rate computation engine.
    - backend.imports                : CSV import utilities (subscriptions & logs).
"""

import argparse
from backend.database import DBConnector
from backend.models import Periodo
from backend.analyzer import MetricsAnalyzer
from backend.imports import import_subscriptions_csv, import_logs_csv
from backend.lifetime import run_lifecycle_analysis


def cmd_import_subs(args):
    """Import subscription records from a CSV file.

    Delegates to :func:`backend.imports.import_subscriptions_csv` and prints
    the number of imported rows.

    Args:
        args: Parsed CLI namespace with attribute ``csv_path``.
    """
    count = import_subscriptions_csv(args.csv_path)
    print(f"Importadas {count} suscripciones")


def cmd_import_logs(args):
    """Import log records from a CSV file.

    Delegates to :func:`backend.imports.import_logs_csv` and prints the
    number of imported rows.

    Args:
        args: Parsed CLI namespace with attribute ``csv_path``.
    """
    count = import_logs_csv(args.csv_path)
    print(f"Importados {count} logs")


def cmd_analyze(args):
    """Run churn-rate analysis for a given month.

    Builds a ``Periodo`` from the provided ``year_month`` string (``YYYY-MM``),
    creates a ``DBConnector`` and a ``MetricsAnalyzer``, then executes the
    analysis pipeline.

    Args:
        args: Parsed CLI namespace with attribute ``year_month``.
    """
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = MetricsAnalyzer(db, periodo)
    analyzer.run()


def cmd_lifecycle(args):
    """Run the global lifecycle analysis (independent of per-period analysis).

    Reads all logs from the DB, reconstructs every subscriber's state
    transitions, and computes KM curves for active/canceled periods.
    """
    metrics = run_lifecycle_analysis()
    print(f"\nResultados guardados en lifetime_metricas / lifetime_periodos / lifetime_dimensiones")


def cmd_run_all(args):
    """Run the full ETL + analysis pipeline in one command.

    Sequentially:
    1. Import subscriptions from CSV.
    2. Import logs from CSV.
    3. Run churn analysis for the given period.

    Args:
        args: Parsed CLI namespace with attributes ``year_month``, ``subs_csv``
              and ``logs_csv``.
    """
    count_subs = import_subscriptions_csv(args.subs_csv)
    print(f"Importadas {count_subs} suscripciones")
    count_logs = import_logs_csv(args.logs_csv)
    print(f"Importados {count_logs} logs")
    db = DBConnector()
    periodo = Periodo.build(f"{args.year_month}-01")
    analyzer = MetricsAnalyzer(db, periodo)
    analyzer.run()


def main():
    """Parse CLI arguments and dispatch to the appropriate subcommand.

    Supported subcommands:
        ``import subs <csv_path>``   – Import subscriptions from a CSV.
        ``import logs <csv_path>``   – Import logs from a CSV.
        ``analyze <YYYY-MM>``        – Run churn analysis for a month.
        ``run-all <YYYY-MM> <subs_csv> <logs_csv>`` – Full ETL + analysis.
    """
    parser = argparse.ArgumentParser(
        prog="cli",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="""NetOwl Churn Analysis – CLI entrypoint

            Comandos:
            - import subs <csv_path>: Importa suscripciones desde un CSV
            - import logs <csv_path>: Importa logs desde un CSV
            - analyze <YYYY-MM>: Analiza el churn rate para el mes dado
            - lifecycle: Ejecuta el analisis global de ciclo de vida (independiente del periodo)
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

    # lifecycle (no arguments needed)
    p_lifecycle = sub.add_parser("lifecycle", help="Ejecuta analisis global de ciclo de vida")
    p_lifecycle.set_defaults(func=cmd_lifecycle)

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
