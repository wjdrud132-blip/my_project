document.addEventListener("DOMContentLoaded", () => {
  const form =
    document.getElementById("userLoginForm");

  const userLoginKey =
    document.getElementById("userLoginKey");

  const userId =
    document.getElementById("userId");

  const loginButton =
    form?.querySelector(".login-button");

  const loginLockMessage =
    document.getElementById("loginLockMessage");

  const loginLockCountdown =
    document.getElementById("loginLockCountdown");

  /*
   * 병원 ID와 사용자가 입력한 직원 ID를 합쳐
   * hospitalId|userId 형태로 Spring Security에 전달한다.
   */
  if (form && userLoginKey && userId) {
    const hospitalPrefix =
      userLoginKey.value;

    form.addEventListener("submit", () => {
      userLoginKey.value =
        hospitalPrefix + userId.value.trim();
    });
  }

  /*
   * 서버가 전달한 실제 잠금 종료 시각을 기준으로
   * 남은 시간을 1초마다 계산한다.
   *
   * 페이지를 새로고침해도 절대 종료 시각을 사용하므로
   * 다시 60초부터 시작하지 않는다.
   */
  if (
    !loginLockMessage
    || !loginLockCountdown
    || !loginButton
  ) {
    return;
  }

  const queryParameters =
    new URLSearchParams(window.location.search);

  const unlockAt =
    Number(queryParameters.get("unlockAt"));

  if (!Number.isFinite(unlockAt) || unlockAt <= 0) {
    return;
  }

  const updateCountdown = () => {
    const remainingSeconds =
      Math.max(
        0,
        Math.ceil(
          (unlockAt - Date.now()) / 1000
        )
      );

    loginLockCountdown.textContent =
      String(remainingSeconds);

    if (remainingSeconds > 0) {
      loginButton.disabled = true;
      loginButton.setAttribute(
        "aria-disabled",
        "true"
      );
      return false;
    }

    loginButton.disabled = false;
    loginButton.removeAttribute("aria-disabled");

    loginLockMessage.textContent =
      "로그인 제한이 해제되었습니다. 다시 로그인해 주세요.";

    return true;
  };

  if (updateCountdown()) {
    return;
  }

  const countdownTimer =
    window.setInterval(() => {
      if (updateCountdown()) {
        window.clearInterval(countdownTimer);
      }
    }, 1000);
});