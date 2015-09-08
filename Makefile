ECHO=@
VER:=$(shell perl -ne 'if (/<em:version>(.*)<\/em:version>/) { print $$1 }' install.rdf)
FILENAME=remote_control-$(VER)-fx.xpi

show-version:
	@echo "We could build version $(VER) -> $(FILENAME)"
	@echo
	@echo 'Run "make xpi-dir" or "make xpi-git" to create the xpi file'
	@echo
	$(ECHO) exit 1

xpi-dir:
	@echo 'Creating $(FILENAME) from current dir'
	$(ECHO) find . \( -name .git -prune -o -print \) | \
		xargs zip -q /tmp/$(FILENAME) && \
		mv /tmp/$(FILENAME) .
xpi-git:
	@echo 'Creating $(FILENAME) from $$(git archive HEAD)'
	$(ECHO) git archive --format=zip --worktree-attributes HEAD . > $(FILENAME)
