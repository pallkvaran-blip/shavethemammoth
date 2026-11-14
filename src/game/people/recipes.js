// The people of the place, by name: what to bake for each (see bake.js).
// (Arithmetic only: this is what the baking thread loads.)
import { elfRecipe } from './elf.recipe.js';
import { gnomeRecipe } from './gnome.recipe.js';
import { vultureRecipe } from './vulture.recipe.js';
import { lemmingRecipe } from './lemming.recipe.js';
import { cavemanRecipe } from './caveman.recipe.js';

export const RECIPES = { elf: elfRecipe, gnome: gnomeRecipe, vulture: vultureRecipe, lemming: lemmingRecipe, caveman: cavemanRecipe };
