package com.aio.hospitalsafety.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class RecordController {

    @GetMapping("/Record/content")
    public String recordContent(org.springframework.ui.Model model) {
        // [2026.09.17] 고친 내용: 대시보드 안에서 표시할 조치 이력 본문을 별도 주소로 제공합니다.
        model.addAttribute("embeddedRecordPage", true);
        return "html/record/record";
    }
}
