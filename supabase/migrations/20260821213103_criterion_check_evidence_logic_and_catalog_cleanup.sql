-- SIACD · Criterios CHECK vs EVIDENCIA y depuración del catálogo
-- Conserva el histórico: los criterios sustituidos se desactivan, no se eliminan.

alter table public.competency_definitions
  add column if not exists criterion_mode text not null default 'check';

alter table public.competency_definitions
  drop constraint if exists competency_definitions_criterion_mode_check;
alter table public.competency_definitions
  add constraint competency_definitions_criterion_mode_check
  check (criterion_mode in ('check','evidence'));

drop trigger if exists competency_seed_default_criterion_evidence on public.competency_definitions;

-- ÁREAS
update public.competency_definitions
set active = false
where id in ('AR-TAL-03','AR-SOF-05','AR-SOF-07','AR-CAL-03');

update public.competency_definitions set observable_competency = 'Conoce su remuneración, las condiciones de pago y el porcentaje y concepto de las retenciones aplicadas.', expected_evidence = 'Inducción de Talento Humano / información de remuneración', criterion_mode = 'check' where id = 'AR-TAL-01';
update public.competency_definitions set observable_competency = 'Conoce la modalidad y las condiciones de su contratación.', expected_evidence = 'Contrato / información de Talento Humano', criterion_mode = 'check' where id = 'AR-TAL-02';
update public.competency_definitions set observable_competency = 'Ha completado la firma de su contrato y la documentación requerida.', expected_evidence = 'Contrato y documentación requerida', criterion_mode = 'evidence' where id = 'AR-TAL-04';
update public.competency_definitions set observable_competency = 'Ingresa correctamente a SISACAD y al EVA con sus credenciales institucionales.', expected_evidence = 'Demostración de acceso a SISACAD y EVA', criterion_mode = 'evidence' where id = 'AR-SOF-01';
update public.competency_definitions set observable_competency = 'Carga y mantiene registrada su firma electrónica vigente en SISACAD.', expected_evidence = 'Verificación directa en SISACAD', criterion_mode = 'check' where id = 'AR-SOF-02';
update public.competency_definitions set observable_competency = 'Verifica que sus títulos profesionales estén registrados correctamente.', expected_evidence = 'Verificación en el registro institucional', criterion_mode = 'check' where id = 'AR-SOF-03';
update public.competency_definitions set observable_competency = 'Completa y firma el acuerdo institucional de cesión de derechos cuando corresponde.', expected_evidence = 'Acuerdo institucional de cesión de derechos firmado', criterion_mode = 'evidence' where id = 'AR-SOF-04';
update public.competency_definitions set observable_competency = 'Ingresa correctamente a Microsoft Teams con su cuenta institucional.', expected_evidence = 'Demostración de acceso a Microsoft Teams', criterion_mode = 'evidence' where id = 'AR-SOF-06';
update public.competency_definitions set observable_competency = 'Conoce los criterios institucionales de calidad que serán observados durante el acompañamiento docente.', expected_evidence = 'Verificación directa durante la inducción', criterion_mode = 'check' where id = 'AR-CAL-01';
update public.competency_definitions set observable_competency = 'Crea, nombra y configura el grupo oficial de Telegram conforme a los lineamientos institucionales.', expected_evidence = 'Verificación directa del grupo oficial de Telegram', criterion_mode = 'check' where id = 'AR-CAL-02';
update public.competency_definitions set observable_competency = 'Conoce el procedimiento para identificar, planificar y aplicar adaptaciones curriculares.', expected_evidence = 'Verificación directa durante la inducción', criterion_mode = 'check' where id = 'AR-BIE-01';

-- ANTES
update public.competency_definitions
set active = false
where id in ('AN-COO-03','AN-TEL-01','AN-PEA-02','AN-EVA-04','AN-SIS-01','AN-SIS-03','AN-SIS-04');

