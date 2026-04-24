# Contributing

Thanks for your interest in PlaylistTransfer.

This project is still in the validation phase, so the contribution process is intentionally lightweight.

## Ground rules

- Keep all documentation and code comments in English.
- Prefer small, focused changes over broad refactors.
- Preserve the current goal of the repo: validate feasibility before optimizing for scale.
- Avoid introducing product complexity that depends on unvalidated API assumptions.

## Development workflow

1. Install dependencies with `npm install`.
2. Run type checks with `npm run check`.
3. Use `npm run transfer:dry` for local validation when credentials are available.
4. Document any new assumptions in `docs/` if they affect product or architecture decisions.

## Scope guidance

Good early contributions:

- matching improvements
- reporting improvements
- developer experience and setup improvements
- documentation clarity
- API validation notes backed by primary sources

Changes to avoid for now:

- premature UI polish
- payment integration
- ads integration
- extra providers before the main route is proven

## Pull requests

When opening a pull request, please include:

- what changed
- why it changed
- how it was tested
- any open risks or assumptions
