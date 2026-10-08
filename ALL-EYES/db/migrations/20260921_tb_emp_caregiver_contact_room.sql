-- 간병인 계정의 연락처와 담당 병실을 저장합니다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.tb_emp
    ADD COLUMN IF NOT EXISTS phone_no VARCHAR(20),
    ADD COLUMN IF NOT EXISTS room_no VARCHAR(3);
CREATE UNIQUE INDEX IF NOT EXISTS ux_emp_caregiver_phone
    ON public.tb_emp (phone_no)
    WHERE job_cd = 'CAREGIVER' AND phone_no IS NOT NULL;
COMMENT ON COLUMN public.tb_emp.phone_no IS '간병인 연락처(숫자만 저장)';
COMMENT ON COLUMN public.tb_emp.room_no IS '간병인 담당 병실 번호(301~317)';
COMMIT;
