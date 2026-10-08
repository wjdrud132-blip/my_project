"use strict";

/* [09.13]추가내용: CSV 내보내기 값의 따옴표 처리와 수식 입력 방지를 전용 모듈로 분리합니다. */
window.CareGuardRecordExport = {
  escapeCsv(value) {
    let text = String(value ?? "");
    if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
};
