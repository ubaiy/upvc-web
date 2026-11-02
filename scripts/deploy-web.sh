#!/usr/bin/env bash
# Builds a committed version of the web app, checks it and puts it on the live site.
# Usage: scripts/deploy-web.sh [--dry-run] [--skip-tests] [git-ref]
# A real run needs UPLOAD_URL, AUTH_KEY and REST_AUTH_KEY from Hostinger's
# hosting_files_generate-upload-url for lightgray-opossum-416780.hostingersite.com.
# Roll back by running it again with the deploy-web-* tag of the previous deploy.
set -euo pipefail

SITE=https://app.meet-enterprise.com
REF=HEAD
DRY=0
TESTS=1
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --skip-tests) TESTS=0 ;;
    -*) echo "Unknown option $arg"; exit 2 ;;
    *) REF=$arg ;;
  esac
done

fail() { echo "STOPPED: $1"; exit 1; }

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
SHA=$(git rev-parse --short "$REF^{commit}")

if [ "$DRY" = 0 ] && { [ -z "${UPLOAD_URL:-}" ] || [ -z "${AUTH_KEY:-}" ] || [ -z "${REST_AUTH_KEY:-}" ]; }; then
  fail "UPLOAD_URL, AUTH_KEY and REST_AUTH_KEY are needed for a real run"
fi
# Only committed code goes live
if [ "$REF" = HEAD ] && [ -n "$(git status --porcelain -- src scripts angular.json package.json package-lock.json 'tsconfig*.json')" ]; then
  fail "there are uncommitted changes, commit them first"
fi

# One fixed folder: the bundle names depend on the build path, so only this keeps two builds comparable
WORK=$(dirname "$ROOT")/.upvc-web-build
cleanup() {
  cd "$ROOT"
  # rmdir drops the junction only, so rm never reaches the real node_modules
  if [ -e "$WORK/node_modules" ]; then cmd //c rmdir "$(cygpath -w "$WORK/node_modules")" || true; fi
  if [ ! -e "$WORK/node_modules" ]; then rm -rf "$WORK"; else echo "Left in place: $WORK"; fi
}
cleanup
mkdir "$WORK"
trap cleanup EXIT

git archive "$SHA" | tar -x -C "$WORK"
powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w "$WORK/node_modules")' -Target '$(cygpath -w "$ROOT/node_modules")' | Out-Null"
cd "$WORK"
export NG_CLI_ANALYTICS=false

if [ "$TESTS" = 1 ]; then
  echo "Running the tests of $SHA..."
  npx ng test --watch=false --browsers=ChromeHeadless > test.log 2>&1 || { tail -30 test.log; fail "the tests failed"; }
  grep 'TOTAL' test.log | tail -1
fi

echo "Building $SHA..."
npx ng build --configuration=production --aot --output-hashing=all > build.log 2>&1 || { tail -30 build.log; fail "the build failed"; }
DIST=$WORK/dist/UPVC

[ -f "$DIST/index.html" ] || fail "the build has no index.html"
! grep -ql 'hakimienterprice' "$DIST"/*.js || fail "the build still names the old API"
grep -q 'API_URL:"/api/v1"' "$DIST"/main.*.js || fail "the build does not call the API on its own site"
! grep -ql '"hidden","","appWrite"' "$DIST"/*.js || fail "a hidden button with appWrite would be drawn"
echo "Build checks passed."

matches_live() {
  local file differs=0
  for file in "$DIST"/*.js "$DIST"/*.css; do
    if [ "$(curl -s -m 30 "$SITE/$(basename "$file")" | sha256sum | cut -d' ' -f1)" != "$(sha256sum < "$file" | cut -d' ' -f1)" ]; then
      echo "Differs from live: $(basename "$file")"
      differs=1
    fi
  done
  if [ "$(curl -s -m 30 "$SITE/" | sha256sum | cut -d' ' -f1)" != "$(sha256sum < "$DIST/index.html" | cut -d' ' -f1)" ]; then
    echo "Differs from live: index.html"
    differs=1
  fi
  return $differs
}

if [ "$DRY" = 1 ]; then
  if matches_live; then echo "Dry run passed: the live site already serves exactly $SHA."; else echo "Dry run passed: the live site differs from $SHA."; fi
  exit 0
fi

upload() {
  local name=$1 size
  size=$(stat -c%s "$name")
  curl -sf -o /dev/null -X POST "$UPLOAD_URL/$name?override=true" -H "X-Auth: $AUTH_KEY" -H "X-Auth-Rest: $REST_AUTH_KEY" \
    -H 'Tus-Resumable: 1.0.0' -H "Upload-Length: $size" -H 'Upload-Offset: 0' || fail "could not start the upload of $name"
  curl -sf -o /dev/null -X PATCH "$UPLOAD_URL/$name?override=true" -H "X-Auth: $AUTH_KEY" -H "X-Auth-Rest: $REST_AUTH_KEY" \
    -H 'Tus-Resumable: 1.0.0' -H 'Content-Type: application/offset+octet-stream' -H 'Upload-Offset: 0' \
    --data-binary "@$name" || fail "could not upload $name"
}

RANDOM_NAME=$(openssl rand -hex 16)
ZIP=w$RANDOM_NAME.zip
PHP=u$RANDOM_NAME.php
php -d memory_limit=512M "$(cygpath -m "$ROOT/scripts/pack-web.php")" "$(cygpath -m "$DIST")" "$ZIP"
sed "s/__RELEASE__/$ZIP/" "$ROOT/scripts/swap-web.php" > "$PHP"

echo "Uploading..."
upload "$ZIP"
upload "$PHP"
RESULT=$(curl -s -m 120 "$SITE/$PHP")
echo "$RESULT"
case "$RESULT" in
  *'installer removed'*) ;;
  *) fail "the swap did not finish, check $SITE and remove $PHP and $ZIP from public_html" ;;
esac
case "$RESULT" in
  *FAILED*) fail "the swap refused, see the line above" ;;
esac

[ "$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$SITE/$PHP")" = 404 ] || fail "the installer is still on the site"
[ "$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$SITE/api/v1/public/gst/states")" = 200 ] || fail "the API does not answer"
matches_live || fail "the live files differ from the build, deploy the previous deploy-web-* tag"

cd "$ROOT"
TAG=deploy-web-$(date +%Y%m%d-%H%M)-$SHA
git tag "$TAG" "$SHA"
echo "Deployed $SHA to $SITE, tagged $TAG."
