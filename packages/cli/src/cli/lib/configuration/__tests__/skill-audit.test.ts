import { describe, it, expect } from "vitest";
import { skillAudit, auditVerdictsPendingApply } from "../skill-audit";
import { isFencedByMatrix } from "../../matrix/matrix-health-check";
import { BUILT_IN_MATRIX } from "../../../types/generated/matrix";
import { SKILL_MAP } from "../../../types/generated/source-types";
import { typedEntries, typedKeys } from "../../../utils/typed-object";
import type { SkillId, SkillSlug } from "../../../types";
import type { SkillAuditEntry } from "../skill-audit";

const CATALOG_SIZE = 237;
const AUDIT_DATE = "2026-08-07";
const BATCH_SIZES = {
  "web-core": 20,
  "web-state": 19,
  "web-ui": 22,
  "web-platform": 23,
  "api-core": 17,
  "api-data": 22,
  "api-services": 16,
  ai: 20,
  mobile: 24,
  desktop: 16,
  "infra-cli": 15,
  "shared-meta": 23,
};

const entries = typedEntries<SkillId, SkillAuditEntry>(skillAudit);
const validSlugs = new Set<string>(Object.keys(SKILL_MAP));

describe("skillAudit", () => {
  it("carries one entry per catalog skill", () => {
    expect(entries).toHaveLength(CATALOG_SIZE);
    expect(typedKeys(BUILT_IN_MATRIX.skills).sort()).toStrictEqual(typedKeys(skillAudit).sort());
  });

  it("records every verdict against the fan-out's verification date", () => {
    const offDate = entries.filter(([, entry]) => entry.audited !== AUDIT_DATE).map(([id]) => id);

    expect(offDate).toStrictEqual([]);
  });

  it("assigns every skill to the batch that audited it, at the sizes the worksheet partitioned", () => {
    const counts: Record<string, number> = {};
    for (const [, entry] of entries) counts[entry.batch] = (counts[entry.batch] ?? 0) + 1;

    expect(counts).toStrictEqual(BATCH_SIZES);
  });

  it("names only real skill slugs as classification frameworks", () => {
    const unknown = entries.flatMap(([id, entry]) =>
      (entry.classification?.frameworks ?? [])
        .filter((slug: SkillSlug) => !validSlugs.has(slug))
        .map((slug: SkillSlug) => `${id} -> ${slug}`),
    );

    expect(unknown).toStrictEqual([]);
  });

  it("gives class A an empty framework list and class B exactly one framework", () => {
    const malformed = entries
      .filter(([, entry]) => {
        const { classification } = entry;
        if (!classification) return false;
        if (classification.class === "A") return classification.frameworks.length !== 0;
        if (classification.class === "B") return classification.frameworks.length !== 1;
        return false;
      })
      .map(([id]) => id);

    expect(malformed).toStrictEqual([]);
  });

  // The manifest's whole purpose is that a verdict is a claim about a mechanism, not a mood.
  // Checking all 237 rows against the live rules catches transcription slips no reviewer would.
  it("backs every constrained verdict with a requires rule or an exclusive category", () => {
    const unbacked = entries
      .filter(
        ([id, entry]) =>
          entry.verdict === "constrained-via-exclusivity-or-requires" &&
          !isFencedByMatrix(BUILT_IN_MATRIX, id) &&
          !auditVerdictsPendingApply[id],
      )
      .map(([id]) => id);

    expect(unbacked).toStrictEqual([]);
  });

  it("leaves every universal verdict genuinely unfenced", () => {
    const fenced = entries
      .filter(
        ([id, entry]) =>
          entry.verdict === "universal" &&
          isFencedByMatrix(BUILT_IN_MATRIX, id) &&
          !auditVerdictsPendingApply[id],
      )
      .map(([id]) => id);

    expect(fenced).toStrictEqual([]);
  });
});

describe("auditVerdictsPendingApply", () => {
  // The manifest recorded these verdicts against category shapes that had not landed.
  // With every one of those dispositions applied, the live rules back all 237 rows.
  it("is empty, since no verdict is still waiting on a category disposition", () => {
    expect(typedKeys(auditVerdictsPendingApply)).toStrictEqual([]);
  });

  // A stale exemption is as damaging as a missing one: it would silently re-open the
  // "empty means audited, or nobody looked?" ambiguity the manifest exists to close.
  it("matches the live gap exactly, so entries cannot outlive the disposition they wait on", () => {
    const liveGap = entries
      .filter(([id, entry]) => {
        const fenced = isFencedByMatrix(BUILT_IN_MATRIX, id);
        return entry.verdict === "universal" ? fenced : !fenced;
      })
      .map(([id]) => id)
      .sort();

    expect(typedKeys(auditVerdictsPendingApply).sort()).toStrictEqual(liveGap);
  });

  it("names the batch that owns each pending disposition", () => {
    const unattributed = typedEntries<SkillId, string>(auditVerdictsPendingApply)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      .filter(([, reason]) => !/^B\d+ — pending /.test(reason ?? ""))
      .map(([id]) => id);

    expect(unattributed).toStrictEqual([]);
  });
});
