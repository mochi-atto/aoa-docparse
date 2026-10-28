# AoA integration execution plan

Original worktree and database remain intact. Local-only parser/test/label fixes
and LOCAL_VERIFICATION.md have been copied into `.integration/role-hardening`.
No `.env` contents are copied into version control.

1. Audit and harden `codex/role-management-hardening` (based on c9456fd), including
   invitation expiry, identity handling, endpoint access, and offline regressions.
   Draft PR against `role-selection` includes the complete role-management feature
   and its fixes. This is the role-history review track, not a merge into main.
2. Build `codex/unified-parish-management` in `.integration/unified`, based on main.
   Incorporate Eric's related assets history and PR #1's related lifecycle history
   using ordinary local merges. Port the complete role foundation by file/function
   with compatibility edits; preserve shared parser fixes, split dashboard, user
   profile settings, work-order task links, and Eric's Assets code.
3. Enforce parish membership on all scoped endpoints. Policy: all active members
   read; Admin manages members, parish financial data, asset register and deletion;
   Admin/Editor create maintenance orders and attach/remove asset maintenance
   documents; Admin alone edits asset register values; technicians change only their own assigned orders; Admin can act on
   any parish order and alone closes reviewed work. Document for team review.
4. Use explicit additive migrations with dry-run/isolated schema tests. Do not run
   integration startup or migrations against the existing PostgreSQL database.
   Demo on separate ports and an isolated database. Keep original 8000/5173 running.
5. Run offline RBAC, lifecycle, asset/document, migration and parser suites; build,
   type checks, lint and browser checks. Record unavailable live services honestly.
6. Inspect staged diffs and secret safety, commit logical units and push new branches.
   Unified draft targets `work-order-lifecycle` so PR #1's changes are not duplicated.
   Merge #1 first after security review, then retarget unified PR to work-orders
   and review promotion of that branch to main separately. No shared merges or force pushes are authorized.

Known risks: role-selection and main have no common ancestor; existing unowned
parishes must not be silently assigned to the first user; SQLAlchemy create_all
does not migrate existing tables; asset local disk/manual-name catalog remain
development-only; live Editor/Viewer, SMTP, OCR and AI depend on available accounts
and configuration. Security must be enforced by backend, never UI alone.
