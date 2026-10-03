# 배포 런북 (Vercel)

## 구성 요약

| 항목 | 값 |
|---|---|
| 호스팅 | Vercel. 프레임워크 프리셋은 Astro이고, `vercel.json`에 설정되어 있습니다 |
| 설치 / 빌드 | `bun install --frozen-lockfile` / `bun run build` (Astro + Pagefind + sitemap) |
| 출력 | 정적 페이지 전체(`.vercel/output/static`)와 서버 함수 1개(`/api/geo`, `_render.func`) |
| 함수 리전 | `icn1`(서울)로, `vercel.json`의 `regions`에 지정합니다 |
| 프로덕션 브랜치 | `main`. 그 밖의 브랜치와 PR은 프리뷰로 배포됩니다 |
| 데이터 갱신 | `.github/workflows/sync.yml`이 `main`에 커밋하면 Vercel이 자동으로 다시 배포합니다 |

## 처음 한 번 설정

1. **Vercel 프로젝트 만들기**
   - Vercel 대시보드에서 **Add New → Project**를 누르고 GitHub의 `neramc/linuxhub`를 가져옵니다.
   - Framework Preset이 **Astro**로 잡히는지 확인합니다. 빌드 설정은 `vercel.json`이 덮어쓰므로 바꾸지 않아도 됩니다.
   - Root Directory는 저장소 루트로 둡니다.
2. **환경 변수**(Production, Preview)
   - `SITE_URL`: 사이트의 정식 주소(예: `https://linuxhub.example`). canonical, hreflang, sitemap, OG 이미지 URL에 쓰입니다. 비워 두면 Vercel이 주는 프로덕션 도메인(`VERCEL_PROJECT_PRODUCTION_URL`)을 씁니다.
3. **도메인**: Project → Settings → Domains에서 연결합니다. 연결한 뒤 `SITE_URL`도 그 주소로 바꿉니다.
4. **GitHub 저장소 설정**
   - **Settings → Actions → General → Workflow permissions**를 **Read and write**로 바꿉니다. 동기화 워크플로가 데이터를 커밋하고 이슈를 열려면 필요합니다.
   - 선택 사항으로 **Variables**에 `SITE_URL`을 넣으면 동기화 봇의 User-Agent에 사이트 주소가 들어갑니다.
   - 선택 사항으로 **Secrets**에 `VERCEL_DEPLOY_HOOK`을 넣습니다.
     - Vercel의 Settings → Git → Deploy Hooks에서 만든 URL입니다.
     - 봇 커밋으로 배포가 시작되지 않는 경우에 대비한 장치입니다. Hobby 플랜에서 비공개 저장소의 봇 커밋은 배포가 막힐 수 있습니다.
   - **Settings → Branches**에서 `main`에 보호 규칙을 걸 때는 `github-actions[bot]`의 푸시를 허용해야 합니다.
5. **이슈 라벨**: `sync-failure` 라벨을 만들어 둡니다. 없으면 GitHub이 이슈를 만들 때 자동으로 생성합니다.

## 배포 전 확인

```bash
bun install
bun run lint && bun run check && bun run test
bun run sync:validate && bun scripts/validate-catalog.ts
bun run build
bun run test:e2e        # dist/를 serve.ts로 띄워 Playwright와 axe를 실행합니다
```

## 배포 후 스모크 테스트

```bash
SITE=https://<도메인>
curl -sI $SITE/ | grep -i -E "content-security-policy|strict-transport|x-frame"
curl -s $SITE/api/geo                      # {"cc":"KR","lat":…,"lon":…}, Cache-Control: private, no-store
curl -sI $SITE/distros/fedora/ | head -1   # 200
curl -s $SITE/sitemap-index.xml | head -3
curl -s $SITE/rss.xml | head -5
curl -sI $SITE/og/fedora.png | grep -i content-type   # image/png
```

브라우저에서도 다음을 확인합니다.
- 다운로드 패널에서 미러가 추천되는지(Arch, Ubuntu, Debian)
- 검색(Ctrl+K)이 동작하는지
- 라이트/다크 전환이 되는지

## 운영

- **데이터 동기화**: Actions의 **Data sync**가 6시간마다(미러는 하루 한 번) 실행됩니다.
  - **Run workflow**로 수동 실행하면서 `kind`와 `only`를 지정할 수 있습니다.
  - 같은 소스가 하루 넘게 계속 실패하면 `Data sync: failing sources` 이슈가 열리고, 모두 복구되면 자동으로 닫힙니다.
- **롤백**: Vercel 대시보드에서 이전 배포를 **Promote to Production**합니다. 데이터를 되돌릴 때는 해당 `chore(data): sync …` 커밋을 revert합니다.
- **크론 비활성화 주의**: 공개 저장소에서 60일 동안 활동이 없으면 GitHub이 예약 워크플로를 끕니다. 데이터 커밋이 보통 그보다 자주 생기지만, 꺼지면 Actions 화면에서 다시 켭니다.
- **Hobby 플랜**: 비상업적 용도만 허용합니다. 상업적으로 운영하려면 Pro 플랜이 필요합니다.
