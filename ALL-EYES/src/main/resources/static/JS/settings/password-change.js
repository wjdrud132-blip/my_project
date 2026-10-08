    // 입력한 비밀번호는 로그인한 계정의 DB 비밀번호와 서버에서 비교한다.
    const initialPassword = document.getElementById("currentPassword");
    const verifyButton = document.getElementById("verify-initial-password");
    const initialResult = document.getElementById("initial-password-result");
    let initialInputVersion = 0;

    function showInitialResult(message, matches) {
      initialResult.hidden = false;
      initialResult.textContent = message;
      initialResult.classList.toggle("is-valid", matches === true);
      initialResult.classList.toggle("is-invalid", matches === false);
      initialPassword.setAttribute("aria-invalid", String(matches === false));
    }

    initialPassword.addEventListener("input", () => {
      initialInputVersion += 1;
      initialResult.hidden = true;
      initialResult.textContent = "";
      initialPassword.removeAttribute("aria-invalid");
    });

    verifyButton.addEventListener("click", async () => {
      if (verifyButton.disabled) return;
      if (!initialPassword.value) {
        showInitialResult(initialPassword.placeholder, false);
        initialPassword.focus();
        return;
      }
      const csrf = document.querySelector('meta[name="_csrf"]')?.content;
      const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content;
      if (!csrf || !csrfHeader) {
        showInitialResult("서버에 로그인한 후 비밀번호를 확인해 주세요.", null);
        return;
      }
      const version = initialInputVersion;
      verifyButton.disabled = true;
      verifyButton.textContent = "확인 중…";
      initialResult.hidden = true;
      try {
        const response = await fetch(verifyButton.dataset.verifyUrl, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {"Accept": "application/json", [csrfHeader]: csrf},
          body: new URLSearchParams({initialPassword: initialPassword.value})
        });
        if (version !== initialInputVersion) return;
        if (response.redirected || response.status === 401) {
          throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        }
        if (response.status === 403) {
          throw new Error("보안 정보가 만료되었습니다. 새로고침 후 다시 확인해 주세요.");
        }
        if (!response.ok) throw new Error("비밀번호 확인에 실패했습니다. 다시 시도해 주세요.");
        const result = await response.json();
        if (version !== initialInputVersion) return;
        if (typeof result.matches !== "boolean") throw new Error("비밀번호 확인에 실패했습니다.");
        showInitialResult(result.matches ? "비밀번호가 일치합니다." : "비밀번호가 일치하지않습니다", result.matches);
      } catch (error) {
        if (version === initialInputVersion) {
          showInitialResult(error.message || "연결 상태를 확인하고 다시 시도해 주세요.", null);
        }
      } finally {
        verifyButton.disabled = false;
        verifyButton.textContent = "비밀번호 확인";
      }
    });

    // 비밀번호 변경 화면의 입력 조건과 표시 버튼을 처리한다.
    const password = document.getElementById("newPassword");
    const confirmation = document.getElementById("passwordConfirm");

    const letterRule = document.getElementById("rule-letter");
    const numberRule = document.getElementById("rule-number");
    const lengthRule = document.getElementById("rule-length");
    const matchMessage = document.getElementById("password-match");

    function updateRule(element, label, passed) {
      element.classList.toggle("is-valid", passed);
      element.textContent = label;
    }

    function validatePasswords() {
      const value = password.value;
      const hasConfirmation = confirmation.value !== "";
      const matches = value === confirmation.value;

      updateRule(letterRule, "영문 포함", /[A-Za-z]/.test(value));
      updateRule(numberRule, "숫자 포함", /[0-9]/.test(value));
      updateRule(lengthRule, "8자 이상", value.length >= 8);

      confirmation.setCustomValidity(
        hasConfirmation && !matches
          ? "비밀번호가 일치하지 않습니다."
          : ""
      );

      matchMessage.classList.toggle(
        "is-valid",
        hasConfirmation && matches
      );

      matchMessage.classList.toggle(
        "is-invalid",
        hasConfirmation && !matches
      );

      confirmation.setAttribute(
        "aria-invalid",
        String(hasConfirmation && !matches)
      );

      if (!hasConfirmation) {
        matchMessage.textContent =
          "새 비밀번호와 일치하는지 확인해 주세요.";
      } else if (matches) {
        matchMessage.textContent = "비밀번호가 일치합니다.";
      } else {
        matchMessage.textContent = "비밀번호가 일치하지 않습니다.";
      }
    }

    password.addEventListener("input", validatePasswords);
    confirmation.addEventListener("input", validatePasswords);
    password.addEventListener("change", validatePasswords);
    confirmation.addEventListener("change", validatePasswords);

    // 각 입력란의 비밀번호 표시·숨김
    document.querySelectorAll(".password-toggle").forEach((button) => {
      const input = document.getElementById(
        button.getAttribute("aria-controls")
      );

      button.addEventListener("click", () => {
        const showPassword = input.type === "password";

        input.type = showPassword ? "text" : "password";
        button.setAttribute("aria-pressed", String(showPassword));
      });
    });

    validatePasswords();
