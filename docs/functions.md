# 공통 함수 (`CreditOS`)

`src/js/creditos.js` 에 정의되고 레지스트리에 등록되는 함수입니다. 모든 금액은 원 단위이며, 화면 표시는 `fmtEok()` 로 억 원 단위로 바꿉니다.
`scope` 는 `"OFS"`(별도재무제표) 또는 `"CFS"`(연결재무제표)입니다. 대출 심사는 차주 법인 자체의 별도재무제표(OFS)를 기준으로 합니다.

## 정보 시점 원칙

`availableYears(company, scope, asOf)` 는 **분석 기준일 이전에 공시된 연도만** 돌려줍니다(`financials[scope][year].published <= asOf`). 모든 분석 함수는 이 함수를 거쳐 연도를 고르므로, 기준일 이후에 나온 자료가 결과에 섞이지 않습니다.

## 등록 함수

| 함수 | 버전 | 종류 | 설명 |
|---|---|---|---|
| `summarizeDebt(company, scope, year)` | 1.0.0 | 계산 | 차입금·사채·리스부채 합산 |
| `calcRatios(company, scope, year)` | 1.1.0 | 계산 | 재무비율 |
| `validateFacts(company, asOf)` | 1.0.0 | 검증 | 자료 검증 7개 항목 |
| `checkAuthority(company, application)` | 1.0.0 | 검증 | 신청인 대표권 확인 |
| `riskSignals(company, asOf)` | 0.9.0 | 분석 | 설명용 위험 신호 규칙 |
| `simulateRepayment(company, asOf, params)` | 1.0.0 | 시뮬레이션 | 상환여력 시나리오 |
| `policyCheck(application, documents, policy, authority)` | 1.0.0 | 정책 | 필수 서류·승인권한 |
| `nextBestAction(prior, actions, loss)` | 1.0.0 | 의사결정 | 추가 확인의 정보가치 |
| `detectMonitoringEvents(company, since, until, loans)` | 1.0.0 | 모니터링 | 공시 사건 감지 |
| `checkCovenants(company, asOf, covenants)` | 1.0.0 | 정책 | 약정 점검 |

### summarizeDebt

단기차입금, 유동성장기차입금, 장기차입금, 유동성·비유동 전환사채, 유동·비유동 리스부채 7개 계정을 **한 번씩만** 더합니다.
`dueWithinYear` 는 그중 유동 계정(단기차입금, 유동성장기차입금, 유동성전환사채, 유동리스부채)의 합입니다. 전환사채는 장부금액 기준입니다.

### calcRatios

| 항목 | 계산 |
|---|---|
| `debtToEquity` 부채비율 | 부채총계 / 자본총계 |
| `currentRatio` 유동비율 | 유동자산 / 유동부채 |
| `debtDependence` 차입금의존도 | 총차입금 / 자산총계 |
| `netDebt` 순차입금 | 총차입금 − 현금및현금성자산 |
| `opMargin` 영업이익률 | 영업이익 / 매출액 |
| `coverage` 이자보상배율 | 영업이익 / 금융원가 |
| `opCfToDebt` | 영업활동현금흐름 / 총차입금 |

분모가 0 이거나 음수(자본잠식 등)이면 값을 내지 않고 `reason` 에 이유를 적습니다. 금융원가에는 이자 외 항목(전환사채 평가손실 등)이 들어갈 수 있어 이자보상배율이 실제보다 낮게 나올 수 있습니다.

### validateFacts

결과는 `{ level, title, detail, refs }` 목록이며 `level` 은 `통과`, `확인 필요`, `정보` 중 하나입니다.

1. **정보 시점**: 최근 결산일로부터 6개월이 지났으면 확인 필요. 기준일 이후 공시 연도는 분석에서 제외했다고 표시.
2. **연결/별도 범위**: 연결재무제표가 별도보다 먼저 끊겼거나, 연결 매출이 별도의 1.3배를 넘으면 표시.
3. **재무상태표 등식**: 자산 = 부채 + 자본, 차이 100만 원 초과 시 확인 필요.
4. **출처 간 대조**: 최근 3년 매출·자산·부채·자본을 DART 주요계정 API 와 전체 재무제표 API 값으로 비교.
5. **전년도 수치 재작성**: 다음 해 보고서의 비교표시 금액(`prior_reported`)이 최초 공시와 0.5%(최소 1천만 원) 넘게 다르면 표시.
6. **사채 만기**: 전환사채 만기가 기준일 기준 −6개월 ~ +12개월이면 상환 재원 확인 필요.
7. **감사의견**: 최근 연도 감사의견이 `적정` 이 아니면 확인 필요.

### checkAuthority

사업보고서 임원현황에서 직위에 `대표` 가 들어간 사람을 찾아 신청인과 이름을 비교합니다. 대표이사가 아니면 `needsPowerOfAttorney: true` 이고, `policyCheck` 가 대표이사 위임장(`POA`)을 필수 서류로 넣습니다. 이름 비교는 참고용이며 법인등기로 다시 확인합니다.

