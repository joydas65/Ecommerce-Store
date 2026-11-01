# Vercel release and recovery

This repository deploys the **simulated demo**, not the live merchant integration. `vercel.json` runs lint and Jest before a Next.js build explicitly using `NEXT_PUBLIC_COMMERCE_MODE=demo`. Preview and production deployments of this public portfolio project are intended to be publicly accessible. No merchant credentials, Vercel deployment token, or protection-bypass secret are supplied to the browser workflow.

## Project and configuration

- GitHub repository: `joydas65/Ecommerce-Store`
- Vercel project: `joys-store`
- Project ID: `prj_lZSwq0GJzgZ89G01fTPPlYMCjdz2`
- Production branch: `main`
- Runtime: Node.js 24.x on Vercel; the local/CI patch version is pinned in `.nvmrc`.
- Repository linking metadata lives in ignored `.vercel/project.json`; local environment files are excluded from uploads by `.vercelignore`.

The first public deployment URL and release verification are recorded after deployment succeeds. Creating a project or committing this workflow alone does not prove that remote checks or domain promotion have run.

Set these GitHub repository **variables**, which are identifiers rather than credentials:

| Variable | Value |
| --- | --- |
| `VERCEL_PROJECT_ID` | `prj_lZSwq0GJzgZ89G01fTPPlYMCjdz2` |
| `VERCEL_PROJECT_NAME` | `joys-store` |

In Vercel, connect this GitHub repository, enable repository dispatch events, and keep production domain auto-assignment on. Under Deployment Checks, require both of these GitHub checks for **production**:

| External check name | Purpose |
| --- | --- |
| `verify` | Lint, Jest, release-event validation, and local production-browser tests |
| `Vercel - Ecommerce-Store: production browser checks` | Purchase/recovery tests and revision identity on the deployed build |

Use `deployment-alias` as the blocking stage. The deployed-browser check requires `deployment-url`; the local CI check can require `build-ready`. These external settings are required: a workflow file alone does not enable release gating. Keep their names synchronized with the workflows when renaming jobs.

## Normal release

1. Push a feature branch and open a pull request. GitHub runs local verification and Vercel creates a preview.
2. Vercel emits `vercel.deployment.ready` after building. The deployment workflow validates the Vercel app sender, configured project, HTTPS deployment origin, and a current branch commit in this repository. Fork references and stale deployments are rejected before tests run.
3. A read-only job runs the trusted default-branch browser harness against that deployment. `/api/health` must report `{ status: "ok", mode: "demo", commit: <the deployed SHA> }` with `Cache-Control: no-store`. The health endpoint reports public release identity, not dependency/database readiness.
4. A separate job reports the browser result to the **deployed commit**, not the dispatch workflow's default-branch SHA. Preview and production use different status names.
5. After a change reaches `main`, Vercel assigns production domains only when the required local and deployed checks pass. A failed check leaves the previous release serving traffic.

The GitHub workflow uses `repository_dispatch` rather than `deployment_status: success`, since a success notification may arrive only after promotion. It must exist on `main` before Vercel can trigger it. Browser reports and failure artifacts are retained for seven days in the workflow run. Deployment checks test purchases with browser-local cart state; they cannot create real charges or merchant orders.

## Inspect a release

Use an authenticated Vercel CLI linked to the intended project:

```sh
vercel inspect <deployment-url>
vercel logs <deployment-url> --level error
```

To run the deployed suite locally, use the immutable URL and full commit shown by the authenticated deployment inspection:

```sh
E2E_BASE_URL=https://<deployment-host>.vercel.app \
E2E_EXPECTED_COMMIT_SHA=<full-commit-sha> \
npm run test:e2e:deployed
```

The suite starts no local server. It checks the health revision, routes, product assets, keyboard access, checkout success, payment-failure recovery, and cross-tab cart synchronization. Its navigation-timing attachment is a diagnostic baseline, not a performance score or service-level guarantee. Reports are written to `playwright-report/deployed` and `test-results/deployed`.

## Roll back and resume

1. Inspect the failing deployment and identify the previous known-good **production** deployment. Check the project and commit before changing its production alias.
2. Run `vercel rollback <previous-production-deployment-url>`. The Hobby plan supports rollback to the immediately preceding production deployment.
3. Verify the public domain's `/api/health` commit and run the deployed suite against that domain with the expected restored SHA.
4. Fix the problem in a new commit. Check its staged production build and browser results.
5. Run `vercel promote <verified-production-deployment-url>` to resume production domain auto-assignment. Rollback pauses auto-assignment until promotion restores it.

Do not use Force Promote to turn a failed check into a successful release. Promote a tested production deployment: promoting a preview can rebuild it with production configuration, changing the tested artifact.

## Troubleshooting and boundaries

- **No deployment workflow run:** confirm the workflow is on `main`, Git integration is connected, and repository dispatch events are enabled.
- **Validator fails:** check repository variables and deployment metadata. A superseded branch commit is deliberately rejected; test the latest deployment instead.
- **401/403 from a preview:** this project's workflow expects a public demo URL. Do not add a secret to arbitrary dispatch URLs. A future protected deployment requires authenticated Vercel metadata validation and a reviewed, protected test harness before introducing any authentication credential.
- **Checks pass but the domain remains on an older release:** inspect native Deployment Checks, exact check names, and whether a previous rollback disabled auto-assignment.
- **Repeated deployment of the same SHA:** GitHub statuses are commit-scoped and may reuse an earlier success. Use a new commit for normal releases. For an intentional same-SHA configuration rebuild, stage production without assigning domains, test that exact deployment URL, and promote that tested production build explicitly.
- **Simulated orders only:** public previews contain seeded fixtures. Do not place real customer data or merchant secrets in these environments. A future live commerce release needs a separate environment and protection policy.
- **Recovery scope:** this application currently has no application database. A rollback changes the served application; future database migrations will need their own backward-compatibility and recovery plan.

References: [Vercel Git integration](https://vercel.com/docs/git/vercel-for-github), [Deployment Checks](https://vercel.com/docs/deployment-checks), [rollback](https://vercel.com/docs/cli/rollback), [promotion](https://vercel.com/docs/cli/promote).
