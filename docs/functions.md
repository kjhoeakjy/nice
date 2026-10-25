# 공통 기능

`src/js/creditos.js` 에 정의하고 기능 등록부에 등록하는 함수입니다.

| 공통 기준 | 내용 |
|---|---|
| 금액 | 원 단위, 화면 표시는 `fmtEok()` 로 억 원 단위 변환 |
| `scope` | `"OFS"` 별도재무제표, `"CFS"` 연결재무제표 |
| 심사 기준 재무제표 | 대출 신청 법인의 별도재무제표 |
| 정보 시점 | `availableYears(company, scope, asOf)` 로 분석 기준일 이전 공시 연도만 사용 (`published <= asOf`) |

## 등록 기능

| 함수 | 버전 | 분류 | 내용 |
|---|---|---|---|
| `summarizeDebt(company, scope, year)` | 1.0.0 | 계산 | 차입금·사채·리스부채 합산 |
| `calcRatios(company, scope, year)` | 1.1.0 | 계산 | 재무비율 |
| `validateFacts(company, asOf)` | 1.0.0 | 검증 | 자료 검증 |
| `checkAuthority(company, application)` | 1.0.0 | 검증 | 신청인 대표권 확인 |
| `riskSignals(company, asOf)` | 0.9.0 | 분석 | 설명용 위험 신호 규칙 |
| `simulateRepayment(company, asOf, params)` | 1.0.0 | 시뮬레이션 | 상환여력 시나리오 |
| `policyCheck(application, documents, policy, authority)` | 1.0.0 | 정책 | 필수 서류·전결 권한 점검 |
| `compileWorkflow(ctx, ontology)` | 1.0.0 | 온톨로지 | 상품·신청인·기업 정보·금액 조건별 심사 절차 구성 |
| `nextBestAction(prior, actions, loss)` | 1.0.0 | 의사결정 | 추가 확인 항목의 정보가치 |
| `detectMonitoringEvents(company, since, until, loans)` | 1.0.0 | 모니터링 | 공시 사건 감지 |
| `checkCovenants(company, asOf, covenants)` | 1.0.0 | 정책 | 약정 점검 |

## summarizeDebt

| 항목 | 기준 |
|---|---|
| 합산 계정 | 단기차입금, 유동성장기차입금, 장기차입금, 유동성전환사채, 비유동전환사채, 유동리스부채, 비유동리스부채 (계정별 1회 합산) |
| `dueWithinYear` | 단기차입금, 유동성장기차입금, 유동성전환사채, 유동리스부채의 합 |
| 전환사채 | 장부금액 기준 (상환 시 지급액과 차이 가능) |

## calcRatios

| 항목 | 산식 |
|---|---|
| `debtToEquity` 부채비율 | 부채총계 / 자본총계 |
| `currentRatio` 유동비율 | 유동자산 / 유동부채 |
| `debtDependence` 차입금의존도 | 총차입금 / 자산총계 |
| `netDebt` 순차입금 | 총차입금 − 현금및현금성자산 |
| `opMargin` 영업이익률 | 영업이익 / 매출액 |
| `coverage` 이자보상배율 | 영업이익 / 금융원가 |
| `opCfToDebt` | 영업활동현금흐름 / 총차입금 |

분모가 0 또는 음수(자본잠식 등)인 경우 값 대신 `reason` 에 사유를 기록합니다. 금융원가에 이자 외 항목(전환사채 평가손실 등)이 포함될 수 있어 이자보상배율은 실제 이자 부담 기준보다 낮게 산출될 수 있습니다.

## validateFacts

결과 형식: `{ level, title, detail, refs }`, `level` 은 `통과`·`확인 필요`·`정보`.

| 검증 항목 | 확인 필요 기준 |
|---|---|
| 정보 시점 | 최근 결산일 후 6개월 경과. 기준일 이후 공시 연도는 분석 제외로 표시 |
| 연결·별도 범위 | 연결재무제표가 별도재무제표보다 먼저 공시 중단. 연결 매출이 별도 매출의 1.3배 초과 시 정보로 표시 |
| 재무상태표 등식 | 자산과 부채·자본 합계의 차이 100만 원 초과 |
| 출처 간 대조 | 최근 3개 연도 매출·자산·부채·자본의 주요계정 정보와 전체 재무제표 정보 차이 100만 원 초과 |
| 전년도 수치 재작성 | 다음 연도 보고서 비교표시 금액(`prior_reported`)과 최초 공시 금액의 차이가 0.5%(최소 1천만 원) 초과 |
| 사채 만기 | 전환사채 만기가 기준일 이전 6개월 이내 또는 이후 12개월 이내 |
| 감사의견 | 최근 연도 감사의견이 적정 외 의견 |

