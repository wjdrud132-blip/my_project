// PGH
package com.aio.hospitalsafety.controller;

import com.aio.hospitalsafety.dto.PasswordChangeForm;
import com.aio.hospitalsafety.common.SessionConstants;
import com.aio.hospitalsafety.config.HospitalUserDetails;
import com.aio.hospitalsafety.service.UserService;
import com.aio.hospitalsafety.service.UserService.PasswordChangeResult;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.http.ResponseEntity;
import java.util.Map;

/**
 * 비밀번호 관련 화면 요청을 처리하는 MVC Controller다.
 *
 * 로그인한 사용자의 현재 PW 확인 후 새 PW 변경을 담당한다.
 *
 * Controller는 HTTP 요청값 검사와 화면 이동을 담당하고,
 * 실제 사용자 조회·비밀번호 비교·DB 수정은 UserService에 위임한다.
 */
@Controller
public class UserPasswordController {

    // final 필드는 객체 생성 후 다른 Service로 바뀌지 않는다.
    private final UserService userService;

    /**
     * 생성자 주입 방식이다. Spring이 UserService Bean을 찾아 자동으로 전달한다.
     * 생성자가 하나뿐이면 @Autowired를 생략할 수 있다.
     */
    public UserPasswordController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/user/password/verify")
    @ResponseBody
    public ResponseEntity<Map<String, Boolean>> verifyInitialPassword(
            Authentication authentication, @RequestParam String initialPassword) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof HospitalUserDetails loginUser)) {
            return ResponseEntity.status(401).header("Cache-Control", "no-store").build();
        }
        boolean matches = userService.verifyInitialPassword(
                loginUser.getHospitalId(), loginUser.getUsername(), initialPassword);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("matches", matches));
    }

    /**
     * GET /user/password 요청으로 비밀번호 변경 폼을 보여준다.
     * SecurityConfig의 anyRequest().authenticated() 규칙 때문에 로그인 사용자만 접근할 수 있다.
     *
     * @param model PasswordChangeForm을 HTML에 전달할 Model
     */
    @GetMapping("/user/password")
    public String changePage(Model model, Authentication authentication) {
        model.addAttribute("initialPasswordChange", isInitialPasswordChange(authentication));
        // redirect 후 FlashAttribute로 전달된 객체가 있다면 덮어쓰지 않는다.
        if (!model.containsAttribute("passwordChangeForm")) {
            // 빈 DTO를 넣어야 HTML의 th:object="${passwordChangeForm}"이 정상 동작한다.
            model.addAttribute("passwordChangeForm", new PasswordChangeForm());
        }
        // [09.13]수정내용: 비밀번호 변경 화면을 settings 폴더의 파일로 연결합니다.
            return "html/settings/password-change";
    }

    /**
     * POST /user/password 요청을 처리한다.
     *
     * 처리 순서
     * 1. @Valid로 DTO 입력값을 검증한다.
     * 2. 세션에서 현재 직원 ID를 가져온다.
     * 3. UserService에서 현재 PW를 확인하고 새 PW를 BCrypt 해시로 변경한다.
     * 4. 성공하면 GET 요청으로 redirect한다.
     *
     * BindingResult는 반드시 @Valid 대상 바로 다음에 선언해야 해당 DTO의 오류를 받을 수 있다.
     */
    @PostMapping("/user/password")
    public String changePassword(
            Authentication authentication, // Spring Security Session에 저장된 로그인 정보
            @Valid @ModelAttribute("passwordChangeForm") PasswordChangeForm form, // HTML 폼 입력값을 담은 DTO
            BindingResult bindingResult,
            Model model,
            RedirectAttributes redirectAttributes,
            HttpServletRequest request,
            HttpServletResponse response) {
        boolean initialUserPassword = isInitialPasswordChange(authentication);
        model.addAttribute("initialPasswordChange", initialUserPassword);
        // Bean Validation에서 하나라도 실패했다면 Service와 DB를 호출하지 않는다.
        if (bindingResult.hasErrors()) {
            // 검증 실패 화면의 HTML에 사용자가 입력한 PW가 다시 포함되지 않도록 비운다.
            clearPasswordFields(form);
            // [09.13]수정내용: 비밀번호 변경 화면을 settings 폴더의 파일로 연결합니다.
            return "html/settings/password-change";
        }

        // Authentication#getName()에는 로그인에 사용한 직원 ID가 들어 있다.
        // Controller가 직접 BCrypt 처리나 SQL 호출을 하지 않고 Service에 요청한다.
        // 병원 선택용 임시 세션 값 대신 DB 인증을 완료한 직원의 소속 병원을 사용한다.
        if (!(authentication.getPrincipal() instanceof HospitalUserDetails userDetails)) {
            model.addAttribute("userError", "병원 로그인 정보가 없습니다. 다시 로그인해 주세요.");
            clearPasswordFields(form);
            // [09.13]수정내용: 비밀번호 변경 화면을 settings 폴더의 파일로 연결합니다.
            return "html/settings/password-change";
        }

        PasswordChangeResult result = userService.changePassword(
                userDetails.getHospitalId(), authentication.getName(), form.getCurrentPassword(), form.getNewPassword());

        if (result == PasswordChangeResult.SAME_PASSWORD) {
            bindingResult.rejectValue("newPassword", "same",
                    (initialUserPassword ? "초기" : "현재") + " 비밀번호와 다른 비밀번호를 입력해주세요.");
            clearPasswordFields(form);
            return "html/settings/password-change";
        }

        if (result == PasswordChangeResult.CURRENT_PASSWORD_MISMATCH) {
            // rejectValue는 특정 DTO 필드에 서버 측 오류 메시지를 추가한다.
            // password-change.html의 th:errors="*{currentPassword}"에서 출력된다.
            bindingResult.rejectValue("currentPassword", "mismatch", "비밀번호가 일치하지않습니다");
            clearPasswordFields(form);
            // [09.13]수정내용: 비밀번호 변경 화면을 settings 폴더의 파일로 연결합니다.
            return "html/settings/password-change";
        }
        if (result == PasswordChangeResult.USER_NOT_FOUND) {
            // 특정 필드 오류가 아니라 계정 전체 오류이므로 Model에 메시지를 넣는다.
            model.addAttribute("userError", "사용자 정보를 확인할 수 없습니다.");
            clearPasswordFields(form);
            // [09.13]수정내용: 비밀번호 변경 화면을 settings 폴더의 파일로 연결합니다.
            return "html/settings/password-change";
        }

        if (initialUserPassword) {
            clearPasswordFields(form);
            request.changeSessionId();
            redirectAttributes.addFlashAttribute("passwordChanged", true);
            return "redirect:/user/password";
        }

        String hospitalId = userDetails.getHospitalId();

        // 변경 성공 후 인증 정보와 기존 세션을 제거하고 새 비밀번호로 다시 로그인한다.
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        // 로그아웃으로 기존 세션이 삭제됐으므로 새 세션에 병원 정보만 다시 저장
        request.getSession(true).setAttribute(
                SessionConstants.HOSPITAL_DOMAIN,
                hospitalId
        );

        // 성공 여부만 쿼리 파라미터로 전달해 로그인 화면에서 변경 완료 안내를 표시한다.
        return "redirect:/login?role=USER&passwordChanged";
    }

    private boolean isInitialPasswordChange(Authentication authentication) {
        return authentication != null
                && authentication.getPrincipal() instanceof HospitalUserDetails loginUser
                && loginUser.getAuthorities().stream().anyMatch(a -> "ROLE_USER".equals(a.getAuthority()))
                && userService.isInitialUserPassword(loginUser.getHospitalId(), loginUser.getUsername());
    }

    /** 비밀번호 원문이 응답 HTML에 남지 않도록 DTO의 세 입력값을 제거한다. */
    private void clearPasswordFields(PasswordChangeForm form) {
        // null로 바꾸면 Thymeleaf가 렌더링할 때 password input의 value에 원문을 넣지 않는다.
        form.setCurrentPassword(null);
        form.setNewPassword(null);
        form.setPasswordConfirm(null);
    }
}




