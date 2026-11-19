#!/usr/bin/env bash
# Release Mardow: set the version, test, build the app, commit + tag, push, and publish a GitHub release
# with the zipped Mardow.app attached.
#
#   npm run release -- 0.2.0
#
# Needs: a clean git working tree with an `origin` remote, `gh` logged in (gh auth login), and the updater
# signing key (~/.tauri/mardow.key, or TAURI_SIGNING_PRIVATE_KEY). The release carries latest.json, which
# installed copies of Mardow read to find and verify the update.
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "release: $*" >&2; exit 1; }

version="${1:-}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: npm run release -- <x.y.z>"
tag="v$version"

# Check everything before touching a file, so a failed check leaves nothing half done.
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository (git init, then add an origin remote)"
git remote get-url origin >/dev/null 2>&1 || die "no 'origin' remote"
[[ -z "$(git status --porcelain)" ]] || die "uncommitted changes; commit or stash them first"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
[[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" || -f "$HOME/.tauri/mardow.key" ]] || die "updater signing key missing (~/.tauri/mardow.key)"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

echo "→ version $version"
npm version "$version" --no-git-tag-version --allow-same-version >/dev/null # package.json + package-lock.json
node -e '
  const fs = require("fs"), p = "src-tauri/tauri.conf.json", c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.version = process.argv[1];
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
' "$version"
sed -i '' -E "1,/^version = /s/^version = \".*\"/version = \"$version\"/" src-tauri/Cargo.toml

echo "→ test and build"
npm test
npm run dist # also updates Cargo.lock to the new version

app="src-tauri/target/release/bundle/macos/Mardow.app"
[[ -d "$app" ]] || die "build did not produce $app"
zip="src-tauri/target/release/bundle/macos/Mardow-$version-macos-$(uname -m).zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip" # keeps the bundle's symlinks and permissions, unlike plain zip

# Update files: the signed app archive under a versioned name, and latest.json pointing at it.
arch="$(uname -m)"; [[ "$arch" == arm64 ]] && arch=aarch64 # Tauri's platform names
bundle="src-tauri/target/release/bundle/macos"
[[ -f "$bundle/Mardow.app.tar.gz.sig" ]] || die "build did not produce the signed update archive"
tarball="$bundle/Mardow-$version-macos-$arch.app.tar.gz"
cp "$bundle/Mardow.app.tar.gz" "$tarball"
latest="$bundle/latest.json"
node -e '
  const [version, platform, url, sigFile, out] = process.argv.slice(1);
  const signature = require("fs").readFileSync(sigFile, "utf8").trim();
  const json = { version, pub_date: new Date().toISOString(), platforms: { [platform]: { url, signature } } };
  require("fs").writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
' "$version" "darwin-$arch" "https://github.com/$repo/releases/download/$tag/$(basename "$tarball")" "$bundle/Mardow.app.tar.gz.sig" "$latest"

echo "→ commit, tag, push"
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git diff --cached --quiet || git commit -m "Release $tag" # nothing to commit when the version was already set
git tag -a "$tag" -m "Mardow $version"
git push origin HEAD "$tag"

echo "→ GitHub release"
gh release create "$tag" "$zip" "$tarball" "$latest" --title "Mardow $version" --generate-notes
echo "✓ released $tag"
