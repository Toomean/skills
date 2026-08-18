PYTHON ?= python3
SKILL ?= all
PROVIDER ?= all

.PHONY: check check-structure check-functional install status verify uninstall

check: check-structure check-functional

check-structure:
	$(PYTHON) check-repo.py

check-functional:
	PYTHONDONTWRITEBYTECODE=1 $(PYTHON) earned-done/checks/git-guardrails-check.py

install:
	$(PYTHON) manage-skills.py install $(SKILL) $(PROVIDER)

status:
	$(PYTHON) manage-skills.py status $(SKILL) $(PROVIDER)

verify:
	$(PYTHON) manage-skills.py verify $(SKILL) $(PROVIDER)

uninstall:
	$(PYTHON) manage-skills.py uninstall $(SKILL) $(PROVIDER)
