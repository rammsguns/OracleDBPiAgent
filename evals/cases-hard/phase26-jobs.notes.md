`hard-p26-p1-last-failed-job` assumes the p1 fixture's latest retained failed
SHOPAPP job has error ORA-02292. Its requiredFacts check the meaning of that
specific error (a dependent child record / foreign-key dependency). Both the
full hard validator and the p26 validator fail loudly if live p1 truth no
longer returns ORA-02292, including when failed history disappears. Review
this premise and its explanation checks if the fixture changes; do not silently
score another error against ORA-02292's meaning. The d1 validator is an
empty-branch smoke and does not impose p1's fixture prerequisite there.
