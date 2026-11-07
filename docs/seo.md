# 검색엔진 등록과 SEO 운영

Linuxhub(https://linuxhub.kro.kr)를 Google, 네이버, Bing, Daum에 등록하고 관리하는 방법입니다. 설계 결정은 `docs/decisions.md`의 ADR-0020에 있습니다.

## 사이트에 이미 들어 있는 것

| 항목 | 위치 | 내용 |
|---|---|---|
| 사이트맵 | `/sitemap.xml` (`src/pages/sitemap.xml.ts`) | 색인할 페이지를 한국어·영어 모두 담고, 페이지마다 hreflang 대응 주소와 마지막 변경일(lastmod)을 적는다. 아직 쓰지 않은 설치 가이드처럼 noindex인 페이지는 뺀다. `bun run check:links`가 빌드 결과와 맞는지 확인한다. |
| robots.txt | `/robots.txt` (`src/pages/robots.txt.ts`) | 모든 크롤러를 허용한다. `/api/`와 Pagefind 색인 조각(`/pagefind/`)만 뺀다. 사이트맵 주소와 Daum 확인 줄(설정했을 때)을 담는다. |
| RSS | `/rss.xml`, `/en/rss.xml` | 새 릴리스 소식. 네이버 서치어드바이저에 제출한다. |
| 소유 확인 태그 | 홈(`/`, `/en/`)의 `<head>` | 아래 환경 변수를 넣으면 생긴다. |
| 페이지 메타데이터 | `src/layouts/Base.astro` | 제목, 설명, canonical, hreflang(ko·en·x-default), `robots`(큰 이미지 미리보기 허용), Open Graph, favicon(svg, ico). |
| 구조화 데이터 | 각 페이지 | 홈: WebSite·Organization. 배포판: SoftwareApplication·BreadcrumbList. 설치 가이드와 리눅스 가이드: TechArticle. |
| 한글 이름 | 배포판 YAML의 `nameKo` | 한국어 배포판 페이지의 제목·설명·h1에 "우분투(Ubuntu)"처럼 한글 이름을 함께 쓴다. |
| IndexNow | `.github/workflows/indexnow.yml` | 프로덕션 배포가 끝날 때마다 바뀐 페이지를 IndexNow(Bing, 네이버 등이 공유)에 알린다. 키 파일은 `public/b26e3336ffae790029ee6eec37086deb.txt`. |

## 1. Vercel 환경 변수

Vercel → 프로젝트(linuxhub-001) → Settings → Environment Variables에서 **Production** 환경에 넣습니다. 값은 빌드할 때 읽으므로, 넣거나 바꾼 뒤에는 **다시 배포**해야 합니다(Deployments → 최신 프로덕션 배포 → ⋯ → Redeploy).

| 변수 | 값 | 어디서 받나 |
|---|---|---|
| `SITE_URL` | `https://linuxhub.kro.kr` | 정식 주소. canonical, sitemap, OG 이미지 주소에 쓰인다. 비우면 Vercel의 프로덕션 도메인을 쓰지만, 명시해 두는 편이 안전하다. |
| `GOOGLE_SITE_VERIFICATION` | 확인 코드 | Google Search Console → HTML 태그 방식 |
| `NAVER_SITE_VERIFICATION` | 확인 코드 | 네이버 서치어드바이저 → HTML 태그 방식 |
| `BING_SITE_VERIFICATION` | 확인 코드 | Bing Webmaster Tools → HTML Meta tag 방식(`msvalidate.01`) |
| `DAUM_WEBMASTER_TOOL` | `#DaumWebMasterTool:` 뒤의 값 | Daum 웹마스터도구 → robots.txt 인증 |

- 확인 코드는 `content="…"` 안의 값만 넣는다. 실수로 `<meta …>` 태그 전체를 붙여 넣어도 값만 뽑아 쓴다(`src/lib/seo.ts`).
- 이 값들은 HTML과 robots.txt에 공개되는 값이라 비밀이 아니다. 그래도 저장소가 아니라 Vercel에 두어, 코드를 바꾸지 않고 넣고 바꿀 수 있게 한다.
- GitHub 저장소 → Settings → Variables에 `SITE_URL`을 넣으면 IndexNow 워크플로도 그 주소를 쓴다(없으면 `https://linuxhub.kro.kr`).

## 2. Google Search Console

1. https://search.google.com/search-console 에서 **속성 추가**를 누른다.
   - **URL 접두어** 속성으로 `https://linuxhub.kro.kr/`를 넣는다.
   - kro.kr 도메인의 DNS를 직접 관리할 수 있다면 **도메인** 속성(DNS TXT 확인)이 http/https와 하위 도메인을 모두 묶어 더 좋다.
2. 확인 방법에서 **HTML 태그**를 고르고 `content` 값을 `GOOGLE_SITE_VERIFICATION`에 넣은 뒤 다시 배포하고 **확인**을 누른다.
3. **Sitemaps**에 `sitemap.xml`을 제출한다.
4. **URL 검사**에 홈, `/distros/`, 인기 배포판 몇 개를 넣고 **색인 생성 요청**을 누른다.

## 3. 네이버 서치어드바이저

1. https://searchadvisor.naver.com → **웹마스터 도구** → 사이트 등록에 `https://linuxhub.kro.kr`를 넣는다.
2. 소유 확인에서 **HTML 태그**를 고르고 `content` 값을 `NAVER_SITE_VERIFICATION`에 넣은 뒤 다시 배포하고 **소유확인**을 누른다.
3. **요청 → 사이트맵 제출**: `https://linuxhub.kro.kr/sitemap.xml`
4. **요청 → RSS 제출**: `https://linuxhub.kro.kr/rss.xml`
5. **검증 → robots.txt**로 수집이 허용되는지 확인한다. **요청 → 웹 페이지 수집**에 홈과 주요 배포판 페이지를 넣는다.
6. **검증 → 웹페이지 최적화**로 홈과 배포판 페이지 하나를 검사해 본다.
   - 제목, 설명, Open Graph, canonical, 모바일 viewport가 모두 들어 있어야 한다.

## 4. Bing Webmaster Tools (Bing, DuckDuckGo, Yahoo 등)

1. https://www.bing.com/webmasters 에서 **Google Search Console에서 가져오기**를 고르면 확인과 사이트맵이 한 번에 넘어온다.
2. 직접 추가할 때는 **HTML Meta tag** 방식의 `content` 값을 `BING_SITE_VERIFICATION`에 넣고 다시 배포한다. 그다음 **Sitemaps**에 `https://linuxhub.kro.kr/sitemap.xml`을 제출한다.
3. IndexNow는 따로 설정할 것이 없다. 키 파일이 사이트 루트에 있고, 배포마다 워크플로가 제출한다. 제출 내역은 **IndexNow** 메뉴에서 볼 수 있다.

## 5. Daum 웹마스터도구

1. https://webmaster.daum.net 에서 사이트 URL `https://linuxhub.kro.kr`과 PIN 코드를 정해 등록한다.
2. **robots.txt 인증**을 고르면 `#DaumWebMasterTool:…` 한 줄을 준다. 이 줄(또는 콜론 뒤의 값)을 `DAUM_WEBMASTER_TOOL`에 넣고 다시 배포한 뒤 인증한다.
3. 수집 요청에서 사이트맵 `https://linuxhub.kro.kr/sitemap.xml`을 제출한다.

## 6. Vercel에서 확인할 것

- **봇 차단(보안 확인 페이지):**
  - 2026-11-07 이 저장소의 작업 환경에서 `https://linuxhub.kro.kr/`와 `robots.txt`를 요청하자, Vercel이 실제 페이지 대신 보안 확인 페이지("Vercel Security Checkpoint", HTTP 429, `x-vercel-mitigated: challenge`)를 돌려주었다.
  - Vercel은 확인된 검색엔진 봇(Googlebot, Bingbot 등)은 통과시킨다. 하지만 네이버(Yeti)나 Daum 수집기가 그 목록에 없으면 수집이 막힐 수 있다.
  - Vercel → 프로젝트 → **Firewall**에서 Bot Protection(Bot Management)과 Attack Challenge Mode가 켜져 있는지 확인한다.
    - 켜져 있다면 끄거나, 검색엔진 수집기는 통과시키는 규칙을 둔다.
  - 등록한 뒤 네이버의 **robots.txt 검증**, **웹 페이지 수집**, Google의 **URL 검사(실제 URL 테스트)**가 성공하는지로 확인한다.
- **vercel.app 주소:**
  - `linuxhub-001.vercel.app`은 `linuxhub.kro.kr`로 **307(임시)** 리다이렉트된다.
  - Settings → Domains에서 이 도메인의 리다이렉트를 **308(영구)**로 바꾸면, 검색엔진이 두 주소를 정식 주소 하나로 합친다.
  - 모든 페이지의 canonical은 이미 정식 주소를 가리킨다.
- **미리보기 배포:** Vercel 인증 뒤에 있으므로(Deployment Protection) 검색엔진에 노출되지 않는다.

## 7. 확인 명령

```bash
SITE=https://linuxhub.kro.kr
curl -s $SITE/robots.txt
curl -s $SITE/sitemap.xml | head -12
curl -s $SITE/ | grep -o '<meta name="[a-z.0-9-]*verification[^>]*>\|<meta name="msvalidate.01"[^>]*>'
curl -s $SITE/b26e3336ffae790029ee6eec37086deb.txt
# 바뀐 페이지 목록만 보기(제출하지 않음)
SITE_URL=$SITE bun scripts/seo/indexnow.ts HEAD~5 HEAD --dry-run
```

## 8. 콘텐츠를 고칠 때

- **새 배포판:** 한국어로 흔히 쓰는 한글 이름이 있으면 YAML에 `nameKo`를 넣는다(예: `nameKo: 리눅스 민트`). 한국어 글에서도 라틴 이름을 그대로 쓰는 배포판(KDE neon, PCLinuxOS 등)은 비워 둔다.
- **제목과 설명:** 페이지마다 다르게, 그 페이지가 실제로 보여 주는 내용으로 쓴다. 배포판 페이지는 `distro.seoTitle`·`seoDescription`(i18n)이 최신 버전을 넣어 만든다.
- **검색 순위:** 검색엔진이 보는 것은 결국 내용이다. 순위를 위해 숨긴 텍스트나 키워드 나열을 넣지 않는다.
  - 공식 문서를 바탕으로 한 소개, 설치 가이드, 리눅스 가이드를 늘리는 것이 가장 효과적이다.
