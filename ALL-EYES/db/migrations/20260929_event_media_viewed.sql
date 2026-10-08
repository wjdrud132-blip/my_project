-- 2026-09-29 영상 보관함 '재생 확인' 칸을 추가합니다(관리자가 재생 버튼을 처음 누른 시각과 관리자 ID).
-- 공용 DB 에는 2026-09-29 에 실행됨. 원본: 데이터수집/reports/video_viewed_20260929_1850/add_viewed_columns.sql
-- 빈 값을 허용하는 칸이라 기존 행에는 영향이 없습니다.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.tb_event_media
    ADD COLUMN IF NOT EXISTS viewed_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS viewed_by varchar(50) NULL;
COMMENT ON COLUMN public.tb_event_media.viewed_at IS '관리자가 영상 보관함에서 처음 재생한 시각';
COMMENT ON COLUMN public.tb_event_media.viewed_by IS '처음 재생한 관리자 ID';
COMMIT;
