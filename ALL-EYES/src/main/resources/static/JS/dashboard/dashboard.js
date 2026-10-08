"use strict";
// [2026.09.17] 추가한 내용: 스크립트 위치를 기준으로 서버와 Live Server에서 동일한 호실 WAV 폴더를 사용합니다.
const roomAlertAudioBase = new URL("../../audio/room-alerts/", document.currentScript.src);
document.addEventListener("DOMContentLoaded", () => {
  /* [수정] 화면 예시 상태입니다. 실제 서버 조회 결과로 교체하세요.
     페이지를 열 때 조회한 이전 경보에는 음성을 재생하지 않습니다. */
  const rooms = window.CareGuardRoomStatus.rooms;
  const roomStart = window.CareGuardRoomStatus.roomStart;
  const labels = window.CareGuardRoomStatus.labels;
  const upper=document.getElementById("upper-rooms"), lower=document.getElementById("lower-rooms");
  const detail=document.getElementById("room-detail");
  const historyCard=document.querySelector(".dashboard-history-card");
  const dialog=document.getElementById("response-dialog"), form=document.getElementById("response-form");
  const alertPanel=document.querySelector(".alerts-panel");
  const alertList=document.querySelector(".alert-list")||alertPanel;
  const corridorNode=document.getElementById("central-corridor");
  // [2026.09.28 변경] 복도 감지는 세부 발생 지점 대신 중앙 복도 전체 상태로 표시합니다.
  // [2026.09.28 변경] 복도 감지는 중앙 복도 공용 안내 음성을 재생합니다.
  const corridorAlert={location:"중앙 복도",cameraId:"C-02",cameraLocation:"중앙 복도",fileName:"중앙복도즉시확인.mp3",status:"urgent",acknowledged:false,eventId:"corridor-fall-001",occurredAt:"2026-09-16T14:33:00+09:00"};
  if (!rooms.size) corridorAlert.status = "normal";
  // [2026.09.26 추가] 서버로 연 화면은 복도 예시 경보 없이 시작합니다. 공용 공간 감지는 서버 알림으로 채웁니다.
  const serverMode=window.CareGuardRoomStatus.serverMode;
  if (serverMode) Object.assign(corridorAlert,{status:"normal",eventId:null,occurredAt:null});
  let selected=null, corridorSelected=false, filter="all";
  // [2026.09.17] 추가한 내용: 새로 수신한 감지만 공통 상단 배너에 보관하며 기존 예시 알림은 자동으로 띄우지 않습니다.
  const crossPageAlert=document.getElementById('cross-page-alert');
  const crossPageItems=document.getElementById('cross-page-alert-items');
  const crossPageToggle=document.getElementById('cross-page-alert-toggle');
  const pendingNotices=new Map();
  let noticeSignature='',noticeCollapseTimer=null;
  let primaryNoticeKey=null;
  function setNoticeExpanded(expanded){
    crossPageItems.hidden=!expanded;
    crossPageToggle.setAttribute('aria-expanded',String(expanded));
    crossPageToggle.textContent=expanded?'접기':'펼치기';
  }
  // [2026.09.17] 고친 내용: 접힌 제목과 창의 빈 공간까지 한 곳에서 클릭을 처리하고 배경 선택 해제 이벤트로 전파하지 않습니다.
  crossPageAlert.addEventListener('click',event=>{
    event.stopPropagation();
    if(event.target.closest('#cross-page-alert-toggle')){
      clearTimeout(noticeCollapseTimer);
      setNoticeExpanded(crossPageToggle.getAttribute('aria-expanded')!=='true');return;
    }
    const row=event.target.closest('.cross-page-alert-row');
    const key=row?(row.dataset.location==='corridor'?'corridor':Number(row.dataset.location)):primaryNoticeKey;
    if(key===null)return;
    setDashboardView('dashboard');
    // 클릭한 위치를 직접 선택하여 이전 선택 상태나 별도 선택 모듈에 영향받지 않게 합니다.
    corridorSelected=key==='corridor';selected=corridorSelected?null:key;render();
    const node=corridorSelected?corridorNode:nodes.get(key);
    node?.scrollIntoView({block:'center',behavior:'smooth'});node?.focus({preventScroll:true});
  });
  function rememberNotice(key){
    const state=key==='corridor'?corridorAlert:rooms.get(key);
    if(state)pendingNotices.set(key,{id:state.eventId,receivedAt:Date.now()});
  }
  function renderCrossPageAlert(){
    const notices=[];
    for(const [key,notice] of pendingNotices){
      const state=key==='corridor'?corridorAlert:rooms.get(key);
      if(!state||state.status==='normal'||state.acknowledged||state.eventId!==notice.id){pendingNotices.delete(key);continue;}
      notices.push({key,state,...notice});
    }
    if(document.body.dataset.dashboardView!=='records'||!notices.length){
      crossPageAlert.hidden=true;noticeSignature='';clearTimeout(noticeCollapseTimer);return;
    }
    // [2026.09.22 추가] 알림은 낙상 감지, 낙상 의심, 침대 이탈 순서로 표시합니다.
    const noticePriority={urgent:0,suspected:1,caution:2};
    notices.sort((a,b)=>(noticePriority[a.state.status]??9)-(noticePriority[b.state.status]??9)||a.receivedAt-b.receivedAt);
    primaryNoticeKey=notices[0].key;
    const signature=notices.map(notice=>notice.id).join('|');
    if(signature===noticeSignature&&!crossPageAlert.hidden)return;
    noticeSignature=signature;
    document.getElementById('cross-page-alert-summary').textContent=`미처리 감지 알림 ${notices.length}건`;
    crossPageItems.replaceChildren();
    for(const notice of notices){
      const row=document.createElement('div');row.className='cross-page-alert-row '+notice.state.status;
      row.dataset.location=String(notice.key);
      // [2026.09.17] 고친 내용: 알림 문구도 키보드로 선택할 수 있는 대시보드 이동 버튼으로 제공합니다.
      const title=document.createElement('button');title.type='button';title.className='cross-page-alert-location';
      const location=notice.key==='corridor'?notice.state.location:`${notice.key}호`;
      title.textContent=`${notice.state.test?'[테스트] ':''}${location} · ${labels[notice.state.status]}`;
      const locate=document.createElement('button');locate.type='button';locate.textContent='위치 보기';
      // [2026.09.22 변경] 대시보드 외 화면의 감지 알림은 위치 확인만 제공하고 대응등록 버튼은 표시하지 않습니다.
      row.append(title,locate);crossPageItems.append(row);
    }
    crossPageAlert.classList.toggle('caution',notices[0].state.status==='caution');
    crossPageAlert.classList.toggle('suspected',notices[0].state.status==='suspected');
    crossPageAlert.hidden=false;setNoticeExpanded(true);
    // [2026.09.17] 추가한 내용: 읽던 화면을 가리지 않도록 8초 뒤 건수 표시로 접고 미처리 알림은 유지합니다.
    clearTimeout(noticeCollapseTimer);noticeCollapseTimer=setTimeout(()=>setNoticeExpanded(false),8000);
  }
  /* [추가] 클릭 직후에는 커서를 빼기 전까지 버튼 hover 강조를 표시하지 않습니다. */
  let suppressedHoverRoom=null;
  const nodes=new Map();
  upper.replaceChildren();lower.replaceChildren();
  function addRoom(number,parent){
    if (!rooms.has(number)) return;
    const node=document.createElement("button");node.type="button";node.className="room";
    node.innerHTML=`<strong>${number}호</strong><small></small><span class="door" aria-hidden="true"></span>`;
    node.addEventListener("click",()=>choose(number));nodes.set(number,node);parent.append(node);
  }
  function facility(){const el=document.createElement("div");el.className="facility";el.innerHTML='<span class="symbol" aria-hidden="true">WC</span><span>화장실</span>';return el;}
  for(let n=roomStart;n<roomStart+10;n++)addRoom(n,upper);
  lower.append(facility());for(let n=roomStart+10;n<roomStart+13;n++)addRoom(n,lower);
  const station=document.createElement("div");
  station.className="facility station";
  station.innerHTML='<span>간호사<br>스테이션</span>';
  lower.append(station);
  for(let n=roomStart+13;n<roomStart+17;n++)addRoom(n,lower);lower.append(facility());

  /* [2026.09.16] 고친 내용: 현황 카드를 전체·낙상·침대 이탈·정상 순서로 표시해도 기존 상태 필터와 연결합니다. */
  const cards=[];
  document.querySelectorAll(".counts .count").forEach(card=>{
    const kind=card.classList.contains("all")?"all":card.classList.contains("urgent")?"urgent":card.classList.contains("suspected")?"suspected":card.classList.contains("caution")?"caution":"normal";
    card.dataset.filter=kind;
    cards.push(card);
  });

  /* [2026.09.28 변경] 낙상 감지와 낙상 의심에만 병실별 WAV 또는 중앙 복도 MP3를 사용하며 종료 후 대기 없이 최대 5회 재생합니다.
     대기열은 경보별로 관리하며 한 번에 하나만 재생합니다. */
  const audio=new Audio(), jobs=new Map(), seenEvents=new Set();
  const audioControls=document.createElement("div");audioControls.className="audio-controls";
  /* [수정] 음성 켜기 체크박스 없이 재생 상태만 안내합니다. */
  audioControls.innerHTML='<span role="status" aria-live="polite">새 낙상 감지 또는 낙상 의심 발생 시 음성으로 안내합니다.</span>';
  /* [수정] 음성 안내 문구는 화면에 추가하지 않습니다. 재생 기능은 유지합니다. */
  let audioAllowed=true;
  // [2026.09.17] 추가한 내용: 테스트 모드에서는 재생 성공·차단·중지 상태를 직접 확인합니다.
  const testMode=new URLSearchParams(window.location.search).get("testAlerts")==="1";
  const soundInfo=testMode ? document.getElementById("alert-test-audio-status") : audioControls.querySelector("span");
  let queue=[],playing=null,epoch=0;
  function cancelAudio(number){
    const job=jobs.get(number);if(job){job.cancelled=true;jobs.delete(number);}
    queue=queue.filter(j=>j.number!==number);
    if(playing?.number===number){epoch++;playing=null;audio.pause();audio.removeAttribute("src");audio.load();}
    pump();
  }
  async function pump(){
    if(playing||!audioAllowed)return;
    while(queue.length&&queue[0].cancelled)queue.shift();
    if(!queue.length)return;
    const job=queue.shift();playing=job;const token=++epoch;
    audio.src=new URL(job.fileName,roomAlertAudioBase).href;
    try{await audio.play();if(token===epoch){job.count++;soundInfo.textContent=`${job.label} 음성 ${job.count}/5회 재생 중`;}}
    catch(error){
      if(token!==epoch)return;
      playing=null;
      if(error.name==="NotAllowedError"){
        queue.unshift(job);audioAllowed=false;
        soundInfo.textContent="음성을 재생하려면 화면을 한 번 클릭해주세요.";
      }else{job.cancelled=true;jobs.delete(job.number);soundInfo.textContent=`${job.label} 음성 파일을 확인해주세요.`;pump();}
    }
  }
  audio.addEventListener("ended",()=>{
    const job=playing;playing=null;if(!job||job.cancelled)return;
    if(job.count<5){
      // [2026.09.17] 고친 내용: 기존 3초 대기를 제거하고 종료 즉시 다음 안내를 재생합니다.
      queue.push(job);
    }else{jobs.delete(job.number);soundInfo.textContent=`${job.label} 5회 안내 완료`;}
    pump();
  });
  /* [수정] 브라우저가 음성을 차단하면 다음 실제 클릭/키 입력에서 대기 경보를 재시도합니다. */
  function resumeAudio(){audioAllowed=true;pump();}
  document.addEventListener("click",resumeAudio);
  document.addEventListener("keydown",resumeAudio);
  // [2026.09.22 변경] 낙상 감지와 낙상 의심만 같은 호실 안내와 반복 취소 처리를 공유합니다.
  function queueRoomAudio(number, fileName=`${number}호즉시확인.wav`, label=`${number}호`){
    cancelAudio(number);
    const job={number,fileName,label,count:0,cancelled:false};
    jobs.set(number,job);queue.push(job);pump();
  }

  // [2026.10.01 변경] 선택된 병실을 다시 누르면 선택을 해제해 오늘 기록 팝업을 닫습니다.
  function choose(number){
    if(selected===number&&!corridorSelected){
      selected=null;
      render();
      return;
    }
    corridorSelected=false;
    window.CareGuardRoomSelection.choose({get selected(){return selected;},set selected(value){selected=value;}}, number, render);
  }
  // [2026.09.30 변경] 중앙 복도를 누르거나 키보드로 선택하면 하단 오늘의 기록을 복도 기준으로 갱신합니다.
  function chooseCorridor(){
    if(corridorSelected){
      corridorSelected=false;
      selected=null;
      render();
      return;
    }
    selected=null;
    corridorSelected=true;
    render();
  }
  corridorNode.addEventListener("click", event=>{
    event.stopPropagation();
    chooseCorridor();
  });
  corridorNode.addEventListener("keydown", event=>{
    if(event.key!=="Enter"&&event.key!==" ")return;
    event.preventDefault();
    event.stopPropagation();
    chooseCorridor();
  });
  /* [추가] 빈 배경 클릭 시 병실 선택을 해제합니다.
     버튼·입력칸·등록 창 조작은 선택을 유지합니다. 경보 상태는 변경하지 않습니다. */
  document.addEventListener("click",event=>{
    if(event.target.closest("button,a,input,select,textarea,label,dialog,[role='button'],.dashboard-history-card"))return;
    /* [수정] 상단 카드 선택도 빈 화면 클릭 시 함께 해제합니다. */
    if(selected===null && !corridorSelected && filter==="all")return;
    selected=null;
    corridorSelected=false;
    filter="all";
    render();
  });
  // [2026.10.01 변경] 하단 오늘의 기록 대신 선택한 병실·복도 옆에 작은 기록 팝업을 배치합니다.
  function positionHistoryPopup(){
    if(!historyCard)return;
    if(selected===null&&!corridorSelected){
      historyCard.hidden=true;
      return;
    }

    const target=corridorSelected?corridorNode:nodes.get(selected);
    if(!target){
      historyCard.hidden=true;
      return;
    }

    historyCard.hidden=false;
    const targetRect=target.getBoundingClientRect();
    const popupRect=historyCard.getBoundingClientRect();
    const gap=10;
    const viewportGap=12;
    const canOpenRight=targetRect.right+gap+popupRect.width<=window.innerWidth-viewportGap;
    const canOpenLeft=targetRect.left-gap-popupRect.width>=viewportGap;
    let left=canOpenRight?targetRect.right+gap:canOpenLeft?targetRect.left-gap-popupRect.width:Math.min(Math.max(viewportGap,targetRect.left),window.innerWidth-popupRect.width-viewportGap);
    let top=targetRect.top+targetRect.height/2-popupRect.height/2;

    top=Math.min(Math.max(viewportGap,top),window.innerHeight-popupRect.height-viewportGap);
    historyCard.style.left=`${left}px`;
    historyCard.style.top=`${top}px`;
    historyCard.classList.toggle("is-left",!canOpenRight&&canOpenLeft);
  }

  window.addEventListener("resize",positionHistoryPopup);
  window.addEventListener("scroll",positionHistoryPopup,{passive:true});

  function renderRoomHistory(){
    const room=rooms.get(selected);
    // [2026.09.16] 고친 내용: 가로형 기록 카드에 병실·건수·최근 발생 시각을 표시하며 미선택 상태는 대시로 구분합니다.
    const now=Date.now();
    const counts=room ? window.CareGuardRoomStatus.todayCounts(room.number,now) : null;
    // [2026.09.28 변경] 최근 기록은 사고(오경보가 아닌 낙상 감지, 대응등록한 낙상 의심)만 띄우고, 없으면 비웁니다.
    const latest=room ? window.CareGuardRoomStatus.latestTodayIncident(room.number,now) : null;
    detail.innerHTML='<div class="history-heading"><strong class="history-room"></strong><span>오늘의 기록</span></div>'+
      '<div class="history-metric"><span class="room-history-urgent">낙상 감지</span><div><strong class="history-fall"></strong><span>건</span></div></div>'+
      '<div class="history-metric"><span class="room-history-suspected">낙상 의심</span><div><strong class="history-suspected"></strong><span>건</span></div></div>'+
      '<div class="history-metric"><span class="room-history-caution">침대 이탈</span><div><strong class="history-exit"></strong><span>건</span></div></div>'+
      '<div class="history-recent"><span>최근 기록</span><strong class="history-event"></strong><time></time></div>';
    // [2026.09.17] 고친 내용: 복도 테스트 종류와 실제 선택 위치를 하단 기록에도 동일하게 표시합니다.
    detail.querySelector('.history-room').textContent=corridorSelected ? corridorAlert.location : room ? `${room.number}호` : '병실 또는 복도를 선택해 주세요';
    const corridorEventType=corridorAlert.eventType || 'urgent';
    // [2026.09.27] 서버로 연 화면은 오늘 받은 공용 공간 이벤트를 실제로 셉니다(전에는 떠 있는 종류만 1건으로 표시).
    const corridorCounts={urgent:0,suspected:0,caution:0};
    // [2026.09.28] 서버로 연 화면의 복도 최근 기록도 병실과 같은 기준(사고만, 없으면 비움)으로 오늘 받은 이벤트에서 고릅니다.
    // 테스트 알림(?testAlerts=1)과 Live Server 미리보기는 떠 있는(마지막) 복도 알림으로 같은 기준을 적용합니다:
    // 오경보로 끄지 않은 낙상 감지, 또는 대응등록한 낙상 의심만 보이고 그 밖에는 비웁니다.
    const corridorFromHistory=serverMode&&!corridorAlert.test;
    const corridorAlertIncident=corridorAlert.dismissedEventId!==corridorAlert.eventId&&
      (corridorEventType==='urgent'||(corridorEventType==='suspected'&&corridorAlert.handledEventId===corridorAlert.eventId));
    let corridorLatest=null;
    if(serverMode&&corridorSelected){
      const today=window.CareGuardRoomStatus.dayKey(now);
      for(const item of corridorHistory.values()){
        if(window.CareGuardRoomStatus.dayKey(item.occurredAt)!==today)continue;
        // [2026.09.28] 병실과 같이 오경보·'확인'으로 끈 낙상 감지·의심은 세지 않고, 침대 이탈은 셉니다.
        if(!(item.dismissed&&item.type!=="caution"))corridorCounts[item.type]++;
        if(window.CareGuardRoomStatus.isIncident(item)&&(!corridorLatest||new Date(item.occurredAt)>new Date(corridorLatest.occurredAt)))corridorLatest=item;
      }
    }
    const corridorCount=type=>String(serverMode ? corridorCounts[type] : (corridorEventType===type ? 1 : 0));
    // [2026.09.30 변경] 복도를 선택했을 때 오늘 기록이 없으면 실제 기록이 없는 상태를 안내합니다.
    const hasCorridorEvent=corridorSelected&&(serverMode
      ? Object.values(corridorCounts).some(count=>count>0)
      : corridorAlert.status!=="normal");
    detail.querySelector('.history-fall').textContent=corridorSelected ? corridorCount('urgent') : counts ? counts.urgent : '—';
    detail.querySelector('.history-suspected').textContent=corridorSelected ? corridorCount('suspected') : counts ? counts.suspected : '—';
    detail.querySelector('.history-exit').textContent=corridorSelected ? corridorCount('caution') : counts ? counts.caution : '—';
    const corridorEventText=corridorFromHistory ? (corridorLatest ? `${labels[corridorLatest.type]} · ${corridorLatest.locationName}` : '') :
      corridorAlertIncident ? `${corridorAlert.test ? '테스트 · ' : ''}${labels[corridorEventType]} · ${corridorAlert.location}` : '';
    // [2026.09.30 병합] 복도에 오늘 기록이 하나도 없으면 예진 브랜치의 안내 문구를, 있으면 기존 복도 최근 기록을 표시합니다.
    detail.querySelector('.history-event').textContent=corridorSelected
      ? (hasCorridorEvent ? corridorEventText : '오늘 감지된 이벤트가 없습니다.')
      : latest ? labels[latest.type] : room ? '오늘 감지된 이벤트가 없습니다.' : '선택한 위치의 기록을 표시합니다.';
    const time=detail.querySelector('time');
    const occurredAt=corridorSelected ? (!hasCorridorEvent ? null : corridorFromHistory ? corridorLatest?.occurredAt : corridorAlertIncident ? corridorAlert.occurredAt : null) : latest?.occurredAt;
    if(occurredAt){
      time.dateTime=new Date(occurredAt).toISOString();
      time.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(occurredAt));
    }else time.hidden=true;
    positionHistoryPopup();
  }
  function render(){
    const counts={all:rooms.size+1,normal:0,caution:0,suspected:0,urgent:0};
    // [2026.10.01 변경] 상단 병동 안전 현황은 현재 상태가 아니라 오늘 하루 발생한 감지 이벤트 합계로 표시합니다.
    const todaySummary={all:0,caution:0,suspected:0,urgent:0};
    const now=Date.now();
    for(const room of rooms.values()){
      const roomCounts=window.CareGuardRoomStatus.todayCounts(room.number,now);
      todaySummary.urgent+=roomCounts.urgent;
      todaySummary.suspected+=roomCounts.suspected;
      todaySummary.caution+=roomCounts.caution;
    }
    if(serverMode){
      const today=window.CareGuardRoomStatus.dayKey(now);
      for(const item of corridorHistory.values()){
        if(window.CareGuardRoomStatus.dayKey(item.occurredAt)!==today)continue;
        if(item.dismissed&&item.type!=="caution")continue;
        todaySummary[item.type]++;
      }
    }else if(corridorAlert.status!=="normal"){
      todaySummary[corridorAlert.eventType||corridorAlert.status]++;
    }
    // [2026.10.01 변경] 전체 카드는 오늘 이벤트 합계가 아니라 병실 17개와 중앙 복도 1개를 포함한 전체 위치 수를 표시합니다.
    todaySummary.all=counts.all;
    // [2026.09.16] 고친 내용: 하단 카드는 renderRoomHistory에서 선택 병실의 오늘 기록만 표시합니다.
    for(const room of rooms.values()){
      counts[room.status]++;const node=nodes.get(room.number);
      node.classList.toggle("urgent",room.status==="urgent");node.classList.toggle("suspected",room.status==="suspected");node.classList.toggle("caution",room.status==="caution");
      node.classList.toggle("acknowledged",room.acknowledged);
      node.classList.toggle("filtered-out",filter!=="all"&&room.status!==filter&&room.status!=="urgent");
      /* [수정] 병실 카드에는 상태명만 표시하고 ‘확인 중’ 문구는 숨깁니다. */
      node.querySelector("small").textContent=labels[room.status];
      node.setAttribute("aria-label",`${room.number}호 · ${node.querySelector("small").textContent}`);
      node.setAttribute("aria-pressed",String(selected===room.number));
    }
    counts[corridorAlert.status]++;
    corridorNode.classList.toggle("urgent",corridorAlert.status==="urgent");
    corridorNode.classList.toggle("suspected",corridorAlert.status==="suspected");
    corridorNode.classList.toggle("caution",corridorAlert.status==="caution");
    // [2026.09.28 변경] 중앙 복도 상태는 위치 점 대신 텍스트 색과 점멸로 안내합니다.
    corridorNode.setAttribute("aria-label",`${corridorAlert.location} · ${labels[corridorAlert.status]}`);
    corridorNode.classList.toggle("acknowledged",corridorAlert.acknowledged);
    corridorNode.setAttribute("aria-pressed",String(corridorSelected));
    cards.forEach(card=>{card.querySelector("b").textContent=todaySummary[card.dataset.filter]??0;});
    renderRoomHistory();
    alertPanel.querySelectorAll(".alert-card").forEach(el=>el.remove());
    for(const room of rooms.values()){
      if(room.status==="normal")continue;
      const card=document.createElement("article");card.className=`alert-card ${room.status}`;
      // [2026.09.28 변경] 관제 화면 범례와 같은 명칭으로 낙상 상태를 표시합니다.
      const level=room.status==="urgent"?"낙상":room.status==="suspected"?"의심":"주의";
      // [2026.09.28 변경] 확정 낙상도 낙상 의심과 같이 확인·대응등록을 모두 제공합니다(확인 = 오경보 처리).
      const actionButtons=(room.status==="suspected"||room.status==="urgent")
        ? '<span class="alert-card-actions"><button type="button" class="locate-room" data-action="confirm">확인</button><button type="button" class="locate-room" data-action="respond">대응등록</button></span>'
        : `<button type="button" class="locate-room" data-action="${room.status==="urgent"?"respond":"confirm"}">${room.status==="urgent"?"대응등록":"확인"}</button>`;
      card.innerHTML=`<div class="alert-top"><strong>● ${level}</strong></div><h3>${room.number}호 <span class="event-label">${labels[room.status]}</span></h3><p>병실을 확인해주세요.</p>${actionButtons}`;
      // [2026.09.17] 추가한 내용: 가상 감지 카드에는 테스트 표시를 붙입니다.
      if(room.test)card.querySelector('.alert-top').insertAdjacentHTML('beforeend','<span class="test-alert-badge">테스트</span>');
      /* [2026.09.17] 고친 내용: 알림 카드의 대응등록 버튼은 해당 병실을 선택하고 등록 창을 바로 엽니다. */
      card.querySelectorAll("button[data-action]").forEach(button=>{
        button.setAttribute("aria-pressed",String(selected===room.number));
        button.classList.toggle("hover-suppressed",suppressedHoverRoom===room.number);
        button.addEventListener("mouseleave",event=>{
          if(suppressedHoverRoom===room.number)suppressedHoverRoom=null;
          event.currentTarget.classList.remove("hover-suppressed");
        });
        // [2026.09.22 변경] 낙상 의심은 확인과 대응등록을 모두 제공하고 침대 이탈은 확인만 제공합니다.
        button.addEventListener("click",()=>{
          suppressedHoverRoom=room.number;
          if(button.dataset.action==="respond")openResponseRegistration(room.number);else acknowledgeAlert(room.number);
        });
      });alertList.append(card);
    }
    if(corridorAlert.status!=="normal"){
      const card=document.createElement("article");card.className=`alert-card corridor-alert ${corridorAlert.status}`;
      // [2026.09.16] 고친 내용: 복도 알림에서는 넓은 구역명보다 실제 발생 위치를 제목으로 크게 표시합니다.
      // [2026.09.28 변경] 복도 알림도 병실 알림과 같은 상태 명칭을 사용합니다.
      const level=corridorAlert.status==="urgent"?"낙상":corridorAlert.status==="suspected"?"의심":"주의";
      const actionButtons=(corridorAlert.status==="suspected"||corridorAlert.status==="urgent")
        ? '<span class="alert-card-actions"><button type="button" class="locate-room" data-action="confirm">확인</button><button type="button" class="locate-room" data-action="respond">대응등록</button></span>'
        : `<button type="button" class="locate-room" data-action="${corridorAlert.status==="urgent"?"respond":"confirm"}">${corridorAlert.status==="urgent"?"대응등록":"확인"}</button>`;
      card.innerHTML=`<div class="alert-top"><strong>● ${level}</strong>${corridorAlert.test?'<span class="test-alert-badge">테스트</span>':''}</div><h3>${corridorAlert.location} <span class="event-label">${labels[corridorAlert.status]}</span></h3><p>복도 전체 알림</p>${actionButtons}`;
      // [2026.09.27] 복도 표시는 한 칸이라, 가려진 다른 공용 공간의 미처리 경보를 카드에 한 줄로 적어 둡니다.
      const hidden=hiddenCorridorAlerts();
      if(hidden.length){
        const more=document.createElement("p");
        more.className="corridor-more";
        more.textContent=`그 밖에 미처리 ${hidden.length}건: ${hidden.map(info=>`${info.locationName} ${labels[info.type]}`).join(", ")}`;
        card.querySelector("p")?.after(more);
      }
      card.querySelectorAll("button[data-action]").forEach(button=>{
        button.setAttribute("aria-pressed",String(corridorSelected));
        button.addEventListener("click",()=>{
          if(button.dataset.action==="respond")openResponseRegistration('corridor');else acknowledgeAlert('corridor');
        });
      });alertList.append(card);
    }
    // [2026.09.17] 고친 내용: 테스트 위치를 포함한 모든 낙상 알림을 침대 이탈보다 먼저 표시합니다.
    const cardPriority=card=>card.classList.contains('urgent')?0:card.classList.contains('suspected')?1:2;
    [...alertList.querySelectorAll('.alert-card')].sort((a,b)=>cardPriority(a)-cardPriority(b)).forEach(card=>alertList.append(card));
    // [2026.09.27] 가려진 복도 경보도 건수에 넣습니다(복도는 한 칸이라 위의 상태별 건수에 한 건만 들어감).
    const pendingAlertCount=counts.urgent+counts.suspected+counts.caution+(corridorAlert.status!=="normal"?hiddenCorridorAlerts().length:0);
    document.getElementById("alert-total").textContent=`${pendingAlertCount}건`;
    // [2026.09.22 변경] 알림이 0건이어도 알림 패널과 평면도 너비를 그대로 유지합니다.
    renderCrossPageAlert();
  }

  // [2026.09.22 변경] 낙상 의심과 침대 이탈은 조치 이력 대상이 아니므로 별도 등록 창 없이 확인 처리합니다.
  function acknowledgeAlert(location){
    const isCorridor=location==="corridor";
    const room=isCorridor?corridorAlert:rooms.get(Number(location));
    // [2026.09.28 추가] 확정 낙상의 확인은 오경보 처리입니다(조치 이력에 남기고 모든 화면에서 끔).
    if(room&&room.status==="urgent"){confirmFalseAlarm(location);return;}
    if(!room||!["suspected","caution"].includes(room.status))return;
    const key=isCorridor?"corridor":Number(location);
    // [2026.09.28 변경] 서버 경보는 조치 이력에 '확인'으로 남겨 같은 병동의 모든 화면에서 끕니다(아래 confirmServerAlerts).
    if(pendingByLocation.get(key)?.has(room.eventId)){confirmServerAlerts(location);return;}
    // 테스트 알림·Live Server 미리보기는 지금처럼 이 화면에서만 끕니다.
    cancelAudio(key);
    // [2026.09.28] 이 화면의 오늘 기록에서도 '확인'으로 끈 것으로 표시합니다(낙상 의심은 건수에서 빠짐).
    markHandledEvent(room.eventId,true);
    if(isCorridor)corridorAlert.dismissedEventId=room.eventId;
    room.status="normal";room.acknowledged=false;
    if(isCorridor)corridorSelected=false;
    else if(selected===Number(location))selected=null;
    render();
  }

  // [2026.09.28 추가] 낙상 의심·침대 이탈의 확인을 조치 이력에 남깁니다(대응등록과 같은 API, DB 구조 그대로).
  // 조치 이력 화면은 확정 낙상만 보여 주므로 여기에 남긴 '확인'은 나오지 않고, 관리자 홈 통계와 이 화면의 오늘 기록은 '확인'을 빼고 셉니다(침대 이탈 건수는 그대로).
  // 지금처럼 같은 위치·같은 종류의 이전 경보까지 한 번에 확인하고, 그 경보들도 한 건씩 기록합니다.
  async function confirmServerAlerts(location){
    const isCorridor=location==="corridor";
    const key=isCorridor?"corridor":Number(location);
    const room=isCorridor?corridorAlert:rooms.get(key);
    const pending=pendingByLocation.get(key);
    const shown=pending?.get(room?.eventId);
    if(!room||!shown||savingResponse)return;
    const shownId=room.eventId;
    const body={patientName:"확인",actionContent:shown.type==="suspected"?"낙상 의심 확인":"침대 이탈 확인"};
    // 같은 종류의 이전 경보는 먼저 목록에서 빼 둡니다. 저장 중 다른 화면의 '처리됨' 알림이 와도 음성을 다시 틀지 않게 합니다.
    const older=[];
    for(const [otherId,info] of pending){
      if(otherId!==shownId&&info.type===shown.type&&info.locationName===shown.locationName&&new Date(info.occurredAt)<=new Date(shown.occurredAt))older.push([otherId,info]);
    }
    for(const [otherId] of older)pending.delete(otherId);
    cancelAudio(key);
    savingResponse=true;
    let shownSaved=false;
    let conflict=false;
    try{
      shownSaved=await saveResponse(shownId,body);
      // [2026.09.28] 이 화면이 저장한 '확인'은 바로 오늘 건수·최근 기록에서 뺍니다. 409(다른 직원이 먼저 등록)는 끝난 뒤 서버 기록을 다시 불러옵니다.
      if(shownSaved==="created")markHandledEvent(shownId,true);
      conflict=shownSaved==="conflict";
      for(const [otherId,info] of older){
        // 보이는 경보를 저장하지 못했으면 이전 경보는 건드리지 않고, 이전 경보 저장에 실패하면 그것만 목록에 되돌립니다.
        const olderSaved=shownSaved?await saveResponse(otherId,body):false;
        if(!olderSaved)pending.set(otherId,info);
        else if(olderSaved==="created")markHandledEvent(otherId,true);
        else conflict=true;
      }
    }finally{savingResponse=false;}
    if(conflict)reloadAfterConflict();
    if(shownSaved&&pendingByLocation.get(key)?.has(shownId))resolvePending(key,shownId);
    if(isCorridor)corridorSelected=false;
    else if(selected===key)selected=null;
    render();
  }

  /* [추가] 실제 SSE/WebSocket 수신부에서 아래 함수를 호출하세요.
     window.CareGuard.receiveFallEvent({ id: 서버의_고유_경보ID, room: 308 });
     동일 경보 ID 재수신은 무시합니다.
     [2026.09.27 정정] 대응등록 저장(saveResponse, POST /api/events/{id}/action)은 이 파일에 있고, 서버 접속은 server-events.js 에 있습니다.
     [2026.09.26 추가] 서버 알림은 receiveServerEvent·receiveServerEvents 가 종류를 나눠 아래 세 함수로 넘깁니다(접속은 server-events.js).
     restoring 동안(페이지를 열 때 불러온 이전 경보)은 상태만 되살리고 음성·상단 배너는 띄우지 않습니다. */
  let restoring=false;
  // [2026.09.26 추가] 서버 이벤트 종류 → 화면 상태: FALL+CONFIRMED 낙상 감지, FALL+SUSPECTED 낙상 의심, BED_EXIT 침대 이탈
  function serverEventType(event){
    if(!event||event.id==null||!String(event.id).trim())return null;
    if(event.eventType==="BED_EXIT")return "caution";
    if(event.eventType==="FALL")return event.decisionSt==="CONFIRMED"?"urgent":event.decisionSt==="SUSPECTED"?"suspected":null;
    return null;
  }
  /* [2026.09.27 추가] 위치(병실 번호 또는 "corridor")마다 아직 처리하지 않은 서버 경보를 모두 기억합니다.
     화면에는 그중 가장 높은 단계(같은 단계면 가장 최근) 하나만 보이고, 그 경보를 처리하면 남은 경보를 다시 띄웁니다.
     전에는 위치마다 경보 하나만 기억해서, 뒤에 가려진 경보가 처리되지 않은 채 화면에서 사라졌습니다. */
  const rank={normal:0,caution:1,suspected:2,urgent:3};
  const pendingByLocation=new Map();   // 위치 → Map(이벤트ID → {type, occurredAt, locationName})
  const corridorHistory=new Map();     // 공용 공간 이벤트의 오늘 건수용: 이벤트ID → {type, occurredAt, locationName, handled, dismissed}
  // [2026.09.28 추가] 조치가 등록된 이벤트를 오늘 기록에 표시합니다. dismissed=true 는 '확인'(확정 낙상은 오경보)으로 끈 것입니다.
  // 병실 이벤트는 room-status.js 가, 공용 공간 이벤트는 corridorHistory 가 기억합니다. 모르는 이벤트면 아무것도 하지 않습니다.
  // 이벤트당 조치는 1건뿐이라 한 번 '확인'·오경보로 표시되면 되돌리지 않습니다(알림과 저장 응답의 도착 순서에 따라 결과가 바뀌지 않게).
  function markHandledEvent(id,dismissed){
    const key=String(id);
    window.CareGuardRoomStatus.markHandled(key,dismissed);
    const item=corridorHistory.get(key);
    if(item)Object.assign(item,{handled:true,dismissed:item.dismissed||Boolean(dismissed)});
  }
  // [2026.09.28 추가] 409(다른 직원이 먼저 등록)면 이 화면은 그 조치 내용을 모르므로 오늘 이벤트를 다시 불러와 기록을 맞춥니다.
  // 보통은 서버의 '처리됨' 알림으로 맞춰지지만, 알림 전송이 실패했거나 연결이 반쯤 끊긴 경우를 대비합니다(server-events.js 의 reload).
  function reloadAfterConflict(){window.CareGuardServerEvents?.reload?.();}
  function addPending(key,id,info){
    if(!pendingByLocation.has(key))pendingByLocation.set(key,new Map());
    pendingByLocation.get(key).set(id,info);
  }
  // 복도에 떠 있지 않은(가려진) 미처리 복도 경보들
  function hiddenCorridorAlerts(){
    return [...(pendingByLocation.get("corridor")?.entries()??[])]
      .filter(([id])=>id!==corridorAlert.eventId)
      .map(([,info])=>info);
  }
  function findPendingLocation(id){
    for(const [key,pending] of pendingByLocation)if(pending.has(id))return key;
    return null;
  }
  // 처리한 경보를 목록에서 빼고, 남은 경보 중 가장 높은 단계(같으면 가장 최근)를 다시 띄웁니다.
  // sameTypeOlder: '확인'은 같은 종류의 이전 경보까지 확인한 것으로 봅니다(침대 이탈이 여러 번 쌓여도 한 번에 끔).
  function resolvePending(key,id,{sameTypeOlder=false}={}){
    const pending=pendingByLocation.get(key)??new Map();
    const done=pending.get(id);
    pending.delete(id);
    if(sameTypeOlder&&done){
      // [2026.09.28 변경] 복도는 하나의 알림 영역으로 처리하므로 같은 유형의 이전 복도 경보도 함께 정리합니다.
      for(const [otherId,info] of pending){
        if(info.type===done.type&&info.locationName===done.locationName&&new Date(info.occurredAt)<=new Date(done.occurredAt))pending.delete(otherId);
      }
    }
    // 가려져 있던 동안 따로 울리던 복도 음성(아래 receiveCorridorEvent)도 끕니다.
    if(key==="corridor"&&done?.locationName)cancelAudio(`corridor:${done.locationName}`);
    let next=null;
    for(const [nextId,info] of pending){
      const newer=next&&rank[info.type]===rank[next.type]&&new Date(info.occurredAt)>new Date(next.occurredAt);
      if(!next||rank[info.type]>rank[next.type]||newer)next={id:nextId,...info};
    }
    const state=key==="corridor"?corridorAlert:rooms.get(key);
    if(!state)return;
    const audioKey=key==="corridor"?"corridor":Number(key);
    cancelAudio(audioKey);
    if(!next){Object.assign(state,{status:"normal",acknowledged:false});return;}
    if(key==="corridor")Object.assign(corridorAlert,{cameraLocation:"중앙 복도",fileName:"중앙복도즉시확인.mp3",eventType:next.type,occurredAt:next.occurredAt});
    Object.assign(state,{status:next.type,acknowledged:false,eventId:next.id,test:false});
    // 다시 띄운 경보도 아직 처리하지 않은 경보이므로 배너와 음성(낙상 감지·의심)으로 알립니다.
    rememberNotice(audioKey);
    if(key==="corridor")cancelAudio(`corridor:${next.locationName}`);   // 가려졌을 때 따로 울리던 음성은 끄고 아래에서 다시 울립니다
    // [2026.09.28 변경] 낙상 감지·낙상 의심은 복도에서도 공용 안내 음성을 재생합니다.
    if(next.type!=="caution")queueRoomAudio(audioKey,key==="corridor"?corridorAlert.fileName:undefined,key==="corridor"?corridorAlert.location:undefined);
  }
  // [2026.09.26 추가] 공용 공간(room=null) 감지는 도면의 복도 표시에 띄웁니다. 병실과 같이 더 높은 단계의 미처리 경보는 낮추지 않습니다.
  function receiveCorridorEvent(event,type){
    const id=String(event.id);
    if(!event.locationName||seenEvents.has(id))return false;
    seenEvents.add(id);
    corridorHistory.set(id,{type,occurredAt:event.occurredAt,locationName:event.locationName,handled:false,dismissed:false});
    // [2026.09.27] 가려지는 경보도 기억해 두었다가, 지금 경보를 처리하면 다시 띄웁니다.
    addPending("corridor",id,{type,occurredAt:event.occurredAt,locationName:event.locationName});
    const shown=rank[corridorAlert.status]<=rank[type];
    if(shown){
      cancelAudio("corridor");
      Object.assign(corridorAlert,{cameraLocation:"중앙 복도",fileName:"중앙복도즉시확인.mp3",status:type,eventType:type,test:false,eventId:id,occurredAt:event.occurredAt,acknowledged:false});
    }
    if(!restoring){
      rememberNotice("corridor");render();
      // [2026.09.28 변경] 복도 낙상 감지·의심은 중앙 복도 공용 안내 음성을 재생합니다.
      if(type!=="caution"&&shown)queueRoomAudio("corridor",corridorAlert.fileName,corridorAlert.location);
    }
    return true;
  }
  // [2026.09.28 추가] 확정 낙상 오경보 처리. 서버 경보는 대응등록과 같은 API 로 조치 이력에 '오경보'를 남깁니다.
  // 그러면 같은 병동의 모든 화면에서 꺼지고 새로 고쳐도 다시 뜨지 않습니다. DB 구조는 바꾸지 않습니다.
  // 같은 위치의 이전 확정 낙상은 진짜 낙상일 수 있으므로 함께 끄지 않고, 떠 있는 한 건만 끕니다.
  // 낙상 의심·침대 이탈의 확인은 위 confirmServerAlerts 가 조치 이력에 '확인'으로 남깁니다.
  const FALSE_ALARM_BODY={patientName:"오경보",actionContent:"오경보 확인"};
  async function confirmFalseAlarm(location){
    const isCorridor=location==="corridor";
    const key=isCorridor?"corridor":Number(location);
    const room=isCorridor?corridorAlert:rooms.get(key);
    if(!room||room.status!=="urgent"||savingResponse)return;
    const eventId=room.eventId;
    const place=isCorridor?(corridorAlert.location||"복도"):`${key}호`;
    if(!window.confirm(`${place} 낙상 경보를 오경보로 처리할까요?
조치 이력에 '오경보'로 남고, 같은 병동의 모든 화면에서 알림이 꺼집니다.`))return;
    const serverAlert=serverMode&&Boolean(pendingByLocation.get(key)?.has(eventId));
    if(serverAlert){
      savingResponse=true;
      let saved=false;
      try{saved=await saveResponse(eventId,FALSE_ALARM_BODY);}finally{savingResponse=false;}
      if(!saved)return;
      // [2026.09.28] 이 화면이 저장한 오경보는 바로 오늘 건수·최근 기록에서 뺍니다. 409(다른 직원이 먼저 등록)는 서버 기록을 다시 불러와 맞춥니다.
      if(saved==="created")markHandledEvent(eventId,true);
      else reloadAfterConflict();
      // '조치 등록됨' 실시간 알림이 먼저 와서 이미 정리했으면 다시 정리하지 않습니다.
      if(pendingByLocation.get(key)?.has(eventId))resolvePending(key,eventId);
    }else{
      // 테스트 알림·Live Server 미리보기는 화면에서만 끕니다.
      markHandledEvent(eventId,true);   // [2026.09.28] 이 화면의 오늘 기록에서도 오경보로 표시합니다.
      if(isCorridor)corridorAlert.dismissedEventId=eventId;   // [2026.09.28] 복도 최근 기록에서도 뺍니다(renderRoomHistory).
      Object.assign(room,{status:"normal",acknowledged:false});cancelAudio(key);
    }
    if(isCorridor)corridorSelected=false;
    else if(selected===key)selected=null;
    render();
    if(serverAlert)detail.textContent=room.status!=="normal"?"오경보로 기록했습니다. 같은 위치에 아직 처리하지 않은 경보가 있습니다.":"오경보로 기록했습니다.";
  }
  // [2026.09.27 추가] 같은 병동의 다른 화면에서 조치를 등록했다는 서버 알림: 이 화면에 떠 있는 같은 경보와 음성을 끕니다.
  function clearHandledAlert(id){
    // 처리된 경보를 목록에서 빼고, 같은 위치에 남은 경보가 있으면 다시 띄웁니다.
    const key=findPendingLocation(id);
    if(key!==null)resolvePending(key,id);
    // 이 화면에서 같은 경보의 대응등록 창을 쓰는 중이었다면 닫고 알려 줍니다.
    // 이 화면이 바로 그 조치를 저장하는 중(savingResponse)이면 자기 등록 알림이므로 건너뜁니다.
    // window.alert 는 확인을 누를 때까지 이 화면의 새 경보 수신을 멈추므로 쓰지 않고 아래 기록 칸에 문구만 씁니다.
    const closed=dialog.open&&registrationEvent===id&&!savingResponse;
    if(closed)dialog.close();
    render();
    if(closed)detail.textContent="다른 직원이 이 경보의 조치를 등록했습니다.";
    return true;
  }
  window.CareGuard={receiveFallEvent(event){
    if(!event||event.id==null||!String(event.id).trim()||!rooms.has(Number(event.room)))return false;
    const id=String(event.id);if(seenEvents.has(id)||!window.CareGuardRoomStatus.addEvent({...event,type:"urgent"}))return false;seenEvents.add(id);
    const number=Number(event.room);
    Object.assign(rooms.get(number),{status:"urgent",acknowledged:false, eventId:id,test:Boolean(event.test)});
    if(!restoring){rememberNotice(number);render();queueRoomAudio(number);}return true;
  },receiveSuspectedFallEvent(event){
    // [2026.09.22 추가] 확정 낙상보다 낮고 침대 이탈보다 높은 우선순위로 낙상 의심을 표시합니다.
    if(!event||!window.CareGuardRoomStatus.addEvent({...event,type:"suspected"}))return false;
    const room=rooms.get(Number(event.room));
    if(room.status!=="urgent")Object.assign(room,{status:"suspected",acknowledged:false,eventId:String(event.id),test:Boolean(event.test)});
    if(!restoring){rememberNotice(Number(event.room));render();queueRoomAudio(Number(event.room));}return true;
  },receiveBedExitEvent(event){
    if(!event||!window.CareGuardRoomStatus.addEvent({...event,type:"caution"}))return false;
    const room=rooms.get(Number(event.room));
    // 같은 병실의 미해결 낙상 경보를 주의 상태로 낮추지 않습니다.
    if(!["urgent","suspected"].includes(room.status))Object.assign(room,{status:"caution",acknowledged:false,eventId:String(event.id),test:Boolean(event.test)});
    // [2026.09.22 변경] 침대 이탈은 화면에만 표시하고 음성은 재생하지 않습니다.
    if(!restoring){rememberNotice(Number(event.room));render();}return true;
  },receiveServerEvent(event){
    // [2026.09.26 추가] 서버 알림 한 건(실시간 알림 또는 오늘 이벤트 조회의 한 줄)을 화면에 반영합니다.
    // [2026.09.27 추가] 감지 종류(eventType) 없이 handled=true 만 오면 "조치 등록됨" 알림입니다.
    if(event?.handled===true&&!event.eventType&&event.id!=null){
      // [2026.09.28] '확인'·오경보 조치(dismissed)면 낙상 감지·의심 건수와 최근 기록에서 뺍니다(침대 이탈 건수는 그대로). 화면은 clearHandledAlert 가 다시 그립니다.
      markHandledEvent(event.id,event.dismissed===true);
      return clearHandledAlert(String(event.id));
    }
    const type=serverEventType(event);
    if(!type){console.warn("대시보드가 모르는 감지 종류입니다.",event?.eventType,event?.decisionSt);return false;}
    // handled=true 는 이미 조치가 등록된 이벤트라 오늘 기록(건수)에만 넣습니다.
    if(event.handled===true){
      // [2026.09.27] 다시 불러왔더니 이미 조치된 경보가 이 화면에 떠 있으면(끊긴 동안 다른 화면이 등록) 끕니다.
      const id=String(event.id);
      if(findPendingLocation(id)!==null)clearHandledAlert(id);
      // [2026.09.28] 조치 여부와 '확인'·오경보(dismissed)도 함께 기억합니다. 이미 받은 이벤트(처리 전에 받은 것)면 표시만 바꿉니다.
      const dismissed=event.dismissed===true;
      if(event.room==null){corridorHistory.set(id,{type,occurredAt:event.occurredAt,locationName:event.locationName,handled:true,dismissed});return true;}
      const added=window.CareGuardRoomStatus.addEvent({id:event.id,room:event.room,type,occurredAt:event.occurredAt,handled:true,dismissed});
      if(!added)window.CareGuardRoomStatus.markHandled(id,dismissed);
      return added;
    }
    if(event.room==null)return receiveCorridorEvent(event,type);
    const receive=type==="urgent"?window.CareGuard.receiveFallEvent:type==="suspected"?window.CareGuard.receiveSuspectedFallEvent:window.CareGuard.receiveBedExitEvent;
    const accepted=receive({id:event.id,room:event.room,occurredAt:event.occurredAt});
    if(!accepted&&!rooms.has(Number(event.room)))console.warn("도면에 없는 병실의 감지입니다.",event.room,event.locationName);
    // [2026.09.27] 가려지는 경보도 기억해 두었다가, 지금 경보를 처리하면 다시 띄웁니다.
    if(accepted)addPending(Number(event.room),String(event.id),{type,occurredAt:event.occurredAt});
    return accepted;
  },receiveServerEvents(events,{restore=false}={}){
    // [2026.09.26 추가] 오늘 이벤트 조회 결과(발생 순서)를 반영합니다. restore=true 면 음성 없이 상태만 되살립니다.
    restoring=restore;
    try{for(const event of events)window.CareGuard.receiveServerEvent(event);}
    finally{restoring=false;}
    render();
  }};

  let registrationRoom=null, registrationEvent=null;
  // [2026.09.17] 추가한 내용: 주소로 켠 테스트 모드에서만 가상 감지를 주입하며 실제 통신이나 DB 저장을 실행하지 않습니다.
  if(testMode){
    document.body.classList.add('alert-test-mode');
    const panel=document.getElementById('alert-test-panel');
    const locationSelect=document.getElementById('alert-test-location');
    const typeSelect=document.getElementById('alert-test-type');
    const result=document.getElementById('alert-test-result');
    const originalRooms=new Map();
    const originalCorridor={...corridorAlert};
    const testIds=new Set();
    let delayedTestTimer=null;
    // [2026.09.28 변경] 복도 테스트도 중앙 복도 전체에 한 건으로 표시합니다.
    // [2026.09.28 변경] 복도 테스트도 실제 공용 안내 음성을 사용합니다.
    const corridorLocations={corridor:{cameraLocation:"중앙 복도",fileName:"중앙복도즉시확인.mp3"}};
    for(const number of rooms.keys())locationSelect.add(new Option(`${number}호`,String(number)));
    for(const [id,location] of Object.entries(corridorLocations))locationSelect.add(new Option(location.cameraLocation,id));
    panel.hidden=false;
    audio.id='alert-test-audio';audio.hidden=true;panel.append(audio);
    function runTestAlert(location,type){
      const locationLabel=[...locationSelect.options].find(option=>option.value===location)?.textContent;
      const id=`test-${Date.now()}-${crypto.randomUUID()}`;
      if(corridorLocations[location]){
        // 현재 도면의 단일 복도 표시를 재사용하므로 이전 복도 음성은 먼저 취소합니다.
        cancelAudio('corridor');
        Object.assign(corridorAlert,corridorLocations[location],{status:type,eventType:type,test:true,eventId:id,occurredAt:new Date().toISOString(),acknowledged:false});
        rememberNotice('corridor');render();
        // [2026.09.22 변경] 복도 테스트도 낙상 감지와 낙상 의심일 때만 음성을 재생합니다.
        if(type!=="caution"&&corridorAlert.fileName)queueRoomAudio('corridor',corridorAlert.fileName,corridorAlert.location);
      }else{
        const number=Number(location),room=rooms.get(number);
        if(!room)return;
        if((type==='caution'&&['urgent','suspected'].includes(room.status))||(type==='suspected'&&room.status==='urgent')){
          result.textContent='현재 더 높은 단계의 낙상 알림이 있는 병실입니다. 다른 병실을 선택하거나 테스트 초기화 후 진행해 주세요.';return;
        }
        if(!originalRooms.has(number))originalRooms.set(number,{...room});
        const receive=type==='urgent'?window.CareGuard.receiveFallEvent:type==='suspected'?window.CareGuard.receiveSuspectedFallEvent:window.CareGuard.receiveBedExitEvent;
        if(!receive({id,room:number,test:true,occurredAt:Date.now()}))return;
      }
      testIds.add(id);
      result.textContent=`테스트 발생 · ${locationLabel} · ${labels[type]}`;
    }
    document.getElementById('alert-test-run').addEventListener('click',()=>runTestAlert(locationSelect.value,typeSelect.value));
    // [2026.09.17] 추가한 내용: 선택한 값을 예약 시점에 저장하여 페이지 이동 후에도 동일한 가상 감지가 발생합니다.
    document.getElementById('alert-test-delayed').addEventListener('click',()=>{
      clearTimeout(delayedTestTimer);
      const location=locationSelect.value,type=typeSelect.value;
      result.textContent='5초 후 테스트 알림이 발생합니다. 사용자 메뉴에서 조치 이력으로 이동해 주세요.';
      delayedTestTimer=setTimeout(()=>{delayedTestTimer=null;runTestAlert(location,type);},5000);
    });
    // [2026.09.17] 추가한 내용: 테스트가 바꾼 위치만 원상 복구하고 테스트 기록·반복 타이머를 제거합니다.
    document.getElementById('alert-test-reset').addEventListener('click',()=>{
      clearTimeout(delayedTestTimer);delayedTestTimer=null;
      for(const [number,original] of originalRooms){
        const room=rooms.get(number);
        if(!room.test)continue;
        cancelAudio(number);Object.assign(room,original,{test:false});
      }
      if(corridorAlert.test){
        cancelAudio('corridor');Object.assign(corridorAlert,originalCorridor,{test:false,eventType:originalCorridor.eventType});
      }
      window.CareGuardRoomStatus.clearTestEvents();
      for(const id of testIds)seenEvents.delete(id);
      testIds.clear();originalRooms.clear();
      if(dialog.open&&testMode)dialog.close();
      registrationRoom=null;registrationEvent=null;
      render();result.textContent='테스트 초기화 완료 · 기존 알림은 유지됩니다.';
      soundInfo.textContent='테스트 음성과 남은 반복을 중지했습니다.';
    });
    window.addEventListener('pagehide',()=>clearTimeout(delayedTestTimer));
  }
  // [2026.09.17] 고친 내용: 알림 카드에서만 대응등록 창을 열어 범례 아래의 중복 버튼을 제거합니다.
  // [2026.09.17] 고친 내용: 305호·312호와 복도 모두 클릭한 위치를 명시적으로 선택한 뒤 한 번만 화면을 갱신합니다.
  function openResponseRegistration(location){
    corridorSelected=location==='corridor';
    selected=corridorSelected?null:Number(location);
    const room=corridorSelected ? corridorAlert : rooms.get(selected);if(!room||room.status==="normal")return;
    registrationRoom=corridorSelected ? "corridor" : selected;registrationEvent=room.eventId;
    // [2026.09.29 변경] 대응등록 창을 여는 행위는 완료 처리가 아니므로 취소·ESC·창 닫기 후에도 음성과 점멸을 유지합니다.
    soundInfo.textContent=`${corridorSelected ? corridorAlert.location : `${selected}호`} 대응등록 입력 중 · 등록 완료 전까지 음성과 점멸이 유지됩니다.`;
    form.reset();document.getElementById("response-title").textContent=`${labels[room.status]} 대응등록`;
    const eventBox=document.getElementById("response-event");
    eventBox.textContent=`${room.test?'테스트 · ':''}${corridorSelected ? corridorAlert.location : `${selected}호`} · ${labels[room.status]}`;
    /* [추가] 침대 이탈 등록 창은 주의 색상 클래스를 적용합니다. */
    eventBox.classList.toggle("caution-event",room.status==="caution");
    // [2026.09.22 추가] 낙상 의심 대응 창도 보라색 상태로 구분합니다.
    eventBox.classList.toggle("suspected-event",room.status==="suspected");
    eventBox.classList.toggle("urgent-event",room.status==="urgent");
    // [2026.09.17] 추가한 내용: 낙상 감지 대응등록 창 전체를 긴급 테두리로 구분합니다.
    dialog.classList.toggle("urgent-response-dialog",room.status==="urgent");
    render();if(!dialog.open)dialog.showModal();
  }
  document.getElementById("response-cancel").addEventListener("click",()=>dialog.close());
  /* [2026.09.26 추가] 서버에서 받은 경보의 대응 내용을 POST /api/events/{이벤트ID}/action 으로 저장합니다.
     저장에 실패하면 창을 열어 둔 채 안내하고, 409(다른 직원이 먼저 등록)는 이미 저장된 것으로 봅니다. */
  const eventApiBase=document.body.dataset.eventApiBase;
  const csrfToken=document.querySelector('meta[name="_csrf"]')?.content;
  const csrfHeader=document.querySelector('meta[name="_csrf_header"]')?.content||"X-CSRF-TOKEN";
  const responseSubmit=form.querySelector('button[type="submit"]');
  let savingResponse=false;
  async function saveResponse(eventId,body){
    const headers={"Content-Type":"application/json",Accept:"application/json"};
    if(csrfToken)headers[csrfHeader]=csrfToken;
    try{
      const response=await fetch(`${eventApiBase}${encodeURIComponent(eventId)}/action`,{
        method:"POST",credentials:"same-origin",cache:"no-store",headers,
        body:JSON.stringify(body||{patientName:document.getElementById("response-patient").value.trim(),actionContent:document.getElementById("response-note").value.trim()})
      });
      if(response.redirected||response.status===401){window.alert("로그인이 끝났습니다. 다시 로그인한 뒤 등록해 주세요.");return false;}
      // [2026.09.28 변경] 저장 결과: "created"(이 화면이 저장), "conflict"(다른 직원이 먼저 등록, 409), false(실패).
      // 앞의 둘은 지금처럼 '저장됨(참)'으로 쓰고, 오늘 기록 표시는 이 화면이 저장한 "created" 일 때만 바로 바꿉니다.
      if(response.status===409){window.alert("다른 직원이 이미 조치를 등록한 경보입니다. 경보를 해제합니다.");return "conflict";}
      if(response.ok)return "created";
      const reason={400:"환자 이름과 조치 내용을 확인해 주세요.",403:"등록 권한이 없거나 로그인 정보가 바뀌었습니다. 화면을 새로 고친 뒤 다시 등록해 주세요.",404:"감지 이벤트를 찾을 수 없습니다."}[response.status];
      window.alert(reason||`조치 이력을 저장하지 못했습니다(${response.status}). 잠시 후 다시 등록해 주세요.`);
      return false;
    }catch{
      window.alert("서버에 연결하지 못해 조치 이력을 저장하지 못했습니다. 연결을 확인한 뒤 다시 등록해 주세요.");
      return false;
    }
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();const room=registrationRoom==="corridor" ? corridorAlert : rooms.get(registrationRoom);if(!room||savingResponse)return;
    // [2026.09.27 변경] 서버 경보는 창을 연 그 경보(registrationEvent)에 그대로 저장합니다.
    // 그 사이 같은 위치에 새 경보가 왔어도 작성한 내용을 버리지 않고, 저장한 뒤 남은 경보를 다시 띄웁니다.
    const key=registrationRoom==="corridor"?"corridor":registrationRoom;
    const serverAlert=serverMode&&Boolean(pendingByLocation.get(key)?.has(registrationEvent));
    /* [추가] 등록 창을 연 뒤 같은 병실에 새 경보가 오면 이전 등록으로 해제하지 않습니다. (테스트 알림·Live Server 미리보기) */
    if(!serverAlert&&room.eventId!==registrationEvent){dialog.close();detail.textContent="새 낙상이 발생했습니다. 해당 병실의 대응등록을 다시 열어주세요.";return;}
    // [2026.09.26 추가] 서버 경보는 저장이 성공한 뒤에만 정상으로 바꿉니다. 테스트 알림과 Live Server 미리보기는 화면에만 반영합니다.
    if(serverAlert){
      const eventId=registrationEvent;
      savingResponse=true;responseSubmit.disabled=true;
      let saved=false;
      try{saved=await saveResponse(eventId);}finally{savingResponse=false;responseSubmit.disabled=false;}
      if(!saved)return;
      // [2026.09.28] 이 화면이 저장한 대응등록은 바로 오늘 기록에 '조치됨'으로 표시합니다(대응등록한 낙상 의심은 최근 기록에 뜸).
      // 409(다른 직원이 먼저 등록)는 서버 기록을 다시 불러와 맞춥니다.
      if(saved==="created")markHandledEvent(eventId,false);
      else reloadAfterConflict();
      resolvePending(key,eventId);
      dialog.close();render();
      if(room.status!=="normal")detail.textContent="조치 이력을 저장했습니다. 같은 위치에 아직 처리하지 않은 경보가 있습니다.";
      return;
    }
    // 조치 내용 등록은 조치 완료로 처리합니다.
    markHandledEvent(registrationEvent,false);   // [2026.09.28] 이 화면의 오늘 기록에도 '조치됨'으로 표시합니다.
    if(registrationRoom==="corridor")corridorAlert.handledEventId=registrationEvent;   // 복도 최근 기록용(renderRoomHistory)
    // [2026.09.29 변경] 로컬 테스트 경보도 실제 대응등록이 저장된 경우에만 음성과 점멸을 종료합니다.
    room.status="normal";room.acknowledged=false;cancelAudio(registrationRoom==="corridor" ? "corridor" : room.number);
    dialog.close();render();
  });
  const toggle=document.getElementById("profile-toggle"),menu=document.getElementById("header-menu-list");
  /* [2026.09.17] 고친 내용: 사용자 프로필 메뉴에서 조치 이력·비밀번호 변경·로그아웃을 제공합니다. */
  function closeMenu(){menu.hidden=true;toggle.setAttribute("aria-expanded","false");}
  // [2026.09.17] 추가한 내용: 비밀번호 변경 링크를 팝업으로 열고 닫을 때 입력 문서를 제거합니다.
  const passwordLink=document.getElementById('password-change-open');
  const passwordDialog=document.getElementById('password-change-dialog');
  const passwordFrame=document.getElementById('password-change-frame');
  passwordLink.addEventListener('click',event=>{
    event.preventDefault();closeMenu();
    passwordFrame.src=passwordLink.href;
    if(!passwordDialog.open)passwordDialog.showModal();
  });
  document.getElementById('password-popup-close').addEventListener('click',()=>passwordDialog.close());
  passwordDialog.addEventListener('close',()=>{passwordFrame.src='about:blank';toggle.focus();});
  // [2026.09.27 추가] 비밀번호를 바꾸면 서버가 로그아웃하고 로그인 화면으로 보냅니다.
  // 팝업 안에 로그인 화면이 뜨지 않도록, 팝업 문서가 로그인 화면이 되면 창 전체를 그 주소("비밀번호가 변경되었습니다" 안내)로 옮깁니다.
  passwordFrame.addEventListener('load',()=>{
    try{
      const frameLocation=passwordFrame.contentWindow.location;
      if(passwordDialog.open&&frameLocation.pathname.endsWith('/login'))window.location.href=frameLocation.href;
    }catch{/* 같은 출처가 아니면 읽지 않습니다. */}
  });
  // [2026.09.17] 추가한 내용: 같은 출처의 비밀번호 입력 프레임이 보낸 완료·닫기 요청만 처리합니다.
  window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin||event.source!==passwordFrame.contentWindow||!passwordDialog.open)return;
    if(event.data?.type==='careguard-password-close')passwordDialog.close();
    if(event.data?.type==='careguard-password-changed'){
      // [2026-09-18] 변경 팝업을 배경에 유지하고 완료 안내의 확인 버튼을 누른 뒤 팝업을 닫는다.
      window.alert('비밀번호 변경이 완료되었습니다');passwordDialog.close();
    }
  });
  toggle.addEventListener("click",()=>{menu.hidden=!menu.hidden;toggle.setAttribute("aria-expanded",String(!menu.hidden));});
  document.addEventListener("click",e=>{if(!e.target.closest(".header-menu"))closeMenu();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMenu();});
  // [2026.09.17] 추가한 내용: 조치 이력을 같은 대시보드 문서에서 열어 전체화면을 유지합니다.
  const dashboardMain=document.getElementById("dashboard-main"),recordView=document.getElementById("dashboard-record-view"),recordFrame=document.getElementById("dashboard-record-frame"),recordOpen=document.getElementById("record-open");
  const dashboardBack=document.querySelector('.dashboard-back-link');
  function setDashboardView(view,updateAddress=true){
    const isRecords=view==="records";
    document.body.dataset.dashboardView=view;
    dashboardMain.hidden=isRecords;recordView.hidden=!isRecords;
    if(isRecords&&!recordFrame.dataset.loaded){recordFrame.src=recordFrame.dataset.src;recordFrame.dataset.loaded="true";}
    // [2026.09.27 추가] 이미 연 조치 이력을 다시 보여 줄 때는 방금 등록한 조치가 보이도록 서버 기록을 다시 불러옵니다.
    else if(isRecords)recordFrame.contentWindow?.CareGuardRecordPage?.reload();
    // [2026.09.17] 고친 내용: 화면 전환과 배너 숨김을 함께 적용하고 테스트 모드 주소를 유지합니다.
    if(updateAddress){
      const target=new URL(isRecords?recordOpen.href:dashboardBack.href,document.baseURI);
      if(testMode)target.searchParams.set('testAlerts','1');
      window.history.pushState({dashboardView:view},'',target.href);
    }
    renderCrossPageAlert();
  }
  dashboardBack.addEventListener('click',event=>{event.preventDefault();setDashboardView('dashboard');});
  recordOpen.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();closeMenu();setDashboardView("records");});
  window.addEventListener("popstate",()=>setDashboardView(window.location.pathname.endsWith("/Record")?"records":"dashboard",false));
  // [2026.09.17] 고친 내용: 서버가 전달한 화면 상태를 우선 적용해 조치 이력 본문이 대시보드로 되돌아가지 않게 합니다.
  setDashboardView(document.body.dataset.dashboardView==="records"?"records":"dashboard",false);
  // [09.13]수정내용: 날짜 표시 설정에 현재 연도를 추가하여 대시보드에 연도와 날짜, 시간을 함께 표시한다.
  const updateClock=()=>{document.getElementById("clock").textContent=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date());};
  let historyDay=window.CareGuardRoomStatus.dayKey(Date.now());
  updateClock();setInterval(()=>{
    updateClock();
    const today=window.CareGuardRoomStatus.dayKey(Date.now());
    // [2026.09.16] 고친 내용: 날짜가 바뀌면 하단의 오늘 누적 카드도 함께 갱신합니다.
    if(today!==historyDay){historyDay=today;render();}
  },1000);render();
  window.addEventListener("pagehide",()=>{clearTimeout(noticeCollapseTimer);audioAllowed=false;for(const n of [...jobs.keys()])cancelAudio(n);audio.pause();});
});
