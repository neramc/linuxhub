import type { DictionaryShape } from "./en";

/** 한국어 UI 문자열. en.ts와 키가 정확히 같아야 합니다(타입으로 강제). */
export const ko: DictionaryShape = {
  site: {
    name: "Linuxhub",
    tagline: "나에게 맞는 리눅스를 찾고, 내려받고, 설치하기",
    description:
      "인기 리눅스 배포판을 한눈에 비교하고, 가장 가까운 공식 미러에서 내려받고, 단계별 설치 가이드를 따라 설치하세요.",
  },
  nav: {
    home: "홈",
    distros: "배포판",
    learn: "리눅스 가이드",
    finder: "배포판 찾기",
    family: "계보",
    releases: "릴리스 소식",
    compare: "비교",
    about: "소개",
    skipToContent: "본문으로 건너뛰기",
    mainMenu: "주 메뉴",
    primary: "주요 탐색",
  },
  search: {
    open: "검색",
    placeholder: "배포판과 가이드 검색",
    shortcut: "Ctrl K",
    close: "검색 닫기",
    noResults: "“{query}”에 대한 결과가 없습니다",
    loading: "검색 중…",
    hint: "배포판 이름, 데스크톱 환경, 주제를 입력해 보세요.",
    results: "결과 {count}개",
  },
  theme: {
    label: "화면 스타일",
    system: "시스템 설정 따르기",
    light: "밝은 스타일",
    dark: "어두운 스타일",
  },
  language: {
    label: "언어",
  },
  footer: {
    about: "Linuxhub 소개",
    data: "릴리스 정보는 공식 소스에서 자동으로 갱신됩니다.",
    trademarks:
      "배포판 이름과 로고는 각 소유자의 상표이며, 해당 프로젝트를 알리는 용도로만 사용합니다.",
    license: "글은 CC BY-SA 4.0, 코드는 MIT 라이선스를 따릅니다.",
    rss: "릴리스 피드 (RSS)",
    source: "소스 코드",
  },
  common: {
    loading: "불러오는 중…",
    copy: "복사",
    copied: "복사됨",
    close: "닫기",
    more: "더 보기",
    learnMore: "자세히 보기",
    officialSite: "공식 웹사이트",
    externalLink: "(외부 사이트로 이동)",
    lastChecked: "{time} 확인",
    updated: "{date} 업데이트",
    backToTop: "맨 위로",
  },
  notFound: {
    title: "페이지를 찾을 수 없습니다",
    description: "찾으시는 페이지가 없거나 다른 곳으로 옮겨졌습니다.",
    home: "홈으로 가기",
  },
};
