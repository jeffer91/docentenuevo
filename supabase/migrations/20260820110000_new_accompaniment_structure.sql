-- SIACD · Nueva organización institucional del acompañamiento docente
-- Fuente funcional: organización(2).xlsx
-- Estructura: Áreas -> Antes -> Durante -> Después -> Informes.
-- Se conservan H1-H6 como claves técnicas para no romper expedientes históricos.

alter table public.hito_definitions
  drop constraint if exists hito_definitions_phase_check;

alter table public.hito_definitions
  add constraint hito_definitions_phase_check
  check (phase is null or phase in ('areas','before','during','after'));

update public.hito_definitions
set phase = case
  when id = 'H1' then 'areas'
  when id = 'H2' then 'before'
  when id in ('H3','H4','H5') then 'during'
  when id = 'H6' then 'after'
  else phase
end,
title = case
  when id = 'H1' then 'Inducción por áreas'
  when id = 'H2' then 'Preparación antes de la docencia'
  when id = 'H3' then 'Seguimiento durante la docencia'
  when id = 'H4' then 'Seguimiento por unidades 1 y 2'
  when id = 'H5' then 'Seguimiento por unidades 3 y 4 y observación de clase'
  when id = 'H6' then 'Cierre después de la docencia'
  else title
end,
moment = case
  when id = 'H1' then 'Áreas'
  when id = 'H2' then 'Antes'
  when id in ('H3','H4','H5') then 'Durante'
  when id = 'H6' then 'Después'
  else moment
end
where id in ('H1','H2','H3','H4','H5','H6');

comment on column public.hito_definitions.phase is
  'Organización funcional: areas=inducción institucional; before=preparación; during=seguimiento; after=cierre.';

-- El catálogo anterior queda disponible para trazabilidad, pero deja de participar
-- en expedientes nuevos y en el cálculo operativo visible.
update public.competency_definitions
set active = false
where active = true;

insert into public.competency_definitions
  (id, hito_id, process, observable_competency, criticality, expected_evidence, relative_weight, active)
