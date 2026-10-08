#!/usr/bin/env bash
#
# allinone.xos.kr 재배포 스크립트
#
#   사용법 (Git Bash):
#     ./deploy.sh              빌드 → 업로드 → 재시작 → 상태 확인
#     ./deploy.sh --no-build   이미 빌드된 jar로 배포만
#     ./deploy.sh --rollback   직전 버전으로 되돌리기
#     ./deploy.sh --status     배포 없이 현재 상태만 확인
#
# 배포에 실패하면 직전 jar로 자동 복구한다.

set -euo pipefail

HOST=xos.kr
SSH_USER=xos
KEY="$HOME/.ssh/id_ed25519"
REMOTE_DIR=/home/xos/allinone
SERVICE=allinone.service
URL=https://allinone.xos.kr/
JAR=hospital-safety.jar
BUILD_JAR=target/hospital-safety-0.0.1-SNAPSHOT.jar
HEALTH_TRIES=20
HEALTH_GAP=3

cd "$(dirname "$0")"

# ── 출력 헬퍼 ────────────────────────────────────────────────
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ssh/scp 는 한글 경로 문제로 키를 항상 -i 로 명시한다.
rsh()  { ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
             -o ConnectTimeout=15 "$SSH_USER@$HOST" "$@"; }
rcp()  { scp -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
             -o ConnectTimeout=15 "$@"; }

health() {
  local i code
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || echo 000)
    if [[ $code == 200 ]]; then ok "응답 확인 (HTTP 200, ${i}회째)"; return 0; fi
    printf '  대기 중... (%d/%d, HTTP %s)\r' "$i" "$HEALTH_TRIES" "$code"
    sleep "$HEALTH_GAP"
  done
  printf '\n'; return 1
}

show_status() {
  step "현재 상태"
  rsh "systemctl is-active $SERVICE | sed 's/^/  서비스: /'
       ls -l $REMOTE_DIR/$JAR | awk '{print \"  현재 jar: \"\$5\" bytes, \"\$6\" \"\$7\" \"\$8}'
       if [ -f $REMOTE_DIR/$JAR.prev ]; then
         ls -l $REMOTE_DIR/$JAR.prev | awk '{print \"  이전 jar: \"\$5\" bytes, \"\$6\" \"\$7\" \"\$8}'
       else echo '  이전 jar: 없음'; fi"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" || echo 000)
  echo "  외부 응답: HTTP $code"
}

restart_and_verify() {
  step "서비스 재시작"
  rsh "sudo systemctl restart $SERVICE"
  ok "재시작 명령 전송"

  step "기동 확인"
  if health; then return 0; fi

  warn "응답 없음 — 앱 로그 마지막 20줄:"
  rsh "journalctl -u $SERVICE --no-pager -n 20 | sed 's/^/    /'" || true
  return 1
}

rollback() {
  step "롤백"
  rsh "test -f $REMOTE_DIR/$JAR.prev" \
    || die "이전 버전($JAR.prev)이 없어 롤백할 수 없습니다."
  rsh "cd $REMOTE_DIR && cp -f $JAR $JAR.failed && mv -f $JAR.prev $JAR"
  ok "이전 jar로 교체 (실패본은 $JAR.failed 로 보관)"
  restart_and_verify || die "롤백 후에도 기동하지 못했습니다. 서버를 직접 확인하세요."
  ok "롤백 완료"
}

# ── 인자 처리 ────────────────────────────────────────────────
DO_BUILD=1
case "${1:-}" in
  --no-build) DO_BUILD=0 ;;
  --rollback) rollback; show_status; exit 0 ;;
  --status)   show_status; exit 0 ;;
  --help|-h)  sed -n '2,12p' "$0" | sed 's/^# \?//'; exit 0 ;;
  '')         ;;
  *)          die "알 수 없는 옵션: $1  (--help 참고)" ;;
esac

# ── 사전 점검 ────────────────────────────────────────────────
step "사전 점검"
[[ -f $KEY ]] || die "SSH 키가 없습니다: $KEY"
[[ -f pom.xml ]] || die "프로젝트 루트에서 실행하세요 (pom.xml 없음)"
rsh 'true' 2>/dev/null || die "서버에 접속할 수 없습니다 ($SSH_USER@$HOST)"
ok "SSH 접속 정상"
rsh "sudo -n true" 2>/dev/null || die "서버에서 sudo 권한을 쓸 수 없습니다"
ok "sudo 권한 정상"

# ── 빌드 ────────────────────────────────────────────────────
if (( DO_BUILD )); then
  step "빌드 (테스트 제외)"
  ./mvnw -q -Dmaven.test.skip=true package || die "빌드 실패 — 위 오류를 확인하세요."
  ok "빌드 완료"
fi
[[ -f $BUILD_JAR ]] || die "jar이 없습니다: $BUILD_JAR  (--no-build 를 뺐는지 확인)"
printf '  파일: %s (%s bytes)\n' "$BUILD_JAR" "$(stat -c %s "$BUILD_JAR")"

# ── 업로드 ──────────────────────────────────────────────────
step "업로드"
rcp "$BUILD_JAR" "$SSH_USER@$HOST:$REMOTE_DIR/$JAR.new"
LOCAL_SIZE=$(stat -c %s "$BUILD_JAR")
REMOTE_SIZE=$(rsh "stat -c %s $REMOTE_DIR/$JAR.new")
[[ $LOCAL_SIZE == "$REMOTE_SIZE" ]] || die "업로드 크기 불일치 ($LOCAL_SIZE vs $REMOTE_SIZE)"
ok "업로드 완료 및 크기 일치 ($REMOTE_SIZE bytes)"

# ── 교체 ────────────────────────────────────────────────────
step "jar 교체 (직전 버전 보관)"
rsh "cd $REMOTE_DIR && cp -f $JAR $JAR.prev 2>/dev/null || true; mv -f $JAR.new $JAR"
ok "교체 완료"

# ── 재시작 + 검증 ───────────────────────────────────────────
if restart_and_verify; then
  step "배포 성공"
  show_status
else
  warn "새 버전이 정상 기동하지 않았습니다. 자동 롤백합니다."
  rollback
  show_status
  die "배포 실패 — 이전 버전으로 되돌렸습니다."
fi
