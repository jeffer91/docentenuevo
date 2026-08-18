-- SIACD · Bloque 3
-- Matriz complementaria, observación de calidad, evidencias, documentos y certificación integral.

create table if not exists public.complementary_definitions (
  id text primary key,
  display_id text not null unique,
  hito text not null,
  process text not null,
  observable_criterion text not null,
  criticality text not null check (criticality in ('Crítica','Importante','Deseable')),
  expected_evidence text,
  active boolean not null default true
);

create table if not exists public.complementary_scores (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  criterion_id text not null references public.complementary_definitions(id),
  score smallint check (score between 0 and 4),
  observation text,
  verified_on date,
  updated_at timestamptz not null default now(),
  unique (expedient_id, criterion_id)
);

create table if not exists public.quality_criteria (
  id text primary key,
  dimension text not null,
  criterion text not null,
  validation_parameter text not null,
  expected_evidence text,
  criticality text not null check (criticality in ('Crítica','Importante','Deseable')),
  weight numeric(10,8) not null check (weight > 0),
  level_0 text not null default 'No se evidencia el criterio o la evidencia disponible demuestra incumplimiento.',
  level_1 text not null default 'Se evidencia de forma incipiente; requiere orientación directa y acompañamiento permanente para cumplir el parámetro.',
  level_2 text not null default 'Se evidencia parcialmente; cumple aspectos esenciales, pero presenta brechas que requieren acompañamiento frecuente.',
  level_3 text not null default 'Cumple de manera correcta, suficiente y autónoma el parámetro de validación establecido.',
  level_4 text not null default 'Cumple integralmente el parámetro, demuestra consistencia y aporta valor adicional mediante buenas prácticas, profundización o apoyo a otros.',
  active boolean not null default true
);

create table if not exists public.quality_scores (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  criterion_id text not null references public.quality_criteria(id),
  score smallint check (score between 0 and 4),
  finding text,
  improvement_commitment text,
  verification_on date,
  updated_at timestamptz not null default now(),
  unique (expedient_id, criterion_id)
);

create table if not exists public.document_narratives (
  id uuid primary key default gen_random_uuid(),
  expedient_id uuid not null references public.expedients(id) on delete cascade,
  section_key text not null,
  content text,
  updated_at timestamptz not null default now(),
  unique (expedient_id, section_key)
);

alter table public.evidences alter column uploaded_by drop not null;
alter table public.evidences
  add column if not exists uploaded_by_staff_id uuid references public.siacd_staff(id) on delete set null;

alter table public.generated_documents alter column generated_by drop not null;
alter table public.generated_documents
  add column if not exists generated_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  add column if not exists scheduled_on date,
  add column if not exists issued_on date,
  add column if not exists signed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists observation text;

create index if not exists complementary_scores_expedient_idx on public.complementary_scores(expedient_id);
create index if not exists quality_scores_expedient_idx on public.quality_scores(expedient_id);
create index if not exists document_narratives_expedient_idx on public.document_narratives(expedient_id);
create index if not exists evidences_staff_idx on public.evidences(uploaded_by_staff_id);
create index if not exists generated_documents_staff_idx on public.generated_documents(generated_by_staff_id);

alter table public.complementary_definitions enable row level security;
alter table public.complementary_scores enable row level security;
alter table public.quality_criteria enable row level security;
alter table public.quality_scores enable row level security;
alter table public.document_narratives enable row level security;

grant select, insert, update, delete on public.complementary_definitions, public.complementary_scores, public.quality_criteria, public.quality_scores, public.document_narratives to anon, authenticated;
grant select, insert, update, delete on public.evidences, public.generated_documents to anon, authenticated;

drop policy if exists public_direct_access on public.complementary_definitions;
create policy public_direct_access on public.complementary_definitions for all to anon using (true) with check (true);
drop policy if exists public_direct_access on public.complementary_scores;
create policy public_direct_access on public.complementary_scores for all to anon using (true) with check (true);
drop policy if exists public_direct_access on public.quality_criteria;
create policy public_direct_access on public.quality_criteria for all to anon using (true) with check (true);
drop policy if exists public_direct_access on public.quality_scores;
create policy public_direct_access on public.quality_scores for all to anon using (true) with check (true);
drop policy if exists public_direct_access on public.document_narratives;
create policy public_direct_access on public.document_narratives for all to anon using (true) with check (true);

