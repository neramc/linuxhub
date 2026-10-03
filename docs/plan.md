# Linuxhub 재구축 계획: Astro + Adwaita 리눅스 배포판 웹앱

## 1. 배경

- **목표:** Flathub처럼 GNOME Adwaita 디자인을 쓴 리눅스 배포판 웹앱을 **Astro로 처음부터 새로** 만든다.
- **요구사항:**
  - 빠른 로딩, 깔끔하고 단순한 화면(쓸데없는 기능 없음)
  - 공식 로고
  - 공식 미러/CDN에서 다운로드, IP 위치 기반 최적 미러 추천, 상시 자동 업데이트
  - 리눅스 종합 가이드, 공식 문서 수준의 설치 가이드
  - 오래 머물고 싶은 사이트, Vercel 배포
- **기존 저장소는 참고하지 않는다.** 사용자 지시에 따라 SvelteKit/Hono 모노레포 전체를 지운다. 기존 `CLAUDE.md`, `.ai/`, `design/`, `apps/`, `packages/` 등 추적 파일 308개가 대상이다. git 히스토리는 남기고 새로 시작한다. 기존 `CLAUDE.md`의 스택 고정 규칙은 사용자의 명시적 지시로 대체되며, 0단계에서 새 `CLAUDE.md`로 교체한다.
- **작업 브랜치:** `claude/linux-distro-webapp-astro-5dn8qn`. 단계마다 커밋하고 이 브랜치에 푸시한다.

### 사용자가 확정한 사항
| 항목 | 결정 |
|---|---|
| 언어 | 한국어 + 영어. 한국어가 기본(`/`), 영어는 `/en/` |
| 배포판 수 | 약 50개. 모든 배포판에 개별 상세 설치 가이드를 쓴다 |
| 부가 기능 | 배포판 찾기 퀴즈, 비교, 계보도·역사 타임라인, 최근 릴리스 소식 + RSS |
| 자동 업데이트 | GitHub Actions 크론 → 검증 → JSON 커밋 → Vercel 자동 재배포 |

---

## 2. 기술 스택 (검증 완료: 2026-10 기준 최신)

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Astro 7.3** (`output: 'static'`), Node ≥ 22.12 | 페이지는 모두 정적 HTML이고 JS는 거의 없다 |
| 패키지 매니저 | Bun (단일 앱, 모노레포 아님) | 단순화 |
| 언어 | TypeScript strict | |
| 콘텐츠 | Content Layer(`src/content.config.ts`, `glob`/`file` 로더, `astro/zod`의 Zod 4) + `@astrojs/mdx` 8 | 빌드할 때 스키마로 검증한다 |
| 검색 | `astro-pagefind` 2 (Pagefind 1.5), 인터페이스는 Adwaita 스타일로 직접 만든다 | 정적 인덱스. 검색을 열 때만 로드한다 |
| 배포 | `@astrojs/vercel` 11. 서버 함수는 `/api/geo` 하나뿐이다 | 나머지는 전부 CDN에서 정적 파일로 제공한다 |
| 스타일 | 순수 CSS. libadwaita 토큰과 Astro 스코프 스타일을 쓰고 Tailwind는 쓰지 않는다 | 가장 가볍고 Adwaita를 충실하게 재현할 수 있다 |
| 폰트 | Adwaita Sans/Mono(OFL)의 라틴 글자만 woff2로 잘라 Astro Fonts API로 preload. 한글은 시스템 폰트(Apple SD Gothic Neo, Malgun Gothic, Noto Sans CJK KR)를 쓴다 | 한글 웹폰트를 0바이트로 해서 Lighthouse 100을 노린다 |
| 아이콘 | Adwaita symbolic 아이콘 중 쓰는 것만 인라인 SVG 스프라이트로 넣는다(CC BY-SA 3.0, 출처 표기) | |
| 린트·테스트 | Biome, Vitest, Playwright + axe, Lighthouse CI | |

**Astro 7에서 주의할 점**

