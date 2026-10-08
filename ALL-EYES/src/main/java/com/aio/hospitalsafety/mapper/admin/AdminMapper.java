package com.aio.hospitalsafety.mapper.admin;

import java.util.List;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import com.aio.hospitalsafety.dto.UserDto;

@Mapper
public interface AdminMapper {

    @Select("""
            SELECT
                user_account.emp_id AS user_id,
                user_account.emp_nm AS name,
                COALESCE(ward.ward_nm, '미배정') AS ward,
                user_account.auth_st AS status
            FROM public.tb_emp user_account
            LEFT JOIN public.tb_ward ward
                ON ward.ward_id = user_account.ward_id
            WHERE user_account.hosp_div_id = #{hospitalDomain}
              AND user_account.role_cd = 'USER'
              AND user_account.auth_st IN ('PENDING', 'APPROVED')
            ORDER BY
                user_account.crt_dt DESC NULLS LAST,
                user_account.emp_id
            """)
    List<UserDto> findUsersByHospital(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("jobType") String jobType
    );

    @Update("""
            UPDATE public.tb_emp
            SET auth_st = 'APPROVED', upd_dt = CURRENT_TIMESTAMP
            WHERE emp_id = #{userId}
              AND hosp_div_id = #{hospitalDomain}
              AND role_cd = 'USER'
              AND auth_st = 'PENDING'
            """)
    int approveUser(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("userId") String userId
    );

    @Delete("""
            DELETE FROM public.tb_emp
            WHERE emp_id = #{userId}
              AND hosp_div_id = #{hospitalDomain}
              AND role_cd = 'USER'
              AND auth_st = 'PENDING'
            """)
    int rejectUser(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("userId") String userId
    );
}