drop policy if exists block3_authenticated_access on public.complementary_definitions;
create policy block3_authenticated_access on public.complementary_definitions for all to authenticated using (true) with check (true);
drop policy if exists block3_authenticated_scores on public.complementary_scores;
create policy block3_authenticated_scores on public.complementary_scores for all to authenticated using (true) with check (true);
drop policy if exists block3_authenticated_quality on public.quality_criteria;
create policy block3_authenticated_quality on public.quality_criteria for all to authenticated using (true) with check (true);
drop policy if exists block3_authenticated_quality_scores on public.quality_scores;
create policy block3_authenticated_quality_scores on public.quality_scores for all to authenticated using (true) with check (true);
drop policy if exists block3_authenticated_narratives on public.document_narratives;
create policy block3_authenticated_narratives on public.document_narratives for all to authenticated using (true) with check (true);

insert into public.complementary_definitions
  (id, display_id, hito, process, observable_criterion, criticality, expected_evidence)
values
('MC-C01','C01','H1 · Inducción','Docencia','Describe y aplica la estructura institucional de la sesión de clase: inicio, desarrollo y cierre.','Crítica','Entrevista / caso'),
('MC-C02','C02','H1 · Inducción','Institucional','Identifica las modalidades de estudio institucionales y sus particularidades operativas.','Importante','Entrevista'),
('MC-C03','C03','H1 · Inducción','Institucional','Conoce y cumple el horario oficial asignado a sus actividades académicas.','Crítica','Seguimiento'),
('MC-C04','C04','H2 · Preparación','EVA','Elabora presentaciones de clase conforme al estándar institucional establecido.','Crítica','Producto'),
('MC-C05','C05','H2 · Preparación','EVA','Carga en el aula virtual diapositivas y materiales conforme a la estructura y estándar institucional.','Crítica','Evidencia EVA'),
('MC-C06','C06','H2 · Preparación','EVA','Configura las actividades del aula virtual con instrucciones, recursos, fechas y criterios de evaluación completos.','Crítica','Demostración'),
('MC-C07','C07','H3 · Inicio docencia','SISACAD','Gestiona solicitudes de ampliación de plazo para el registro de calificaciones conforme al procedimiento institucional.','Importante','Caso práctico'),
('MC-C08','C08','H3 · Inicio docencia','SISACAD','Gestiona el registro o importación extraordinaria de calificaciones fuera de tiempo conforme al procedimiento institucional.','Importante','Caso práctico'),
('MC-C09','C09','H4 · Seguimiento 1','Docencia','Mantiene actualizada la microplanificación y la registra oportunamente al finalizar cada clase.','Crítica','SISACAD / evidencia'),
('MC-C10','C10','H4 · Seguimiento 1','Institucional','Cumple las actividades académicas dentro de los tiempos establecidos.','Crítica','Seguimiento'),
('MC-C11','C11','H4 · Seguimiento 1','Seguimiento','Da seguimiento oportuno a novedades académicas de los estudiantes y las deriva cuando corresponde.','Importante','Bitácora / evidencia'),
('MC-C12','C12','H5 · Seguimiento 2','Evaluación','Publica las calificaciones dentro de los plazos institucionales, además de calificarlas oportunamente.','Crítica','SISACAD / EVA'),
('MC-C13','C13','H6 · Cierre','SISACAD','Verifica que las asistencias del período estén completas, correctas y validadas antes del cierre.','Crítica','SISACAD'),
('MC-C14','C14','H6 · Cierre','EVA','Verifica que las actividades, recursos y evidencias del aula virtual se encuentren completas al cierre.','Crítica','EVA'),
('MC-C15','C15','H6 · Cierre','Teams','Verifica que las grabaciones de clase estén completas, publicadas y correctamente identificadas.','Crítica','Teams / EVA'),
('MC-C16','C16','H6 · Cierre','Institucional','Entrega la documentación académica final dentro del plazo institucional.','Crítica','Registro documental'),
('MC-C17','C17','H6 · Cierre','Seguimiento','Verifica que las novedades y requerimientos estudiantiles hayan sido solventados o debidamente derivados.','Importante','Informe / bitácora')
on conflict (id) do update set display_id=excluded.display_id,hito=excluded.hito,process=excluded.process,observable_criterion=excluded.observable_criterion,criticality=excluded.criticality,expected_evidence=excluded.expected_evidence,active=true;

