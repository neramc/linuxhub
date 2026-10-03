# 결정 기록 (ADR)

새 결정은 아래에 번호를 이어서 추가한다. 이미 내린 결정을 뒤집을 때도 기존 항목을 고치지 않고 새 ADR을 쓴다.

## ADR-0001 — 처음부터 다시 시작 (2026-10-03)
- **결정:** 기존 SvelteKit + Hono/Workers 모노레포를 모두 지우고 Astro 단일 앱으로 새로 시작한다.
- **이유:** 소유자의 지시다. 목표는 Adwaita 디자인, 아주 빠른 로딩, 단순한 기능 구성이다.
- **유지하는 것:** git 히스토리만 남기고, 코드와 문서는 이어받지 않는다.

## ADR-0002 — Astro 7 정적 출력과 Vercel
- **결정:** `output: "static"`으로 빌드한다. 서버에서 실행되는 경로는 `/api/geo` 하나뿐이다(`prerender = false`).
- **어댑터 설정:** `@astrojs/vercel` 11을 쓴다.
  - `imageService: false`로 런타임 이미지 변환 비용을 없앤다.
  - `staticHeaders: true`로 CSP를 HTTP 헤더로 보낸다.
- **리전:** 어댑터에는 리전 옵션이 없으므로 `vercel.json`의 `regions: ["icn1"]`로 지정한다.

## ADR-0003 — 데이터는 git에 커밋된 JSON, 갱신은 GitHub Actions
- **결정:** `scripts/sync/`가 공식 소스에서 데이터를 가져와 `src/data/**`에 JSON으로 저장한다.
  - `.github/workflows/sync.yml`이 6시간마다(미러는 매일) 실행한다.
  - 데이터가 바뀌었을 때만 커밋하고, Vercel이 자동으로 재배포한다.
- **이유:**
  - 페이지가 완전히 정적이라 가장 빠르다.
  - 변경 이력과 롤백을 git으로 관리할 수 있다.
  - 런타임 데이터베이스나 KV가 필요 없다.
- **실패 처리:** 어댑터 하나가 실패하면 그 배포판만 마지막 정상 데이터를 유지한다. 3번 연속 실패하면 이슈를 연다.

## ADR-0004 — 미러 추천 방식
- **결정:** `/api/geo`가 Vercel의 `geolocation()`으로 국가와 좌표를 알려 주면, 브라우저가 정적 미러 JSON을 받아 순위를 매긴다.
  - **정렬 기준:** 같은 국가 → 하버사인 거리(미러 좌표가 없으면 국가 중심 좌표) → HTTPS → 공식 점수
  - **대체 경로:** 실패하면 브라우저 시간대에서 위치를 추정한다(IANA zone1970 좌표). 그것도 안 되면 공식 기본 CDN을 쓴다.
- **공식 리다이렉터가 있는 배포판:** Fedora, openSUSE, Kali처럼 공식 리다이렉터·CDN이 있으면 그것을 기본으로 고르고, 화면에 "자동으로 가까운 서버"라고 표시한다.
- **개인정보:** 위치 정보는 `no-store`로 응답하고 기록하지 않는다. 브라우저 Geolocation API는 쓰지 않는다.

## ADR-0005 — 다국어: 한국어 기본, 영어 `/en/`
- **결정:** 모든 페이지를 `src/pages/[...locale]/` 아래 하나의 파일로 두 언어용으로 생성한다.
- **자동 리다이렉트 없음:** 언어를 자동으로 바꾸지 않는다. hreflang과 언어 전환 버튼만 둔다(SEO 친화적이고 서버 비용이 없다).
- **UI 문자열:** `src/i18n/{ko,en}.ts`에 둔다.

## ADR-0006 — Adwaita 디자인 토큰
- **결정:** libadwaita 1.10의 `_colors.scss` 값을 CSS 변수로 그대로 옮긴다. 모서리 반경도 libadwaita를 따른다(버튼 9px, 카드 12px, 다이얼로그 15px).
- **폰트:**
  - Adwaita Sans/Mono 51.0(OFL)의 라틴 subset을 woff2로 직접 호스팅한다.
  - 한글은 시스템 폰트를 쓴다. 웹폰트 0바이트로 Lighthouse 100을 노린다.
- **아이콘:** Adwaita symbolic 아이콘(CC BY-SA 3.0)을 쓴다.

## ADR-0007 — CSP와 클라이언트 JS 규칙
- **결정:** Astro `security.csp`로 inline script와 style의 해시를 자동으로 넣는다.
  - Pagefind 때문에 `'wasm-unsafe-eval'`을 허용한다.
  - 코드 하이라이트는 Prism을 쓴다. Shiki는 inline style을 써서 CSP와 맞지 않는다.
  - 페이지 전환은 CSS `@view-transition`으로 하고 ClientRouter는 쓰지 않는다.
- **meta CSP의 한계:** `frame-ancestors`는 meta 태그로 보낼 수 없으므로 `vercel.json`의 `X-Frame-Options: DENY`로 대신한다.

## ADR-0008 — 배포판 목록은 편집자가 정한다
- **결정:** DistroWatch를 크롤링하지 않는다(robots.txt가 AI 봇을 금지한다). 수록 목록(약 50개)은 편집자가 정한다.
- **정렬:** 인기 순위를 다른 사이트에서 가져와 표시하지 않는다. 정렬은 추천순(편집), 이름순, 최근 업데이트순만 둔다.