## checkAuthority

| 항목 | 기준 |
|---|---|
| 대표이사 판별 | 사업보고서 임원현황의 직위에 "대표" 포함 |
| 대리 신청 판정 | 신청인 이름이 공시상 대표이사와 불일치 |
| 결과 | `needsPowerOfAttorney: true` 이면 `compileWorkflow` 에서 대표이사 위임장(`POA`)을 필수 확인 항목으로 추가 |
| 한계 | 이름 비교는 참고용, 법인등기로 최종 확인 |

## riskSignals

설명용 규칙 점수이며 신용평가모형이 아닙니다.

| 규칙 | 점수 |
|---|---|
| 최근 3년 내 영업손실 연도 | 1 |
| 영업이익 / 금융원가 < 1 | 2 |
| 1년 내 만기 차입금 > 현금 + 영업활동현금흐름 | 2 |
| 부채비율 200% 초과 | 1 |
| 영업활동현금흐름 음수 | 1 |
| 매출 전년 대비 10% 이상 감소 | 1 |

| 점수 | 구간 | 상환곤란 사전확률 (가정값) |
|---|---|---|
| 0 | A | 3% |
| 1~2 | B | 8% |
| 3~4 | C | 15% |
| 5 이상 | D | 25% |

## simulateRepayment

| 입력 | 내용 |
|---|---|
| `amount`, `rate`, `years` | 신규 대출 금액, 금리, 기간 |
| `method` | `bullet` 만기일시상환, `amortizing` 분할상환 |
| `basis` | 상환재원 기준 (`op_cf` 영업활동현금흐름, `op_income` 영업이익) |
| `existingRate` | 기존 차입금 가정 금리 |
| `refinanceRatio` | 1년 내 만기 차입금의 차환율 |
| `salesShock`, `marginShock`, `rateShock` | 매출 변동률, 영업이익률 변동, 금리 변동 |

$$
\mathrm{DSCR}_t = \frac{\mathrm{CFADS}}{I^{N}_t + P^{N}_t + I^{E}_t + P^{E}_t}
\qquad
\mathrm{CFADS} = \mathrm{CF}_0 + (\mathrm{OI}_s - \mathrm{OI}_0)
$$

| 기호 | 의미 |
|---|---|
| $\mathrm{CF}_0$, $\mathrm{OI}_0$ | 기준 연도 영업활동현금흐름, 영업이익 |
| $\mathrm{OI}_s$ | 시나리오 매출 × (기준 영업이익률 + 영업이익률 변동) |
| $I^{N}_t$, $P^{N}_t$ | 신규 대출 이자, 원금 |
| $I^{E}_t$ | 기존 총차입금 × (가정 금리 + 금리 변동) |
| $P^{E}_t$ | 첫해에 한해 1년 내 만기 차입금 × (1 − 차환율) |

| 출력 | 내용 |
|---|---|
| `results` | 기본·매출 감소·금리 상승·복합 시나리오별 연도별 원리금, DSCR |
| `minDscr` | 기존 차입금 포함 최소 DSCR |
| `minDscrNewOnly` | 신규 대출만 반영한 최소 DSCR |
| `assumptions` | 가정 목록 (화면 표시) |

## policyCheck

| 서류 상태 | 조건 |
|---|---|
| 해당 없음 | 대리 신청이 아닌 경우의 위임장 (`when: "proxy"` 항목) |
| 자동 확보 | DART 재무제표 |
| 충족 | 심사역 확인 완료 |
| 미충족 | 미제출, 요청됨, 제출됨, 보완 요청 |

제출됨 상태는 심사역 확인 전까지 미충족으로 처리합니다.

전결 권한: 대출 금액 30억 원 이하 심사팀장, 100억 원 이하 본부 심사위원회.

## compileWorkflow

| 입력 | 내용 |
|---|---|
| `ctx.productId` | `working` 운전자금대출, `guarantee` 보증부대출, `realestate` 부동산담보대출 |
| `ctx.isProxy` | 대리 신청 여부 |
| `ctx.companyType` | `listed` 상장기업, `unlisted` 비상장·공시 부족 |
| `ctx.amount` | 신청 금액 |
| `ontology` | `seed.js` 의 `processOntology` |

