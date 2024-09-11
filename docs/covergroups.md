<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2024 Vypercore. All Rights Reserved
  -->

## Covergroups

Covergroups are a way to provide hierarchy by grouping coverpoints and other covergroups. A `print_tree()` function can be called to display how covergroups/coverpoints are organised.

Each covergroup should inherit from the Covergroup class. Coverpoints and covergroup are added during the `setup()` phase using the `add_coverpoint` and `add_covergroup` functions. Here you can also override the default `name`, `description` and `motivation`, as well as pass in other parameters if required.

``` Python
class MyBigCoverGroup(Covergroup):
    NAME = "default_covergroup_name"
    DESCRIPTION = "Default description goes here"

    def setup(self, ctx):
        self.add_covergroup(
            # Here we demonstrate overriding the default name and description of a covergroup
            MyCovergroup(
                parameter_a = [1,2,3]
            ),
            name="my_covergroup",
            description="A group of coverpoints"
        )
        self.add_coverpoint(
            MyCoverpoint()
            .set_tier(1)
            .set_tags(["tag_a", "tag_b"])
        )
```
As seen above, there are methods for overriding or adding to the tier and tags when instancing a coverpoint.

|Method| parameter|description|
|--|--|--|
|set_tier| `int`| Override the default `tier` for this instance|
|set_tags| `list[str]` or `str` |  Override the default `tags` for this instance|
|add_tags| `list[str]` or `str` |  Add to the default `tags` for this instance|

---
### Smart Sampling
If a covergroup is known to contain coverpoints/covergroups which will only cover a subset of data, then the user can optionally provide a `should_sample` function. This will prevent any sampling in any sub-coverpoints/covergroups when the data would not be sampled, and is more optimal than each coverpoint deciding the trace data isn't relevant.
```Python
    def should_sample(self, trace):
        """
        This function is used to stop coverpoints being called when not relevant
        """
        return True if trace["type"] == "Dog" else False
```

---

## Covertop

`Covertop` is a type of covergroup reserved for the very top of coverage. This class contains special fucntions such as filtering, which is talked about on the next page. This is the coverage instance that you will instance in your testbench, and pass to the Sampler.

NOTE: The top of coverage should have a default name provided, and cannot be overridden when instancing. A description should also be added as default if it is used.


---
<br>

Prev: [Coverpoints](coverpoints.md)
<br>
Next: [Filters](filters.md)
