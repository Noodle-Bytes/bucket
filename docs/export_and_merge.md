<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
  -->
NOTE: THIS PAGE IS BEING UPDATED

## Exporting coverage

Bucket supports exporting its coverage data to SQL. This can be stored locally, or fed directly into a database hosted elsewhere.


At the end of a simulation, the recorded coverage should be exported for later reading/processing.

```Python
    # In your testbench
    self.my_cvg = MyCvg(name="my_cvg", description="All my coverage")

    def export_coverage(self):
        # Create a context specific hash
        # This is stored alongside recorded coverage and is used to determine if coverage is valid to merge.
        # Alternatively, an empty string can be provided instead
        context_hash = Repo().head.object.hexsha

        # Collect coverage
        readout = PointReader(context_hash).read(self.my_cvg)

        # Write out to file
        SQLAccessor.File("test_2356.db").write(readout)

```
---
## Merging coverage

After running a regression, coverage from the separate simulations should be merged together ready to be viewed.

At present a simple merge is done, with a merged dataset being produced. In future we plan to support finer control of what is being merged, producing a minimal testset which will contain the subset of tests required to hit the same coverage, and adding the option to provide more detailed analysis as to which buckets were hit by which testcases.

To initiate coverage merging from the command line:
```
python -m bucket merge --output merged_cvg.db --sql-path="test_2356.db" --sql-path="test_87263.db"
```
This merged coverage will then be ready for viewing.

---
<br>

Prev: [Adding coverage to the testbench](add_to_testbench.md)
<br>
Next: [Reading and Writing](reading_and_writing.md)
