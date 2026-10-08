package com.aio.hospitalsafety.mapper.edge;

import com.aio.hospitalsafety.dto.edge.MediaEventRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.OffsetDateTime;

/**
 * [2026.09.28] 낙상 이벤트 영상(TB_EVENT_MEDIA) 저장과 삭제에 쓰는 매퍼.
 * 이벤트 ID 는 문자열로 넘기고 SQL 에서 UUID 로 CAST 한다(EdgeMapper 와 같은 방식).
 */
@Mapper
public interface EventMediaMapper {

    /** 이벤트 종류와 그 이벤트의 조치(있으면). 없는 이벤트면 null */
    MediaEventRow findMediaEvent(@Param("eventId") String eventId);

    /** 이 이벤트의 영상 행이 이미 있는지 */
    boolean existsEventMedia(@Param("eventId") String eventId);

    /** 영상 행을 READY 로 저장한다. 같은 이벤트의 행이 이미 있으면 저장하지 않고 0 을 돌려준다. */
    int insertReadyEventMedia(
            @Param("eventId") String eventId,
            @Param("storageUri") String storageUri,
            @Param("clipStartAt") OffsetDateTime clipStartAt,
            @Param("clipEndAt") OffsetDateTime clipEndAt,
            @Param("sizeBytes") long sizeBytes);

    /** 영상 파일 이름(저장 폴더 기준). 행이 없으면 null */
    String findStorageUri(@Param("eventId") String eventId);

    /** [2026.09.29 병합] 관리자 영상 보관함용: 그 병원의 이벤트이고 READY 인 영상의 파일 이름. 없으면 null */
    String findReadyStorageUriForHospital(@Param("eventId") String eventId, @Param("hospitalId") String hospitalId);

    /** [2026.09.29] 관리자가 영상 보관함에서 처음 재생한 기록(viewed_at, viewed_by). 기록한 행 수(0 또는 1) */
    int markViewed(@Param("eventId") String eventId, @Param("hospitalId") String hospitalId, @Param("adminId") String adminId);

    /** 영상 행을 지운다. 지운 행 수(0 또는 1) */
    int deleteEventMedia(@Param("eventId") String eventId);
}
