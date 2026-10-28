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
  - 모든 미러에 최신 릴리스 파일로 HTTPS HEAD를 보냅니다. 404·410이 오거나 아예 응답이 없으면(연결 오류, 시간 초과) 확인 실패입니다.
  - 아직 목록에 없는 미러는 확인을 통과해야 넣습니다. 이미 목록에 있는 미러는 3일 동안 남겨 두고, 그동안 확인에 계속 실패하면 뺍니다. 연결이 한 번 실패하거나, 리다이렉터가 오래된 서버로 보내거나, 새 릴리스를 아직 복사하는 중인 미러 때문에 데이터가 바뀌지 않게 하려는 것입니다. 실패가 시작된 날은 커밋하지 않는 `scripts/sync/.cache/`에 기록하고, 워크플로가 실행 사이에 이 캐시를 복원합니다.
  - robots.txt가 확인을 막거나 HEAD를 거부하는 미러는 공식 목록을 믿고 남깁니다.
- **검사:**
  - `bun run sync:validate`는 카탈로그의 모든 배포판에 `releases()`와 `mirrors()`를 갖춘 소스 모듈이 있는지 봅니다.
  - `scripts/sync/sources.test.ts`는 모든 소스를 기록해 둔 공식 응답(`scripts/sync/fixtures/`, `bun scripts/sync/record.ts`)으로 네트워크 없이 다시 실행해, 같은 결과가 나오는지 확인합니다.
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

