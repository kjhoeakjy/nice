// 화면. 상태 변경은 모두 runAction() 을 거쳐 처리 기록에 남는다.
(function () {
  "use strict";
  const DATA = window.CREDITOS_DATA;
  const SEED = window.CREDITOS_SEED;
  const C = window.CreditOS;
  const fmt = C.fmtEok;
  const ASOF = SEED.asOf;
  const STORE_KEY = "creditos-demo-v2";

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
    ["@", "심사 업무"], ["home", "업무 현황"], ["workflow", "심사 온톨로지"], ["company", "기업 정보"],
    ["@", "여신 관리"], ["loans", "실행 여신"], ["monitor", "사후 모니터링"],
    ["@", "안내"], ["guide", "사용 방법"], ["model", "모델 설명"],
  ];
  const NAV_CUSTOMER = [["@", "고객 서비스"], ["portal", "요청 자료 제출"]];
  const PAGE_LABEL = { home: "업무 현황", cases: "업무 현황", case: "업무 현황", company: "기업 정보", loans: "실행 여신", loan: "실행 여신",
    monitor: "사후 모니터링", workflow: "심사 온톨로지", guide: "사용 방법", model: "모델 설명", basis: "모델 설명", packages: "업무 기능 관리", audit: "처리 기록", portal: "요청 자료 제출" };
  const ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    company: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/><path d="M10 21v-3h4v3"/>',
    cases: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M8.5 12l2 2 4-4"/><path d="M9 17h6"/>',
    loans: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    monitor: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    workflow: '<circle cx="4" cy="12" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="20" cy="19" r="2"/><path d="M6 12h6l6-7M12 12l6 7"/>',
    guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17v.01"/>',
    model: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6M9 18h4"/>',
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
      monitor: pageMonitor, workflow: pageWorkflow, guide: pageGuide, model: pageModel, basis: pageModel, packages: pagePackages, audit: pageAudit, portal: pagePortal };
    const crumb = r.page === "case" || r.page === "loan" || (r.page === "company" && r.id)
      ? `<a href="#/${r.page === "case" ? "home" : r.page === "loan" ? "loans" : "company"}">${PAGE_LABEL[r.page]}</a><span>›</span><b>${esc(r.id || "")}</b>`
      : "";
    main.innerHTML = (crumb ? `<div class="crumb keep">${crumb}</div>` : "") + (pages[r.page] || pageHome)(r);
    main.querySelectorAll("table.t:not(.num), table.t.mstack").forEach((tb) => {
      const hr = tb.querySelector("tr"); if (!hr) return;
      const ths = Array.from(hr.children).map((h) => h.textContent.trim());
      if (ths.length < 4) return;
      tb.classList.add("stack");
      tb.querySelectorAll("tr").forEach((tr, i) => { if (i === 0) return; Array.from(tr.children).forEach((td, j) => { if (ths[j]) td.setAttribute("data-th", ths[j]); }); });
    });
    main.querySelectorAll("[data-init]").forEach((el) => INIT[el.dataset.init] && INIT[el.dataset.init](el));
    const anchor = r.page === "case" && { evi: "step-5" }[r.sub];
    if (anchor && !window.__keepScroll && document.getElementById(anchor)) document.getElementById(anchor).scrollIntoView();
    else window.scrollTo(0, window.__keepScroll || 0);
    window.__keepScroll = 0;
  }

  // ------------------------------------------------------------ 업무 현황
  function pageHome() {
    const waiting = S.cases.flatMap((c) => c.requests.filter((r) => r.status === "제출됨").map((r) => ({ c, r })));
    const dueLoans = S.loans.filter((l) => C.monthsBetween(ASOF, l.maturity) <= 2 && !S.cases.some((c) => c.loanId === l.id));
    const open = S.tasks.filter((t) => t.status !== "완료");
    return `
      <h1>업무 현황</h1>
      <div class="guide">
        <a href="#/workflow"><b>심사 온톨로지</b><span>심사 업무별 자료·담당·판단 기준·승인의 연결</span></a>
        <a href="#/case/APP-2026-0412"><b>온톨로지 기반 심사</b><span>신청부터 승인까지</span></a>
        <a href="#/case/APP-2026-0412/evi"><b>정보가치 기반 추가 확인</b><span>기대손실 감소와 확인 비용의 비교</span></a>
      </div>
      <section class="card"><h2>심사 건</h2>${caseTable(S.cases)}</section>
      ${waiting.length ? `<section class="card"><h2>고객 제출 자료</h2><table class="t"><tr><th>신청 건</th><th>자료</th><th>제출</th></tr>
        ${waiting.map(({ c, r }) => `<tr><td><a href="#/case/${c.id}">${c.id}</a></td><td>${esc(r.name)}</td><td>${esc(r.submittedAt)}</td></tr>`).join("")}</table></section>` : ""}
      ${dueLoans.length ? `<section class="card"><h2>만기 도래 여신</h2><table class="t"><tr><th>대출</th><th>기업</th><th>잔액</th><th>만기</th><th></th></tr>
        ${dueLoans.map((l) => `<tr><td><a href="#/loan/${l.id}">${l.id}</a></td><td>${esc(company(l.corp_code).name)}</td><td>${fmt(l.balance)}</td><td>${l.maturity}</td>
          <td><button data-act="StartRenewalReview" data-loan="${l.id}">만기연장 심사 시작</button></td></tr>`).join("")}</table></section>` : ""}
      ${open.length ? `<section class="card"><h2>검토 업무</h2><table class="t"><tr><th>업무</th><th>내용</th><th>대출</th></tr>
        ${open.map((t) => `<tr><td>${t.id}</td><td>${esc(t.title)}</td><td><a href="#/loan/${t.loanId}">${t.loanId}</a></td></tr>`).join("")}</table></section>` : ""}`;
  }

  function caseTable(list) {
    if (!list.length) return `<p class="empty">진행 중인 건이 없습니다.</p>`;
    return `<table class="t"><tr><th>번호</th><th>구분</th><th>기업</th><th>상품</th><th>금액</th><th>상태</th></tr>
      ${list.map((c) => `<tr><td><a href="#/case/${c.id}">${c.id}</a></td><td>${c.kind === "new" ? "신규" : "만기연장"}</td><td>${esc(company(c.corp_code).name)}</td>
        <td>${esc(c.product)}</td><td>${fmt(c.amount)}</td><td>${statusBadge(c.status)}</td></tr>`).join("")}</table>`;
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
      <p class="sub">${esc(c.market)} ${esc(c.stock_code)} · ${tag("PUBLIC")} 기준일 이전 공시</p>
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
          <dt>주소</dt><dd>${esc(c.address)}</dd>
          <dt>결산월</dt><dd>${esc(c.acc_mt)}월</dd></dl>
          </section>
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
      <section class="card scroll"><table class="t num fin5"><tr><th>항목</th>${ys.slice(-5).map((y) => `<th>${y}</th>`).join("")}</tr>
        ${keys.map((k) => `<tr><td>${C.LABELS[k]}</td>${ys.slice(-5).map((y) => { const it = C.item(c, fsScope, y, k);
          return `<td title="${it ? esc(it.src.account_nm + " · 접수번호 " + it.src.rcept_no) : "자료 없음"}">${it ? fmt(it.v) : "-"}</td>`; }).join("")}</tr>`).join("")}
        <tr class="srcrow"><td>원문</td>${ys.slice(-5).map((y) => `<td>${dartLink(c.financials[fsScope][y].rcept_no, "보기")}</td>`).join("")}</tr></table></section>`}`;
  }

  function coDebt(c) {
    const y = C.latestYear(c, "OFS", ASOF);
    const d = C.call("summarizeDebt", "기업 정보", c, "OFS", y);
    return `
      <section class="card"><h2>${y}년 말 차입금 구성 (별도)</h2>
        <table class="t num"><tr><th>계정</th><th>금액</th><th>1년 내 만기</th></tr>
        ${d.parts.map((p) => `<tr><td>${p.label}</td><td>${p.found ? fmt(p.value) : "-"}</td><td>${["st_borrowings", "cur_lt_borrowings", "cur_cb", "cur_lease"].includes(p.key) ? "예" : ""}</td></tr>`).join("")}
        <tr class="sum"><td>합계</td><td>${fmt(d.total)}</td><td>${fmt(d.dueWithinYear)}</td></tr></table></section>
      <section class="card"><h2>전환사채 발행 조건 ${tag("PUBLIC")}</h2>
        ${c.bonds.length ? `<table class="t"><tr><th>회차</th><th>발행금액</th><th>표면이자율</th><th>만기보장수익률</th><th>만기일</th><th>원문</th></tr>
        ${c.bonds.slice().sort((a, b) => +a.seq - +b.seq).map((b) => `<tr><td>${esc(b.seq)}</td><td>${fmt(b.amount)}</td><td>${esc(b.coupon)}%</td><td>${esc(b.ytm)}%</td><td>${esc(b.maturity)}</td><td>${dartLink(b.rcept_no, "보기")}</td></tr>`).join("")}</table>` : `<p class="empty">전환사채 발행 공시가 없습니다.</p>`}</section>`;
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
    const sim = C.call("simulateRepayment", uc, co, ASOF, scenarioParams(c));
    const ev = eviContext(c, pc.workflow);
    const nba = C.call("nextBestAction", uc, risk.prior, ev.actions, ev.loss);
    const loan = c.loanId ? loanById(c.loanId) : null;
    const cov = loan ? C.call("checkCovenants", uc, co, ASOF, loan.covenants) : null;

    const step = (n, title, inner) => `<section id="step-${n}" class="card step"><h2><span class="n">${n}</span>${title}</h2>${inner}</section>`;
    const findings = (list) => `<ul class="checks">${list.map((f) => `<li>${levelBadge(f.level)}<div><b>${esc(f.title)}</b>${f.level === "확인 필요" && f.detail ? `<p>${esc(f.detail)}</p>` : ""}</div></li>`).join("")}</ul>`;
    const docState = (st) => (["충족", "자동 확보"].includes(st) ? `<span class="st st-ok">${esc(st)}</span>` : st === "해당 없음" ? `<span class="muted">해당 없음</span>` : statusBadge(st));

    // 1. 신청 정보
    const s1 = c.kind === "new" ? step(1, "신청 정보 확인", `
        <dl class="dl cols">
          <dt>상품</dt><dd>${esc(c.product)}</dd><dt>신청 금액</dt><dd>${fmt(c.amount)}</dd>
          <dt>기간·상환</dt><dd>${c.years}년 · ${c.method === "bullet" ? "만기일시상환" : "원금균등분할"}</dd><dt>금리</dt><dd>연 ${c.rate}%</dd>
          <dt>자금 용도</dt><dd>${esc(c.purpose)}</dd><dt>신청인</dt><dd>${esc(c.submitter.name)} (${esc(c.submitter.role)})</dd></dl>`)
      : step(1, "대출 현황", `
        <dl class="dl cols">
          <dt>대출</dt><dd><a href="#/loan/${loan.id}">${loan.id}</a></dd><dt>잔액</dt><dd>${fmt(loan.balance)}</dd>
          <dt>현재 만기</dt><dd>${loan.maturity}</dd><dt>연장 요청</dt><dd>${c.years}년 · 연 ${c.rate}%</dd>
          <dt>이자 납입</dt><dd>${loan.repayments.length}회 · 연체 ${loan.repayments.filter((p) => p[3] !== "정상").length}회</dd></dl>
        ${findings(cov.map((k) => ({ level: k.ok === true ? "통과" : k.ok === false ? "확인 필요" : "정보", title: k.ok === null ? k.name : k.text })))}`);

    // 2. 심사 절차·필요 자료
    const s2 = step(2, c.kind === "new" ? "심사 절차·필요 자료 확인" : "필요 자료 확인", `
      ${pc.workflow ? `<table class="t"><tr><th>심사 업무</th><th>담당</th><th>상태</th></tr>
        ${pc.workflow.tasks.map((t) => {
          const ok = t.docs.filter((d) => ["충족", "자동 확보", "해당 없음"].includes((pc.items.find((i) => i.code === d.code) || {}).status)).length;
          return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.owner)}</td>
            <td>${!t.docs.length ? `<span class="muted">시스템 산출</span>` : ok === t.docs.length ? `<span class="st st-ok">충족</span>` : `<span class="st st-wait">자료 ${ok}/${t.docs.length}</span>`}</td></tr>`;
        }).join("")}</table>` : ""}
      <h3>필요 자료</h3>
      <table class="t"><tr><th>자료</th><th>상태</th><th></th></tr>
        ${pc.items.map((i) => {
          const site = pc.workflow && pc.workflow.onsite.some((x) => x.code === i.code);
          const act = site && i.status !== "충족" ? `<form data-form="onsite" data-code="${i.code}" class="inline"><input name="note" required placeholder="현장 확인 결과"><button type="submit">기록</button></form>`
            : i.status === "제출됨" ? `<button data-act="ReviewUploadedDocument" data-code="${i.code}">확인 완료</button>`
            : i.status === "미제출" ? `<button data-act="RequestDocument" data-code="${i.code}" data-name="${esc(i.name)}" data-reason="필수 자료">요청</button>` : "";
          return `<tr><td>${esc(i.name)}${site ? ` <span class="muted small">현장 확인</span>` : ""}</td><td>${docState(i.status)}</td><td>${act}</td></tr>`;
        }).join("")}</table>
      <h3>검증 결과</h3>${findings((auth ? auth.findings.filter((f) => f.level !== "정보") : []).concat(checks))}`);

    // 3. 재무지표
    const row = (label, a, b, f) => `<tr><td>${label}</td><td>${f(b)}</td><td>${f(a)}</td></tr>`;
    const s3 = step(3, c.kind === "new" ? "재무지표 산출" : "재무 변화", `
      <div class="grid2"><div>
        <table class="t num"><tr><th>별도 기준</th><th>${+y - 1}</th><th>${y}</th></tr>
          ${row("매출액", C.val(co, "OFS", y, "revenue"), C.val(co, "OFS", String(+y - 1), "revenue"), fmt)}
          ${row("영업이익률", rt.opMargin.value, rtPrev.opMargin.value, (v) => pct(v))}
          ${row("부채비율", rt.debtToEquity.value, rtPrev.debtToEquity.value, (v) => pct(v, 0))}
          ${row("유동비율", rt.currentRatio.value, rtPrev.currentRatio.value, (v) => pct(v, 0))}
          ${row("차입금의존도", rt.debtDependence.value, rtPrev.debtDependence.value, (v) => pct(v))}
          ${row("이자보상배율", rt.coverage.value, rtPrev.coverage.value, times)}
          ${row("순차입금", rt.netDebt.value, rtPrev.netDebt.value, fmt)}
        </table></div>
        <div><h3>위험 신호 ${risk.score}점 · ${risk.band} 구간 · 부도확률 ${pct(risk.prior, 0)}</h3>
          <ul class="plain">${risk.all.filter((h) => h.hit).map((h) => `<li class="hit">${esc(h.text)} (${h.pts}점)</li>`).join("")}</ul></div></div>`);

    // 4. 상환능력
    const s4 = step(4, "상환능력 분석", `
      ${barChart(sim.results.map((s) => ({ label: s.name, value: isFinite(s.minDscr) ? s.minDscr : 0 })), { fmt: (v) => v.toFixed(2), line: 1, lineLabel: "1.0", width: 520, title: "시나리오별 최소 DSCR (기존 차입금 포함)", values: true })}`);

    // 5. 추가 확인 항목 선택
    const requested = (name) => c.requests.some((x) => x.name === name);
    const s5 = step(5, "추가 확인 항목 선택", `
      <table class="t num mstack"><tr><th class="l">확인 항목</th><th>정보가치</th><th>확인 비용</th><th>순정보가치</th><th></th></tr>
        ${nba.ranked.map((a) => `<tr><td class="l">${esc(a.name)}</td><td>${fmt(a.evi, 2)}</td><td>${fmt(a.cost, 2)}</td>
          <td class="${a.net > 0 ? "ok-t" : "muted"}">${fmt(a.net, 2)}</td>
          <td>${requested(a.name) ? '<span class="muted">요청함</span>' : a.recommend ? `<button data-act="RequestDocument" data-name="${esc(a.name)}" data-detail="${esc(a.detail)}" data-reason="순정보가치 양수">요청</button>` : '<span class="muted">보류</span>'}</td></tr>`).join("")}</table>
      <h3>요청 방식 비교</h3>
      <table class="t num mstack"><tr><th class="l">방식</th><th>평균 요청 건수</th><th>확인 비용</th><th>기대손실</th><th>합계</th></tr>
        ${nba.compare.map((x, i) => `<tr class="${i === 2 ? "hlrow" : ""}"><td class="l">${esc(x.name)}</td><td>${x.count.toFixed(2)}</td><td>${fmt(x.cost, 2)}</td><td>${fmt(x.loss, 2)}</td><td><b>${fmt(x.cost + x.loss, 2)}</b></td></tr>`).join("")}</table>
      <p class="note"><a href="#/model">모델 설명</a></p>`);

    // 6. 추가 자료 요청·승인
    const canDecide = u.canApprove > 0;
    const s6 = step(6, "추가 자료 요청·승인", `
      ${c.requests.length ? `<table class="t"><tr><th>자료</th><th>상태</th><th></th></tr>
        ${c.requests.map((q) => `<tr><td>${esc(q.name)}</td><td>${statusBadge(q.status)}</td>
          <td>${q.status === "제출됨" ? `<button data-act="ReviewDocument" data-req="${q.id}" data-result="확인 완료">확인 완료</button> <button class="ghost" data-act="ReviewDocument" data-req="${q.id}" data-result="보완 요청">보완 요청</button>` : ""}</td></tr>`).join("")}</table>` : ""}
      <div class="grid2">
        <div><h3>심사 의견</h3>
          ${c.opinions.map((o) => `<div class="op"><b>${esc(userName(o.by))}</b> · ${esc(o.recommendation)}<p>${esc(o.text)}</p></div>`).join("")}
          ${!c.decision ? `<form data-form="opinion"><textarea name="text" rows="3" placeholder="판단 근거"></textarea>
            <select name="recommendation"><option>승인 의견</option><option>조건부 승인 의견</option><option>거절 의견</option></select>
            <button type="submit">의견 기록</button></form>` : ""}</div>
        <div><h3>결정 · ${esc(pc.approver)}</h3>
          ${c.decision ? `<p>${statusBadge(c.decision.decision)} ${esc(userName(c.decision.by))}</p>`
            : `${!pc.complete ? `<p class="warn-t">미충족: ${pc.missing.map((m) => esc(m.name)).join(", ")}</p>` : ""}
               ${canDecide ? `<form data-form="decision"><input name="comment" placeholder="결정 사유">
                 <div class="btns"><button type="submit" name="decision" value="승인">승인</button><button type="submit" name="decision" value="조건부 승인">조건부 승인</button><button type="submit" class="danger" name="decision" value="거절">거절</button></div></form>`
               : `<p class="muted">전결권자 계정(이준호)에서 결정</p>`}`}
        </div></div>`);

    // 진행 단계
    const pending = c.requests.filter((q) => q.status === "요청됨" || q.status === "제출됨" || q.status === "보완 요청").length;
    const stages = [
      ["접수", true, c.submittedAt],
      ["자료 확인", pc.complete && !pending, pc.complete && !pending ? "완료" : `${pc.items.filter((i) => ["충족", "자동 확보", "해당 없음"].includes(i.status)).length}/${pc.items.length}`],
      ["분석", true, `확인 필요 ${checks.filter((f) => f.level === "확인 필요").length}건`],
      ["심사 의견", c.opinions.length > 0, c.opinions.length ? c.opinions[c.opinions.length - 1].recommendation : "작성 전"],
      ["결정", !!c.decision, c.decision ? c.decision.decision : pc.approver],
    ];
    const curIdx = stages.findIndex((x) => !x[1]);
    const stepper = `<ol class="stepper keep">${stages.map((x, i) => `<li class="${x[1] ? "done" : i === curIdx ? "cur" : ""}"><span class="dot">${x[1] ? "✓" : i + 1}</span><div><b>${x[0]}</b><small>${esc(x[2])}</small></div></li>`).join("")}</ol>`;
    const base = sim.results[0];
    const top = nba.ranked.find((a) => a.recommend);
    const side = `<aside class="case-side">
        <div class="card side-card">
          <div class="side-metrics">
            <div><small>위험 신호</small><b class="band band-${risk.band}">${risk.band}</b><span>${risk.score}점</span></div>
            <div><small>최소 DSCR</small><b class="${base.minDscr < 1 ? "warn-t" : ""}">${isFinite(base.minDscr) ? base.minDscr.toFixed(2) : "-"}</b><span>기본</span></div>
            <div><small>확인 필요</small><b>${checks.filter((f) => f.level === "확인 필요").length}</b><span>검증</span></div>
          </div>
          ${top ? `<div class="side-reco"><small>요청 권고</small><b>${esc(top.name)}</b></div>` : ""}
        </div>
      </aside>`;
    return `
      <div class="page-head keep"><div><h1>${c.id} <span class="h1-co"><a href="#/company/${co.corp_code}">${esc(co.name)}</a></span></h1>
        <p class="sub">${c.kind === "new" ? "신규 심사" : "만기연장 심사"} · ${statusBadge(c.status)} · 비대면 접수 ${c.submittedAt}</p></div></div>
      ${stepper}
      <div class="case-layout"><div class="case-main">
        ${s1}${s2}${s3}${s4}${s5}${s6}
      </div>${side}</div>`;
  }

  // ------------------------------------------------------------ 여신 관리
  function pageLoans() {
    return `<h1>실행 여신</h1>
      <section class="card"><table class="t"><tr><th>대출</th><th>기업</th><th>상품</th><th>잔액</th><th>금리</th><th>만기</th><th>만기연장</th></tr>
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
    const late = l.repayments.filter((p) => p[3] !== "정상").length;
    return `
      <h1>${l.id} <span class="h1-co">${esc(co.name)}</span></h1><p class="sub">${esc(l.product)}</p>
      <div class="grid4">
        <div class="kpi"><div class="k">잔액</div><div class="v">${fmt(l.balance)}</div></div>
        <div class="kpi"><div class="k">금리</div><div class="v">${l.rate}%</div></div>
        <div class="kpi"><div class="k">만기</div><div class="v small">${l.maturity} (${dleft >= 0 ? "D-" + dleft : "경과"})</div></div>
        <div class="kpi"><div class="k">이자 납입</div><div class="v small">${l.repayments.length}회 · 연체 ${late}회</div></div>
      </div>
      <div class="grid2">
        <section class="card"><h2>만기연장</h2>
          ${rc ? `<p><a href="#/case/${rc.id}">${rc.id}</a> ${statusBadge(rc.status)}</p>` : `<button data-act="StartRenewalReview" data-loan="${l.id}">만기연장 심사 시작</button>`}</section>
        <section class="card"><h2>약정 점검</h2><ul class="checks">${cov.map((k) => `<li>${levelBadge(k.ok === true ? "통과" : k.ok === false ? "확인 필요" : "정보")}<div><b>${esc(k.ok === null ? k.name : k.text)}</b></div></li>`).join("")}</ul></section>
      </div>
      <section class="card"><h2>대출 실행 이후 공시 사건</h2>${eventTable(evs)}</section>`;
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

  // 중요도 '검토' 이상만 표시
  function eventTable(evs) {
    evs = evs.filter((e) => e.severity !== "참고");
    if (!evs.length) return `<p class="empty">검토 대상 사건이 없습니다.</p>`;
    return `<table class="t"><tr><th>일자</th><th>중요도</th><th>내용</th><th>대출</th><th>처리</th></tr>
      ${evs.map((e) => { const s = S.events[e.key];
        return `<tr><td>${d8(e.date)}</td><td>${levelBadge(e.severity)}</td><td>${esc(e.title)} ${dartLink(e.rcept_no, "원문")}</td>
        <td>${e.loans.map((x) => `<a href="#/loan/${x}">${x}</a>`).join(", ")}</td>
        <td>${!s ? `<button data-act="CreateMonitoringTask" data-key="${esc(e.key)}" data-title="${esc(e.title)}" data-loanid="${e.loans[0]}">검토 업무 생성</button>`
          : s.status === "종결" ? `<span class="muted">종결</span>`
          : `<form class="inline" data-form="close" data-key="${esc(e.key)}" data-title="${esc(e.title)}"><input name="note" placeholder="종결 사유" required><button type="submit" class="ghost small">종결</button></form>`}</td></tr>`; }).join("")}</table>`;
  }

  function pageMonitor() {
    return `<h1>사후 모니터링</h1>
      <p class="sub">대출 실행 이후 공시·사채 만기 중 검토 대상</p>
      <section class="card">${eventTable(monitorEvents())}</section>`;
  }

  // ------------------------------------------------------------ 심사 온톨로지
  const workflowSelection = { productId: "working", applicant: "proxy", companyType: "listed", amountEok: 30, taskId: "AUTH" };
  const FN_LABEL = {
    checkAuthority: "대표권 확인", validateFacts: "공시 자료 검증", calcRatios: "재무비율 산출", summarizeDebt: "차입금 집계",
    simulateRepayment: "상환능력 시나리오", riskSignals: "위험 신호", nextBestAction: "정보가치 계산",
  };

  function ontologyHub(task, wf) {
    const list = (arr) => arr.length ? `<ul>${arr.join("")}</ul>` : `<p class="muted">없음</p>`;
    const node = (pos, label, body) => `<div class="onto-node ${pos}"><small>${label}</small>${body}</div>`;
    const docs = list(task.docs.filter((d) => !task.extra.some((x) => x.doc.code === d.code))
      .map((d) => `<li><b>${esc(d.name)}</b><span>${esc(d.channel)}</span></li>`)
      .concat(task.refs.map((x) => `<li><b>${esc(x.replace(/\s*\(.*\)$/, ""))}</b><span>자동 조회</span></li>`)));
    const extra = list(task.extra.map((x) => `<li><b>${esc(x.doc.name)}</b><span>대리 신청 시${x.applied ? " · 적용" : ""}</span></li>`));
    const fns = list(task.fns.map((f) => `<li><b>${esc(FN_LABEL[f] || f)}</b></li>`));
    return `<div class="onto-hub">
      ${node("l1", "필요 자료·제출 방식", docs)}
      ${node("l2", "추가 요청 자료", extra)}
      ${node("l3", "담당", `<p><b>${esc(task.owner)}</b></p>`)}
      <div class="onto-center"><small>심사 업무</small><b>${esc(task.name)}</b><span>${esc(wf.product.name)}</span></div>
      ${node("r1", "판단 기준", `<p>${esc(task.criteria)}</p>`)}
      ${node("r2", "시스템 지원", fns)}
      ${node("r3", "최종 승인", `<p><b>${esc(task.approver)}</b></p><span class="muted small">신청 금액 기준</span>`)}
    </div>`;
  }

  function pageWorkflow() {
    const ont = SEED.processOntology;
    const sel = workflowSelection;
    const ctx = { productId: sel.productId, isProxy: sel.applicant === "proxy", companyType: sel.companyType, amount: sel.amountEok * 1e8 };
    const wf = C.call("compileWorkflow", "심사 온톨로지", ctx, ont);
    const task = wf.tasks.find((t) => t.id === sel.taskId) || wf.tasks[0];
    const compare = ont.products.map((p) => ({ p, wf: C.call("compileWorkflow", "심사 온톨로지", { ...ctx, productId: p.id }, ont) }));
    const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${label}</option>`;
    return `<h1>심사 온톨로지</h1>
      <section class="card">
        <form data-form="workflow" class="workflow-controls">
          <label>대출 상품<select name="productId">${ont.products.map((p) => opt(p.id, sel.productId, esc(p.name))).join("")}</select></label>
          <label>신청인<select name="applicant">${opt("proxy", sel.applicant, "대리 신청")}${opt("representative", sel.applicant, "대표이사 신청")}</select></label>
          <label>기업 정보<select name="companyType">${opt("listed", sel.companyType, "상장 (DART 공시)")}${opt("unlisted", sel.companyType, "비상장·공시 부족")}</select></label>
          <label>신청 금액<select name="amountEok">${[10, 30, 50].map((x) => opt(x, sel.amountEok, x + "억 원")).join("")}</select></label>
          <button type="submit">절차 구성</button>
        </form>
      </section>
      <section class="card"><h2>심사 업무 구성</h2>
        <div class="seg wrap">${wf.tasks.map((t) => `<button type="button" data-otask="${t.id}" class="${t.id === task.id ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>
        ${ontologyHub(task, wf)}
      </section>
      <div class="grid4">
        <div class="kpi"><div class="k">심사 업무</div><div class="v">${wf.tasks.length}개</div></div>
        <div class="kpi"><div class="k">필요 자료</div><div class="v">${wf.checks.length}개</div></div>
        <div class="kpi"><div class="k">현장 확인</div><div class="v">${wf.onsite.length}개</div></div>
        <div class="kpi"><div class="k">전결권자</div><div class="v small">${esc(wf.approver)}</div></div>
      </div>
      <section class="card"><h2>상품별 심사 절차</h2>
        <div class="grid3">${compare.map(({ p, wf: w }) => `<div class="workflow-product ${p.id === sel.productId ? "selected" : ""}"><h3>${esc(p.name)}</h3>
          <ul class="plain small">${w.tasks.map((t) => `<li><b>${esc(t.name)}</b>${t.docs.length ? `<div class="muted">${t.docs.map((d) => esc(d.name)).join(", ")}</div>` : ""}</li>`).join("")}</ul></div>`).join("")}</div>
        ${sel.companyType === "listed" ? `<div class="btns"><button data-act="CreateCaseFromWorkflow" data-productid="${sel.productId}" data-applicant="${sel.applicant}" data-amount="${sel.amountEok}">이 조건으로 심사 건 생성</button></div>`
          : `<p class="note">비상장기업은 재무 데이터가 없어 절차 구성만 시연</p>`}
      </section>
      <p class="note">${tag("SYN")} 상품별 심사 업무와 전결 한도는 가상은행 내규</p>`;
  }

  // ------------------------------------------------------------ 모델 설명
  // 정보가치 계산의 손실·비용. 부도 시 손실 = 대출금 × LGD(상품별), 기회손실 = 기대 이자이익,
  // 확인 비용 = 고객 이탈률 × 기대 이자이익 + 처리비용.
  function eviContext(c, wf) {
    const ea = SEED.eviAssumptions;
    const pol = c.kind === "renewal" ? SEED.renewalPolicy : (wf ? wf.product : SEED.processOntology.products[0]);
    const margin = c.amount * Math.max(0, c.rate - ea.fundingRate) / 100 * c.years;
    const actions = pol.optional.map((id) => {
      const a = ea.actions[id];
      return { id, ...a, cost: a.dropout * margin + a.handling };
    });
    return { lgd: pol.lgd, margin, actions, loss: { approveBad: c.amount * pol.lgd, rejectGood: margin } };
  }

  function pageModel() {
    const ont = SEED.processOntology;
    const ea = SEED.eviAssumptions;
    const sd = SEED.scenarioDefaults;
    const A = tag("ASSUME");
    const tbl = (head, rows) => `<table class="t"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((x, i) => `<td${i ? "" : ' class="nw"'}>${x}</td>`).join("")}</tr>`).join("")}</table>`;
    const flow = (items) => `<ol class="flow">${items.map(([t, d]) => `<li><b>${t}</b>${d ? `<span>${d}</span>` : ""}</li>`).join("")}</ol>`;
    const bands = C.meta.BANDS.map((b) => `${b.band} ${pct(b.p, 0)}`).join(" · ");

    // 예시: 기존 신청 건의 실제 계산 결과
    const app = caseById("APP-2026-0412") || { ...SEED.applications[0], kind: "new" };
    const co = company(app.corp_code);
    const risk = C.call("riskSignals", "모델 설명", co, ASOF);
    const ev = eviContext({ ...app, kind: "new" }, null);
    const nba = C.call("nextBestAction", "모델 설명", risk.prior, ev.actions, ev.loss);
    const best = nba.compare.reduce((a, b) => (a.cost + a.loss <= b.cost + b.loss ? a : b));

    return `<h1>모델 설명</h1>
      <p class="sub">기업 여신 비대면 심사 모델의 구조와 작동 방식</p>

      <section class="card"><h2>모델 구조</h2>
        <p>기업과 상품마다 다른 심사 절차를 하나의 구조로 구성하고, 절차 안의 판단을 데이터로 지원하는 모델입니다.</p>
        ${flow([
          ["대출 신청", "상품·신청인·금액"],
          ["심사 온톨로지", "심사 절차 구성"],
          ["자료 확보·검증", "DART 수집·고객 제출"],
          ["재무·상환능력 분석", "재무지표·DSCR"],
          ["추가 확인 선택", "정보가치 계산"],
          ["승인", "전결권자"],
        ])}
        <p class="note">${tag("PUBLIC")} 기업 정보는 DART 공시(코스닥 2개사) · ${tag("SYN")} 은행 내부 정보는 가상 데이터</p>
      </section>

      <section class="card"><h2>심사 온톨로지</h2>
        <p>심사 업무를 기본 단위로 필요 자료·제출 방식·담당·판단 기준·전결권자를 연결하고, 상품은 심사 업무의 조합으로 정의합니다.</p>
        <div class="grid2"><div>
          <h3>구성 요소</h3>
          ${tbl(["요소", "내용"], [
            ["심사 업무", Object.values(ont.tasks).map((t) => esc(t.name)).join(", ")],
            ["자료", "명칭, 제출 방식(온라인 제출·DART 자동 수집·현장 확인), 출처"],
            ["상품", "상품별 심사 업무 조합, 부도시손실률, 선택 확인 항목"],
            ["전결 한도", "신청 금액별 최종 승인자"],
          ])}</div><div>
          <h3>조건에 따른 절차 구성</h3>
          ${tbl(["조건", "절차 변화"], [
            ["대출 상품", "보증부: 보증 확인 추가. 부동산담보: 담보 확인·현장 확인 추가"],
            ["신청인", "대리 신청 시 위임장 요청 추가"],
            ["기업 정보", "상장기업은 DART 자동 수집, 공시 부족 기업은 고객 제출"],
            ["신청 금액", "전결권자 변경"],
          ])}</div></div>
        <p class="note">구성된 절차는 심사 화면의 필요 자료와 승인 조건으로 그대로 사용됩니다. <a href="#/workflow">심사 온톨로지 보기</a></p>
      </section>

      <section class="card"><h2>자료 검증</h2>
        <p>공시 자료를 그대로 사용하지 않고 심사 기준일 시점의 정보인지, 범위와 값이 일관된지 먼저 확인합니다.</p>
        ${tbl(["검증", "확인 내용"], [
          ["정보 시점", "기준일 이전 공시만 사용, 결산 후 6개월 경과 여부"],
          ["범위", "연결·별도 재무제표 구분, 연결 범위 변동"],
          ["일관성", "출처 간 값 대조, 전년도 수치 재작성"],
          ["채무·감사", "1년 내 사채 만기, 감사의견"],
          ["차입 권한", "신청인과 공시상 대표이사 비교"],
        ])}
      </section>

      <section class="card"><h2>재무·상환능력 분석</h2>
        <p>대출 신청 법인 자체의 별도재무제표로 재무 상태를 평가하고, 충격 시나리오에서 원리금 상환 가능 여부를 확인합니다.</p>
        ${tbl(["단계", "방법", "결과"], [
          ["재무지표", "부채비율, 유동비율, 차입금의존도, 이자보상배율, 순차입금", "재무 상태"],
          ["위험 신호", "영업손실, 이자보상배율 1 미만, 단기 상환 부담 등 6개 규칙의 점수", `사전 부도확률 ${A}`],
          ["상환능력", `기본·매출 ${sd.salesShock}%·금리 +${sd.rateShock}%p·복합 시나리오`, "최소 DSCR (상환재원 ÷ 원리금)"],
        ])}
        <p class="note">구간별 사전 부도확률 ${bands}</p>
      </section>

      <section class="card"><h2>정보가치 기반 추가 확인 선택</h2>
        <p>추가 자료는 판단을 바꿀 가능성이 있을 때만 가치가 있습니다. 각 자료가 줄이는 기대손실과 확보 비용을 비교해 요청 여부를 결정합니다.</p>
        ${flow([
          ["사전 부도확률", "위험 신호 구간"],
          ["추가 확인", "결과: 우려 또는 양호"],
          ["확률 갱신", "베이즈 정리"],
          ["결정", "기대손실이 작은 쪽"],
        ])}
        <div class="grid2"><div>
          <h3>손실과 비용</h3>
          ${tbl(["구분", "산정"], [
            ["부도 기업 승인", "대출금 × 부도시손실률(LGD, 상품별)"],
            ["정상 기업 거절", "대출 기간의 기대 이자이익"],
            ["확인 비용", "고객 이탈에 따른 이자이익 손실 + 처리비용"],
          ])}</div><div>
          <h3>선택 기준</h3>
          ${tbl(["지표", "정의"], [
            ["정보가치", "현재 기대손실 − 확인 결과 반영 후 기대손실"],
            ["순정보가치", "정보가치 − 확인 비용"],
            ["요청 순서", "순정보가치가 양수인 항목 중 큰 항목부터, 결과에 따라 재평가"],
          ])}</div></div>
        <h3>적용 예시: ${esc(co.name)} ${fmt(app.amount)} 신청</h3>
        ${tbl(["요청 방식", "평균 요청 건수", "확인 비용 + 기대손실"], nba.compare.map((x) => [x === best ? `<b>${esc(x.name)}</b>` : esc(x.name), x.count.toFixed(2), x === best ? `<b>${fmt(x.cost + x.loss, 2)}</b>` : fmt(x.cost + x.loss, 2)]))}
        <p class="note">${A} 시연 조건의 계산 결과</p>
      </section>

      <section class="card"><h2>가정과 한계</h2>
        ${tbl(["항목", "시연 값", "실제 운영 시"], [
          ["사전 부도확률", "위험 신호 구간별 가정", "신용평가모형의 등급별 부도확률"],
          ["민감도·특이도", "확인 항목별 가정", "과거 심사 건의 확인 결과와 사후 부도 실적"],
          ["확인 비용", `고객 이탈률·처리비용 가정, 자금조달금리 ${ea.fundingRate}%`, "신청 철회율·심사 원가 실적"],
          ["부도시손실률", "바젤Ⅱ 감독 LGD 45%·35%, 보증 비율 85% 가정", "은행 회수 실적 기반 LGD"],
          ["상품별 내규", "가상은행 기준", "은행 내규"],
        ])}
      </section>`;
  }

  // ------------------------------------------------------------ 사용 방법
  function pageGuide() {
    const roleBtn = (id) => { const x = SEED.users.find((u) => u.id === id); return `<button type="button" class="ghost small" data-role="${id}">${esc(x.name)}로 전환</button>`; };
    const steps = [
      ["심사 절차 구성", "심사역", "대출 상품·신청인·기업 정보·신청 금액 선택 후 '절차 구성'. 심사 업무 버튼으로 업무별 자료·담당·판단 기준·최종 승인 확인", `<a href="#/workflow">심사 온톨로지</a>`],
      ["심사 건 생성", "심사역", "'이 조건으로 심사 건 생성' 또는 기존 신청 건 선택", `<a href="#/case/APP-2026-0412">기존 신청 건</a>`],
      ["필요 자료 요청·확인", "심사역", "심사 화면 2단계에서 미제출 자료 '요청', 접수 자료 '확인 완료', 현장 확인 결과 기록", ""],
      ["자료 제출", "고객", "고객 화면에서 요청 자료 파일 선택 후 제출 (파일명만 기록)", roleBtn("c1")],
      ["추가 확인 항목 선택", "심사역", "심사 화면 5단계에서 순정보가치가 양수인 항목 '요청'", `<a href="#/case/APP-2026-0412/evi">추가 확인 선택</a>`],
      ["심사 의견", "심사역", "심사 화면 6단계에서 의견 기록", roleBtn("u1")],
      ["승인", "심사팀장", "필요 자료 확인 완료 후 승인·조건부 승인·거절", roleBtn("u2")],
      ["만기연장·사후 모니터링", "심사역", "만기 도래 여신의 연장 심사 시작, 검토 대상 공시의 검토 업무 생성", `<a href="#/loans">실행 여신</a> · <a href="#/monitor">사후 모니터링</a>`],
    ];
    return `<h1>사용 방법</h1>
      <section class="card"><div class="row-between"><div><h2>자동 시연</h2><p class="small">심사 절차 구성부터 승인까지 자동 진행 (약 1분)</p></div><button type="button" data-demo-start>자동 시연 시작</button></div></section>
      <section class="card"><h2>사용자</h2>
        <table class="t"><tr><th>사용자</th><th>역할</th><th></th></tr>
          ${SEED.users.map((x) => `<tr><td class="nw">${esc(x.name)}</td><td>${esc(x.role)}${x.canApprove ? ` (전결 한도 ${fmt(x.canApprove)})` : ""}</td><td>${x.id === S.role ? `<span class="muted">현재 사용자</span>` : roleBtn(x.id)}</td></tr>`).join("")}</table>
        <p class="note">화면 상단의 사용자 선택으로도 전환</p></section>
      <section class="card"><h2>시연 순서</h2>
        <ol class="howto">${steps.map(([t, who, d, link]) => `<li><div><b>${t}</b> <span class="muted small">${who}</span><p>${d}</p></div><div class="howto-go">${link}</div></li>`).join("")}</ol></section>
      <section class="card"><h2>초기화</h2><p>화면 상단 '초기화' 두 번 클릭 시 시연 데이터를 처음 상태로 복원</p></section>`;
  }

  // ------------------------------------------------------------ 업무 기능 관리 (패키지)
  function pagePackages() {
    return `<h1>업무 기능 관리</h1>
      <p class="sub">업무는 패키지 단위로 추가합니다. 새 패키지는 이미 있는 데이터 구조·계산 기능·처리 기능을 가져다 쓰고 부족한 것만 더합니다.</p>
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
    const t = e.target.closest("button, [data-tab], [data-scope], [data-disc], [data-otask], [data-role], [data-demo-stop], [data-demo-start]");
    if (!t) return;
    const r = route();
    if (t.dataset.tab) { companyTab = t.dataset.tab; render(); return; }
    if (t.dataset.scope) { fsScope = t.dataset.scope; render(); return; }
    if (t.dataset.disc) { discFilter = t.dataset.disc; render(); return; }
    if (t.dataset.otask) { workflowSelection.taskId = t.dataset.otask; keep(); render(); return; }
    if (t.hasAttribute("data-demo-stop")) { demoClose(); return; }
    if (t.hasAttribute("data-demo-start")) { runDemo(); return; }
    if (t.dataset.role) { S.role = t.dataset.role; save(); location.hash = user().customerOf ? "#/portal" : "#/home"; render(); return; }
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


  // ------------------------------------------------------------ 자동 시연
  // 실제 화면과 업무 처리(runAction)를 순서대로 실행하고 하단 패널에 단계 설명을 표시한다.
  const demo = { on: false, step: 0, total: 0 };
  const DEMO_PACE = 2600;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  function demoPanel(text, done) {
    let el = document.getElementById("demo-panel");
    if (!el) { el = document.createElement("div"); el.id = "demo-panel"; el.className = "demo-panel"; document.body.appendChild(el); }
    el.innerHTML = `<div class="demo-bar"><span>자동 시연 ${done ? "완료" : `${demo.step} / ${demo.total}`}</span>
      <button type="button" class="ghost small" data-demo-stop>${done ? "닫기" : "중지"}</button></div><p>${esc(text)}</p>`;
  }

  function demoClose() {
    demo.on = false;
    document.body.classList.remove("demo-running");
    document.querySelectorAll(".demo-hl").forEach((x) => x.classList.remove("demo-hl"));
    const el = document.getElementById("demo-panel");
    if (el) el.remove();
  }

  async function demoWait(ms) {
    await sleep(ms);
    if (!demo.on) throw new Error("stopped");
  }

  function demoMark(sel) {
    document.querySelectorAll(".demo-hl").forEach((x) => x.classList.remove("demo-hl"));
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return null;
    el.classList.add("demo-hl");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return el;
  }

  async function demoGo(hash) {
    window.__keepScroll = 0;
    if (location.hash === hash) render(); else location.hash = hash;
    await demoWait(350);
  }

  async function demoRole(id, hash) {
    S.role = id; save();
    await demoGo(hash);
  }

  async function demoWorkflow(patch) {
    Object.assign(workflowSelection, patch);
    window.__keepScroll = window.scrollY;
    render();
    await demoWait(300);
  }

  async function demoClickAll(sel) {
    for (let i = 0; i < 12; i++) {
      const b = document.querySelector(sel);
      if (!b) break;
      demoMark(b);
      await demoWait(450);
      keep(); b.click();
      await demoWait(250);
    }
  }

  async function runDemo() {
    if (demo.on) return;
    demo.on = true;
    document.body.classList.add("demo-running");
    let caseId = null;
    const steps = [
      ["시연 데이터를 초기화하고 심사 온톨로지 화면으로 이동", async () => {
        S = initialState(); save();
        Object.assign(workflowSelection, { productId: "working", applicant: "proxy", companyType: "listed", amountEok: 30, taskId: "AUTH" });
        await demoGo("#/workflow");
      }],
      ["차입 권한 확인 업무에 필요 자료·제출 방식·담당·판단 기준·최종 승인이 연결된 구조", async () => { demoMark(".onto-hub"); }],
      ["대표이사 신청으로 변경: 위임장 요청 제외", async () => { await demoWorkflow({ applicant: "representative" }); demoMark(".onto-node.l2"); }],
      ["신청 금액 50억 원으로 변경: 최종 승인자가 본부 심사위원회로 변경", async () => { await demoWorkflow({ applicant: "proxy", amountEok: 50 }); demoMark(".onto-node.r3"); }],
      ["부동산담보대출 선택: 담보 확인·담보 현장 확인 업무 추가", async () => { await demoWorkflow({ amountEok: 30, productId: "realestate" }); demoMark(".workflow-product.selected"); }],
      ["선택 조건으로 심사 건 생성", async () => {
        const b = demoMark("[data-act=CreateCaseFromWorkflow]");
        await demoWait(900);
        const before = S.cases.length;
        b.click();
        await demoWait(400);
        caseId = S.cases.length > before ? S.cases[S.cases.length - 1].id : null;
        if (!caseId) throw new Error("stopped");
        await demoGo("#/case/" + caseId);
        demoMark("#step-2");
      }],
      ["심사 온톨로지에서 구성된 심사 업무별 필요 자료를 고객에게 온라인 요청", async () => {
        await demoClickAll('#step-2 [data-act=RequestDocument][data-reason="필수 자료"]');
      }],
      ["담보 현장 확인은 온라인 제출 대상에서 제외, 은행 담당자가 결과 기록", async () => {
        const f = demoMark('#step-2 form[data-form="onsite"]');
        if (f) { await demoWait(700); f.querySelector("[name=note]").value = "담보 건물 현황과 감정평가 내용 일치"; keep(); f.requestSubmit(); await demoWait(300); }
      }],
      ["고객(최민수) 화면에서 요청 자료 제출", async () => {
        await demoRole("c1", "#/portal");
        demoMark("main section.card:last-of-type");
        const c = caseById(caseId);
        for (const r of c.requests.filter((x) => x.status === "요청됨")) {
          await demoWait(400);
          runAction("SubmitDocument", { caseId, reqId: r.id, file: r.name.replace(/\s/g, "") + ".pdf" });
        }
      }],
      ["심사역(김연주)이 제출 자료 확인 완료", async () => {
        await demoRole("u1", "#/case/" + caseId);
        await demoClickAll('main [data-act=ReviewDocument][data-result="확인 완료"], main [data-act=ReviewUploadedDocument]');
        demoMark("#step-2 table.t");
      }],
      ["재무지표 산출과 위험 신호", async () => { demoMark("#step-3"); }],
      ["시나리오별 최소 DSCR로 상환능력 분석", async () => { demoMark("#step-4"); }],
      ["순정보가치(정보가치 − 확인 비용)가 양수인 항목만 요청, 요청 방식 비교", async () => { demoMark("#step-5"); }],
      ["심사 의견 기록", async () => {
        const f = demoMark('form[data-form="opinion"]');
        await demoWait(600);
        f.querySelector("[name=text]").value = "담보·필요 자료 확인 완료, 승인 의견";
        keep(); f.requestSubmit();
        await demoWait(300);
      }],
      ["전결권자(심사팀장 이준호) 승인", async () => {
        await demoRole("u2", "#/case/" + caseId);
        const f = demoMark('form[data-form="decision"]');
        await demoWait(900);
        keep(); f.requestSubmit(f.querySelector('button[value="승인"]'));
        await demoWait(300);
      }],
      ["신청부터 승인까지 비대면 처리 완료", async () => { window.scrollTo({ top: 0, behavior: "smooth" }); demoMark(".stepper"); }],
    ];
    demo.total = steps.length;
    try {
      for (let i = 0; i < steps.length; i++) {
        demo.step = i + 1;
        demoPanel(steps[i][0]);
        await steps[i][1]();
        await demoWait(DEMO_PACE);
      }
      demoPanel("시연 종료. 다시 보려면 상단의 '자동 시연'을 누르세요.", true);
      demo.on = false;
    } catch (err) {
      if (demo.on) console.error(err);
      demoClose();
    }
  }

  document.getElementById("demo").addEventListener("click", () => { if (demo.on) demoClose(); else runDemo(); });

  window.addEventListener("hashchange", render);
  document.getElementById("asof").textContent = ASOF;
  render();

})();
