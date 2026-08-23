import { describe, expect, it } from "vitest";

import { partialsRenderedBy } from "./template-partial-renders.js";

/** The shape `agent.liquid` uses today, and the two variants one edit would introduce. */
const PLAIN_TAG = '{% render "methodologies/write-verification" %}';
const WHITESPACE_CONTROLLED_TAG = '{%- render "methodologies/success-criteria" -%}';
const SINGLE_QUOTED_TAG = "{% render 'methodologies/context-management' %}";

describe("partialsRenderedBy", () => {
  it("reads the partial out of a plain render tag", () => {
    expect(partialsRenderedBy(PLAIN_TAG)).toStrictEqual(["methodologies/write-verification"]);
  });

  it("reads the partial out of a whitespace-controlled tag", () => {
    expect(partialsRenderedBy(WHITESPACE_CONTROLLED_TAG)).toStrictEqual([
      "methodologies/success-criteria",
    ]);
  });

  it("reads the partial out of a single-quoted tag", () => {
    expect(partialsRenderedBy(SINGLE_QUOTED_TAG)).toStrictEqual([
      "methodologies/context-management",
    ]);
  });

  /**
   * Tag order, not alphabetical: the order the tags appear IS the order the compiled sub-agent
   * reads its methodologies in, so a reader that sorted would hide a reordering.
   */
  it("keeps the partials in the order the template renders them", () => {
    expect(
      partialsRenderedBy([SINGLE_QUOTED_TAG, PLAIN_TAG, WHITESPACE_CONTROLLED_TAG].join("\n")),
    ).toStrictEqual([
      "methodologies/context-management",
      "methodologies/write-verification",
      "methodologies/success-criteria",
    ]);
  });

  it("reports a partial rendered twice in one template once", () => {
    expect(partialsRenderedBy([PLAIN_TAG, PLAIN_TAG].join("\n"))).toStrictEqual([
      "methodologies/write-verification",
    ]);
  });

  /**
   * The subject guard. Every assertion above is satisfied by a reader that matched something;
   * only this one fails for a reader that has stopped matching, which is the state a renamed tag
   * would leave it in while every template still rendered.
   */
  it("finds nothing in a template that renders no partial", () => {
    expect(
      partialsRenderedBy("{{ agent.name }}\n{% if agent.effort %}high{% endif %}"),
    ).toStrictEqual([]);
  });

  /** `{% include %}` is Liquid's other partial tag and this template family does not use it. */
  it("does not read an include tag as a render", () => {
    expect(partialsRenderedBy('{% include "methodologies/write-verification" %}')).toStrictEqual(
      [],
    );
  });
});
