// [2026.09.20] 입력값만 지우고 포커스를 돌려줍니다. 로그인·도메인 제출 동작은 유지합니다.
document.querySelectorAll('.auth-clear').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    if (!input || input.disabled || input.readOnly) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
});
