-- Copia las tablas del ORM de `public` al esquema de un entorno.
--
-- Contexto: hasta ahora DB_SCHEMA solo cualificaba el SQL crudo de
-- core/database.py y el `db_table` de services/imports/models.py. El resto del
-- ORM —auth_user, auth_permission, auth_group, config_profile,
-- config_permissiongroup, django_content_type, django_session— vivia en
-- `public`, asi que todos los entornos apuntados a la misma base de datos
-- compartian usuarios, permisos y sesiones. Compartir django_session es lo que
-- hacia que entrar en un entorno cerrase la sesion del otro.
--
-- Ahora `search_path` apunta al esquema del entorno (ver DATABASES en
-- netowl_web/settings.py). Este script lleva los datos que ya existen en
-- `public` al esquema nuevo, para no tener que recrear las cuentas a mano.
--
-- ANTES de ejecutarlo, las tablas tienen que existir en el esquema destino.
-- Con DB_SCHEMA apuntando a ese esquema:
--
--     python manage.py migrate contenttypes
--     python manage.py migrate auth
--     python manage.py migrate sessions
--     python manage.py migrate config
--     python manage.py migrate imports --fake   # analysis_jobs e
--                                               # import_action_logs ya existen
--
-- `imports` va con --fake a proposito: su `db_table` ya cualificaba el esquema,
-- asi que sus dos tablas estan creadas desde siempre en cada entorno. Aplicar
-- sus migraciones de verdad fallaria con "already exists".
--
-- Despues:
--
--     psql "$CONN" -v esquema=test -f scripts/separar_esquema.sql
--
-- `migrate` deja django_content_type y auth_permission ya poblados, con ids
-- propios que no coinciden con los de `public`. Por eso se vacian antes de
-- copiar: hay que conservar los ids de origen o las claves ajenas de
-- config_profile y auth_user_user_permissions apuntarian al permiso equivocado.
--
-- django_session NO se copia: separarla es justamente el objetivo. Cada
-- entorno empieza sin sesiones y sus usuarios vuelven a entrar una vez.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    esq       text := :'esquema';
    tabla     text;
    secuencia text;
    columnas  text;
    filas     bigint;
    -- De dependiente a principal para vaciar, y al reves para insertar.
    tablas text[] := ARRAY[
        'django_content_type',
        'auth_permission',
        'auth_group',
        'auth_group_permissions',
        'auth_user',
        'auth_user_groups',
        'auth_user_user_permissions',
        'config_permissiongroup',
        'config_profile'
    ];
BEGIN
    IF esq = 'public' THEN
        RAISE EXCEPTION 'El esquema destino no puede ser `public`: es el origen.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = esq) THEN
        RAISE EXCEPTION 'El esquema % no existe.', esq;
    END IF;

    FOREACH tabla IN ARRAY tablas LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables WHERE schemaname = esq AND tablename = tabla
        ) THEN
            RAISE EXCEPTION
                'Falta %.% — ejecute antes los `manage.py migrate` de la cabecera.',
                esq, tabla;
        END IF;
    END LOOP;

    -- Un solo TRUNCATE con CASCADE: el orden dentro de la lista da igual y
    -- evita pelearse con las claves ajenas entre ellas.
    EXECUTE format(
        'TRUNCATE %s CASCADE',
        (SELECT string_agg(format('%I.%I', esq, t), ', ') FROM unnest(tablas) AS t)
    );

    -- Se copia columna por nombre, no con SELECT *. Las tablas de `public`
    -- se crearon hace anos y han acumulado columnas en distinto orden que las
    -- que `migrate` acaba de crear en el esquema nuevo: posicionalmente no
    -- casan (un booleano acaba enfrente de un varchar y la copia revienta).
    FOREACH tabla IN ARRAY tablas LOOP
        SELECT string_agg(format('%I', d.column_name), ', ' ORDER BY d.ordinal_position)
          INTO columnas
          FROM information_schema.columns d
          JOIN information_schema.columns o
            ON o.table_schema = 'public'
           AND o.table_name = d.table_name
           AND o.column_name = d.column_name
         WHERE d.table_schema = esq
           AND d.table_name = tabla;

        IF columnas IS NULL THEN
            RAISE EXCEPTION 'No hay columnas en comun entre public.% y %.%', tabla, esq, tabla;
        END IF;

        EXECUTE format(
            'INSERT INTO %I.%I (%s) SELECT %s FROM public.%I',
            esq, tabla, columnas, columnas, tabla
        );
        GET DIAGNOSTICS filas = ROW_COUNT;
        RAISE NOTICE 'copiada %.%: % filas', esq, tabla, filas;
    END LOOP;

    -- Las secuencias quedan donde las dejo `migrate`, por debajo de los ids
    -- recien insertados: el siguiente alta chocaria con una clave duplicada.
    -- Las tablas sin secuencia (si alguna no la tiene) se saltan.
    FOREACH tabla IN ARRAY tablas LOOP
        EXECUTE format(
            'SELECT pg_get_serial_sequence(%L, %L)', format('%I.%I', esq, tabla), 'id'
        ) INTO secuencia;
        CONTINUE WHEN secuencia IS NULL;
        EXECUTE format(
            'SELECT setval(%L, COALESCE((SELECT MAX(id) FROM %I.%I), 1))',
            secuencia, esq, tabla
        );
    END LOOP;
END;
$$;

COMMIT;

-- Comprobacion: las cuentas deben coincidir con las de public.
SET search_path TO :"esquema";
\echo 'Filas ahora en el esquema' :esquema
SELECT 'auth_user' AS tabla, count(*) FROM auth_user
UNION ALL SELECT 'auth_permission', count(*) FROM auth_permission
UNION ALL SELECT 'config_profile', count(*) FROM config_profile
UNION ALL SELECT 'config_permissiongroup', count(*) FROM config_permissiongroup;
