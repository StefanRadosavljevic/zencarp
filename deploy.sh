#!/bin/sh
set -e

git status
git push origin dev
git push origin dev:master --force
