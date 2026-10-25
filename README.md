# 법인대출 심사 PoC

가상은행 기업여신심사부의 법인대출 심사 업무를 브라우저 한 화면으로 시연하는 PoC입니다.
실제 DART(전자공시) 데이터를 바탕으로 신규 심사, 만기연장, 사후 모니터링을 진행합니다.

- 시연 페이지: https://kjhoeakjy.github.io/nice/
- 서버나 외부 라이브러리 없이 `index.html` 한 파일로 동작합니다. 글꼴, 데이터, 스크립트가 모두 이 파일 안에 들어 있습니다.
- 은행 내부 정보(사용자, 신청 건, 대출, 정책, 가정값)는 모두 시연용 가상 데이터입니다.

## 주요 기능

| 화면 | 내용 |
|---|---|
| 업무 현황 | 담당 심사 건, 만기 도래 여신, 모니터링 알림 요약 |
| 기업 정보 | DART 기업개황, 재무제표(별도/연결), 차입금 구성, 공시 목록, 관계 정보 |
| 심사 화면 | 자료 검증 → 대표권 확인 → 재무 분석 → 위험 신호 → 상환여력 시나리오 → 다음 업무 추천(정보가치) → 의견·결정 |
| 실행 여신 | 대출 계좌, 이자 납입 이력, 약정(부채비율 등) 점검, 만기연장 심사 시작 |
| 사후 모니터링 | 공시·사채 만기 사건을 대출과 연결해 점검 과제로 만들고 종결 |
| 업무 기능 관리 | 유스케이스 패키지가 쓰는 객체·함수·Action 목록과 함수 호출 기록 |
| 처리 기록 | 모든 상태 변경(Action)의 감사 기록 |
| 고객 화면 | 고객(재무팀장)이 요청받은 자료를 제출 |

상단의 사용자 선택으로 심사역, 심사팀장, 고객 역할을 바꿔 볼 수 있습니다. 진행 상태는 브라우저 `localStorage`에 저장되며, 상단의 `초기화`를 두 번 누르면 처음 상태로 돌아갑니다.

## 폴더 구조

```
index.html            배포용 결과물 (build.py 가 생성, GitHub Pages 가 이 파일을 게시)
build.py              src/ 를 묶어 index.html 을 만드는 스크립트
src/
  index.html          페이지 틀 (HTML 마크업 + 포함 지시문)
  styles/
    fonts.css         Wanted Sans 글꼴 선언
    base.css          기본 레이아웃·컴포넌트
    theme.css         색상 테마 (진한 노랑·갈색)
    skin.css          업무 시스템 스킨 (평면, 조밀), 반응형
  fonts/              Wanted Sans woff2 (400/500/600/700)
  data/
    dart.json         DART 공시 데이터 (기업 2곳)
    seed.js           가상 데이터: 사용자, 정책, 신청 건, 대출, 패키지
  js/
    creditos.js       공통 업무 함수 (계산·검증·시뮬레이션·의사결정)
    app.js            화면, 라우팅, Action, 상태 저장
docs/                 설계·데이터·함수·개발 문서
```

## 빌드

Python 3만 있으면 됩니다(외부 패키지 없음).

```
py build.py           # index.html 생성
py build.py --check   # index.html 이 src/ 와 일치하는지 확인
```

`src/` 를 수정한 뒤에는 `py build.py` 로 `index.html` 을 다시 만들고 둘 다 커밋합니다.
macOS·Linux 에서는 `py` 대신 `python3` 을 씁니다.

## 문서

- [docs/architecture.md](docs/architecture.md) — 구성, 실행 흐름, 상태와 Action, 유스케이스 패키지
- [docs/functions.md](docs/functions.md) — 공통 함수(`CreditOS`) 설명과 계산 방식
- [docs/data.md](docs/data.md) — DART 데이터와 가상 데이터의 구조
- [docs/development.md](docs/development.md) — 수정·빌드·배포 방법

## 주의

- 위험 신호 점수, 구간별 상환곤란 확률, 정보가치 계산의 민감도·비용·손실은 시연용 가정값이며 실제 신용평가모형이나 은행 내부 기준이 아닙니다.
- 고객 화면의 파일 제출은 파일 이름만 기록하며 파일 내용은 어디에도 보내지 않습니다.
- 글꼴: [Wanted Sans](https://github.com/wanteddev/wanted-sans) (SIL Open Font License 1.1).
