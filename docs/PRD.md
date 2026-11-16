# Compose Lens — PRD v0.3

**프로젝트명:** Compose Lens
**유형:** 오픈소스 개발자 도구 (MIT)
**저장소:** https://github.com/sik-yong/compose-lens
**배포:** 무료 정적 웹앱 + GitHub
**운영:** GitHub Issues·PR 중심, 수익화 없음
**핵심 가치:** 정확한 분석 + 쉬운 시각화

> **v0.3.2:** v0.1 범위 축소 — 화면에 그래프가 나오는 최소 흐름(M1)을 먼저 만들고, 일부 정밀 규칙은 v0.1.1 이후로 연기 (§11).
>
> **v0.3.1:** Codex 재검토 P2·P3 8건 반영 (빈 networks 기본 연결, `${VAR+alt}`, 포트 pool 범위, 성공 종료 라벨, 표시·마스킹 경계 통일, 하위 키 규칙, 브라우저 smoke test, README 시제).
>
> **v0.3 변경:** Codex PRD 검토(P1~P3 10건) 반영 — 기본 네트워크·`network_mode`, 변수 치환 보류 규칙, 출력 이스케이프, 마스킹 경계, `depends_on` 방향·조건, 포트 충돌 판정, 볼륨 종류 구분, 자원 상한, fixture 기반 완료 기준, 필드별 지원 범위(`docs/support-matrix.md`).

## 1. 문제 정의

Compose 파일은 서비스가 늘어날수록 YAML만으로 구조를 파악하기 어렵고, 아키텍처 다이어그램과 인수인계 문서를 수작업으로 만들어야 한다. Compose Lens는 Compose YAML을 **정확하게** 분석해 이해하기 쉬운 구조도와 문서로 변환한다. 확정할 수 없는 것은 확정하지 않고 "알 수 없음"으로 표시한다.

## 2. 대상 사용자

Docker Compose를 쓰는 백엔드 개발자, DevOps 엔지니어, 홈랩 운영자, 프로젝트 인수인계 담당자.

## 3. 저장소 구조

```
compose-lens/
├── apps/web/             # React 웹앱 (Vite)
├── packages/core/        # 파서·정규화·진단·그래프·Mermaid 변환 (UI·DOM 의존성 없음)
├── examples/             # 사람이 읽는 예제 Compose 파일 (직접 작성)
├── packages/core/test/fixtures/  # 테스트 fixture (입력 + 기대 결과)
├── docs/                 # PRD, support matrix, 검증 기록
├── README.md · CONTRIBUTING.md · LICENSE
└── .github/workflows/ci.yml
```

- npm workspaces 모노레포.
- `packages/core`는 브라우저·Node 양쪽에서 동작한다 (향후 CLI·VS Code 확장 재사용).

## 4. v0.1.0 공개 목표

1. Compose 파일을 넣으면 구조도가 나온다.
2. 서비스·네트워크·볼륨 관계를 정확하게 설명한다.
3. Mermaid로 내보내 README에 붙일 수 있다.

+ README(지원 범위·스크린샷), GitHub Actions 테스트.

## 5. 기능 범위

### v0.1.0

- 입력: 파일 업로드(`compose.yaml`, `compose.yml`, `docker-compose.yml`, `docker-compose.yaml`) 및 붙여넣기
- 분석 대상 필드와 처리 수준은 **`docs/support-matrix.md`가 기준**이다. PRD와 충돌하면 support matrix를 고친 뒤 PRD를 맞춘다.
- 시각화: 서비스·네트워크·named volume 노드, 자동 레이아웃, 드래그·확대·축소, 노드 상세 패널
- 진단: 아래 §7 진단 체계
- Mermaid 내보내기
- 브라우저 내 로컬 처리 — 서버 전송 없음

### 로드맵 (우선순위 순)

Markdown 운영 문서 · PNG/SVG 내보내기 → 공개 포트 경고 등 진단 확장 → CLI(`packages/cli`) → Compose Diff → `.env`·변수 치환, 다중 파일 병합, profiles → VS Code 확장

### 제외

Docker Engine 연결, 컨테이너 상태·리소스 모니터링, 컨테이너 제어, 클라우드 자동 검색, Kubernetes YAML, 실제 네트워크 트래픽 추론.

## 6. 분석 규칙