- **HTML 문법:** 새 Rust 컴파일러는 잘못된 HTML을 에러로 처리한다.
- **Markdown 파이프라인:** Markdown은 Sätteri로 처리된다. remark 플러그인이 필요하면 `@astrojs/markdown-remark`를 써야 한다.
- **예약된 파일명:** `src/fetch.ts`는 Astro가 예약했으므로 동기화 스크립트는 `scripts/`에 둔다.
- **CSP와의 충돌:** `<ClientRouter/>`와 Shiki는 Astro CSP와 충돌한다. 그래서 다음과 같이 한다.
  - 화면 전환은 JS 없이 CSS `@view-transition { navigation: auto; }`로 한다.
  - 코드 하이라이트는 빌드할 때 Prism으로 한다.

---

## 3. 사이트 구조 (페이지)

모든 페이지는 `src/pages/[...locale]/…` 하나로 두 언어를 만든다. `locale`이 없으면 한국어 `/…`, `en`이면 영어 `/en/…`가 된다. 언어는 자동으로 리다이렉트하지 않는다. 헤더의 언어 전환 버튼과 hreflang만 둔다.

| 경로 | 내용 | 클라이언트 JS |
|---|---|---|
| `/` | 홈: 짧은 소개와 검색, 추천 배포판, 용도별 진입(입문·게이밍·개발·서버·보안·경량·롤링), 최근 릴리스, 리눅스 가이드 소개 | 없음 |
| `/distros/` | 전체 목록(Flathub식 카드 그리드). 필터는 계열·용도·데스크톱·릴리스 모델·난이도, 정렬은 추천순·이름순·최근 업데이트순. 필터 상태는 URL 쿼리에 저장하고, JS가 없어도 전체 목록이 보인다 | 필터 약 2KB |
| `/distros/[slug]/` | 상세: 로고·이름·태그라인·배지, 짧은 설명, 핵심 정보 목록(최신 버전·출시일·지원 종료·아키텍처·기본 데스크톱·패키지 관리자·설치 프로그램·공식 링크), **다운로드 마법사**, 설치 가이드 링크, 관련 배포판, 데이터 마지막 확인 시각 | 다운로드 약 6KB |
| `/distros/[slug]/install/` | 공식 문서 수준의 설치 가이드. 목차와 단계를 보여 주고, 버전·파일명·체크섬은 동기화 데이터로 자동 반영한다 | 복사 버튼 1KB 미만 |
| `/learn/`, `/learn/[chapter]/` | 리눅스 가이드: 약 20개 장, 사이드바 목차, 이전/다음 장 | 없음 |
| `/finder/` | 배포판 찾기 퀴즈(6~7문항, 결과 상위 3개와 그 이유) | 약 3KB |
| `/compare/?d=ubuntu,fedora` | 2~3개 배포판 비교, 링크로 공유 가능 | 약 3KB |
| `/family/` | 계보도(계열별 트리)와 역사 타임라인. 빌드할 때 SVG로 만든다 | 없음 |
| `/releases/`, `/rss.xml` | 최근 릴리스 소식(동기화 기록에서 생성) | 없음 |
| `/about/` | 데이터 출처, 로고 상표 고지, 위치 정보 처리 안내, 연락처 | 없음 |
| `/404` | Adwaita StatusPage 스타일 | 없음 |
| `/api/geo` | **유일한 서버 함수**. 방문자 국가와 좌표를 JSON으로 돌려준다 | — |

공통 헤더(AdwHeaderBar 스타일): 로고, 배포판, 리눅스 가이드, 찾기, 계보, 검색(Ctrl+K), 언어, 테마(시스템/라이트/다크). 모바일에서는 하단 시트 메뉴로 바뀐다.

### 체류 시간 전략 (팝업이나 다크 패턴 없이, 콘텐츠로 연결)
- **상세 페이지 하단:** 같은 계열이나 비슷한 용도의 배포판을 보여 주고, 이 배포판에 쓰인 기술(데스크톱 환경, 패키지 관리자)을 가이드의 해당 장으로 연결한다.
- **용어 링크:** 가이드와 설치 문서에 처음 나오는 용어를 용어사전과 가이드 장에 링크한다.
- **흐름 연결:** 다운로드를 시작하면 "다음 단계: 부팅 USB 만들기"로, 퀴즈 결과는 상세와 비교로, 비교 결과는 각 상세로 이어진다.
- **가이드 읽기 경험:** 리눅스 가이드는 장 단위로 나누고 이전/다음 장, 읽기 시간, 관련 배포판을 보여 준다.

