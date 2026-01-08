<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2024 Vypercore. All Rights Reserved
  -->

# Coverpoints

A coverpoint consists of one or more axes, which are then crossed. (An axis covers one signal/data - similar to a UVM coverpoint). Each possible combination of the axes' values is called a bucket. Each bucket has a default goal with a target of 10 hits, which can be modified as required, or can be made illegal or ignored.

Each new coverpoint should inherit from the Coverpoint class. When adding a coverpoint to a covergroup, you can optionally provide a 'name', a 'description' and a 'motivation' to override the defaults. If you want to pass additional arguments to the coverpoint see [below](#passing-the-coverpoint-extra-arguments), or the example files.

``` Python
class MyCoverpoint(Coverpoint):
    NAME = "default_name"
    DESCRIPTION = "default_description"
    MOTIVATION = "default_motivation"
    TIER = 3 # Default tier
    TAGS = ["default", "tags"]

```

`Description` should explain WHAT is being covered.<br>
`Motivation` should explain WHY you are covering it.

These two fields can be very useful when later reviewing coverage to ensure you are collecting sufficient coverage. However, both are optional.

---
### Tier and tags
If you wish to filter coverpoints then you can set a tier and/or tags per coverpoint instance. These are optionally applied to each within the covergroup setup phase.
<br>

`Tier`: A coverpoint's tier is set to 0 by default, which is the highest priority. Any value can be set. When running a simulation, the tier_level can be set by the testbench which will disable coverpoints of a lower priority tier.
<br>

`Tags`: Tags can be added to coverpoints to allow for easier filtering (where relying names may not make sense - such as a group of coverpoints across several covergroups). They will also be made available in the coverage viewer so only coverpoints with matching tags are shown.

Both of these fields can be provided as above, as well as being overridden when instancing. See [Covergroups](covergroups.md) for how to use the available methods to override.

---
### Adding Axes and Goals
A `setup()` method is then required to add the axes and goals of the coverpoint.

You use `add_axis()` to add each axis, which requires a name, description and some values.

| Parameter | Type | Description |
| --- | ---| ---|
| name | str | Should be machine readable, containing no spaces. It is suggested to use lower case |
| description | str | A short description of the axis |
| values | dict,list,tuple,set | All the values/ranges to be covered by the axis |

`Values` can be in the form of numbers or strings and will be processed by the coverpoint when added. A name for each value/range will automatically be generated unless one is provided. Names allow more meaning to be given to numbers/ranges, while still allowing either the name or the value to be sampled. Names will be shown in the exported coverage.

To specify a named value, a dictionary should be used in the form `{'name': value}`. Alternatively, a list, tuple or set can be passed in and the names will be automatically created.
<br>

Ranges can be specified by providing a MIN and MAX value in a list in place of a single value.<br>
Eg. `[0, 1, 2, [3, 9], 10]`

The example below shows an axis being added with five buckets. Four of the buckets only accept a single value, while the remaining one can accept any value from `2` to `13`. Later, when sampling, either the auto-generated name of a bucket can be passed in (eg. `"1"`, `"2 -> 13"`, `"15"`), or the raw value can be passed instead (eg. `0`, `5`, `9`)

``` Python
    def setup(self, ctx):
        self.add_axis(
            name="my_axis",
            values=[0, 1, [2, 13], 14, 15],
            description="Interesting values for my_axis",
        )
```

Goals can be optionally used to name buckets and define ILLEGAL, IGNORE or modified hit counts. `add_goal` requires a name and a description. It can optionally include a new target hit count, or define the goal as ignore or illegal. If no target is provided, a default of 10 is currently used. Only one of `target`, `illegal` and `ignore` can be set for a given goal.

| Parameter | Type | Description |
| --- | --- | ---|
| name | str | Should be all caps, no spaces. It should also be uniquely named where possible |
| description | str | A short description of the goal aim |
| \[target\] | int | Target number of hits to saturate the bucket(s) |
| \[illegal\] | bool | Illegal. Bucket(s) will generate an error if hit |
| \[ignore\] | bool | Ignore. No coverage will be collected for the bucket(s) |

<br>

Each goal is created during `setup()`, normally after the axes have been defined. Below, one goal has been made ILLEGAL, while the other has increased the number of hits required to 20.

``` Python
        self.add_goal("MOULDY_CHEESE", "Not so gouda!", illegal=True)
        self.add_goal("OPTMISTIC_CHEESE", "I brie-live in myself!", target=20)
```

If goals have been created, then they must be applied to the relevant buckets. To do this the `apply_goals()` method must be overridden, which will be automatically called at the end of the setup phase. After filtering which buckets are to have a goal applied, the new goal should be returned. The default target is otherwise applied.
<br>

NOTE: Each bucket axis provides both `.name` (the string representation) and `.value` (the actual value). For simple values like integers, `.value` gives you the numeric value directly without conversion. For ranges, `.value` is a list `[min, max]`. For strings, `.name` and `.value` are typically the same.

``` Python
    def apply_goals(self, bucket, goals):
        # Using .name for string comparisons
        if bucket.my_axis_1.name == "1" and bucket.my_axis_3.name in ["red", "yellow"]:
            return goals.MOULDY_CHEESE
        # Using .value for direct numeric comparisons (no conversion needed!)
        elif bucket.my_axis_2.value > 8:
            return goals.OPTMISTIC_CHEESE
        # Check if a value is a range
        elif isinstance(bucket.my_axis_1.value, list):
            return goals.RANGE_GOAL
```
---
Finally, a `sample()` method needs to be defined. This method will be passed the trace data to be sampled. A trace object can be of any type, but is intended to be a class containing all information to be covered (accumulated from monitors, models, etc). Each coverpoint can then sample the relevant information. This could be as simple as directly assigning values to each axis, processing the values into something more useful and/or storing values for the next time the coverpoint is called.

`set_axes()` is used to assign each axis a value/named-value. (eg. If an axis has the values `[0,1,2]` with the corresponding the names `[red,green,blue]` then either `0` or `red` could be assigned to the bucket). Once all axes have been set, then the bucket hit count can be incremented. If it is a regular bucket, then the hit count will be increased. If it is an IGNORE bucket, no action will be taken, and if it is an ILLEGAL bucket an error will be generated.

> **NOTE: The bucket should have every axis of the coverpoint assigned a valid value when hit() is called. Attempting to sample while not setting the bucket correctly will result in an error. (This is because the `hit()` function would not know which exact combination of axis values to to increment).**

If multiple values are to be sampled for a given call of the sample method, then all axis values of the bucket do not need to be re-set. Only the ones which have changed need to be overridden with new values.

``` Python
    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time.
        # bucket can also be manually cleared by using bucket.clear()
        with self.bucket as bucket:
            bucket.set_axes(
                my_axis_1=trace.monitor_a.interface_b.signal,
                my_axis_2=trace.instruction.operand.type,
            )

            # For when multiple values might need covering from one trace
            # Only need to re-set the axes that change
            for gpr in range(len(trace.registers_accessed)):
                bucket.set_axes(my_axis_3=trace.registers[gpr])
                bucket.hit()
```
---
### Passing the coverpoint extra arguments

If you wish to create a coverpoint which relies on external data (such as a pre-processed list of instruction names, or a prefix for the axis names, etc), then you can use `__init__()`.

The example below shows instancing the same coverpoint twice with different names. These extra parameters could come from automatically generated lists which split up the original data into smaller groups.
```Python
class ChewToysByName(Coverpoint):
    def __init__(self, dog_names):
        self.dog_names = dog_names

    def setup(self, ctx):
        self.add_axis(
            name="dog_name",
            values=self.dog_names,
            description="Most important dog names only",
        )
...
# To be instanced as below:
class DogsAndToys(Covergroup):
    def setup(self, ctx):
        self.add_coverpoint(
            ChewToysByName(
                name="chew_toys_by_name__group_a",
                description="Preferred chew toys by name (Group A)",
                dog_names=["Barbara", "Connie", "Graham"],
            )
        )
        self.add_coverpoint(
            ChewToysByName(
                name="chew_toys_by_name__group_b",
                description="Preferred chew toys by name (Group B)",
                dog_names=["Clive", "Derek", "Ethel"],
            )
        )
```


---
<br>

Prev: [Introduction](introduction.md)
<br>
Next: [Covergroups](covergroups.md)
