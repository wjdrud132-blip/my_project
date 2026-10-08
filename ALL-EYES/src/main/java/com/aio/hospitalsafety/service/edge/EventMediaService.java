package com.aio.hospitalsafety.service.edge;

import com.aio.hospitalsafety.common.EventTypes;
import com.aio.hospitalsafety.dto.edge.MediaEventRow;
import com.aio.hospitalsafety.mapper.edge.EventMediaMapper;
import com.aio.hospitalsafety.service.action.EventActionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;

/**
 * [2026.09.28] 낙상 이벤트 영상(젯슨이 이벤트 10초 뒤에 올리는 .avi 한 개)을 저장하고 지운다.
 *
 * 파일은 설정 event-media.storage-dir 폴더에 "이벤트ID.avi" 로 두고, DB(tb_event_media)에는 그 파일 이름만 남긴다.
 * 소스 폴더나 target 밖에 두는 이유: 개발 서버(DevTools)가 파일 변화를 보고 저절로 재시작하지 않게 하려고.
 *
 * '확인'·오경보로 끈 낙상의 영상은 남기지 않는다.
 * - 업로드 쪽: 영상 행을 저장(커밋)한 뒤 조치를 다시 본다. 이미 '확인'됐으면 행과 파일을 지운다.
 * - 조치 쪽(EventActionController): 조치를 저장(커밋)한 뒤 영상 행이 있으면 지운다.
 * 두 쪽 모두 "내 것을 먼저 저장하고, 그다음 상대 것을 읽는다". 그래서 동시에 일어나도 적어도 한쪽은 상대를 보고 지운다.
 * 이 순서가 깨지지 않도록 이 클래스에는 @Transactional 을 붙이지 않는다(매퍼 호출 하나하나가 바로 커밋된다).
 */
@Service
public class EventMediaService {

    private static final Logger log = LoggerFactory.getLogger(EventMediaService.class);

    private static final String FILE_EXTENSION = ".avi";

    /** 업로드 결과. 컨트롤러가 응답 코드를 정한다. */
    public enum StoreResult {
        STORED,     // 새로 저장함 (201)
        DISMISSED,  // '확인'·오경보로 끈 낙상이라 저장하지 않음(또는 저장 직후 지움) (200)
        DUPLICATE   // 이미 받은 영상 (409)
    }

    private final EventMediaMapper eventMediaMapper;
    private final Path storageDir;

    public EventMediaService(
            EventMediaMapper eventMediaMapper,
            @Value("${event-media.storage-dir}") String storageDir) {
        this.eventMediaMapper = eventMediaMapper;
        this.storageDir = Path.of(storageDir).toAbsolutePath().normalize();
    }

