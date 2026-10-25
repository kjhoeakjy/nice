// 공통 기능.
// 모든 유스케이스(신규 심사, 만기연장, 사후 모니터링)는 이 파일의 함수만 호출한다.
// 함수는 registry 에 등록되고, call() 로 실행할 때마다 어떤 유스케이스가 불렀는지 기록된다.
(function (global) {
  "use strict";

  const registry = {};
  const callLog = [];

  function register(name, meta, fn) {
    registry[name] = { name, ...meta, fn };
  }

  const stack = [];
  function call(name, useCase, ...args) {
    const f = registry[name];
    if (!f) throw new Error("등록되지 않은 함수: " + name);
    callLog.push({ fn: name, version: f.version, useCase, at: new Date().toISOString() });
    if (callLog.length > 2000) callLog.shift();
    stack.push(useCase);
    try { return f.fn(...args); } finally { stack.pop(); }
  }
  // 함수 안에서 다른 공통 함수를 부를 때. 바깥 호출의 유스케이스로 기록한다.
  function sub(name, ...args) {
    return stack.length ? call(name, stack[stack.length - 1], ...args) : registry[name].fn(...args);
  }

  // ------------------------------------------------------------ 공통 도구
  const EOK = 1e8;
  const ymd = (s) => (s || "").replace(/-/g, "");
  const toDate = (s) => {
    s = ymd(s);
    return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  };
  const monthsBetween = (a, b) => {
    const da = toDate(a), db = toDate(b);
    return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth()) + (db.getDate() - da.getDate()) / 30;
  };
  const parseKoDate = (s) => {
    const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(s || "");
    return m ? `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}` : "";
  };

  // 분석 기준일에 이미 공시되어 있던 연도만 사용 (정보 시점 누수 방지)
  function availableYears(company, scope, asOf) {
    const fs = company.financials[scope] || {};
    return Object.keys(fs).filter((y) => fs[y].published <= ymd(asOf)).sort();
  }

  function latestYear(company, scope, asOf) {
    const ys = availableYears(company, scope, asOf);
    return ys.length ? ys[ys.length - 1] : null;
  }

  function item(company, scope, year, key) {
    const st = (company.financials[scope] || {})[year];
    return st && st.items[key] ? st.items[key] : null;
  }

  function val(company, scope, year, key) {
    const it = item(company, scope, year, key);
    return it ? it.v : null;
  }

  // ------------------------------------------------------------ 차입금 집계
  const DEBT_PARTS = [
    ["st_borrowings", "단기차입금"],
    ["cur_lt_borrowings", "유동성장기차입금"],
    ["lt_borrowings", "장기차입금"],
    ["cur_cb", "유동성전환사채"],
    ["cb", "비유동전환사채"],
    ["cur_lease", "유동리스부채"],
    ["lease", "비유동리스부채"],
  ];

  function summarizeDebt(company, scope, year) {
    const parts = DEBT_PARTS.map(([k, label]) => {
      const it = item(company, scope, year, k);
      return { key: k, label, value: it ? it.v : 0, found: !!it, src: it ? it.src : null };
    });
    const total = parts.reduce((s, p) => s + (p.value || 0), 0);
    const dueWithinYear = parts
      .filter((p) => ["st_borrowings", "cur_lt_borrowings", "cur_cb", "cur_lease"].includes(p.key))
      .reduce((s, p) => s + (p.value || 0), 0);
    return { scope, year, parts, total, dueWithinYear,
      note: "각 계정을 한 번씩만 더했습니다. 전환사채는 장부금액 기준이며 상환 시 지급액(원금+보장수익)과 다를 수 있습니다." };
  }

  // ------------------------------------------------------------ 재무비율
  function ratio(num, den, label) {
    if (num == null || den == null) return { value: null, reason: "자료 없음" };
    if (den === 0) return { value: null, reason: "분모 0" };
    if (den < 0) return { value: null, reason: label + " 음수(자본잠식 등) — 비율 해석 불가" };
    return { value: num / den };
  }

  function calcRatios(company, scope, year) {
    const g = (k) => val(company, scope, year, k);
    const debt = sub("summarizeDebt", company, scope, year);
    const fin = g("finance_costs");
    const out = {
      scope, year,
      debtToEquity: ratio(g("liabilities"), g("equity"), "자본"),
      currentRatio: ratio(g("current_assets"), g("current_liabilities"), "유동부채"),
      debtDependence: ratio(debt.total, g("assets"), "자산"),
      netDebt: { value: debt.total - (g("cash") || 0) },
      opMargin: ratio(g("op_income"), g("revenue"), "매출"),
      coverage: fin ? { value: g("op_income") / fin } : { value: null, reason: "금융원가 없음" },
      opCfToDebt: debt.total > 0 && g("op_cf") != null ? { value: g("op_cf") / debt.total } : { value: null, reason: "차입금 없음" },
      debt,
      notes: ["이자보상배율은 금융원가 기준입니다. 금융원가에는 전환사채 평가손실 등 이자 외 항목이 포함될 수 있어 실제 이자부담보다 크게 나올 수 있습니다."],
    };
    return out;
  }

  // ------------------------------------------------------------ 자료 검증
  function validateFacts(company, asOf) {
    const out = [];
    const add = (level, title, detail, refs) => out.push({ level, title, detail, refs: refs || [] });

    // 1) 정보 시점
    const ly = latestYear(company, "OFS", asOf);
    if (!ly) {
      add("확인 필요", "분석 기준일 기준 사용 가능한 재무제표 없음", "공시된 사업보고서가 없습니다.");
      return out;
    }
    const st = company.financials.OFS[ly];
    const age = monthsBetween(st.period_end, asOf);
    add(age > 6 ? "확인 필요" : "통과", `최근 결산 자료 시점: ${ly}년 말 (${Math.floor(age)}개월 경과)`,
      age > 6 ? "결산일로부터 6개월이 지났습니다. 이후 실적은 반기·분기 보고서나 최근 매출 자료로 확인해야 합니다."
              : "최근 결산 자료를 사용할 수 있습니다.",
      [{ rcept_no: st.rcept_no, label: `${ly} 사업보고서` }]);
    const futureYears = Object.keys(company.financials.OFS).filter((y) => company.financials.OFS[y].published > ymd(asOf));
    if (futureYears.length)
      add("정보", "분석 기준일 이후 공시 제외", `${futureYears.join(", ")}년 자료는 기준일 이후에 공시되어 분석에서 뺐습니다.`);

    // 2) 연결/별도 범위
    const lc = latestYear(company, "CFS", asOf);
    if (lc && lc < ly) {
      add("확인 필요", `연결재무제표가 ${lc}년까지만 있음`,
        `${+lc + 1}년부터는 별도재무제표만 공시되었습니다. 종속회사 처분 등 연결 범위 변동 여부를 확인해야 합니다. 이 기업에 대한 대출 심사는 대출 신청 법인 자체의 별도재무제표를 기준으로 합니다.`);
    } else if (lc) {
      const r = val(company, "OFS", ly, "revenue"), rc = val(company, "CFS", lc, "revenue");
      if (r && rc && rc / r > 1.3)
        add("정보", "연결 매출이 별도 매출보다 큼", `${ly}년 별도 ${fmtEok(r)}, 연결 ${fmtEok(rc)}. 종속회사 실적이 포함된 수치이므로 법인 자체 상환능력과 구분합니다.`);
    } else {
      add("정보", "연결재무제표 없음", "별도재무제표만 공시하는 기업입니다.");
    }

    // 3) 재무상태표 등식
    ["OFS", "CFS"].forEach((sc) => {
      const y = latestYear(company, sc, asOf);
      if (!y) return;
      const a = val(company, sc, y, "assets"), l = val(company, sc, y, "liabilities"), e = val(company, sc, y, "equity");
      if (a == null || l == null || e == null) return;
      const diff = Math.abs(a - l - e);
      add(diff > 1e6 ? "확인 필요" : "통과", `${sc === "OFS" ? "별도" : "연결"} ${y} 자산 = 부채 + 자본`,
        diff > 1e6 ? `차이 ${fmtEok(diff)}. 원문 대조가 필요합니다.` : "일치합니다.");
    });

    // 4) 출처 간 교차 확인: 주요계정 API vs 전체 재무제표 API
    const mism = [];
    let checked = 0;
    availableYears(company, "OFS", asOf).slice(-3).forEach((y) => {
      const ka = (company.key_accounts.OFS || {})[y] || {};
      ["revenue", "assets", "liabilities", "equity"].forEach((k) => {
        const a = ka[k] && ka[k].v, b = val(company, "OFS", y, k);
        if (a == null || b == null) return;
        checked++;
        if (Math.abs(a - b) > 1e6) mism.push(`${y} ${LABELS[k]}: 주요계정 ${fmtEok(a)} / 전체재무제표 ${fmtEok(b)}`);
      });
    });
    if (checked)
      add(mism.length ? "확인 필요" : "통과", `두 가지 DART 출처 값 대조 (${checked}개 항목)`,
        mism.length ? mism.join("; ") : "주요계정 API와 전체 재무제표 API 값이 같습니다.");

    // 5) 전년도 수치 재작성
    const restated = [];
    const ys = availableYears(company, "OFS", asOf);
    ys.forEach((y, i) => {
      if (!i) return;
      const prev = ys[i - 1];
      const pr = company.financials.OFS[y].prior_reported || {};
      Object.keys(pr).forEach((k) => {
        const orig = val(company, "OFS", prev, k);
        if (orig != null && Math.abs(pr[k] - orig) > Math.max(1e7, Math.abs(orig) * 0.005))
          restated.push(`${prev} ${LABELS[k]}: 최초 ${fmtEok(orig)} → ${y} 보고서 비교표시 ${fmtEok(pr[k])}`);
      });
    });
    add(restated.length ? "확인 필요" : "통과", "전년도 수치 재작성 여부",
      restated.length ? restated.slice(-4).join("; ") + (restated.length > 4 ? ` 외 ${restated.length - 4}건` : "") +
        ". 재작성 사유(회계정책 변경, 오류 수정 등)를 주석에서 확인합니다."
        : "다음 해 보고서의 비교표시 금액이 최초 공시와 같습니다.");

    // 6) 사채 만기
    (company.bonds || []).forEach((b) => {
      const m = parseKoDate(b.maturity);
      if (!m) return;
      const left = monthsBetween(asOf, m);
      if (left > -6 && left < 12) {
        const cur = val(company, "OFS", ly, "cur_cb");
        add("확인 필요", `전환사채 ${b.seq}회차 만기 ${b.maturity}`,
          `발행금액 ${fmtEok(b.amount)}, 만기보장수익률 ${b.ytm}%. ${ly}년 말 유동성전환사채 잔액 ${fmtEok(cur || 0)}. 상환·전환 여부와 상환 재원을 확인해야 합니다.`,
          [{ rcept_no: b.rcept_no, label: "전환사채 발행결정" }]);
      }
    });

    // 7) 감사의견
    const au = company.audits[ly];
    if (au) add(au.opinion.startsWith("적정") ? "통과" : "확인 필요", `${ly}년 감사의견: ${au.opinion}`, `감사인 ${au.auditor}`,
      [{ rcept_no: au.rcept_no, label: "감사보고서" }]);
    return out;
  }

  // ------------------------------------------------------------ 대표권 확인
  function checkAuthority(company, application) {
    const ceos = company.executives.rows.filter((r) => /대표/.test(r.position)).map((r) => r.name);
    const findings = [];
    const sub = application.submitter;
    const isCeo = ceos.includes(sub.name);
    findings.push({
      level: "정보",
      title: `공시상 대표이사: ${ceos.join(", ") || "확인 안 됨"}`,
      detail: `${company.executives.year}년 사업보고서 임원현황 기준입니다. 이후 변경이 있었을 수 있으므로 법인등기사항증명서로 다시 확인합니다.`,
      refs: company.executives.rows[0] ? [{ rcept_no: company.executives.rows[0].rcept_no, label: "임원현황" }] : [],
    });
    if (isCeo) {
      findings.push({ level: "통과", title: "신청인이 공시상 대표이사와 같음", detail: "본인확인과 법인인감 확인으로 진행합니다." });
    } else {
      findings.push({
        level: "확인 필요",
        title: `신청인(${sub.name}, ${sub.role})은 대표이사가 아님`,
        detail: "대리 신청입니다. 대표이사 명의 위임장과 법인인감증명서가 필요합니다. 이름 일치 여부는 참고용이며 법적 권한을 확정하지 않습니다.",
      });
    }
    return { ceos, isCeo, findings, needsPowerOfAttorney: !isCeo };
  }

  // ------------------------------------------------------------ 위험 신호 (설명용 규칙)
  // 실제 부도확률 모형이 아닙니다. 다음 업무 추천의 출발점으로 쓰는 단순 규칙입니다.
  const RISK_RULES = [
    { id: "op_loss", text: "최근 3년 중 영업손실 연도 있음", pts: 1,
      test: (c, y, a) => availableYears(c, "OFS", a).slice(-3).some((yy) => (val(c, "OFS", yy, "op_income") || 0) < 0) },
    { id: "coverage", text: "영업이익 / 금융원가 < 1", pts: 2,
      test: (c, y) => { const f = val(c, "OFS", y, "finance_costs"); return f > 0 && (val(c, "OFS", y, "op_income") || 0) / f < 1; } },
    { id: "short_debt", text: "1년 내 갚을 차입금 > 현금 + 영업활동현금흐름", pts: 2,
      test: (c, y) => sub("summarizeDebt", c, "OFS", y).dueWithinYear > (val(c, "OFS", y, "cash") || 0) + Math.max(0, val(c, "OFS", y, "op_cf") || 0) },
    { id: "lev", text: "부채비율 200% 초과", pts: 1,
      test: (c, y) => { const e = val(c, "OFS", y, "equity"); return e > 0 && val(c, "OFS", y, "liabilities") / e > 2; } },
    { id: "cash_burn", text: "영업활동현금흐름 음수", pts: 1, test: (c, y) => (val(c, "OFS", y, "op_cf") || 0) < 0 },
    { id: "sales_drop", text: "매출 전년 대비 10% 이상 감소", pts: 1,
      test: (c, y) => { const p = val(c, "OFS", String(+y - 1), "revenue"), r = val(c, "OFS", y, "revenue"); return p > 0 && r / p < 0.9; } },
  ];
  const BANDS = [
    { max: 0, band: "A", p: 0.03 }, { max: 2, band: "B", p: 0.08 },
    { max: 4, band: "C", p: 0.15 }, { max: 99, band: "D", p: 0.25 },
  ];

  function riskSignals(company, asOf) {
    const y = latestYear(company, "OFS", asOf);
    const hits = RISK_RULES.filter((r) => r.test(company, y, asOf));
    const score = hits.reduce((s, r) => s + r.pts, 0);
    const b = BANDS.find((x) => score <= x.max);
    return { year: y, hits, all: RISK_RULES.map((r) => ({ text: r.text, pts: r.pts, hit: hits.includes(r) })),
      score, band: b.band, prior: b.p,
      note: "규칙 점수와 구간별 상환곤란 확률은 시연용 가정입니다. 실제 신용평가모형이나 은행 내부 PD가 아닙니다." };
  }

  // ------------------------------------------------------------ 상환여력 시나리오
  // params: { amount, rate, years, method: 'bullet'|'amortizing', basis: 'op_cf'|'op_income',
  //           existingRate, refinanceRatio, salesShock, marginShock, rateShock }
  function simulateRepayment(company, asOf, params) {
    const y = latestYear(company, "OFS", asOf);
    const g = (k) => val(company, "OFS", y, k) || 0;
    const debt = sub("summarizeDebt", company, "OFS", y);
    const rev0 = g("revenue"), op0 = g("op_income"), cf0 = g("op_cf");
    const margin0 = rev0 ? op0 / rev0 : 0;
    const scenarios = [
      { id: "base", name: "기본", sales: 0, margin: 0, rate: 0 },
      { id: "sales", name: `매출 ${params.salesShock}%`, sales: params.salesShock, margin: 0, rate: 0 },
      { id: "rate", name: `금리 +${params.rateShock}%p`, sales: 0, margin: 0, rate: params.rateShock },
      { id: "combo", name: "복합", sales: params.salesShock, margin: params.marginShock, rate: params.rateShock },
    ];
    const n = Math.max(1, Math.round(params.years));
    const results = scenarios.map((s) => {
      const rev = rev0 * (1 + s.sales / 100);
      const op = rev * (margin0 + s.margin / 100);
      // 상환재원: 영업활동현금흐름 기준이면 영업이익 변화분만큼 같이 움직인다고 가정
      const cfads = params.basis === "op_cf" ? cf0 + (op - op0) : op;
      const rows = [];
      let bal = params.amount;
      const existingDebt = debt.total;
      const existingDue = debt.dueWithinYear * (1 - params.refinanceRatio / 100);
      for (let t = 1; t <= n; t++) {
        const r = (params.rate + s.rate) / 100;
        const interestNew = bal * r;
        const principalNew = params.method === "bullet" ? (t === n ? params.amount : 0) : params.amount / n;
        const interestExisting = existingDebt * (params.existingRate + s.rate) / 100;
        const principalExisting = t === 1 ? existingDue : 0;
        const service = interestNew + principalNew + interestExisting + principalExisting;
        rows.push({ t, cfads, interestNew, principalNew, interestExisting, principalExisting, service,
          dscr: service > 0 ? cfads / service : null });
        bal -= principalNew;
      }
      const minDscr = Math.min(...rows.map((r) => (r.dscr == null ? Infinity : r.dscr)));
      // 기존 차입 부담을 빼고 신규 대출만 놓고 본 값 (어느 쪽이 부담인지 구분용)
      const minDscrNewOnly = Math.min(...rows.map((r) => {
        const sv = r.interestNew + r.principalNew;
        return sv > 0 ? cfads / sv : Infinity;
      }));
      return { ...s, revenue: rev, opIncome: op, cfads, rows, minDscr, minDscrNewOnly };
    });
    return {
      year: y, base: { revenue: rev0, opIncome: op0, opCf: cf0, debt },
      results,
      assumptions: [
        `기준 연도: ${y}년 별도재무제표 (DART 공시값)`,
        `상환재원: ${params.basis === "op_cf" ? "영업활동현금흐름" : "영업이익"}. 감가상각비·이자지급액이 공시 데이터에서 분리되지 않아 단순화했습니다.`,
        `기존 차입금 ${fmtEok(debt.total)}에 연 ${params.existingRate}% 이자를 가정했습니다 (실제 약정금리 미확인).`,
        `1년 내 만기 차입금 ${fmtEok(debt.dueWithinYear)} 중 ${params.refinanceRatio}%는 차환된다고 가정했습니다.`,
        "신규 대출 금액·금리·만기·상환방식은 가상 신청 조건입니다.",
        "매출 이외의 조건(원가율, 운전자본)은 기준 연도와 같다고 가정했습니다.",
      ],
      caution: "결과는 가정에 따른 시나리오 값이며, 실제 DSCR 약정이나 승인 기준과 같지 않습니다.",
    };
  }

  // ------------------------------------------------------------ 필수 확인 (정책)
  function policyCheck(application, documents, policy, authority) {
    const items = policy.required.map((req) => {
      if (req.when === "proxy" && !(authority && authority.needsPowerOfAttorney))
        return { ...req, status: "해당 없음" };
      if (req.autoSource) return { ...req, status: "자동 확보", note: req.autoSource };
      const d = documents.find((x) => x.code === req.code);
      if (!d) return { ...req, status: "미제출" };
      return { ...req, status: d.status, doc: d };
    });
    const missing = items.filter((i) => ["미제출", "요청됨"].includes(i.status));
    const limit = policy.approvalLimits.find((l) => application.amount <= l.max);
    return { items, missing, complete: missing.length === 0, approver: limit ? limit.role : "본부 심사위원회" };
  }

  // ------------------------------------------------------------ 다음 업무 추천 (정보가치)
  // 상태: 상환곤란(B) / 정상(G). 결정: 승인 / 거절.
  // 각 선택 확인 a 는 '우려' 또는 '양호' 결과를 준다. P(우려|B)=sens, P(우려|G)=1-spec.
  function bayes(p, sens, spec, concern) {
    const pc = concern ? sens : 1 - sens;
    const gc = concern ? 1 - spec : spec;
    const num = p * pc;
    const den = num + (1 - p) * gc;
    return { post: den ? num / den : p, prob: den };
  }

  function decisionLoss(p, loss) {
    const approve = p * loss.approveBad;
    const reject = (1 - p) * loss.rejectGood;
    return { approve, reject, best: Math.min(approve, reject), choice: approve <= reject ? "승인" : "거절" };
  }

  function evi(p, a, loss) {
    const now = decisionLoss(p, loss).best;
    let after = 0;
    [true, false].forEach((concern) => {
      const b = bayes(p, a.sens, a.spec, concern);
      after += b.prob * decisionLoss(b.post, loss).best;
    });
    return now - after;
  }

  // 탐욕적 순차 정책의 기대 비용·손실 (정보 결과에 따라 다음 확인이 달라짐)
  function greedyValue(p, actions, loss, depth) {
    const scored = actions.map((a) => ({ a, net: evi(p, a, loss) - a.cost }));
    scored.sort((x, y) => y.net - x.net);
    if (!scored.length || scored[0].net <= 0 || depth > 6) {
      return { cost: 0, loss: decisionLoss(p, loss).best, count: 0 };
    }
    const a = scored[0].a;
    const rest = actions.filter((x) => x !== a);
    let cost = a.cost, l = 0, count = 1;
    [true, false].forEach((concern) => {
      const b = bayes(p, a.sens, a.spec, concern);
      const v = greedyValue(b.post, rest, loss, depth + 1);
      cost += b.prob * v.cost; l += b.prob * v.loss; count += b.prob * v.count;
    });
    return { cost, loss: l, count };
  }

  // 모든 선택 확인을 한 번에 요청하는 방식 (결과 2^n 가지를 모두 계산)
  function allValue(p, actions, loss) {
    const n = actions.length;
    let l = 0;
    for (let mask = 0; mask < 1 << n; mask++) {
      let pb = p, pg = 1 - p;
      actions.forEach((a, i) => {
        const concern = !!(mask & (1 << i));
        pb *= concern ? a.sens : 1 - a.sens;
        pg *= concern ? 1 - a.spec : a.spec;
      });
      const prob = pb + pg;
      if (prob > 0) l += prob * decisionLoss(pb / prob, loss).best;
    }
    return { cost: actions.reduce((s, a) => s + a.cost, 0), loss: l, count: n };
  }

  function nextBestAction(prior, actions, loss) {
    const ranked = actions.map((a) => {
      const v = evi(prior, a, loss);
      return { ...a, evi: v, net: v - a.cost, recommend: v - a.cost > 0 };
    }).sort((x, y) => y.net - x.net);
    const none = { cost: 0, loss: decisionLoss(prior, loss).best, count: 0 };
    const greedy = greedyValue(prior, actions, loss, 0);
    const all = allValue(prior, actions, loss);
    return {
      prior, now: decisionLoss(prior, loss), ranked,
      compare: [
        { name: "추가 확인 없이 결정", ...none },
        { name: "선택 확인을 모두 요청", ...all },
        { name: "정보가치 순으로 필요한 것만 요청", ...greedy },
      ],
      note: "확률·민감도·비용·손실은 모두 시연용 가정값입니다. 필수 확인 항목은 이 계산과 관계없이 항상 수행합니다.",
    };
  }

  // ------------------------------------------------------------ 사후 모니터링
  const EVENT_SEVERITY = {
    "차입": "검토", "사채": "검토", "보증·담보": "검토", "최대주주": "검토", "소송": "검토",
    "관리·거래정지": "긴급", "시장 경고": "검토", "주식 병합·분할": "참고", "증자·감자": "참고", "감사·결산": "참고", "계약": "참고", "기타": "참고",
  };

  function detectMonitoringEvents(company, since, until, loans) {
    const evs = company.disclosures
      .filter((d) => d.date > ymd(since) && d.date <= ymd(until))
      .map((d) => ({ ...d, severity: EVENT_SEVERITY[d.category] || "참고", source: "공시" }));
    (company.bonds || []).forEach((b) => {
      const m = parseKoDate(b.maturity);
      if (m > ymd(since) && m <= ymd(until))
        evs.push({ date: m, title: `전환사채 ${b.seq}회차 만기 도래 (${fmtEok(b.amount)})`, category: "사채",
          severity: "검토", source: "사채 조건", rcept_no: b.rcept_no });
    });
    evs.sort((a, b) => (a.date < b.date ? 1 : -1));
    const affected = loans.filter((l) => l.corp_code === company.corp_code);
    return evs.map((e) => ({ ...e, loans: affected.map((l) => l.id) }));
  }

  // ------------------------------------------------------------ 약정 점검
  function checkCovenants(company, asOf, covenants) {
    return covenants.map((cv) => {
      const y = latestYear(company, cv.scope, asOf);
      if (cv.type === "debtToEquity") {
        const r = sub("calcRatios", company, cv.scope, y).debtToEquity.value;
        return { ...cv, year: y, actual: r, ok: r != null && r <= cv.limit,
          text: `${y}년 ${cv.scope === "OFS" ? "별도" : "연결"} 부채비율 ${r == null ? "-" : (r * 100).toFixed(1) + "%"} (기준 ${(cv.limit * 100).toFixed(0)}% 이하)` };
      }
      return { ...cv, year: y, actual: null, ok: null, text: cv.text };
    });
  }

  // ------------------------------------------------------------ 포맷
  const LABELS = {
    revenue: "매출액", op_income: "영업이익", net_income: "당기순이익", finance_costs: "금융원가",
    assets: "자산총계", current_assets: "유동자산", cash: "현금및현금성자산", liabilities: "부채총계",
    current_liabilities: "유동부채", equity: "자본총계", st_borrowings: "단기차입금",
    cur_lt_borrowings: "유동성장기차입금", lt_borrowings: "장기차입금", cur_cb: "유동성전환사채",
    cb: "비유동전환사채", cur_lease: "유동리스부채", lease: "비유동리스부채", op_cf: "영업활동현금흐름",
  };

  function fmtEok(v, d) {
    if (v == null || isNaN(v)) return "-";
    let x = v / EOK;
    const digits = d != null ? d : Math.abs(x) >= 100 ? 0 : 1;
    if (Math.abs(x) < 0.5 * Math.pow(10, -digits)) x = 0;
    return x.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "억";
  }

  // ------------------------------------------------------------ 등록
  register("summarizeDebt", { version: "1.0.0", kind: "계산", desc: "차입금·사채·리스부채를 계정별로 한 번씩 합산" }, summarizeDebt);
  register("calcRatios", { version: "1.1.0", kind: "계산", desc: "부채비율·유동비율·차입금의존도 등 (분모 0·음수 처리)" }, calcRatios);
  register("validateFacts", { version: "1.0.0", kind: "검증", desc: "정보 시점, 연결/별도 범위, 출처 간 대조, 재작성, 사채 만기" }, validateFacts);
  register("checkAuthority", { version: "1.0.0", kind: "검증", desc: "신청인과 공시상 대표이사 비교, 위임장 필요 여부" }, checkAuthority);
  register("riskSignals", { version: "0.9.0", kind: "분석", desc: "설명용 위험 신호 규칙 (실제 PD 모형 아님)" }, riskSignals);
  register("simulateRepayment", { version: "1.0.0", kind: "시뮬레이션", desc: "대출 조건·매출·금리 시나리오별 상환여력" }, simulateRepayment);
  register("policyCheck", { version: "1.0.0", kind: "정책", desc: "필수 서류·승인권한 확인" }, policyCheck);
  register("nextBestAction", { version: "1.0.0", kind: "의사결정", desc: "선택 확인의 정보가치와 비용 비교" }, nextBestAction);
  register("detectMonitoringEvents", { version: "1.0.0", kind: "모니터링", desc: "공시·사채 만기 사건을 대출과 연결" }, detectMonitoringEvents);
  register("checkCovenants", { version: "1.0.0", kind: "정책", desc: "약정 재무비율 점검" }, checkCovenants);

  global.CreditOS = {
    registry, callLog, call, LABELS, fmtEok, ymd, parseKoDate, monthsBetween, latestYear, availableYears, val, item,
    // 테스트용 내부 함수
    _: { bayes, decisionLoss, evi, greedyValue, allValue, ratio },
  };
})(window);
