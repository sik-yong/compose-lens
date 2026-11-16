# Compose Lens — PRD v0.2 (오픈소스 전환)

**프로젝트명:** Compose Lens
**유형:** 오픈소스 개발자 도구 (MIT 라이선스 예정)
**배포:** 무료 정적 웹앱 + GitHub 저장소
**운영:** GitHub Issues·PR 중심, 수익화 없음
**핵심 가치:** 정확한 분석 + 쉬운 시각화

> v0.1 대비 변경: 수익화 항목 제거, 오픈소스 우선, 파서 코어 라이브러리 분리, MIT 라이선스, GitHub 공개 준비 반영.

## 1. 문제 정의

Compose 파일은 서비스가 늘어날수록 YAML만으로 구조를 파악하기 어렵고, 아키텍처 다이어그램과 인수인계 문서를 수작업으로 만들어야 한다. Compose Lens는 Compose YAML을 **정확하게** 분석해 이해하기 쉬운 구조도와 문서로 변환한다.

## 2. 대상 사용자

Docker Compose를 쓰는 백엔드 개발자, DevOps 엔지니어, 홈랩 운영자, 프로젝트 인수인계 담당자.

## 3. 저장소 구조

```
compose-lens/
├── apps/
│   └── web/              # React 웹앱 (Vite)
├── packages/
│   └── core/             # Compose 파서·검증·그래프 변환 (UI 의존성 없음)
├── examples/             # 예제 Compose 파일 (직접 작성, 재배포 가능)
├── docs/                 # 설계·지원 범위 문서
├── README.md
├── CONTRIBUTING.md
├── LICENSE               # MIT
└── .github/workflows/ci.yml
```

- npm workspaces 기반 모노레포.
- `packages/core`는 브라우저·Node 양쪽에서 동작해야 한다 (향후 CLI, VS Code 확장 재사용).
- `packages/core`는 React, DOM API에 의존하지 않는다.

## 4. v0.1.0 공개 목표

1. Compose 파일을 넣으면 구조도가 나온다.
2. 서비스·네트워크·볼륨 관계를 정확하게 설명한다.
3. Mermaid로 내보내 README에 붙일 수 있다.

+ 보기 좋은 README, 실제 스크린샷, GitHub Actions 테스트.

## 5. 기능 범위

### v0.1.0 (MVP)

- 파일 업로드 (`compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`) 및 YAML 붙여넣기
- `services`, `image`, `build`, `ports`, `networks`, `volumes`, `depends_on` 파싱 (짧은·긴 형식 모두)
- 서비스·네트워크·볼륨 노드와 관계 시각화, 자동 레이아웃, 드래그·확대·축소
- 노드 클릭 시 상세 패널
- 진단: YAML 문법 오류(줄·열)와 구성 문제(누락된 서비스·네트워크·볼륨 참조, 호스트 포트 충돌)를 구분해 표시
- 미지원 구문 명시적 경고
- **Mermaid 내보내기**
- 브라우저 내 로컬 처리 — 서버 전송 없음

### 이후 (로드맵, 우선순위 순)

- Markdown 운영 문서 생성, PNG/SVG 내보내기
- 진단 확장: 불필요한 공개 포트(`0.0.0.0` 바인딩) 경고 등
- CLI (`packages/cli`): CI에서 Mermaid·Markdown 자동 생성
- Compose 파일 비교(Diff)
- `.env` 변수 치환, 여러 파일 병합, profiles
- VS Code 확장

### 제외

Docker Engine 연결, 컨테이너 상태·리소스 모니터링, 컨테이너 제어, 클라우드 자동 검색, Kubernetes YAML, 실제 네트워크 트래픽 추론.

## 6. 정확성 원칙

- `depends_on`은 **시작 순서·조건**이다. 통신 흐름으로 표현하지 않는다 ("starts after" 점선).
- 같은 네트워크에 속한 것은 "통신 가능"이지 "통신함"이 아니다.
- 지원하지 않는 구문은 조용히 무시하지 않고 경고로 표시한다.
- README와 `docs/support-matrix.md`에 지원·미지원 문법을 명시한다. 이 문서가 프로젝트 신뢰도를 결정한다.

## 7. 보안·프라이버시

- Compose 원문을 외부로 전송하지 않는다. 외부 CDN·폰트·분석 도구 미사용.
- 환경변수 값은 기본 마스킹 (키만 표시).
- YAML 별칭 확장 횟수 제한 (billion laughs 방어). 입력을 코드로 실행하지 않는다.

## 8. 기술 스택

React + TypeScript + Vite, @xyflow/react, yaml, dagre, Tailwind CSS, Vitest, GitHub Actions, 정적 호스팅(GitHub Pages 등).

## 9. 라이선스 체크

- 프로젝트: MIT.
- 의존성 라이선스 확인 (@xyflow/react MIT, yaml ISC, dagre MIT 등) — 공개 전 재확인.
- 예제 Compose 파일은 직접 작성한다 (타 프로젝트 파일 복사 금지).

## 10. 개발 단계

1. 모노레포 기반: workspaces, TS 설정, LICENSE, CI 골격
2. `packages/core`: 파서·정규화·진단·그래프 변환 + Vitest
3. `apps/web`: 입력 UI, 그래프, 상세 패널, 진단 패널
4. Mermaid 내보내기
5. 공개 준비: README(스크린샷·지원 범위), CONTRIBUTING, 예제, CI 통과

## 11. v0.1.0 완료 기준

- 3개 이상 서비스 Compose 파일을 정상 파싱·시각화한다.
- `depends_on` 방향이 올바르다.
- 포트·볼륨·네트워크 정보가 상세 패널에 누락 없이 나타난다.
- YAML 오류와 참조 오류를 구분해 안내한다.
- Mermaid 출력이 GitHub에서 렌더링된다.
- 백엔드 없이 정적 배포된다.
- CI에서 core 테스트와 빌드가 통과한다.