update public.competency_definitions set observable_competency = 'Conoce el calendario académico y los plazos que afectan su gestión docente.', expected_evidence = 'Verificación directa del calendario académico', criterion_mode = 'check' where id = 'AN-COO-01';

insert into public.competency_definitions(id,hito_id,process,observable_competency,criticality,expected_evidence,relative_weight,active,criterion_mode)
values ('AN-COO-05','H2','Coordinador','Conoce los canales oficiales de comunicación institucional y su uso.','Importante','Verificación directa durante la inducción',1,true,'check')
on conflict (id) do update set hito_id=excluded.hito_id, process=excluded.process, observable_competency=excluded.observable_competency, criticality=excluded.criticality, expected_evidence=excluded.expected_evidence, relative_weight=excluded.relative_weight, active=true, criterion_mode=excluded.criterion_mode;

update public.competency_definitions set observable_competency = 'Verifica en SISACAD su carga académica, horario oficial de entrada y salida, paralelos y estudiantes asignados.', expected_evidence = 'Captura o registro de SISACAD de carga académica y horario', criterion_mode = 'evidence' where id = 'AN-COO-02';
update public.competency_definitions set observable_competency = 'Realiza correctamente el registro de timbrado en SISACAD.', expected_evidence = 'Registro de timbrado en SISACAD', criterion_mode = 'evidence' where id = 'AN-COO-04';
update public.competency_definitions set observable_competency = 'Activa correctamente el equipo de Microsoft Teams de la asignatura.', expected_evidence = 'Verificación directa de Microsoft Teams', criterion_mode = 'check' where id = 'AN-TEA-01';
update public.competency_definitions set observable_competency = 'Genera el código del equipo de Microsoft Teams de la asignatura.', expected_evidence = 'Código del equipo de Microsoft Teams', criterion_mode = 'evidence' where id = 'AN-TEA-02';
update public.competency_definitions set observable_competency = 'Programa en Microsoft Teams las reuniones recurrentes conforme al horario oficial de la asignatura.', expected_evidence = 'Configuración de reuniones recurrentes en Microsoft Teams', criterion_mode = 'evidence' where id = 'AN-TEA-03';
update public.competency_definitions set observable_competency = 'Registra correctamente en SISACAD el código de Teams y el enlace del grupo oficial de Telegram.', expected_evidence = 'Registro en SISACAD del código de Teams y enlace de Telegram', criterion_mode = 'evidence' where id = 'AN-TEA-04';
update public.competency_definitions set observable_competency = 'Configura correctamente los permisos y la visibilidad del equipo de Microsoft Teams.', expected_evidence = 'Verificación directa de permisos y visibilidad en Microsoft Teams', criterion_mode = 'check' where id = 'AN-TEA-05';
update public.competency_definitions set observable_competency = 'Elabora y registra el PEA conforme al formato y lineamientos institucionales, y publica en el EVA la versión final y firmada.', expected_evidence = 'PEA final firmado y publicado en el EVA', criterion_mode = 'evidence' where id = 'AN-PEA-01';
update public.competency_definitions set observable_competency = 'Desarrolla los contenidos de cada clase conforme a la planificación y secuencia establecidas en el PEA.', expected_evidence = 'Verificación directa de coherencia con el PEA', criterion_mode = 'check' where id = 'AN-PEA-03';
update public.competency_definitions set observable_competency = 'Genera y carga el plan de adaptación curricular cuando corresponde.', expected_evidence = 'Plan de adaptación curricular', criterion_mode = 'evidence' where id = 'AN-ADA-01';
update public.competency_definitions set observable_competency = 'Publica en el EVA la hoja de vida docente en formato institucional, sin números telefónicos personales y con el QR del canal institucional de Telegram.', expected_evidence = 'Hoja de vida publicada en el EVA', criterion_mode = 'evidence' where id = 'AN-EVA-01';
update public.competency_definitions set observable_competency = 'Publica en el EVA un glosario con mínimo 20 términos relacionados con la asignatura.', expected_evidence = 'Verificación directa del glosario en el EVA', criterion_mode = 'check' where id = 'AN-EVA-02';
update public.competency_definitions set observable_competency = 'Publica en el EVA el libro de la asignatura y la guía de formación práctica, cuando corresponda.', expected_evidence = 'Libro y guía de formación práctica publicados en el EVA', criterion_mode = 'evidence' where id = 'AN-EVA-03';
update public.competency_definitions set observable_competency = 'Publica en el EVA los recursos didácticos requeridos conforme al estándar institucional.', expected_evidence = 'Verificación directa de recursos didácticos en el EVA', criterion_mode = 'check' where id = 'AN-EVA-05';
update public.competency_definitions set observable_competency = 'Publica en el EVA las presentaciones de clase requeridas para la asignatura.', expected_evidence = 'Verificación directa de presentaciones en el EVA', criterion_mode = 'check' where id = 'AN-EVA-06';
update public.competency_definitions set observable_competency = 'Organiza y configura las secciones del EVA conforme a la planificación de cada sesión.', expected_evidence = 'Verificación directa de la estructura del EVA', criterion_mode = 'check' where id = 'AN-EVA-07';
update public.competency_definitions set observable_competency = 'Publica en el EVA las actividades académicas con instrucciones, fechas y recursos necesarios.', expected_evidence = 'Verificación directa de actividades en el EVA', criterion_mode = 'check' where id = 'AN-EVA-08';
update public.competency_definitions set observable_competency = 'Publica en el EVA los enlaces oficiales del equipo de Teams y del grupo de Telegram.', expected_evidence = 'Enlaces oficiales publicados en el EVA', criterion_mode = 'evidence' where id = 'AN-EVA-09';
update public.competency_definitions set observable_competency = 'Carga y configura en el EVA las preguntas de las evaluaciones conforme al PEA.', expected_evidence = 'Verificación directa del banco de preguntas en el EVA', criterion_mode = 'check' where id = 'AN-EVA-10';
update public.competency_definitions set observable_competency = 'Verifica en SISACAD que el PEA esté registrado y disponible para impresión.', expected_evidence = 'Verificación directa en SISACAD', criterion_mode = 'check' where id = 'AN-SIS-02';

