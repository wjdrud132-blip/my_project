-- 로그인 브루트포스 방어: 연속 실패 횟수와 잠금 해제 시각을 TB_EMP에 추가한다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.tb_emp IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.tb_emp
    ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN locked_until TIMESTAMPTZ NULL;

ALTER TABLE public.tb_emp
    ADD CONSTRAINT ck_emp_failed_login_count CHECK (failed_login_count >= 0);

COMMENT ON COLUMN public.tb_emp.failed_login_count IS
    '로그인 연속 실패 횟수. 성공 시 0으로 초기화된다.';
COMMENT ON COLUMN public.tb_emp.locked_until IS
    '이 시각까지 로그인이 잠긴다(NULL이면 잠기지 않음). 연속 5회 실패 시 1분간 잠긴다.';
COMMIT;