---

## 4. Adwaita 디자인 시스템

- **색상 토큰:** libadwaita 1.10의 `_colors.scss` 값을 CSS 변수로 그대로 옮긴다. 라이트·다크 모드는 `prefers-color-scheme`와 수동 토글로 바꾼다.
  - `--accent-bg-color` `#3584e4`. accent 글자색은 라이트 `#0461be`, 다크 `#81d0ff`(oklab 계산식을 그대로 쓴다).
  - `--window-bg-color` `#fafafb` / `#222226`, `--view-bg-color` `#fff` / `#1d1d20`.
  - `--headerbar-bg-color` `#fff` / `#2e2e32`, `--card-bg-color` `#fff` / `rgb(255 255 255 / 8%)`, `--card-shade-color` 등.
  - destructive, success, warning 색상, 테두리(`currentColor` 15% 혼합), hover/active/selected 7%/16%/10%.
- **모서리 반경:** 버튼 9px, 카드 12px, 다이얼로그·팝오버 15px. 간격은 6px 배수로 맞춘다(Adwaita 기준).
- **컴포넌트**(`src/components/adw/`, 기본적으로 JS 없음):
  - 화면 구조: HeaderBar, ViewSwitcher(탭), StatusPage, Banner
  - 버튼과 칩: Button(suggested, flat, pill, destructive), LinkedButtons, Chip
  - 목록과 카드: Card(클릭 가능), BoxedList, ActionRow, ExpanderRow(네이티브 `<details>`)
  - 상호작용(JS 조금): Dialog(네이티브 `<dialog>`), Toast
  - 문서용: Callout, Steps, CodeBlock(복사 버튼), Kbd, Icon
- **도메인 컴포넌트**(`src/components/`): DistroCard(Flathub 앱 타일 스타일), DistroLogo, DownloadWizard, MirrorList, FilterBar, SearchDialog, Quiz, CompareTable, FamilyTree, Timeline, Toc, PrevNext, LangSwitcher, ThemeSwitcher
- **접근성:** WCAG 2.2 AA를 지킨다.
  - Adwaita 스타일의 포커스 링과 본문 바로가기 링크를 둔다.
  - `prefers-reduced-motion`를 존중하고, 터치 영역은 44px 이상으로 한다.
- **승인 절차:** 1단계를 마치면 컴포넌트 쇼케이스 페이지를 스크린샷으로 공유한다. 라이트와 다크, 모바일과 데스크톱을 모두 보여 주고, 사용자 확인을 받은 뒤 페이지 구현에 들어간다.

---

## 5. 데이터와 콘텐츠 모델

### 5.1 배포판 목록 (51개 초안, 2단계에서 확정)
DistroWatch는 **크롤링하지 않는다**(robots.txt가 AI 봇을 금지한다). 목록은 편집자가 직접 정한다.
- **Debian/Ubuntu 계열(26):** Debian, Ubuntu, Kubuntu, Xubuntu, Lubuntu, Ubuntu MATE, Linux Mint, Pop!_OS, Zorin OS, elementary OS, MX Linux, antiX, KDE neon, Linux Lite, Peppermint, Q4OS, Bodhi, SparkyLinux, Devuan, Kali, Parrot, Tails, deepin, TUXEDO OS, Raspberry Pi OS, Vanilla OS
- **Arch 계열(6):** Arch, Manjaro, EndeavourOS, CachyOS, Garuda, Artix
- **Fedora/RHEL 계열(7):** Fedora, Bazzite, Nobara, AlmaLinux, Rocky Linux, CentOS Stream, Oracle Linux
- **SUSE(1):** openSUSE(Tumbleweed/Leap) · **Mandriva 계열(3):** Mageia, OpenMandriva, PCLinuxOS
- **독립(8):** Slackware, Gentoo, Void, Alpine, NixOS, Solus, Puppy, Qubes OS