-- DURANTE
update public.competency_definitions set active=false where id in ('DU-GEN-02','DU-GEN-04','DU-GEN-05','DU-GEN-06','DU-GEN-07','DU-GEN-10');
update public.competency_definitions set observable_competency='Aplica durante la asignatura los procedimientos institucionales de evaluación y tutorías.', expected_evidence='Verificación directa durante el acompañamiento', criterion_mode='check' where id='DU-GEN-01';
update public.competency_definitions set observable_competency='Inicia la grabación antes del registro de asistencia y verifica que se encuentre activa.', expected_evidence='Verificación directa durante la sesión', criterion_mode='check' where id='DU-GEN-03';
update public.competency_definitions set observable_competency='Promueve el uso de cámara por parte de los estudiantes conforme a la modalidad y los lineamientos institucionales.', expected_evidence='Verificación directa durante la sesión', criterion_mode='check' where id='DU-GEN-08';
update public.competency_definitions set observable_competency='Registra oportunamente la microcurrícula correspondiente a cada sesión de clase.', expected_evidence='Verificación directa en SISACAD', criterion_mode='check' where id='DU-GEN-09';
update public.competency_definitions set observable_competency='Aplica las excepciones y adaptaciones curriculares conforme al plan aprobado, cuando corresponde.', expected_evidence='Verificación directa de la aplicación del plan', criterion_mode='check' where id='DU-ADA-01';
update public.competency_definitions set observable_competency='Utiliza el formato institucional de presentaciones y cumple la rúbrica de calidad establecida.', expected_evidence='Verificación directa de la presentación', criterion_mode='check' where id='DU-PRE-01';
update public.competency_definitions set observable_competency='Incluye un mínimo de 15 diapositivas de contenido neto en cada presentación.', expected_evidence='Verificación directa de la presentación', criterion_mode='check' where id='DU-PRE-02';
update public.competency_definitions set observable_competency='Publica la presentación en formato embebido en Canva y adjunta su versión en PDF.', expected_evidence='Verificación directa en el EVA', criterion_mode='check' where id='DU-PRE-03';

