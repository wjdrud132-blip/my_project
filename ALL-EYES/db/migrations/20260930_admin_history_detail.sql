-- 2026-09-30 관리 이력에 병실 변경·전화번호 수정과 처리 내용을 남깁니다.
-- 1) action_detail: 무엇을 무엇으로 바꿨는지(예: '담당 병실 301호 → 301·302호', '전화번호 끝자리 1234 → 5678'). 기존 행은 비어 있음.
-- 2) 작업 코드에 CHANGE_ROOM(병실 변경), CHANGE_PHONE(전화번호 수정) 추가. 기존 6개 코드는 그대로.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.tb_admin_history ADD COLUMN IF NOT EXISTS action_detail VARCHAR(200);
ALTER TABLE public.tb_admin_history DROP CONSTRAINT IF EXISTS ck_admin_history_action;
ALTER TABLE public.tb_admin_history ADD CONSTRAINT ck_admin_history_action
    CHECK (action_cd IN ('CREATE', 'CHANGE_WARD', 'CHANGE_ROOM', 'CHANGE_PHONE',
                         'RESET_PASSWORD', 'DEACTIVATE', 'ACTIVATE', 'DELETE'));
COMMENT ON COLUMN public.tb_admin_history.action_detail IS '처리 내용(변경 전 → 후). 전화번호는 끝 4자리만';
COMMIT;
