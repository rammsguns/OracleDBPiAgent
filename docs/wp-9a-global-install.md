# WP-9A installation verification

Implementation commit: 6308293; documentation follow-up recorded in git.
Changed CLI startup/init/version, config paths/private env loading, package
prepare/files, report-history/web defaults, tests and installation docs.
No dependencies, safety rules, approved targets or shared contracts changed.

## Checks

- npm run typecheck: passed.
- npm test: 34 files, 606 tests passed.
- npm run build: passed.
- Integration excluding answers one end-to-end: 7 files passed, 24 tests passed,
  1 skipped. Initial run had a transient d1 report-diff failure (index_partitions
  unavailable to ok); rerun passed.
- npm pack and npm install -g --prefix <tmp> <tarball>: passed.
- Local branch clone: npm ci then npm install -g --prefix <tmp2> <clone>: passed.
- Both installs passed --version (1.0.0), init and targets from an unrelated
  directory with temporary HOME; repeat init preserved the existing file.
- Installed report --target d1-19c-lab --sections identity: passed with a 0600
  temporary coordinator env copy, installed targets path and temporary audit path.
  No LLM request was made.
- All temporary prefixes, homes, caches and configuration copies were deleted.
  The real global prefix and ~/.piagent were never used.

## Open verification issue

Direct global git+file installation failed during preparation with tsc not found,
reproduced under host npm 9.2.0 and temporary npm 11, including a temporary npmrc
prefix instead of --prefix. Clone npm ci then global directory installation works.
The coordinator requested retaining simple prepare without nested npm install;
README and install docs now support only the verified clone and tarball paths.
GitHub itself was not tested because this branch is unpushed.
Security review and CI remain coordinator release gates.