### 5.2 파일 구조
```
src/content/distros/<slug>.yaml          # 편집 메타데이터. 사람이 작성하고 스키마로 검증한다
  name, family, basedOn, releaseModel, desktops[], packageManagers[], installer,
  useCases[], difficulty, architectures[], origin{country, firstRelease},
  links{home, docs, forum, download, releaseNotes}, tagline{ko, en},
  logo{file, sourceUrl, license, trademarkPolicyUrl}, sources[],
  sync{adapter, options}, download{strategy: redirector|mirrors|sourceforge|official-page}
src/content/distro-docs/<slug>/{ko,en}/{overview,install}.mdx   # 짧은 소개와 설치 가이드
src/content/partials/{ko,en}/*.mdx       # 공용 단계: USB 만들기, 체크섬·서명 검증,
                                         # UEFI·Secure Boot, 듀얼부팅·BitLocker,
                                         # 설치 프로그램별(Calamares, Anaconda, Ubuntu 설치 프로그램,
                                         # debian-installer, archinstall, Agama/YaST …)
src/content/learn/{ko,en}/*.mdx          # 리눅스 가이드 각 장
src/content/glossary/{ko,en}.yaml        # 용어사전
src/data/                                # ← 동기화가 생성하고 커밋하는 파일 (사람이 수정하지 않는다)
  releases/<slug>.json   # 버전·채널·출시일·지원 종료일, 에디션 → 아키텍처 → 형식별 파일
                         # (상대 경로, 크기, sha256, 서명·토렌트 URL)
  mirrors/<slug>.json    # 공식 미러 목록 {url, country, lat?, lon?, https, score?}
  history.json           # 버전 변경 기록 (릴리스 소식과 RSS에 쓴다)
  status.json            # 소스별 마지막 성공 시각과 상태
src/data/geo/countries.json, timezones.json   # 국가 중심 좌표(Natural Earth, 퍼블릭 도메인),
                                              # IANA zone1970.tab 좌표(퍼블릭 도메인)
src/assets/logos/<slug>.svg               # 공식 로고. 색을 바꾸지 않고 SVGO로 최적화만 한다
```
- **설치 가이드도 자동 업데이트된다.** MDX 안에 `<Latest slug field="version"/>`, `<IsoName/>`, `<VerifyCommand/>` 같은 데이터 컴포넌트를 넣는다. 버전이 바뀌면 문서도 다음 빌드에서 자동으로 갱신된다.
- **글쓰기 규칙**(`docs/content-guide.md`):
  - 공식 문서를 **그대로 베끼지 않고 의역**한다.
  - frontmatter에 출처(`sources`)와 검토일(`lastReviewed`)을 적는다.
  - 한국어로 먼저 쓰고 영어를 같은 배치에서 쓴다.

### 5.3 로고
- **출처 우선순위:** 공식 사이트의 브랜드·프레스 키트를 먼저 쓰고, 공식 파일을 그대로 올린 Wikimedia Commons를 그다음으로 쓴다.
- **기록:** 배포판마다 출처 URL, 라이선스, 상표 정책 URL을 YAML에 기록한다. `/about`에 크레딧과 삭제 요청 연락처를 둔다.
- **사용 규칙:** 색을 바꾸지 않는다. 공식 다크 변형이 있으면 그것을 쓰고, 없으면 밝은 배경의 타일 위에 표시한다.

---

## 6. 다운로드와 미러 추천

**다운로드 흐름:** 버전 → 에디션 → 아키텍처 → 형식(ISO, 토렌트, 체크섬, 서명) → 미러 → 다운로드.
- 다운로드 화면에서 SHA256을 복사하고 검증 명령을 볼 수 있다.
- 마지막으로 고른 값은 `localStorage`에 기억한다.

배포판마다 공식 소스의 형태에 따라 전략을 나눈다(검증 결과 반영).

| 전략 | 대상 | 동작 |
|---|---|---|
| `redirector` | Fedora, openSUSE, Kali, KDE neon, Tails, Zorin, NixOS, Alpine, Rocky, Alma, Manjaro, Pop!_OS, CachyOS, Bazzite, Slackware | 기본값은 "공식 CDN, 자동으로 가까운 서버". 공식 리다이렉터가 IP를 보고 연결한다. 국가별 목록이 있으면 함께 보여 준다 |
| `mirrors` | Arch, Ubuntu와 공식 변형판, Debian, Gentoo, Devuan, Mageia, Artix, Mint, EndeavourOS | 공식 미러 목록을 **우리가 IP 기준으로 순위를 매겨** 추천 3~5개를 보여 준다 |
| `sourceforge` | MX, antiX, Linux Lite, OpenMandriva, Peppermint, Q4OS, Bodhi, Sparky | 공식 SourceForge 프로젝트. SourceForge가 가까운 미러를 고른다 |
| `official-page` | elementary(링크 만료), PCLinuxOS, Oracle, Puppy 등 | 공식 다운로드 페이지와 검증 방법으로 안내한다 |

