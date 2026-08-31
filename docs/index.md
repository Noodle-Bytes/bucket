<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

# Getting Started:

Install the Python library from PyPI:

```bash
pip install noodle-bucket
```

This provides `import bucket` and the `bucket` CLI. It is enough to define
coverpoints, collect coverage, and write `.bktgz` / SQL / JSON / console
output. View results in the [hosted viewer](https://noodle-bytes.github.io/bucket/)
or the desktop app — see [Viewing coverage](viewing_coverage.md).

HTML generation (`write html` / `write report`) is not part of the pip
package; it needs a source checkout of this repository and Node.js.

To run the in-repo example, which includes a coverage tree along with some
randomised data to sample:

```
$ ./bin/shell
$ python -m example.example
```

Below describes how to use Bucket to create a coverage tree, sample your data and then merge the results. Examples of coverpoints in use can be seen in [cats.py](https://github.com/Noodle-Bytes/bucket/blob/main/example/cats.py) and [dogs.py](https://github.com/Noodle-Bytes/bucket/blob/main/example/dogs.py).

# Contents
1. [Introduction](introduction.md)
2. [Coverpoints](coverpoints.md)
3. [Covergroups](covergroups.md)
4. [Covertop](covertop.md)
5. [Adding coverage to the testbench](add_to_testbench.md)
6. [Exporting and merging coverage](export_and_merge.md)
7. [Reading and Writing](reading_and_writing.md)
8. [Viewing coverage](viewing_coverage.md)


---
