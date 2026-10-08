-- AUTH_ST 영문 컬럼명을 유지하고 계정 활성화/비활성화 상태로 전환한다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.tb_emp IN ACCESS EXCLUSIVE MODE;

-- 사용자가 로그인 허용을 요청한 기존 승인 대기 계정을 활성화한다.
UPDATE public.tb_emp
SET auth_st = 'APPROVED', upd_dt = NOW()
WHERE auth_st = 'PENDING';

ALTER TABLE public.tb_emp
    ALTER COLUMN auth_st SET DEFAULT 'APPROVED',
    ALTER COLUMN crt_dt SET DEFAULT NOW(),
    DROP CONSTRAINT ck_emp_auth;

ALTER TABLE public.tb_emp
    ADD CONSTRAINT ck_emp_auth CHECK (auth_st IN ('APPROVED', 'INACTIVE'));

COMMENT ON COLUMN public.tb_emp.auth_st IS
    '계정 상태: APPROVED(활성화), INACTIVE(비활성화), 기본값 APPROVED';
COMMENT ON COLUMN public.tb_emp.crt_dt IS
    '계정 생성 일시, 기본값 NOW()';
COMMIT;