update public.competency_definitions set active=false where id ~ '^DU-U[1-4]-(03|06|08)$';
update public.competency_definitions set observable_competency='Configura en el EVA la rúbrica correcta y parametriza adecuadamente la actividad correspondiente a la unidad.', expected_evidence='Verificación directa en el EVA', criterion_mode='check' where id ~ '^DU-U[1-4]-01$';
update public.competency_definitions set observable_competency='Importa oportunamente en SISACAD las calificaciones correspondientes a la unidad.', expected_evidence='Verificación directa en SISACAD', criterion_mode='check' where id ~ '^DU-U[1-4]-02$';
update public.competency_definitions set observable_competency='Registra las evidencias de las actividades académicas requeridas para los informes de la unidad.', expected_evidence='Evidencias de actividades académicas de la unidad', criterion_mode='evidence' where id ~ '^DU-U[1-4]-04$';
update public.competency_definitions set observable_competency='Registra las evidencias de las tutorías realizadas durante la unidad, cuando corresponde.', expected_evidence='Evidencias de tutorías de la unidad', criterion_mode='evidence' where id ~ '^DU-U[1-4]-05$';
update public.competency_definitions set observable_competency='Publica los enlaces de las grabaciones de clase y verifica que sean accesibles para los estudiantes.', expected_evidence='Verificación directa de enlaces de grabación', criterion_mode='check' where id ~ '^DU-U[1-4]-07$';
update public.competency_definitions set observable_competency='Gestiona las solicitudes de tareas atrasadas conforme al procedimiento institucional.', expected_evidence='Verificación directa del procedimiento aplicado', criterion_mode='check' where id ~ '^DU-U[1-4]-09$';
update public.competency_definitions set observable_competency='Entrega oportunamente la documentación firmada y los informes requeridos para la unidad.', expected_evidence='Documentación firmada e informes de la unidad', criterion_mode='evidence' where id ~ '^DU-U[1-4]-10$';

update public.competency_definitions set active=false where id in ('DU-OBS-03','DU-OBS-07','DU-OBS-12','DU-OBS-13','DU-OBS-15','DU-OBS-18','DU-OBS-20','DU-OBS-21','DU-OBS-22','DU-OBS-24','DU-OBS-25');
update public.competency_definitions set observable_competency='Registra la asistencia con nombres y apellidos, evitando exponer información personal de los estudiantes en pantalla.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-01';
update public.competency_definitions set observable_competency='Comunica al inicio el objetivo de la clase y los contenidos que se desarrollarán.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-02';
update public.competency_definitions set observable_competency='Cumple la duración de la sesión establecida en el horario oficial.', expected_evidence='Observación de clase / horario oficial', criterion_mode='check' where id='DU-OBS-04';
update public.competency_definitions set observable_competency='Mantiene la cámara encendida durante la sesión cuando la modalidad y los lineamientos institucionales así lo requieren.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-05';
update public.competency_definitions set observable_competency='Utiliza el fondo institucional en las jornadas o modalidades en las que sea obligatorio.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-06';
update public.competency_definitions set observable_competency='Utiliza herramientas TIC, actividades interactivas o estrategias de gamificación cuando aportan al aprendizaje.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-08';
update public.competency_definitions set observable_competency='Integra experiencias profesionales, reflexiones académicas o referencias pertinentes para contextualizar el contenido.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-09';
update public.competency_definitions set observable_competency='Realiza una actividad diagnóstica al inicio de la clase, cuando corresponde.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-10';
update public.competency_definitions set observable_competency='Realiza preguntas dirigidas a los estudiantes, identificándolos por nombre y apellido.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-11';
update public.competency_definitions set observable_competency='Integra recursos de la biblioteca institucional y realiza análisis o retroalimentación sobre su contenido.', expected_evidence='Observación de clase / recursos de biblioteca', criterion_mode='check' where id='DU-OBS-14';
update public.competency_definitions set observable_competency='Utiliza el libro de la asignatura y la guía de formación práctica cuando corresponde al contenido de la sesión.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-16';
update public.competency_definitions set observable_competency='Brinda retroalimentación durante el inicio, desarrollo y cierre de la clase.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-17';
update public.competency_definitions set observable_competency='Utiliza recursos audiovisuales pertinentes y relacionados con el tema de clase cuando aportan al aprendizaje.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-19';
update public.competency_definitions set observable_competency='Verifica al cierre de la sesión el cumplimiento del resultado de aprendizaje previsto.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-23';
update public.competency_definitions set observable_competency='Aplica durante la clase las adaptaciones curriculares previstas, cuando corresponde.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-26';
update public.competency_definitions set observable_competency='Comparte la pantalla cuando corresponde y mantiene visible la hora durante la observación de clase.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-27';
update public.competency_definitions set observable_competency='Realiza una retroalimentación de la clase anterior al inicio de la nueva sesión.', expected_evidence='Observación de clase', criterion_mode='check' where id='DU-OBS-28';

