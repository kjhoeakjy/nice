# 구성과 실행 흐름

## 한 파일 구조

배포되는 `index.html` 은 네 개의 `<script>` 블록과 하나의 `<style>` 블록으로 이루어집니다. 순서대로 실행되며, 앞 블록이 `window` 에 올린 값을 뒤 블록이 사용합니다.

| 순서 | 원본 | 전역 이름 | 역할 |
|---|---|---|---|
| 1 | `src/data/dart.json` | `window.CREDITOS_DATA` | DART 공시 데이터 (실제 값) |
| 2 | `src/data/seed.js` | `window.CREDITOS_SEED` | 가상 데이터: 사용자, 정책, 신청 건, 대출, 패키지 |
| 3 | `src/js/creditos.js` | `window.CreditOS` | 공통 업무 함수와 함수 레지스트리 |
| 4 | `src/js/app.js` | (없음) | 화면 렌더링, 라우팅, Action, 상태 저장 |

CSS 는 `fonts.css → base.css → theme.css → skin.css` 순서로 이어 붙입니다. 뒤 파일이 앞 파일의 값을 덮어씁니다.

- `base.css`: 기본 레이아웃과 컴포넌트(상단 바, 메뉴, 카드, 표, 버튼, 심사 화면, 그래프).
- `theme.css`: 색상 변수(`:root`)와 색상 관련 규칙만 다시 지정합니다.
- `skin.css`: 업무 시스템 스타일(평면, 조밀, 어두운 상단 바)과 900px·600px 이하 반응형 규칙.

## 계층

```
app.js (화면)
  ├─ ACTIONS ─ runAction()      상태 변경. 역할·사전조건 확인 후 처리 기록(audit) 남김
  └─ CreditOS.call(fn, 유스케이스, ...)
        └─ creditos.js           계산·검증 함수. 화면 상태를 바꾸지 않음
              └─ CREDITOS_DATA   DART 데이터 (읽기 전용)
```

- **공통 함수는 순수 계산만** 합니다. 입력(기업 데이터, 기준일, 조건)을 받아 결과 객체를 돌려줍니다.
- **모든 함수 호출은 `CreditOS.call(name, useCase, ...args)`** 로 하며, 어느 유스케이스(신규 심사, 만기연장, 모니터링)가 어떤 버전의 함수를 불렀는지 `callLog` 에 남습니다. 함수 안에서 다른 공통 함수를 부를 때는 `sub()` 를 써서 바깥 호출의 유스케이스로 기록합니다.
- **모든 상태 변경은 `runAction(name, params)`** 을 거칩니다. 각 Action 은 `allowed(user)`(실행 가능한 역할), `pre(params)`(사전조건, 실패 시 이유 문자열), `run(params)`(실행)으로 정의되며 결과가 처리 기록에 남습니다.

## 상태

`app.js` 의 상태 `S` 는 `localStorage["creditos-demo-v1"]` 에 JSON 으로 저장됩니다. 저장값이 없거나 읽을 수 없으면 `initialState()` 로 `seed.js` 에서 새로 만듭니다.

| 키 | 내용 |
|---|---|
| `role` | 현재 사용자 id (`u1` 심사역, `u2` 심사팀장, `c1` 고객) |
| `cases` | 심사 건 (신규 신청 + 만기연장 건). 자료 요청, 의견, 결정 포함 |
| `loans` | 실행 여신 |
| `tasks`, `events` | 모니터링 과제와 사건 처리 상태 |
| `audit` | 처리 기록 |
| `scenario` | 심사 건별 상환여력 시나리오 입력값 |
| `evi` | 정보가치 계산 가정값 (화면에서 수정 가능) |
| `seq` | 일련번호 |

## 라우팅

해시 기반입니다. `#/<page>/<id>/<sub>` 형태이며 `hashchange` 때마다 `render()` 가 화면 전체를 다시 그립니다.

| 해시 | 화면 함수 |
|---|---|
| `#/home` | `pageHome` 업무 현황 |
| `#/company/<corp_code>` | `pageCompany` 기업 정보 |
| `#/case/<id>` | `pageCase` 심사 화면 (신규·만기연장 공통) |
| `#/loans`, `#/loan/<id>` | `pageLoans`, `pageLoan` 실행 여신 |
| `#/monitor` | `pageMonitor` 사후 모니터링 |
| `#/packages` | `pagePackages` 업무 기능 관리 |
| `#/audit` | `pageAudit` 처리 기록 |
| `#/portal` | `pagePortal` 고객 자료 제출 (고객 역할 전용) |

클릭·제출·변경 이벤트는 `document` 에 위임해서 처리합니다. 버튼의 `data-act` 가 Action 이름이고, 폼의 `data-form` 이 처리 종류(`scenario`, `evi`, `opinion`, `decision`, `assign`, `close`, `submit`)입니다.

## Action

| Action | 내용 |
|---|---|
| `RequestDocument` | 고객에게 자료 요청 |
| `SubmitDocument` | 고객이 요청 자료 제출 (파일 이름만 기록) |
| `ReviewDocument` | 제출 자료 확인 완료 또는 보완 요청 |
| `AssignReviewer` | 담당 심사역 지정 (심사팀장만) |
| `RecordOpinion` | 심사 의견 기록 |
| `RecordDecision` | 승인·조건부 승인·거절 결정. 승인 권한 한도, 심사 의견, 필수 자료 확인 여부를 먼저 확인 |
| `StartRenewalReview` | 만기연장 심사 건 생성 |
| `CreateMonitoringTask` | 모니터링 사건을 점검 과제로 등록 |
| `CloseEvent` | 모니터링 사건 종결 |

## 유스케이스 패키지

`seed.js` 의 `packages` 는 유스케이스를 기능 묶음으로 정의합니다. 각 패키지는 `requires`(먼저 있어야 하는 객체·함수·Action)와 `adds`(새로 추가하는 것)를 가지며, `업무 기능 관리` 화면에 표시됩니다.

| 패키지 | 상태 | 추가하는 함수 |
|---|---|---|
| 신규 운전자금 심사 (`new-credit`) | 사용 중 | summarizeDebt, calcRatios, validateFacts, checkAuthority, riskSignals, simulateRepayment, policyCheck, nextBestAction |
| 만기연장 심사 (`renewal`) | 사용 중 | checkCovenants |
| 공시 기반 사후 모니터링 (`monitoring`) | 시범 | detectMonitoringEvents |

만기연장과 모니터링은 신규 심사가 만든 함수를 다시 씁니다. 이 재사용이 PoC 에서 보여 주려는 핵심입니다.
