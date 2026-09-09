-- Auditoria temporal de borrados en django_session.
--
-- Contexto: entrar en un entorno cierra la sesion del otro. Los dos comparten
-- public.django_session (desarrollo apunta al Vault de produccion), y ninguna
-- de las dos aplicaciones borra sesiones: no hay un solo uso del modelo
-- Session en el codigo, y Django solo elimina la fila del propio request en
-- logout() y en el cycle_key() de login(). Queda un DELETE externo, y esto
-- sirve para verlo.
--
-- Registra cada borrado con la IP del cliente que lo ejecuto, que es lo que
-- distingue quien fue: la MV (produccion, dentro del compose) o la maquina de
-- desarrollo.
--
-- Aplicar:   psql "$CONN" -f scripts/auditar_sesiones.sql
-- Consultar: SELECT * FROM public.auditoria_sesiones ORDER BY borrado_en DESC;
-- QUITAR:    ver el bloque del final. No dejar esto puesto mas de lo necesario.

CREATE TABLE IF NOT EXISTS public.auditoria_sesiones (
    id           bigserial PRIMARY KEY,
    session_key  varchar(40),
    expire_date  timestamptz,
    borrado_en   timestamptz  NOT NULL DEFAULT now(),
    cliente_ip   inet,
    aplicacion   text,
    usuario_bd   text,
    consulta     text
);

CREATE OR REPLACE FUNCTION public.registrar_borrado_sesion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.auditoria_sesiones (
        session_key, expire_date, cliente_ip, aplicacion, usuario_bd, consulta
    )
    VALUES (
        OLD.session_key,
        OLD.expire_date,
        inet_client_addr(),
        current_setting('application_name', true),
        session_user,
        current_query()
    );
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_borrado_sesion ON public.django_session;
CREATE TRIGGER trg_auditar_borrado_sesion
    AFTER DELETE ON public.django_session
    FOR EACH ROW
    EXECUTE FUNCTION public.registrar_borrado_sesion();

-- Para revertirlo todo cuando ya no haga falta:
--
--   DROP TRIGGER IF EXISTS trg_auditar_borrado_sesion ON public.django_session;
--   DROP FUNCTION IF EXISTS public.registrar_borrado_sesion();
--   DROP TABLE IF EXISTS public.auditoria_sesiones;