**미러 추천 흐름**

1. 다운로드 마법사를 열면 `/api/geo`를 호출한다.
   - Vercel Function(`prerender = false`)이 `@vercel/functions`의 `geolocation()`으로 국가·위도·경도를 읽어 JSON으로 돌려준다.
   - `Cache-Control: private, no-store`로 캐시하지 않고, 위치 정보를 기록하지 않는다.
   - 함수 리전은 `vercel.json`의 `regions: ["icn1"]`(서울)로 정한다.
2. 정적 파일 `mirrors/<slug>.json`을 가져와 브라우저에서 순위를 매긴다(`src/lib/mirrors.ts`, 테스트 대상).
   - **정렬 순서:** 같은 국가 → 하버사인 거리(미러 좌표가 있으면 그 값, Mageia만 해당; 없으면 국가 중심 좌표) → HTTPS → 공식 점수(예: Arch score).
3. `/api/geo`가 실패하면 브라우저 시간대(`Intl` timeZone)를 IANA 좌표로 바꿔 대신 쓴다. 그것도 실패하면 공식 기본 CDN을 쓴다.
4. 사용자는 미러를 직접 바꿀 수 있다.
   - 체크섬은 **항상 공식 원본 호스트 기준**으로 보여 주고, 미러에서 받지 않는다.

---

## 7. 상시 자동 업데이트 (GitHub Actions)

`scripts/sync/` (Bun과 TS로 작성, 실제 소스를 기록한 fixture로 테스트한다)

- **`http.ts`:** 모든 요청이 지키는 공통 규칙
  - User-Agent `LinuxhubBot/1.0 (+https://<도메인>/about#bot)`
  - `robots-parser`로 robots.txt를 확인하고 캐시한다. `Crawl-delay`를 지킨다(Arch는 2초).
  - 같은 호스트에는 1초 이상 간격을 두고, 429/5xx는 백오프 후 재시도한다.
  - ETag와 If-Modified-Since를 쓴다.
- **범용 어댑터:** `endoflife`(18개 배포판의 버전과 지원 종료일), `json-api`, `checksum-dir`, `sourceforge-rss`, `github-release`, `manual`
- **배포판 전용 어댑터:** fedora `releases.json`, arch `releng`, ubuntu Launchpad, opensuse, pop-os, manjaro `iso-info`, alpine, tails, raspberrypi 등
- **미러 수집기:**
  - Arch `mirrors/status/json`, Ubuntu `cdimage_mirrors`, Debian `Mirrors.masterlist`
  - Fedora/Rocky/CentOS `mirrorlist?country=`, Gentoo `distfiles.xml`, Mageia API, Devuan, Artix, Manjaro `status.json`
- **`validate.ts`:** 쓰기 전에 데이터를 검사한다.
  - Zod 스키마 검사
  - sha256 형식(16진수 64자) 검사
  - 다운로드 URL은 배포판별 공식 호스트 허용 목록에 있는 https 주소만 허용
  - 버전이 내려가면 거부
  - robots.txt가 허용하는 곳만 HEAD 요청으로 파일이 있는지 확인
- **`write.ts`:** 결과를 저장한다.
  - 키를 정렬하고 가져온 시각을 빼서, 데이터가 실제로 바뀔 때만 diff가 생기게 한다.
  - 어댑터가 실패하면 **그 배포판만 마지막 정상 데이터를 유지**하고 `status.json`에 "오래됨" 표시를 남긴다.
- **`history.json`:** 버전이 바뀌면 기록을 추가한다. 이 기록으로 릴리스 소식과 RSS를 만든다.

**`.github/workflows/sync.yml`**

- **실행 주기와 동시 실행:**
  - 릴리스는 `17 */6 * * *`(6시간마다), 미러는 `43 3 * * *`(매일), 수동 실행(`workflow_dispatch`)도 가능하다.
  - `concurrency`로 겹쳐 실행되지 않게 한다.
