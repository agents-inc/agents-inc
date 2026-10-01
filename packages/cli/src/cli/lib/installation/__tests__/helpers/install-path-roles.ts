/**
 * Which of an installation's path roles explains each path a recorded tree holds.
 *
 * Written for the Claude golden trees, so that "Claude's install output does not move" can be
 * asserted through what a real install RECORDED rather than by restating the same paths in a spec
 * — a restatement moves with whoever edits it and pins nothing about the product.
 *
 * It answers three questions and keeps them apart, because each fails differently:
 *
 * - **unclaimed** — the install wrote somewhere no role names. A role that moved produces this,
 *   and so does a role the step forgot to add.
 * - **contested** — two roles claim one path, so neither answer is definite. A role widened to a
 *   parent directory produces this before it produces anything else.
 * - **exercised** — the roles that claim at least one path. It is the subject guard: an
 *   attribution over roles that claim nothing has an empty `unclaimed` for a reason that has
 *   nothing to do with where the install wrote.
 *
 * A site AT THE TREE ROOT is refused rather than reported, because it claims every path and
 * explains none — which would make `unclaimed` empty for every tree ever handed to it, and this
 * whole file green for that reason.
 *
 * It parses nothing: a claim is a path equality or a path being inside a directory. The two
 * discriminating halves — a path under no site and a path under two — carry the logic, and
 * `install-path-roles.test.ts` beside this file drives both.
 */

/** One role's answer: the name a verdict reports it under, and where it sits in the tree. */
export type RoleSite = {
  /**
   * How the role is named in a verdict. The callers write `<role>@<scope>`, because one role
   * answers a different directory per scope and a verdict naming only the role cannot say which
   * of the two moved.
   */
  role: string;
  /** Where it sits, relative to the tree's root, in POSIX form and never with a trailing slash. */
  at: string;
};

/** One recorded path and every site that claims it, in the order the sites were given. */
export type PathClaim = { path: string; roles: string[] };

export type Attribution = {
  /** Every path handed in, with its claims. Nothing is dropped, so a reader can see the whole tree. */
  claims: PathClaim[];
  /** Paths no site claims, in the order they were given. */
  unclaimed: string[];
  /** Paths more than one site claims, in the order they were given. */
  contested: string[];
  /** Every site that claims at least one path, by name, sorted and deduplicated. */
  exercised: string[];
};

/** What a site standing at the tree root is refused with, so a spec can assert the refusal. */
export const ROOT_SITE_REFUSED = "a role site at the tree root claims every path and explains none";

/** The spellings that name the tree root itself rather than a directory inside it. */
const TREE_ROOT_SPELLINGS = ["", ".", "/", "./"];

function isTreeRoot(at: string): boolean {
  return TREE_ROOT_SPELLINGS.includes(at);
}

function claimsPath(site: RoleSite, recorded: string): boolean {
  return recorded === site.at || recorded.startsWith(`${site.at}/`);
}

/**
 * Attributes each recorded path to the sites that claim it.
 *
 * @throws when any site stands at the tree root — see {@link ROOT_SITE_REFUSED}.
 */
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
