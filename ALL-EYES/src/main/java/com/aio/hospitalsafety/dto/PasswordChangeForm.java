// PGH
package com.aio.hospitalsafety.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.nio.charset.StandardCharsets;

/**
 * 비밀번호 변경 HTML form의 입력값을 받는 DTO(Data Transfer Object)다.
 *
 * Domain인 User와 분리한 이유
 * - 화면에는 현재 PW와 PW 확인이 필요하지만 TB_EMP에는 저장하지 않는다.
 * - 화면 입력값만을 위한 검증 규칙을 계정 Domain과 분리할 수 있다.
 * - Controller가 DB 객체 전체를 직접 입력받지 않아 원하지 않는 필드 변경을 막는다.
 *
 * 이 객체는 요청 한 번 동안만 사용되며 세 비밀번호 원문을 DB에 저장하지 않는다.
 */
public class PasswordChangeForm {

    // 다른 사람이 로그인된 브라우저를 잠시 사용하더라도 바로 PW를 바꾸지 못하게 현재 PW를 확인한다.
    // @NotBlank는 null, 빈 문자열(""), 공백만 있는 문자열("   ")을 모두 거부한다.
    @NotBlank(message = "비밀번호를 입력해 주세요.")
    private String currentPassword;

    @NotBlank(message = "새 비밀번호를 입력해 주세요.")
    // 정규식 해석:
    // ^                    문자열 시작
    // (?=.*[A-Za-z])       영문이 최소 한 글자 존재
    // (?=.*\d)             숫자가 최소 한 글자 존재(Java 문자열에서는 역슬래시를 두 번 작성)
    // .{8,32}              전체 길이는 8자 이상 32자 이하
    // $                    문자열 끝
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).{8,32}$",
            message = "비밀번호는 영문과 숫자를 포함해 8~32자로 입력해 주세요.")
    private String newPassword;

    // PW 확인값은 입력 실수 확인용이며 요구사항대로 DB에 저장하거나 Mapper로 전달하지 않는다.
    @NotBlank(message = "새 비밀번호 확인을 입력해 주세요.")
    private String passwordConfirm;

    // @AssertTrue는 이 메서드의 반환값이 true인지 검사한다.
    // 필드 하나가 아니라 newPassword와 passwordConfirm 두 값을 함께 검증할 때 사용한다.
    @AssertTrue(message = "새 비밀번호와 비밀번호 확인이 일치하지 않습니다.")
    public boolean isPasswordMatching() {
        return newPassword != null && newPassword.equals(passwordConfirm);
    }

    // BCrypt의 72바이트 입력 제한을 한글 등 다중 바이트 문자까지 고려해 검사한다.
    // 화면의 maxlength="32"는 글자 수만 제한하므로 서버에서 UTF-8 바이트 수를 별도 검사한다.
    @AssertTrue(message = "비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.")
    public boolean isPasswordByteLengthValid() {
        // null은 @NotBlank가 담당하므로 이 검증에서는 중복 오류를 만들지 않고 true로 처리한다.
        return newPassword == null || newPassword.getBytes(StandardCharsets.UTF_8).length <= 72;
    }

    // Spring MVC와 Thymeleaf는 아래 getter/setter를 이용해 HTML 폼 값과 DTO를 연결한다.
    public String getCurrentPassword() { return currentPassword; }
    public void setCurrentPassword(String currentPassword) { this.currentPassword = currentPassword; }
    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String newPassword) { this.newPassword = newPassword; }
    public String getPasswordConfirm() { return passwordConfirm; }
    public void setPasswordConfirm(String passwordConfirm) { this.passwordConfirm = passwordConfirm; }
}
