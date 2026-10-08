package com.aio.hospitalsafety;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication(scanBasePackages = "com.aio.hospitalsafety")
@MapperScan("com.aio.hospitalsafety.mapper")
public class HospitalSafetyApplication {

	public static void main(String[] args) {
		SpringApplication.run(HospitalSafetyApplication.class, args);
	}

}
