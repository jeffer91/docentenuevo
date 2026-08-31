export const REPORT_LOGO_DATA_URL = "";

export type ReportKey =
  | "informe_induccion"
  | "informe_final";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const CAREER_DOCUMENT_CODES: Record<string, string> = Object.fromEntries(
  [
    ["Enfermería", "Técnico Superior", "CTSENF"],
    ["Mecánica Automotriz", "Tecnología Superior", "CTSMA"],
    ["Mecánica de Motos", "Tecnología Superior", "CTSMM"],
    ["Diseño Multimedia", "Tecnología Superior", "CTSDM"],
    ["Marketing Digital y Comercio Electrónico", "Tecnología Superior", "CTSMDCE"],
    ["Marketing Digital y Comercio Electrónico TSU", "Tecnología Universitaria", "CTSUMDCE"],
    ["Ventas", "Tecnología Superior", "CTSV"],
    ["Desarrollo de Software", "Tecnología Superior", "CTSDS"],
    ["Desarrollo de Software y Ciberseguridad", "Tecnología Universitaria", "CTSUDSC"],
    ["Redes y Telecomunicaciones", "Tecnología Superior", "CTSRT"],
    ["Redes y Telecomunicaciones TSU", "Tecnología Universitaria", "CTSURT"],
    ["Estética Integral", "Tecnología Superior", "CTSEST"],
    ["Educación Básica", "Tecnología Superior", "CTSEB"],
    ["Educación Inicial", "Tecnología Superior", "CTSEI"],
    ["Educación Inicial TSU", "Tecnología Universitaria", "CTSUEI"],
    ["Pedagogía", "Tecnología Universitaria", "CTSUPED"],
    ["Procesamiento de Alimentos", "Tecnología Superior", "CTSPA"],
    ["Administración", "Tecnología Superior", "CTSADM"],
    ["Administración de Empresas e Inteligencia de Negocios", "Tecnología Universitaria", "CTSUAEIN"],
    ["Administración del Talento Humano", "Tecnología Universitaria", "CTSUATH"],
    ["Contabilidad", "Tecnología Superior", "CTSCONT"],
    ["Contabilidad y Tributación TSU", "Tecnología Universitaria", "CTSUCT"],
    ["Gestión del Talento Humano", "Tecnología Superior", "CTSGTH"],
    ["Seguridad y Prevención de Riesgos Laborales", "Tecnología Superior", "CTSSPRL"],
    ["Rehabilitación Física", "Tecnología Superior", "CTSRF"],
    ["Seguridad Ciudadana y Orden Público", "Tecnología Superior", "CTSSCOP"],
    ["Gastronomía", "Tecnología Superior", "CTSGAS"],
  ].map(([career, program, code]) => [normalize(`${career} - ${program}`), code]),
);

export function careerNameFromLabel(label: string) {
  return label.split(/\s+[—–-]\s+/)[0]?.trim() || label.trim() || "Carrera no registrada";
}

export function careerDocumentPrefix(label: string) {
  const normalizedLabel = normalize(label);
  return CAREER_DOCUMENT_CODES[normalizedLabel] ?? "CTSXXX";
}

/**
 * La referencia institucional entregada conserva 0X como número documental.
 * Se mantiene como dato configurable para no inventar una secuencia institucional.
 */
export const INSTITUTIONAL_DOCUMENT_SEQUENCE = "0X";

export function institutionalDocumentCode(label: string, reportKey: ReportKey, dateIso: string) {
  const prefix = careerDocumentPrefix(label);
  const [year = "AÑO", month = "MES"] = dateIso.split("-");
  void reportKey;
  return `${prefix}-INF-${INSTITUTIONAL_DOCUMENT_SEQUENCE}-PRO-121-${year}-${month}`;
}

export function attendanceDocumentCode(label: string, year: number | string, month: number | string) {
  const prefix = careerDocumentPrefix(label);
  const normalizedMonth = String(month).padStart(2, "0");
  return `${prefix}-RGI1-${INSTITUTIONAL_DOCUMENT_SEQUENCE}-PRO-121-${year}-${normalizedMonth}`;
}

export function reportHeaderTitle(reportKey: ReportKey, careerLabel: string, period: string) {
  if (reportKey === "informe_induccion") {
    return "Informe de Inducción de los Procesos Académicos a Docente: Nuevos";
  }
  const career = careerNameFromLabel(careerLabel);
  return `Informe Final de Acompañamiento-Docente: Nuevos Carrera ${career} Periodo ${period || "No registrado"}`;
}
