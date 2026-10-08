package com.aio.hospitalsafety.service.admin;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aio.hospitalsafety.dto.UserDto;
import com.aio.hospitalsafety.mapper.admin.AdminMapper;
import com.aio.hospitalsafety.mapper.admin.CaregiverMapper;

@Service
public class AdminService {

    private final AdminMapper adminMapper;
    private final CaregiverMapper caregiverMapper;

    public AdminService(AdminMapper adminMapper, CaregiverMapper caregiverMapper) {
        this.adminMapper = adminMapper;
        this.caregiverMapper = caregiverMapper;
    }

    @Transactional(readOnly = true)
    public List<UserDto> findUsers(String hospitalDomain, String jobType) {
        // [2026.09.30 변경] 간병인은 명세의 TB_CAREGIVER 에서 읽는다.
        if ("CAREGIVER".equals(jobType)) {
            return caregiverMapper.findCaregiverUsers(hospitalDomain);
        }
        return adminMapper.findUsersByHospital(hospitalDomain, jobType);
    }

    @Transactional
    public boolean approveUser(String hospitalDomain, String userId) {
        return adminMapper.approveUser(hospitalDomain, userId) == 1;
    }

    @Transactional
    public boolean rejectUser(String hospitalDomain, String userId) {
        return adminMapper.rejectUser(hospitalDomain, userId) == 1;
    }
}
