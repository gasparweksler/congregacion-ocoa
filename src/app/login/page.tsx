import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/access";
import { LoginForm } from "@/components/forms/LoginForm";

// Página de inicio de sesión. Si ya hay sesión, va directo al panel.
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/panel");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* --- Panel de marca (bienvenida) --- */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-brand to-brand-2 px-8 py-10 text-white lg:w-1/2 lg:px-14 lg:py-14">
        {/* Adornos sutiles de fondo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/95 text-2xl font-bold text-brand shadow-md">
            O
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Congregación Ocoa</p>
            <p className="text-sm text-white/60">Actividad de Publicadores</p>
          </div>
        </div>

        <div className="relative my-10 lg:my-0">
          <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
            Registro de informes Congregación Ocoa
          </h1>
          <p className="mt-4 max-w-md text-base text-white/70">
            Registra informes, consulta estadísticas y organiza los grupos de
            servicio desde cualquier dispositivo.
          </p>
        </div>

        <p className="relative text-xs text-white/50">
          Acceso exclusivo para personas autorizadas de la congregación.
        </p>
      </section>

      {/* --- Panel del formulario --- */}
      <section className="flex flex-1 items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Iniciar sesión
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Ingresa tus credenciales para continuar.
            </p>
          </div>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
