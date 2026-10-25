# 데이터

PoC 의 데이터는 두 종류입니다. 화면에서는 출처를 태그로 구분합니다: `DART 공시`, `가상 데이터`, `계산값`, `가정`.

## 1. DART 공시 데이터 — `src/data/dart.json`

OpenDART API 에서 받은 실제 공시 값입니다. `build_data.py` 로 만들었으며(이 저장소에는 없음), 직접 수정하지 않습니다.
빌드 시 한 줄 JSON 으로 바뀌어 `window.CREDITOS_DATA` 에 들어갑니다.

포함 기업 (`companies` 의 키는 DART 고유번호 `corp_code`):

| corp_code | 기업 | 종목코드 | 시장 |
|---|---|---|---|
| 00624518 | (주)다산솔루에타 | 154040 | 코스닥 |
| 00526696 | (주)웨이브일렉트로닉스 | 095270 | 코스닥 |

기업별 필드:

| 필드 | 내용 |
|---|---|
| `corp_code`, `name`, `stock_name`, `stock_code`, `market`, `ceo`, `bizr_no`, `jurir_no`, `address`, `homepage`, `induty_code`, `est_dt`, `acc_mt` | 기업개황 |
| `financials.OFS` / `financials.CFS` | 연도별 별도·연결 재무제표 (2015–2025) |
| `key_accounts` | DART 주요계정 API 값 (출처 간 대조용) |
| `disclosures` | 공시 목록 `{ date, type, title, category, rcept_no }` |
| `bonds` | 전환사채 등 사채 발행 조건 `{ kind, seq, amount, coupon, ytm, maturity, conv_price, rcept_no, ... }` |
| `audits` | 연도별 감사의견 `{ opinion, auditor, rcept_no }` |
| `investments`, `shareholders` | 타법인 출자, 최대주주 현황 |
| `executives` | 임원현황 `{ year, rows: [{ name, position, ... , rcept_no }] }` |

재무제표 한 해(`financials[scope][year]`):

```json
{
  "period_end": "2025-12-31",
  "rcept_no": "20260324000018",
  "published": "20260324",
  "prior_reported": { "revenue": 35436409241.0, "assets": ..., "liabilities": ..., "equity": ... },
  "items": {
    "revenue": { "v": 31399403970.0, "src": { "rcept_no": "...", "account_id": "ifrs-full_Revenue", "account_nm": "매출액", "sj_div": "CIS", "published": "20260324" } }
  }
}
```

- `published`: 공시일. 정보 시점 필터(`availableYears`)에 씁니다.
- `prior_reported`: 다음 해 보고서에 비교표시된 이 해의 금액. 재작성 여부 확인에 씁니다.
- `items` 의 키는 `revenue`, `op_income`, `net_income`, `finance_costs`, `assets`, `current_assets`, `cash`, `liabilities`, `current_liabilities`, `equity`, `st_borrowings`, `cur_lt_borrowings`, `lt_borrowings`, `cur_cb`, `cb`, `cur_lease`, `lease`, `op_cf` 입니다(한글 이름은 `CreditOS.LABELS`).
- `src.rcept_no` 는 DART 접수번호이며 화면에서 원문 링크로 연결됩니다.
- 날짜는 `YYYYMMDD` 문자열, 금액은 원 단위 숫자입니다.

## 2. 가상 데이터 — `src/data/seed.js`

은행 내부 정보는 모두 시연용으로 만든 값입니다. `window.CREDITOS_SEED` 로 올라갑니다.

| 키 | 내용 |
|---|---|
| `asOf` | 분석 기준일 (`2026-10-13`) |
| `bank` | 은행 이름 (`가상은행`) |
| `users` | 심사역 `u1`, 심사팀장 `u2`(승인 한도 30억), 고객 `c1`(다산솔루에타 재무팀장) |
| `policy` | 신규 운전자금대출 필수 서류와 승인 권한 한도 |
| `renewalPolicy` | 만기연장 필수 서류와 승인 권한 한도 |
| `eviAssumptions` | 정보가치 계산 가정값: LGD, 정상 기업 거절 손실률, 추가 확인 목록(민감도·특이도·비용) |
| `scenarioDefaults` | 상환여력 시나리오 기본값 |
| `applications` | 신규 신청 건 `APP-2026-0412` (다산솔루에타, 30억, 6.8%, 2년 만기일시) |
| `loans` | 실행 여신 `LN-2025-0187` (20억, 2026-11-28 만기, 약정 2개, 이자 납입 이력) |
| `packages` | 유스케이스 패키지 정의 ([architecture.md](architecture.md#유스케이스-패키지)) |

`seed.js` 를 바꾸면 브라우저에 저장된 이전 상태와 맞지 않을 수 있습니다. 화면 상단의 `초기화`로 상태를 다시 만듭니다.