| 배포판 | 다운로드 전략 | 동기화 모듈 | 릴리스 데이터 출처(호스트) | 현재 최신 | 미러 목록 | 위키백과 문서(인기 순위) |
|---|---|---|---|---|---|---|
| AlmaLinux | redirector | ✓ | almalinux.org, wiki.almalinux.org | 10.2 | 321 (mirrors.almalinux.org) | AlmaLinux |
| Alpine Linux | redirector | ✓ | alpinelinux.org, dl-cdn.alpinelinux.org | 3.24.3 | 92 (mirrors.alpinelinux.org) | Alpine Linux |
| antiX | sourceforge | ✓ | — | — | — | AntiX |
| Arch Linux | mirrors | ✓ | archlinux.org, geo.mirror.pkgbuild.com | 2026.10.01 | 410 (archlinux.org) | Arch Linux |
| Bazzite | redirector | ✓ | bazzite.gg, ghcr.io | 44.20261026 | 1 (bazzite.gg) | Bazzite (operating system) |
| Bodhi Linux | sourceforge | ✓ | www.bodhilinux.com, sourceforge.net | 7.0.0 | 1 (sourceforge.net) | Bodhi Linux |
| CachyOS | redirector | ✓ | cachyos.org, mirror.cachyos.org | 260809 | 27 (cachyos.org, raw.githubusercontent.com) | CachyOS |
| CentOS Stream | redirector | ✓ | www.centos.org, endoflife.date | 10 | 80 (mirrormanager.fedoraproject.org) | CentOS Stream |
| Debian | mirrors | ✓ | www.debian.org | 13.7 | 80 (mirror-master.debian.org) | Debian |
| deepin | mirrors | ✓ | www.deepin.org, cdimage.deepin.com | 25.2.0 | 36 (www.deepin.org) | Deepin |
| Devuan GNU+Linux | mirrors | ✓ | www.devuan.org, files.devuan.org, endoflife.date | 6.1.1 | 26 (www.devuan.org) | Devuan |
| elementary OS | official-page | ✓ | elementary.io, blog.elementary.io | 8.1.1 | 1 (elementary.io) | Elementary OS |
| EndeavourOS | mirrors | ✓ | endeavouros.com, mirror.alpix.eu | 2026.08.15 | 26 (endeavouros.com) | EndeavourOS |
| Fedora Linux | redirector | ✓ | fedoraproject.org, bodhi.fedoraproject.org, torrent.fedoraproject.org, endoflife.date | 44 | 122 (mirrormanager.fedoraproject.org) | Fedora Linux |
| Garuda Linux | redirector | ✓ | garudalinux.org, iso.builds.garudalinux.org, forum.garudalinux.org | 260819 | 1 (garudalinux.org) | Garuda Linux |
| Gentoo Linux | mirrors | ✓ | www.gentoo.org | 20261025 | 129 (api.gentoo.org) | Gentoo Linux |
| Kali Linux | redirector | ✓ | www.kali.org, kali.download | 2026.3 | 78 (www.kali.org, cdimage.kali.org) | Kali Linux |
| KDE neon | redirector | ✓ | neon.kde.org, files.kde.org | 2026.10.25 | 30 (neon.kde.org, files.kde.org) | KDE neon |
| Kubuntu | mirrors | ✓ | kubuntu.org, ubuntu.com, cdimage.ubuntu.com | 26.10 | 1 (kubuntu.org) | Kubuntu |
| Linux Lite | mirrors | ✓ | www.linuxliteos.com, repo.linuxliteos.com | 8.0 | 9 (mirrors.linuxliteos.com) | Linux Lite |
| Linux Mint | mirrors | ✓ | www.linuxmint.com, pub.linuxmint.io | 22.3 | 152 (www.linuxmint.com) | Linux Mint |
| Lubuntu | mirrors | ✓ | cdimage.ubuntu.com, ubuntu.com, documentation.ubuntu.com | 26.10 | 1 (cdimage.ubuntu.com) | Lubuntu |
| Mageia | mirrors | ✓ | www.mageia.org, endoflife.date | 10 | 31 (www.mageia.org, endoflife.date, mirrors.mageia.org) | Mageia |
| Manjaro | redirector | ✓ | manjaro.org | 26.1.0 | 1 (manjaro.org) | Manjaro |
| MX Linux | sourceforge | ✓ | sourceforge.net, rsync-mxlinux.org, endoflife.date, l2.mxrepo.com | 25.3 | 18 (rsync-mxlinux.org) | MX Linux |
| NixOS | redirector | ✓ | nixos.org, channels.nixos.org, endoflife.date | 26.05 | 1 (nixos.org) | NixOS |
| Nobara | redirector | ✓ | nobaraproject.org | 44 | 1 (nobaraproject.org) | Nobara (operating system) |
| OpenMandriva Lx | redirector | ✓ | www.openmandriva.org, abf-downloads.openmandriva.org, mirror.openmandriva.org, wiki.openmandriva.org | 26.09 | 11 (www.openmandriva.org, mirror.openmandriva.org) | OpenMandriva Lx |
| openSUSE | redirector | ✓ | get.opensuse.org, endoflife.date | 20261026 | 40 (mirrors.opensuse.org, get.opensuse.org, endoflife.date) | OpenSUSE |
| Oracle Linux | redirector | ✓ | yum.oracle.com, linux.oracle.com, endoflife.date | 10.2 | 1 (yum.oracle.com) | Oracle Linux |
| ParrotOS | redirector | ✓ | parrotsec.org | 7.4 | 38 (parrotsec.org) | Parrot OS |
| PCLinuxOS | mirrors | ✓ | ftp.nluug.nl | 2026.10 | 8 (ftp.nluug.nl) | PCLinuxOS |
| Peppermint OS | sourceforge | ✓ | peppermintos.com, sourceforge.net | 2026-07-09 | 1 (sourceforge.net) | Peppermint OS |
| Pop!_OS | redirector | ✓ | system76.com, api.pop-os.org, endoflife.date | 24.04 | 1 (system76.com) | Pop!_OS |
| Puppy Linux | mirrors | ✓ | forum.puppylinux.com, sourceforge.net, ftp.nluug.nl | 13 | 3 (puppylinux-woof-ce.github.io) | Puppy Linux |
| Q4OS | sourceforge | ✓ | www.q4os.org, sourceforge.net | 6.10 | 2 (www.q4os.org) | Q4OS |
| Qubes OS | mirrors | ✓ | doc.qubes-os.org, www.qubes-os.org, ftp.qubes-os.org | 4.3.2 | 26 (www.qubes-os.org) | Qubes OS |
| Raspberry Pi OS | official-page | ✓ | github.com, deb.debian.org | 2026-10-06 | 1 (downloads.raspberrypi.com) | Raspberry Pi OS |
| Rocky Linux | redirector | ✓ | rockylinux.org, docs.rockylinux.org | 10.2 | 146 (mirrors.rockylinux.org) | Rocky Linux |
| Slackware | mirrors | ✓ | endoflife.date, mirrors.slackware.com | 15.0 | 24 (mirrors.slackware.com) | Slackware |
| Solus | mirrors | ✓ | getsol.us | 4.9 | 1 (getsol.us) | Solus (operating system) |
| SparkyLinux | sourceforge | ✓ | sparkylinux.org, repo.sparkylinux.org, wiki.sparkylinux.org, sourceforge.net | 8.4 | 1 (sourceforge.net) | SparkyLinux |
| Tails | redirector | ✓ | tails.net | 7.15.1 | 20 (download.tails.net) | Tails (operating system) |
| TUXEDO OS | mirrors | ✓ | os.tuxedocomputers.com | 2026.10.19 | 1 (os.tuxedocomputers.com) | — |
| Ubuntu | mirrors | ✓ | ubuntu.com, releases.ubuntu.com, cdimage.ubuntu.com | 26.10 | 292 (api.launchpad.net) | Ubuntu |
| Ubuntu MATE | mirrors | ✓ | ubuntu-mate.org, ubuntu.com, cdimage.ubuntu.com | 26.10 | 1 (ubuntu-mate.org) | Ubuntu MATE |
| Vanilla OS | redirector | ✓ | info.vanillaos.org, vanillaos.org | 3 | 1 (info.vanillaos.org) | — |
| Void Linux | mirrors | ✓ | voidlinux.org, repo-default.voidlinux.org | 20250202 | 31 (xmirror.voidlinux.org) | Void Linux |
| Xubuntu | mirrors | ✓ | xubuntu.org, ubuntu.com, cdimage.ubuntu.com | 26.10 | 2 (xubuntu.org) | Xubuntu |
| Zorin OS | mirrors | ✓ | help.zorin.com, zorin.com, mirrors.edge.kernel.org, blog.zorin.com | 18.1 | 38 (zorin.com) | Zorin OS |

_2026-10-28 기준, `bun run sync:docs`로 생성._

<!-- sources:end -->
