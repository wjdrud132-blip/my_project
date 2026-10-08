package com.aio.hospitalsafety.mapper;

import com.aio.hospitalsafety.dto.HospitalDto;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface HospitalMapper {

    @Select("SELECT hosp_div_id AS hospital_domain, hosp_nm AS hospital_name "
            + "FROM public.tb_hospital WHERE hosp_div_id = #{hospitalDomain}")
    HospitalDto findHospitalByDomain(@Param("hospitalDomain") String hospitalDomain);
}
