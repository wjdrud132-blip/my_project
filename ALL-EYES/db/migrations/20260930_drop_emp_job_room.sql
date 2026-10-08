-- 2026-09-30 간병인을 TB_CAREGIVER 로 옮긴 뒤(20260930_caregiver_spec_emp_location.sql), tb_emp 의 옛 칸을 정리합니다.
-- 1) tb_emp 에 남아 있던 옛 간병인 계정 행 삭제(간병인은 이제 TB_CAREGIVER 에 있음)
-- 2) 옛 간병인 전화번호·직무 인덱스와 직무 제약 삭제
-- 3) job_cd(직무), room_no(간병인 병실) 칸 삭제 — 지금 코드는 두 칸을 쓰지 않음
-- 4) 병원·상태 조회용 인덱스 새로 만들기
-- 공용 DB 에는 2026-09-30 에 사용자가 직접 실행함(실행 후 칸·인덱스·제약 상태 조회로 확인).
-- 반드시 20260930_caregiver_spec_emp_location.sql 다음에 실행합니다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DELETE FROM public.tb_emp WHERE job_cd = 'CAREGIVER';
DROP INDEX IF EXISTS public.ux_emp_caregiver_phone;
DROP INDEX IF EXISTS public.ix_emp_hospital_job_status;
ALTER TABLE public.tb_emp DROP CONSTRAINT IF EXISTS ck_emp_job;
ALTER TABLE public.tb_emp DROP COLUMN IF EXISTS job_cd;
ALTER TABLE public.tb_emp DROP COLUMN IF EXISTS room_no;
CREATE INDEX IF NOT EXISTS ix_emp_hospital_status ON public.tb_emp (hosp_div_id, auth_st);
COMMIT;