    /**
     * 영상 한 개를 저장한다. eventId 는 컨트롤러가 UUID 형식을 확인한 값이다.
     * 400·428 은 ResponseStatusException 으로 알린다.
     */
    public StoreResult storeClip(
            String eventId,
            MultipartFile file,
            OffsetDateTime clipStartAt,
            OffsetDateTime clipEndAt,
            Integer frameCount) {

        // 1. 이벤트 확인
        MediaEventRow event = eventMediaMapper.findMediaEvent(eventId);
        if (event == null) {
            // 이벤트가 아직 서버에 없다(젯슨이 이벤트를 아직 못 보냈거나 보내는 중).
            // 이벤트 API 의 "등록되지 않은 실행 세션"과 같은 뜻으로 428 을 준다. 젯슨은 나중에 다시 올린다.
            throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                    "아직 등록되지 않은 이벤트입니다. 이벤트가 저장된 뒤 다시 올려 주세요: " + eventId);
        }
        if (!EventTypes.FALL.equals(event.eventType())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "낙상 이벤트만 영상을 받습니다: " + event.eventType());
        }
        if (EventActionService.isDismissal(event.patientName(), event.actionContent())) {
            log.info("이미 확인·오경보로 처리된 낙상이라 영상을 저장하지 않습니다. eventId={} size={}바이트", eventId, file.getSize());
            return StoreResult.DISMISSED;
        }
        if (eventMediaMapper.existsEventMedia(eventId)) {
            return StoreResult.DUPLICATE;
        }

        // 2. 파일 쓰기: 같은 폴더의 임시 파일에 다 쓴 뒤 한 번에 이름을 바꾼다(반쯤 쓴 파일이 저장본으로 보이지 않게).
        String fileName = eventId + extensionOf(file);
        Path target = storageDir.resolve(fileName);
        long size = writeFile(file, target, eventId);

        // 3. DB 저장. 실패하면 방금 쓴 파일을 지우고(행이 없을 때만) 오류를 그대로 올린다(500 이면 젯슨이 다시 올린다).
        int inserted;
        try {
            inserted = eventMediaMapper.insertReadyEventMedia(eventId, fileName, clipStartAt, clipEndAt, size);
        } catch (RuntimeException exception) {
            if (!eventMediaMapper.existsEventMedia(eventId)) {
                deleteFileQuietly(target, eventId);
            }
            throw exception;
        }

        // 4. 저장이 커밋된 뒤 조치를 다시 본다. 그사이 '확인'·오경보가 등록됐으면 행과 파일을 지운다.
        MediaEventRow latest = eventMediaMapper.findMediaEvent(eventId);
        boolean dismissedNow = latest != null
                && EventActionService.isDismissal(latest.patientName(), latest.actionContent());
        if (dismissedNow) {
            deleteClip(eventId);
            log.info("저장 직후 확인·오경보가 등록돼 영상을 지웠습니다. eventId={} size={}바이트", eventId, size);
            return StoreResult.DISMISSED;
        }

        if (inserted == 0) {
            // 같은 영상이 동시에 두 번 올라와 다른 요청이 먼저 저장했다.
            // 파일 이름이 같으므로(이벤트ID.avi) 방금 쓴 파일이 곧 저장본이다. 지우지 않는다.
            return StoreResult.DUPLICATE;
        }

        log.info("낙상 영상 저장 eventId={} size={}바이트 frames={}", eventId, size, frameCount);
        return StoreResult.STORED;
    }

    /**
     * 이벤트의 영상 행과 파일을 지운다. 행이 없으면 아무것도 하지 않는다.
     * 파일을 못 지우면 경고만 남긴다(행은 이미 지워졌으므로 화면·DB 에는 영상이 없는 것으로 보인다).
     */
    public void deleteClip(String eventId) {
        String storageUri = eventMediaMapper.findStorageUri(eventId);
        int deleted = eventMediaMapper.deleteEventMedia(eventId);
        if (deleted == 0) {
            return;
        }
        if (storageUri != null) {
            Path file = resolveInStorage(storageUri);
            if (file == null) {
                log.warn("영상 파일 경로가 저장 폴더 밖이라 지우지 않았습니다. eventId={}", eventId);
            } else {
                deleteFileQuietly(file, eventId);
            }
        }
        log.info("영상 행과 파일을 지웠습니다. eventId={}", eventId);
    }

    private long writeFile(MultipartFile file, Path target, String eventId) {
        Path temp = null;
        try {
            Files.createDirectories(storageDir);
            temp = Files.createTempFile(storageDir, eventId + "-", ".part");
            long size;
            try (InputStream in = file.getInputStream()) {
                size = Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
            return size;
        } catch (IOException exception) {
            // 디스크 문제 등. 500 으로 나가고 젯슨이 나중에 다시 올린다.
            throw new UncheckedIOException("영상 파일을 쓰지 못했습니다. eventId=" + eventId, exception);
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException exception) {
                    log.warn("임시 영상 파일을 지우지 못했습니다. eventId={}", eventId);
                }
            }
        }
    }

    /** DB 에 적힌 이름을 저장 폴더 안의 경로로 바꾼다. 폴더 밖을 가리키면 null */
    /**
     * [2026.09.29 병합] 관리자 영상 보관함용 영상 파일. 그 병원의 READY 영상이고 파일이 실제로 있으면 경로, 아니면 null.
     */
    public Path findClipFile(String eventId, String hospitalId) {
        String storageUri = eventMediaMapper.findReadyStorageUriForHospital(eventId, hospitalId);
        if (storageUri == null) {
            return null;
        }
        Path file = resolveInStorage(storageUri);
        return file != null && Files.isRegularFile(file) ? file : null;
    }

    /**
     * [2026.09.29] 관리자 영상 보관함에서 재생 버튼을 처음 누르면 '확인 완료'로 남긴다(tb_event_media.viewed_at, viewed_by).
     * 그 병원의 READY 영상이 아니면 false. 이미 확인된 영상이면 처음 기록을 그대로 두고 true.
     */
    public boolean markViewed(String eventId, String hospitalId, String adminId) {
        if (eventMediaMapper.markViewed(eventId, hospitalId, adminId) == 1) {
            log.info("영상 확인 기록 eventId={} adminId={}", eventId, adminId);
            return true;
        }
        return eventMediaMapper.findReadyStorageUriForHospital(eventId, hospitalId) != null;
    }

    /**
     * [2026.09.29] 젯슨이 브라우저 재생용 mp4(H.264)로 바꿔 올리면 "이벤트ID.mp4", 아니면 예전처럼 "이벤트ID.avi" 로 저장한다.
     * 지울 때는 DB 의 storage_uri(파일 이름)를 쓰므로 확장자가 섞여 있어도 된다(deleteClip).
     */
    private static String extensionOf(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name != null && name.toLowerCase(java.util.Locale.ROOT).endsWith(".mp4") ? ".mp4" : FILE_EXTENSION;
    }

    private Path resolveInStorage(String storageUri) {
        Path file = storageDir.resolve(storageUri).normalize();
        return file.startsWith(storageDir) ? file : null;
    }

    private void deleteFileQuietly(Path file, String eventId) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException exception) {
            log.warn("영상 파일을 지우지 못했습니다. eventId={} 오류={}", eventId, exception.getClass().getSimpleName());
        }
    }
}
