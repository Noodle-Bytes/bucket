<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2025 Noodle-Bytes. All Rights Reserved
  -->

# Reading and Writing

This section documents key components for reading and writing coverage data,
specifically:

  - The coverage data model.
  - The Readout protocol, and Readout objects.
  - Readers, which produce Readouts from data in other formats.
  - Writers, which write to other formats from Readouts.
  - Accessors, which provide a human-friendly object-based API for Readouts.

## The coverage data model

Coverage data comprises:

  - A tree of coverpoints/covergroups
  - Goal data for each coverpoint
  - Axis data for each coverpoint
  - Goal and hit data for each bucket

It is useful to be able to access subtrees of this data without needing to load
the entire structure, specifically:

  - The direct children of a covergroup - to facillitate lazy loading
  - A single coverpoint or covergroup

Another factor is that the structure of coverage data does not need to modified
after it is first defined. This makes [nested-sets](https://www.mongodb.com/docs/manual/tutorial/model-tree-structures-with-nested-sets/)
almost an ideal candidate, except that it is costly to distinguish direct
children from other descendants.

To resolve this, we have included a depth field which can be used to determine
the hierarchy level, and modified the bound condition such that the first
childs left bound will be the same as the parents (the depth will be
different).

The goal, axis, and bucket data are also stored such that they can be
efficiently accessed using left and right bounds from coverpoints and
covergroups.

## The Readout Protocol and Readout Objects

The readout protocol describes the interface that must be implemented for an
object to provide coverage data. It is provided in full in `bucket.rw.common`,
but in-short a readout object must provide methods to iterate over ranges of
each type of coverage data.

## Readers

Readers are factories for readout objects which must implement a `read` method
to produce a readout. This readout may be just a window into some backing
store, or may include the data inline.

## Writers

Writers are consumers of readout objects which must implement a `write` method
which processes a readout. Writers may for example:

  - Write the readout to the terminal console..
  - Write the readout into another format such as SQLite.
  - Produce an HTML report on the readout.

## Accessors

Accessors provide an API on top of readouts to access to data in a hierarchical
object form, this can be useful for some writers (particularly those for displaying
data to humans).

---
<br>

Prev: [Exporting and merging coverage](export_and_merge.md)
<br>
Next: [Viewing coverage](viewing_coverage.md)
