-- 2026-09-30 간병인을 명세(TB_CAREGIVER + TB_LOCATION)대로 옮기고, 간호사 담당 병실 연결 테이블을 추가합니다.
-- 1) 병실 위치 등록: 이름이 'N병동' 인 병동마다 N01~N17호(TB_LOCATION, ROOM). 이미 있는 위치(예: 3병동 302호)는 그대로 둡니다.
-- 2) 간병인 이전: tb_emp(job_cd = 'CAREGIVER') → TB_CAREGIVER. 활성(APPROVED)은 USE_YN 'Y', 비활성은 'N'.
-- 3) 관리 이력·SMS 기록의 간병인 USER_ID 를 새 값('cg:' + CAREGIVER_ID)으로 바꿉니다(서버 CaregiverIds 와 같은 규칙).
-- 4) 옛 간병인 tb_emp 행은 지우지 않고 INACTIVE 로 둡니다(로그인 차단, 되돌리기용).
-- 5) 간호사 담당 병실 연결 테이블 tb_emp_location(emp_id, location_id) 추가(여러 병실·여러 간호사 가능, 선택 사항).
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

-- 1) 병실 위치
INSERT INTO public.tb_location (ward_id, location_nm, location_type, crt_dt)
SELECT w.ward_id, CONCAT(wn.ward_number * 100 + r.room_order, '호'), 'ROOM', NOW()
FROM public.tb_ward w
CROSS JOIN LATERAL (
    SELECT CAST(SUBSTRING(REPLACE(w.ward_nm, ' ', '') FROM '^([0-9]+)병동$') AS INTEGER) AS ward_number
) wn
CROSS JOIN generate_series(1, 17) AS r(room_order)
WHERE wn.ward_number IS NOT NULL
ON CONFLICT (ward_id, location_nm) DO NOTHING;

-- 2) 간병인 이전
CREATE TEMP TABLE caregiver_source ON COMMIT DROP AS
SELECT e.emp_id, e.emp_nm, e.hosp_div_id, l.location_id, e.phone_no,
       CASE WHEN e.auth_st = 'APPROVED' THEN 'Y' ELSE 'N' END AS use_yn,
       COALESCE(e.crt_dt, NOW()) AS crt_dt, COALESCE(e.upd_dt, NOW()) AS upd_dt
FROM public.tb_emp e
JOIN public.tb_location l
  ON l.ward_id = e.ward_id
 AND l.location_nm = CONCAT(e.room_no, '호')
WHERE e.job_cd = 'CAREGIVER';

DO $$
BEGIN
    IF (SELECT count(*) FROM caregiver_source) <> (SELECT count(*) FROM public.tb_emp WHERE job_cd = 'CAREGIVER') THEN
        RAISE EXCEPTION '병실 위치를 찾지 못한 간병인이 있습니다. 이전을 멈춥니다.';
    END IF;
END $$;

INSERT INTO public.tb_caregiver (care_nm, hosp_div_id, location_id, phone_no, use_yn, crt_dt, upd_dt)
SELECT emp_nm, hosp_div_id, location_id, phone_no, use_yn, crt_dt, upd_dt
FROM caregiver_source;

CREATE TEMP TABLE caregiver_id_map ON COMMIT DROP AS
SELECT s.emp_id AS old_user_id, CONCAT('cg:', c.caregiver_id) AS new_user_id
FROM caregiver_source s
JOIN public.tb_caregiver c
  ON c.hosp_div_id = s.hosp_div_id
 AND c.phone_no = s.phone_no
 AND c.location_id = s.location_id
 AND c.care_nm = s.emp_nm;

DO $$
BEGIN
    IF (SELECT count(*) FROM caregiver_id_map) <> (SELECT count(*) FROM caregiver_source)
       OR (SELECT count(DISTINCT old_user_id) FROM caregiver_id_map) <> (SELECT count(*) FROM caregiver_source) THEN
        RAISE EXCEPTION '옛 간병인과 새 간병인을 1:1로 맞추지 못했습니다. 이전을 멈춥니다.';
    END IF;
END $$;

-- 3) 관리 이력·SMS 기록의 간병인 USER_ID
UPDATE public.tb_admin_history h
SET user_id = m.new_user_id
FROM caregiver_id_map m
WHERE h.user_id = m.old_user_id;

UPDATE public.tb_sms_send_history s
SET user_id = m.new_user_id
FROM caregiver_id_map m
WHERE s.user_type = 'CAREGIVER'
  AND s.user_id = m.old_user_id;

-- 4) 옛 간병인 tb_emp 행: 지우지 않고 로그인만 막음
UPDATE public.tb_emp
SET auth_st = 'INACTIVE', upd_dt = NOW()
WHERE job_cd = 'CAREGIVER'
  AND auth_st <> 'INACTIVE';

-- 5) 간호사 담당 병실
CREATE TABLE IF NOT EXISTS public.tb_emp_location (
    emp_id      VARCHAR(20) NOT NULL REFERENCES public.tb_emp (emp_id) ON DELETE CASCADE,
    location_id BIGINT      NOT NULL REFERENCES public.tb_location (location_id),
    crt_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_emp_location PRIMARY KEY (emp_id, location_id)
);
CREATE INDEX IF NOT EXISTS ix_emp_location_location ON public.tb_emp_location (location_id);
COMMENT ON TABLE public.tb_emp_location IS '간호사 담당 병실(TB_LOCATION). 여러 병실·여러 간호사 가능, 선택 사항';

COMMIT;
