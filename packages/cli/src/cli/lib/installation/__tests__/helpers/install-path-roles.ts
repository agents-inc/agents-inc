/**
 * Attributes each path a recorded tree holds to the path roles that claim it: unclaimed,
 * contested and exercised. A site at the tree root is refused, since it would claim everything.
 */

export type RoleSite = {
  /** `<role>@<scope>`, since one role answers a different directory per scope. */
  role: string;
  /** Tree-relative, POSIX form, no trailing slash. */
  at: string;
};

type PathClaim = { path: string; roles: string[] };

export type Attribution = {
  claims: PathClaim[];
  unclaimed: string[];
  contested: string[];
  exercised: string[];
};

export const ROOT_SITE_REFUSED = "a role site at the tree root claims every path and explains none";

const TREE_ROOT_SPELLINGS = ["", ".", "/", "./"];

function isTreeRoot(at: string): boolean {
  return TREE_ROOT_SPELLINGS.includes(at);
}

function claimsPath(site: RoleSite, recorded: string): boolean {
  return recorded === site.at || recorded.startsWith(`${site.at}/`);
}

/** @throws when any site stands at the tree root. */
export function attributeByRole(
  recorded: readonly string[],
  sites: readonly RoleSite[],
): Attribution {
  const atRoot = sites.filter((site) => isTreeRoot(site.at));
  if (atRoot.length > 0) {
    throw new Error(`${ROOT_SITE_REFUSED}: ${atRoot.map((site) => site.role).join(", ")}`);
  }

  const claims = recorded.map((path) => ({
    path,
    roles: sites.filter((site) => claimsPath(site, path)).map((site) => site.role),
  }));

  return {
    claims,
    unclaimed: claims.filter((claim) => claim.roles.length === 0).map((claim) => claim.path),
    contested: claims.filter((claim) => claim.roles.length > 1).map((claim) => claim.path),
    exercised: [...new Set(claims.flatMap((claim) => claim.roles))].sort(),
  };
}
