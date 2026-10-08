package com.aio.hospitalsafety.controller.edge;

import com.aio.hospitalsafety.service.edge.EventMediaService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;

/**
 * [2026.09.28] 젯슨이 낙상 이벤트 영상(이벤트 앞 10초 + 뒤 10초, 8Hz MJPG .avi)을 올리는 API.
 *
 * POST /api/edge/events/{eventId}/media (multipart/form-data)
 *   file        : 영상 파일(.avi)
 *   clipStartAt : 영상 첫 장면 시각(ISO-8601, 시간대 포함. 예 2026-09-28T16:00:00+09:00)
 *   clipEndAt   : 영상 마지막 장면 시각(같은 형식, clipStartAt 보다 뒤)
 *   frameCount  : 장면 수(선택, 로그에만 남긴다)
 *
 * 장치 키(X-Edge-Key)는 다른 /api/edge/** 와 같이 EdgeSecurityConfig 가 확인한다(없거나 틀리면 401).
 *
 * 응답 코드 (젯슨 업로더: 2xx·409·400·413 이면 끝, 404·428·5xx·네트워크 오류면 나중에 다시 올린다)
 * 201 {"stored":true}                       새로 저장
 * 200 {"stored":false,"reason":"dismissed"} 이미 '확인'·오경보로 끈 낙상이라 저장하지 않음
 * 409                                       이미 받은 영상
 * 400                                       이벤트 ID·시각 형식 오류, 빈 파일, 낙상이 아닌 이벤트(침대 이탈 등)
 * 413                                       파일이 너무 큼(application.properties 의 multipart 한도, 50MB)
 * 428                                       서버에 아직 없는 이벤트(이벤트 API 의 "등록되지 않은 실행 세션"과 같은 뜻)
 */
@RestController
@RequestMapping("/api/edge")
public class EdgeMediaController {

    private final EventMediaService eventMediaService;

    public EdgeMediaController(EventMediaService eventMediaService) {
        this.eventMediaService = eventMediaService;
    }

    @PostMapping("/events/{eventId}/media")
    public ResponseEntity<Map<String, Object>> uploadMedia(
            @PathVariable String eventId,
            // 빠진 값도 400 JSON 으로 같은 모양의 안내를 주려고 모두 required = false 로 받고 아래에서 직접 확인한다.
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "clipStartAt", required = false) String clipStartAt,
            @RequestParam(value = "clipEndAt", required = false) String clipEndAt,
            @RequestParam(value = "frameCount", required = false) String frameCount) {

        String checkedEventId = parseEventId(eventId);
        if (file == null || file.isEmpty()) {
            throw badRequest("영상 파일(file)이 없거나 비어 있습니다.");
        }
        OffsetDateTime start = parseTime("clipStartAt", clipStartAt);
        OffsetDateTime end = parseTime("clipEndAt", clipEndAt);
        if (!end.isAfter(start)) {
            throw badRequest("clipEndAt 은 clipStartAt 보다 뒤여야 합니다.");
        }
        Integer frames = parseFrameCount(frameCount);

        EventMediaService.StoreResult result =
                eventMediaService.storeClip(checkedEventId, file, start, end, frames);

        return switch (result) {
            case STORED -> ResponseEntity.status(HttpStatus.CREATED)
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("stored", true));
            case DISMISSED -> ResponseEntity.ok()
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("stored", false, "reason", "dismissed"));
            case DUPLICATE -> ResponseEntity.status(HttpStatus.CONFLICT)
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("message", "이미 받은 영상입니다.", "eventId", checkedEventId));
        };
    }

    private String parseEventId(String eventId) {
        try {
            return UUID.fromString(eventId).toString();
        } catch (IllegalArgumentException exception) {
            throw badRequest("이벤트 ID 형식이 올바르지 않습니다.");
        }
    }

    private OffsetDateTime parseTime(String name, String value) {
        if (value == null || value.isBlank()) {
            throw badRequest(name + " 이 없습니다.");
        }
        try {
            return OffsetDateTime.parse(value.trim());
        } catch (DateTimeParseException exception) {
            throw badRequest(name + " 형식이 올바르지 않습니다(예: 2026-09-28T16:00:00+09:00).");
        }
    }

    private Integer parseFrameCount(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            int frames = Integer.parseInt(value.trim());
            if (frames < 0) {
                throw badRequest("frameCount 는 0 이상이어야 합니다.");
            }
            return frames;
        } catch (NumberFormatException exception) {
            throw badRequest("frameCount 형식이 올바르지 않습니다.");
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