| 규칙 | 내용 |
|---|---|
| 위임장 | 대리 신청인 경우에만 포함 |
| 재무제표 | 상장기업은 DART 자동 확보, 그 외는 고객 온라인 제출 |
| 현장 확인 | `type: "onsite"` 항목을 온라인 경로와 분리 |
| 전결권자 | `approvalLimits` 에서 신청 금액으로 결정 |

| 출력 | 내용 |
|---|---|
| `checks` | 적용된 확인 항목 (처리 방식, 자료 출처, 담당 포함) |
| `policy` | `policyCheck` 입력용 필수 서류 정책 |
| `online`, `onsite` | 온라인 제출·자동 확보 항목, 현장 확인 항목 |
| `approver` | 전결권자 |
| `reasons` | 적용 조건 설명 |

## nextBestAction

| 구분 | 내용 |
|---|---|
| 상태 | 상환곤란(B), 정상(G) |
| 결정 | 승인, 거절 |
| 손실 | 상환곤란 기업 승인 시 $L_B$ (대출금 × 손실률), 정상 기업 거절 시 $L_G$ |
| 확인 항목 | 민감도 $s = P(\text{우려}\mid B)$, 특이도 $c = P(\text{양호}\mid G)$, 확인 비용 |

$$
p_{\text{우려}} = \frac{p\,s}{p\,s + (1-p)(1-c)}
\qquad
L(p) = \min\{\,p\,L_B,\ (1-p)\,L_G\,\}
\qquad
\mathrm{EVI}_a = L(p) - \sum_{o}P(o)\,L(p_o)
$$

| 비교 방식 | 함수 | 내용 |
|---|---|---|
| 추가 확인 없이 결정 | `decisionLoss` | 현재 확률 기준 기대손실 |
| 선택 확인 항목 전체 요청 | `allValue` | 결과 조합 $2^n$ 전체 계산 |
| 정보가치 순 선별 요청 | `greedyValue` | $\mathrm{EVI} - \text{비용} > 0$ 인 항목 중 최대 항목 선택, 결과에 따라 재선정 (최대 깊이 6) |

필수 확인 항목은 계산 결과와 무관하게 항상 수행합니다.

## detectMonitoringEvents

| 항목 | 기준 |
|---|---|
| 대상 기간 | `since` 초과, `until` 이하 |
| 공시 중요도 | 긴급: 관리·거래정지. 검토: 차입, 사채, 보증·담보, 최대주주, 소송, 시장 경고. 참고: 주식 병합·분할, 증자·감자, 감사·결산, 계약, 기타 |
| 사채 만기 | 대상 기간 내 만기 전환사채를 검토 사건으로 추가 |
| 여신 연결 | 동일 기업의 여신 번호 부여, 최신순 정렬 |

## checkCovenants

| 약정 유형 | 처리 |
|---|---|
| `debtToEquity` | `calcRatios` 부채비율과 한도 비교 |
| 기타 (반기 재무제표 제출 등) | 은행 내부 기록 필요, 판정 없이 설명만 반환 |

## 내보내는 값

| 이름 | 내용 |
|---|---|
| `registry`, `callLog`, `call` | 기능 등록부, 호출 기록, 호출 함수 |
| `LABELS` | 계정 키별 한글 계정명 |
| `fmtEok`, `ymd`, `parseKoDate`, `monthsBetween` | 형식 변환, 날짜 계산 |
| `latestYear`, `availableYears`, `val`, `item` | 재무제표 조회 |
| `_` | 시험용 내부 함수 (`bayes`, `decisionLoss`, `evi`, `greedyValue`, `allValue`, `ratio`) |

## 기능 추가 절차

| 단계 | 내용 |
|---|---|
| 작성 | `creditos.js` 에 함수 작성, 하단에서 `register(name, { version, kind, desc }, fn)` 로 등록 |
| 호출 | 화면에서는 `C.call(name, 업무명, ...)`, 공통 기능 내부에서는 `sub(name, ...)` |
| 패키지 반영 | `seed.js` 의 해당 패키지 `adds.functions` 또는 `requires.functions` 에 추가 |
| 버전 | 계산 방식 변경 시 `version` 상향 (호출 기록에 버전 저장) |
