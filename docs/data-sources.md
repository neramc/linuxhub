# 데이터 소스

Linuxhub의 버전, 파일, 체크섬, 미러 정보는 모두 각 프로젝트의 **공식** 소스에서 가져옵니다. 코드는 `scripts/sync/`에 있고, 배포판마다 소스 모듈이 하나씩 있습니다(`scripts/sync/sources/<slug>.ts`).

## 공통 규칙
- **식별**: User-Agent로 `LinuxhubBot/1.0 (+<site>/about/#bot)`를 보냅니다.
- **robots.txt**: 호스트마다 확인하고 캐시합니다. `Crawl-delay`를 지키며, 막힌 URL은 요청하지 않습니다.
- **요청 간격**: 같은 호스트에는 1초 이상 간격을 두고, 429·5xx만 백오프 후 재시도합니다.
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

## 다운로드 전략
| 전략 | 의미 |
|---|---|
| `redirector` | 공식 CDN이나 리다이렉터가 가까운 서버를 고릅니다. 다운로드 버튼은 공식 URL을 그대로 씁니다 |
| `mirrors` | 공식 미러 목록이 있으면 방문자 위치로 순위를 매겨 추천합니다(`src/lib/mirrors.ts`). 목록이 없으면 공식 원본 서버를 씁니다 |
| `sourceforge` | 공식 SourceForge 프로젝트에서 받으며, SourceForge가 미러를 고릅니다 |
| `official-page` | 파일 링크를 자동화할 수 없어서(링크 만료, 봇 차단 등) 공식 다운로드 페이지로 안내합니다 |

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