- **실행 순서:**
  1. `bun install`
  2. `bun run sync`
  3. `bun run sync:validate`
  4. `astro sync` + `astro check`로 스키마를 검사한다.
  5. 바뀐 내용이 있을 때만 `chore(data): sync YYYY-MM-DD` 커밋을 `main`에 푸시한다. Vercel이 Git 연동으로 자동 배포한다.
- **안전장치:**
  - `GITHUB_TOKEN`으로 한 푸시는 다른 워크플로를 실행하지 않으므로 무한 루프가 생기지 않는다.
  - 저장소는 public이라 Hobby 플랜의 봇 커밋 배포 제한에 걸리지 않을 것으로 본다. 대비책으로 `VERCEL_DEPLOY_HOOK` 시크릿이 있으면 Deploy Hook도 호출한다.
  - 같은 소스가 3번 연속 실패하면 `sync-failure` 이슈를 자동으로 열거나 갱신한다.
  - 크론은 60일 동안 활동이 없으면 꺼진다. 데이터 커밋이 보통 그보다 자주 생기지만, 대비해 keep-alive 단계를 둔다.

---

## 8. 성능 최적화 (목표: Lighthouse 100 / 100 / 100 / 100)

- **JS와 CSS:**
  - 정적 HTML이 먼저이고, 기본 JS는 0KB다. 기능이 필요한 페이지에서만 작은 바닐라 TS 아일랜드를 쓰고, UI 프레임워크 런타임은 없다.
  - 테마 초기화는 head의 인라인 스크립트 1개(1KB 미만, CSP 해시)로 해서 화면 깜빡임을 막는다.
  - CSS는 gzip 20KB 이하로 만들고 `build.inlineStylesheets: 'always'`로 인라인한다. 첫 페인트에 필요한 요청이 HTML 하나뿐이다.
- **폰트:** 라틴 subset woff2 1개(약 35KB)를 preload하고, Fonts API가 만드는 대체 폰트 메트릭으로 레이아웃 이동(CLS)을 없앤다. 한글은 시스템 폰트를 쓴다.
- **이미지:**
  - 로고는 SVGO로 최적화한 SVG를 `width`/`height`를 지정해 넣는다. 첫 화면 밖은 `loading="lazy"`, 상세 상단 로고는 `fetchpriority="high"`로 한다.
  - Vercel 이미지 최적화(`imageService`)는 쓰지 않는다.
- **페이지 이동:**
  - `prefetch: { prefetchAll: true, defaultStrategy: 'hover' }`, 그리고 Speculation Rules 기반 사전 렌더링(`clientPrerender`, 실험적 기능)을 켠다.
  - JS 없는 네이티브 view transition을 쓴다.
- **캐시:**
  - `/_astro/*`와 폰트는 1년 동안 immutable로 캐시한다.
  - HTML은 Vercel CDN에 두고, 배포할 때 캐시가 자동으로 무효화된다.
  - Pagefind 인덱스는 필요한 조각만 불러온다.
- **CI 예산:**
  - Lighthouse CI: 성능 0.98 이상, 접근성·권장사항·SEO 1.0
  - 페이지당 JS gzip 15KB 이하(검색은 동적 로드라 제외)
  - 상세 페이지 전체 전송량 120KB 이하
- **SEO:**
  - 모든 페이지에 canonical과 hreflang(ko, en, x-default)을 넣고, `@astrojs/sitemap`의 i18n 설정과 `robots.txt`를 쓴다.
  - JSON-LD: WebSite+SearchAction, BreadcrumbList, 배포판은 SoftwareApplication, 설치 가이드는 HowTo/TechArticle
  - OG 이미지는 빌드할 때 배포판별로 만든다(로고 + 이름).

---

## 9. Vercel 배포 설정

