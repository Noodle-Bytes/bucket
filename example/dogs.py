# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2024 Vypercore. All Rights Reserved


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
            ChewToysByNameAndBreed(names=["Barbara", "Connie", "Graham"]),
            name="chew_toys_by_name__group_a",
            description="Preferred chew toys by name (Group A)",
        )
        self.add_coverpoint(
            ChewToysByNameAndBreed(names=["Clive", "Derek", "Ethel"]),
            name="chew_toys_by_name__group_b",
            description="Preferred chew toys by name (Group B)",
        )

    def should_sample(self, trace):
        """
        This function is used to stop dog coverage being sampled when not relevant
        """
        return True if trace["type"] == "Dog" else False


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
        self.add_axis(
            name="age",
            values=list(range(16)),
            description="Dog age in years",
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
        # Buckets use str names, not values. If you want to compare against a value,
        # you must first convert the string back to int, etc
        # Any bucket with no goal assigned, will have the default goal applied
        if int(bucket.age) <= 1 and bucket.size in ["large"]:
            return goals.HECKIN_CHONKY

    def sample(self, trace):
        # Don't sample coverage if this isn't a dog
        if trace["type"] != "Dog":
            return

        self.bucket.clear()
        self.bucket.set_axes(name=trace["Name"], age=trace["Age"], size=trace["Weight"])
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
            values=["Slipper", "Ball", "Stick", "Ring"],
            description="Types of dog toys",
        )

        self.add_goal("NO_SLIPPERS", "Only puppies chew slippers!", illegal=True)
        self.add_goal(
            "FRONT_LEGS_ONLY",
            "Only care about seniors who pick their favourite front legs",
            ignore=True,
        )
        self.add_goal("STICK", "Yay sticks!", target=50)

    def apply_goals(self, bucket, goals):
        # Apply goal if any dog which is not a puppy likes slippers
        if bucket.age != "Puppy" and bucket.favourite_toy in ["Slipper"]:
            return goals.NO_SLIPPERS
        # Apply goal for senior dogs who chose a favourite back leg
        elif bucket.age == "Senior" and int(bucket.favourite_leg, base=0) & 0x3:
            return goals.FRONT_LEGS_ONLY
        # Apply goal for any time a dog picks stick (if above goals don't apply)
        elif bucket.favourite_toy == "Stick":
            return goals.STICK
        # Else default goal will be used

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()

        # This could also be achieved by creating the axis with
        # a dict which specifies ranges for each age group. Then the value
        # from trace can be set directly without processing here.
        dog_age = trace["Age"]
        if dog_age < 2:
            age = "Puppy"
        elif dog_age > 12:
            age = "Senior"
        else:
            age = "Adult"

        with self.bucket as bucket:
            bucket.set_axes(age=age, favourite_leg=trace["Leg"])

            # For when multiple values might need covering from one trace
            # Only need to set the axes that change
            for toy in range(len(trace["Chew_toy"])):
                bucket.set_axes(favourite_toy=trace["Chew_toy"][toy])
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
            values={
                "Border Collie": [0, 1],
                "Whippet": 2,
                "Labrador": 3,
                "Cockapoo": 4,
            },
            description="All known dog breeds",
        )
        self.add_axis(
            name="name",
            values=self.name_group,
            description="Most important dog names only",
        )
        self.add_axis(
            name="favourite_toy",
            values=["Slipper", "Ball", "Stick", "Ring"],
            description="Types of dog toys",
        )

        self.add_goal(
            "WEIRDO_DOG", "Collies named Barbara can't be trusted", ignore=True
        )

    def apply_goals(self, bucket, goals):
        if bucket.breed == "Border Collie" and bucket.name in ["Barbara"]:
            return goals.WEIRDO_DOG

    def sample(self, trace):
        # 'with bucket' is used, so bucket values are cleared each time
        # bucket can also be manually cleared by using bucket.clear()

        if trace["Name"] not in self.name_group:
            return

        with self.bucket as bucket:
            bucket.set_axes(
                breed=trace["Breed"],
                name=trace["Name"],
            )

            # For when multiple values might need covering from one trace
            # Only need to set the axes that change
            for toy in range(len(trace["Chew_toy"])):
                bucket.set_axes(favourite_toy=trace["Chew_toy"][toy])
                bucket.hit()