-- DESPUÉS
update public.competency_definitions set observable_competency='Gestiona y aplica los exámenes supletorios conforme al cronograma y procedimiento institucional, cuando corresponde.', expected_evidence='Registro o evidencia del examen supletorio', criterion_mode='evidence' where id='DE-CIE-01';
update public.competency_definitions set observable_competency='Entrega el informe de fin de asignatura completo y debidamente firmado.', expected_evidence='Informe de fin de asignatura firmado', criterion_mode='evidence' where id='DE-CIE-02';
update public.competency_definitions set observable_competency='Entrega el informe de adaptaciones curriculares cuando corresponde.', expected_evidence='Informe de adaptaciones curriculares', criterion_mode='evidence' where id='DE-CIE-03';
update public.competency_definitions set observable_competency='Entrega el informe de tutorías en las jornadas matutina y vespertina, cuando corresponde.', expected_evidence='Informe de tutorías', criterion_mode='evidence' where id='DE-CIE-04';

-- Solo EVIDENCIA genera una solicitud de carga.
create or replace function private.sync_default_criterion_evidence_requests(p_expedient_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_expedient_id is null then return; end if;

  insert into public.evidence_requests(expedient_id,hito_id,criterion_id,title,instructions,required,status,origin,created_by_staff_id)
  select p_expedient_id,cd.hito_id,cd.id,cd.observable_competency,cd.expected_evidence,true,'pending','criterion_default',null
  from public.competency_definitions cd
  where cd.active and cd.criterion_mode='evidence'
  on conflict (expedient_id,criterion_id) where origin='criterion_default' and criterion_id is not null
  do update set hito_id=excluded.hito_id,title=excluded.title,instructions=excluded.instructions,required=true,status=case when public.evidence_requests.status='cancelled' then 'pending' else public.evidence_requests.status end,updated_at=now();

  update public.evidence_requests er
  set status='cancelled',updated_at=now()
  where er.expedient_id=p_expedient_id and er.origin='criterion_default' and er.criterion_id is not null
    and er.status in ('pending','submitted','in_review','correction_required')
    and not exists (select 1 from public.competency_definitions cd where cd.id=er.criterion_id and cd.active and cd.criterion_mode='evidence');
end;
$$;

revoke all on function private.sync_default_criterion_evidence_requests(uuid) from public,anon,authenticated;
grant execute on function private.sync_default_criterion_evidence_requests(uuid) to service_role;

create or replace function private.competency_seed_default_criterion_evidence()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_expedient_id uuid;
begin
  for v_expedient_id in select e.id from public.expedients e where e.status::text not in ('certified','archived') loop
    perform private.sync_default_criterion_evidence_requests(v_expedient_id);
  end loop;
  return new;
end;
$$;

revoke all on function private.competency_seed_default_criterion_evidence() from public,anon,authenticated;
grant execute on function private.competency_seed_default_criterion_evidence() to service_role;

create trigger competency_seed_default_criterion_evidence
after insert or update of active,hito_id,observable_competency,expected_evidence,criterion_mode
on public.competency_definitions
for each row execute function private.competency_seed_default_criterion_evidence();

do $$
declare v_expedient_id uuid;
begin
  for v_expedient_id in select e.id from public.expedients e where e.status::text not in ('certified','archived') loop
    perform private.sync_default_criterion_evidence_requests(v_expedient_id);
  end loop;
end $$;

create or replace function public.teacher_criterion_evidence_workspace(p_token text,p_expedient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_teacher_id uuid; v_criteria jsonb;
begin
  select s.teacher_id into v_teacher_id
  from public.teacher_device_sessions s
  join public.teacher_access a on a.teacher_id=s.teacher_id and a.active
  join public.expedients e on e.teacher_id=s.teacher_id and e.id=p_expedient_id
  where s.token_hash=extensions.digest(p_token,'sha256') and s.revoked_at is null and s.expires_at>now()
  limit 1;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cd.id,'hito_id',cd.hito_id,'process',cd.process,'label',cd.observable_competency,'mode',cd.criterion_mode,
    'criticality',cd.criticality,'expected_evidence',cd.expected_evidence,
    'score',case when cs.competency_id is null then null else jsonb_build_object('score',cs.score,'not_applicable',cs.not_applicable,'observation',cs.coordinator_observation,'evaluated_at',cs.evaluated_at) end,
    'na_request',(select jsonb_build_object('id',nr.id,'justification',nr.justification,'status',nr.status,'requested_at',nr.requested_at,'review_comment',nr.review_comment,'reviewed_at',nr.reviewed_at) from public.criterion_na_requests nr where nr.expedient_id=p_expedient_id and nr.criterion_id=cd.id order by nr.requested_at desc limit 1),
    'request',case when cd.criterion_mode='evidence' then (select jsonb_build_object(
      'id',er.id,'status',er.status,'title',er.title,'instructions',er.instructions,'origin',er.origin,
      'submissions',coalesce((select jsonb_agg(jsonb_build_object(
        'id',es.id,'version',es.version,'teacher_comment',es.teacher_comment,'status',es.status,'submitted_at',es.submitted_at,'reviewed_at',es.reviewed_at,'review_comment',es.review_comment,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',esi.id,'position',esi.position,'kind',esi.kind,'file_name',esi.file_name,'mime_type',esi.mime_type,'size_bytes',esi.size_bytes,'external_url',esi.external_url) order by esi.position) from public.evidence_submission_items esi where esi.submission_id=es.id),'[]'::jsonb)
      ) order by es.version desc) from public.evidence_submissions es where es.request_id=er.id and es.teacher_id=v_teacher_id),'[]'::jsonb)
    ) from public.evidence_requests er where er.expedient_id=p_expedient_id and er.criterion_id=cd.id and er.origin='criterion_default' and er.status<>'cancelled' limit 1) else null end
  ) order by cd.hito_id,cd.id),'[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs on cs.expedient_id=p_expedient_id and cs.competency_id=cd.id
  where cd.active;

  return jsonb_build_object('criteria',v_criteria,'total',(select count(*) from public.competency_definitions where active),'na_pending',(select count(*) from public.criterion_na_requests where expedient_id=p_expedient_id and status='pending'));