insert into public.quality_criteria
  (id, dimension, criterion, validation_parameter, expected_evidence, criticality, weight)
values
('CAL-01','Dominio Disciplinar','Responde técnicamente a las preguntas, observaciones o dudas formuladas por los estudiantes.','Las respuestas son correctas, pertinentes, comprensibles y coherentes con el campo disciplinar; cuando corresponde, fundamenta o ejemplifica.','Observación directa / interacción docente-estudiante','Crítica',0.0500000000),
('CAL-02','Dominio Disciplinar','Mantiene correspondencia entre los contenidos y materiales cargados en el aula virtual y los conocimientos teórico-prácticos propios de la disciplina.','Los contenidos, recursos y ejemplos del EVA guardan relación directa con la asignatura, el PEA y los conocimientos teórico-prácticos de la disciplina.','PEA / EVA / recursos de clase','Importante',0.0500000000),
('CAL-03','Dominio Disciplinar','Desarrolla contenidos técnicamente relacionados con la disciplina y demuestra dominio suficiente para generar aprendizaje.','Explica conceptos y procedimientos con precisión, utiliza terminología disciplinar adecuada y conecta los contenidos con situaciones de aplicación.','Observación de clase / recursos','Crítica',0.0500000000),
('CAL-04','Dominio Disciplinar','Planifica sus clases combinando métodos y técnicas de enseñanza según objetivos, características de los estudiantes, contenidos, recursos y ambiente.','La metodología observada es coherente con el objetivo de la clase, el contenido, la modalidad, los recursos disponibles y las características del grupo.','PEA / microplanificación / observación','Crítica',0.0500000000),
('CAL-05','Estrategias Didácticas y Metodologías','Articula teoría y práctica durante la clase utilizando pedagógicamente el libro de asignatura y la guía de formación práctica.','Integra fundamentos teóricos con ejercicios, demostraciones, casos o prácticas y utiliza los recursos institucionales previstos para la asignatura.','Observación / libro / guía práctica','Importante',0.0400000000),
('CAL-06','Estrategias Didácticas y Metodologías','Emplea herramientas TIC educativas para desarrollar contenidos e implementar el aula virtual con recursos específicos.','Utiliza TIC pertinentes para apoyar el aprendizaje y mantiene el EVA con recursos funcionales, accesibles y vinculados al desarrollo de la clase.','Observación / EVA / herramientas TIC','Importante',0.0400000000),
('CAL-07','Estrategias Didácticas y Metodologías','Es dinámico y motiva a los estudiantes durante las clases.','Genera participación, interés y atención mediante estrategias activas, variación de recursos y una conducción de clase estimulante.','Observación directa','Importante',0.0400000000),
('CAL-08','Estrategias Didácticas y Metodologías','Genera reflexión y vincula su experiencia profesional con el tema desarrollado.','Plantea preguntas, ejemplos o situaciones profesionales que permiten analizar, relacionar y reflexionar sobre el contenido.','Observación directa','Importante',0.0400000000),
('CAL-09','Estrategias Didácticas y Metodologías','Promueve pensamiento crítico e investigación académica mediante fuentes concretas de información, incluida la Biblioteca Virtual institucional.','Solicita análisis, argumentación o contrastación y orienta al uso de fuentes académicas verificables, incluida la Biblioteca Virtual cuando aplica.','Observación / recursos / referencias','Importante',0.0400000000),
('CAL-10','Evaluación y Retroalimentación','Cumple el indicador de logro definido a partir del objetivo de la clase.','Las actividades y evidencias observadas permiten constatar el logro esperado para la sesión y existe coherencia con el objetivo declarado.','Objetivo / actividad / evidencia','Crítica',0.0500000000),
('CAL-11','Evaluación y Retroalimentación','Realiza una actividad diagnóstica con los estudiantes cuando corresponde.','Explora conocimientos previos o condiciones de entrada mediante una actividad pertinente antes de desarrollar contenidos que lo requieren.','Observación / actividad diagnóstica','Importante',0.0500000000),
('CAL-12','Evaluación y Retroalimentación','Genera retroalimentación constante durante las fases de inicio, desarrollo y cierre.','Brinda orientaciones específicas, oportunas y comprensibles que permiten al estudiante reconocer aciertos, errores y acciones de mejora.','Observación / EVA / interacción','Crítica',0.0500000000),
('CAL-13','Evaluación y Retroalimentación','Formula preguntas dirigidas que promueven la participación activa de los estudiantes.','Las preguntas son pertinentes, claras y distribuidas entre los estudiantes; favorecen comprensión, análisis o aplicación y no solo repetición.','Observación directa','Importante',0.0500000000),
('CAL-14','Gestión del Ambiente en el Aula','Establece una interacción positiva, brinda orientación académica y mantiene un ambiente de orden, disciplina y respeto.','La comunicación es respetuosa, inclusiva y profesional; gestiona normas, participación y situaciones del aula sin afectar el clima de aprendizaje.','Observación directa','Crítica',0.1000000000),
('CAL-15','Gestión del Ambiente en el Aula','Registra la asistencia de los estudiantes con nombre y apellido de forma correcta y oportuna.','En sesiones sincrónicas, verifica primero que la grabación esté activa —preferentemente iniciada aproximadamente dos minutos antes del inicio formal— y posteriormente registra la asistencia dentro del tiempo institucional, sin inconsistencias entre participantes y registro.','SISACAD / lista de asistencia','Importante',0.1000000000),
('CAL-16','Planificación y Organización','Mantiene coherencia entre el tema desarrollado en clase y lo declarado en el PEA.','Tema, objetivo, contenidos y actividades desarrollados corresponden a la planificación prevista en el PEA para la fecha observada.','PEA / microplanificación / observación','Crítica',0.0333333333),
('CAL-17','Planificación y Organización','Califica oportunamente las actividades y registra las notas en los sistemas dentro de los plazos establecidos.','Las actividades evaluadas presentan calificación y registro oportuno en EVA/SISACAD, con correspondencia entre ambos sistemas cuando aplica.','EVA / SISACAD / cronograma','Crítica',0.0333333333),
('CAL-18','Planificación y Organización','Cumple con la planificación microcurricular, elaborándola y registrándola oportunamente al finalizar cada clase.','La microplanificación se encuentra actualizada, corresponde a lo ejecutado y está registrada dentro del plazo establecido.','Microplanificación / SISACAD','Crítica',0.0333333333),
('CAL-19','Planificación y Organización','Comunica el objetivo de la clase y los contenidos a desarrollar.','Al inicio de la sesión comunica de manera comprensible el propósito u objetivo y orienta sobre los contenidos o actividades previstas.','Observación directa','Importante',0.0333333333),
('CAL-20','Planificación y Organización','Organiza adecuadamente el tiempo de clase.','Distribuye el tiempo entre inicio, desarrollo y cierre, completa las actividades esenciales y evita retrasos o extensiones injustificadas.','Observación directa','Importante',0.0333333333),
('CAL-21','Planificación y Organización','Cumple puntualmente sus obligaciones académicas en Moodle y SISACAD.','Mantiene actualizados Moodle y SISACAD dentro de los plazos institucionales; publica las evidencias requeridas utilizando el formato institucional con fotografía y descripción y conserva la información académica completa y verificable.','Moodle / SISACAD / cronograma','Crítica',0.0333333333)
on conflict (id) do update set dimension=excluded.dimension,criterion=excluded.criterion,validation_parameter=excluded.validation_parameter,expected_evidence=excluded.expected_evidence,criticality=excluded.criticality,weight=excluded.weight,active=true;
