import { ZERO_LEVELS } from "./lib/prove/zeroes";
import { computeRoot, buildMerklePath } from "./lib/prove/tree";

const VAULT_EMPTY_REPAID_ROOT = 20368152519071207420741210154286002558339376628039128683703529931678614710902n;

const emptyPoolRoot = ZERO_LEVELS[16];
console.log("ZERO_LEVELS[16]:", emptyPoolRoot.toString());
console.log("vault empty repaid_root:", VAULT_EMPTY_REPAID_ROOT.toString());
console.log("MATCH?", emptyPoolRoot === VAULT_EMPTY_REPAID_ROOT);
