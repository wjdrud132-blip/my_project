$ErrorActionPreference = 'Stop'

$source = 'C:\Users\구예진\Downloads\요구사항 정의서_임채현 (1).hwp'
$output = 'C:\Users\구예진\Desktop\ALL_IN_ONE\docs\요구사항 정의서_최종검토본.hwp'

Copy-Item -LiteralPath $source -Destination $output -Force

$replacements = [ordered]@{
  '유스케이스 이름 관리자 대시보드' = '유스케이스 이름 관리자 대시보드 조회'
  '비활성화 계정 관리 및 조치기록 화면으로 이동할 수 있다.' = '비활성화 관리 및 조치기록 화면으로 이동할 수 있다.'
  "5. 관리자가 상단 메뉴의 ‘직원 관리’" = "5. ‘직원 관리’, ‘관리 이력’ 또는 ‘비활성화 관리’에 마우스를 올리면 간호사·간병인 하위 메뉴가 표시되며, 선택한 관리 화면으로 이동한다."
  '유스케이스 이름 간호사 계정 비활성화' = '유스케이스 이름 간호사 비활성화'
  "간호사 관리 창에서 ‘계정 비활성화’를 선택하고 ‘선택’ 버튼을 누른다." = "간호사 관리 창에서 ‘비활성화’를 선택하고 ‘선택’ 버튼을 누른다."
  '로그인 제한과 기존 기록 유지에 대해 안내한다.' = '비활성 상태 전환과 기존 기록 유지에 대해 안내한다.'
  '비활성화 간호사관리 페이지' = '간호사 비활성화 페이지'
  '비활성화 직원관리 페이지' = '간호사 비활성화 페이지'
  '유스케이스 이름 간호사·간병인 재활성화' = '유스케이스 이름 간호사 재활성화'
  '비활성화 직원 목록' = '비활성화 간호사 목록'
  '직원 관리 페이지로 이동한다.' = '간호사 관리 페이지로 이동한다.'
  '유스케이스 이름 간호사 간호사 관리 이력 조회·검색' = '유스케이스 이름 간호사 관리 이력 조회·검색'
  '대상 직원, 담당 병동' = '대상 간호사, 담당 병동'
  "‘계정 비활성화’ 카드" = "‘비활성화’ 카드"
  "전체, 낙상, 침대 이탈, 정상 건수를 표시한다." = "전체, 낙상 감지, 낙상 의심, 침대 이탈, 정상 건수를 표시한다."
  "발생 위치와 감지 유형, 대응등록 버튼을 표시한다." = "발생 위치와 감지 유형을 표시하고, 낙상 감지에는 ‘대응 등록’, 낙상 의심에는 ‘확인’과 ‘대응 등록’, 침대 이탈에는 ‘확인’ 버튼을 표시한다."
  '선택한 카드에 초록색 테두리를 표시하고' = '선택한 카드의 선택 상태를 표시하고'
  "모든 낙상·침대 이탈 알림을 계속 표시한다." = "모든 낙상 감지·낙상 의심·침대 이탈 알림을 계속 표시한다."
  '새로운 낙상 또는 침대 이탈 감지 알림이 발생한다.' = '새로운 낙상 감지, 낙상 의심 또는 침대 이탈 알림이 발생한다.'
  '현재 화면은 예시 기록을 사용하며, 감지·대응 등록 데이터와의 서버 연동은 연결 전이다.' = ''
  '이름, 전화번호, 담당병실, 계정 상태가 포함된 간병인 목록' = '이름, 병동, 담당 병실, 마스킹된 전화번호와 관리 항목이 포함된 간병인 목록'
  "‘+ 록등’을 선택한다." = "‘+ 등록’을 선택한다."
  '이름, 전화번호, 담당 병실 입력 항목' = '이름, 전화번호, 병동과 담당 병실 선택 항목'
  "‘병실 경변’과 ‘계정 비활성화’ 작업" = "‘병실 변경’, ‘전화번호 수정’, ‘비활성화’ 작업"
  '관리자가 병실 변경을 선택하고 변경할 병실을 선택한다.' = '관리자가 병실 변경을 선택하고 병동에 맞는 변경할 병실을 선택한다.'
  '계정 삭제 실패 안내' = '간병인 정보 삭제 실패 안내'
  '관련 요구사항 FR-AD-503, FR-AD-211' = '관련 요구사항 FR-AD-507, FR-AD-211'
  'FR-AD-207 직원 계정 비활성화' = 'FR-AD-207 간호사 비활성화'
  'FR-AD-212 관리 이력 조회·검색조회·검색' = 'FR-AD-212 관리 이력 조회·검색'
  '비활성화된 간병인 계정을 삭제해야 한다.' = '비활성화된 간병인 정보를 삭제해야 한다.'
}

$hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  $hwp.XHwpWindows.Item(0).Visible = $false
  $null = $hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule')
  if (-not $hwp.Open($output, 'HWP', 'forceopen:true')) { throw 'HWP open failed' }

  foreach ($pair in $replacements.GetEnumerator()) {
    $hwp.HAction.GetDefault('AllReplace', $hwp.HParameterSet.HFindReplace.HSet)
    $find = $hwp.HParameterSet.HFindReplace
    $find.FindString = $pair.Key
    $find.ReplaceString = $pair.Value
    $find.Direction = 2
    $find.IgnoreMessage = 1
    $find.FindType = 1
    $find.ReplaceMode = 1
    $null = $hwp.HAction.Execute('AllReplace', $find.HSet)
  }

  if (-not $hwp.SaveAs($output, 'HWP', '')) { throw 'HWP save failed' }
}
finally {
  try { $hwp.Quit() } catch {}
  if ($hwp) { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp) | Out-Null }
}

Write-Output $output
