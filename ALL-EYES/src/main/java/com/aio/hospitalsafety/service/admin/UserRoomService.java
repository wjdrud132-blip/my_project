package com.aio.hospitalsafety.service.admin;

import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aio.hospitalsafety.dto.admin.RoomLocation;
import com.aio.hospitalsafety.mapper.admin.UserRoomMapper;

/**
 * [2026.09.30 추가] 간호사 담당 병실(tb_emp_location → tb_location).
 *
 * - 간호사는 병동에 배정된 뒤 그 병동의 병실을 담당한다. 한 간호사가 여러 병실을, 한 병실을 여러 간호사가 담당할 수 있다.
 * - 담당 병실은 선택 사항이다(병원에 따라 병실 담당을 두지 않을 수 있다).
 * - 병실은 간병인(TB_CAREGIVER)과 같이 TB_LOCATION 의 병실 위치로 가리킨다. 화면은 번호(301)로 주고받고, 위치 이름은 '301호' 모양이다.
 * 확정 낙상 SMS 는 병실 낙상이면 그 병실 담당 간호사 전원과 담당 간병인에게, 담당 간호사가 없으면 병동 간호사 전원에게 보낸다(SmsService).
 */
@Service
public class UserRoomService {

    // 병동 이름 맨 앞의 숫자(예: '3병동' → 3). 대시보드·간병인 병실과 같은 규칙이다.
    private static final Pattern WARD_NUMBER = Pattern.compile("^(\\d+)병동$");

    private final UserRoomMapper userRoomMapper;

    public UserRoomService(UserRoomMapper userRoomMapper) {
        this.userRoomMapper = userRoomMapper;
    }

    /**
     * 간호사의 담당 병실을 주어진 목록으로 바꾼다. 빈 목록이면 담당 병실을 모두 지운다.
     * 호출하는 쪽의 트랜잭션 안에서 계정 생성·병동 변경과 함께 저장된다.
     */
    @Transactional
    public void replaceRooms(String hospitalDomain, String userId, Long wardId, List<Integer> roomNumbers) {
        List<String> locationNames = normalizeRooms(hospitalDomain, wardId, roomNumbers);
        List<Long> locationIds = List.of();

        if (!locationNames.isEmpty()) {
            Map<String, Long> found = userRoomMapper.findRoomLocations(hospitalDomain, wardId, locationNames).stream()
                    .collect(Collectors.toMap(RoomLocation::locationName, RoomLocation::locationId));
            List<String> missing = locationNames.stream().filter(name -> !found.containsKey(name)).toList();
            if (!missing.isEmpty()) {
                throw new IllegalArgumentException("병실 위치로 등록되지 않은 병실입니다: " + String.join(", ", missing));
            }
            locationIds = locationNames.stream().map(found::get).toList();
        }

        userRoomMapper.deleteUserRooms(userId);
        for (Long locationId : locationIds) {
            userRoomMapper.insertUserRoom(userId, locationId);
        }
    }

    // 관리 이력용: 지금 담당 병실 이름(예: ['301호', '302호'])
    @Transactional(readOnly = true)
    public List<String> roomNamesOf(String userId) {
        return userRoomMapper.findUserRoomNames(userId);
    }

    // 관리 이력용: ['301호', '302호'] → '301·302호', 없으면 '없음'
    public static String formatRooms(List<String> roomNames) {
        if (roomNames == null || roomNames.isEmpty()) {
            return "없음";
        }
        return roomNames.stream().map(name -> name.replace("호", "")).collect(Collectors.joining("·")) + "호";
    }

    // 관리 이력용: 병동 이름
    @Transactional(readOnly = true)
    public String wardNameOf(String hospitalDomain, Long wardId) {
        return wardId == null ? null : userRoomMapper.findWardName(hospitalDomain, wardId);
    }

    // 비활성화할 때 담당 병실을 비운다(비활성화한 간호사에게는 어차피 문자가 가지 않는다).
    @Transactional
    public void clearRooms(String userId) {
        userRoomMapper.deleteUserRooms(userId);
    }

    // 301 → '301호'. 병동 번호와 병실 번호가 맞는지(3병동이면 301~317) 확인한다.
    private List<String> normalizeRooms(String hospitalDomain, Long wardId, List<Integer> roomNumbers) {
        if (roomNumbers == null || roomNumbers.isEmpty()) {
            return List.of();
        }

        String wardName = userRoomMapper.findWardName(hospitalDomain, wardId);
        if (wardName == null) {
            throw new IllegalArgumentException("현재 병원에 속한 병동을 선택해 주세요.");
        }
        Matcher matcher = WARD_NUMBER.matcher(wardName.replace(" ", ""));
        if (!matcher.matches()) {
            throw new IllegalArgumentException(wardName + "은(는) 담당 병실을 지정할 수 없는 병동입니다.");
        }
        int wardNumber = Integer.parseInt(matcher.group(1));

        TreeSet<Integer> rooms = new TreeSet<>();
        for (Integer roomNumber : roomNumbers) {
            if (roomNumber == null || roomNumber / 100 != wardNumber
                    || roomNumber % 100 < 1 || roomNumber % 100 > 17) {
                throw new IllegalArgumentException(
                        wardNumber + "병동은 " + (wardNumber * 100 + 1) + "~" + (wardNumber * 100 + 17)
                                + "호 중에서 선택해 주세요.");
            }
            rooms.add(roomNumber);
        }
        return rooms.stream().map(room -> room + "호").toList();
    }
}