`astro.config.mjs` (핵심):
```js
output: 'static',
adapter: vercel({ imageService: false, maxDuration: 10, staticHeaders: true }),
i18n: { locales: ['ko', 'en'], defaultLocale: 'ko', routing: { prefixDefaultLocale: false } },
security: { csp: { /* script hashes 자동, Pagefind용 'wasm-unsafe-eval' */ } },
```
`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "astro",
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "bun run build",
  "regions": ["icn1"],
  "trailingSlash": true,
  "headers": [
    { "source": "/_astro/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/pagefind/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600, stale-while-revalidate=86400" }] },
    { "source": "/(.*)", "headers": [
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
      { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" } ] }
  ]
}
```
- **배포 브랜치:** 프로덕션은 `main`, 그 밖의 브랜치와 PR은 프리뷰 배포다. 지금 작업 브랜치는 프리뷰로 확인한다.
- **Vercel 프로젝트 생성:** Vercel MCP로 팀 `starfect`에 프로젝트를 만들고 `neramc/linuxhub`를 연결한다. 아직 프로젝트가 없는 것을 확인했다. 외부 작업이므로 **9단계에서 사용자 승인을 받은 뒤** 진행한다.
- **도메인:** 사용자가 정한다. `astro.config`의 `site` 값으로 둔다.
- **플랜 제한:** Hobby 플랜은 비상업적 용도만 허용한다(참고로 고지한다).

---

## 10. 진행 단계 (단계마다 독립 커밋 후 푸시)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **0. 초기화** | ① `chore: remove legacy monorepo`: 추적 파일 전부 `git rm`. ② `chore: scaffold astro 7 project`: Bun, TS strict, Biome, Vitest, Playwright, `vercel.json` 초안, `ci.yml`, 새 `CLAUDE.md`와 `docs/`(plan·decisions·data-sources·content-guide), `.claude` SessionStart 훅을 Astro용으로 교체, LICENSE(코드 MIT, 문서 CC BY-SA 4.0 기본안), README | `bun run build`, `lint`, `check`, `test` 통과 |
| **1. 디자인 시스템** | 토큰, 폰트 subset, 아이콘 스프라이트, adw 컴포넌트, 테마 전환, 개발용 쇼케이스 페이지 | 라이트/다크와 모바일/데스크톱 스크린샷을 공유하고 **사용자 확인** |
| **2. 데이터 모델·카탈로그** | `content.config.ts` 스키마, 배포판 YAML 51개, 공식 로고와 크레딧, ko/en UI 사전, geo 데이터셋 | 빌드할 때 스키마 검증 통과 |
| **3. 동기화 파이프라인** | http/robots, 어댑터, 미러 수집기, 검증과 저장, fixture 테스트, 첫 실행 데이터 커밋, `sync.yml` | `bun run sync`가 실제 소스로 성공하고, 두 번째 실행에서 diff가 없다 |
| **4. 핵심 페이지** | 4-1 레이아웃·헤더·404, 4-2 홈·목록·필터, 4-3 상세, 4-4 다운로드 마법사 + `/api/geo` + 미러 순위, 4-5 Pagefind 검색(한국어 조사 정규화) | e2e(탐색, 다운로드, 언어 전환)와 axe 통과 |
| **5. 배포판 콘텐츠** | 공용 partials, 그다음 5a Debian·Ubuntu 계열, 5b Arch, 5c Fedora·RHEL·SUSE, 5d 나머지. 소개와 설치 가이드를 ko/en으로 쓴다 | 모든 문서에 출처와 검토일이 있고, 데이터 컴포넌트로 버전이 자동 반영된다 |
| **6. 리눅스 가이드** | 약 20개 장 ko/en(아래 목록), 용어사전, 자동 용어 링크 | 장 사이 탐색, 관련 배포판 링크 |
| **7. 부가 기능** | 퀴즈(배포판 속성으로 점수를 매기고 근거를 표시), 비교, 계보도·타임라인 SVG, 릴리스 소식 + RSS | 단위 테스트(퀴즈 점수)와 e2e |
| **8. 최적화·SEO** | CSP, Speculation Rules, JSON-LD, OG 이미지, sitemap/hreflang, Lighthouse CI 예산 | Lighthouse 목표 달성 |
| **9. Vercel 배포** | 프로젝트 생성(승인 후), 도메인, 프리뷰 → 프로덕션, 스모크 테스트, `docs/deploy.md` 런북 | 실제 URL에서 페이지, `/api/geo`, 동기화 → 재배포 흐름 확인 |

