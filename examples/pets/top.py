# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2024 Vypercore. All Rights Reserved

from bucket import Covertop

from .cats import TopCats
from .dogs import TopDogs


# Covertop should be used to group all of your coverage together
# It contains special functions to help filter coverpoints/covergroups
# as well as provide sampling functions, etc
class TopPets(Covertop):
    """
    This covertop is top level covergroup, containing all other covergroups/coverpoints.
    """

    NAME = "Pets"
    DESCRIPTION = "All my pet coverage"

    def setup(self, ctx):
        self.add_covergroup(TopDogs())
        self.add_covergroup(TopCats())