### riskSignals

단순 규칙 점수입니다. **실제 부도확률(PD) 모형이 아닙니다.**

| 규칙 | 점수 |
|---|---|
| 최근 3년 중 영업손실 연도 있음 | 1 |
| 영업이익 / 금융원가 < 1 | 2 |
| 1년 내 갚을 차입금 > 현금 + 영업활동현금흐름 | 2 |
| 부채비율 200% 초과 | 1 |
| 영업활동현금흐름 음수 | 1 |
| 매출 전년 대비 10% 이상 감소 | 1 |

점수 구간: 0 → A(3%), 1–2 → B(8%), 3–4 → C(15%), 5 이상 → D(25%). 괄호 안 확률은 `nextBestAction` 의 사전확률로 쓰는 가정값입니다.

### simulateRepayment

`params`: `amount`, `rate`, `years`, `method`(`bullet` 만기일시 | `amortizing` 분할), `basis`(`op_cf` | `op_income`), `existingRate`, `refinanceRatio`, `salesShock`, `marginShock`, `rateShock`.

기본·매출 하락·금리 상승·복합 네 시나리오에 대해 연도별로 다음을 계산합니다.

- 상환재원(CFADS): 영업활동현금흐름 기준이면 기준 연도 값에 영업이익 변화분을 더함.
- 원리금: 신규 대출 이자·원금 + 기존 차입금 이자(`existingRate`) + 첫해 기존 만기분 중 차환되지 않는 부분.
- `dscr = 상환재원 / 원리금`, 시나리오별 최소 DSCR(`minDscr`)과 신규 대출만 본 최소 DSCR(`minDscrNewOnly`).

결과에는 가정 목록(`assumptions`)이 함께 나오며 화면에 그대로 표시됩니다.

### policyCheck

정책의 필수 서류마다 상태를 정합니다: `해당 없음`(위임장이 필요 없는 경우), `자동 확보`(DART 재무제표), `미제출`, 또는 제출 문서의 상태. 대출 금액으로 승인 권한(`approvalLimits`)을 찾아 `approver` 를 돌려줍니다(30억 이하 심사팀장, 100억 이하 본부 심사위원회).

### nextBestAction

추가 확인(자료 요청, 실사 등)이 결정 손실을 얼마나 줄이는지 계산합니다.

- 상태는 상환곤란(B)/정상(G), 결정은 승인/거절. 승인 후 B 이면 `approveBad`(대출금 × LGD), 거절했는데 G 이면 `rejectGood` 만큼 손실.
- 각 확인은 민감도 `sens` = P(우려|B), 특이도 `spec` = P(양호|G) 를 가지며, 결과에 따라 베이즈 규칙으로 확률을 갱신합니다(`bayes`).
- 정보가치 `evi` = 지금 결정할 때의 기대손실 − 결과를 본 뒤 결정할 때의 기대손실. `net = evi − cost` 가 양수면 추천.
- 세 방식을 비교합니다: 추가 확인 없이 결정 / 모두 요청(`allValue`, 2ⁿ 경우 전부 계산) / 정보가치 순으로 필요한 것만 요청(`greedyValue`, 결과에 따라 다음 확인을 고르는 순차 정책, 깊이 최대 6).

필수 확인 항목은 이 계산과 관계없이 항상 수행합니다.

### detectMonitoringEvents

`since` 이후 `until` 까지의 공시를 카테고리별 중요도(`긴급`, `검토`, `참고`)로 분류하고, 같은 기간에 만기가 오는 전환사채를 사건으로 추가합니다. 해당 기업의 대출 id 를 각 사건에 붙여 최신순으로 돌려줍니다.

### checkCovenants

`debtToEquity` 약정은 `calcRatios` 로 부채비율을 계산해 한도와 비교합니다. 그 밖의 약정(예: 반기 재무제표 제출)은 은행 내부 기록이 필요하므로 판정하지 않고 설명만 돌려줍니다.

## 보조 함수와 내보내기

`window.CreditOS` 로 다음을 내보냅니다: `registry`, `callLog`, `call`, `LABELS`(계정 키 → 한글 이름), `fmtEok`, `ymd`, `parseKoDate`, `monthsBetween`, `latestYear`, `availableYears`, `val`, `item`.
`CreditOS._` 에는 테스트용 내부 함수(`bayes`, `decisionLoss`, `evi`, `greedyValue`, `allValue`, `ratio`)가 있습니다.

## 함수를 추가할 때

1. `creditos.js` 에 함수를 작성하고 맨 아래 `register(name, { version, kind, desc }, fn)` 로 등록합니다.
2. 화면에서는 `C.call(name, 유스케이스, ...)` 로 부릅니다. 다른 공통 함수 안에서는 `sub(name, ...)` 를 씁니다.
3. 해당 유스케이스 패키지(`seed.js` 의 `packages`)의 `adds.functions` 또는 `requires.functions` 에 이름을 넣습니다.
4. 계산 방식을 바꾸면 `version` 을 올립니다. 호출 기록에 버전이 남습니다.
