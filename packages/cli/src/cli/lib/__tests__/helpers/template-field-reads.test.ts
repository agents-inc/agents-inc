import { describe, expect, it } from "vitest";

import { agentFieldsReadBy } from "./template-field-reads.js";

/** The four Liquid shapes `agent.liquid` actually uses, each asking for exactly one field. */
const OUTPUT_TAG = "{{ agent.name }}";
const FILTERED_TAG = '{{ agent.model | default: "inherit" }}';
const CONDITION_TAG = "{% if agent.effort %}effort: {{ agent.effort }}{% endif %}";
const NESTED_LOOKUP = "{% if agent.disallowedTools.size > 0 %}";

describe("agentFieldsReadBy", () => {
  it("reads the field out of a plain output tag", () => {
    expect(agentFieldsReadBy(OUTPUT_TAG)).toStrictEqual(["name"]);
  });

  it("reads the field out of a filtered output tag", () => {
    expect(agentFieldsReadBy(FILTERED_TAG)).toStrictEqual(["model"]);
  });

  it("reports a field named twice in one template once", () => {
    expect(agentFieldsReadBy(CONDITION_TAG)).toStrictEqual(["effort"]);
  });

  /**
   * `size` is Liquid's own pseudo-property on the value the lookup returns, not a field of the
   * model. Capturing it would make the gate report a property `AgentConfig` must never have.
   */
  it("stops at the first segment, so a Liquid pseudo-property is not read as a field", () => {
    expect(agentFieldsReadBy(NESTED_LOOKUP)).toStrictEqual(["disallowedTools"]);
  });

  it("sorts and deduplicates across the whole template", () => {
    expect(agentFieldsReadBy([CONDITION_TAG, OUTPUT_TAG, FILTERED_TAG].join("\n"))).toStrictEqual([
      "effort",
      "model",
      "name",
    ]);
  });

  /**
   * The subject guard. Every assertion above is satisfied by a reader that matched something;
   * only this one fails for a reader that has stopped matching, which is the state a renamed
   * context key would leave it in while every template still rendered.
   */
  it("finds nothing in a template that never mentions the model", () => {
    expect(
      agentFieldsReadBy("{{ identity }}\n{% for id in preloadedSkillIds %}{{ id }}{% endfor %}"),
    ).toStrictEqual([]);
  });

  /** `agentBaseDir` starts with the word the lookup is rooted at; the boundary must not split it. */
  it("does not read a bare identifier that merely starts with the root name", () => {
    expect(agentFieldsReadBy("{{ agentBaseDir }}")).toStrictEqual([]);
  });
});
