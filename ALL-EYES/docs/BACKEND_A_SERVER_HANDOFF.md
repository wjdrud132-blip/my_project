# Backend A 서버 구현 인계 문서

## 구현 범위

- 병원 관리자가 같은 병원의 일반 사용자 계정을 발급한다.
- 서버가 임시 비밀번호를 만들고 BCrypt 해시만 저장한다.
- 새 계정은 `ACTIVE`, `must_change_password = true`로 생성한다.
- 관리자는 같은 병원의 일반 사용자 계정만 비활성화하거나 재활성화한다.
- 계정 삭제 API는 제공하지 않는다.
- 병동 목록은 로그인한 관리자의 병원 범위로 제한한다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/api/admin/users` | 사용자 계정 발급 및 임시 비밀번호 1회 반환 |
| `PATCH` | `/api/admin/users/{userId}/disable` | 계정 비활성화 |
| `PATCH` | `/api/admin/users/{userId}/reactivate` | 계정 재활성화 |
| `GET` | `/api/admin/wards` | 현재 병원의 병동 선택지 조회 |

계정 발급 요청 예시:

```json
{
  "userId": "ward1.kim",
  "userName": "김간호",
  "wardId": 1,
  "role": "USER"
}
```

임시 비밀번호는 생성 응답에서만 평문으로 전달한다. 서버 로그와 DB에는 평문을 기록하지 않는다.

### 응답과 오류

- 계정 발급 성공: `201 Created`, 사용자 정보와 `temporaryPassword`, `mustChangePassword=true` 반환
- 상태 변경과 병동 조회 성공: `200 OK`
- 입력 누락, 다른 병원 병동, `ADMIN` 발급 시도: `400 Bad Request`
- 로그인하지 않은 요청: 로그인 화면으로 이동
- 일반 사용자의 관리자 API 요청: `403 Forbidden`
- 현재 병원에서 관리할 수 없는 사용자: `404 Not Found`
- 중복 아이디 또는 현재 상태와 맞지 않는 변경: `409 Conflict`
- `POST`, `PATCH` 요청에는 현재 Spring Security 구조에 맞는 CSRF 토큰이 필요하다.

관리 대상 사용자의 병원 ID는 브라우저가 보내지 않는다. 로그인한 관리자 정보의 병원 ID를 서버가 사용한다. 역할은 현재 구조에서 `USER`만 허용하므로, 병원에 지급된 관리자 계정으로 다른 관리자 계정을 생성할 수 없다.

## FRONTEND TODO

### 사용자 계정 생성

- 연결 API: `POST /api/admin/users`
- 입력: `userId`, `userName`, `wardId`, `role=USER`
- 병동 선택지: `GET /api/admin/wards`
- 성공 시 `temporaryPassword`를 관리자에게 한 번만 표시하고 복사할 수 있어야 한다.
- 창을 닫은 뒤 초기 비밀번호를 다시 조회하는 기능은 제공하지 않는다.

### 계정 상태 관리

- 비활성화: `PATCH /api/admin/users/{userId}/disable`
- 재활성화: `PATCH /api/admin/users/{userId}/reactivate`
- 상태값은 `ACTIVE`, `DISABLED`만 표시한다.

### 다른 담당 화면

- 최초 로그인 비밀번호 변경, 일반 비밀번호 변경, 관리자 비밀번호 재설정 결과 표시
- 로그인 화면의 “아이디 또는 비밀번호 분실 시 병원 관리자 문의” 안내
- 감사 로그 조회 화면은 Backend C의 조회 계약 확정 후 연결

## 팀 작업과 충돌 지점

| 담당 | 작업 | 주 수정 영역 | 충돌 주의 |
| --- | --- | --- | --- |
| Backend A | 계정 발급, 임시 비밀번호, 상태 변경 | 새 `admin` Controller/Service/Mapper/DTO | `SecurityConfig`에 관리자 URL 규칙 1건 추가 |
| Backend B | 로그인, 최초 변경 강제, 비밀번호 변경/재설정 | `User`, `UserMapper`, `UserService`, `HospitalUserDetails`, `SecurityConfig` | `SecurityConfig`는 A 변경을 보존해 병합 |
| Backend C | 기존 승인 흐름 제거, 감사 로그, 사용자 관리 조회 | 기존 관리자 기능과 새 감사 로그 계층 | A 서비스 성공 시점에 감사 로그 연결 필요 |
| Frontend D | 기존 화면 연결 및 새 화면 설계 | HTML/JS/CSS | CSRF와 1회성 임시 비밀번호 응답 처리 |

`SecurityConfig`는 여러 담당자가 만질 가능성이 가장 높다. Backend A의 `/api/admin/**` 권한 규칙을 유지한 상태에서 Backend B의 최초 비밀번호 변경 예외 경로를 추가하는 순서가 안전하다.

## 월요일 DB 회의 전 제한

현재 DB 구조는 이 API의 목표 구조와 다르다. 신규 API를 실제 DB에 호출하지 않고 컴파일과 기존 화면 기동까지만 검증한다.

1. `AUTH_ST` 체크 제약을 제거한 뒤 기존 `APPROVED`를 `ACTIVE`, 나머지 상태를 `DISABLED`로 변환한다.
2. `AUTH_ST` 허용값을 `ACTIVE`, `DISABLED`로 다시 제한한다.
3. `MUST_CHANGE_PASSWORD BOOLEAN NOT NULL` 컬럼과 기본값을 결정한다.
4. 기존 사용자에게 최초 변경을 요구할지 정하고 초기 데이터를 반영한다.
5. 현재 `EMP_EMAIL`은 `NOT NULL UNIQUE`이다. 관리자 발급 시 이메일을 받을지 nullable로 변경할지 결정한다.
6. `EMP_ID`가 전 병원 공통 기본키이다. 중복을 전역 금지로 유지할지 `(HOSP_DIV_ID, EMP_ID)` 복합키로 바꿀지 결정한다.
7. 발급·상태 변경·비밀번호 재설정 감사 로그 테이블의 컬럼과 보존 기간을 결정한다.

## 다른 담당자와 합칠 지점

- 로그인 담당은 `User`, `UserMapper`, `HospitalUserDetails`를 `AccountStatus`와 `mustChangePassword` 기준으로 전환한다.
- `DISABLED` 로그인 차단과 로그인 중인 세션의 만료 정책을 연결한다.
- 최초 로그인 비밀번호 강제 변경과 관리자 비밀번호 재설정 API를 연결한다.
- 감사 로그 담당은 성공한 발급·상태 변경을 같은 트랜잭션에서 기록하도록 서비스에 연결한다.
