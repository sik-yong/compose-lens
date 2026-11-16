# Compose Lens

**한국어** | [English](README.en.md)

**Docker Compose 파일의 구조를 브라우저에서 한눈에.**

Compose Lens에 `compose.yaml`을 붙여넣거나 끌어다 놓으면 서비스·네트워크·볼륨을 그래프로 보여 줄 예정입니다. 설정 문제를 알려 주고, README에 바로 넣을 수 있는 Mermaid 다이어그램도 내보낼 수 있게 할 계획입니다.

> **상태: pre-alpha, 아직 사용할 수 없습니다.** v0.1.0을 구현하고 있습니다. 아래 내용은 모두 예정된 동작입니다. 설계는 [PRD](docs/PRD.md)와 [support matrix](docs/support-matrix.md)(영문)에 있으며 계속 검토 중입니다.

## 왜 만드나요

서비스가 몇 개만 넘어가도 YAML만으로는 구조를 읽기 어렵습니다. Compose Lens는 **정확성을 가장 먼저** 생각합니다.

- 파일에 실제로 설정된 것만 말합니다. `depends_on`은 시작 순서로 보여 주고, 트래픽으로 표현하지 않습니다. 같은 네트워크에 있다는 것은 "같은 네트워크에 있음"이지 "서로 통신함"이 아닙니다.
- 추측하지 않습니다. 해석되지 않은 `${VARIABLES}`, 외부 리소스, 지원하지 않는 필드는 조용히 채우거나 무시하지 않고 그렇다고 표시합니다.
- 무엇을 지원하고 무엇을 지원하지 않는지 [support matrix](docs/support-matrix.md)에 적어 둡니다.

## v0.1.0 예정 기능

- 파일 업로드 또는 붙여넣기로 Compose 파일 불러오기
- 인터랙티브 그래프: 서비스, 네트워크, named volume을 자동 배치하고 드래그·확대·축소 지원
- 서비스 상세 패널: 이미지, 빌드, 포트, 네트워크, 볼륨, 환경변수 키
- 진단:
  - 줄·열 정보가 있는 YAML 문법 오류
  - 존재하지 않는 서비스·네트워크·볼륨 참조
  - 호스트 포트 충돌 가능성
  - 지원하지 않는 필드
- Mermaid 내보내기

## 개인정보 (설계 목표)

- **로컬 처리:** 모든 처리는 브라우저 안에서만 이루어질 예정입니다. Compose 파일을 업로드하지 않으며, 외부 CDN·폰트·분석 도구를 불러오지 않습니다.
- **값 가리기:** `environment`와 `build.args`의 값은 모든 생성 결과에서 가립니다.
- **한계:** `command`, `entrypoint`, `labels`, `healthcheck.test`는 표시하지 않습니다. 이미지 이름이나 URL처럼 표시되는 값 안의 비밀 정보는 탐지를 보장하지 않습니다. 자세한 내용은 [마스킹 경계](docs/support-matrix.md#masking-boundary)를 참고하세요.

## 범위 밖

Docker Engine 연결, 컨테이너 상태·리소스 조회, 컨테이너 시작·중지, Kubernetes 매니페스트, 실제 네트워크 트래픽 추론.

## 로드맵

Markdown 문서 내보내기, PNG/SVG 내보내기 → 진단 확장 → CI용 CLI → Compose 비교 → `.env` 변수 치환, 여러 파일 병합, profiles → VS Code 확장

## 프로젝트 구조

```
apps/web/        React 웹앱
packages/core/   파서, 진단, 그래프·Mermaid 변환 (UI 의존성 없음)
examples/        예제 Compose 파일
docs/            PRD, support matrix, 검증 기록
```

## 개발

Node.js 22.12 이상, 24, 26 이상이 필요합니다.

```sh
npm install
npm run dev     # 웹앱 실행
npm run check   # 모든 워크스페이스의 타입 검사, 테스트, 빌드
```

## 기여

이슈와 토론을 환영합니다. 기여 가이드는 v0.1.0 전에 추가할 예정입니다.

## 라이선스

[MIT](LICENSE)
