# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved


from bucket import AxisUtils, Covergroup, Coverpoint

# This file contains useful reference code (such as example coverpoints,
# covergroups, etc), as well as some necessary code to get the example working
# outside of a full testbench.


# Covergroups
class TopDogs(Covergroup):
    """
    This covergroup contains all dog related coverage.
    """

    NAME = "dogs"
    DESCRIPTION = "Doggy coverage"

    def setup(self, ctx):
        self.add_coverpoint(DogStats())
        self.add_covergroup(DogsAndToys())

    def should_sample(self, trace):
        """
        This function is used to stop dog coverage being sampled when not relevant
        """
        return trace.pet_type == "Dog"


class DogsAndToys(Covergroup):
    """
    This is another covergroup to group similar coverpoints together.
    """

    NAME = "dog_and_their_toys"
    DESCRIPTION = "A group of coverpoints about dog chew toys"

    def setup(self, ctx):
        self.add_coverpoint(
            ChewToysByAgeAndFavLeg().set_tier(5).set_tags(["toys", "age", "legs"])
        )
        self.add_coverpoint(
            ChewToysByNameAndBreed(names=["Barbara", "Ethel", "Graham"]),
            name="chew_toys_by_name__group_a",
            description="Preferred chew toys by name (Group A)",
        )
        self.add_coverpoint(
            ChewToysByNameAndBreed(names=["Clive", "Derek", "Linda"]),
            name="chew_toys_by_name__group_b",
            description="Preferred chew toys by name (Group B)",
        )


class DogStats(Coverpoint):
    """
    This is an example coverpoint with 3 axes, each demonstrating a different way of
    specifying values to the axis.
    """

    NAME = "Doggy stats"
    DESCRIPTION = "Covering basic stats for all dogs"
    MOTIVATION = "Make sure we have seen a wide variety of dogs"
    TIER = 0
    TAGS = ["basic", "stats"]

    def setup(self, ctx):
        # The values passed to this axis are a simple list of str
        self.add_axis(
            name="name",
            values=ctx.pet_info.pet_names,
            description="All the acceptable dog names",
        )
        # The values passed to this axes is a list of int
        # "Other" is enabled, so any value above 15 will be grouped into "16+"
        self.add_axis(
            name="age",
            values=list(range(16)),
            description="Dog age in years",
            enable_other="16+",
        )
        # The values in this axis are named ranges, in a dict.
        # Single values and ranges can be mixed in a dict
        self.add_axis(
            name="size",
            values={"Small": [0, 10], "medium": [11, 30], "large": [31, 50]},
            description="Rough size estimate from weight",
        )

        # Here we create a new goal, defined as ILLEGAL
        # If a bucket with this goal applied is hit, when an error will be generated
        self.add_goal("HECKIN_CHONKY", "Puppies can't be this big!", illegal=True)

    def apply_goals(self, bucket, goals):
        # Each bucket axis has .name (string) and .value (actual value)
        # No need to convert strings anymore!
        # Any bucket with no goal assigned, will have the default goal applied
        if (
            bucket.age.name != "16+"
            and bucket.age.value <= 1
            and bucket.size.name in ["large"]
        ):
            return goals.HECKIN_CHONKY

    def sample(self, trace):
        # In this example, the bucket is manually cleared each time
        # before setting to new values.
        # Finally hit() is called to increment the hit count
        self.bucket.clear()
        self.bucket.set_axes(name=trace.name, age=trace.age, size=trace.info.weight)
        self.bucket.hit()


