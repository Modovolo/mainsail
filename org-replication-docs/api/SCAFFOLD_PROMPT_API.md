# Scaffold Prompt API

Use this prompt with an LLM to implement API parity.

## Prompt Template

```text
Implement API functionality in <target repo/path> to match <source repo/path> exactly.

Constraints:
- Follow FEATURE_CONTRACT_API_V1.md exactly.
- Do not change endpoint paths or error payload shape.
- Preserve auth and role behavior.
- Preserve pagination/sorting/filtering semantics.
- Add tests for all cases in TEST_MATRIX_API.md.

Deliverables:
1. Code changes with file list.
2. Test changes with file list.
3. Any migration notes in MIGRATION_GUIDE_API.md.
4. Confirmation checklist against PARITY_CHECKLIST_API.md.

Non-goals:
- No UI redesign.
- No unrelated refactors.
```
