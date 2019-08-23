################
# Entry Points #
################
.PHONY: test

publish-patch:
	docker-compose run --rm node make _deps _release-patch _clean _publish

publish-minor:
	docker-compose run --rm node make _deps _release-minor _clean _publish

publish-major:
	docker-compose run --rm node make _deps _release-major _clean _publish

release:
	docker-compose run --rm node make _devdeps _release

test:
	docker-compose run --rm node make _devdeps _lint

shell:
	docker-compose run --rm node bash


##########
# Others #
##########

_test:
	npm test

_lint:
	npm run lint

_deps:
	npm install --production

_devdeps:
	npm install

_clean:
	rm -fr node_modules

define release
	VERSION=`node -pe "require('./package.json').version"` && \
	NEXT_VERSION=`node -pe "require('semver').inc(\"$$VERSION\", '$(1)')"` && \
	node -e "\
		var j = require('./package.json');\
		j.version = \"$$NEXT_VERSION\";\
		var s = JSON.stringify(j, null, 2);\
		require('fs').writeFileSync('./package.json', s);"
endef

_release-patch: _lint _test _adduser
	@$(call release,patch)

_release-minor: _lint _test _adduser
	@$(call release,minor)

_release-major: _lint _test _adduser
	@$(call release,major)

_release: _lint _test
	npm run release

_adduser:
	npm adduser

_publish:
	npm publish --access public