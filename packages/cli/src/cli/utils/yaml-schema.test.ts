import { describe, expect, it } from "vitest";

import { stripYamlSchemaComment, yamlSchemaComment } from "./yaml-schema.js";

const SCHEMA_LINE = "# yaml-language-server: $schema=../schemas/metadata.schema.json";
const BODY = "category: web-framework\ndisplayName: React\n";

describe("stripYamlSchemaComment", () => {
  it("splits off a leading schema comment, keeping its newline, and hands back the rest", () => {
    expect(stripYamlSchemaComment(`${SCHEMA_LINE}\n${BODY}`)).toStrictEqual({
      schemaComment: `${SCHEMA_LINE}\n`,
      yamlContent: BODY,
    });
  });

  it("leaves a file with no schema comment whole", () => {
    expect(stripYamlSchemaComment(BODY)).toStrictEqual({ schemaComment: "", yamlContent: BODY });
  });

  it("strips only a comment on the first line, and only one that opens with the marker", () => {
    const later = `${BODY}${SCHEMA_LINE}\n`;
    const trailing = `category: web-framework # yaml-language-server:\n`;

    expect(stripYamlSchemaComment(later)).toStrictEqual({ schemaComment: "", yamlContent: later });
    expect(stripYamlSchemaComment(trailing)).toStrictEqual({
      schemaComment: "",
      yamlContent: trailing,
    });
  });

  it("reads back the comment yamlSchemaComment writes", () => {
    const comment = yamlSchemaComment("../schemas/metadata.schema.json");

    expect(stripYamlSchemaComment(`${comment}\n${BODY}`).schemaComment).toBe(`${SCHEMA_LINE}\n`);
  });
});
