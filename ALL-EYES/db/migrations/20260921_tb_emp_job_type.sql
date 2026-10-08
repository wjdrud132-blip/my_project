-- 일반 직원과 간병인 계정을 같은 사용자 테이블에서 구분합니다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.tb_emp
    ADD COLUMN IF NOT EXISTS job_cd VARCHAR(20) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE public.tb_emp
    DROP CONSTRAINT IF EXISTS ck_emp_job;
ALTER TABLE public.tb_emp
    ADD CONSTRAINT ck_emp_job CHECK (job_cd IN ('GENERAL', 'CAREGIVER'));
CREATE INDEX IF NOT EXISTS ix_emp_hospital_job_status
    ON public.tb_emp (hosp_div_id, job_cd, auth_st);
COMMENT ON COLUMN public.tb_emp.job_cd IS
    'USER 계정의 직무 구분: GENERAL(기존 직원), CAREGIVER(간병인)';
COMMIT;
