const FIREBASE_DATABASE_URL = "https://repaso-fire-d8ceb-default-rtdb.firebaseio.com";
const DIRECTORY_NODE = "docentes-registrados";

export type DirectoryTeacher = {
  cedula: string;
  nombresCompletos: string;
  carreras: string[];
  roles: string[];
  actualizadoEn?: string;
};

type FirebaseTeacherRecord = {
  cedula?: unknown;
  nombresCompletos?: unknown;
  carrera?: unknown;
  carreras?: unknown;
  rol?: unknown;
  roles?: unknown;
  actualizadoEn?: unknown;
};

export function normalizeCedula(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10) return digits;
  return null;
}

export function cedulaValidationWarning(value: string): string | null {
  const cedula = normalizeCedula(value);
  if (!cedula) return "La cédula debe tener 9 o 10 dígitos. Si tiene 9, SIACD agregará el 0 inicial.";

  const province = Number(cedula.slice(0, 2));
  const third = Number(cedula[2]);
  if (province < 1 || province > 24 || third >= 6) {
    return "La estructura no coincide con una cédula ecuatoriana habitual. Puede continuar si el dato institucional es correcto.";
  }

  const digits = cedula.split("").map(Number);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    let current = digits[index] * (index % 2 === 0 ? 2 : 1);
    if (current > 9) current -= 9;
    sum += current;
  }
  const verifier = (10 - (sum % 10)) % 10;
  if (verifier !== digits[9]) {
    return "El dígito verificador no coincide. Puede continuar, pero conviene revisar la cédula.";
  }
  return null;
}

export function normalizeDirectoryLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function careerKey(value: string): string {
  const normalized = normalizeDirectoryLabel(value).replace(/\s+/g, "_");
  return normalized || "carrera";
}

function roleKey(value: string): string {
  const normalized = normalizeDirectoryLabel(value).replace(/\s+/g, "_");
  return normalized || "rol";
}

function parseCareers(record: FirebaseTeacherRecord): string[] {
  const values: string[] = [];
  if (typeof record.carrera === "string" && record.carrera.trim()) values.push(record.carrera.trim());

  if (Array.isArray(record.carreras)) {
    for (const item of record.carreras) if (typeof item === "string" && item.trim()) values.push(item.trim());
  } else if (record.carreras && typeof record.carreras === "object") {
    for (const item of Object.values(record.carreras as Record<string, unknown>)) {
      if (typeof item === "string" && item.trim()) values.push(item.trim());
    }
  }

  return [...new Map(values.map((item) => [normalizeDirectoryLabel(item), item])).values()];
}

function parseRoles(record: FirebaseTeacherRecord): string[] {
  const values: string[] = [];
  if (typeof record.rol === "string" && record.rol.trim()) values.push(record.rol.trim());

  if (Array.isArray(record.roles)) {
    for (const item of record.roles) if (typeof item === "string" && item.trim()) values.push(item.trim());
  } else if (record.roles && typeof record.roles === "object") {
    for (const [key, value] of Object.entries(record.roles as Record<string, unknown>)) {
      if (value === true) values.push(key);
      else if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
  }

  return mergeDirectoryRoles(values);
}

export function mergeDirectoryCareers(...groups: string[][]): string[] {
  const merged = new Map<string, string>();
  for (const group of groups) {
    for (const value of group) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      merged.set(normalizeDirectoryLabel(trimmed), trimmed);
    }
  }
  return [...merged.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export function mergeDirectoryRoles(...groups: string[][]): string[] {
  const merged = new Map<string, string>();
  for (const group of groups) {
    for (const value of group) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const normalized = normalizeDirectoryLabel(trimmed);
      merged.set(normalized, normalized || trimmed);
    }
  }
  return [...merged.values()].sort((a, b) => a.localeCompare(b, "es"));
}

export async function readDirectoryTeacher(value: string): Promise<DirectoryTeacher | null> {
  const cedula = normalizeCedula(value);
  if (!cedula) return null;
  const response = await fetch(`${FIREBASE_DATABASE_URL}/${DIRECTORY_NODE}/${cedula}.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase respondió ${response.status}`);
  const raw = (await response.json()) as FirebaseTeacherRecord | null;
  if (!raw || typeof raw !== "object") return null;

  return {
    cedula,
    nombresCompletos: typeof raw.nombresCompletos === "string" ? raw.nombresCompletos.trim() : "",
    carreras: parseCareers(raw),
    roles: parseRoles(raw),
    actualizadoEn: typeof raw.actualizadoEn === "string" ? raw.actualizadoEn : undefined,
  };
}

export async function writeDirectoryTeacher(input: Omit<DirectoryTeacher, "roles"> & { roles?: string[] }): Promise<void> {
  const cedula = normalizeCedula(input.cedula);
  if (!cedula) throw new Error("Cédula inválida");

  let existingRoles: string[] = [];
  try {
    const existing = await readDirectoryTeacher(cedula);
    existingRoles = existing?.roles ?? [];
  } catch {
    existingRoles = [];
  }

  const roles = mergeDirectoryRoles(existingRoles, input.roles ?? [], ["docente"]);
  const careersObject = Object.fromEntries(
    mergeDirectoryCareers(input.carreras).map((career) => [careerKey(career), career]),
  );
  const rolesObject = Object.fromEntries(roles.map((role) => [roleKey(role), true]));

  const response = await fetch(`${FIREBASE_DATABASE_URL}/${DIRECTORY_NODE}/${cedula}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cedula,
      nombresCompletos: input.nombresCompletos.trim(),
      carreras: careersObject,
      carrera: null,
      roles: rolesObject,
      actualizadoEn: input.actualizadoEn ?? new Date().toISOString(),
    }),
  });

  if (!response.ok) throw new Error(`Firebase respondió ${response.status}`);
}

export async function deleteDirectoryTeacher(value: string): Promise<void> {
  const cedula = normalizeCedula(value);
  if (!cedula) return;
  const response = await fetch(`${FIREBASE_DATABASE_URL}/${DIRECTORY_NODE}/${cedula}.json`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Firebase respondió ${response.status}`);
}

export function newestName(options: {
  firebaseName?: string;
  firebaseUpdatedAt?: string;
  supabaseName?: string;
  supabaseUpdatedAt?: string;
}): { name: string; source: "firebase" | "supabase" | "none" } {
  const firebaseName = options.firebaseName?.trim() ?? "";
  const supabaseName = options.supabaseName?.trim() ?? "";
  if (!firebaseName && !supabaseName) return { name: "", source: "none" };
  if (!supabaseName) return { name: firebaseName, source: "firebase" };
  if (!firebaseName) return { name: supabaseName, source: "supabase" };

  const firebaseTime = options.firebaseUpdatedAt ? Date.parse(options.firebaseUpdatedAt) : Number.NaN;
  const supabaseTime = options.supabaseUpdatedAt ? Date.parse(options.supabaseUpdatedAt) : Number.NaN;
  if (Number.isFinite(firebaseTime) && Number.isFinite(supabaseTime)) {
    return supabaseTime > firebaseTime
      ? { name: supabaseName, source: "supabase" }
      : { name: firebaseName, source: "firebase" };
  }
  if (Number.isFinite(supabaseTime) && !Number.isFinite(firebaseTime)) return { name: supabaseName, source: "supabase" };
  return { name: firebaseName, source: "firebase" };
}
