# Sistema de Actividad de Publicadores — Congregación Ocoa

Aplicación web para registrar, administrar, consultar y exportar la actividad
mensual de los publicadores de la congregación, organizada por **Grupos de
Servicio**. Funciona en computador, tablet y teléfono.

Construida con **Next.js + TypeScript + Prisma + SQLite + NextAuth + Tailwind +
ExcelJS**.

---

## 1. ¿Qué hace?

- **Roles**: Secretario (administrador general), Superintendente de Grupo y
  Auxiliar de Grupo (estos dos con los mismos permisos, limitados a su grupo).
- **Grupos y usuarios**: el Secretario crea grupos y asigna usuarios. Para
  "designar temporalmente" a otra persona basta con crear/activar otro usuario
  en el grupo — el historial se conserva.
- **Publicadores**: alta/edición/baja con estado (Bautizado, No Bautizado,
  Inactivo, Precursor Regular/Auxiliar/Auxiliar Indefinido). Cada cambio de
  estado queda en el historial.
- **Informes mensuales**: participación, cursos bíblicos y horas (estas últimas
  solo para precursores), por mes y año.
- **Estadísticas en tiempo real**: por grupo y de toda la congregación, con
  comparaciones y gráficos de evolución mensual y anual.
- **Historial**: consulta de cualquier mes anterior y evolución por publicador,
  grupo o congregación.
- **Exportación a Excel** (.xlsx): informes, estadísticas y listado de
  publicadores.
- **Seguridad**: contraseñas con hash (bcrypt), control de acceso por rol y por
  grupo, y registro de auditoría.

---

## 2. Requisitos previos

1. **Node.js 20.9 o superior** (recomendado la versión LTS).
   - Descarga: <https://nodejs.org> → instala la versión "LTS".
   - Para comprobar que quedó instalado, abre una terminal y escribe:
     ```bash
     node --version
     npm --version
     ```

No necesitas instalar ninguna base de datos: SQLite es un simple archivo.

---

## 3. Instalación (primera vez)

Abre una terminal **dentro de la carpeta del proyecto** (`congregacion-ocoa`) y
ejecuta los comandos en orden:

```bash
# 1) Instalar las dependencias
npm install

# 2) Crear el archivo de configuración a partir de la plantilla
#    (en Windows PowerShell usa:  Copy-Item .env.example .env )
cp .env.example .env

# 3) Generar un secreto de sesión seguro y pégalo en AUTH_SECRET dentro de .env
npx auth secret

# 4) Crear la base de datos y cargar el usuario inicial + datos de ejemplo
npm run db:migrate
npm run db:seed
```

> **Importante**: edita el archivo `.env` y cambia `AUTH_SECRET` por el valor que
> generó el comando `npx auth secret`.

### Usuarios creados por la carga inicial

| Rol             | Usuario      | Contraseña |
| --------------- | ------------ | ---------- |
| Secretario      | `secretario` | `Ocoa2026` |
| Superintendente | `super1`     | `Ocoa2026` |
| Auxiliar        | `aux1`       | `Ocoa2026` |

> Al primer ingreso, el sistema **obliga a cambiar la contraseña**. Los usuarios
> `super1`/`aux1` y el grupo de demostración son solo de ejemplo: puedes
> eliminarlos cuando crees tus datos reales.

---

## 4. Ejecutar la aplicación

### En tu computador (desarrollo)

```bash
npm run dev
```

Abre el navegador en <http://localhost:3000>.

### En modo producción (local)

```bash
npm run build
npm run start
```

---

## 5. Comandos útiles

| Comando              | Para qué sirve                                       |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Ejecuta la app en modo desarrollo.                   |
| `npm run build`      | Compila la app para producción.                      |
| `npm run start`      | Ejecuta la versión compilada.                        |
| `npm run db:migrate` | Crea/actualiza la base de datos según el esquema.    |
| `npm run db:seed`    | Carga el usuario inicial y datos de ejemplo.         |
| `npm run db:studio`  | Abre Prisma Studio para ver/editar la base de datos. |
| `npm run db:reset`   | **Borra** la base y la recrea desde cero (con seed). |

---

## 6. Copias de seguridad (backup)

La base de datos completa es **un solo archivo**: `prisma/dev.db`.

