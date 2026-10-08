"use strict";

/* [09.13]추가내용: 병실 선택 값을 갱신하고 화면을 다시 그리는 공통 동작을 분리합니다. */
window.CareGuardRoomSelection = {
  choose(state, number, render) {
    state.selected = number;
    render();
  }
};