values
('AR-TAL-01','H1','Talento','Conoce el procedimiento institucional de retención y continuidad del personal docente.','Importante','Registro de inducción',1,true),
('AR-TAL-02','H1','Talento','Conoce la modalidad y las condiciones generales de su contratación.','Crítica','Registro de inducción / contrato',1,true),
('AR-TAL-03','H1','Talento','Conoce la estructura de remuneración y las condiciones de pago que le corresponden.','Importante','Registro de inducción',1,true),
('AR-TAL-04','H1','Talento','Completa la firma del contrato y la documentación requerida por Talento Humano.','Crítica','Contrato / registro institucional',1,true),
('AR-SOF-01','H1','Software','Accede al SISACAD con sus credenciales institucionales.','Crítica','Demostración de acceso',1,true),
('AR-SOF-02','H1','Software','Conoce el procedimiento de registro y uso de la firma electrónica institucional.','Crítica','Demostración / registro',1,true),
('AR-SOF-03','H1','Software','Verifica que sus títulos profesionales y datos académicos requeridos se encuentren registrados correctamente.','Importante','Registro institucional',1,true),
('AR-SOF-04','H1','Software','Conoce y completa el acuerdo institucional de cesión de derechos cuando corresponde.','Importante','Documento firmado',1,true),
('AR-SOF-05','H1','Software','Accede al EVA (Moodle) con sus credenciales institucionales.','Crítica','Demostración de acceso',1,true),
('AR-SOF-06','H1','Software','Accede a Microsoft Teams con su cuenta institucional.','Crítica','Demostración de acceso',1,true),
('AR-SOF-07','H1','Software','Conoce el estándar institucional para la creación, nomenclatura y uso del grupo de Telegram.','Importante','Inducción / demostración',1,true),
('AR-CAL-01','H1','Calidad','Conoce los criterios institucionales que serán observados durante el acompañamiento y la evaluación de la docencia.','Crítica','Registro de inducción',1,true),
('AR-CAL-02','H1','Calidad','Conoce el estándar de calidad que debe cumplir el grupo oficial de Telegram de la asignatura.','Importante','Registro de inducción',1,true),
('AR-CAL-03','H1','Calidad','Conoce el estándar de calidad para la configuración y uso de Microsoft Teams en la asignatura.','Importante','Registro de inducción',1,true),
('AR-BIE-01','H1','Bienestar Estudiantil','Conoce el procedimiento institucional para identificar, planificar, aplicar y reportar adaptaciones curriculares.','Crítica','Registro de inducción / lineamiento institucional',1,true),
('AN-COO-01','H2','Coordinador','Conoce el calendario académico, los canales oficiales de comunicación y los plazos que afectan su gestión docente.','Crítica','Entrevista / cronograma',1,true),
('AN-COO-02','H2','Coordinador','Consulta y verifica su carga académica, horario, paralelos y estudiantes asignados.','Crítica','SISACAD / carga académica',1,true),
('AN-COO-03','H2','Coordinador','Verifica los horarios oficiales de entrada y salida correspondientes a su asignatura.','Crítica','Horario institucional',1,true),
('AN-COO-04','H2','Coordinador','Conoce y verifica el procedimiento de registro de timbrado en SISACAD.','Importante','SISACAD',1,true),
('AN-TEA-01','H2','Teams','Activa el equipo de Microsoft Teams correspondiente a la asignatura.','Crítica','Demostración',1,true),
('AN-TEA-02','H2','Teams','Genera el código del equipo de Teams y lo registra en el sistema institucional donde corresponde.','Crítica','Código / SISACAD',1,true),
('AN-TEA-03','H2','Teams','Programa reuniones recurrentes conforme al horario oficial del período.','Crítica','Configuración de Teams',1,true),
('AN-TEA-04','H2','Teams','Registra correctamente en SISACAD el código de Teams y el enlace oficial del grupo de Telegram.','Crítica','SISACAD',1,true),
('AN-TEA-05','H2','Teams','Configura correctamente los permisos y la visibilidad del equipo de Teams de acuerdo con los lineamientos institucionales.','Importante','Configuración de Teams',1,true),
('AN-TEL-01','H2','Telegram','Crea el grupo oficial de Telegram de la asignatura y lo nombra conforme al formato institucional.','Crítica','Grupo de Telegram',1,true),
('AN-PEA-01','H2','PEA','Elabora y registra el PEA conforme al formato y lineamientos institucionales.','Crítica','PEA',1,true),
('AN-PEA-02','H2','PEA','Publica el PEA firmado en el aula virtual.','Crítica','EVA / PEA firmado',1,true),
('AN-PEA-03','H2','PEA','Verifica que la ejecución planificada y los registros del PEA sean coherentes con el calendario y la asignatura.','Importante','PEA / cronograma',1,true),
('AN-ADA-01','H2','Adaptaciones','Genera y carga la planificación de adaptaciones curriculares cuando corresponde.','Crítica','Plan de adaptación curricular',1,true),
('AN-EVA-01','H2','EVA','Publica la hoja de vida docente en formato institucional, sin números telefónicos personales e incorporando únicamente el QR del canal institucional definido.','Crítica','EVA / hoja de vida',1,true),
('AN-EVA-02','H2','EVA','Publica el glosario de la asignatura con un mínimo de 20 términos o palabras clave pertinentes.','Importante','EVA / glosario',1,true),
('AN-EVA-03','H2','EVA','Publica el libro de la asignatura cuando corresponde.','Importante','EVA / libro',1,true),
('AN-EVA-04','H2','EVA','Publica la guía de formación práctica en el entorno académico cuando corresponde.','Importante','EVA / guía práctica',1,true),
('AN-EVA-05','H2','EVA','Publica los recursos didácticos conforme al estándar institucional.','Crítica','EVA / recursos',1,true),
('AN-EVA-06','H2','EVA','Publica las presentaciones de clase conforme al estándar institucional.','Crítica','EVA / presentaciones',1,true),
('AN-EVA-07','H2','EVA','Organiza y configura los títulos o secciones del aula virtual por día o sesión, según la planificación.','Importante','EVA',1,true),
('AN-EVA-08','H2','EVA','Publica las actividades académicas requeridas con instrucciones, fechas y recursos completos.','Crítica','EVA / actividades',1,true),
('AN-EVA-09','H2','EVA','Carga en el aula virtual los enlaces oficiales del equipo de Teams y del grupo de Telegram.','Importante','EVA',1,true),
('AN-EVA-10','H2','EVA','Carga y configura las preguntas de las evaluaciones en el aula virtual conforme al PEA.','Crítica','EVA / banco de preguntas',1,true),
('AN-SIS-01','H2','SISACAD','Registra correctamente las plataformas y enlaces institucionales requeridos para la asignatura.','Crítica','SISACAD',1,true),
('AN-SIS-02','H2','SISACAD','Verifica que el PEA se encuentre registrado y disponible para su impresión o validación cuando corresponde.','Importante','SISACAD / PEA',1,true),
('AN-SIS-03','H2','SISACAD','Verifica que el horario registrado en SISACAD coincida con el horario oficial asignado.','Crítica','SISACAD / horario',1,true),
('AN-SIS-04','H2','SISACAD','Verifica que el plan de adaptación curricular, cuando corresponde, se encuentre correctamente generado y registrado.','Importante','SISACAD / adaptación',1,true),
('DU-GEN-01','H3','General','Identifica y aplica los procedimientos esenciales de evaluación, tutorías y adaptaciones curriculares durante la asignatura.','Crítica','Seguimiento / evidencia',1,true),
('DU-GEN-02','H3','General','Configura las grabaciones para que sean accesibles a los estudiantes conforme a los lineamientos institucionales.','Crítica','Teams / EVA',1,true),
('DU-GEN-03','H3','General','Inicia la grabación de la sesión antes del registro de asistencia y verifica que la grabación haya comenzado correctamente.','Crítica','Grabación de Teams',1,true),
('DU-GEN-04','H3','General','Registra la asistencia al iniciar la clase sin exponer datos personales de los estudiantes.','Crítica','SISACAD / observación',1,true),
('DU-GEN-05','H3','General','Comparte pantalla en Teams de forma adecuada cuando la dinámica de clase lo requiere y mantiene visibles los recursos necesarios para el seguimiento.','Importante','Observación de clase',1,true),
('DU-GEN-06','H3','General','Mantiene la cámara encendida durante la sesión cuando la modalidad y los lineamientos institucionales así lo requieren.','Importante','Observación de clase',1,true),
('DU-GEN-07','H3','General','Utiliza el fondo institucional en las modalidades o jornadas en las que sea obligatorio.','Importante','Observación de clase',1,true),
('DU-GEN-08','H3','General','Promueve el uso de cámara por parte de los estudiantes de acuerdo con la modalidad y las reglas institucionales vigentes.','Importante','Observación de clase',1,true),
('DU-GEN-09','H3','General','Registra la microcurrícula o microplanificación conforme al cronograma institucional.','Crítica','SISACAD / microcurrícula',1,true),
('DU-GEN-10','H3','General','Desarrolla actividades de clase alineadas con el PEA y con el objetivo de aprendizaje previsto.','Crítica','PEA / observación',1,true),
('DU-ADA-01','H3','Adaptaciones','Aplica las excepciones y adaptaciones curriculares de acuerdo con la planificación aprobada, cuando corresponde.','Crítica','Plan de adaptación / evidencia',1,true),
('DU-PRE-01','H3','Presentaciones','Utiliza el formato institucional de presentaciones y cumple la rúbrica de calidad establecida.','Crítica','Presentación / rúbrica',1,true),
('DU-PRE-02','H3','Presentaciones','Incluye al menos 15 diapositivas de contenido académico neto cuando el tipo de sesión y el tema lo permiten.','Importante','Presentación',1,true),
('DU-PRE-03','H3','Presentaciones','Publica la presentación en formato accesible y conserva también una versión PDF cuando corresponde.','Importante','EVA / presentación',1,true),
('DU-U1-01','H4','Unidad 1','Configura en EVA la rúbrica correcta de la actividad y parametriza la actividad conforme al PEA.','Crítica','EVA',1,true),
('DU-U1-02','H4','Unidad 1','Importa correctamente las calificaciones de la unidad en SISACAD.','Crítica','SISACAD',1,true),
('DU-U1-03','H4','Unidad 1','Parametriza cada actividad evaluada conforme a las fechas definidas en el PEA.','Crítica','EVA / PEA',1,true),
('DU-U1-04','H4','Unidad 1','Conserva y carga las evidencias de las actividades necesarias para los informes institucionales.','Importante','Evidencias',1,true),
('DU-U1-05','H4','Unidad 1','Conserva y carga las evidencias de las tutorías realizadas cuando corresponde.','Importante','Evidencias de tutoría',1,true),
('DU-U1-06','H4','Unidad 1','Mantiene actualizado el informe o registro de tutorías cuando corresponde.','Importante','Informe de tutorías',1,true),
('DU-U1-07','H4','Unidad 1','Carga y mantiene disponibles los enlaces de las grabaciones de clase.','Crítica','Teams / EVA',1,true),
('DU-U1-08','H4','Unidad 1','Registra oportunamente la microcurrícula de las clases correspondientes a la unidad.','Crítica','SISACAD',1,true),
('DU-U1-09','H4','Unidad 1','Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.','Importante','SISACAD / solicitud',1,true),
('DU-U1-10','H4','Unidad 1','Verifica que las calificaciones, evidencias, grabaciones y registros de la unidad estén completos antes de avanzar a la siguiente unidad.','Crítica','Revisión de unidad',1,true),
('DU-U2-01','H4','Unidad 2','Configura en EVA la rúbrica correcta de la actividad y parametriza la actividad conforme al PEA.','Crítica','EVA',1,true),
('DU-U2-02','H4','Unidad 2','Importa correctamente las calificaciones de la unidad en SISACAD.','Crítica','SISACAD',1,true),
('DU-U2-03','H4','Unidad 2','Parametriza cada actividad evaluada conforme a las fechas definidas en el PEA.','Crítica','EVA / PEA',1,true),
('DU-U2-04','H4','Unidad 2','Conserva y carga las evidencias de las actividades necesarias para los informes institucionales.','Importante','Evidencias',1,true),
('DU-U2-05','H4','Unidad 2','Conserva y carga las evidencias de las tutorías realizadas cuando corresponde.','Importante','Evidencias de tutoría',1,true),
('DU-U2-06','H4','Unidad 2','Mantiene actualizado el informe o registro de tutorías cuando corresponde.','Importante','Informe de tutorías',1,true),
('DU-U2-07','H4','Unidad 2','Carga y mantiene disponibles los enlaces de las grabaciones de clase.','Crítica','Teams / EVA',1,true),
('DU-U2-08','H4','Unidad 2','Registra oportunamente la microcurrícula de las clases correspondientes a la unidad.','Crítica','SISACAD',1,true),
('DU-U2-09','H4','Unidad 2','Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.','Importante','SISACAD / solicitud',1,true),
('DU-U2-10','H4','Unidad 2','Verifica que las calificaciones, evidencias, grabaciones y registros de la unidad estén completos antes de avanzar a la siguiente unidad.','Crítica','Revisión de unidad',1,true),
('DU-U3-01','H5','Unidad 3','Configura en EVA la rúbrica correcta de la actividad y parametriza la actividad conforme al PEA.','Crítica','EVA',1,true),
('DU-U3-02','H5','Unidad 3','Importa correctamente las calificaciones de la unidad en SISACAD.','Crítica','SISACAD',1,true),
('DU-U3-03','H5','Unidad 3','Parametriza cada actividad evaluada conforme a las fechas definidas en el PEA.','Crítica','EVA / PEA',1,true),
('DU-U3-04','H5','Unidad 3','Conserva y carga las evidencias de las actividades necesarias para los informes institucionales.','Importante','Evidencias',1,true),
('DU-U3-05','H5','Unidad 3','Conserva y carga las evidencias de las tutorías realizadas cuando corresponde.','Importante','Evidencias de tutoría',1,true),
('DU-U3-06','H5','Unidad 3','Mantiene actualizado el informe o registro de tutorías cuando corresponde.','Importante','Informe de tutorías',1,true),
('DU-U3-07','H5','Unidad 3','Carga y mantiene disponibles los enlaces de las grabaciones de clase.','Crítica','Teams / EVA',1,true),
('DU-U3-08','H5','Unidad 3','Registra oportunamente la microcurrícula de las clases correspondientes a la unidad.','Crítica','SISACAD',1,true),
('DU-U3-09','H5','Unidad 3','Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.','Importante','SISACAD / solicitud',1,true),
('DU-U3-10','H5','Unidad 3','Verifica que las calificaciones, evidencias, grabaciones y registros de la unidad estén completos antes de avanzar a la siguiente unidad.','Crítica','Revisión de unidad',1,true),
('DU-U4-01','H5','Unidad 4','Configura en EVA la rúbrica correcta de la actividad y parametriza la actividad conforme al PEA.','Crítica','EVA',1,true),
('DU-U4-02','H5','Unidad 4','Importa correctamente las calificaciones de la unidad en SISACAD.','Crítica','SISACAD',1,true),
('DU-U4-03','H5','Unidad 4','Parametriza cada actividad evaluada conforme a las fechas definidas en el PEA.','Crítica','EVA / PEA',1,true),
('DU-U4-04','H5','Unidad 4','Conserva y carga las evidencias de las actividades necesarias para los informes institucionales.','Importante','Evidencias',1,true),
('DU-U4-05','H5','Unidad 4','Conserva y carga las evidencias de las tutorías realizadas cuando corresponde.','Importante','Evidencias de tutoría',1,true),
('DU-U4-06','H5','Unidad 4','Mantiene actualizado el informe o registro de tutorías cuando corresponde.','Importante','Informe de tutorías',1,true),
('DU-U4-07','H5','Unidad 4','Carga y mantiene disponibles los enlaces de las grabaciones de clase.','Crítica','Teams / EVA',1,true),
('DU-U4-08','H5','Unidad 4','Registra oportunamente la microcurrícula de las clases correspondientes a la unidad.','Crítica','SISACAD',1,true),
('DU-U4-09','H5','Unidad 4','Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.','Importante','SISACAD / solicitud',1,true),
('DU-U4-10','H5','Unidad 4','Verifica que las calificaciones, evidencias, grabaciones y registros de la unidad estén completos para el cierre académico.','Crítica','Revisión de unidad',1,true),
('DU-OBS-01','H5','Observación de clase','Registra y verifica la asistencia utilizando nombre y apellido de los estudiantes conforme al procedimiento institucional.','Importante','Observación / SISACAD',1,true),
('DU-OBS-02','H5','Observación de clase','Comunica el objetivo de la clase al inicio y lo vincula con el contenido que se desarrollará.','Crítica','Observación de clase',1,true),
('DU-OBS-03','H5','Observación de clase','Asiste puntualmente a la clase y comienza la sesión dentro del horario oficial.','Crítica','Observación / horario',1,true),
('DU-OBS-04','H5','Observación de clase','Cumple la duración de la sesión establecida en el horario oficial, respetando pausas o distribuciones autorizadas.','Crítica','Observación / horario',1,true),
('DU-OBS-05','H5','Observación de clase','Mantiene la cámara encendida de acuerdo con la modalidad y promueve la participación visual cuando corresponde.','Importante','Observación de clase',1,true),
('DU-OBS-06','H5','Observación de clase','Utiliza el fondo institucional en las jornadas o modalidades en las que es obligatorio.','Importante','Observación de clase',1,true),
('DU-OBS-07','H5','Observación de clase','Promueve la participación y mantiene un ambiente de respeto durante toda la sesión.','Crítica','Observación de clase',1,true),
('DU-OBS-08','H5','Observación de clase','Utiliza TIC educativas, actividades interactivas o gamificación cuando aportan al objetivo de aprendizaje.','Importante','Observación / recursos TIC',1,true),
('DU-OBS-09','H5','Observación de clase','Genera reflexión mediante su experiencia profesional, libros, artículos u otras fuentes académicas pertinentes.','Importante','Observación de clase',1,true),
('DU-OBS-10','H5','Observación de clase','Realiza una actividad diagnóstica cuando el contenido o el momento del aprendizaje lo requiere.','Importante','Actividad diagnóstica',1,true),
('DU-OBS-11','H5','Observación de clase','Formula preguntas dirigidas utilizando el nombre del estudiante y promueve una participación distribuida.','Importante','Observación de clase',1,true),
('DU-OBS-12','H5','Observación de clase','Responde técnicamente y con claridad las consultas formuladas durante la clase.','Crítica','Observación de clase',1,true),
('DU-OBS-13','H5','Observación de clase','Entrega oportunamente la documentación e informes de calidad requeridos y debidamente firmados.','Importante','Documentación institucional',1,true),
('DU-OBS-14','H5','Observación de clase','Utiliza recursos de biblioteca o fuentes académicas y genera análisis o retroalimentación sobre ellos.','Importante','Biblioteca / referencias',1,true),
('DU-OBS-15','H5','Observación de clase','Organiza adecuadamente el tiempo de clase entre inicio, desarrollo, actividades, retroalimentación y cierre.','Crítica','Observación de clase',1,true),
('DU-OBS-16','H5','Observación de clase','Utiliza el libro de la asignatura y la guía práctica cuando corresponde al tema y a la planificación.','Importante','Libro / guía práctica',1,true),
('DU-OBS-17','H5','Observación de clase','Brinda retroalimentación de manera continua en el inicio, desarrollo y cierre de la clase.','Crítica','Observación de clase',1,true),
('DU-OBS-18','H5','Observación de clase','Demuestra dominio técnico suficiente de la materia y emplea terminología profesional adecuada.','Crítica','Observación de clase',1,true),
('DU-OBS-19','H5','Observación de clase','Utiliza contenidos, ejemplos y recursos audiovisuales directamente relacionados con el tema de la sesión.','Importante','Recursos de clase',1,true),
('DU-OBS-20','H5','Observación de clase','Desarrolla los contenidos y actividades planificados en el PEA para la sesión observada.','Crítica','PEA / observación',1,true),
('DU-OBS-21','H5','Observación de clase','Mantiene una calificación oportuna de las actividades académicas conforme a los plazos institucionales.','Crítica','EVA / SISACAD',1,true),
('DU-OBS-22','H5','Observación de clase','Conduce la clase de forma dinámica y mantiene la atención y participación de los estudiantes.','Importante','Observación de clase',1,true),
('DU-OBS-23','H5','Observación de clase','Cumple el indicador de logro previsto para la sesión mediante actividades y evidencias coherentes con el objetivo.','Crítica','PEA / actividad / evidencia',1,true),
('DU-OBS-24','H5','Observación de clase','Relaciona explícitamente el objetivo de aprendizaje con los contenidos abordados en la clase.','Crítica','Observación de clase',1,true),
('DU-OBS-25','H5','Observación de clase','Mantiene actualizada la microcurrícula o microplanificación correspondiente a cada día de clase.','Crítica','SISACAD',1,true),
('DU-OBS-26','H5','Observación de clase','Aplica y, cuando corresponde, comunica las adaptaciones curriculares previstas para la sesión.','Crítica','Adaptación / observación',1,true),
('DU-OBS-27','H5','Observación de clase','Diferencia y organiza adecuadamente los espacios, recursos y actividades de la clase y del aula virtual.','Importante','Observación / EVA',1,true),
('DU-OBS-28','H5','Observación de clase','Cierra la sesión retomando el objetivo, verificando comprensión y dejando claras las actividades o compromisos siguientes.','Importante','Observación de clase',1,true),
('DE-CIE-01','H6','Cierre','Gestiona y ejecuta los exámenes supletorios conforme al cronograma institucional, cuando corresponde.','Crítica','SISACAD / evaluación',1,true),
('DE-CIE-02','H6','Cierre','Elabora y entrega el informe de fin de asignatura con resultados, evidencias, conclusiones y recomendaciones.','Crítica','Informe de fin de asignatura',1,true),
('DE-CIE-03','H6','Cierre','Elabora y entrega el informe de adaptaciones curriculares cuando corresponde.','Crítica','Informe de adaptaciones',1,true),
('DE-CIE-04','H6','Cierre','Elabora y entrega el informe de tutorías cuando corresponde a la jornada o modalidad.','Crítica','Informe de tutorías',1,true)
on conflict (id) do update
set hito_id = excluded.hito_id,
    process = excluded.process,
    observable_competency = excluded.observable_competency,
    criticality = excluded.criticality,
    expected_evidence = excluded.expected_evidence,
    relative_weight = excluded.relative_weight,
    active = true;

insert into public.hito_schedules(expedient_id, hito_id)
select e.id, h.id
from public.expedients e
cross join public.hito_definitions h
where h.id in ('H1','H2','H3','H4','H5','H6')
on conflict (expedient_id, hito_id) do nothing;