- **Hacer una copia**: copia ese archivo a un lugar seguro (pendrive, nube,
  etc.). Hazlo periódicamente (por ejemplo, cada mes tras cargar los informes).
  - Windows (PowerShell):
    ```powershell
    Copy-Item prisma\dev.db "prisma\backup-$(Get-Date -Format yyyy-MM-dd).db"
    ```
- **Restaurar**: cierra la aplicación y reemplaza `prisma/dev.db` por la copia.

> Si despliegas en la nube con PostgreSQL (ver más abajo), el proveedor suele
> ofrecer copias de seguridad automáticas.

---

## 7. Publicar en internet (despliegue)

### Opción recomendada (gratis y sencilla): Vercel + Neon (PostgreSQL)

SQLite es ideal para uso local, pero en servidores "sin estado" (como Vercel) el
archivo no se conserva. Para la nube conviene usar **PostgreSQL gratuito**
(Neon). El cambio es mínimo.

**Paso 1 — Crear la base de datos PostgreSQL (gratis):**

1. Entra a <https://neon.tech> y crea una cuenta.
2. Crea un proyecto. Copia la "Connection string" (empieza con
   `postgresql://...`).

**Paso 2 — Cambiar Prisma a PostgreSQL:**
En `prisma/schema.prisma`, cambia el bloque `datasource`:

```prisma
datasource db {
  provider = "postgresql"   // antes decía "sqlite"
  url      = env("DATABASE_URL")
}
```

**Paso 3 — Subir el proyecto a GitHub** (si no lo has hecho):

```bash
git init
git add .
git commit -m "Primera versión"
# crea un repositorio en github.com y sigue las instrucciones para "push"
```

**Paso 4 — Desplegar en Vercel:**

1. Entra a <https://vercel.com>, inicia sesión con GitHub e **importa** el
   repositorio.
2. En **Settings → Environment Variables**, agrega:
   - `DATABASE_URL` → la cadena de Neon.
   - `AUTH_SECRET` → ejecuta `npx auth secret` y pega el valor.
   - `AUTH_URL` → la URL que te dé Vercel (ej. `https://tu-app.vercel.app`).
3. Haz el "Deploy".

**Paso 5 — Preparar la base de datos en la nube** (una sola vez). Desde tu
computador, con el `DATABASE_URL` de Neon en tu `.env`:

```bash
npm run db:migrate
npm run db:seed
```

¡Listo! Tu app estará disponible en la URL de Vercel.

### Alternativa: Railway (permite seguir usando SQLite)

Si prefieres no cambiar a PostgreSQL, <https://railway.app> permite un "volumen"
persistente donde el archivo SQLite se conserva. Cuesta unos pocos dólares al
mes. Conecta el repositorio, agrega un volumen montado en `/app/prisma` y define
las variables `AUTH_SECRET` y `AUTH_URL`.

---

## 8. Migrar de SQLite a PostgreSQL (resumen)

1. Cambia `provider` a `postgresql` en `prisma/schema.prisma`.
2. Pon la nueva `DATABASE_URL` en `.env`.
3. Ejecuta `npm run db:migrate` y luego `npm run db:seed`.

(Los datos de SQLite no se copian automáticamente; si necesitas trasladarlos,
exporta a Excel antes o pide ayuda para una migración de datos.)

---

## 9. Estructura del proyecto

```
prisma/
  schema.prisma      # Modelo de datos
  seed.ts            # Carga inicial (secretario + ejemplo)
src/
  auth.ts            # Configuración de NextAuth
  app/
    login/           # Inicio de sesión
    cambiar-contrasena/
    (app)/           # Páginas protegidas (panel, grupos, usuarios,
                     #   publicadores, informes, estadísticas, historial,
                     #   exportar, auditoría)
    api/
      auth/          # Endpoints de NextAuth
      export/        # Descarga de archivos Excel
  components/        # Componentes de interfaz (UI, formularios, gráficos)
  lib/               # Lógica: prisma, acceso, estadísticas, validaciones, etc.
  server/            # Server Actions (crear/editar/eliminar)
```

---

## 10. Seguridad — buenas prácticas

- Cambia **todas** las contraseñas iniciales después de instalar.
- Mantén tu archivo `.env` en privado (ya está excluido de Git).
- Genera un `AUTH_SECRET` único y largo en producción.
- Haz copias de seguridad de la base de datos con regularidad.
