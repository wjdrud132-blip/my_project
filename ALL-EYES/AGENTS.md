# 프로젝트 네이밍 규칙

이 규칙은 프로젝트 전체와 앞으로 추가하거나 수정하는 백엔드 코드에 적용한다.

- 일반 사용자 도메인은 `User`, 관리자 도메인은 `Admin`으로 통일한다.
- 사용자 명칭으로 `Member`를 사용하지 않는다. `member`, `MEMBER` 및 이를 포함하는 클래스명, 변수명, 메서드명, 키도 사용하지 않는다.
- 일반 사용자 계정이나 접속 유형을 직무명인 `Nurse` / `nurse`로 명명하지 않는다. 화면에 표시하는 직무명(예: 간호사)은 유지할 수 있다.
- 클래스는 PascalCase, 변수와 메서드는 camelCase, 상수와 enum 값은 UPPER_SNAKE_CASE를 사용한다.

| 적용 대상 | 일반 사용자 | 관리자 |
| --- | --- | --- |
| Entity | `User` | `Admin` |
| DTO | `UserDto`, `UserLoginRequest`, `UserLoginResponse` | `AdminDto`, `AdminLoginRequest`, `AdminLoginResponse` |
| Repository | `UserRepository` | `AdminRepository` |
| MyBatis Mapper | `UserMapper` | `AdminMapper` |
| Service | `UserService` | `AdminService` |
| Controller | `UserController` | `AdminController` |
| 변수 및 필드 | `user`, `userId`, `userRepository`, `loginUser` | `admin`, `adminId`, `adminRepository`, `loginAdmin` |
| 메서드 | `findUserById`, `loginUser` | `findAdminById`, `loginAdmin` |
| 세션 키 | `loginUser` | `loginAdmin` |
| 세션 키 상수 | `LOGIN_USER` | `LOGIN_ADMIN` |
| 접속 유형 문자열 | `user` | `admin` |
| 역할 상수 및 enum 값 | `USER` | `ADMIN` |

- 로그인 세션을 구현할 때 세션 키는 공통 상수로 정의하고 저장, 조회, 삭제에서 동일한 상수를 사용한다.
- 패키지명, 파일명, API 필드 및 프런트엔드 내부 식별자에도 같은 도메인 용어를 적용한다.
- 명칭 변경 시 선언뿐 아니라 참조, 템플릿, 매핑, 테스트도 함께 수정하여 동작이 일치하도록 한다.

# 개발 서버 실행 규칙

- Windows에서 서버 실행 전 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`를 `[Environment]::GetEnvironmentVariable`로 다시 읽어 현재 실행 프로세스에 반영한다. 사용자(User) 값, 시스템(Machine) 값, 기존 Process 값 순서로 사용한다. 저장된 환경변수 조회가 제한되면 권한을 요청하며, 오래된 Process 값으로 임의 실행하지 않는다.
- `DB_URL`은 `jdbc:postgresql://호스트:포트/DB명` 형식의 전체 JDBC URL을 그대로 사용한다. 접속 정보를 코드에 하드코딩하거나 로그에 출력하지 않는다.
- 테스트 폴더를 실행하지 않는다. Maven 실행 시 `-Dmaven.test.skip=true`를 유지한다.
- 개발 서버는 `spring-boot:run`의 `addResources=true`로 원본 JS·CSS·HTML을 직접 제공하고 캐시를 비활성화한다.
- pull로 Java 소스가 변경된 경우 이 프로젝트 서버를 종료한 뒤 새로 빌드하고 재시작한다.

- 서버에 반영이 필요한 변경 후에는 사용자가 직접 재시작하도록 안내하는 대신 이 프로젝트의 개발 서버를 자동으로 재시작하고 HTTP 응답을 확인한다.
- 재시작할 때는 이 프로젝트의 서버 프로세스인지 확인하고, 다른 프로젝트의 프로세스는 종료하지 않는다.

# 화면 경로 확인 규칙

- 사용자가 요청한 작업 범위의 HTML 화면은 Live Server와 Spring Boot 양쪽에서 CSS, JavaScript, 이미지가 로드되도록 작성한다.
- 현재 사용자 담당 화면은 메인(도메인) 화면이다. 다른 담당자의 페이지는 문제를 발견해도 별도 요청 없이 수정하지 않는다.
- 일반 href와 src는 HTML 파일 기준 상대 경로로, th:href와 th:src는 Spring Boot 정적 리소스 URL로 지정한다.
- 화면 이동 링크에는 직접 열기용 HTML 상대 경로와 서버용 Thymeleaf 경로를 함께 지정한다. 서버용 경로에 대응하는 컨트롤러 매핑도 확인한다.
- CSS의 url()은 CSS 파일 기준으로 확인하고, 리소스 경로의 대소문자는 Git에 기록된 실제 파일 경로와 일치시킨다.
- 화면 추가·수정 후 관련 페이지의 로컬 리소스 존재 여부와 서버 응답을 확인한다. DB 기능은 Spring Boot 실행이 필요하며 Live Server 미리보기와 구분한다.
