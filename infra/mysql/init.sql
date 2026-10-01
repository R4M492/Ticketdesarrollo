-- Crea las 4 bases lógicas de los servicios relacionales (una por microservicio, ver
-- docs/plan-migracion-microservicios.md sección 4.2: un solo contenedor MySQL en local,
-- una base lógica por servicio, en vez de 4 contenedores separados) y un usuario de
-- aplicación compartido con acceso a las 4. Solo para desarrollo local.

CREATE DATABASE IF NOT EXISTS identity_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS organization_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS catalog_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS ticketing_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'helpdesk'@'%' IDENTIFIED BY 'helpdesk';
GRANT ALL PRIVILEGES ON identity_db.* TO 'helpdesk'@'%';
GRANT ALL PRIVILEGES ON organization_db.* TO 'helpdesk'@'%';
GRANT ALL PRIVILEGES ON catalog_db.* TO 'helpdesk'@'%';
GRANT ALL PRIVILEGES ON ticketing_db.* TO 'helpdesk'@'%';
FLUSH PRIVILEGES;
