<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2026 Noodle-Bytes. All Rights Reserved
  -->

# Coverage waivers

Verification sign-off usually needs to distinguish buckets that are *unhit*
from buckets that are *unhit but excused*: a corner the design cannot reach, a
stimulus the testbench does not model, a bucket that a different environment
covers. Bucket calls these exclusions **waivers**.

Waivers are applied to recorded coverage *after the fact* — nothing in the
coverpoint definitions changes, and the regression identity (record sha) is
unchanged, so waived and unwaived records of the same regression still merge.
This is different from the two mechanisms that act at definition or sampling
time:

- **Illegal (`illegal=True`) and ignore (`ignore=True`) goals** remove buckets
  from the target when the coverpoint is defined (see [Coverpoints](coverpoints.md)).
- **Covertop filters** (`include_by_name`, `exclude_by_tags`, ...) stop whole
  coverpoints from sampling (see [Covertop](covertop.md)).

Only buckets with a goal target greater than zero can be waived; illegal and
ignore buckets are never waived.

## The waiver file

Waivers are specified in a JSON file:

```json
{
  "waivers": [
    {
      "point": "Pets.dogs.Doggy stats",
      "axes": {"name": ["Stuart", "Peter"], "age": "16+"},
      "reason": "Stuart and Peter are people; no elderly-dog traces are generated",
      "author": "stuart"
    },
    {
      "point": "pets.cats.play_toys.*",
      "axes": {"favourite_toy": "Laser"},
      "reason": "Laser pointer stimulus is not modelled in the example testbench"
    }
  ]
}
```

| Field | Required | Description |
| -- | -- | -- |
| `point` | yes | Glob on the dotted path of point names from the root, e.g. `Pets.dogs.*` |
| `axes` | no | Axis name → glob or list of globs on the bucket's axis **value name**. Omit (or `{}`) to waive every bucket of the point |
| `reason` | yes | Why the buckets are excused. Must not be empty; stored with the coverage |
| `author` | no | Who added the waiver |

`example/waivers.json` in the repository waives a few buckets of the in-repo
example (`example/cats.py`, `example/dogs.py`) and is applied at the end of
`python -m example.example`.

### Matching rules

- **Point paths** are the names of every ancestor from the root joined with
  `.` — `Pets.dogs.Doggy stats` for the `Doggy stats` coverpoint inside the
  `dogs` covergroup of the `Pets` covertop. Globs use `fnmatch` syntax (`*`,
  `?`, `[abc]`) and are case-insensitive. `*` matches across `.`.
- A waiver applies to a coverpoint when its glob matches the coverpoint's own
  path **or any ancestor path**, so `Pets.dogs` (no wildcard) waives buckets in
  the whole `dogs` subtree. This is the same convention as the report writer's
  `--point` option.
- **Axis values** are matched by their value *name* (the string shown in the
  viewer — `"16+"`, `"high (normal)"`, `"0x4"`), case-insensitively. A bucket
  matches when **every** listed axis matches at least one of its patterns;
  axes that are not listed match anything.
- A waiver that matches a coverpoint but names an axis that coverpoint does
  not have is an error (`bucket.waiver.WaiverAxisError`), so a typo cannot
  silently waive nothing. A waiver whose `point` glob matches no coverpoint is
  not an error: waiver files are commonly shared across partial regressions.
- When several waivers match one bucket, the **first** in file order supplies
  the reason. Waivers already stored in a record (see below) keep their reason
  when more are applied.

## Semantics

A waived bucket is excluded from scoring entirely:

- its hits do not count towards the point's `hits`, `hit_buckets` or
  `full_buckets`;
- the point's effective bucket target is `target_buckets - waived_buckets`;
- the point's effective hit target is `target - waived_target`, where
  `waived_target` is the sum of the goal targets of the waived buckets.

All percentages (`hit_percent`, `buckets_hit_percent`, `buckets_full_percent`
on `PointAccess`, and the console tables) use the effective targets. A point
whose every targeted bucket is waived reads as 100% covered. The raw
`target`/`target_buckets` values are unchanged so the amount waived is always
visible: `ConsoleWriter` shows a `Waived` column in the summary table, and the
per-bucket table shows the waiver reason.

## Applying waivers

### From the command line

The `write` group accepts `--waivers` / `-w` (repeatable). Waivers are applied
to every readout, after `--merge` if given, and the result is written by the
chosen subcommand exactly like any other readout:

```bash
# Archive with waivers recorded, ready for the viewer
python -m bucket write -r regr.bktgz -w waivers.json archive -o regr_waived.bktgz

# Merge a regression, then waive, then print the summary
python -m bucket write -r a.bktgz -r b.bktgz -m -w waivers.json -w extra_waivers.json console
```

### From Python

```python
from bucket import load_waivers
from bucket.rw import ArchiveAccessor, WaivedReadout

waivers = load_waivers("waivers.json")
readout = next(ArchiveAccessor("regr.bktgz").reader().read_all())
waived = WaivedReadout(readout, waivers)

print(waived.matched)  # the buckets the file newly waived, with reasons
ArchiveAccessor("regr_waived.bktgz").write(waived)
```

`WaivedReadout` wraps any readout: definition tables and bucket hits pass
straight through, `iter_point_hits()` is recomputed with the waivers, and
`iter_bucket_waivers()` yields the waived buckets. Its `get_rec_sha()` is that
of the wrapped readout.

`bucket.waiver.match_waivers(readout, waiver_file)` returns the matched
`(start, reason)` rows without wrapping, and the `Waiver`/`WaiverFile`
pydantic models can be built in code instead of loaded from JSON.

## Storage

Waivers are part of the coverage record (storage format 3, see the format
history in `bucket/rw/common.py`):

- Every readout provides `iter_bucket_waivers(start, end)` yielding
  `BucketWaiverTuple(start, reason)` rows, where `start` is the global bucket
  index. Files written before format 3 read back with no waivers.
- `point_hit` rows carry `waived_buckets` and `waived_target`.
- Archives (`.bktgz`) have a `bucket_waiver` table (CSV rows `start,reason`);
  JSON records have a `bucket_waiver` key; SQL databases have a
  `bucket_waiver` table and two extra `point_hit` columns (added in place when
  writing into an older database).
- Merging (`MergeReadout`, `--merge`) unions the waivers of all records by
  bucket index (first reason wins) and rescores the merged hits with them.

## In the viewer

The viewer reads the same archives and JSON files: waived buckets are marked
with their reason, and point percentages use the effective targets described
above. See [Viewing coverage](viewing_coverage.md).

<!-- Navigation links below are auto-generated by tools/update_docs_nav.py. Do not edit manually. -->
---
<br>

Prev: [Exporting and merging coverage](export_and_merge.md)
<br>
Next: [Reading and Writing](reading_and_writing.md)
