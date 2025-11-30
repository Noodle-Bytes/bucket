# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

from dataclasses import dataclass


class MadeUpStuff:
    """
    Example pet info to pass into coverage.
    In a real testbench, this would likely be a machine readable ISA, etc
    """

    pet_names = [
        "Clive",
        "Derek",
        "Ethel",
        "Barbara",
        "Linda",
        "Graham",
        "Edward",
        "Stuart",
        "Peter",
    ]

    dog_breeds = {
        "Border Collie": [0, 1],
        "Whippet": 2,
        "Cockapoo": 3,
        "Golden Retriever": 4,
    }
    dog_chew_toys = ["Slipper", "Ball", "Stick", "Ring"]

    cat_breeds = {"Bengal": 0, "Burmese": 1, "Maine Coon": 2, "Persian": 3, "Nyan": 4}
    cat_superiority = ["low", "medium", "high"]
    cat_play_toy = ["Toy_mouse", "Scratching Post", "Laser", "Box"]


@dataclass
class DogInfo:
    chew_toy: list[str] | None = None
    weight: int | None = None
    leg: int | None = None


@dataclass
class CatInfo:
    evil_thoughts_per_hour: int | None = None
    superiority_factor: str | None = None
    play_toy: str | None = None


@dataclass
class PetInfo:
    pet_type: str | None = None
    breed: str | None = None
    age: int | None = None
    name: str | None = None

    info: DogInfo | CatInfo | None = None
