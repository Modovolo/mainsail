# Scaffold Prompt DB

Use this prompt with an LLM to implement DB parity.

## Prompt Template

```text
Implement DB functionality in <target repo/path> to match <source repo/path> exactly.

Constraints:
- Follow FEATURE_CONTRACT_DB_V1.md exactly.
- Preserve schema, constraints, and index intent.
- Preserve transaction and concurrency behavior.
- Keep migration path safe and reversible.
- Add tests for all cases in TEST_MATRIX_DB.md.

Deliverables:
1. Schema/migration code changes with file list.
2. Data access layer updates with file list.
3. Test changes with file list.
4. Migration notes in MIGRATION_GUIDE_DB.md.
5. Confirmation checklist against PARITY_CHECKLIST_DB.md.

Non-goals:
- No unrelated model refactors.
- No changing contract semantics without version bump.
```
