// Primeros pasos de una congregación recién creada.
//
// Sin esto, al entrar por primera vez no hay nada que hacer y tampoco se dice
// por dónde empezar: hacen falta grupos antes que publicadores, y publicadores
// antes de poder cargar informes. Cada paso desaparece al completarse, y la
// tarjeta entera desaparece cuando están los tres.

import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui";

export type Step = {
  label: string;
  description: string;
  href: string;
  done: boolean;
};

export function FirstSteps({ steps }: { steps: Step[] }) {
  if (steps.every((s) => s.done)) return null;

  const hechos = steps.filter((s) => s.done).length;

  return (
    <Card>
      <CardHeader
        title="Primeros pasos"
        description={`${hechos} de ${steps.length} listos. Hazlos en este orden: cada uno hace falta para el siguiente.`}
      />
      <CardBody>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.href}>
              {s.done ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 opacity-60">
                  <span aria-hidden className="text-emerald-600">
                    ✓
                  </span>
                  <span className="min-w-0 text-sm text-muted line-through">
                    {s.label}
                  </span>
                </div>
              ) : (
                <Link
                  href={s.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {s.label}
                    </span>
                    <span className="block text-xs text-muted">
                      {s.description}
                    </span>
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  );
}
