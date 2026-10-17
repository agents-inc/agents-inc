import { describe, expect, it } from "vitest";

import { partialsRenderedBy } from "./template-partial-renders.js";

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

  // Tag order is the order the compiled sub-agent reads them in.
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

  it("finds nothing in a template that renders no partial", () => {
    expect(
      partialsRenderedBy("{{ agent.name }}\n{% if agent.effort %}high{% endif %}"),
    ).toStrictEqual([]);
  });

  it("does not read an include tag as a render", () => {
    expect(partialsRenderedBy('{% include "methodologies/write-verification" %}')).toStrictEqual(
      [],
    );
  });
});
