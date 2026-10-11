#!/usr/bin/env node
/**
 * Verifies whether remote `feat/*` branches still hold work that is missing from `main`.
 *
 * A branch whose tip is not an ancestor of main is NOT automatically un-merged work.
 * This repository lands feature work by squashing it into main, so the commit graph is
 * *expected* to diverge while the content is already present. Comparing ancestry alone
 * therefore reports false positives; and merging such a stale branch would revert main
 * back to the branch's fork date.
 *
 * This script compares content instead, per file the branch touched relative to its
 * merge-base with the base ref:
 *   identical  - byte-identical blob in both refs (the work landed as-is)
 *   differs    - present in both, but main has moved on (the work landed and evolved)
 *   branchOnly - present only on the branch (the only thing worth triaging)
 *
 * It also reports the insertions/deletions a naive merge of that branch would introduce,
 * which is the size of the regression a blind `git merge` would cause.
 *
 * Usage:
 *   node scripts/verify_feature_branches.mjs [--json]
 *
 * Environment:
 *   CF_BASE_REF         base ref to compare against (default: origin/main)
 *   CF_BRANCH_PREFIX    remote branch ref prefix (default: refs/remotes/origin/feat/)
 *
 * Exit status:
 *   0  every branch's content is represented in the base ref
 *   1  at least one branch holds a file that does not exist in the base ref (needs triage)
 */

import { execFileSync } from 'node:child_process'

const BASE_REF = process.env.CF_BASE_REF ?? 'origin/main'
const BRANCH_PREFIX = process.env.CF_BRANCH_PREFIX ?? 'refs/remotes/origin/feat/'
const AS_JSON = process.argv.includes('--json')

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return null
    const stderr = error.stderr ? error.stderr.toString().trim() : ''
    throw new Error(`git ${args.join(' ')} failed: ${stderr || error.message}`)
  }
}

/** Blob OID of `path` in `ref`, or null when the path does not exist there. */
function blobOf(ref, path) {
  return git(['rev-parse', '--verify', '--quiet', `${ref}:${path}`], { allowFailure: true })
}

function countMatch(text, pattern) {
  const match = text.match(pattern)
  return match ? Number(match[1]) : 0
}

function listFeatureBranches() {
  const refs = git(['for-each-ref', '--format=%(refname)', BRANCH_PREFIX])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  return refs
    .filter(ref => git(['merge-base', '--is-ancestor', ref, BASE_REF], { allowFailure: true }) === null)
    .map(ref => ({ ref, short: ref.replace(/^refs\/remotes\//, '') }))
}

function inspectBranch({ ref, short }) {
  const [tipHash, tipDate, ...subjectParts] = git(['log', '-1', '--format=%h|%cs|%s', ref]).split('|')
  const mergeBase = git(['merge-base', BASE_REF, ref])
  const [baseOnly, branchOnlyCommits] = git(['rev-list', '--left-right', '--count', `${BASE_REF}...${ref}`])
    .split(/\s+/)
    .map(Number)
  const shortstat = git(['diff', '--shortstat', BASE_REF, ref], { allowFailure: true }) ?? ''

  const identical = []
  const differs = []
  const branchOnly = []
  const touched = git(['diff', '--name-status', `${mergeBase}..${ref}`, '--', '.'])
    .split('\n')
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 2 && /^[AMDR]/.test(parts[0]))

  for (const [, path] of touched) {
    const branchBlob = blobOf(ref, path)
    const baseBlob = blobOf(BASE_REF, path)
    if (!baseBlob) branchOnly.push(path)
    else if (!branchBlob) continue
    else if (branchBlob === baseBlob) identical.push(path)
    else differs.push(path)
  }

  return {
    branch: short,
    tip: `${tipHash} ${tipDate}`,
    subject: subjectParts.join('|'),
    mergeBase: git(['log', '-1', '--format=%h %cs', mergeBase]).trim(),
    commitsOnlyOnBranch: branchOnlyCommits,
    commitsOnlyOnBase: baseOnly,
    touched: touched.length,
    identical: identical.length,
    differs: differs.length,
    branchOnly,
    mergeInsertions: countMatch(shortstat, /([0-9]+) insertions?/),
    mergeDeletions: countMatch(shortstat, /([0-9]+) deletions?/),
    shortstat,
  }
}

function main() {
  const branches = listFeatureBranches()
  if (!branches.length) {
    console.log(`No remote feature branches outside ${BASE_REF} (prefix ${BRANCH_PREFIX}).`)
    return 0
  }

  const results = branches.map(inspectBranch)
  const branchOnlyFiles = results.flatMap(result =>
    result.branchOnly.map(path => ({ path, branch: result.branch })),
  )
  const totalDeletions = results.reduce((sum, result) => sum + result.mergeDeletions, 0)

  if (AS_JSON) {
    console.log(JSON.stringify({ baseRef: BASE_REF, totalDeletions, branches: results, branchOnlyFiles }, null, 2))
    return branchOnlyFiles.length ? 1 : 0
  }

  console.log(`Base ref: ${BASE_REF}`)
  console.log(`Feature branches not in the base ref: ${results.length}\n`)
  console.log(
    ['BRANCH'.padEnd(46), 'TIP'.padEnd(18), 'BASE AHEAD'.padStart(10), 'BRANCH AHEAD'.padStart(12),
      'SAME'.padStart(5), 'MOVED'.padStart(6), 'ONLY-BR'.padStart(8), 'MERGE DEL'.padStart(10)].join(' '),
  )
  for (const result of results) {
    console.log(
      [result.branch.padEnd(46), result.tip.padEnd(18), String(result.commitsOnlyOnBase).padStart(10),
        String(result.commitsOnlyOnBranch).padStart(12), String(result.identical).padStart(5),
        String(result.differs).padStart(6), String(result.branchOnly.length).padStart(8),
        String(result.mergeDeletions).padStart(10)].join(' '),
    )
  }

  console.log(`\nA blind merge of all ${results.length} branches would delete ${totalDeletions.toLocaleString()} lines from ${BASE_REF}.`)

  if (!branchOnlyFiles.length) {
    console.log('\nOK: every file these branches touch already exists in the base ref.')
    return 0
  }

  console.log(`\nFiles that exist ONLY on a feature branch (${branchOnlyFiles.length}) — triage these:`)
  for (const entry of branchOnlyFiles) console.log(`  ${entry.path}  <- ${entry.branch}`)
  console.log('\nEverything else on those branches is already represented in the base ref, usually under a newer name.')
  return 1
}

process.exit(main())
