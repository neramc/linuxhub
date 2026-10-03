# 데이터 소스

이 문서는 3단계(동기화 파이프라인)에서 배포판마다 채운다. 각 행에 담을 내용은 다음과 같다.
- 공식 소스 URL과 유형(api, checksum-dir, sourceforge-rss, github-release, manual)
- 다운로드 전략(redirector, mirrors, sourceforge, official-page)
- 미러 목록 소스
- robots.txt 확인 결과와 확인 날짜
- 로고 출처, 라이선스, 상표 정책

## 공통 규칙
- User-Agent: `LinuxhubBot/1.0 (+<site>/about/#bot)`
- robots.txt를 확인하고 캐시하며, `Crawl-delay`를 지킨다.
- 같은 호스트에는 1초 이상 간격을 둔다.
- ETag와 If-Modified-Since를 쓴다.
- DistroWatch는 사용하지 않는다(ADR-0008).
