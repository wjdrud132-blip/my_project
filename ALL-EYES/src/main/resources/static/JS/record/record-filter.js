"use strict";

/* [09.13]추가내용: 조치 이력의 병동·상태·대상·검색어 조건 계산을 전용 모듈로 분리합니다. */
window.CareGuardRecordFilter = {
  // [2026-09-18] 추가 내용: 완성된 이름·초성·혼합 입력(김ㅁ)을 같은 이름 안에서 검색합니다.
  matchesName(name, keyword) {
    const normalize = value => String(value || "").normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase();
    const source = Array.from(normalize(name));
    const query = Array.from(normalize(keyword));
    const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    if (!query.length) return true;
    for (let start = 0; start <= source.length - query.length; start++) {
      if (query.every((letter, offset) => {
        const code = letter.codePointAt(0);
        const initial = code >= 0x1100 && code <= 0x1112 ? initials[code - 0x1100] : letter;
        const actual = source[start + offset];
        const actualCode = actual.codePointAt(0);
        if (initials.includes(initial) && actualCode >= 0xac00 && actualCode <= 0xd7a3) {
          return initials[Math.floor((actualCode - 0xac00) / 588)] === initial;
        }
        return actual === letter;
      })) return true;
    }
    return false;
  },
  matchesConditions(record, conditions) {
    const names = conditions.target === "patient"
      ? [record.patient]
      : conditions.target === "staff"
        ? [record.staff]
        : [record.patient, record.staff];
    return (
      (conditions.room === "all" || record.room === conditions.room) &&
      (conditions.status === "all" || record.status === conditions.status) &&
      names.some(name => this.matchesName(name, conditions.keyword))
    );
  }
};
