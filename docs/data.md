# 데이터

화면에서는 데이터 출처를 `DART 공시`, `가상 데이터`, `계산값`, `가정` 표시로 구분합니다.

## DART 공시 정보

| 항목 | 내용 |
|---|---|
| 파일 | `src/data/dart.json` (빌드 시 한 줄 JSON 으로 변환, `window.CREDITOS_DATA`) |
| 출처 | OpenDART API |
| 생성 | `build_data.py` (본 저장소 미포함). 직접 수정 금지 |
| 형식 | 날짜 `YYYYMMDD` 문자열, 금액 원 단위 숫자 |

| corp_code | 기업 | 종목코드 | 시장 |
|---|---|---|---|
| 00624518 | (주)다산솔루에타 | 154040 | 코스닥 |
| 00526696 | (주)웨이브일렉트로닉스 | 095270 | 코스닥 |

| 필드 | 내용 |
|---|---|
| `corp_code`, `name`, `stock_name`, `stock_code`, `market`, `ceo`, `bizr_no`, `jurir_no`, `address`, `homepage`, `induty_code`, `est_dt`, `acc_mt` | 기업개황 |
| `financials.OFS`, `financials.CFS` | 사업연도별 별도·연결 재무제표 (2015~2025) |
| `key_accounts` | 주요계정 정보 (출처 간 대조용) |
| `disclosures` | 공시 목록 `{ date, type, title, category, rcept_no }` |
| `bonds` | 사채 발행 조건 `{ kind, seq, amount, coupon, ytm, maturity, conv_price, rcept_no, ... }` |
| `audits` | 사업연도별 감사의견 `{ opinion, auditor, rcept_no }` |
| `investments`, `shareholders` | 타법인 출자, 최대주주 현황 |
| `executives` | 임원현황 `{ year, rows: [{ name, position, ..., rcept_no }] }` |

재무제표 1개 연도(`financials[scope][year]`) 예시:

```json
{
  "period_end": "2025-12-31",
  "rcept_no": "20260324000018",
  "published": "20260324",
  "prior_reported": { "revenue": 35436409241.0, "assets": 83553041687.0, "liabilities": 44490515223.0, "equity": 39062526464.0 },
  "items": {
    "revenue": {
      "v": 31399403970.0,
      "src": { "rcept_no": "20260324000018", "account_id": "ifrs-full_Revenue", "account_nm": "매출액", "sj_div": "CIS", "published": "20260324" }
    }
  }
}
```

| 키 | 내용 |
|---|---|
| `published` | 공시일, 정보 시점 기준 (`availableYears`) |
| `prior_reported` | 다음 연도 보고서의 비교표시 금액, 재작성 여부 확인용 |
| `items` | 계정 키별 금액과 출처. 계정 키: `revenue`, `op_income`, `net_income`, `finance_costs`, `assets`, `current_assets`, `cash`, `liabilities`, `current_liabilities`, `equity`, `st_borrowings`, `cur_lt_borrowings`, `lt_borrowings`, `cur_cb`, `cb`, `cur_lease`, `lease`, `op_cf` |
| `src.rcept_no` | DART 접수번호, 화면에서 공시 원문 연결 |

## 가상 데이터

| 항목 | 내용 |
|---|---|
| 파일 | `src/data/seed.js` (`window.CREDITOS_SEED`) |
| 범위 | 은행 내부 정보 전체 (시연용 값) |

| 키 | 내용 |
|---|---|
| `asOf` | 분석 기준일 `2026-10-13` |
| `bank` | 은행명 `가상은행` |
| `users` | 심사역 `u1`, 심사팀장 `u2` (전결 한도 30억 원), 고객 `c1` (다산솔루에타 재무팀장) |
| `processOntology` | 심사 온톨로지: 심사 업무(`tasks`), 자료(`documents`), 상품별 업무 조합(`products`), 전결 권한 한도 |
| `renewalPolicy` | 만기연장 필수 서류, 전결 권한 한도 |
| `eviAssumptions` | 정보가치 계산 가정값 (손실률, 정상 기업 거절 손실률, 추가 확인 항목별 민감도·특이도·비용) |
| `scenarioDefaults` | 상환여력 시나리오 기본값 |
| `applications` | 신규 신청 `APP-2026-0412` (다산솔루에타, 30억 원, 연 6.8%, 2년, 만기일시상환) |
| `loans` | 실행 여신 `LN-2025-0187` (20억 원, 만기 2026-11-28, 약정 2건, 이자 납입 내역) |
| `packages` | 업무 패키지 정의 ([architecture.md](architecture.md#업무-패키지)) |

`seed.js` 변경 후에는 브라우저 저장 상태와 불일치가 발생할 수 있으므로 화면 상단 `초기화` 로 상태를 재생성합니다.
