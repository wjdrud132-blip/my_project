package com.aio.hospitalsafety.service;

import com.aio.hospitalsafety.dto.HospitalDto;
import com.aio.hospitalsafety.mapper.HospitalMapper;
import org.springframework.stereotype.Service;

@Service
public class HospitalService {

    private final HospitalMapper hospitalMapper;

    public HospitalService(HospitalMapper hospitalMapper) {
        this.hospitalMapper = hospitalMapper;
    }

    public HospitalDto findHospitalByDomain(String hospitalDomain) {
        if (hospitalDomain == null || hospitalDomain.isBlank()) {
            return null;
        }
        return hospitalMapper.findHospitalByDomain(hospitalDomain.strip());
    }
}
