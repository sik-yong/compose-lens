# Contributing to Compose Lens

Thanks for your interest! Issues and pull requests are welcome in English or Korean (한국어도 환영합니다).

## Principles

Every change should keep these true. They are what makes the tool trustworthy.

1. **Accurate, not guessed.** Only state what the Compose file configures. If something can't be determined (a variable, an external resource, an unsupported field), say so with a diagnostic instead of guessing or ignoring it.
2. **The support matrix is the contract.** [docs/support-matrix.md](docs/support-matrix.md) must match the behavior. Update it in the same pull request as the code.
3. **Local only.** The web app makes no network requests at runtime and loads no third-party resources.
4. **Secrets stay hidden.** Values of `environment` and `build.args` never appear in any output, including diagnostics. Diagnostic messages never quote input values.
5. **Input is data.** Names from the file are rendered as text only and never become ids, HTML, or Mermaid syntax.

## Setup

Requires Node.js 22.12+, 24, or 26+.

```sh
npm install
npm run dev     # web app at http://localhost:5173
npm run check   # typecheck, test, and build everything (what CI runs)
```

## Layout

- `packages/core` — parsing, normalization, checks, graph and Mermaid conversion. No DOM or React. Most changes belong here.
- `apps/web` — the React UI.
- `examples/` — sample Compose files written for this project.

## Tests

- Unit tests live in `packages/core/test`.
- **Golden fixtures** live in `packages/core/test/fixtures/<case>/`: a `compose.yaml` and the `expected.json` model, graph, and diagnostics. To add or update one:

  ```sh
  cd packages/core
  UPDATE_FIXTURES=1 npx vitest run fixtures
  ```

  Then **review the `expected.json` diff against the Compose Specification** before committing. A fixture that records wrong behavior is worse than none.
- Any value containing `S3CRET` in a fixture must never appear in output; the fixture test checks this automatically.

## Pull requests

- Keep each pull request focused on one change.
- Include tests for behavior changes and update the support matrix when coverage changes.
- Write commit messages in the imperative mood (`fix: reject empty mount modes`).
- Only add example files you wrote yourself or that are clearly licensed for redistribution.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
