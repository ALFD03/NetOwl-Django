# Churn Rate Analyzer V2

Sistema modular para el cálculo de Churn Rate, métricas de reactivación, ARPU, tiempos de vida y análisis por dimensiones (zona, sucursal, municipio, campaña, producto).

## Arquitectura

```
ChurnRateAnalyzerV2/
├── main.py                      # Punto de entrada (CLI + GUI)
├── 
├── Planes.json                  # Catálogo de 84 planes para validación
├── Zonas.json                   # 45 zonas geográficas
│
├── backend/
│   ├── __init__.py
│   ├── .env                     # Variables de entorno
│   ├── config.py                # Constantes, variables de entorno
│   ├── utils.py                 # normalize_text(), parse_date()
│   ├── models.py                # Periodo (dataclass con build() y label())
│   ├── database.py              # DBConnector (pool, read_table, save_historico, copy_dataframe)
│   └── analyzer.py              # ChurnRateAnalyzer (núcleo del negocio)
│
└── frontend/
    ├── __init__.py
    ├── theme.py                 # Paleta de colores para la GUI
    ├── imports.py               # Importación y limpieza de CSV
    └── gui.py                   # Interfaz Flet
```

## Requisitos
```
| **PostgreSQL** | 12+ | 15+ |
| **Python** | 3.10+ | 3.12+ |
```
## Instalación

```bash
git clone https://github.com/ALFD03/ChurnRateAnalyzerV2
cd ChurnRateAnalyzerV2
python -m venv venv
# Windows: .\venv\Scripts\activate
# Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
```

## Configuración

Crear archivo `.env` en backend:

```env
HOST=localhost
DB=churn_db
USER=postgres
PASS=tu_password
PORT=5432
SCHEMA=public
```

## Uso

### Interfaz gráfica

```bash
python main.py
```

Ventana principal con:
1. **Selector de mes** (YYYY-MM) — define el período de análisis
2. **Importar CSV de Suscripciones** — carga y consolida suscripciones
3. **Importar CSV de Logs** — carga historial de eventos
4. **Ejecutar Análisis** — corre el pipeline completo

### Línea de comandos

```bash
# Ejecutar análisis para abril 2026
python main.py --periodo 2026-04

# Ejecutar con importación previa (suscripciones + logs)
python main.py --periodo 2026-04 --subscriptions data/subs.csv --logs data/logs.csv
```

## Pipeline de análisis (`backend/analyzer.py`)

```
1.  Carga de datos (DB → DataFrames)
2.  Limpieza y normalización de logs
3.  Fotos de cartera (activos inicio / activos final / nuevos)
4.  Inactivos al inicio del período
5.  ARPU (facturación total / activos final)
6.  Reactivaciones segmentadas (solo si resultan activas al cierre)
7.  Corte por factura impagada
8.  Método Financiero (balance contable)
9.  Método Operativo (transiciones en logs)
10. KPI final (churn neto/bruto, winback, ARPU, adiciones, etc.)
11. Dimensiones (zona, sucursal, municipio, campaña, producto)
12. Tiempos de vida (días activo, días cancelado)
```

## Tablas de base de datos

### Entrada (se importan desde CSV)

| Tabla | Contenido |
|---|---|
| `Subscripciones` | Suscripciones consolidadas (una fila por orden) |
| `Subscripciones-b` | Datos detallados por línea de orden |
| `Subscripciones-logs` | Historial de cambios de estado |

### Salida (se generan en cada ejecución)

| Tabla | Columnas principales |
|---|---|
| `cierre_churn_historico` | `periodo`, `metodo`, `activos_inicio`, `activos_final`, `nuevos_mes`, `bajas_netas_balance`, `bajas_brutas_auditoria`, `churn_neto_pct`, `churn_bruto_pct`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `total_inactivos`, `tasa_winback_pct`, `total_billing`, `arpu`, `reactivaciones`, `react_6_8`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_brutas`, `adiciones_netas`, `corte_impagado` |
| `master_activos_cierre` | Cartera de activos al cierre del período |
| `master_reactivaciones` | Reactivaciones del período |
| `master_bajas_detalladas` | Bajas detalladas (Financiero y Operativo) |
| `master_corte_impagado` | Suscripciones con corte por impago |
| `master_inactivos_detallados` | Suscripciones inactivas al inicio del período |
| `master_tiempos_vida` | Detalle por orden: días activo, días cancelado |
| `master_tiempo_global` | Promedios globales de tiempos de vida |
| `master_churn_dimensiones` | Métricas desglosadas por dimensión (`zona`, `sucursal`, `municipio`, `campanna`, `producto`) |

## Métricas calculadas

| Métrica | Fórmula |
|---|---|
| **Churn neto (Financiero)** | `max(0, activos_inicio + nuevos - activos_final) / activos_inicio × 100` |
| **Churn bruto (Auditoría)** | `(bajas_netas + react_audit) / activos_inicio × 100` |
| **ARPU** | `sum(Total de activos final) / activos final` |
| **Tasa Winback** | `reactivaciones_únicas / inactivos_inicio × 100` |
| **Tasa Aporte Reactivaciones** | `react_6_8 / (nuevas + react_6_8) × 100` |
| **Índice Reemplazo Reactivaciones** | `react_6_8 / bajas_fin_netas × 100` |
| **Adiciones Brutas** | `nuevas - bajas_fin_netas` |
| **Adiciones Netas** | `(nuevas + react_6_8) - bajas_fin_netas` |
| **Promedio días activo** | `avg(f_churn - f_ini_dt)` sobre órdenes con churn |
| **Promedio días cancelado** | `avg(f_react - f_churn)` sobre órdenes con reactivación |

## Notas importantes

- Reactivaciones solo se cuentan si la suscripción está **activa al cierre del período**
- `react_6_8` considera solo reactivaciones provenientes de `6_churn` y `8_30days` (excluye `4_paused`)
- El método **Financiero** usa fórmula de balance contable: `activos_inicio - (activos_final - nuevos)`
- El método **Operativo** cuenta transiciones reales desde logs (`3_progress → 4_paused/6_churn`)
- Los datos duplicados por período se evitan automáticamente vía DELETE + INSERT en `save_historico()`

## Desarrollo

```bash
# Verificar sintaxis de todos los módulos
python -c "
import ast, pathlib
for f in sorted(pathlib.Path('.').rglob('*.py')):
    if 'venv' in str(f) or '__pycache__' in str(f): continue
    ast.parse(f.read_text(encoding='utf-8'))
    print(f'{f} OK')
"
```

## Autor

Ing. Angel Flores
