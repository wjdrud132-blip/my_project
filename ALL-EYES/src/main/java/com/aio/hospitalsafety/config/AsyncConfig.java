package com.aio.hospitalsafety.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * @Async 메서드를 따로 도는 작업으로 실행한다.
 * 낙상 SMS 발송이 젯슨 응답을 늦추지 않게 하려고 쓴다(SmsService.sendFallSms).
 */
@Configuration
@EnableAsync
public class AsyncConfig {
}
