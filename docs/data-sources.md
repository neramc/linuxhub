# 데이터 소스

Linuxhub의 버전, 파일, 체크섬, 미러 정보는 모두 각 프로젝트의 **공식** 소스에서 가져옵니다. 코드는 `scripts/sync/`에 있고, 배포판마다 소스 모듈이 하나씩 있습니다(`scripts/sync/sources/<slug>.ts`).

## 공통 규칙
- **식별**: User-Agent로 `LinuxhubBot/1.0 (+<site>/about/#bot)`를 보냅니다.
- **robots.txt**: 호스트마다 확인하고 캐시합니다. `Crawl-delay`를 지키며, 막힌 URL은 요청하지 않습니다.
- **요청 간격**: 같은 호스트에는 1초 이상 간격을 두고, 429·5xx만 백오프 후 재시도합니다. 서버가 `Retry-After`를 보내면 그만큼(최대 60초) 기다립니다.
- **재검증**: ETag와 If-Modified-Since로 바뀌지 않은 응답은 다시 받지 않습니다(GitHub Actions 캐시).
- **허용하는 출처**:
  - endoflife.date는 출시일, 지원 종료일, LTS 여부에만 씁니다.
  - 파일과 체크섬은 언제나 배포판 자체 서버에서 가져옵니다.
  - SourceForge는 공식 사이트가 링크하는 프로젝트만 씁니다(MD5만 제공).
- **DistroWatch는 사용하지 않습니다**(ADR-0008).
- **검증**: `bun run sync:validate`가 다음을 검사합니다.
  - 스키마
  - 공식 호스트 허용 목록(소스 모듈의 `hosts`)
  - 체크섬 길이와 중복

## 동등한 대우: 모든 배포판에 같은 기준
수록한 모든 배포판을 같은 파이프라인으로, 같은 주기와 같은 깊이로 동기화합니다. 어느 배포판도 더 자세히 다루거나 빼놓지 않습니다.
- **릴리스:**
  - 지원이 끝나지 않은 모든 릴리스 계열의 최신 버전을 가져옵니다.
  - 현재 베타·RC는 공식 다운로드 인프라에 이미지가 있을 때만 넣습니다.
  - 롤링 배포판은 공식 최신 스냅샷을 가져옵니다(최대 2개).
  - 출시일과 지원 종료일은 공식 출처를 먼저 쓰고, 없으면 endoflife.date를 씁니다.
- **에디션:**
  - 공식 다운로드 페이지가 일반 사용자에게 내놓는 모든 에디션·플레이버·스핀을, 공식 아키텍처와 이미지 형식마다 모두 가져옵니다.
  - 모든 배포판에서 똑같이 빼는 것: 소스 미디어, 컨테이너 이미지, 델타·업데이트 이미지, 두 번째 이후 디스크.
- **파일마다:**
  - 파일 이름, 공식 URL, 미러 루트 기준 경로, 크기를 적습니다.
  - 체크섬은 공식 원본 호스트의 체크섬 파일에서 가장 강한 것을 가져옵니다(sha512·sha256 > sha1 > md5).
  - 서명과 토렌트는 공개된 경우에 적습니다.
  - 체크섬을 공개하지 않는 프로젝트는 null로 두고, 그 이유를 소스 모듈에 적습니다.
- **미러:**
  - 공식 미러 목록에서 릴리스 이미지를 HTTPS로 제공하는 미러를 모두 가져옵니다. 국가는 항상, 좌표와 점수는 공식 목록에 있을 때만 적습니다.
  - SourceForge로만 배포하는 프로젝트는 그 공식 프로젝트의 SourceForge 미러망을 씁니다.
  - 리다이렉터나 CDN만 있는 프로젝트는 그 루트 하나를 적습니다.
  - 미러 루트에 파일 경로를 붙이면 언제나 그 파일이 됩니다.
- **공통 후처리(`run.ts`):**
  - 크기가 없는 파일은 이전 데이터에서 채우고, 없으면 공식 URL에 HEAD를 한 번 보냅니다.
  - 모든 미러에 최신 릴리스 파일로 HTTPS HEAD를 보냅니다. 404·410이 오거나 HTTPS로 응답하지 않으면 뺍니다.
  - robots.txt가 확인을 막거나 HEAD를 거부하는 미러는 공식 목록을 믿고 남깁니다.
- **다운로드 화면:**
  - 미러 데이터가 있는 모든 배포판에서 미러를 고를 수 있습니다.
  - 공식 링크가 리다이렉터나 SourceForge면 그 링크가 기본으로 선택되고, 아니면 가장 가까운 미러를 추천합니다(ADR-0004).