class ChewToysByAgeAndFavLeg(Coverpoint):
    """
    This is another example coverpoint. This one contains an axis demonstrating the use of
    common axis values provided as part of this library (eg. msb, one_hot)
    """

    NAME = "chew_toys_by_age"
    DESCRIPTION = "Cover preferred chew toys by age category and favourite leg"
    MOTIVATION = "Check that favourite leg does not affect preferred chew toy"

    def setup(self, ctx):
        self.add_axis(
            name="age",
            values=["Puppy", "Adult", "Senior"],
            description="Range of dog years",
        )

        self.add_axis(
            name="favourite_leg",
            values=AxisUtils.one_hot(width=4),
            description="This makes no sense to display as one_hot, but here we are",
        )

        self.add_axis(
            name="favourite_toy",
            values=ctx.pet_info.dog_chew_toys,
            description="Types of dog toys",
        )

        # Here are 3 example goals which are applied to the coverpoint's buckets.
        # ILLEGAL goals will generate an error if the bucket is hit
        # IGNORE goals will not be counted
        # TARGET goals modify the required hit count for the bucket
        self.add_goal("NO_SLIPPERS", "Only puppies chew slippers!", illegal=True)
        self.add_goal(
            "FRONT_LEGS_ONLY",
            "Only care about seniors who pick their favourite front legs",
            ignore=True,
        )
        self.add_goal("STICK", "Yay sticks!", target=50)

    def apply_goals(self, bucket, goals):
        # Apply goal if any dog which is not a puppy likes slippers
        if bucket.age.name != "Puppy" and bucket.favourite_toy.name in ["Slipper"]:
            return goals.NO_SLIPPERS
        # Apply goal for senior dogs who chose a favourite back leg
        elif (
            bucket.age.name == "Senior" and int(bucket.favourite_leg.name, base=0) & 0x3
        ):
            return goals.FRONT_LEGS_ONLY
        # Apply goal for any time a dog picks stick (if above goals don't apply)
        elif bucket.favourite_toy.name == "Stick":
            return goals.STICK
        # Else default goal will be used

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()

        # Dog age groups could also be achieved by creating the axis with
        # a dict which specifies ranges for each age group. Then the value
        # from trace can be set directly without processing here.
        dog_age = trace.age
        if dog_age < 2:
            age = "Puppy"
        elif dog_age > 12:
            age = "Senior"
        else:
            age = "Adult"

        with self.bucket as bucket:
            bucket.set_axes(age=age, favourite_leg=trace.info.leg)

            # For when multiple values might need covering from one trace
            # Only need to re-set the axes that change
            for toy in range(len(trace.info.chew_toy)):
                bucket.set_axes(favourite_toy=trace.info.chew_toy[toy])
                bucket.hit()


class ChewToysByNameAndBreed(Coverpoint):
    NAME = "incorrect_name_which_will_be_overridden"
    DESCRIPTION = "Incorrect description that will be overridden"
    MOTIVATION = (
        "Check we have seen all breed and all names pick each toy as their favourite"
    )
    TIER = 3
    TAGS = ["Toys", "Age", "Breed"]

    def __init__(self, names):
        self.name_group = names

    def setup(self, ctx):
        self.add_axis(
            name="breed",
            values=ctx.pet_info.dog_breeds,
            description="All known dog breeds",
        )
        self.add_axis(
            name="name",
            values=self.name_group,
            description="Most important dog names only",
        )
        self.add_axis(
            name="favourite_toy",
            values=ctx.pet_info.dog_chew_toys,
            description="Types of dog toys",
        )

        self.add_goal(
            "WEIRDO_DOG", "Collies named Barbara or Linda can't be trusted", ignore=True
        )

    def apply_goals(self, bucket, goals):
        if bucket.breed.name == "Border Collie" and bucket.name.name in [
            "Barbara",
            "Linda",
        ]:
            return goals.WEIRDO_DOG

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()

        # We're only covering a subset of names in this coverpoint instance
        if trace.name not in self.name_group:
            return

        with self.bucket as bucket:
            bucket.set_axes(
                breed=trace.breed,
                name=trace.name,
            )

            # For when multiple values might need covering from one trace
            # Only need to set the axes that change
            for toy in range(len(trace.info.chew_toy)):
                bucket.set_axes(favourite_toy=trace.info.chew_toy[toy])
                bucket.hit()
