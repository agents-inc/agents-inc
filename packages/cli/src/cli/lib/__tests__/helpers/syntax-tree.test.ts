import ts from "typescript";
import { describe, expect, it } from "vitest";

import { eachNode, isFunctionLiteral } from "./syntax-tree.js";

const NESTED_CALL = `outer(inner(leaf));`;

const EVERY_FUNCTION_SHAPE = [
  `const arrow = () => 1;`,
  `const expression = function () {};`,
  `const named = function named() {};`,
  `function declared() {}`,
  `const holder = { method() {} };`,
  `const call = make();`,
  ``,
].join("\n");

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true);
}

describe("eachNode", () => {
  it("visits every descendant, each parent before its children", () => {
    const file = parse(NESTED_CALL);
    const visited: string[] = [];

    eachNode(file, (node) => {
      if (ts.isCallExpression(node) || ts.isIdentifier(node)) visited.push(node.getText(file));
    });

    expect(visited).toStrictEqual(["outer(inner(leaf))", "outer", "inner(leaf)", "inner", "leaf"]);
  });

  it("visits the root it is handed first", () => {
    const file = parse(NESTED_CALL);
    const visited: ts.Node[] = [];

    eachNode(file, (node) => visited.push(node));

    expect(visited[0]).toBe(file);
  });
});

describe("isFunctionLiteral", () => {
  it("holds for arrow and function expressions only, not declarations, methods or calls", () => {
    const file = parse(EVERY_FUNCTION_SHAPE);
    const literals: string[] = [];

    eachNode(file, (node) => {
      if (isFunctionLiteral(node)) literals.push(node.getText(file));
    });

    expect(literals).toStrictEqual(["() => 1", "function () {}", "function named() {}"]);
  });
});
