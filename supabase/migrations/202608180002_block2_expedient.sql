-- SIACD · Bloque 2
-- Expediente operativo: H1-H6, 75 competencias, bitácora y plan de mejora.
-- Los criterios se trasladan del Excel institucional. Se corrige D13, cuyo peso/evidencia estaban desplazados visualmente.

alter table public.followups
  alter column created_by drop not null;

alter table public.followups
  add column if not exists created_by_staff_id uuid references public.siacd_staff(id) on delete set null,
  add column if not exists evidence_reference text;

create index if not exists followups_staff_idx
  on public.followups(created_by_staff_id);

grant select, insert, update, delete on public.followups to anon, authenticated;
grant select, insert, update, delete on public.competency_definitions to anon, authenticated;
grant select, insert, update, delete on public.competency_scores to anon, authenticated;
grant select, insert, update, delete on public.improvement_actions to anon, authenticated;
grant select, insert, update, delete on public.hito_schedules to anon, authenticated;

insert into public.competency_definitions
  (id, hito_id, process, observable_competency, criticality, expected_evidence, relative_weight)
values
('I01','H1','Institucional','Comprende el propósito del proceso CGC-PRO-121 y el esquema de acompañamiento del docente nuevo.','Crítica','Entrevista',2),
('I02','H1','Institucional','Conoce el calendario académico, los canales oficiales de comunicación y los plazos que afectan su gestión docente.','Crítica','Entrevista',2),
('I03','H1','Institucional','Identifica los procedimientos esenciales de evaluación, tutorías, adaptaciones curriculares y cierre de asignatura.','Importante','Caso práctico',1),
('I04','H1','SISACAD','Accede al SISACAD con sus credenciales institucionales.','Crítica','Demostración',2),
('I05','H1','EVA','Accede al EVA (Moodle) con sus credenciales institucionales.','Crítica','Demostración',2),
('I06','H1','Teams','Accede a Microsoft Teams con su cuenta institucional.','Crítica','Demostración',2),
('I07','H1','Telegram','Conoce el estándar institucional de creación y uso del grupo de Telegram.','Importante','Demostración',1),
('P01','H2','SISACAD','Registra la firma electrónica en SISACAD para la validación de documentos institucionales.','Crítica','Demostración',2),
('P02','H2','SISACAD','Consulta y verifica su carga académica, horario, paralelos y estudiantes asignados.','Crítica','Demostración',2),
('P03','H2','SISACAD','Elabora y registra el PEA conforme al formato y lineamientos institucionales.','Crítica','Producto',2),
('P04','H2','SISACAD','Genera la planificación de adaptaciones curriculares cuando corresponde.','Importante','Producto',1),
('P05','H2','Teams','Activa el equipo de Microsoft Teams correspondiente a la asignatura.','Crítica','Demostración',2),
('P06','H2','Teams','Genera el código del equipo de Teams y lo registra donde corresponde.','Crítica','Evidencia',2),
('P07','H2','Teams','Programa reuniones recurrentes conforme al horario oficial del período.','Crítica','Demostración',2),
('P08','H2','Teams','Configura las grabaciones para que sean accesibles a los estudiantes conforme a los lineamientos institucionales.','Crítica','Demostración',2),
('P09','H2','Telegram','Crea el grupo oficial de Telegram de la asignatura.','Crítica','Demostración',2),
('P10','H2','Telegram','Nombra el grupo de Telegram conforme al estándar institucional de nomenclatura.','Importante','Evidencia',1),
('P11','H2','SISACAD','Registra en SISACAD el código de Teams y el enlace oficial del grupo de Telegram.','Crítica','Evidencia',2),
('P12','H2','EVA','Publica el PEA firmado en el aula virtual.','Crítica','Evidencia',2),
('P13','H2','EVA','Publica la hoja de vida docente en formato institucional, sin números telefónicos personales; incorpora únicamente el QR del canal de Telegram establecido para la comunicación académica.','Crítica','Evidencia EVA',2),
('P14','H2','EVA','Publica el glosario de la asignatura con un mínimo de 20 términos o palabras clave pertinentes al contenido de la asignatura.','Importante','Evidencia EVA',1),
('P15','H2','EVA','Publica el libro o guía de la asignatura cuando corresponda.','Importante','Evidencia',1),
('P16','H2','EVA','Publica la guía de formación práctica en el entorno académico cuando corresponda.','Importante','Evidencia',1),
('P17','H2','EVA','Publica los recursos iniciales y presentaciones de clase conforme al estándar institucional.','Crítica','Observación',2),
('P18','H2','EVA','Configura el libro de calificaciones de acuerdo con las ponderaciones y rúbricas establecidas en el PEA.','Crítica','Demostración',2),
('P19','H2','EVA','Parametriza cada actividad evaluada conforme a las fechas definidas en el PEA.','Crítica','Demostración',2),
('P20','H2','EVA','Conoce y utiliza el formato institucional para cargar evidencias académicas, incorporando la fotografía correspondiente y una descripción clara de la actividad o evidencia presentada.','Crítica','Producto / evidencia EVA',2),
('D00','H3','Teams','Inicia la grabación de la sesión aproximadamente dos minutos antes del inicio formal de la clase y antes del registro de asistencia, verificando que la grabación haya comenzado correctamente.','Crítica','Grabación / observación',2),
('D01','H3','SISACAD','Registra oportunamente la asistencia de los estudiantes.','Crítica','Evidencia',2),
('D02','H3','SISACAD','Registra la microcurrícula o planificación de actividades conforme al cronograma institucional.','Crítica','Evidencia',2),
('D03','H3','EVA','Mantiene organizada el aula virtual por unidades o semanas, de acuerdo con el PEA.','Crítica','Observación',2),
('D04','H3','EVA','Publica oportunamente los recursos de cada sesión, incluidas las presentaciones conforme al estándar institucional.','Crítica','Evidencia',2),
('D05','H3','EVA','Publica actividades de aprendizaje con tema, descripción e instrucciones claras.','Crítica','Evidencia',2),
('D06','H3','Teams','Desarrolla las sesiones sincrónicas desde el equipo y las reuniones institucionales programadas.','Crítica','Observación',2),
('D07','H3','Teams','Gestiona la participación, el chat, la pantalla compartida y los recursos durante la clase.','Importante','Observación',1),
('D08','H3','Teams','Genera las grabaciones de las sesiones cuando corresponde y verifica su correcta disponibilidad.','Crítica','Evidencia',2),
('D09','H3','EVA','Publica en cada sesión las grabaciones generadas en Teams, cuando corresponde.','Crítica','Evidencia',2),
('D10','H3','Telegram','Utiliza el grupo de Telegram para comunicar novedades, recordatorios y actividades académicas.','Importante','Observación',1),
('D11','H3','Telegram','Atiende oportunamente las solicitudes y consultas de los estudiantes realizadas por Telegram.','Importante','Seguimiento',1),
('D12','H3','Docencia','Gestiona la clase con puntualidad, claridad, participación y uso adecuado del tiempo.','Crítica','Observación',2),
('D13','H3','EVA','Carga las evidencias académicas utilizando el formato institucional, incluyendo fotografía y una descripción suficiente, clara y coherente de la actividad realizada.','Crítica','Evidencia EVA',2),
('S101','H4','EVA','Califica oportunamente las actividades de aprendizaje conforme al cronograma y a los plazos institucionales.','Crítica','Evidencia',2),
('S102','H4','EVA','Utiliza las rúbricas establecidas para evaluar las actividades correspondientes.','Crítica','Evidencia',2),
('S103','H4','EVA','Retroalimenta las actividades de forma clara, pertinente y oportuna.','Crítica','Observación',2),
('S104','H4','SISACAD','Importa correctamente las calificaciones al sistema.','Crítica','Demostración',2),
('S105','H4','SISACAD','Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.','Crítica','Caso práctico',2),
('S106','H4','SISACAD','Gestiona las solicitudes de exámenes supletorios conforme al procedimiento institucional.','Crítica','Caso práctico',2),
('S107','H4','SISACAD','Registra y documenta las tutorías académicas realizadas.','Crítica','Evidencia',2),
('S108','H4','Tutorías','Identifica estudiantes que requieren acompañamiento y ejecuta acciones de seguimiento.','Importante','Evidencia',1),
('S109','H4','EVA','Publica los informes de proyecto y demás evidencias por unidad, cuando corresponda, utilizando el formato institucional con fotografía y descripción de la evidencia.','Importante','Evidencia',1),
('S110','H4','Biblioteca','Utiliza la biblioteca virtual/eLibro como recurso de apoyo académico conforme a los lineamientos institucionales.','Deseable','Evidencia',0.5),
('S111','H4','Teams','Mantiene disponibles las grabaciones y recursos requeridos para el seguimiento del estudiante.','Importante','Evidencia',1),
('S112','H4','Telegram','Mantiene comunicación académica profesional y respetuosa con los estudiantes.','Importante','Observación',1),
('S201','H5','SISACAD','Mantiene actualizado el registro de asistencia, microcurrícula, tutorías y calificaciones.','Crítica','Evidencia',2),
('S202','H5','EVA','Mantiene actualizado el libro de calificaciones y verifica su coherencia con el PEA.','Crítica','Demostración',2),
('S203','H5','EVA','Mantiene actualizados los recursos, actividades y grabaciones del aula virtual.','Crítica','Observación',2),
('S204','H5','Evaluación','Aplica los instrumentos y rúbricas conforme a los criterios establecidos en el PEA.','Crítica','Revisión',2),
('S205','H5','Evaluación','Comunica y publica calificaciones dentro de los plazos institucionales.','Crítica','Evidencia',2),
('S206','H5','Tutorías','Da seguimiento a estudiantes con bajo rendimiento o alertas académicas.','Crítica','Evidencia',2),
('S207','H5','Adaptaciones','Ejecuta las adaptaciones curriculares planificadas cuando corresponde.','Crítica','Evidencia',2),
('S208','H5','Teams','Gestiona de forma autónoma las sesiones, grabaciones y recursos sincrónicos.','Importante','Observación',1),
('S209','H5','Telegram','Gestiona de forma autónoma la comunicación académica y las solicitudes estudiantiles.','Importante','Seguimiento',1),
('S210','H5','Institucional','Atiende oportunamente observaciones del Coordinador y evidencia mejora respecto del seguimiento anterior.','Crítica','Seguimiento',2),
('C01','H6','SISACAD','Verifica que las calificaciones finales estén completas y coherentes antes del cierre.','Crítica','Evidencia',2),
('C02','H6','SISACAD','Completa los registros pendientes y realiza el cierre académico conforme al cronograma institucional.','Crítica','Evidencia',2),
('C03','H6','Adaptaciones','Elabora correctamente el informe de adaptaciones curriculares cuando corresponde, incorpora las evidencias requeridas y redacta conclusiones y recomendaciones claras, pertinentes y coherentes con los resultados.','Crítica','Informe + evidencias',2),
('C04','H6','Tutorías','Elabora correctamente el informe final de tutorías, incorpora las evidencias de seguimiento realizadas y formula conclusiones y recomendaciones técnicamente pertinentes.','Crítica','Informe + evidencias',2),
('C05','H6','SISACAD','Elabora correctamente el informe de fin de asignatura, sustenta los resultados con evidencias y redacta conclusiones y recomendaciones claras, coherentes y orientadas a la mejora.','Crítica','Informe + evidencias',2),
('C06','H6','Informes','Redacta los informes institucionales con claridad, coherencia, precisión y lenguaje profesional; las conclusiones se sustentan en los resultados y las recomendaciones son viables, específicas y relacionadas con los hallazgos.','Crítica','Revisión documental',2),
('C07','H6','EVA','Verifica que el aula virtual contenga el PEA, recursos, actividades, calificaciones, grabaciones y evidencias requeridas.','Crítica','Auditoría',2),
('C08','H6','EVA','Verifica que las evidencias académicas cargadas durante el período utilicen el formato institucional, incluyan fotografía y descripción, y se encuentren completas y correctamente identificadas.','Crítica','Auditoría EVA',2),
('C09','H6','EVA','Realiza el cierre del aula virtual conforme a los lineamientos institucionales.','Importante','Evidencia',1),
('C10','H6','Teams','Verifica la disponibilidad, integridad y correcta identificación de las grabaciones y recursos requeridos para el cierre.','Importante','Evidencia',1),
('C11','H6','Institucional','Entrega oportunamente los informes y evidencias solicitados por la Coordinación.','Crítica','Evidencia',2),
('C12','H6','Institucional','Participa en la evaluación final del acompañamiento, revisa los resultados obtenidos y acuerda acciones de mejora cuando corresponda.','Importante','Entrevista',1)
on conflict (id) do update
set hito_id = excluded.hito_id,
    process = excluded.process,
    observable_competency = excluded.observable_competency,
    criticality = excluded.criticality,
    expected_evidence = excluded.expected_evidence,
    relative_weight = excluded.relative_weight,
    active = true;

-- Garantiza que expedientes ya existentes tengan sus seis hitos.
insert into public.hito_schedules(expedient_id, hito_id)
select e.id, h.id
from public.expedients e
cross join public.hito_definitions h
where h.id in ('H1','H2','H3','H4','H5','H6')
on conflict (expedient_id, hito_id) do nothing;
