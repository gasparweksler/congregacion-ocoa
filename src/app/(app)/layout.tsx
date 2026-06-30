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
      group: { select: { name: true } },
    },
  });

  // Si el usuario fue eliminado o desactivado, cerrar acceso.
  if (!dbUser || !dbUser.active) redirect("/login");

  // Forzar cambio de contraseña en el primer ingreso.
  if (dbUser.mustChangePassword) {
    redirect("/cambiar-contrasena?obligatorio=1");
  }

  const isSecretary = user.role === ROLES.SECRETARIO;
  const isConfirmador = user.role === ROLES.RESPONSABLE_CONFIRMACIONES;
  const groupName = dbUser.group?.name ?? null;

  // Menú según rol.
  const reportsItems: NavItem[] = [
    { href: "/panel", label: "Panel", icon: "🏠" },
    { href: "/publicadores", label: "Publicadores", icon: "👥" },
    { href: "/informes", label: "Informes", icon: "📝" },
    { href: "/estadisticas", label: "Estadísticas", icon: "📊" },
    { href: "/historial", label: "Historial", icon: "🕓" },
  ];
  const meetingsItem: NavItem = {
    href: "/reuniones",
    label: "Reuniones",
    icon: "📅",
  };
  const secretaryItems: NavItem[] = [
    { href: "/grupos", label: "Grupos", icon: "🗂️" },
    { href: "/usuarios", label: "Usuarios", icon: "🔑" },
    { href: "/credenciales", label: "Ver Credenciales", icon: "👁️" },
    { href: "/exportar", label: "Exportar", icon: "⬇️" },
    { href: "/auditoria", label: "Auditoría", icon: "🛡️" },
  ];
  const accountItems: NavItem[] = [
    { href: "/cambiar-contrasena", label: "Mi contraseña", icon: "⚙️" },
  ];

  let navItems: NavItem[];
  if (isConfirmador) {
    // Solo la sección Reuniones.
    navItems = [meetingsItem, ...accountItems];
  } else if (isSecretary) {
    // Acceso completo: Informes + Reuniones + administración.
    navItems = [
      ...reportsItems,
      meetingsItem,
      ...secretaryItems,
      ...accountItems,
    ];
  } else {
    // Superintendente / Auxiliar: solo Informes de su grupo.
    navItems = [...reportsItems, ...accountItems];
  }

  return (
    <AppShell
      user={{
        name: dbUser.name ?? user.username,
        roleLabel: roleLabel(user.role),
        groupName,
      }}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
