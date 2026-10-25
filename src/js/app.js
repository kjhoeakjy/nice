// 화면. 상태 변경은 모두 runAction() 을 거쳐 처리 기록에 남는다.
(function () {
  "use strict";
  const DATA = window.CREDITOS_DATA;
  const SEED = window.CREDITOS_SEED;
  const C = window.CreditOS;
  const fmt = C.fmtEok;
  const ASOF = SEED.asOf;
  const STORE_KEY = "creditos-demo-v1";

  // ------------------------------------------------------------ 상태
  function initialState() {
    const cases = SEED.applications.map((a) => ({
      ...JSON.parse(JSON.stringify(a)), kind: "new", requests: [], opinions: [], decision: null,
    }));
    return {
      role: "u1",
      cases,
      loans: JSON.parse(JSON.stringify(SEED.loans)),
      tasks: [],
      events: {},
      audit: [],
      scenario: {},
      evi: JSON.parse(JSON.stringify(SEED.eviAssumptions)),
      seq: 1,
    };
  }

  let S;
  try {
    S = JSON.parse(localStorage.getItem(STORE_KEY)) || initialState();
  } catch (e) {
    S = initialState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ }
  }

  const user = () => SEED.users.find((u) => u.id === S.role);
  const userName = (id) => { const u = SEED.users.find((x) => x.id === id); return u ? `${u.name} (${u.role})` : "-"; };
  const company = (corp) => DATA.companies[corp];
  const caseById = (id) => S.cases.find((c) => c.id === id);
  const loanById = (id) => S.loans.find((l) => l.id === id);
  const now = () => {
    const d = new Date();
    return `${ASOF} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // ------------------------------------------------------------ Action
  // 각 Action: 실행 가능한 역할, 사전조건, 실행 내용. 실패하면 이유를 돌려준다.
  const ACTIONS = {
    CreateCaseFromWorkflow: {
      label: "상품별 가상 심사 건 생성",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (v) => {
        if (!SEED.processOntology.products.some((x) => x.id === v.productId)) return "알 수 없는 상품입니다.";
        if (v.companyType !== "listed") return "비상장기업은 재무 데이터가 없어 절차 구성만 시연합니다.";
        if (![10, 30, 50].includes(v.amountEok)) return "시연용 대출 금액이 아닙니다.";
        return null;
      },
      run: (v) => {
        const prod = SEED.processOntology.products.find((x) => x.id === v.productId);
        const co = company("00624518");
        const c = {
          id: `DEMO-2026-${String(S.seq++).padStart(4, "0")}`, kind: "new",
          productId: prod.id, corp_code: co.corp_code, product: prod.name,
          amount: v.amountEok * 1e8, rate: 6.8, years: 2, method: "bullet",
          purpose: "상품·신청인 조건별 심사 절차 비교 (가상)",
          submittedAt: ASOF, submitter: v.isProxy ? { name: "최민수", role: "재무팀장" } : { name: co.ceo, role: "대표이사" },
          status: "심사 중", assignee: "u1", documents: [], requests: [], opinions: [], decision: null,
          demoCase: true,
        };
        S.cases.push(c);
        return `${c.id}: ${prod.name}, ${v.isProxy ? "대리 신청" : "대표자 신청"}, ${v.amountEok}억 원 가상 심사 건 생성`;
      },
    },
    RecordSiteInspection: {
      label: "현장 확인 결과 기록",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (v) => {
        const c = caseById(v.caseId);
        if (!c || c.decision) return "진행 중인 신청 건이 없습니다.";
        const wf = workflowFor(c);
        if (!wf || !wf.onsite.some((x) => x.code === v.code)) return "해당 상품의 현장 확인 항목이 아닙니다.";
        if (!v.note || v.note.trim().length < 6) return "현장 확인 근거를 6자 이상 입력해 주세요.";
        return null;
      },
      run: (v) => {
        const c = caseById(v.caseId);
        const w = workflowFor(c).onsite.find((x) => x.code === v.code);
        const doc = c.documents.find((x) => x.code === v.code);
        const data = { code: v.code, name: w.name, status: "확인 완료", file: "현장 확인 기록 (가상)", note: v.note.trim(), reviewedBy: S.role };
        if (doc) Object.assign(doc, data); else c.documents.push(data);
        return `${c.id}: ${w.name} 확인 완료 (시연 기록)`;
      },
    },
    RequestDocument: {
      label: "자료 요청",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => {
        const c = caseById(p.caseId);
        if (!c) return "신청 건이 없습니다.";
        if (c.decision) return "결정이 끝난 건입니다.";
        if (c.requests.some((r) => r.name === p.name && r.status !== "확인 완료")) return "같은 자료를 이미 요청했습니다.";
        return null;
      },
      run: (p) => {
        const c = caseById(p.caseId);
        const r = { id: "REQ-" + String(S.seq++).padStart(4, "0"), code: p.code || null, name: p.name, detail: p.detail || "",
          reason: p.reason, status: "요청됨", requestedAt: now(), requestedBy: S.role, file: null };
        c.requests.push(r);
        return `${c.id}: '${r.name}' 요청 (${r.reason})`;
      },
    },
    SubmitDocument: {
      label: "자료 제출",
      allowed: (u) => !!u.customerOf,
      pre: (p) => {
        const c = caseById(p.caseId);
        const r = c && c.requests.find((x) => x.id === p.reqId);
        if (!r) return "요청 건이 없습니다.";
        if (c.corp_code !== user().customerOf) return "다른 기업의 자료는 제출할 수 없습니다.";
        if (r.status !== "요청됨" && r.status !== "보완 요청") return "이미 제출했습니다.";
        if (!p.file) return "파일을 선택해 주세요.";
        return null;
      },
      run: (p) => {
        const c = caseById(p.caseId);
        const r = c.requests.find((x) => x.id === p.reqId);
        r.status = "제출됨"; r.file = p.file; r.submittedAt = now();
        if (r.code) {
          const d = c.documents.find((x) => x.code === r.code);
          if (d) { d.status = "제출됨"; d.file = p.file; } else c.documents.push({ code: r.code, name: r.name, status: "제출됨", file: p.file });
        }
        return `${c.id}: '${r.name}' 제출 (${p.file})`;
      },
    },
    ReviewUploadedDocument: {
      label: "접수 서류 확인",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (v) => {
        const c = caseById(v.caseId);
        const d = c && c.documents.find((x) => x.code === v.code);
        if (!c || c.decision) return "진행 중인 심사 건이 아닙니다.";
        if (!d || d.status !== "제출됨") return "검토 대기 중인 접수 서류가 없습니다.";
        return null;
      },
      run: (v) => {
        const c = caseById(v.caseId);
        const d = c.documents.find((x) => x.code === v.code);
        d.status = "확인 완료"; d.reviewedBy = S.role; d.reviewedAt = now();
        return `${c.id}: ${d.name} 확인 완료`;
      },
    },
    ReviewDocument: {
      label: "제출 자료 확인",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => {
        const c = caseById(p.caseId);
        const r = c && c.requests.find((x) => x.id === p.reqId);
        if (!r || r.status !== "제출됨") return "확인할 제출 자료가 없습니다.";
        return null;
      },
      run: (p) => {
        const c = caseById(p.caseId);
        const r = c.requests.find((x) => x.id === p.reqId);
        r.status = p.result; r.reviewedAt = now();
        if (r.code) { const d = c.documents.find((x) => x.code === r.code); if (d) d.status = p.result === "확인 완료" ? "확인 완료" : "보완 요청"; }
        return `${c.id}: '${r.name}' ${p.result}`;
      },
    },
    AssignReviewer: {
      label: "담당자 배정",
      allowed: (u) => u.role === "심사팀장",
      pre: (p) => (caseById(p.caseId) ? null : "신청 건이 없습니다."),
      run: (p) => { const c = caseById(p.caseId); const before = c.assignee; c.assignee = p.userId;
        return `${c.id}: 담당자 ${userName(before)} → ${userName(p.userId)}`; },
    },
    RecordOpinion: {
      label: "심사 의견 기록",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => (!p.text || p.text.trim().length < 5 ? "의견을 5자 이상 입력해 주세요." : caseById(p.caseId).decision ? "결정이 끝난 건입니다." : null),
      run: (p) => { const c = caseById(p.caseId);
        c.opinions.push({ by: S.role, at: now(), text: p.text.trim(), recommendation: p.recommendation });
        c.status = "결재 대기";
        return `${c.id}: 심사 의견 (${p.recommendation})`; },
    },
    RecordDecision: {
      label: "최종 결정",
      allowed: (u) => u.canApprove > 0,
      pre: (p) => {
        const c = caseById(p.caseId);
        const u = user();
        if (c.decision) return "이미 결정한 건입니다.";
        if (c.amount > u.canApprove) return `승인 권한(${fmt(u.canApprove)}) 초과. 상위 결재가 필요합니다.`;
        if (!c.opinions.length) return "심사역 의견이 먼저 기록되어야 합니다.";
        if (p.decision !== "거절") {
          const pc = policyFor(c);
          if (!pc.complete) return "필수 자료가 모두 확인되지 않았습니다: " + pc.missing.map((m) => m.name).join(", ");
          const pending = c.requests.filter((r) => r.status === "요청됨" || r.status === "제출됨");
          if (pending.length) return "확인이 끝나지 않은 요청 자료가 있습니다: " + pending.map((r) => r.name).join(", ");
        }
        return null;
      },
      run: (p) => {
        const c = caseById(p.caseId);
        c.decision = { decision: p.decision, by: S.role, at: now(), comment: p.comment || "" };
        c.status = p.decision;
        if (c.kind === "renewal") {
          const l = loanById(c.loanId);
          l.renewal.status = p.decision === "거절" ? "연장 거절" : "연장 승인";
          if (p.decision !== "거절") { l.maturity = addYears(l.maturity, c.years); l.rate = c.rate; }
        }
        return `${c.id}: ${p.decision}`;
      },
    },
    StartRenewalReview: {
      label: "만기연장 심사 시작",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => {
        const l = loanById(p.loanId);
        if (!l) return "대출이 없습니다.";
        if (S.cases.some((c) => c.loanId === l.id)) return "이미 연장 심사가 있습니다.";
        if (C.monthsBetween(ASOF, l.maturity) > 2) return "만기 60일 전부터 시작할 수 있습니다.";
        return null;
      },
      run: (p) => {
        const l = loanById(p.loanId);
        const c = { id: "RN-" + l.id.slice(3), kind: "renewal", loanId: l.id, corp_code: l.corp_code,
          product: l.product + " 만기연장", amount: l.balance, rate: l.renewal.requestedRate, years: l.renewal.requestedYears,
          method: "bullet", purpose: "기존 운전자금대출 만기연장", submittedAt: ASOF, submitter: { name: "최민수", role: "재무팀장" },
          status: "심사 중", assignee: "u1", documents: [], requests: [], opinions: [], decision: null };
        S.cases.push(c);
        l.renewal.status = "연장 심사 중";
        return `${l.id}: 만기연장 심사 ${c.id} 생성`;
      },
    },
    CreateMonitoringTask: {
      label: "검토 업무 생성",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => (S.events[p.key] && S.events[p.key].status !== "신규" ? "이미 처리한 사건입니다." : null),
      run: (p) => {
        const t = { id: "TSK-" + String(S.seq++).padStart(4, "0"), title: p.title, loanId: p.loanId, eventKey: p.key,
          assignee: "u1", createdAt: now(), status: "진행 중" };
        S.tasks.push(t);
        S.events[p.key] = { status: "검토 업무 생성", taskId: t.id };
        return `${p.loanId}: 검토 업무 ${t.id} 생성 — ${p.title}`;
      },
    },
    CloseEvent: {
      label: "사건 종결",
      allowed: (u) => ["심사역", "심사팀장"].includes(u.role),
      pre: (p) => (!p.note ? "종결 사유를 입력해 주세요." : null),
      run: (p) => {
        S.events[p.key] = { ...(S.events[p.key] || {}), status: "종결", note: p.note };
        const t = S.tasks.find((x) => x.eventKey === p.key); if (t) t.status = "완료";
        return `사건 종결: ${p.title} (${p.note})`;
      },
    },
  };

  function runAction(name, params) {
    const a = ACTIONS[name];
    const u = user();
    let err = !a.allowed(u) ? `${u.role}은(는) '${a.label}'을(를) 할 수 없습니다.` : a.pre(params);
    if (err) {
      toast(err, true);
      return false;
    }
    const summary = a.run(params);
    S.audit.unshift({ at: now(), action: name, label: a.label, by: S.role, summary });
    save();
    toast(a.label + " 완료");
    render();
    return true;
  }

  function addYears(d, n) {
    const [y, m, dd] = d.split("-");
    return `${+y + n}-${m}-${dd}`;
  }

  function workflowFor(c) {
    if (c.kind === "renewal") return null;
    const co = company(c.corp_code);
    const isProxy = C.call("checkAuthority", useCaseOf(c), co, c).needsPowerOfAttorney;
    const productId = c.productId || (SEED.processOntology.products.find((p) => p.name === c.product) || SEED.processOntology.products[0]).id;
    return C.call("compileWorkflow", useCaseOf(c), {
      productId, isProxy, companyType: "listed", amount: c.amount,
    }, SEED.processOntology);
  }

  function policyFor(c) {
    const workflow = workflowFor(c);
    const pol = c.kind === "renewal" ? SEED.renewalPolicy : workflow.policy;
    const auth = c.kind === "new" ? C.call("checkAuthority", useCaseOf(c), company(c.corp_code), c) : null;
    const docs = c.documents.map((d) => ({ ...d, status: d.status === "확인 완료" ? "충족" : d.status }));
    c.requests.forEach((r) => {
      if (r.code && !docs.find((d) => d.code === r.code)) docs.push({ code: r.code, name: r.name, status: r.status === "확인 완료" ? "충족" : r.status });
    });
    const result = C.call("policyCheck", useCaseOf(c), c, docs, pol, auth);
    return { ...result, workflow, policyVersion: pol.version };
  }

  const useCaseOf = (c) => (c.kind === "renewal" ? "만기연장 심사" : "신규 운전자금 심사");

  // ------------------------------------------------------------ 작은 화면 도구
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const dartUrl = (r) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r}`;
  const dartLink = (r, label) => r ? `<a class="src" href="${dartUrl(r)}" target="_blank" rel="noopener">${esc(label || "DART 원문")}</a>` : "";
  const d8 = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "");
  const pct = (v, d = 1) => (v == null ? "-" : (v * 100).toFixed(d) + "%");
  const times = (v) => (v == null ? "-" : v.toFixed(2) + "배");
  const tag = (kind) => ({
    PUBLIC: `<span class="tag t-public">DART 공시</span>`,
    SYN: `<span class="tag t-syn">가상 데이터</span>`,
    CALC: `<span class="tag t-calc">계산값</span>`,
    ASSUME: `<span class="tag t-syn">가정</span>`,
  }[kind]);
  const levelBadge = (l) => `<span class="lv lv-${{ "통과": "ok", "정보": "info", "확인 필요": "warn", "긴급": "bad", "검토": "warn", "참고": "info" }[l] || "info"}">${esc(l)}</span>`;
  const fnBadge = () => "";
  const statusBadge = (s) => `<span class="st st-${{ "요청됨": "wait", "제출됨": "sub", "확인 완료": "ok", "보완 요청": "bad", "심사 중": "wait", "결재 대기": "sub", "승인": "ok", "조건부 승인": "ok", "거절": "bad", "진행 중": "wait", "완료": "ok" }[s] || "wait"}">${esc(s)}</span>`;

  function barChart(series, opts) {
    // series: [{label, value}], 음수 허용
    const w = opts.width || 520, h = opts.height || 150, pad = 24;
    const vals = series.map((s) => s.value || 0);
    const max = Math.max(0, ...vals, opts.line != null ? opts.line * 1.08 : 0), min = Math.min(0, ...vals);
    const range = max - min || 1;
    const bw = (w - pad) / series.length;
    const y0 = 8 + ((max) / range) * (h - 30);
    const bars = series.map((s, i) => {
      const v = s.value || 0;
      const bh = (Math.abs(v) / range) * (h - 30);
      const y = v >= 0 ? y0 - bh : y0;
      const cls = v < 0 ? "bar neg" : s.hl ? "bar hl" : "bar";
      return `<g><rect class="${cls}" x="${pad + i * bw + bw * 0.18}" y="${y}" width="${bw * 0.64}" height="${Math.max(bh, 1)}"><title>${esc(s.label)}: ${esc(opts.fmt(v))}</title></rect>
        <text class="axis" x="${pad + i * bw + bw / 2}" y="${h - 4}" text-anchor="middle">${esc(s.label)}</text>
        ${opts.values ? `<text class="val" x="${pad + i * bw + bw / 2}" y="${v >= 0 ? y - 3 : y + bh + 10}" text-anchor="middle">${esc(opts.fmt(v))}</text>` : ""}</g>`;
    }).join("");
    const line = opts.line != null ? (() => { const ly = 8 + ((max - opts.line) / range) * (h - 30);
      return `<line class="ref" x1="${pad}" x2="${w}" y1="${ly}" y2="${ly}"/><text class="axis" x="${pad - 2}" y="${ly + 3}" text-anchor="end">${esc(opts.lineLabel || opts.line)}</text>`; })() : "";
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || "")}"><line class="zero" x1="${pad}" x2="${w}" y1="${y0}" y2="${y0}"/>${bars}${line}</svg>`;
  }

  let toastTimer;
  function toast(msg, bad) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = "toast"), bad ? 4500 : 2200);
  }

  // ------------------------------------------------------------ 라우팅
  function route() {
    const h = (location.hash || "#/home").slice(2).split("/");
    return { page: h[0] || "home", id: h[1] ? decodeURIComponent(h[1]) : null, sub: h[2] || null };
  }

  const NAV_STAFF = [
    ["@", "심사 업무"], ["home", "업무 현황"], ["company", "기업 정보"],
    ["@", "절차 설계"], ["workflow", "상품별 심사 온톨로지"],
    ["@", "여신 관리"], ["loans", "실행 여신"], ["monitor", "사후 모니터링"],
    ["@", "운영"], ["packages", "업무 기능 관리"], ["audit", "처리 기록"],
  ];
  const NAV_CUSTOMER = [["@", "고객 서비스"], ["portal", "요청 자료 제출"]];
  const PAGE_LABEL = { home: "업무 현황", cases: "업무 현황", case: "업무 현황", company: "기업 정보", loans: "실행 여신", loan: "실행 여신",
    monitor: "사후 모니터링", workflow: "상품별 심사 온톨로지", packages: "업무 기능 관리", audit: "처리 기록", portal: "요청 자료 제출" };
  const ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    company: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10 21v-3h4v3"/>',
    cases: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M8.5 12l2 2 4-4"/><path d="M9 17h6"/>',
    loans: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    monitor: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    workflow: '<circle cx="4" cy="12" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="M6 12h6l6-7M12 12l6 7"/>',
    packages: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>',
    audit: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    portal: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  };
  const icon = (k) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ""}</svg>`;

  function render() {
    const u = user();
    const r = route();
    const nav = u.customerOf ? NAV_CUSTOMER : NAV_STAFF;
    if (u.customerOf && r.page !== "portal") { location.hash = "#/portal"; return; }
    if (!u.customerOf && r.page === "portal") { location.hash = "#/home"; return; }

    document.getElementById("role").innerHTML = SEED.users.map((x) =>
      `<option value="${x.id}" ${x.id === S.role ? "selected" : ""}>${esc(x.name)} · ${esc(x.role)}</option>`).join("");
    document.getElementById("avatar").textContent = u.name.slice(0, 1);
    document.body.classList.toggle("customer", !!u.customerOf);
    document.querySelector(".brand span").textContent = u.customerOf ? "기업고객" : "기업여신";
    document.getElementById("nav").innerHTML = nav.map(([k, label]) => {
      if (k === "@") return `<div class="nav-group">${label}</div>`;
      let badge = "";
      if (k === "monitor") { const n = monitorEvents().filter((e) => (S.events[e.key] || {}).status === undefined && e.severity !== "참고").length; if (n) badge = `<span class="nb">${n}</span>`; }
      if (k === "portal") { const n = myRequests().filter((x) => ["요청됨", "보완 요청"].includes(x.r.status)).length; if (n) badge = `<span class="nb">${n}</span>`; }
      return `<a href="#/${k}" class="${r.page === k || (k === "cases" && r.page === "case") || (k === "loans" && r.page === "loan") ? "on" : ""}">${icon(k)}<span>${label}</span>${badge}</a>`;
    }).join("") + `<div class="nav-foot">${esc(SEED.bank)} 기업여신심사부<br>시연용 화면 · 공시 자료는 DART 기준</div>`;

    const main = document.getElementById("main");
    const pages = { home: pageHome, company: pageCompany, cases: pageHome, case: pageCase, loans: pageLoans, loan: pageLoan,
      monitor: pageMonitor, workflow: pageWorkflow, packages: pagePackages, audit: pageAudit, portal: pagePortal };
    const crumb = r.page === "case" || r.page === "loan" || (r.page === "company" && r.id)
      ? `<a href="#/${r.page === "case" ? "home" : r.page === "loan" ? "loans" : "company"}">${PAGE_LABEL[r.page]}</a><span>›</span><b>${esc(r.id || "")}</b>`
      : `<b>${PAGE_LABEL[r.page] || "업무 현황"}</b>`;
    main.innerHTML = `<div class="crumb keep">${crumb}</div>` + (pages[r.page] || pageHome)(r);
    main.querySelectorAll("table.t:not(.num)").forEach((tb) => {
      const hr = tb.querySelector("tr"); if (!hr) return;
      const ths = Array.from(hr.children).map((h) => h.textContent.trim());
      if (ths.length < 4) return;
      tb.classList.add("stack");
      tb.querySelectorAll("tr").forEach((tr, i) => { if (i === 0) return; Array.from(tr.children).forEach((td, j) => { if (ths[j]) td.setAttribute("data-th", ths[j]); }); });
    });
    main.querySelectorAll("[data-init]").forEach((el) => INIT[el.dataset.init] && INIT[el.dataset.init](el));
    window.scrollTo(0, window.__keepScroll || 0);
    window.__keepScroll = 0;
  }

  // ------------------------------------------------------------ 업무 현황
  function pageHome() {
    const u = user();
    const mine = S.cases.slice();
    const waiting = S.cases.flatMap((c) => c.requests.filter((r) => r.status === "제출됨").map((r) => ({ c, r })));
    const evs = monitorEvents().filter((e) => !S.events[e.key] && e.severity !== "참고");
    const dueLoans = S.loans.filter((l) => C.monthsBetween(ASOF, l.maturity) <= 2 && !S.cases.some((c) => c.loanId === l.id));
    return `
      <h1>업무 현황</h1>
      <p class="sub">${esc(u.name)} · ${esc(u.role)} · 기준일 ${ASOF}</p>
      <div class="grid4">
        <div class="kpi"><div class="k">진행 중 심사</div><div class="v">${mine.filter((c) => !c.decision).length}건</div></div>
        <div class="kpi"><div class="k">확인할 제출 자료</div><div class="v">${waiting.length}건</div></div>
        <div class="kpi"><div class="k">미처리 공시 사건</div><div class="v">${evs.length}건</div></div>
        <div class="kpi"><div class="k">만기 60일 이내 여신</div><div class="v">${dueLoans.length}건</div></div>
      </div>
      <section class="card workflow-intro"><div class="row-between"><div><h2>상품·기업 조건별 심사 절차</h2><p class="small">대출 상품·신청인·공시 여부에 따른 필수 확인 항목·담당자·처리 방식의 비교</p></div><a href="#/workflow" class="btn-ghost">절차 비교</a></div></section>
      <section class="card"><h2>심사 건</h2>${caseTable(mine)}</section>
      ${waiting.length ? `<section class="card"><h2>고객이 제출한 자료</h2><table class="t"><tr><th>신청 건</th><th>자료</th><th>파일</th><th>제출 시각</th><th></th></tr>
        ${waiting.map(({ c, r }) => `<tr><td><a href="#/case/${c.id}">${c.id}</a></td><td>${esc(r.name)}</td><td>${esc(r.file)}</td><td>${esc(r.submittedAt)}</td><td><a href="#/case/${c.id}">확인하러 가기</a></td></tr>`).join("")}</table></section>` : ""}
      ${dueLoans.length ? `<section class="card"><h2>만기 도래 여신</h2><table class="t"><tr><th>대출</th><th>기업</th><th>잔액</th><th>만기</th><th></th></tr>
        ${dueLoans.map((l) => `<tr><td><a href="#/loan/${l.id}">${l.id}</a></td><td>${esc(company(l.corp_code).name)}</td><td>${fmt(l.balance)}</td><td>${l.maturity} (D-${Math.round(C.monthsBetween(ASOF, l.maturity) * 30)})</td>
          <td><button data-act="StartRenewalReview" data-loan="${l.id}">만기연장 심사 시작</button></td></tr>`).join("")}</table></section>` : ""}
      ${S.tasks.filter((t) => t.status !== "완료").length ? `<section class="card"><h2>검토 업무</h2><table class="t"><tr><th>업무</th><th>내용</th><th>대출</th><th>담당</th><th>생성</th></tr>
        ${S.tasks.filter((t) => t.status !== "완료").map((t) => `<tr><td>${t.id}</td><td>${esc(t.title)}</td><td><a href="#/loan/${t.loanId}">${t.loanId}</a></td><td>${esc(userName(t.assignee))}</td><td>${t.createdAt}</td></tr>`).join("")}</table></section>` : ""}
      <section class="card"><h2>최근 처리 기록</h2>${auditTable(S.audit.slice(0, 6))}</section>`;
  }

  function caseTable(list) {
    if (!list.length) return `<p class="empty">진행 중인 건이 없습니다.</p>`;
    return `<table class="t"><tr><th>번호</th><th>구분</th><th>기업</th><th>상품</th><th>금액</th><th>접수일</th><th>담당</th><th>상태</th></tr>
      ${list.map((c) => `<tr><td><a href="#/case/${c.id}">${c.id}</a></td><td>${c.kind === "new" ? "신규" : "만기연장"}</td><td>${esc(company(c.corp_code).name)}</td>
        <td>${esc(c.product)}</td><td>${fmt(c.amount)}</td><td>${c.submittedAt}</td><td>${esc(userName(c.assignee))}</td><td>${statusBadge(c.status)}</td></tr>`).join("")}</table>`;
  }

  function pageCases() {
    return `<h1>심사 목록</h1><p class="sub">신규 심사와 만기연장 심사를 같은 목록에서 관리합니다.</p>
      <section class="card">${caseTable(S.cases)}</section>`;
  }

  // ------------------------------------------------------------ 기업 정보
  let companyTab = "overview", fsScope = "OFS", discFilter = "전체";
  function pageCompany(r) {
    const corp = r.id || Object.keys(DATA.companies)[0];
    const c = company(corp);
    const tabs = [["overview", "개요"], ["fin", "재무"], ["debt", "차입·사채"]];
    const body = { overview: coOverview, fin: coFin, debt: coDebt, disc: coDisc, rel: coRel }[companyTab](c);
    return `
      <div class="row-between"><h1>${esc(c.name)}</h1></div>
      <p class="sub">${esc(c.market)} ${esc(c.stock_code)} · 고유번호 ${c.corp_code} · ${tag("PUBLIC")} 기준일 ${ASOF}까지 공시된 정보만 표시</p>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${companyTab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}</div>
      ${body}`;
  }

  function coOverview(c) {
    const y = C.latestYear(c, "OFS", ASOF);
    const rt = C.call("calcRatios", "기업 정보", c, "OFS", y);
    const risk = C.call("riskSignals", "기업 정보", c, ASOF);
    const st = c.financials.OFS[y];
    const v = (k) => fmt(C.val(c, "OFS", y, k));
    return `
      <div class="grid2">
        <section class="card"><h2>기본 정보</h2><dl class="dl">
          <dt>대표이사</dt><dd>${esc(c.ceo)}</dd><dt>설립일</dt><dd>${d8(c.est_dt)}</dd>
          <dt>사업자등록번호</dt><dd>${esc(c.bizr_no.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3"))}</dd>
          <dt>업종 코드</dt><dd>${esc(c.induty_code)}</dd><dt>주소</dt><dd>${esc(c.address)}</dd>
          <dt>결산월</dt><dd>${esc(c.acc_mt)}월</dd></dl>
          <p class="note">출처: DART 기업개황</p></section>
        <section class="card"><h2>${y}년 요약 (별도)</h2><dl class="dl">
          <dt>매출액</dt><dd>${v("revenue")}</dd><dt>영업이익</dt><dd>${v("op_income")}</dd>
          <dt>당기순이익</dt><dd>${v("net_income")}</dd><dt>부채비율</dt><dd>${pct(rt.debtToEquity.value)}</dd>
          <dt>차입금 합계</dt><dd>${fmt(rt.debt.total)}</dd><dt>영업활동현금흐름</dt><dd>${v("op_cf")}</dd></dl>
          <p class="note">${dartLink(st.rcept_no, `${y} 사업보고서`)} · 공시일 ${d8(st.published)}</p></section>
      </div>
      `;
  }

  function coFin(c) {
    const ys = C.availableYears(c, fsScope, ASOF);
    const keys = ["revenue", "op_income", "net_income", "assets", "liabilities", "equity", "cash", "op_cf", "finance_costs"];
    const chart = barChart(ys.map((y) => ({ label: y.slice(2), value: C.val(c, fsScope, y, "revenue") })), { fmt, title: "매출액" });
    const chart2 = barChart(ys.map((y) => ({ label: y.slice(2), value: C.val(c, fsScope, y, "op_income") })), { fmt, title: "영업이익" });
    return `
      <div class="seg"><button class="${fsScope === "OFS" ? "on" : ""}" data-scope="OFS">별도</button><button class="${fsScope === "CFS" ? "on" : ""}" data-scope="CFS">연결</button></div>
      ${!ys.length ? `<p class="empty">연결재무제표가 없습니다.</p>` : `
      <div class="grid2"><section class="card"><h3>매출액</h3>${chart}</section><section class="card"><h3>영업이익</h3>${chart2}</section></div>
      <section class="card scroll"><table class="t num"><tr><th>항목</th>${ys.map((y) => `<th>${y}</th>`).join("")}</tr>
        ${keys.map((k) => `<tr><td>${C.LABELS[k]}</td>${ys.map((y) => { const it = C.item(c, fsScope, y, k);
          return `<td title="${it ? esc(it.src.account_nm + " · 접수번호 " + it.src.rcept_no) : "자료 없음"}">${it ? fmt(it.v) : "-"}</td>`; }).join("")}</tr>`).join("")}
        <tr class="srcrow"><td>원문</td>${ys.map((y) => `<td>${dartLink(c.financials[fsScope][y].rcept_no, "보기")}</td>`).join("")}</tr></table>
        <p class="note">${fsScope === "OFS" ? "별도: 대출 신청 법인 자체의 재무제표입니다." : "연결: 종속회사를 포함한 수치입니다. 법인 자체 상환능력과 구분해서 봅니다."} 금액에 마우스를 올리면 원래 계정명과 접수번호가 보입니다.</p></section>`}`;
  }

  function coDebt(c) {
    const y = C.latestYear(c, "OFS", ASOF);
    const d = C.call("summarizeDebt", "기업 정보", c, "OFS", y);
    return `
      <section class="card"><h2>${y}년 말 차입금 구성 (별도) ${fnBadge("summarizeDebt")}</h2>
        <table class="t num"><tr><th>계정</th><th>금액</th><th>1년 내 만기</th></tr>
        ${d.parts.map((p) => `<tr><td>${p.label}</td><td>${p.found ? fmt(p.value) : "-"}</td><td>${["st_borrowings", "cur_lt_borrowings", "cur_cb", "cur_lease"].includes(p.key) ? "예" : ""}</td></tr>`).join("")}
        <tr class="sum"><td>합계</td><td>${fmt(d.total)}</td><td>${fmt(d.dueWithinYear)}</td></tr></table>
        <p class="note">${esc(d.note)}</p></section>
      <section class="card"><h2>전환사채 발행 조건 ${tag("PUBLIC")}</h2>
        ${c.bonds.length ? `<table class="t"><tr><th>회차</th><th>이사회 결의일</th><th>발행금액</th><th>표면이자율</th><th>만기보장수익률</th><th>만기일</th><th>방식</th><th>원문</th></tr>
        ${c.bonds.slice().sort((a, b) => +a.seq - +b.seq).map((b) => `<tr><td>${esc(b.seq)}</td><td>${esc(b.board_date)}</td><td>${fmt(b.amount)}</td><td>${esc(b.coupon)}%</td><td>${esc(b.ytm)}%</td><td>${esc(b.maturity)}</td><td>${esc(b.method)}</td><td>${dartLink(b.rcept_no, "보기")}</td></tr>`).join("")}</table>
        <p class="note">정정 공시가 있는 경우 최종 정정본 조건입니다.</p>` : `<p class="empty">전환사채 발행 공시가 없습니다.</p>`}</section>`;
  }

  function coDisc(c) {
    const cats = ["전체", ...Array.from(new Set(c.disclosures.map((d) => d.category)))];
    const list = c.disclosures.filter((d) => discFilter === "전체" || d.category === discFilter).slice(0, 80);
    return `
      <div class="seg wrap">${cats.map((k) => `<button class="${discFilter === k ? "on" : ""}" data-disc="${esc(k)}">${esc(k)}</button>`).join("")}</div>
      <section class="card"><table class="t"><tr><th>접수일</th><th>분류</th><th>제목</th><th></th></tr>
        ${list.map((d) => `<tr><td>${d8(d.date)}</td><td>${esc(d.category)}</td><td>${esc(d.title)}</td><td>${dartLink(d.rcept_no, "원문")}</td></tr>`).join("")}</table>
        <p class="note">거래소 공시와 주요사항보고서 ${c.disclosures.length}건 중 최근 80건까지 표시합니다. 분류는 제목 기준 규칙으로 나눴습니다.</p></section>`;
  }

  function coRel(c) {
    return `
      <div class="grid2">
        <section class="card"><h2>최대주주 및 특수관계인 (${esc(c.shareholders.year)})</h2><table class="t"><tr><th>이름</th><th>관계</th><th>지분율</th></tr>
          ${c.shareholders.rows.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.relate)}</td><td>${esc(s.share)}%</td></tr>`).join("")}</table></section>
        <section class="card"><h2>타법인 출자 (${esc(c.investments.year)})</h2><table class="t"><tr><th>법인</th><th>목적</th><th>지분율</th><th>장부가액</th></tr>
          ${c.investments.rows.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.purpose)}</td><td>${esc(s.share)}%</td><td>${fmt(s.book)}</td></tr>`).join("")}</table></section>
      </div>
      <section class="card"><h2>임원 (${esc(c.executives.year)})</h2><table class="t"><tr><th>이름</th><th>직위</th><th>등기 여부</th><th>담당</th></tr>
        ${c.executives.rows.slice(0, 15).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.position)}</td><td>${esc(s.registered)}</td><td>${esc(s.duty)}</td></tr>`).join("")}</table>
        <p class="note">사업보고서 기준입니다. 대표권 확인은 법인등기사항증명서로 다시 합니다.</p></section>`;
  }

  // ------------------------------------------------------------ 심사 화면 (신규·만기연장 공통)
  function scenarioParams(c) {
    const sp = S.scenario[c.id] || {};
    return { ...SEED.scenarioDefaults, amount: c.amount, rate: c.rate, years: c.years, method: c.method, ...sp };
  }

  function pageCase(r) {
    const c = caseById(r.id);
    if (!c) return `<p class="empty">신청 건을 찾을 수 없습니다.</p>`;
    const co = company(c.corp_code);
    const uc = useCaseOf(c);
    const u = user();
    const y = C.latestYear(co, "OFS", ASOF);
    const pc = policyFor(c);
    const checks = C.call("validateFacts", uc, co, ASOF);
    const auth = c.kind === "new" ? C.call("checkAuthority", uc, co, c) : null;
    const rt = C.call("calcRatios", uc, co, "OFS", y);
    const rtPrev = C.call("calcRatios", uc, co, "OFS", String(+y - 1));
    const risk = C.call("riskSignals", uc, co, ASOF);
    const sp = scenarioParams(c);
    const sim = C.call("simulateRepayment", uc, co, ASOF, sp);
    const ev = S.evi[c.kind === "renewal" ? "renewal" : "newLoan"];
    const loss = { approveBad: c.amount * ev.lgd, rejectGood: c.amount * ev.rejectGoodRate };
    const nba = C.call("nextBestAction", uc, risk.prior, ev.actions, loss);
    const loan = c.loanId ? loanById(c.loanId) : null;
    const cov = loan ? C.call("checkCovenants", uc, co, ASOF, loan.covenants) : null;

    const step = (n, title, fns, inner) => `<section id="step-${n}" class="card step"><h2><span class="n">${n}</span>${title}<span class="fns">${fns.map(fnBadge).join("")}</span></h2>${inner}</section>`;
    const findings = (list) => `<ul class="checks">${list.map((f) => `<li>${levelBadge(f.level)}<div><b>${esc(f.title)}</b><p>${esc(f.detail)} ${(f.refs || []).map((x) => dartLink(x.rcept_no, x.label)).join(" ")}</p></div></li>`).join("")}</ul>`;

    // 1. 신청 / 대출 현황
    const s1 = c.kind === "new" ? step(1, "신청 내용", [], `
        <dl class="dl cols">
          <dt>기업</dt><dd><a href="#/company/${co.corp_code}">${esc(co.name)}</a></dd><dt>상품</dt><dd>${esc(c.product)}</dd>
          <dt>신청 금액</dt><dd>${fmt(c.amount)}</dd><dt>기간·상환</dt><dd>${c.years}년 · ${c.method === "bullet" ? "만기일시상환" : "원금균등분할"}</dd>
          <dt>제시 금리</dt><dd>연 ${c.rate}%</dd><dt>자금 용도</dt><dd>${esc(c.purpose)}</dd>
          <dt>신청인</dt><dd>${esc(c.submitter.name)} (${esc(c.submitter.role)})</dd><dt>접수일</dt><dd>${c.submittedAt} · 비대면 접수</dd></dl>
        <p class="note">${tag("SYN")} 신청 정보는 시연용 가상 데이터입니다.</p>`)
      : step(1, "대출 현황", ["checkCovenants"], `
        <dl class="dl cols">
          <dt>기업</dt><dd><a href="#/company/${co.corp_code}">${esc(co.name)}</a></dd><dt>대출</dt><dd><a href="#/loan/${loan.id}">${loan.id}</a> · ${esc(loan.product)}</dd>
          <dt>잔액</dt><dd>${fmt(loan.balance)}</dd><dt>현재 만기</dt><dd>${loan.maturity}</dd>
          <dt>연장 요청</dt><dd>${c.years}년 · 연 ${c.rate}%</dd><dt>이자 납부</dt><dd>${loan.repayments.length}회 중 연체 ${loan.repayments.filter((p) => p[3] !== "정상").length}회</dd></dl>
        <h3>약정 점검</h3><ul class="checks">${cov.map((k) => `<li>${levelBadge(k.ok === true ? "통과" : k.ok === false ? "확인 필요" : "정보")}<div><b>${esc(k.name)}</b><p>${esc(k.text)}</p></div></li>`).join("")}</ul>
        <p class="note">${tag("SYN")} 대출·상환·약정 정보는 가상 데이터, 재무비율은 DART 공시로 계산했습니다.</p>`);

    // 2. 자료 확인
    const s2 = step(2, "자료 확인", c.kind === "new" ? ["policyCheck", "checkAuthority", "validateFacts"] : ["policyCheck", "validateFacts"], `
      <h3>필수 자료·확인 업무 (${esc(pc.policyVersion)})</h3>
      ${pc.workflow ? `<p class="note">적용 상품: <b>${esc(pc.workflow.product.name)}</b> · <a href="#/workflow">상품별 절차 비교</a></p>` : ""}
      <table class="t"><tr><th>자료</th><th>이유</th><th>상태</th><th></th></tr>
        ${pc.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.why)}</td><td>${i.status === "충족" || i.status === "자동 확보" ? `<span class="st st-ok">${esc(i.status)}</span>` : i.status === "해당 없음" ? `<span class="muted">해당 없음</span>` : statusBadge(i.status)}${i.note ? `<div class="note">${esc(i.note)}</div>` : ""}</td>
          <td>${i.code === "SITE_REPORT" ? `<span class="muted">현장 확인 (은행 담당)</span>` : i.status === "제출됨" ? `<button data-act="ReviewUploadedDocument" data-code="${i.code}">확인 완료</button>` : i.status === "미제출" ? `<button data-act="RequestDocument" data-code="${i.code}" data-name="${esc(i.name)}" data-reason="필수 자료">요청</button>` : ""}</td></tr>`).join("")}</table>
      ${pc.workflow && pc.workflow.onsite.length ? `<div class="onsite-note"><h3>현장 확인 (온라인 제출 대상 제외)</h3>
        ${pc.workflow.onsite.map((x) => {
          const done = c.documents.find((d) => d.code === x.code && d.status === "확인 완료");
          return `<p><b>${esc(x.name)}</b> · ${done ? "확인 완료 (시연 기록)" : "확인 대기"}</p>
            ${done ? `<p class="note">${esc(done.note || "")} / ${esc(userName(done.reviewedBy))}</p>` : `<form data-form="onsite" data-code="${x.code}" class="inline"><input name="note" required placeholder="현장 확인 근거"><button type="submit">확인 결과 기록</button></form>`}`;
        }).join("")}</div>` : ""}
      ${auth ? `<h3>대표권 확인</h3>${findings(auth.findings)}` : ""}
      <h3>공시 자료 검증</h3>${findings(checks)}`);

    // 3. 재무 분석
    const row = (label, a, b, f) => `<tr><td>${label}</td><td>${f(b)}</td><td>${f(a)}</td></tr>`;
    const s3 = step(3, c.kind === "new" ? "재무 분석" : "재무 변화", ["calcRatios", "summarizeDebt", "riskSignals"], `
      <div class="grid2"><div>
        <table class="t num"><tr><th>지표 (별도)</th><th>${+y - 1}</th><th>${y}</th></tr>
          ${row("매출액", C.val(co, "OFS", y, "revenue"), C.val(co, "OFS", String(+y - 1), "revenue"), fmt)}
          ${row("영업이익률", rt.opMargin.value, rtPrev.opMargin.value, (v) => pct(v))}
          ${row("부채비율", rt.debtToEquity.value, rtPrev.debtToEquity.value, (v) => pct(v, 0))}
          ${row("유동비율", rt.currentRatio.value, rtPrev.currentRatio.value, (v) => pct(v, 0))}
          ${row("차입금의존도", rt.debtDependence.value, rtPrev.debtDependence.value, (v) => pct(v))}
          ${row("영업이익 / 금융원가", rt.coverage.value, rtPrev.coverage.value, times)}
          ${row("순차입금", rt.netDebt.value, rtPrev.netDebt.value, fmt)}
        </table><p class="note">${tag("CALC")} ${esc(rt.notes[0])}</p></div>
        <div><h3>위험 신호</h3><ul class="plain">${risk.all.map((h) => `<li class="${h.hit ? "hit" : ""}">${h.hit ? "●" : "○"} ${esc(h.text)} (${h.pts}점)</li>`).join("")}</ul>
          <p>합계 <b>${risk.score}점</b> · 구간 <b>${risk.band}</b> · 상환곤란 확률 가정 <b>${pct(risk.prior, 0)}</b></p>
          <p class="note">${esc(risk.note)}</p></div></div>`);

    // 4. 상환여력
    const s4 = step(4, "상환여력 시나리오", ["simulateRepayment"], `
      <form class="params" data-form="scenario" data-case="${c.id}">
        <label>대출금(억)<input name="amount" type="number" step="1" value="${sp.amount / 1e8}"></label>
        <label>금리(%)<input name="rate" type="number" step="0.1" value="${sp.rate}"></label>
        <label>기존 차입 금리(%)<input name="existingRate" type="number" step="0.1" value="${sp.existingRate}"></label>
        <label>1년 내 만기 차환율(%)<input name="refinanceRatio" type="number" step="5" min="0" max="100" value="${sp.refinanceRatio}"></label>
        <label>매출 변화(%)<input name="salesShock" type="number" step="1" value="${sp.salesShock}"></label>
        <label>영업이익률 변화(%p)<input name="marginShock" type="number" step="0.5" value="${sp.marginShock}"></label>
        <label>금리 상승(%p)<input name="rateShock" type="number" step="0.5" value="${sp.rateShock}"></label>
        <button type="submit">다시 계산</button>
      </form>
      <div class="grid2"><div>
        <table class="t num"><tr><th>시나리오</th><th>상환재원</th><th>1년차 원리금</th><th>최소 DSCR</th><th>신규 대출만</th></tr>
          ${sim.results.map((s) => `<tr><td>${esc(s.name)}</td><td>${fmt(s.cfads)}</td><td>${fmt(s.rows[0].service)}</td><td class="${s.minDscr < 1 ? "warn-t" : ""}"><b>${isFinite(s.minDscr) ? s.minDscr.toFixed(2) : "-"}</b></td>
            <td class="${s.minDscrNewOnly < 1 ? "warn-t" : ""}">${isFinite(s.minDscrNewOnly) ? s.minDscrNewOnly.toFixed(2) : "-"}</td></tr>`).join("")}</table>
        <p class="note">'최소 DSCR'은 기존 차입금 이자와 1년 내 만기분 상환까지 포함한 값, '신규 대출만'은 이번 대출의 원리금만 넣은 값입니다.</p>
      </div><div>${barChart(sim.results.map((s) => ({ label: s.name, value: isFinite(s.minDscr) ? s.minDscr : 0 })), { fmt: (v) => v.toFixed(2), line: 1, lineLabel: "1.0", width: 420, title: "최소 DSCR", values: true })}
        <p class="note">DSCR = 상환재원 ÷ (신규·기존 대출 이자 + 해당 연도 원금)</p></div></div>
      <h3>가정</h3><ul class="plain small">${sim.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <p class="note">${tag("ASSUME")} ${esc(sim.caution)}</p>`);

    // 5. 다음 업무 추천
    const requested = (name) => c.requests.some((x) => x.name === name);
    const s5 = step(5, "추가 확인 추천", ["nextBestAction"], `
      <p>필수 자료는 위 2단계에서 정책대로 모두 받습니다. 여기서는 <b>선택적으로 할 수 있는 확인</b>을 비교합니다.
        추가 확인으로 판단이 바뀔 가능성이 크고 비용이 작은 것부터 추천합니다.</p>
      <p>지금 정보만으로 결정하면 <b>${nba.now.choice}</b> 쪽의 예상 손실이 작습니다 (승인 ${fmt(nba.now.approve, 2)} / 거절 ${fmt(nba.now.reject, 2)}).
        추천 항목은 결과에 따라 이 판단이 바뀔 수 있는 확인입니다.</p>
      <table class="t num"><tr><th class="l">확인 항목</th><th>예상 효과</th><th>비용</th><th>효과 − 비용</th><th>추천</th><th></th></tr>
        ${nba.ranked.map((a) => `<tr><td class="l"><b>${esc(a.name)}</b><div class="note">${esc(a.detail)}</div></td><td>${fmt(a.evi, 2)}</td><td>${fmt(a.cost, 2)}</td>
          <td class="${a.net > 0 ? "ok-t" : "muted"}">${fmt(a.net, 2)}</td><td>${a.recommend ? "<b>추천</b>" : "보류"}</td>
          <td>${requested(a.name) ? '<span class="muted">요청함</span>' : `<button data-act="RequestDocument" data-name="${esc(a.name)}" data-detail="${esc(a.detail)}" data-reason="${a.recommend ? "추가 확인 추천" : "심사역 판단"}" class="${a.recommend ? "" : "ghost"}">요청</button>`}</td></tr>`).join("")}</table>
      <h3>요청 방식 비교 (같은 가정에서 계산)</h3>
      <table class="t num"><tr><th class="l">방식</th><th>평균 요청 건수</th><th>확인 비용</th><th>예상 오판 손실</th><th>합계</th></tr>
        ${nba.compare.map((x, i) => `<tr class="${i === 2 ? "hlrow" : ""}"><td class="l">${esc(x.name)}</td><td>${x.count.toFixed(2)}</td><td>${fmt(x.cost, 2)}</td><td>${fmt(x.loss, 2)}</td><td><b>${fmt(x.cost + x.loss, 2)}</b></td></tr>`).join("")}</table>
      <details><summary>계산 방법</summary>
        <p class="small">현재 상환곤란 확률 p = ${pct(nba.prior, 0)} (3단계 위험 신호 구간). 승인했는데 상환곤란이면 손실 = 대출금 × ${ev.lgd * 100}% = ${fmt(loss.approveBad)},
          정상 기업을 거절하면 손실 = 대출금 × ${(ev.rejectGoodRate * 100).toFixed(0)}% = ${fmt(loss.rejectGood)}. 지금 결정한다면 '${nba.now.choice}'이 손실이 작습니다.</p>
        <p class="small">각 확인은 '우려' 또는 '양호' 결과를 낸다고 보고, 상환곤란 기업에서 '우려'가 나올 확률(민감도)과 정상 기업에서 '양호'가 나올 확률(특이도)을 가정했습니다.
          결과를 본 뒤 베이즈 규칙으로 확률을 고치고 다시 최선의 결정을 고릅니다. 예상 효과 = 지금 결정할 때의 예상 손실 − 확인 후 결정할 때의 예상 손실입니다.</p>
        </details>
      <p class="note">${tag("ASSUME")} ${esc(nba.note)}</p>`);

    // 6. 요청 자료와 처리
    const canDecide = u.canApprove > 0;
    const s6 = step(6, "요청 자료와 결정", [], `
      ${c.requests.length ? `<table class="t"><tr><th>번호</th><th>자료</th><th>사유</th><th>요청</th><th>상태</th><th>파일</th><th></th></tr>
        ${c.requests.map((q) => `<tr><td>${q.id}</td><td>${esc(q.name)}</td><td>${esc(q.reason)}</td><td>${esc(q.requestedAt)}</td><td>${statusBadge(q.status)}</td><td>${esc(q.file || "-")}</td>
          <td>${q.status === "제출됨" ? `<button data-act="ReviewDocument" data-req="${q.id}" data-result="확인 완료">확인 완료</button> <button class="ghost" data-act="ReviewDocument" data-req="${q.id}" data-result="보완 요청">보완 요청</button>` : ""}</td></tr>`).join("")}</table>
        <p class="note">요청한 자료는 고객 화면에 바로 나타납니다. 상단에서 사용자를 '최민수 · 다산솔루에타 재무팀장'으로 바꾸면 확인할 수 있습니다.</p>` : `<p class="empty">요청한 자료가 없습니다.</p>`}
      <div class="grid2">
        <div><h3>심사 의견</h3>
          ${c.opinions.map((o) => `<div class="op"><b>${esc(userName(o.by))}</b> · ${o.at} · ${esc(o.recommendation)}<p>${esc(o.text)}</p></div>`).join("") || `<p class="empty">아직 없습니다.</p>`}
          ${!c.decision ? `<form data-form="opinion"><textarea name="text" rows="3" placeholder="판단 근거를 적어 주세요."></textarea>
            <select name="recommendation"><option>승인 의견</option><option>조건부 승인 의견</option><option>거절 의견</option></select>
            <button type="submit">의견 기록</button></form>` : ""}</div>
        <div><h3>결정</h3>
          ${c.decision ? `<p>${statusBadge(c.decision.decision)} ${esc(userName(c.decision.by))} · ${c.decision.at}</p><p>${esc(c.decision.comment)}</p>`
            : `<p>결정 권한: <b>${esc(pc.approver)}</b> (${fmt(c.amount)})</p>
               ${!pc.complete ? `<p class="warn-t">필수 자료 미충족: ${pc.missing.map((m) => esc(m.name)).join(", ")}</p>` : ""}
               ${canDecide ? `<form data-form="decision"><input name="comment" placeholder="결정 사유 (선택)">
                 <div class="btns"><button type="submit" name="decision" value="승인">승인</button><button type="submit" name="decision" value="조건부 승인">조건부 승인</button><button type="submit" class="danger" name="decision" value="거절">거절</button></div></form>`
               : `<p class="muted">결정은 승인 권한이 있는 사용자만 할 수 있습니다. 상단에서 '이준호 · 심사팀장'으로 바꿔 진행하세요.</p>`}`}
        </div></div>`);

    // 진행 단계
    const pending = c.requests.filter((q) => q.status === "요청됨" || q.status === "제출됨" || q.status === "보완 요청").length;
    const stages = [
      ["접수", true, c.submittedAt],
      ["자료 확인", pc.complete && !pending, pc.complete && !pending ? "완료" : `필수 ${pc.items.filter((i) => ["충족", "자동 확보", "해당 없음", "확인 완료"].includes(i.status)).length}/${pc.items.length}`],
      ["분석·추천", true, `확인 필요 ${checks.filter((f) => f.level === "확인 필요").length}건`],
      ["심사 의견", c.opinions.length > 0, c.opinions.length ? c.opinions[c.opinions.length - 1].recommendation : "작성 전"],
      ["결정", !!c.decision, c.decision ? c.decision.decision : pc.approver],
    ];
    const curIdx = stages.findIndex((x) => !x[1]);
    const stepper = `<ol class="stepper keep">${stages.map((x, i) => `<li class="${x[1] ? "done" : i === curIdx ? "cur" : ""}"><span class="dot">${x[1] ? "✓" : i + 1}</span><div><b>${x[0]}</b><small>${esc(x[2])}</small></div></li>`).join("")}</ol>`;
    const base = sim.results[0];
    const top = nba.ranked.find((a) => a.recommend);
    const recent = S.audit.filter((a) => a.summary.startsWith(c.id) || (c.loanId && a.summary.startsWith(c.loanId))).slice(0, 4);
    const side = `<aside class="case-side">
        <div class="card side-card">
          <div class="side-co"><span class="co-mark">${esc(co.name.replace(/\(주\)|㈜/g, "").slice(0, 1))}</span><div><b>${esc(co.name)}</b><small>${esc(co.market)} ${esc(co.stock_code)} · 대표 ${esc(co.ceo)}</small></div></div>
          <dl class="side-dl">
            <dt>${c.kind === "new" ? "신청 금액" : "연장 금액"}</dt><dd><b>${fmt(c.amount)}</b></dd>
            <dt>기간·금리</dt><dd>${c.years}년 · 연 ${c.rate}%</dd>
            <dt>담당</dt><dd>${esc(userName(c.assignee))}</dd>
            <dt>결정 권한</dt><dd>${esc(pc.approver)}</dd>
          </dl>
          <div class="side-metrics">
            <div><small>위험 신호</small><b class="band band-${risk.band}">${risk.band}</b><span>${risk.score}점</span></div>
            <div><small>최소 DSCR</small><b class="${base.minDscr < 1 ? "warn-t" : ""}">${isFinite(base.minDscr) ? base.minDscr.toFixed(2) : "-"}</b><span>기본 시나리오</span></div>
            <div><small>확인 필요</small><b>${checks.filter((f) => f.level === "확인 필요").length}</b><span>공시 검증</span></div>
          </div>
          ${top ? `<div class="side-reco"><small>추천 확인</small><b>${esc(top.name)}</b><span>효과 ${fmt(top.evi, 2)} · 비용 ${fmt(top.cost, 2)}</span></div>` : ""}
        </div>
        <div class="card side-card"><h3>최근 처리</h3>${recent.length ? `<ul class="side-log">${recent.map((a) => `<li><b>${esc(a.label)}</b><span>${esc(userName(a.by))}</span><small>${a.at.slice(11)}</small></li>`).join("")}</ul>` : `<p class="empty">아직 처리 기록이 없습니다.</p>`}</div>
        <a href="#/packages" class="side-pkg">${icon("packages")}<span>${uc}에 쓰인 공통 기능</span></a>
      </aside>`;
    return `
      <div class="page-head keep"><div><h1>${c.id} <span class="h1-co">${esc(co.name)}</span></h1>
        <p class="sub">${c.kind === "new" ? "신규 여신 심사" : "만기연장 심사"} · ${statusBadge(c.status)} · 접수 ${c.submittedAt}${c.demoCase ? " · 상품 비교용 가상 신청" : ""}</p></div>
        <div class="head-actions"><a class="btn-ghost" href="#/company/${co.corp_code}">기업 정보</a>${c.loanId ? `<a class="btn-ghost" href="#/loan/${c.loanId}">대출 정보</a>` : ""}</div></div>
      ${stepper}
      <div class="case-layout"><div class="case-main">
      ${s1}${s2}${s3}${s4}${s5}${s6}
      <section class="card"><h2>이 건의 처리 기록</h2>${auditTable(S.audit.filter((a) => a.summary.startsWith(c.id) || (c.loanId && a.summary.startsWith(c.loanId))))}</section>
      </div>${side}</div>`;
  }

  // ------------------------------------------------------------ 여신 관리
  function pageLoans() {
    return `<h1>여신 관리</h1><p class="sub">${tag("SYN")} 실행된 대출은 가상 데이터입니다.</p>
      <section class="card"><table class="t"><tr><th>대출</th><th>기업</th><th>상품</th><th>잔액</th><th>금리</th><th>만기</th><th>연장</th></tr>
      ${S.loans.map((l) => `<tr><td><a href="#/loan/${l.id}">${l.id}</a></td><td>${esc(company(l.corp_code).name)}</td><td>${esc(l.product)}</td><td>${fmt(l.balance)}</td><td>${l.rate}%</td><td>${l.maturity}</td><td>${esc(l.renewal.status)}</td></tr>`).join("")}</table></section>`;
  }

  function pageLoan(r) {
    const l = loanById(r.id);
    if (!l) return `<p class="empty">대출을 찾을 수 없습니다.</p>`;
    const co = company(l.corp_code);
    const rc = S.cases.find((c) => c.loanId === l.id);
    const cov = C.call("checkCovenants", "만기연장 심사", co, ASOF, l.covenants);
    const evs = monitorEvents().filter((e) => e.loans.includes(l.id));
    const dleft = Math.round(C.monthsBetween(ASOF, l.maturity) * 30);
    return `
      <h1>${l.id} · ${esc(co.name)}</h1><p class="sub">${esc(l.product)} · ${tag("SYN")}</p>
      <div class="grid4">
        <div class="kpi"><div class="k">잔액</div><div class="v">${fmt(l.balance)}</div></div>
        <div class="kpi"><div class="k">금리</div><div class="v">${l.rate}%</div></div>
        <div class="kpi"><div class="k">만기</div><div class="v">${l.maturity}</div><div class="k">${dleft >= 0 ? "D-" + dleft : "만기 경과"}</div></div>
        <div class="kpi"><div class="k">만기연장</div><div class="v small">${esc(l.renewal.status)}</div></div>
      </div>
      <section class="card"><h2>만기연장</h2>
        ${rc ? `<p>연장 심사 <a href="#/case/${rc.id}">${rc.id}</a> ${statusBadge(rc.status)}</p>`
          : `<p>만기 60일 전부터 연장 심사를 시작할 수 있습니다. 신규 심사에서 쓴 재무 분석·검증·시나리오 기능을 그대로 사용합니다.</p>
             <button data-act="StartRenewalReview" data-loan="${l.id}">만기연장 심사 시작</button>`}</section>
      <div class="grid2">
        <section class="card"><h2>약정 점검 ${fnBadge("checkCovenants")}</h2><ul class="checks">${cov.map((k) => `<li>${levelBadge(k.ok === true ? "통과" : k.ok === false ? "확인 필요" : "정보")}<div><b>${esc(k.name)}</b><p>${esc(k.text)}</p></div></li>`).join("")}</ul></section>
        <section class="card"><h2>상환 이력</h2><table class="t small"><tr><th>일자</th><th>구분</th><th>금액</th><th>상태</th></tr>
          ${l.repayments.slice().reverse().map((p) => `<tr><td>${p[0]}</td><td>${p[1]}</td><td>${Math.round(p[2] / 1e4).toLocaleString("ko-KR")}만원</td><td>${p[3]}</td></tr>`).join("")}</table></section>
      </div>
      <section class="card"><h2>대출 실행 이후 공시 사건 ${fnBadge("detectMonitoringEvents")}</h2>${eventTable(evs)}</section>`;
  }

  // ------------------------------------------------------------ 사후 모니터링
  function monitorEvents() {
    const out = [];
    const byCorp = {};
    S.loans.forEach((l) => { (byCorp[l.corp_code] = byCorp[l.corp_code] || []).push(l); });
    Object.keys(byCorp).forEach((corp) => {
      const since = byCorp[corp].map((l) => l.start).sort()[0];
      C.call("detectMonitoringEvents", "사후 모니터링", company(corp), since, ASOF, byCorp[corp])
        .forEach((e) => out.push({ ...e, corp, key: `${corp}-${e.date}-${e.rcept_no || ""}-${e.title}` }));
    });
    return out;
  }

  function eventTable(evs) {
    if (!evs.length) return `<p class="empty">사건이 없습니다.</p>`;
    return `<table class="t"><tr><th>일자</th><th>중요도</th><th>분류</th><th>내용</th><th>연결 대출</th><th>처리</th></tr>
      ${evs.map((e) => { const s = S.events[e.key];
        return `<tr><td>${d8(e.date)}</td><td>${levelBadge(e.severity)}</td><td>${esc(e.category)}</td><td>${esc(e.title)} ${dartLink(e.rcept_no, "원문")}</td>
        <td>${e.loans.map((x) => `<a href="#/loan/${x}">${x}</a>`).join(", ")}</td>
        <td>${!s ? (e.severity === "참고" ? `<span class="muted">참고</span>` : `<button data-act="CreateMonitoringTask" data-key="${esc(e.key)}" data-title="${esc(e.title)}" data-loanid="${e.loans[0]}">검토 업무 생성</button>`)
          : s.status === "종결" ? `<span class="muted">종결: ${esc(s.note)}</span>`
          : `${statusBadge("진행 중")} ${s.taskId} <form class="inline" data-form="close" data-key="${esc(e.key)}" data-title="${esc(e.title)}"><input name="note" placeholder="종결 사유" required><button type="submit" class="ghost small">종결</button></form>`}</td></tr>`; }).join("")}</table>`;
  }

  function pageMonitor() {
    const evs = monitorEvents();
    return `<h1>사후 모니터링</h1>
      <p class="sub">대출 실행 기업에 새 공시가 나오거나 사채 만기가 오면 해당 대출과 연결해 보여줍니다. 중요도가 '검토' 이상이면 담당자 검토 업무를 만들 수 있습니다.</p>
      <section class="card">${eventTable(evs)}
      <p class="note">중요도는 공시 분류별 규칙입니다 (차입·사채·보증·최대주주·소송: 검토, 관리종목·거래정지: 긴급, 그 외: 참고). 공시 외의 은행 내부 정보(연체, 거래 변화)는 PoC 범위에 없습니다.</p></section>`;
  }

  // ------------------------------------------------------------ 상품별 심사 온톨로지
  const workflowSelection = { productId: "working", applicant: "proxy", companyType: "listed", amountEok: 30 };

  function pageWorkflow() {
    const ont = SEED.processOntology;
    const sel = workflowSelection;
    const ctx = { productId: sel.productId, isProxy: sel.applicant === "proxy", companyType: sel.companyType, amount: sel.amountEok * 1e8 };
    const wf = C.call("compileWorkflow", "상품별 심사 절차 미리보기", ctx, ont);
    const compare = ont.products.map((p) => ({
      p, wf: C.call("compileWorkflow", "상품별 비교", { ...ctx, productId: p.id }, ont),
    }));
    const columns = ["확인 항목", "확인 사유", "처리 방식·자료 출처", "담당"];
    return `<h1>상품별 심사 온톨로지</h1>
      <p class="sub">동일 시스템에서 상품·신청인·기업 조건에 따라 구성되는 심사 절차의 비교</p>
      <section class="card"><h2>심사 조건</h2>
        <form data-form="workflow" class="workflow-controls">
          <label>대출 상품<select name="productId">${ont.products.map((p) => `<option value="${p.id}" ${sel.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
          <label>신청인<select name="applicant"><option value="proxy" ${sel.applicant === "proxy" ? "selected" : ""}>대리 신청 (재무팀장)</option><option value="representative" ${sel.applicant === "representative" ? "selected" : ""}>대표이사 신청</option></select></label>
          <label>기업 정보<select name="companyType"><option value="listed" ${sel.companyType === "listed" ? "selected" : ""}>상장기업 (DART 공시)</option><option value="unlisted" ${sel.companyType === "unlisted" ? "selected" : ""}>비상장·공시 부족</option></select></label>
          <label>신청 금액<select name="amountEok">${[10, 30, 50].map((x) => `<option value="${x}" ${sel.amountEok === x ? "selected" : ""}>${x}억 원</option>`).join("")}</select></label>
          <button type="submit">절차 구성</button>
        </form>
        <p class="note">${tag("SYN")} 상품별 확인 기준과 현장 확인 여부는 가상은행 내규이며 실제 은행 내규나 법적 기준이 아닙니다.</p>
      </section>
      <div class="grid3 workflow-summary">
        <div class="kpi"><div class="k">필수 확인 항목</div><div class="v">${wf.checks.length}개</div></div>
        <div class="kpi"><div class="k">온라인 제출·자동 확보</div><div class="v">${wf.online.length}개</div></div>
        <div class="kpi"><div class="k">현장 확인</div><div class="v">${wf.onsite.length}개</div></div>
      </div>
      <section class="card"><div class="row-between"><h2>심사 절차: ${esc(wf.product.name)}</h2><span class="st st-sub">전결권자: ${esc(wf.approver)}</span></div>
        <p>${esc(wf.product.note)}</p>
        <div class="workflow-rules">${wf.reasons.map((x) => `<div>${esc(x)}</div>`).join("")}</div>
        <table class="t"><tr>${columns.map((x) => `<th>${x}</th>`).join("")}</tr>
          ${wf.checks.map((x) => `<tr class="${x.type === "onsite" ? "field-row" : ""}"><td><b>${esc(x.name)}</b></td><td>${esc(x.why)}</td><td>${esc(x.channel)}<div class="note">출처: ${esc(x.source)}</div></td><td>${esc(x.owner)}</td></tr>`).join("")}</table>
        ${sel.companyType === "listed" ? `<button data-act="CreateCaseFromWorkflow" data-productid="${sel.productId}" data-applicant="${sel.applicant}" data-amount="${sel.amountEok}">이 조건으로 심사 건 생성</button>
          <p class="note">다산솔루에타 공시 정보를 사용하는 가상 신청 건을 추가합니다. 기존 신청 건은 변경되지 않습니다.</p>` : `<p class="note warn-t">비상장기업은 재무 데이터가 없어 절차 구성만 시연합니다.</p>`}
      </section>
      <section class="card"><h2>상품별 비교</h2><p class="small">동일 기업·신청인 조건에서 공통 확인 항목은 유지되고 상품별 확인 항목만 추가됩니다.</p>
        <div class="grid3">${compare.map(({ p, wf: w }) => `<div class="workflow-product ${p.id === sel.productId ? "selected" : ""}"><h3>${esc(p.name)}</h3><p class="small">필수 ${w.checks.length}개 · 현장 확인 ${w.onsite.length}개</p>
          <ul class="plain small">${w.checks.map((x) => `<li>${esc(x.name)}${x.type === "onsite" ? " · 현장" : ""}</li>`).join("")}</ul></div>`).join("")}</div>
      </section>
      <p class="note">확인 항목과 상품별 규칙을 데이터로 정의하고 조건에 따라 절차를 구성하는 시연입니다. 실제 은행 시스템 연계와 법규 검증은 범위에 포함하지 않습니다.</p>`;
  }

  // ------------------------------------------------------------ 업무 기능 관리 (패키지)
  function pagePackages() {
    return `<h1>업무 기능 관리</h1>
      <p class="sub">업무는 패키지 단위로 추가합니다. 새 패키지는 이미 있는 데이터 구조·계산 기능·처리 기능을 가져다 쓰고, 부족한 것만 더합니다.</p>
      ${SEED.packages.map((p) => {
        const reused = p.requires.functions.length + p.requires.actions.length + p.requires.objects.length;
        const added = p.adds.functions.length + p.adds.actions.length + p.adds.objects.length;
        return `<section class="card"><div class="row-between"><h2>${esc(p.name)} <span class="muted">v${p.version}</span></h2><span class="st st-${p.status === "사용 중" ? "ok" : "wait"}">${esc(p.status)}</span></div>
          <div class="grid3">
            <div><h3>기존 기능 재사용 (${reused})</h3>${chipList(p.requires)}</div>
            <div><h3>새로 추가 (${added})</h3>${chipList(p.adds)}</div>
            <div><h3>은행별 설정</h3><ul class="plain small">${p.config.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          </div>
          ${reused + added ? `<p class="small">구성 요소 중 재사용 비율: <b>${Math.round((reused / (reused + added)) * 100)}%</b></p>` : ""}</section>`;
      }).join("")}`;
  }

  function chipList(g) {
    const sec = (label, arr, cls) => arr.length ? `<div class="chips"><span class="cl">${label}</span>${arr.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join("")}</div>` : "";
    return sec("데이터", g.objects, "c-obj") + sec("계산", g.functions, "c-fn") + sec("처리", g.actions, "c-act") || `<p class="muted small">없음</p>`;
  }

  // ------------------------------------------------------------ 처리 기록
  function auditTable(list) {
    if (!list.length) return `<p class="empty">기록이 없습니다.</p>`;
    return `<table class="t"><tr><th>시각</th><th>처리</th><th>처리자</th><th>내용</th></tr>
      ${list.map((a) => `<tr><td>${a.at}</td><td>${esc(a.label)}</td><td>${esc(userName(a.by))}</td><td>${esc(a.summary)}</td></tr>`).join("")}</table>`;
  }

  function pageAudit() {
    return `<h1>처리 기록</h1><p class="sub">자료 요청, 제출, 확인, 의견, 결정 등 상태를 바꾼 처리는 모두 여기에 남습니다.</p>
      <section class="card">${auditTable(S.audit)}</section>`;
  }

  // ------------------------------------------------------------ 고객 화면
  function myRequests() {
    const u = user();
    return S.cases.filter((c) => c.corp_code === u.customerOf).flatMap((c) => c.requests.map((r) => ({ c, r })));
  }

  function pagePortal() {
    const u = user();
    const co = company(u.customerOf);
    const mine = S.cases.filter((c) => c.corp_code === u.customerOf);
    const reqs = myRequests();
    const steps = ["접수", "자료 확인", "심사", "결정"];
    const stepOf = (c) => (c.decision ? 3 : c.opinions.length ? 2 : 1);
    return `<h1>${esc(co.name)} 대출 진행 현황</h1><p class="sub">${esc(u.name)}님, 은행이 요청한 자료를 여기서 제출할 수 있습니다.</p>
      ${mine.map((c) => `<section class="card"><h2>${c.kind === "new" ? "신규 대출 신청" : "만기연장"} ${c.id}</h2>
        <p>${esc(c.product)} · ${fmt(c.amount)} · ${c.years}년</p>
        <ol class="progress">${steps.map((s, i) => `<li class="${i <= stepOf(c) ? "done" : ""}">${s}</li>`).join("")}</ol>
        ${c.decision ? `<p>결과: <b>${esc(c.decision.decision)}</b></p>` : ""}</section>`).join("")}
      <section class="card"><h2>요청받은 자료</h2>
        ${reqs.length ? `<table class="t"><tr><th>자료</th><th>설명</th><th>요청일</th><th>상태</th><th>제출</th></tr>
          ${reqs.map(({ c, r }) => `<tr><td><b>${esc(r.name)}</b></td><td class="small">${esc(r.detail || "")}</td><td>${esc(r.requestedAt.slice(0, 10))}</td><td>${statusBadge(r.status)}</td>
            <td>${["요청됨", "보완 요청"].includes(r.status) ? `<form data-form="submit" data-case="${c.id}" data-req="${r.id}" class="inline"><input type="file" name="file"><button type="submit">제출</button></form>` : esc(r.file || "")}</td></tr>`).join("")}</table>
          <p class="note">PoC에서는 파일 이름만 기록하고 파일 내용은 어디에도 보내지 않습니다.</p>` : `<p class="empty">요청받은 자료가 없습니다.</p>`}</section>`;
  }

  // ------------------------------------------------------------ 이벤트
  const INIT = {};
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-tab], [data-scope], [data-disc]");
    if (!t) return;
    const r = route();
    if (t.dataset.tab) { companyTab = t.dataset.tab; render(); return; }
    if (t.dataset.scope) { fsScope = t.dataset.scope; render(); return; }
    if (t.dataset.disc) { discFilter = t.dataset.disc; render(); return; }
    const act = t.dataset.act;
    if (!act) return;
    keep();
    if (act === "RequestDocument") runAction(act, { caseId: r.id, code: t.dataset.code, name: t.dataset.name, detail: t.dataset.detail, reason: t.dataset.reason });
    else if (act === "ReviewDocument") runAction(act, { caseId: r.id, reqId: t.dataset.req, result: t.dataset.result });
    else if (act === "ReviewUploadedDocument") runAction(act, { caseId: r.id, code: t.dataset.code });
    else if (act === "StartRenewalReview") runAction(act, { loanId: t.dataset.loan });
    else if (act === "CreateMonitoringTask") runAction(act, { key: t.dataset.key, title: t.dataset.title, loanId: t.dataset.loanid });
    else if (act === "CreateCaseFromWorkflow") {
      const before = S.cases.length;
      const ok = runAction(act, { productId: t.dataset.productid, isProxy: t.dataset.applicant === "proxy", companyType: workflowSelection.companyType, amountEok: Number(t.dataset.amount) });
      if (ok && S.cases.length > before) location.hash = "#/case/" + S.cases[S.cases.length - 1].id;
    }
  });

  function keep() { window.__keepScroll = window.scrollY; }

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (!f.dataset.form) return;
    e.preventDefault();
    const r = route();
    const fd = new FormData(f);
    keep();
    if (f.dataset.form === "workflow") {
      workflowSelection.productId = String(fd.get("productId") || "working");
      workflowSelection.applicant = String(fd.get("applicant") || "proxy");
      workflowSelection.companyType = String(fd.get("companyType") || "listed");
      workflowSelection.amountEok = Number(fd.get("amountEok") || 30);
      window.__keepScroll = 0; render(); toast("심사 절차를 다시 구성했습니다");
    } else if (f.dataset.form === "onsite") {
      runAction("RecordSiteInspection", { caseId: r.id, code: f.dataset.code, note: String(fd.get("note") || "") });
    } else if (f.dataset.form === "scenario") {
      const n = (k) => parseFloat(fd.get(k));
      const sp0 = scenarioParams(caseById(f.dataset.case));
      S.scenario[f.dataset.case] = {
        amount: n("amount") * 1e8, rate: n("rate"), years: sp0.years, method: sp0.method, basis: sp0.basis,
        existingRate: n("existingRate"), refinanceRatio: n("refinanceRatio"), salesShock: n("salesShock"), marginShock: n("marginShock"), rateShock: n("rateShock"),
      };
      save(); render(); toast("다시 계산했습니다");
    } else if (f.dataset.form === "evi") {
      const ev = S.evi[f.dataset.kind];
      ev.lgd = parseFloat(fd.get("lgd")) / 100;
      ev.rejectGoodRate = parseFloat(fd.get("rejectGoodRate")) / 100;
      ev.actions.forEach((a, i) => {
        a.sens = Math.min(1, Math.max(0, parseFloat(fd.get("sens" + i))));
        a.spec = Math.min(1, Math.max(0, parseFloat(fd.get("spec" + i))));
        a.cost = parseFloat(fd.get("cost" + i)) * 1e4;
      });
      save(); render(); toast("다시 계산했습니다");
    } else if (f.dataset.form === "opinion") {
      runAction("RecordOpinion", { caseId: r.id, text: fd.get("text"), recommendation: fd.get("recommendation") });
    } else if (f.dataset.form === "decision") {
      runAction("RecordDecision", { caseId: r.id, decision: e.submitter ? e.submitter.value : "승인", comment: fd.get("comment") });
    } else if (f.dataset.form === "assign") {
      runAction("AssignReviewer", { caseId: r.id, userId: fd.get("userId") });
    } else if (f.dataset.form === "close") {
      runAction("CloseEvent", { key: f.dataset.key, title: f.dataset.title, note: String(fd.get("note") || "").trim() });
    } else if (f.dataset.form === "submit") {
      const file = fd.get("file");
      runAction("SubmitDocument", { caseId: f.dataset.case, reqId: f.dataset.req, file: file && file.name ? file.name : "" });
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "role") { S.role = e.target.value; save(); location.hash = user().customerOf ? "#/portal" : "#/home"; render(); }
    if (e.target.id === "coSel") { location.hash = "#/company/" + e.target.value; }
  });

  let resetArmed = 0;
  document.getElementById("reset").addEventListener("click", (e) => {
    if (!resetArmed) { resetArmed = setTimeout(() => { resetArmed = 0; e.target.textContent = "초기화"; }, 4000); e.target.textContent = "한 번 더 누르면 초기화"; return; }
    clearTimeout(resetArmed); resetArmed = 0; e.target.textContent = "초기화";
    S = initialState(); save(); location.hash = "#/home"; render(); toast("처음 상태로 되돌렸습니다");
  });

  window.addEventListener("hashchange", render);
  document.getElementById("asof").textContent = ASOF;
  render();

})();