기준 명세: [Compose Specification](https://docs.docker.com/reference/compose-file/) (2026-11 기준). 모든 판정은 **입력 파일 내부의 설정**에 대한 것이며 호스트·Docker Engine의 실제 상태는 확인하지 않는다.

### 6.1 네트워크

- `network_mode`가 없고 `networks`가 **생략됐거나 비어 있는**(`[]`, `{}`) 서비스는 **암묵적 `default` 네트워크**에 연결한다. 이런 서비스가 하나라도 있으면 `default` 노드를 그린다.
- 비어 있지 않은 `networks`를 명시한 서비스는 명시한 네트워크에만 연결한다 (`default`도 명시해야 연결).
- `network_mode`:
  - `none` — 네트워크 연결 없음.
  - `host` — 네트워크 노드에 연결하지 않고 "host network" 배지 표시.
  - `service:<name>` — 대상 서비스와 "shares network stack" 엣지. 대상이 없으면 참조 오류.
  - `container:<id>` — 외부 컨테이너로 표시, 존재 여부 확인 불가.
  - 그 외·변수 포함 값 — 미지원/미해결 경고, 해당 서비스의 네트워크 판정 보류.
- `networks`와 `network_mode`를 함께 쓰면 오류 (Compose에서 허용되지 않음).
- 같은 네트워크 공유는 **"설정상 같은 네트워크에 있음"**이다. "통신함"이나 "연결 성공 보장"으로 표현하지 않는다.
- `external: true` 네트워크는 "외부, 존재 확인 불가"로 구분한다. 최상위에 선언되지 않은 네트워크 참조는 오류.

### 6.2 depends_on

- 엣지 방향: **의존하는 서비스 → 의존 대상** (`web` → `db`, "web은 db 이후 시작"). Mermaid: `web -.->|starts after| db`.
- 조건별 라벨:
  - 짧은 형식 / `service_started` — "starts after" (준비 완료를 보장하지 않음)
  - `service_healthy` — "after healthy"
  - `service_completed_successfully` — "after successful completion" (필수 의존이면 대상이 실패 종료할 때 시작하지 않음. `required: false`면 경고 후 진행할 수 있음)
- `required: false` — 선택 의존으로 구분 표시. `restart: true` — 상세 패널에 표시.
- 통신 흐름으로 표현하지 않는다.

### 6.3 포트

- 짧은·긴 형식을 `{hostIp?, host, containerPort (단일|범위), protocol}`로 정규화한다. `host`는 세 종류다.
  - **fixed** — 고정 호스트 포트 또는 컨테이너 범위와 크기가 같은 호스트 범위 (`"8080:80"`, `"9090-9091:8080-8081"`): 해당 포트를 모두 점유.
  - **dynamic** — 호스트 포트 없음 (`"80"`): 임의 포트 할당. 고정 호스트 포트 80으로 해석하지 않는다.
  - **pool** — 단일 컨테이너 포트에 대한 호스트 범위 (`"8000-8010:80"`, 긴 형식 `published: "8000-8010"` + 단일 `target`): 범위 안의 **가용 포트 하나**를 할당. 범위 전체를 점유하지 않는다.
- **잠재 충돌** 판정: fixed끼리만, 같은 프로토콜 + 포트 겹침 + 호스트 IP 겹침(미지정은 모든 인터페이스로 간주). dynamic·pool·변수 포함 포트는 판정에서 제외한다 (pool과 fixed의 겹침 안내는 v0.1.1 이후).
- 긴 형식의 `name`, `app_protocol`은 표시만 하고, `mode`(`host`/`ingress`, Swarm 전용 의미)는 분석하지 않는다고 안내한다.
- 진단 문구는 "이 파일 안에서 충돌 가능"이며, 호스트의 실제 점유는 확인하지 않는다.
- profiles는 평가하지 않으므로 모든 서비스를 동시에 활성으로 가정한다 (support matrix에 명시).

### 6.4 볼륨

| 종류 | 판별 | 처리 |
|---|---|---|
| named | source가 이름 형식 (`/`, `.`, `~`로 시작하지 않음) 또는 `type: volume` + source | 최상위 `volumes` 선언 검증, 노드로 표시, 서비스 간 공유 관계 표시 |
| bind | source가 `/`, `./`, `../`, `~`로 시작 또는 `type: bind` | 서비스 속성으로만 표시, 참조 검증 안 함 |
| anonymous | target만 있음 (`/data`) 또는 `type: volume` + source 없음 | 서비스 속성으로만 표시, **서비스 간 공유로 합치지 않음** |
| tmpfs | `type: tmpfs` 또는 `tmpfs:` 필드 | 서비스 속성으로 표시 |
| 기타 (`npipe`, `cluster`, `image`) | `type` 값 | 미지원 경고 |

- `external: true` 볼륨은 "외부, 존재 확인 불가".

### 6.5 변수 치환

- v0.1은 치환하지 않는다. `.env`·환경을 읽지 않는다.
- `${VAR}`, `${VAR:-default}`, `${VAR-default}`, `${VAR:?err}`, `${VAR?err}`, `${VAR:+alt}`, `${VAR+alt}`, `$VAR`와 중첩 표현식(`${A:-${B}}`)을 감지한다. `$$`는 리터럴 `$`이므로 `$$VAR`는 변수가 아니다.
- 감지된 값은 **원문 표현식을 보존**하고 "미해결" 표시한다. 기본값이 있어도 확정하지 않는다.
- 미해결 값에 의존하는 판정(포트 충돌, 참조 검증, `network_mode` 해석 등)은 **보류**하고 그 사실을 진단으로 알린다. 오류로도, 정상으로도 단정하지 않는다.

### 6.6 미지원 구문

- 지원하지 않는 필드는 조용히 무시하지 않고 "분석하지 않음" 진단을 낸다.
- `include`, `extends`처럼 결과 구조를 바꾸는 필드는 "결과가 불완전할 수 있음" 경고.
- 분석 대상 객체(포트·네트워크·볼륨·`build`·`depends_on` 등)라도 **support matrix에 나열하지 않은 하위 키는 "분석하지 않음"**으로 안내한다. 해석에 영향을 주는 키는 관련 진단의 한계도 함께 알린다. *(v0.1.1 이후. v0.1.0은 support matrix의 알려진 한계로 안내)*
- `x-*` 확장 필드는 명세상 정상이므로 경고하지 않는다.
- YAML 앵커·별칭·병합 키(`<<`)는 지원한다 (§8.3 상한 적용).

## 7. 진단 체계

| 분류 | 심각도 | 예 |
|---|---|---|
| `yaml-syntax` | error | YAML 문법 오류 (줄·열) |
| `schema` | error | `services`가 맵이 아님, 필드 타입 오류, `networks`+`network_mode` 동시 사용 |
| `reference` | error | 없는 서비스·네트워크·named volume 참조 |
| `conflict` | warning | 호스트 포트 잠재 충돌 |
| `unresolved` | warning | 변수 치환 미해결로 판정 보류 |
| `unsupported` | warning/info | 미지원 필드, 결과가 불완전할 수 있음 |
| `unverifiable` | info | external 리소스, `container:` 대상 존재 확인 불가 |
| `limit` | error | 입력 크기·깊이·별칭·노드 수 상한 초과 |

- 진단은 위치(줄·열 또는 경로 `services.web.ports[0]`)와 코드를 가진다.
- YAML 문법 오류여도 입력 내용은 유지한다.

## 8. 보안·프라이버시

### 8.1 네트워크

- Compose 원문을 외부로 전송하지 않는다. 외부 CDN·폰트·분석 도구 미사용. 모든 리소스는 번들한다.

### 8.2 출력 안전

- 화면은 텍스트로만 렌더링한다 (`dangerouslySetInnerHTML`·HTML 라벨 금지).
- Mermaid는 **내부 생성 ID**(`svc_1`, `net_1`, `vol_1`)를 쓰고 라벨은 이스케이프한다 (따옴표·`<>`·줄바꿈 등). 입력에서 `click`·링크·`%%{init}%%` 지시문이 만들어질 수 없어야 한다.
- 향후 앱 안에서 Mermaid를 미리보기할 경우 `securityLevel: 'strict'`로 고정한다.

### 8.3 자원 상한

| 항목 | 상한 (초기값) | 초과 시 |
|---|---|---|
| 입력 크기 | 1 MiB | `limit` 오류, 파싱 안 함 |
| YAML 별칭 확장 (`maxAliasCount`) | 100 | `limit` 오류 |
| 순환 별칭 | 0 (거부) | `limit` 오류 |
| 중첩 깊이 | 64 | `limit` 오류 |
| 서비스 수 | 300 | `limit` 오류, 그래프 미생성 |
| 그래프 노드+엣지 | 3000 | `limit` 오류, 그래프 미생성 |
| 포트 매핑 수 (전체) | 5000 | `limit` 오류 |
| 표시 진단 수 | 500 | 초과분은 개수만 info로 안내 |

- 상한은 파싱뿐 아니라 정규화·그래프 변환 단계까지 적용한다. 입력을 코드로 실행하지 않는다.

### 8.4 마스킹

- 입력 편집창은 사용자가 입력한 원문을 그대로 보여준다.
- **생성 결과 전체**(상세 패널, 진단 메시지, Mermaid·향후 Markdown 내보내기, 콘솔 로그)에서:
  - `environment` 값과 `build.args` 값은 마스킹한다 (키만 표시).
  - `env_file`은 경로만 표시한다 (파일을 읽지 않음).
  - `secrets`·`configs`는 이름만 표시한다.
  - 진단 메시지는 값을 인용하지 않고 위치·키로 안내한다.
- **표시하지 않는 필드:** `command`, `entrypoint`, `labels`, `healthcheck.test` (비밀값이 흔히 들어가므로).
- **표시하지만 비밀 탐지를 보장하지 않는 값:** `image`, `build.context`, `build.dockerfile`, 경로, 리소스 이름. URL 형태 값의 사용자 정보(`scheme://user:pass@`) 가리기는 v0.1.1 이후 예정이다.
- README와 support matrix에 이 경계를 같은 문구로 명시한다.

## 9. 기술 스택

React + TypeScript + Vite, @xyflow/react, yaml, dagre, Tailwind CSS, Vitest, GitHub Actions, 정적 호스팅(GitHub Pages 등).

## 10. 라이선스

- 프로젝트: MIT.
- 의존성 라이선스는 공개 전 재확인 (@xyflow/react MIT, yaml ISC, dagre MIT 예상).
- 예제·fixture는 직접 작성한다.

## 11. 개발 단계

**원칙:** 핵심 가치("넣으면 구조도가 나온다")를 가장 먼저 화면에서 확인한다. 정밀 규칙은 그 위에 쌓는다.

| 단계 | 내용 | 상태 |
|---|---|---|
| M0 | 모노레포 기반: workspaces, TS 설정, CI | 완료 |
| M1 | **얇은 수직 슬라이스:** YAML 파싱·자원 상한·문법 오류 → 서비스·`depends_on`·네트워크(암묵적 `default`)·named volume·기본 포트 정규화 → React Flow 그래프·자동 레이아웃·상세 패널 | 완료 |
| M2 | 정확성: 참조 오류, fixed 포트 충돌, 볼륨 종류 구분, 변수 감지·판정 보류, `network_mode`, 마스킹, 미지원 필드 안내, fixture 테스트 | 완료 |
| M3 | Mermaid 내보내기, 예제, README 스크린샷, 수동 검증 기록 → v0.1.0 공개 | |

### v0.1.1 이후로 연기

v0.1.0에서는 아래를 구현하지 않고 support matrix에 **알려진 한계**로 적는다 (조용히 무시하는 것이 아니라 문서로 안내).

- pool 포트와 fixed 포트 겹침 info 안내 (pool은 v0.1.0에서도 충돌 판정에서 제외)
- URL 형태 값의 사용자 정보(`user:pass@`) 가리기
- support matrix에 없는 **하위 키**별 "분석하지 않음" 안내 (최상위·서비스 수준의 미지원 필드 안내는 v0.1.0에 포함)

### 검토 운영

Codex 검토의 P1은 즉시 반영한다. P2 이하는 v0.1.0 목표(§4)와 직접 관련된 것만 반영하고, 나머지는 GitHub Issues 백로그로 옮긴다.

## 12. v0.1.0 완료 기준

### 자동 (CI)

- **fixture 테스트:** support matrix의 "분석" 항목마다 `fixtures/<case>/compose.yaml` + 기대 그래프·진단(`expected.json`)이 있고 통과한다. 최소 포함:
  - 짧은·긴 형식 동등성 (ports, volumes, depends_on, networks)
  - 암묵적 `default` 네트워크 (생략·`[]`·`{}`), `network_mode` 각 값, `networks`+`network_mode` 오류
  - `depends_on` 방향과 세 조건, `required: false`
  - 포트: fixed / dynamic / pool 구분, 프로토콜 차이, 호스트 IP 차이, fixed 범위 겹침
  - 볼륨: named / bind / anonymous / tmpfs 구분, 익명 볼륨 비공유
  - 변수 치환: 모든 감지 형식과 중첩, `$$VAR` 비감지, 미해결 표시와 판정 보류
  - 미지원 필드(최상위·서비스 수준), `x-*` 무경고, 앵커·병합 키
  - YAML 문법 오류 vs 참조 오류 구분
- **보안 테스트:**
  - 마스킹: 비밀값 fixture의 값 문자열이 모든 생성 결과(그래프 데이터, 진단, Mermaid)에 나타나지 않는다.
  - 공격 입력: 별칭 폭탄, 순환 별칭, 과대 입력, 과도한 중첩이 `limit` 오류로 거부된다.
  - Mermaid 주입: 따옴표·줄바꿈·`click`·`%%{init}%%`가 담긴 이름·라벨이 구문을 만들지 않는다.
- core 테스트가 Node에서 통과하고, web 빌드가 성공한다.

### 수동 (`docs/verification.md`에 절차·결과 기록)

- **브라우저 smoke test** (최신 Chrome 기준, Firefox·Safari는 가능하면): 업로드·붙여넣기 → 진단·그래프·상세 패널 → Mermaid 내보내기(복사·파일 저장)가 동작한다.
- 내보낸 Mermaid가 GitHub Markdown에서 렌더링된다.
- 배포본에서 입력을 넣은 뒤 DevTools 네트워크 탭에 외부 요청이 없다.
- 3개 이상 서비스의 실사용 형태 예제가 시각화되고, 상세 패널에 포트·볼륨·네트워크가 누락 없이 나온다.