## 다운로드 전략
| 전략 | 의미 |
|---|---|
| `redirector` | 공식 CDN이나 리다이렉터가 가까운 서버를 고릅니다. 다운로드 버튼은 공식 URL을 그대로 씁니다 |
| `mirrors` | 공식 미러 목록이 있으면 방문자 위치로 순위를 매겨 추천합니다(`src/lib/mirrors.ts`). 목록이 없으면 공식 원본 서버를 씁니다 |
| `sourceforge` | 공식 SourceForge 프로젝트에서 받으며, SourceForge가 미러를 고릅니다 |
| `official-page` | 파일 링크를 자동화할 수 없어서(링크 만료, 봇 차단 등) 공식 다운로드 페이지로 안내합니다 |

## 오늘의 인기 배포판 (위키백과 조회수)
홈 맨 위 슬라이더의 순위입니다(ADR-0013). `src/data/popularity.json`에 저장합니다.
- **출처**: [Wikimedia Pageviews REST API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html)의 문서별 일간 조회수입니다. 영어 위키백과, 사람의 조회만(`agent=user`), 모든 접속 방식(`all-access`)을 셉니다. 조회수 데이터는 CC0입니다.
- **기준일**: 집계가 끝난 가장 최근 UTC 하루(보통 어제)입니다. 그날 데이터가 절반 넘는 문서에 아직 올라오지 않았으면 그 전날로 순위를 매깁니다. 전날 순위도 함께 저장합니다.
- **문서 매핑**: `scripts/sync/wikipedia-articles.ts`에서 편집자가 정합니다. 리다이렉트가 아닌 실제 문서 제목만 쓰고, 전용 문서가 없으면 `null`입니다. 카탈로그의 모든 배포판에 항목이 있어야 합니다(`bun run sync:validate`가 검사).
- **요청**: 문서마다 최근 9일 치를 한 번에 받습니다. 기준일 순위가 이미 있으면 요청하지 않습니다. 6시간마다 releases와 함께 실행하며, 10분 안에 받지 못한 문서는 실패로 셉니다.
- **개인정보**: 우리 사이트 방문자의 조회는 세지 않습니다. 쿠키나 분석 스크립트를 쓰지 않습니다.

## 로고
배포판 YAML의 `logo` 항목(출처, 라이선스, 상표 정책)과 About 페이지의 크레딧 표를 보세요.

## 배포판별 데이터 출처

<!-- sources:start -->

| 배포판 | 다운로드 전략 | 동기화 모듈 | 릴리스 데이터 출처(호스트) | 현재 최신 | 미러 목록 |
|---|---|---|---|---|---|
| antiX | sourceforge | — | — | — | — |
| Arch Linux | mirrors | ✓ | archlinux.org | 2026.10.01 | 363 (archlinux.org) |
| CachyOS | redirector | — | — | — | — |
| Debian | mirrors | ✓ | deb.debian.org, cdimage.debian.org, endoflife.date | 13.7 | 48 (mirror-master.debian.org) |
| deepin | mirrors | — | — | — | — |
| Devuan GNU+Linux | mirrors | — | — | — | — |
| elementary OS | official-page | — | — | — | — |
| EndeavourOS | mirrors | — | — | — | — |
| Fedora Linux | redirector | ✓ | fedoraproject.org, endoflife.date | 45-beta | — |
| Kali Linux | redirector | — | — | — | — |
| KDE neon | redirector | — | — | — | — |
| Kubuntu | mirrors | ✓ | endoflife.date, cdimage.ubuntu.com | 26.04.1 | — |
| Linux Lite | mirrors | — | — | — | — |
| Linux Mint | mirrors | ✓ | endoflife.date, pub.linuxmint.io | 22.3 | — |
| Lubuntu | mirrors | ✓ | endoflife.date, cdimage.ubuntu.com | 26.04.1 | — |
| Manjaro | redirector | — | — | — | — |
| MX Linux | sourceforge | — | — | — | — |
| ParrotOS | redirector | — | — | — | — |
| Peppermint OS | sourceforge | — | — | — | — |
| Pop!_OS | redirector | ✓ | api.pop-os.org, endoflife.date | 24.04 | — |
| Q4OS | sourceforge | — | — | — | — |
| Raspberry Pi OS | official-page | — | — | — | — |
| TUXEDO OS | official-page | — | — | — | — |
| Ubuntu | mirrors | ✓ | endoflife.date, releases.ubuntu.com | 26.04.1 | 298 (api.launchpad.net) |
| Ubuntu MATE | mirrors | ✓ | endoflife.date, cdimage.ubuntu.com | 24.04.5 | — |
| Xubuntu | mirrors | ✓ | endoflife.date, cdimage.ubuntu.com | 26.04.1 | — |
| Zorin OS | redirector | — | — | — | — |

_2026-10-03 기준, `bun run sync:docs`로 생성._

<!-- sources:end -->
