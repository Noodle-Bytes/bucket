# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

from bucket import Covergroup, Coverpoint

# This file contains useful reference code (such as example coverpoints,
# covergroups, etc), as well as some necessary code to get the example working
# outside of a full testbench.


# Covergroups
class TopCats(Covergroup):
    """
    This covergroup contains all cat related coverage.
    """

    NAME = "cats"
    DESCRIPTION = "Kitty coverage"

    def setup(self, ctx):
        self.add_coverpoint(CatStats())
        self.add_covergroup(CatsAndToys())
        self.add_coverpoint(VIPNames())

    def should_sample(self, trace):
        """
        This function is used to stop cat coverage being sampled when not relevant
        """
        return trace.pet_type == "Cat"


class CatsAndToys(Covergroup):
    """
    This is another covergroup to group similar coverpoints together.
    """

    NAME = "play_toys"
    DESCRIPTION = "A group of coverpoints about cat play toys"

    def setup(self, ctx):
        self.add_coverpoint(PlayToysByAge())

        # Split names into groups, then assign to coverpoints
        name_groups = {"A-C": [], "D-F": [], "Other": []}
        for name in ctx.pet_info.pet_names:
            if name < "D":
                name_groups["A-C"].append(name)
            elif name < "G":
                name_groups["D-F"].append(name)
            else:
                name_groups["Other"].append(name)

        for idx, group in enumerate(name_groups.keys()):
            self.add_coverpoint(
                PlayToysByName(name_group=name_groups[group]),
                name=f"play_toys_by_name__group_{idx}",
                description=f"Preferred play toys by name (Group {idx})",
            )


class CatStats(Coverpoint):
    """
    This is an example coverpoint with 3 axes, each demonstrating a different way of
    specifying values to the axis.
    """

    # No name provided to demonstrate that class name will be used
    DESCRIPTION = "Some basic cat stats"
    TIER = 1
    TAGS = ["basic", "stats"]

    def __init__(self):
        # Shortlist of names we care about
        self.important_names = [
            "Clive",
            "Derek",
            "Ethel",
            "Barbara",
            "Linda",
            "Graham",
        ]

    def setup(self, ctx):
        # The values passed to this axis are a simple list of str
        self.add_axis(
            name="name",
            values=self.important_names,
            description="All the acceptable cat names",
        )
        # The values passed to this axes is a list of int
        self.add_axis(
            name="age",
            values=list(range(19)),
            description="Cat age in years",
        )
        # The values in this axis are named ranges, in a dict.
        # Single values and ranges can be mixed in a dict
        self.add_axis(
            name="evil_thoughts",
            values={"low": [0, 10], "medium": [11, 30], "high (normal)": [31, 50]},
            description="Number of evil thoughts per day",
        )

        # Here we create a new goal, defined as ILLEGAL
        # If a bucket with this goal applied is hit, when an error will be generated
        self.add_goal(
            "SUSPICIOUS",
            "Old cats are quite evil and need to be seen more often!",
            target=100,
        )

    def apply_goals(self, bucket, goals):
        # Buckets use str names, not values. If you want to compare against a value,
        # you must first convert the string back to int, etc
        # Any bucket with no goal assigned, will have the default goal applied
        if int(bucket.age) >= 13 and bucket.evil_thoughts in ["low"]:
            return goals.SUSPICIOUS

    def sample(self, trace):
        if trace.name not in self.important_names:
            return

        self.bucket.clear()
        self.bucket.set_axes(
            name=trace.name,
            age=trace.age,
            evil_thoughts=trace.info.evil_thoughts_per_hour,
        )
        self.bucket.hit()


class PlayToysByAge(Coverpoint):
    """
    This is another example coverpoint. This one contains an axis demonstrating the use of
    common axis values provided as part of this library (eg. msb, one_hot)
    """

    NAME = "play_toys_by_age"
    DESCRIPTION = "Preferred play toys by age"

    def setup(self, ctx):
        self.add_axis(
            name="breed",
            values=ctx.pet_info.cat_breeds,
            description="All known cat breeds",
        )
        self.add_axis(
            name="age",
            values=["Kitten", "Adult", "Senior"],
            description="Range of cat years",
        )
        self.add_axis(
            name="favourite_toy",
            values=["Toy_mouse", "Scratching Post", "Laser", "Box"],
            description="Types of cat toys",
        )

        self.add_goal("BOX", "Cats love boxes!", target=150)

    def apply_goals(self, bucket, goals):
        # Apply goal for any time a cat picks box
        if bucket.favourite_toy == "Box":
            return goals.BOX
        # Else default goal will be used

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()

        # This could also be achieved by creating the axis with
        # a dict which specifies ranges for each age group. Then the value
        # from trace can be set directly without processing here.
        cat_age = trace.age
        if cat_age < 2:
            age = "Kitten"
        elif cat_age > 15:
            age = "Senior"
        else:
            age = "Adult"

        with self.bucket as bucket:
            bucket.set_axes(breed=trace.breed, age=age)
            bucket.set_axes(favourite_toy=trace.info.play_toy)
            bucket.hit()


class PlayToysByName(Coverpoint):
    def __init__(self, name_group):
        self.valid_names = name_group

    def setup(self, ctx):
        self.add_axis(
            name="breed",
            values=ctx.pet_info.cat_breeds,
            description="All known cat breeds",
        )
        self.add_axis(
            name="name",
            values=self.valid_names,
            description="Most important cat names only",
        )
        self.add_axis(
            name="favourite_toy",
            values=["Toy_mouse", "Scratching Post", "Laser", "Box"],
            description="Types of cat toys",
        )

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()
        if trace.name not in self.valid_names:
            return

        with self.bucket as bucket:
            bucket.set_axes(
                breed=trace.breed,
                name=trace.name,
                favourite_toy=trace.info.play_toy,
            )
            bucket.hit()


class VIPNames(Coverpoint):
    NAME = "VIPs"
    DESCRIPTION = "Only important cat breeds"

    def __init__(self):
        self.important_names = ["Clive", "Derek"]

    def setup(self, ctx):
        self.add_axis(
            name="breed",
            values=ctx.pet_info.cat_breeds,
            description="All known cat breeds",
        )
        # This axis uses the automatic 'other' to cover
        # any values not explicitly provided
        self.add_axis(
            name="name",
            values=self.important_names,
            description="VIP names only",
            enable_other="Plebs",
        )

        self.add_axis(
            name="superiority_factor",
            values=ctx.pet_info.cat_superiority,
            description="All known cat breeds",
        )

    def sample(self, trace):
        with self.bucket as bucket:
            bucket.set_axes(
                breed=trace.breed,
                name=trace.name,
                superiority_factor=trace.info.superiority_factor,
            )
            bucket.hit()
