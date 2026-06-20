// Pequeña utilidad para combinar clases de Tailwind condicionalmente.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
