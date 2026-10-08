package com.aio.hospitalsafety.controller.edge;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 젯슨 API 오류를 {"message": ..., "errors": [...]} JSON 으로 돌려준다.
 * 이벤트 요청이 400 이면 젯슨 전송기는 그 줄을 보류 파일로 빼고 다음 줄을 보낸다.
 * 세션 요청이 400 이면 등록될 때까지 계속 다시 보낸다(그동안 이벤트 전송이 멈춘다).
 * [2026.09.28] 영상 업로드(EdgeMediaController)도 같은 모양으로 돌려준다. 영상 400 이면 젯슨은 그 영상을 다시 올리지 않는다.
 */
@RestControllerAdvice(assignableTypes = {EdgeController.class, EdgeMediaController.class})
public class EdgeApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException exception) {
        List<String> errors = new ArrayList<>();
        for (FieldError error : exception.getBindingResult().getFieldErrors()) {
            errors.add(error.getField() + ": " + error.getDefaultMessage());
        }
        return badRequest("요청 형식이 올바르지 않습니다.", errors);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException exception) {
        // JSON 문법 오류, UUID·시각 형식 오류 등
        return badRequest("요청 JSON 을 읽을 수 없습니다.", List.of());
    }

    /**
     * DB 제약 위반 등 저장할 수 없는 값. 이벤트 요청에서 500 을 주면 젯슨이 같은 줄을 계속 다시 보내서
     * 뒤의 이벤트까지 막히므로 400 으로 알려 그 줄만 보류 파일로 빼게 한다.
     * DB 연결이 끊긴 것 같은 일시적인 오류는 여기에 해당하지 않아 500 으로 나가고, 젯슨이 다시 보낸다.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrity(DataIntegrityViolationException exception) {
        return badRequest("저장할 수 없는 값입니다.", List.of());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", exception.getReason());
        return ResponseEntity.status(exception.getStatusCode()).body(body);
    }

    private ResponseEntity<Map<String, Object>> badRequest(String message, List<String> errors) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("errors", errors);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }
}
