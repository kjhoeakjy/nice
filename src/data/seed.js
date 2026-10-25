// 가상 데이터. 은행 내부 정보·신청 건·정책은 모두 시연용으로 만든 값이다.
// 실제 공시 데이터는 data.js (DART) 에만 있다.
window.CREDITOS_SEED = {
  asOf: "2026-10-13",
  bank: "가상은행",
  users: [
    { id: "u1", name: "김연주", role: "심사역", team: "기업여신심사부", canApprove: 0 },
    { id: "u2", name: "이준호", role: "심사팀장", team: "기업여신심사부", canApprove: 3e9 },
    { id: "c1", name: "최민수", role: "다산솔루에타 재무팀장", team: "다산솔루에타", customerOf: "00624518" },
  ],

  renewalPolicy: {
    product: "운전자금대출 만기연장",
    version: "내규 2026-07 (가상)",
    required: [
      { code: "RENEW", name: "만기연장 신청서", why: "연장 금액·기간 확인" },
      { code: "FS", name: "최근 결산 재무제표", why: "재무 변화 확인", autoSource: "DART 사업보고서에서 자동 확보" },
      { code: "TAX", name: "국세·지방세 완납증명서", why: "체납 여부 확인" },
    ],
    approvalLimits: [
      { max: 3e9, role: "심사팀장" },
      { max: 1e10, role: "본부 심사위원회" },
    ],
  },

  // 심사 온톨로지. 심사 업무(tasks)에 필요 자료·추가 요청 조건·담당·판단 기준·지원 기능을 연결하고,
  // 상품(products)은 업무의 조합으로 정의한다. 전결권자는 신청 금액으로 정한다.
  // 가상은행의 시연용 내규이며 실제 은행 내규나 법적 기준이 아니다.
  processOntology: {
    version: "시연 내규 2026-10 (가상)",
    documents: {
      REG: { name: "법인등기사항전부증명서", why: "법인 실재·현재 대표이사 확인", channel: "온라인 제출", source: "고객", type: "document" },
      SEAL: { name: "법인인감증명서", why: "약정·위임 서류의 인감 대조", channel: "온라인 제출", source: "고객", type: "document" },
      POA: { name: "대표이사 위임장", why: "대표이사 외 신청인의 위임 범위 확인", channel: "온라인 제출", source: "고객", type: "document" },
      FS: { name: "최근 3년 재무제표", why: "재무 상태·상환능력 분석", channel: "DART 자동 수집 또는 온라인 제출", source: "DART/고객", type: "document" },
      USE: { name: "자금 사용 계획서", why: "운전자금 용도 확인", channel: "온라인 제출", source: "고객", type: "document" },
      TAX: { name: "국세·지방세 완납증명서", why: "체납 여부 확인", channel: "온라인 제출", source: "고객", type: "document" },
      GUARANTEE: { name: "보증서 및 보증 조건", why: "보증기관·보증금액·유효기간 확인", channel: "온라인 제출·기관 대조", source: "보증기관/고객", type: "document" },
      COLLATERAL_TITLE: { name: "담보 부동산 권리관계 서류", why: "소유권·선순위 권리 확인", channel: "온라인 제출·등기 대조", source: "등기/고객", type: "document" },
      APPRAISAL: { name: "부동산 감정평가서", why: "담보가치 확인", channel: "온라인 제출", source: "평가기관", type: "document" },
      SITE_REPORT: { name: "담보 현장 확인 기록", why: "담보 물건의 현황 확인", channel: "현장 확인", source: "은행 담당자", type: "onsite" },
    },
    tasks: {
      AUTH: {
        name: "차입 권한 확인", owner: "심사역", docs: ["REG", "SEAL"], refs: ["공시 임원현황 (DART 자동 조회)"],
        extra: [{ doc: "POA", when: "proxy", text: "대리 신청 시 대표이사 위임장 추가 요청" }],
        criteria: "신청인과 공시·등기상 대표이사의 일치 여부. 불일치 시 위임장과 법인인감 대조",
        fns: ["checkAuthority"],
      },
      FIN: {
        name: "재무 상태 확인", owner: "심사역", docs: ["FS"], refs: ["DART 공시 목록·감사의견"],
        criteria: "공시 자료 검증(정보 시점·연결 범위·출처 대조·재작성), 부채비율·유동비율·이자보상배율",
        fns: ["validateFacts", "calcRatios", "summarizeDebt"],
      },
      REPAY: {
        name: "상환능력 분석", owner: "심사역", docs: [], refs: ["재무제표·차입금 집계 결과"],
        criteria: "매출 감소·금리 상승 시나리오별 최소 DSCR, 위험 신호 점수",
        fns: ["simulateRepayment", "riskSignals"],
      },
      USE: {
        name: "자금 용도 확인", owner: "심사역", docs: ["USE"], refs: [],
        criteria: "신청 금액과 운전자금 소요의 부합 여부",
        fns: [],
      },
      TAX: {
        name: "체납 확인", owner: "심사역", docs: ["TAX"], refs: [],
        criteria: "국세·지방세 체납 없음",
        fns: [],
      },
      GUAR: {
        name: "보증 확인", owner: "보증 심사 담당", docs: ["GUARANTEE"], refs: ["보증기관 조회"],
        criteria: "보증금액·보증기간의 대출 조건 충족 여부",
        fns: [],
      },
      COLL: {
        name: "담보 확인", owner: "담보 심사 담당", docs: ["COLLATERAL_TITLE", "APPRAISAL"], refs: ["부동산 등기 조회"],
        criteria: "선순위 권리 차감 후 담보가치의 대출 금액 충족 여부",
        fns: [],
      },
      SITE: {
        name: "담보 현장 확인", owner: "담보 심사 담당", docs: ["SITE_REPORT"], refs: [],
        criteria: "담보 물건 현황과 감정평가 내용의 일치 여부",
        fns: [],
      },
      EXTRA: {
        name: "추가 확인 항목 선택", owner: "심사역", docs: [], refs: ["위험 신호 구간별 상환곤란 확률"],
        criteria: "순정보가치(기대손실 감소 − 확인 비용)가 양수인 항목부터 요청, 확인 결과에 따라 재선정",
        fns: ["nextBestAction"],
      },
    },
    products: [
      { id: "working", name: "중소법인 운전자금대출", note: "자금 용도·상환능력 확인", tasks: ["AUTH", "FIN", "REPAY", "USE", "TAX", "EXTRA"] },
      { id: "guarantee", name: "법인 보증부대출 (가상)", note: "보증서 유효성·보증 조건 확인 추가", tasks: ["AUTH", "FIN", "REPAY", "TAX", "GUAR", "EXTRA"] },
      { id: "realestate", name: "법인 부동산담보대출 (가상)", note: "담보 권리관계·감정평가·현장 확인 추가", tasks: ["AUTH", "FIN", "REPAY", "TAX", "COLL", "SITE", "EXTRA"] },
    ],
    approvalLimits: [
      { max: 3e9, role: "심사팀장" },
      { max: 1e10, role: "본부 심사위원회" },
    ],
  },

  // 정보가치 계산용 가정값. 화면에서 바꿀 수 있다.
  eviAssumptions: {
    newLoan: {
      lgd: 0.45,               // 상환곤란 시 손실률
      rejectGoodRate: 0.06,    // 정상 기업을 거절할 때 잃는 이익 (대출금 대비, 관계 손실 포함)
      actions: [
        { id: "A1", name: "최근 6개월 월별 매출 자료", detail: "부가세 신고서 또는 매출 장부", sens: 0.6, spec: 0.8, cost: 5e6 },
        { id: "A2", name: "1년 내 만기 차입금·사채 상환 계획", detail: "상환 재원과 차환 협의 현황", sens: 0.7, spec: 0.85, cost: 4e6 },
        { id: "A3", name: "주요 거래처 계약서", detail: "상위 3개 거래처 납품 계약", sens: 0.5, spec: 0.75, cost: 8e6 },
        { id: "A4", name: "사업장 현장 실사", detail: "생산 설비 가동 상태와 재고 확인", sens: 0.55, spec: 0.9, cost: 3e7 },
      ],
    },
    renewal: {
      lgd: 0.45,
      rejectGoodRate: 0.05,
      actions: [
        { id: "R1", name: "2026년 반기 재무제표 확인", detail: "약정상 제출 자료. DART 반기보고서와 대조", sens: 0.65, spec: 0.85, cost: 2e6 },
        { id: "R2", name: "유상증자 대금 사용 내역", detail: "2026-06 제3자배정 유상증자 32억", sens: 0.5, spec: 0.8, cost: 3e6 },
        { id: "R3", name: "사업장 현장 실사", detail: "생산 설비 가동 상태 확인", sens: 0.55, spec: 0.9, cost: 3e7 },
      ],
    },
  },

  scenarioDefaults: {
    method: "bullet", basis: "op_cf", existingRate: 5.5, refinanceRatio: 70,
    salesShock: -15, marginShock: -2, rateShock: 2,
  },

  applications: [
    {
      id: "APP-2026-0412",
      type: "신규",
      corp_code: "00624518",
      product: "중소법인 운전자금대출",
      amount: 3e9,
      rate: 6.8,
      years: 2,
      method: "bullet",
      purpose: "원자재 구매 대금 및 2026년 하반기 운영자금",
      submittedAt: "2026-10-08",
      submitter: { name: "최민수", role: "재무팀장" },
      status: "심사 중",
      assignee: "u1",
      documents: [
        { code: "REG", name: "법인등기사항전부증명서", status: "제출됨", file: "등기사항전부증명서_20261007.pdf" },
        { code: "SEAL", name: "법인인감증명서", status: "제출됨", file: "법인인감증명서_20261007.pdf" },
        { code: "USE", name: "자금 사용 계획서", status: "제출됨", file: "운전자금_사용계획.xlsx" },
        { code: "TAX", name: "국세·지방세 완납증명서", status: "제출됨", file: "납세증명서.pdf" },
      ],
    },
  ],

  loans: [
    {
      id: "LN-2025-0187",
      corp_code: "00624518",
      product: "중소법인 운전자금대출",
      amount: 2e9,
      balance: 2e9,
      rate: 6.2,
      start: "2025-11-28",
      maturity: "2026-11-28",
      method: "bullet",
      covenants: [
        { id: "CV1", type: "debtToEquity", scope: "OFS", limit: 2.0, name: "별도 부채비율 200% 이하" },
        { id: "CV2", type: "report", name: "반기 재무제표 제출 (반기 종료 후 60일 이내)", text: "2026년 반기 재무제표 제출 여부: 은행 내부 기록 필요 (PoC에서는 '미확인')" },
      ],
      repayments: [
        ["2025-12-28", "이자", 10191781, "정상"], ["2026-01-28", "이자", 10530137, "정상"],
        ["2026-02-28", "이자", 9510959, "정상"], ["2026-03-28", "이자", 10530137, "정상"],
        ["2026-04-28", "이자", 10191781, "정상"], ["2026-05-28", "이자", 10530137, "정상"],
        ["2026-06-28", "이자", 10191781, "정상"], ["2026-07-28", "이자", 10530137, "정상"],
        ["2026-08-28", "이자", 10530137, "정상"], ["2026-09-28", "이자", 10191781, "정상"],
      ],
      renewal: { requestedYears: 1, requestedRate: 6.5, status: "연장 검토 전" },
    },
  ],

  // 유스케이스 패키지 정의
  packages: [
    {
      id: "new-credit", name: "신규 운전자금 심사", version: "1.0.0", status: "사용 중",
      requires: { objects: ["Company", "FinancialStatement", "Disclosure"], functions: [], actions: [] },
      adds: {
        objects: ["LoanApplication", "Document", "ReviewTask", "LoanProduct", "ReviewActivity"],
        functions: ["summarizeDebt", "calcRatios", "validateFacts", "checkAuthority", "riskSignals", "simulateRepayment", "compileWorkflow", "policyCheck", "nextBestAction"],
        actions: ["CreateCaseFromWorkflow", "RequestDocument", "SubmitDocument", "ReviewUploadedDocument", "RecordSiteInspection", "AssignReviewer", "RecordOpinion", "RecordDecision"],
      },
      config: ["심사 온톨로지 (업무·자료·담당·판단 기준)", "승인 권한 한도", "정보가치 가정값"],
    },
    {
      id: "renewal", name: "만기연장 심사", version: "1.0.0", status: "사용 중",
      requires: {
        objects: ["Company", "FinancialStatement", "Disclosure", "Document", "ReviewTask"],
        functions: ["summarizeDebt", "calcRatios", "validateFacts", "riskSignals", "simulateRepayment", "nextBestAction"],
        actions: ["RequestDocument", "SubmitDocument", "RecordOpinion", "RecordDecision"],
      },
      adds: { objects: ["LoanAccount", "Repayment", "Covenant"], functions: ["checkCovenants"], actions: ["StartRenewalReview"] },
      config: ["연장 심사 시작 시점 (만기 60일 전)", "약정 항목"],
    },
    {
      id: "monitoring", name: "공시 기반 사후 모니터링", version: "0.9.0", status: "시범",
      requires: {
        objects: ["Company", "Disclosure", "LoanAccount", "ReviewTask"],
        functions: ["calcRatios", "riskSignals"],
        actions: ["AssignReviewer"],
      },
      adds: { objects: ["RiskEvent"], functions: ["detectMonitoringEvents"], actions: ["CreateMonitoringTask", "CloseEvent"] },
      config: ["공시 유형별 중요도", "알림 담당자"],
    },
  ],
};
