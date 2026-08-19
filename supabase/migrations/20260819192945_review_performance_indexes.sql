-- SIACD · Bloque de revisión
-- Índices de soporte detectados por el asesor de rendimiento de Supabase.

create index if not exists activity_log_actor_staff_idx on public.activity_log(actor_staff_id);
create index if not exists activity_log_actor_teacher_idx on public.activity_log(actor_teacher_id);
create index if not exists activity_log_review_cycle_idx on public.activity_log(review_cycle_id);
create index if not exists complementary_scores_criterion_idx on public.complementary_scores(criterion_id);
create index if not exists evidence_submissions_legacy_evidence_idx on public.evidence_submissions(legacy_evidence_id);
create index if not exists quality_scores_criterion_idx on public.quality_scores(criterion_id);
create index if not exists review_cycles_created_by_staff_idx on public.review_cycles(created_by_staff_id);
create index if not exists review_cycles_hito_idx on public.review_cycles(hito_id);
create index if not exists teacher_login_codes_teacher_idx on public.teacher_login_codes(teacher_id);
