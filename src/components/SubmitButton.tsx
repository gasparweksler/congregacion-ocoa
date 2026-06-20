"use client";

// Botón de envío que muestra estado "cargando" mientras la Server Action corre.
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
