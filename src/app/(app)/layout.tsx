import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ROLES, roleLabel } from "@/lib/constants";
import { AppShell, type NavItem } from "@/components/AppShell";

// Layout común a todas las páginas protegidas.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Datos frescos del usuario desde la BD (fuente de verdad). Esto evita
  // bucles de redirección: tras cambiar la contraseña, mustChangePassword se
  // refleja de inmediato aunque el token JWT aún no se haya renovado.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      mustChangePassword: true,
      active: true,
      groupRoleLabel: true,
      group: { select: { name: true } },
      congregation: { select: { name: true } },
    },
  });

  // Si el usuario fue eliminado o desactivado, cerrar acceso.
  if (!dbUser || !dbUser.active) redirect("/login");

  // Forzar cambio de contraseña en el primer ingreso.
  if (dbUser.mustChangePassword) {
    redirect("/cambiar-contrasena?obligatorio=1");
  }

  const isSuperadmin = user.role === ROLES.SUPERADMIN;
  // El Superadmin trabaja en su congregación con el mismo alcance que un
  // Administrador, además de tener el panel de plataforma.
  const isSecretary = user.role === ROLES.SECRETARIO || isSuperadmin;
  // Responsable de Confirmaciones "puro" (su único rol).
  const isPureConfirmador =
    user.role === ROLES.RESPONSABLE_CONFIRMACIONES;
  // Super/Aux que además tiene la capacidad de confirmaciones.
  const alsoConfirmador = Boolean(user.alsoConfirmador);
  const groupName = dbUser.group?.name ?? null;

  // Menú según rol.
  const reportsItems: NavItem[] = [
    { href: "/panel", label: "Panel", icon: "🏠", group: "Informes" },
    { href: "/publicadores", label: "Publicadores", icon: "👥", group: "Informes" },
    { href: "/informes", label: "Informes", icon: "📝", group: "Informes" },
    // "Estadísticas" a secas se confundía con las de asignaciones, que viven
    // en Reuniones; y "Historial" con el historial de informes guardados.
    {
      href: "/estadisticas",
      label: "Estadísticas de Informes",
      icon: "📊",
      group: "Informes",
    },
    { href: "/historial", label: "Años anteriores", icon: "🕓", group: "Informes" },
  ];
  const meetingsItems: NavItem[] = [
    { href: "/reuniones", label: "Reuniones", icon: "📅", group: "Reuniones" },
    // Antes solo se alcanzaba desde dentro de Reuniones: quien las buscaba en
    // el menú no las encontraba.
    {
      href: "/reuniones/estadisticas",
      label: "Estadísticas de Asignaciones",
      icon: "📈",
      group: "Reuniones",
    },
    // Programas armados a mano (aseo, asambleas, salidas al servicio…), los
    // que no salen del Excel de la VyMC.
    { href: "/programas", label: "Programas", icon: "📋", group: "Reuniones" },
  ];
  const secretaryItems: NavItem[] = [
    {
      href: "/precursores-auxiliares",
      label: "Precursores Auxiliares",
      icon: "🙋",
      group: "Administración",
    },
    { href: "/grupos", label: "Grupos", icon: "🗂️", group: "Administración" },
    { href: "/usuarios", label: "Usuarios", icon: "🔑", group: "Administración" },
    {
      href: "/credenciales",
      label: "Ver Credenciales",
      icon: "👁️",
      group: "Administración",
    },
    { href: "/exportar", label: "Exportar", icon: "⬇️", group: "Administración" },
    { href: "/auditoria", label: "Auditoría", icon: "🛡️", group: "Administración" },
  ];
  const accountItems: NavItem[] = [
    {
      href: "/cambiar-contrasena",
      label: "Mi contraseña",
      icon: "⚙️",
      group: "Mi cuenta",
    },
  ];
  // Solo el Superadministrador ve el panel de plataforma.
  const platformItems: NavItem[] = isSuperadmin
    ? [
        {
          href: "/plataforma",
          label: "Plataforma",
          icon: "🌐",
          group: "Plataforma",
        },
      ]
    : [];

  let navItems: NavItem[];
  if (isSuperadmin && !user.congregationId) {
    // Superadmin sin congregación propia: solo administra la plataforma.
    navItems = [...platformItems, ...accountItems];
  } else if (isPureConfirmador) {
    // Solo la sección Reuniones.
    navItems = [...meetingsItems, ...accountItems];
  } else if (isSecretary) {
    // Acceso completo: Informes + Reuniones + administración.
    navItems = [
      ...platformItems,
      ...reportsItems,
      ...meetingsItems,
      ...secretaryItems,
      ...accountItems,
    ];
  } else {
    // Superintendente / Auxiliar: Informes de su grupo, y Reuniones si además
    // tiene la capacidad de confirmaciones.
    navItems = [
      ...reportsItems,
      ...(alsoConfirmador ? meetingsItems : []),
      ...accountItems,
    ];
  }

  return (
    <AppShell
      user={{
        name: dbUser.name ?? user.username,
        roleLabel:
          roleLabel(user.role) +
          (isSecretary && dbUser.groupRoleLabel
            ? ` · ${roleLabel(dbUser.groupRoleLabel)}`
            : ""),
        groupName,
        congregationName: dbUser.congregation?.name ?? null,
      }}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
