package com.aio.hospitalsafety.dto.admin;

/**
 * [2026.09.30 추가] 간병인 등록 값. TB_CAREGIVER 에 넣은 뒤 새 CAREGIVER_ID 를 돌려받는다(useGeneratedKeys).
 */
public class CaregiverInsert {

    private Long caregiverId;
    private final String hospitalDomain;
    private final String caregiverName;
    private final Long locationId;
    private final String phoneNumber;

    public CaregiverInsert(String hospitalDomain, String caregiverName, Long locationId, String phoneNumber) {
        this.hospitalDomain = hospitalDomain;
        this.caregiverName = caregiverName;
        this.locationId = locationId;
        this.phoneNumber = phoneNumber;
    }

    public Long getCaregiverId() {
        return caregiverId;
    }

    public void setCaregiverId(Long caregiverId) {
        this.caregiverId = caregiverId;
    }

    public String getHospitalDomain() {
        return hospitalDomain;
    }

    public String getCaregiverName() {
        return caregiverName;
    }

    public Long getLocationId() {
        return locationId;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }
}