**리눅스 가이드 장 목록(초안):**
1. 리눅스란(커널, GNU, 라이선스)
2. 역사(Unix → GNU → 1991 → 배포판의 탄생)
3. 배포판 이해(계열, 릴리스 모델, 불변 배포판)
4. 데스크톱 환경과 윈도우 매니저
5. X11과 Wayland
6. 패키지 관리(apt, dnf, pacman, zypper, apk, nix / Flatpak, Snap, AppImage)
7. 파일 시스템 계층(FHS)과 파일시스템(ext4, Btrfs, XFS, ZFS)
8. 터미널과 셸
9. 필수 명령어 치트시트
10. 사용자, 권한, sudo
11. 프로세스, systemd, 로그
12. 부팅 과정(UEFI, GRUB/systemd-boot, initramfs)
13. 하드웨어와 드라이버(GPU, Wi-Fi, 펌웨어)
14. 네트워킹과 SSH
15. 보안(업데이트, 방화벽, SELinux/AppArmor, LUKS)
16. 설치 준비(USB, 듀얼부팅, Secure Boot, BitLocker, 백업)
17. Windows/macOS에서 넘어오기
18. 리눅스 게이밍(Steam, Proton)
19. 개발·서버·컨테이너·가상화
20. 문제 해결과 도움 받기
21. 용어사전

---

## 11. 검증 방법
- **매 커밋 전:** `bun run lint`, `bun run check`(astro check + tsc), `bun run test`, `bun run build`
- **단위 테스트:**
  - 각 어댑터를 실제 응답 fixture로 검증한다.
  - 미러 순위(하버사인, 국가 우선순위, 시간대 대체 경로)
  - 퀴즈 점수, 스키마
- **e2e(Playwright + `/opt/pw-browsers/chromium`):** 빌드한 결과물을 대상으로 다음을 확인한다.
  - 목록 필터 → 상세 → 다운로드 마법사 단계. `/api/geo`는 모의 응답(KR, US)으로 추천 미러 순서를 확인한다.
  - 언어 전환과 hreflang, 검색, 퀴즈, 비교
  - axe(WCAG AA)와 키보드 탐색
- **동기화 실전 검증:** `bun run sync`를 실제 소스로 실행하고, 결과 URL 몇 개를 robots가 허용하는 곳에서 HEAD로 확인한다. 같은 명령을 다시 실행해 diff가 없는지 본다.
- **성능:** `@lhci/cli`로 홈, 목록, 상세, 가이드 페이지를 측정하고 예산을 넘으면 CI를 실패시킨다.
- **화면 확인:** 주요 화면의 라이트/다크와 모바일/데스크톱 스크린샷을 공유한다.
- **배포 후:** 프리뷰 URL에서 `curl /api/geo`, 보안 헤더, sitemap, RSS를 확인한다.

## 12. 위험 요소와 대응
| 위험 | 대응 |
|---|---|
| 콘텐츠 분량이 큼(51개 × 2개 언어 설치 가이드 + 21장 × 2) | 공용 partials로 중복을 줄이고 계열별로 나눠 커밋한다. 버전 같은 수치는 데이터 컴포넌트로 넣어 문서가 낡지 않게 한다 |
| 공식 소스 구조 변경 | 어댑터를 서로 격리하고, 실패하면 마지막 정상 데이터를 유지하며 이슈를 자동으로 연다. fixture 테스트로 잡는다 |
| 일부 배포판은 기계가 읽을 수 있는 소스가 없음(elementary, PCLinuxOS 등) | `official-page` 전략과 수동 버전 관리를 쓰고, 오래되면 표시한다 |
| 로고 상표 | 공식 파일을 수정하지 않고 쓰며, 출처와 정책 URL을 기록하고 크레딧과 삭제 요청 창구를 둔다 |
| 한국어 검색 품질(Pagefind는 한국어 어간 처리를 지원하지 않음) | 검색어에서 조사를 제거하고, 로마자·영문 별칭을 `data-pagefind-meta`로 넣는다 |
| Astro CSP의 제약 | Prism을 쓰고 인라인 `style` 속성을 금지한다. `frame-ancestors`는 `vercel.json` 헤더로 보낸다 |
| 위치 정보와 개인정보보호법 | 위치 정보를 기록하지 않고 `no-store`로 응답하며, `/about`에 처리 방식을 고지한다. 브라우저 Geolocation API는 쓰지 않는다 |
