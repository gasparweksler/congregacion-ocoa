// Mapea estados de publicador a un "tono" de color para las insignias (Badge).
import { PUBLISHER_STATUS, type PublisherStatus } from "@/lib/constants";

type Tone = "slate" | "green" | "blue" | "amber" | "red" | "violet";

const STATUS_TONES: Record<PublisherStatus, Tone> = {
  [PUBLISHER_STATUS.BAUTIZADO]: "green",
  [PUBLISHER_STATUS.NO_BAUTIZADO]: "blue",
  [PUBLISHER_STATUS.INACTIVO]: "slate",
  [PUBLISHER_STATUS.PRECURSOR_REGULAR]: "violet",
  [PUBLISHER_STATUS.PRECURSOR_AUXILIAR]: "amber",
  [PUBLISHER_STATUS.PRECURSOR_AUXILIAR_INDEFINIDO]: "amber",
  // Los dos nombramientos: violeta, como el precursor regular, porque son
  // de la misma familia (informan horas y son de dedicación permanente).
  [PUBLISHER_STATUS.PRECURSOR_ESPECIAL]: "violet",
  [PUBLISHER_STATUS.MISIONERO_CAMPO]: "violet",
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status as PublisherStatus] ?? "slate";
}