end;
$$;

grant execute on function public.teacher_criterion_evidence_workspace(text,uuid) to anon,authenticated;

create or replace function public.staff_criterion_evidence_workspace(p_expedient_id uuid,p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_criteria jsonb;
begin
  if not private.staff_can_manage_expedient(p_expedient_id,p_staff_id) then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cd.id,'hito_id',cd.hito_id,'process',cd.process,'label',cd.observable_competency,'mode',cd.criterion_mode,
    'criticality',cd.criticality,'expected_evidence',cd.expected_evidence,
    'score',case when cs.competency_id is null then null else jsonb_build_object('score',cs.score,'not_applicable',cs.not_applicable,'observation',cs.coordinator_observation,'evaluated_at',cs.evaluated_at) end,
    'na_request',(select jsonb_build_object('id',nr.id,'justification',nr.justification,'status',nr.status,'requested_at',nr.requested_at,'review_comment',nr.review_comment,'reviewed_at',nr.reviewed_at) from public.criterion_na_requests nr where nr.expedient_id=p_expedient_id and nr.criterion_id=cd.id order by nr.requested_at desc limit 1),
    'request',case when cd.criterion_mode='evidence' then (select jsonb_build_object(
      'id',er.id,'status',er.status,'title',er.title,'instructions',er.instructions,'origin',er.origin,
      'submissions',coalesce((select jsonb_agg(jsonb_build_object(
        'id',es.id,'version',es.version,'teacher_comment',es.teacher_comment,'status',es.status,'submitted_at',es.submitted_at,'reviewed_at',es.reviewed_at,'review_comment',es.review_comment,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',esi.id,'position',esi.position,'kind',esi.kind,'file_name',esi.file_name,'mime_type',esi.mime_type,'size_bytes',esi.size_bytes,'external_url',esi.external_url) order by esi.position) from public.evidence_submission_items esi where esi.submission_id=es.id),'[]'::jsonb)
      ) order by es.version desc) from public.evidence_submissions es where es.request_id=er.id),'[]'::jsonb)
    ) from public.evidence_requests er where er.expedient_id=p_expedient_id and er.criterion_id=cd.id and er.origin='criterion_default' and er.status<>'cancelled' limit 1) else null end
  ) order by cd.hito_id,cd.id),'[]'::jsonb)
  into v_criteria
  from public.competency_definitions cd
  left join public.competency_scores cs on cs.expedient_id=p_expedient_id and cs.competency_id=cd.id
  where cd.active;

  return jsonb_build_object('criteria',v_criteria,'total',(select count(*) from public.competency_definitions where active),'na_pending',(select count(*) from public.criterion_na_requests where expedient_id=p_expedient_id and status='pending'));
end;
$$;

grant execute on function public.staff_criterion_evidence_workspace(uuid,uuid) to anon,authenticated;

create or replace function public.staff_evaluate_criterion_submission(p_expedient_id uuid,p_criterion_id text,p_staff_id uuid,p_score smallint,p_observation text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.evidence_requests%rowtype;
  v_submission public.evidence_submissions%rowtype;
  v_status text;
  v_actor text;
  v_observation text;
  v_mode text;
begin
  if p_score is null or p_score<0 or p_score>4 then raise exception 'invalid_score'; end if;
  v_observation:=nullif(trim(coalesce(p_observation,'')),'');
  if p_score<3 and v_observation is null then raise exception 'comment_required'; end if;
  if not private.staff_can_manage_expedient(p_expedient_id,p_staff_id) then raise exception 'not_allowed'; end if;

  select cd.criterion_mode into v_mode from public.competency_definitions cd where cd.id=p_criterion_id and cd.active;
  if not found then raise exception 'invalid_criterion'; end if;
  if exists(select 1 from public.criterion_na_requests nr where nr.expedient_id=p_expedient_id and nr.criterion_id=p_criterion_id and nr.status='approved') then raise exception 'criterion_not_applicable'; end if;

  if v_mode='check' then
    insert into public.competency_scores(expedient_id,competency_id,score,not_applicable,coordinator_observation,evaluated_by,evaluated_by_staff_id,evaluated_at)
    values(p_expedient_id,p_criterion_id,p_score,false,v_observation,null,p_staff_id,now())
    on conflict(expedient_id,competency_id) do update set score=excluded.score,not_applicable=false,coordinator_observation=excluded.coordinator_observation,evaluated_by=null,evaluated_by_staff_id=p_staff_id,evaluated_at=now();

    select case when s.role='admin' then 'admin' else 'coordinator' end into v_actor from public.siacd_staff s where s.id=p_staff_id;
    insert into public.activity_log(expedient_id,actor_type,actor_staff_id,event_type,message,metadata)
    values(p_expedient_id,coalesce(v_actor,'coordinator'),p_staff_id,case when p_score>=3 then 'criterion_check_approved' else 'criterion_check_correction_required' end,case when p_score>=3 then 'El criterio fue verificado directamente y aprobado.' else 'El criterio fue verificado directamente y requiere ajuste.' end,jsonb_build_object('criterion_id',p_criterion_id,'mode','check','score',p_score,'observation',v_observation));
    return jsonb_build_object('ok',true,'criterion_id',p_criterion_id,'mode','check','score',p_score,'status',case when p_score>=3 then 'approved' else 'correction_required' end);
  end if;

  select er.* into v_request from public.evidence_requests er where er.expedient_id=p_expedient_id and er.criterion_id=p_criterion_id and er.origin='criterion_default' and er.status<>'cancelled' limit 1 for update;
  if not found then raise exception 'evidence_request_not_found'; end if;
  select es.* into v_submission from public.evidence_submissions es where es.request_id=v_request.id order by es.version desc limit 1 for update;
  if not found then raise exception 'evidence_required'; end if;
  if v_submission.status<>'submitted' or v_submission.reviewed_at is not null then raise exception 'submission_not_pending'; end if;
  if v_request.status not in ('submitted','in_review') then raise exception 'request_not_in_review'; end if;

  v_status:=case when p_score>=3 then 'approved' else 'correction_required' end;
  insert into public.competency_scores(expedient_id,competency_id,score,not_applicable,coordinator_observation,evaluated_by,evaluated_by_staff_id,evaluated_at)
  values(p_expedient_id,p_criterion_id,p_score,false,v_observation,null,p_staff_id,now())
  on conflict(expedient_id,competency_id) do update set score=excluded.score,not_applicable=false,coordinator_observation=excluded.coordinator_observation,evaluated_by=null,evaluated_by_staff_id=p_staff_id,evaluated_at=now();
  update public.evidence_submissions set status=v_status,reviewed_by_staff_id=p_staff_id,reviewed_at=now(),review_comment=v_observation where id=v_submission.id;
  update public.evidence_requests set status=v_status,updated_at=now() where id=v_request.id;
  select case when s.role='admin' then 'admin' else 'coordinator' end into v_actor from public.siacd_staff s where s.id=p_staff_id;
  insert into public.activity_log(expedient_id,actor_type,actor_staff_id,event_type,message,metadata)
  values(p_expedient_id,coalesce(v_actor,'coordinator'),p_staff_id,case when p_score>=3 then 'criterion_evidence_approved' else 'criterion_correction_required' end,case when p_score>=3 then 'La evidencia del criterio fue evaluada y aprobada.' else 'La evidencia del criterio fue evaluada y requiere corrección.' end,jsonb_build_object('criterion_id',p_criterion_id,'mode','evidence','request_id',v_request.id,'submission_id',v_submission.id,'submission_version',v_submission.version,'score',p_score,'status',v_status,'observation',v_observation));
  return jsonb_build_object('ok',true,'criterion_id',p_criterion_id,'mode','evidence','submission_id',v_submission.id,'version',v_submission.version,'score',p_score,'status',v_status);
end;
$$;

grant execute on function public.staff_evaluate_criterion_submission(uuid,text,uuid,smallint,text) to anon,authenticated;
