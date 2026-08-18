import { describe, it, expect, beforeEach } from "vitest";
import { getActiveStepFlow, hydrateWizardStore, useWizardStore } from "./wizard-store";
import { initializeMatrix } from "../lib/matrix/matrix-provider";
import { SKILLS, TEST_CATEGORIES } from "../lib/__tests__/test-fixtures";
import { createMockMatrix } from "../lib/__tests__/factories/matrix-factories";
import { buildSkillConfigs } from "../lib/__tests__/helpers/wizard-simulation";
import { buildAgentConfigs } from "../lib/__tests__/factories/config-factories";
import { typedKeys } from "../utils/typed-object";
import {
  ALL_SKILLS_TEST_CATEGORIES_MATRIX,
  ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX,
  ALL_SKILLS_WEB_AND_API_MATRIX,
  MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX,
  REACT_HONO_FRAMEWORK_API_MATRIX,
  REACT_HONO_ONE_STACK_MATRIX,
  REACT_HONO_WEB_API_DOMAINS_MATRIX,
} from "../lib/__tests__/mock-data/mock-matrices";
import { CUSTOM_HOUSE_TOOLING_ID } from "../lib/__tests__/mock-data/mock-skills";
import type { AgentScopeConfig, Category, SkillConfig } from "../types";
import { EXPECTED_AGENTS } from "../lib/__tests__/expected-values";
import { BUILT_IN_MATRIX } from "../types/generated/matrix";
import { getIncompatibleReason, validateSelection } from "../lib/matrix";
import { DEFAULT_PUBLIC_SOURCE_NAME, DEFAULT_SCRATCH_DOMAINS, EJECT_SOURCE } from "../consts";
import { elementAt, firstElement } from "../lib/__tests__/helpers/element-at.js";

/**
 * Mirrors how the wizard supplies the `exclusive` argument in
 * `components/hooks/use-build-step-props.ts` — read off the live matrix, never hardcoded —
 * so these tests exercise the real radio-versus-multi-select decision.
 */
const categoryIsExclusive = (category: Category): boolean =>
  BUILT_IN_MATRIX.categories[category]?.exclusive ?? true;

/** A provenance that is neither `eject` nor the public marketplace, so the decode is unambiguous. */
const PRIVATE_MARKETPLACE_NAME = "Acme Corp";

describe("WizardStore", () => {
  beforeEach(() => {
    initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
  });

  describe("initial state", () => {
    it("should start at stack step", () => {
      const { step } = useWizardStore.getState();
      expect(step).toBe("stack");
    });

    it("should have no approach selected", () => {
      const { approach } = useWizardStore.getState();
      expect(approach).toBeNull();
    });

    it("should have no selected stack", () => {
      const { selectedStackId } = useWizardStore.getState();
      expect(selectedStackId).toBeNull();
    });

    it("should have empty skillConfigs", () => {
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([]);
    });

    it("should have null focusedSkillId", () => {
      const { focusedSkillId } = useWizardStore.getState();
      expect(focusedSkillId).toBeNull();
    });

    it("should have empty unresolvableSkillIds", () => {
      const { unresolvableSkillIds } = useWizardStore.getState();
      expect(unresolvableSkillIds).toStrictEqual([]);
    });

    it("should have empty navigation history", () => {
      const { history } = useWizardStore.getState();
      expect(history).toStrictEqual([]);
    });

    it("should have empty selected domains", () => {
      const { selectedDomains } = useWizardStore.getState();
      expect(selectedDomains).toStrictEqual([]);
    });

    it("should have empty domain selections", () => {
      const { domainSelections } = useWizardStore.getState();
      expect(domainSelections).toStrictEqual({});
    });
  });

  describe("step navigation", () => {
    it("should update step with setStep", () => {
      const store = useWizardStore.getState();
      store.setStep("stack");

      const { step } = useWizardStore.getState();
      expect(step).toBe("stack");
    });

    it("should track navigation history when setting step", () => {
      const store = useWizardStore.getState();

      store.setStep("build");
      store.setStep("confirm");

      const { history } = useWizardStore.getState();
      expect(history).toStrictEqual(["stack", "build"]);
    });

    it("should go back through history", () => {
      const store = useWizardStore.getState();

      store.setStep("build");
      store.setStep("confirm");
      store.goBack();

      const { step, history } = useWizardStore.getState();
      expect(step).toBe("build");
      expect(history).toStrictEqual(["stack"]);
    });

    it("when goBack is called with empty history, should no-op", () => {
      const store = useWizardStore.getState();

      store.setStep("build");
      store.goBack();
      const afterFirstGoBack = useWizardStore.getState();
      expect(afterFirstGoBack.step).toBe("stack");
      expect(afterFirstGoBack.history).toStrictEqual([]);

      store.goBack();
      const afterSecondGoBack = useWizardStore.getState();
      expect(afterSecondGoBack.step).toBe("stack");
      expect(afterSecondGoBack.history).toStrictEqual([]);
    });

    it("goBack from a mid-wizard step with empty history is a no-op", () => {
      useWizardStore.setState({ step: "build", history: [] });

      useWizardStore.getState().goBack();

      const { step, history } = useWizardStore.getState();
      expect(step).toBe("build");
      expect(history).toStrictEqual([]);
    });
  });

  describe("approach selection", () => {
    it("should set approach to stack", () => {
      const store = useWizardStore.getState();
      store.setApproach("stack");

      const { approach } = useWizardStore.getState();
      expect(approach).toBe("stack");
    });

    it("should set approach to scratch", () => {
      const store = useWizardStore.getState();
      store.setApproach("scratch");

      const { approach } = useWizardStore.getState();
      expect(approach).toBe("scratch");
    });
  });

  describe("stack selection", () => {
    it("should select stack by id", () => {
      const store = useWizardStore.getState();
      store.selectStack("nextjs-fullstack");

      const state = useWizardStore.getState();
      expect(state.selectedStackId).toBe("nextjs-fullstack");
      expect(state.domainSelections).toStrictEqual({});
      expect(state.selectedDomains).toStrictEqual([]);
      expect(state.skillConfigs).toStrictEqual([]);
      expect(state.selectedAgents).toStrictEqual([]);
      expect(state.stackAction).toBeNull();
    });

    it("when selectStack is called with null, should clear previously selected stack and selections", () => {
      const store = useWizardStore.getState();
      store.selectStack("nextjs-fullstack");
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.selectStack(null);

      const state = useWizardStore.getState();
      expect(state.selectedStackId).toBeNull();
      expect(state.domainSelections).toStrictEqual({});
      expect(state.selectedDomains).toStrictEqual([]);
      expect(state.skillConfigs).toStrictEqual([]);
      expect(state.selectedAgents).toStrictEqual([]);
      expect(state.currentDomainIndex).toBe(0);
      expect(state.stackAction).toBeNull();
    });

    it("should clear previous selections when changing from one stack to another", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      // Simulate selecting a stack and populating
      store.populateFromSkillIds(["web-framework-react", "api-framework-hono"]);

      const stateAfterFirst = useWizardStore.getState();
      expect(typedKeys(stateAfterFirst.domainSelections)).toStrictEqual(["web", "api"]);

      // Simulate going back and selecting "start from scratch"
      store.selectStack(null);

      const stateAfterClear = useWizardStore.getState();
      expect(stateAfterClear.selectedStackId).toBeNull();
      expect(stateAfterClear.domainSelections).toStrictEqual({});
      expect(stateAfterClear.selectedDomains).toStrictEqual([]);
      expect(stateAfterClear.skillConfigs).toStrictEqual([]);
      expect(stateAfterClear.selectedAgents).toStrictEqual([]);
      expect(stateAfterClear.stackAction).toBeNull();
    });
  });

  describe("domain selection", () => {
    it("should toggle domain on", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");

      const { selectedDomains, domainSelections } = useWizardStore.getState();
      expect(selectedDomains).toStrictEqual(["web"]);
      expect(domainSelections).toStrictEqual({});
    });

    it("should toggle domain off", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("web");

      const { selectedDomains, domainSelections, skillConfigs } = useWizardStore.getState();
      expect(selectedDomains).toStrictEqual([]);
      expect(domainSelections).toStrictEqual({});
      expect(skillConfigs).toStrictEqual([]);
    });

    it("should allow multiple domain selection", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.toggleDomain("cli");

      const { selectedDomains } = useWizardStore.getState();
      expect(selectedDomains).toStrictEqual(["web", "api", "cli"]);
    });

    it("should remove skills from deselected domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);

      store.toggleDomain("web");

      const { domainSelections, selectedDomains, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web).toBeUndefined();
      expect(selectedDomains).toStrictEqual([]);
      expect(skillConfigs).toStrictEqual([]);
      expect(store.getAllSelectedTechnologies()).toStrictEqual([]);
      expect(store.getTechnologyCount()).toBe(0);
    });

    it("should not affect skills in other domains when deselecting a domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      store.toggleDomain("web");

      const { domainSelections, selectedDomains, skillConfigs } = useWizardStore.getState();
      expect(selectedDomains).toStrictEqual(["api"]);
      expect(domainSelections.web).toBeUndefined();
      expect(domainSelections.api!["api-api"]).toStrictEqual(["api-framework-hono"]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["api-framework-hono"], { scope: "global", origin: "agents-inc" }),
      );
      expect(store.getAllSelectedTechnologies()).toStrictEqual(["api-framework-hono"]);
    });

    it("should not auto-select skills when toggling domain on", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web).toBeUndefined();
      expect(skillConfigs).toStrictEqual([]);
      expect(store.getAllSelectedTechnologies()).toStrictEqual([]);
    });

    it("should reflect correct technology count after domain deselection", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      expect(store.getTechnologyCount()).toBe(3);

      store.toggleDomain("web");

      expect(store.getTechnologyCount()).toBe(1);
      expect(store.getAllSelectedTechnologies()).toStrictEqual(["api-framework-hono"]);
    });

    it("should restore stack skills when re-toggling a domain ON after populateFromSkillIds", () => {
      const store = useWizardStore.getState();

      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      store.populateFromSkillIds(["web-framework-react", "api-framework-hono"]);

      // Deselect web domain (clears its skills)
      store.toggleDomain("web");
      expect(useWizardStore.getState().domainSelections.web).toBeUndefined();

      // Re-select web domain (should restore stack skills)
      store.toggleDomain("web");
      const { domainSelections } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
    });

    it("should not restore skills when no stack was populated", () => {
      const store = useWizardStore.getState();

      // Manually toggle domain and add skills (no stack)
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      // Deselect web domain
      store.toggleDomain("web");

      // Re-select web domain — no stack snapshot, so no restoration
      store.toggleDomain("web");
      const { domainSelections } = useWizardStore.getState();
      expect(domainSelections.web).toBeUndefined();
      expect(store.getAllSelectedTechnologies()).toStrictEqual([]);
    });
  });

  describe("technology selection", () => {
    it("should toggle technology in exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("should replace technology in exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-vue-composition-api", true);

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual([
        "web-framework-vue-composition-api",
      ]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-vue-composition-api"], {
          scope: "global",
          origin: "agents-inc",
        }),
      );
    });

    it("should toggle off technology in exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual([]);
      expect(skillConfigs).toStrictEqual([]);
    });

    it("should allow multiple selections in non-exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);
      store.toggleTechnology("web", "web-testing", "web-testing-playwright-e2e", false);

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web!["web-testing"]).toStrictEqual([
        "web-testing-vitest",
        "web-testing-playwright-e2e",
      ]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-testing-vitest", "web-testing-playwright-e2e"], {
          scope: "global",
          origin: "agents-inc",
        }),
      );
    });

    it("should toggle off technology in non-exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", false);
      store.toggleTechnology("web", "web-styling", "web-styling-tailwind", false);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", false);

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.web!["web-styling"]).toStrictEqual(["web-styling-tailwind"]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-styling-tailwind"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("should block toggling globally installed skills from project scope and set toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
      expect(toastMessage).toBe("Global skills cannot be changed from project scope");
    });

    it("should block toggling globally installed skills in init mode too, with the same toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: true,
      });

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { domainSelections, skillConfigs, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
      expect(
        skillConfigs,
        "a blocked deselect must leave the global entry active — no tombstone",
      ).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
      expect(toastMessage).toBe("Global skills cannot be changed from project scope");
    });

    it("should block selecting a different skill in an exclusive category when it would implicitly deselect a global skill", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleTechnology("web", "web-client-state", "web-state-pinia", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-client-state"]).toStrictEqual(["web-state-zustand"]);
      expect(toastMessage).toBe("Global skills cannot be changed from project scope");
    });

    it("should allow selecting a different skill in an exclusive category when editing from global scope", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
        isEditingFromGlobalScope: true,
        isInitMode: false,
      });

      store.toggleTechnology("web", "web-client-state", "web-state-pinia", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-client-state"]).toStrictEqual(["web-state-pinia"]);
      expect(toastMessage).toBeNull();
    });

    it("should block deselecting the only skill in an exclusive+required category", () => {
      const m = createMockMatrix(...Object.values(SKILLS));
      m.categories["api-api"] = { ...TEST_CATEGORIES.api, required: true };
      initializeMatrix(m);
      const store = useWizardStore.getState();
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.api!["api-api"]).toStrictEqual(["api-framework-hono"]);
      expect(toastMessage).toBe("Cannot deselect the only skill in this category");
    });

    it("should allow deselecting the only skill in a non-required category", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);

      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-testing"]).toStrictEqual([]);
      expect(toastMessage).toBeNull();
    });

    it("should allow deselecting in a category with multiple skills", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.web!["web-framework"]).toStrictEqual([]);
      expect(toastMessage).toBeNull();
    });

    it("should allow selecting in a single-skill category", () => {
      const store = useWizardStore.getState();

      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      const { domainSelections, toastMessage } = useWizardStore.getState();
      expect(domainSelections.api!["api-api"]).toStrictEqual(["api-framework-hono"]);
      expect(toastMessage).toBeNull();
    });
  });

  describe("non-exclusive categories in the built-in matrix", () => {
    beforeEach(() => {
      initializeMatrix(BUILT_IN_MATRIX);
    });

    it("should keep the task runner and the workspace manager both selected, in their own categories", () => {
      const store = useWizardStore.getState();

      store.toggleTechnology(
        "shared",
        "shared-task-runner",
        "shared-monorepo-turborepo",
        categoryIsExclusive("shared-task-runner"),
      );
      store.toggleTechnology(
        "shared",
        "shared-monorepo",
        "shared-monorepo-pnpm-workspaces",
        categoryIsExclusive("shared-monorepo"),
      );

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.shared!["shared-task-runner"]).toStrictEqual([
        "shared-monorepo-turborepo",
      ]);
      expect(domainSelections.shared!["shared-monorepo"]).toStrictEqual([
        "shared-monorepo-pnpm-workspaces",
      ]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["shared-monorepo-turborepo", "shared-monorepo-pnpm-workspaces"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );
    });

    it("should raise no validation error for either task runner alongside pnpm-workspaces", () => {
      expect(
        validateSelection(["shared-monorepo-turborepo", "shared-monorepo-pnpm-workspaces"]).errors,
      ).toStrictEqual([]);
      expect(
        validateSelection(["shared-monorepo-nx", "shared-monorepo-pnpm-workspaces"]).errors,
      ).toStrictEqual([]);
    });

    it("should keep resend setup and resend usage both selected in the email category", () => {
      const store = useWizardStore.getState();

      store.toggleTechnology(
        "api",
        "api-email",
        "api-email-setup-resend",
        categoryIsExclusive("api-email"),
      );
      store.toggleTechnology(
        "api",
        "api-email",
        "api-email-resend-react-email",
        categoryIsExclusive("api-email"),
      );

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.api!["api-email"]).toStrictEqual([
        "api-email-setup-resend",
        "api-email-resend-react-email",
      ]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["api-email-setup-resend", "api-email-resend-react-email"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );
    });

    it("should raise no validation error for both resend skills alongside the React they require", () => {
      expect(
        validateSelection([
          "web-framework-react",
          "api-email-setup-resend",
          "api-email-resend-react-email",
        ]).errors,
      ).toStrictEqual([]);
    });
  });

  describe("restoring a saved selection whose skill has since changed category", () => {
    beforeEach(() => {
      initializeMatrix(BUILT_IN_MATRIX);
    });

    // A saved config.ts lists skills by id, so restore asks the live matrix
    // which category each one is in rather than trusting a stored key. A skill
    // that moved between releases therefore lands under its new header.
    it("should place a moved skill under the category the matrix names now", () => {
      const store = useWizardStore.getState();

      store.populateFromSkillIds(["shared-monorepo-turborepo", "shared-tooling-eslint-prettier"]);

      const { domainSelections, unresolvableSkillIds } = useWizardStore.getState();
      expect(domainSelections.shared).toStrictEqual({
        "shared-task-runner": ["shared-monorepo-turborepo"],
        "shared-lint": ["shared-tooling-eslint-prettier"],
      });
      expect(unresolvableSkillIds).toStrictEqual([]);
    });
  });

  describe("pick-one shared categories in the built-in matrix", () => {
    beforeEach(() => {
      initializeMatrix(BUILT_IN_MATRIX);
    });

    it("should let the radio swap the task runner rather than hold both", () => {
      const store = useWizardStore.getState();

      store.toggleTechnology(
        "shared",
        "shared-task-runner",
        "shared-monorepo-turborepo",
        categoryIsExclusive("shared-task-runner"),
      );
      store.toggleTechnology(
        "shared",
        "shared-task-runner",
        "shared-monorepo-nx",
        categoryIsExclusive("shared-task-runner"),
      );

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.shared!["shared-task-runner"]).toStrictEqual(["shared-monorepo-nx"]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["shared-monorepo-nx"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );
    });

    it("should let the radio swap the linter rather than hold both", () => {
      const store = useWizardStore.getState();

      store.toggleTechnology(
        "shared",
        "shared-lint",
        "shared-tooling-biome",
        categoryIsExclusive("shared-lint"),
      );
      store.toggleTechnology(
        "shared",
        "shared-lint",
        "shared-tooling-eslint-prettier",
        categoryIsExclusive("shared-lint"),
      );

      const { domainSelections, skillConfigs } = useWizardStore.getState();
      expect(domainSelections.shared!["shared-lint"]).toStrictEqual([
        "shared-tooling-eslint-prettier",
      ]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["shared-tooling-eslint-prettier"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );
    });

    it("should still name the conflict for a pair the radio can no longer produce", () => {
      expect(getIncompatibleReason("shared-monorepo-nx", ["shared-monorepo-turborepo"])).toBe(
        "conflicts with Turborepo",
      );
      expect(
        getIncompatibleReason("shared-tooling-eslint-prettier", ["shared-tooling-biome"]),
      ).toBe("conflicts with Biome");
    });

    it("should report both the conflict and the category error for a hand-written co-selection", () => {
      expect(
        validateSelection(["shared-monorepo-turborepo", "shared-monorepo-nx"]).errors,
      ).toStrictEqual([
        {
          type: "conflict",
          message:
            "Turborepo conflicts with Nx: Monorepo build orchestrators are mutually exclusive",
          skills: ["shared-monorepo-turborepo", "shared-monorepo-nx"],
        },
        {
          type: "categoryExclusive",
          message:
            'Category "Task Runner" only allows one selection, but multiple selected: Turborepo, Nx',
          skills: ["shared-monorepo-turborepo", "shared-monorepo-nx"],
        },
      ]);
      expect(
        validateSelection(["shared-tooling-biome", "shared-tooling-eslint-prettier"]).errors,
      ).toStrictEqual([
        {
          type: "conflict",
          message:
            "Biome conflicts with ESLint & Prettier: Linting and formatting tools are mutually exclusive",
          skills: ["shared-tooling-biome", "shared-tooling-eslint-prettier"],
        },
        {
          type: "categoryExclusive",
          message:
            'Category "Lint & Format" only allows one selection, but multiple selected: Biome, ESLint & Prettier',
          skills: ["shared-tooling-biome", "shared-tooling-eslint-prettier"],
        },
      ]);
    });
  });

  describe("domain navigation", () => {
    it("should move to next domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");

      const result = store.nextDomain();

      const { currentDomainIndex } = useWizardStore.getState();
      expect(result).toBe(true);
      expect(currentDomainIndex).toBe(1);
    });

    it("when already at the last domain, should return false from nextDomain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");

      const result = store.nextDomain();

      expect(result).toBe(false);
    });

    it("should move to previous domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.nextDomain();

      const result = store.prevDomain();

      const { currentDomainIndex } = useWizardStore.getState();
      expect(result).toBe(true);
      expect(currentDomainIndex).toBe(0);
    });

    it("when already at the first domain, should return false from prevDomain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");

      const result = store.prevDomain();

      expect(result).toBe(false);
    });

    it("should get current domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.nextDomain();

      const domain = store.getCurrentDomain();
      expect(domain).toBe("api");
    });

    it("should return null when no domains selected", () => {
      const store = useWizardStore.getState();
      const domain = store.getCurrentDomain();
      expect(domain).toBeNull();
    });
  });

  describe("seedFocusedSkillForActiveDomain", () => {
    beforeEach(() => {
      initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);
    });

    it("seeds focusedSkillId to the active domain's first grid option on build-step entry", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");

      store.setStep("build");

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });

    it("re-seeds focusedSkillId to the new domain's first grid option on domain advance", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.setStep("build");

      store.nextDomain();

      expect(useWizardStore.getState().focusedSkillId).toBe("api-framework-hono");
    });

    it("re-seeds focusedSkillId back to the previous domain's first grid option on domain retreat", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.setStep("build");
      store.nextDomain();

      store.prevDomain();

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });

    it("seeds the fallback domain's first grid option when no domains are selected", () => {
      const store = useWizardStore.getState();

      // getCurrentDomain() is null with no domains selected, but the build-step
      // renderer falls back to FALLBACK_DOMAIN ("web") and highlights its first
      // cell. The seed must resolve that same cell — never null — or the cold `s`
      // scope toggle desyncs from the visually focused skill.
      store.seedFocusedSkillForActiveDomain();

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });
  });

  describe("mode toggles", () => {
    it("should toggle show labels", () => {
      const store = useWizardStore.getState();

      store.toggleShowLabels();

      const { showLabels } = useWizardStore.getState();
      expect(showLabels).toBe(true);
    });

    it("should toggle info on", () => {
      const store = useWizardStore.getState();

      store.toggleInfo();

      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(true);
    });

    it("should toggle info off (show then hide)", () => {
      const store = useWizardStore.getState();

      store.toggleInfo();
      store.toggleInfo();

      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(false);
    });

    it("should start with showInfo false", () => {
      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(false);
    });

    it("should reset showInfo to false after reset", () => {
      const store = useWizardStore.getState();
      store.toggleInfo();
      store.reset();

      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(false);
    });
  });

  describe("skillConfigs and per-skill scope", () => {
    it("should sync skillConfigs when toggling a technology on", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(1);
      expect(skillConfigs[0]).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" })[0],
      );
    });

    it("should remove global skill when toggling off during fresh init (no installed configs)", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(0);
    });

    it("removes a global skill cleanly (no tombstone) when toggled off while editing from global scope", () => {
      // At ~/ the config being edited IS the global config — no project overlay, so a deselect
      // is a genuine uninstall, not a project-local tombstone (skill side).
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([]);
    });

    it("should remove old global skill in exclusive mode during fresh init and add new skill", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-vue-composition-api", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-vue-composition-api"], {
          scope: "global",
          origin: "agents-inc",
        }),
      );
    });

    it("removes the old global skill cleanly (no tombstone) in exclusive mode while editing from global scope and adds the new skill", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-vue-composition-api", true);

      // Only the newly selected skill remains — the replaced global skill is uninstalled, not
      // tombstoned (global-scope edit has no overlay).
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-vue-composition-api"], {
          scope: "global",
          origin: "agents-inc",
        }),
      );
    });

    it("cleanly re-adds a global skill when re-selected while editing from global scope", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Deselect: clean removal (global-scope edit, no overlay).
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      expect(useWizardStore.getState().skillConfigs).toStrictEqual([]);

      // Re-select: clean re-add, no excluded flag.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("restores the persisted project scope and eject source when a project-only skill is deselected and re-selected in one session", () => {
      const store = useWizardStore.getState();
      const persisted = buildSkillConfigs(["web-framework-react"], {
        scope: "project",
        origin: "eject",
      });
      useWizardStore.setState({
        domainSelections: { web: { "web-framework": ["web-framework-react"] } },
        skillConfigs: persisted,
        installedSkillConfigs: persisted,
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      // Deselect: a project-only skill has no global install underneath, so it is dropped.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      expect(useWizardStore.getState().skillConfigs).toStrictEqual([]);

      // Re-select: a RESTORE of the hydration snapshot, not a fresh add at wizard defaults.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      expect(useWizardStore.getState().skillConfigs).toStrictEqual(persisted);
    });

    it("adds a genuinely new skill at wizard defaults when the hydration snapshot has no entry for it", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);

      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
      );
    });

    describe("dual-scope selection toggle", () => {
      const dualScopeConfigs = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ];

      it("drops the project half of a dual-scope skill when the selection key is pressed", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": ["web-framework-react"] } },
          skillConfigs: dualScopeConfigs(),
          installedSkillConfigs: dualScopeConfigs(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        store.toggleTechnology("web", "web-framework", "web-framework-react", true);

        const { skillConfigs, domainSelections, toastMessage } = useWizardStore.getState();
        // The project owns the `[P]` half, so the selection key drops it: the pair collapses to
        // the inherited global entry and the skill stays selected, still active via global.
        expect(toastMessage).toBeNull();
        expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
        expect(skillConfigs).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
        );
      });

      it("refuses the selection key on the global half a dual-scope collapse left behind", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": ["web-framework-react"] } },
          // The live config an in-session collapse produces: a plain ACTIVE global entry whose
          // snapshot still says the project was masking a real global install. Deselecting it
          // would tombstone that install from project scope, which is the lock's whole subject.
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          installedSkillConfigs: dualScopeConfigs(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        store.toggleTechnology("web", "web-framework", "web-framework-react", true);

        const { skillConfigs, domainSelections, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBe("Global skills cannot be changed from project scope");
        expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
        expect(skillConfigs).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
        );
      });

      it("leaves a dual-scope skill untouched when an exclusive-category sibling would replace it", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": ["web-framework-react"] } },
          skillConfigs: dualScopeConfigs(),
          installedSkillConfigs: dualScopeConfigs(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        // A radio swap to another framework would implicitly drop the `[P][G]` pair — which
        // unmasks the global install it hides, seating two active skills in a category that
        // permits one. The pair's own row still drops it; the swap must not do it sideways.
        store.toggleTechnology("web", "web-framework", "web-framework-vue-composition-api", true);

        const { skillConfigs, domainSelections, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBe("Global skills cannot be changed from project scope");
        expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
        expect(skillConfigs).toStrictEqual(dualScopeConfigs());
      });

      it("restores [P][G] when re-selecting an inherited-global row (fresh project entry AND tombstone)", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": [] } },
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          installedSkillConfigs: dualScopeConfigs(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        store.toggleTechnology("web", "web-framework", "web-framework-react", true);

        const { skillConfigs, domainSelections, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBeNull();
        expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
        expect(skillConfigs).toStrictEqual(dualScopeConfigs());
      });

      it("restores [P][G] cleanly (no two active entries) via `s` after the collapse is saved and re-opened", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": ["web-framework-react"] } },
          skillConfigs: dualScopeConfigs(),
          installedSkillConfigs: dualScopeConfigs(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        // `s` collapses [P][G] -> single inherited-global [G]; react stays selected.
        store.toggleSkillScope("web-framework-react");
        expect(useWizardStore.getState().skillConfigs).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
        );

        // Simulate save-and-reopen: the persisted single-global entry becomes the installed
        // snapshot. Re-selection via the selection key on the collapsed [G] row is a guarded
        // no-op (installedSkillConfigs now holds an ACTIVE global entry) — `s` is the
        // sanctioned restore path.
        useWizardStore.setState({
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
        });

        store.toggleSkillScope("web-framework-react"); // G->P restores a fresh [P][G] pair

        const { skillConfigs } = useWizardStore.getState();
        const activeEntries = skillConfigs.filter((sc) => !sc.excluded);
        expect(activeEntries).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        );
        expect(skillConfigs.filter((sc) => sc.excluded)).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        );
      });

      it("removes a global-scope skill entirely when deselected from a global-context edit (Scenario C setup)", () => {
        // Global install edited at ~/: deselecting an active [G] skill produces a genuine removal
        // (no project-local tombstone in the global config), mirroring the agent-side fix.
        const store = useWizardStore.getState();
        useWizardStore.setState({
          domainSelections: { web: { "web-framework": ["web-framework-react"] } },
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          isEditingFromGlobalScope: true,
          isInitMode: false,
        });

        store.toggleTechnology("web", "web-framework", "web-framework-react", true);

        const { skillConfigs, domainSelections, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBeNull();
        expect(domainSelections.web!["web-framework"]).toStrictEqual([]);
        expect(skillConfigs).toStrictEqual([]);
      });
    });

    it("should accumulate skillConfigs in non-exclusive mode", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);
      store.toggleTechnology("web", "web-testing", "web-testing-playwright-e2e", false);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(2);
      expect(skillConfigs.map((sc) => sc.id)).toStrictEqual([
        "web-testing-vitest",
        "web-testing-playwright-e2e",
      ]);
    });

    it("should toggle skill scope between global and project", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.toggleSkillScope("web-framework-react");

      const { skillConfigs } = useWizardStore.getState();
      expect(firstElement(skillConfigs).scope).toBe("project");
    });

    it("should toggle skill scope back to global", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.toggleSkillScope("web-framework-react");
      store.toggleSkillScope("web-framework-react");

      const { skillConfigs } = useWizardStore.getState();
      expect(firstElement(skillConfigs).scope).toBe("global");
    });

    it("should block project eject to global when global eject already exists and set toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs, toastMessage } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(buildSkillConfigs(["web-framework-react"]));
      expect(toastMessage).toBe("Already exists as ejected skill at global scope");
    });

    it("should allow global eject to project when global eject is installed", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs, toastMessage } = useWizardStore.getState();
      expect(firstElement(skillConfigs).scope).toBe("project");
      expect(toastMessage).toBeNull();
    });

    it("should allow project eject to global when no global eject exists", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        globalPreselections: [],
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs, toastMessage } = useWizardStore.getState();
      expect(firstElement(skillConfigs).scope).toBe("global");
      expect(toastMessage).toBeNull();
    });

    it("should not toggle skill scope when isEditingFromGlobalScope is true", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({ isEditingFromGlobalScope: true });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(firstElement(skillConfigs).scope).toBe("global");
    });

    it("should add excluded global entry when toggling previously-installed global skill to project", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ]);
    });

    it("should remove excluded global entry when toggling back from project to global", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      store.toggleSkillScope("web-framework-react"); // global → project (adds excluded)
      store.toggleSkillScope("web-framework-react"); // project → global (removes excluded)
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("should not add excluded entry when toggling scope during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // installedSkillConfigs is null (fresh init)

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(1);
      expect(firstElement(skillConfigs).scope).toBe("project");
    });

    it("should allow P→G reverse toggle for ejected skills after G→P toggle (round-trip)", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      // G→P: should succeed and create tombstone
      store.toggleSkillScope("web-framework-react");
      const afterGtoP = useWizardStore.getState();
      expect(afterGtoP.skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { origin: "eject" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
          excluded: true,
        }),
      ]);
      expect(afterGtoP.toastMessage).toBeNull();

      // P→G: should succeed (not blocked) and remove tombstone
      store.toggleSkillScope("web-framework-react");
      const afterPtoG = useWizardStore.getState();
      expect(afterPtoG.skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "eject" }),
      );
      expect(afterPtoG.toastMessage).toBeNull();
    });

    it("round-trips a persisted dual-scope skill row with `s`: collapse to [G], then restore [P][G]", () => {
      // Reopened session on a persisted [P][G] pair: the snapshot carries only the EXCLUDED
      // global tombstone (never an active global entry). `s` is the SOLE dual-scope toggle —
      // P→G drops the tombstone (collapse), G→P re-adds it (restore), with no toast either way.
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ];
      const store = useWizardStore.getState();
      useWizardStore.setState({
        skillConfigs: dualScope(),
        installedSkillConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleSkillScope("web-framework-react");
      const first = useWizardStore.getState();
      expect(first.skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
      expect(first.toastMessage).toBeNull();

      store.toggleSkillScope("web-framework-react");
      const second = useWizardStore.getState();
      expect(second.skillConfigs).toStrictEqual(dualScope());
      expect(second.toastMessage).toBeNull();
    });

    it("runs the full in-session space-collapse → s-restore → blocked-space → s-restore sequence on a persisted [P][G] skill", () => {
      // Single wizard session on a persisted dual-scope pair: the hydration snapshot stays a
      // frozen [P][G] (project-active + global tombstone) throughout, while the live config is
      // mutated by each keypress. Exercises the state machine the E2E suite drives end-to-end.
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ];
      const plainGlobal = (): SkillConfig[] =>
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" });

      const store = useWizardStore.getState();
      useWizardStore.setState({
        domainSelections: { web: { "web-framework": ["web-framework-react"] } },
        skillConfigs: dualScope(),
        installedSkillConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      // Step 1 — spacebar on the live [P][G] row drops the half the PROJECT owns: the pair
      // collapses to the inherited global entry, and the skill stays selected because that
      // entry is still active. No toast — nothing global-owned was touched.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      const afterProjectHalfDropped = useWizardStore.getState();
      expect(afterProjectHalfDropped.skillConfigs).toStrictEqual(plainGlobal());
      expect(afterProjectHalfDropped.domainSelections.web!["web-framework"]).toStrictEqual([
        "web-framework-react",
      ]);
      expect(afterProjectHalfDropped.toastMessage).toBeNull();

      // Step 2 — `s` rebuilds the pair from that collapsed row (the snapshot still carries a
      // global entry for the id, so the tombstone comes back with it).
      store.toggleSkillScope("web-framework-react");
      const afterFirstRestore = useWizardStore.getState();
      expect(afterFirstRestore.skillConfigs).toStrictEqual(dualScope());
      expect(afterFirstRestore.toastMessage).toBeNull();

      // Step 3 — `s` collapses the pair the other way, leaving the same plain global row.
      store.toggleSkillScope("web-framework-react");
      const afterCollapse = useWizardStore.getState();
      expect(afterCollapse.skillConfigs).toStrictEqual(plainGlobal());
      expect(afterCollapse.domainSelections.web!["web-framework"]).toStrictEqual([
        "web-framework-react",
      ]);
      expect(afterCollapse.toastMessage).toBeNull();

      // Step 3b — spacebar on that collapsed row IS blocked: the live entry is now the global
      // install itself, and deselecting it from project scope would tombstone something the
      // project does not own. The half the guard still covers.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      const afterBlocked = useWizardStore.getState();
      expect(afterBlocked.skillConfigs).toStrictEqual(plainGlobal());
      expect(afterBlocked.toastMessage).toBe("Global skills cannot be changed from project scope");

      // Step 4 — `s` restores a fresh [P][G] pair (active project entry + global tombstone).
      useWizardStore.setState({ toastMessage: null });
      store.toggleSkillScope("web-framework-react");
      const afterRestore = useWizardStore.getState();
      expect(afterRestore.skillConfigs).toStrictEqual(dualScope());
      expect(afterRestore.toastMessage).toBeNull();

      // Step 5 — `s` again freely flips the reconstructed pair back to plain global.
      store.toggleSkillScope("web-framework-react");
      const afterFlip = useWizardStore.getState();
      expect(afterFlip.skillConfigs).toStrictEqual(plainGlobal());
      expect(afterFlip.toastMessage).toBeNull();

      // Step 5b — and back to [P][G], proving a free P↔G round-trip within the session.
      store.toggleSkillScope("web-framework-react");
      expect(useWizardStore.getState().skillConfigs).toStrictEqual(dualScope());
    });

    it("writes no tombstone when a project skill re-scoped to global in-session is then deselected", () => {
      // The snapshot holds the skill at PROJECT scope only — nothing is installed globally.
      // `s` rescopes it to global in-session, so the live entry now reads `scope: "global"`
      // while the snapshot still says project. A deselect here has no global install to
      // protect and no project override to record, so it must never mint a tombstone.
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleSkillScope("web-framework-react");
      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(
        skillConfigs.filter((sc) => sc.excluded),
        "a skill never installed globally must not gain a global tombstone",
      ).toStrictEqual([]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("should set and clear focusedSkillId", () => {
      const store = useWizardStore.getState();

      store.setFocusedSkillId("web-framework-react");
      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");

      store.setFocusedSkillId(null);
      expect(useWizardStore.getState().focusedSkillId).toBeNull();
    });

    it("should write the eject source via setInstallMode on skillConfigs", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.setInstallMode("web-framework-react", "eject", "global");

      const { skillConfigs } = useWizardStore.getState();
      expect(firstElement(skillConfigs).origin).toBe("eject");
    });

    it("should write the marketplace source via setInstallMode on skillConfigs", () => {
      const store = useWizardStore.getState();
      initializeMatrix(
        createMockMatrix({
          ...SKILLS.react,
          availableSources: [{ name: "Acme Corp", type: "private", installed: false }],
        }),
      );
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.setInstallMode("web-framework-react", "eject", "global");

      store.setInstallMode("web-framework-react", "plugin", "global");

      const { skillConfigs } = useWizardStore.getState();
      expect(firstElement(skillConfigs).origin).toBe("Acme Corp");
    });

    it("should write the chosen install mode to the entry's origin", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.setInstallMode("web-framework-react", "eject", "global");

      expect(firstElement(useWizardStore.getState().skillConfigs).origin).toBe(EJECT_SOURCE);
    });

    it("should populate skillConfigs from populateFromSkillIds", () => {
      const store = useWizardStore.getState();

      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      store.populateFromSkillIds(["web-framework-react", "api-framework-hono"]);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(2);
      expect(skillConfigs.map((sc) => sc.id)).toStrictEqual([
        "web-framework-react",
        "api-framework-hono",
      ]);
      // A fully-resolvable population records no unresolvable ids.
      expect(useWizardStore.getState().unresolvableSkillIds).toStrictEqual([]);
    });

    it("records the ids of installed skills that could not be resolved from the loaded matrix", () => {
      const store = useWizardStore.getState();

      // Matrix has react + hono only; web-styling-tailwind is a real installed skill absent from
      // the loaded source. It must be recorded as unresolvable (not silently forgotten) so the
      // merge layer can preserve the existing config entry rather than treat it as a deselection.
      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      store.populateFromSkillIds(["web-framework-react", "web-styling-tailwind"]);

      const state = useWizardStore.getState();
      expect(state.unresolvableSkillIds).toStrictEqual(["web-styling-tailwind"]);
      // The resolvable skill is still selected.
      expect(state.skillConfigs.map((sc) => sc.id)).toStrictEqual(["web-framework-react"]);
    });

    it("should preserve excluded entries from saved configs in populateFromSkillIds", () => {
      const store = useWizardStore.getState();

      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      const savedConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ];

      store.populateFromSkillIds(["web-framework-react", "api-framework-hono"], savedConfigs);

      const { skillConfigs } = useWizardStore.getState();
      // Active skills + excluded entries
      const activeConfigs = skillConfigs.filter((sc) => !sc.excluded);
      const excludedConfigs = skillConfigs.filter((sc) => sc.excluded);
      expect(activeConfigs).toHaveLength(2);
      expect(excludedConfigs).toHaveLength(1);
      expect(firstElement(excludedConfigs).id).toBe("web-testing-vitest");
      expect(firstElement(excludedConfigs).excluded).toBe(true);
    });

    it("preserves excluded tombstone when active entry exists for same skill at different scope", () => {
      const store = useWizardStore.getState();

      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      // D-223: project-scope active + global-scope excluded tombstone — dual-scope state.
      // populateFromSkillIds must preserve both so buildCategoriesForDomain can render dual badges.
      const savedConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"]),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          excluded: true,
          origin: "agents-inc",
        }),
      ];

      store.populateFromSkillIds(["web-framework-react", "api-framework-hono"], savedConfigs);

      const { skillConfigs } = useWizardStore.getState();
      const reactConfigs = skillConfigs.filter((sc) => sc.id === "web-framework-react");
      expect(reactConfigs).toHaveLength(2);

      const active = reactConfigs.find((sc) => !sc.excluded);
      const tombstone = reactConfigs.find((sc) => sc.excluded);
      expect(active?.scope).toBe("project");
      expect(tombstone?.scope).toBe("global");
      expect(tombstone?.excluded).toBe(true);
    });

    it("should prefer project-scoped entry when savedConfigs has duplicate skill with both scopes", () => {
      const store = useWizardStore.getState();

      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      // D-198: savedConfigs contains the same skill ID twice — once global, once project
      const savedConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"]),
      ];

      store.populateFromSkillIds(["web-framework-react"], savedConfigs);

      const { skillConfigs } = useWizardStore.getState();
      const reactConfigs = skillConfigs.filter((sc) => sc.id === "web-framework-react");
      expect(reactConfigs).toHaveLength(1);
      // Project scope should win over global scope — verify full shape
      expect(reactConfigs[0]).toStrictEqual(buildSkillConfigs(["web-framework-react"])[0]);
    });

    it("should remove global skillConfigs when domain is deselected during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      expect(useWizardStore.getState().skillConfigs).toHaveLength(1);

      store.toggleDomain("web");

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(0);
    });

    it("removes global skillConfigs cleanly (no tombstone) when a domain is deselected while editing from global scope", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      expect(useWizardStore.getState().skillConfigs).toHaveLength(1);

      store.toggleDomain("web");

      // Global-scope edit: deselecting a domain uninstalls its skills cleanly (no tombstone).
      expect(useWizardStore.getState().skillConfigs).toStrictEqual([]);
    });

    it("should remove project skillConfigs when domain is deselected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Set scope to project
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      store.toggleDomain("web");

      expect(useWizardStore.getState().skillConfigs).toHaveLength(0);
    });

    it("should remove project-scoped skill from skillConfigs when toggling off", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Change scope to project
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      // Toggle off the skill
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      // Project-scoped skill should be fully removed, not kept as excluded
      expect(skillConfigs).toHaveLength(0);
    });

    it("should remove both global and project skills when deselecting domain during fresh init", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);
      // Set react to global, zustand to project
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
      });

      store.toggleDomain("web");

      const { skillConfigs } = useWizardStore.getState();
      // Both should be removed during fresh init (no installed configs)
      expect(skillConfigs).toHaveLength(0);
    });

    it("removes both global and project skills cleanly when a domain is deselected while editing from global scope", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);
      // Set react to global, zustand to project
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
      });

      store.toggleDomain("web");

      // Global-scope edit has no overlay: both skills are uninstalled cleanly, no tombstone.
      expect(useWizardStore.getState().skillConfigs).toStrictEqual([]);
    });

    it("leaves every globally installed entry untouched when a domain is deselected at project scope", () => {
      // Deselecting a domain at project scope is a VIEW FILTER: it hides the domain and drops
      // what the project owns there, but it has no authority over the global install.
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"], { scope: "project", origin: "agents-inc" }),
        ],
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });
      const globalEntriesBefore = useWizardStore
        .getState()
        .skillConfigs.filter((sc) => sc.scope === "global");

      store.toggleDomain("web");

      const { skillConfigs, selectedDomains, domainSelections } = useWizardStore.getState();
      expect(
        skillConfigs.filter((sc) => sc.scope === "global"),
        "global entries must survive a project-scope domain deselect byte-identical",
      ).toStrictEqual(globalEntriesBefore);
      expect(skillConfigs, "only the domain's project-scoped entries are dropped").toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
      expect(selectedDomains).toStrictEqual([]);
      expect(domainSelections.web).toBeUndefined();
    });

    it("collapses a dual-scope pair to one inherited global entry when its domain is deselected", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      ];
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      useWizardStore.setState({
        domainSelections: { web: { "web-framework": ["web-framework-react"] } },
        skillConfigs: dualScope(),
        installedSkillConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleDomain("web");

      const { skillConfigs, selectedDomains, domainSelections } = useWizardStore.getState();
      expect(
        skillConfigs,
        "both halves of the pair are dropped and the still-live global install re-surfaces",
      ).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
      expect(selectedDomains).toStrictEqual([]);
      expect(domainSelections.web).toBeUndefined();
    });

    it("should reset skillConfigs and focusedSkillId on reset", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.setFocusedSkillId("web-framework-react");

      store.reset();

      const state = useWizardStore.getState();
      expect(state.skillConfigs).toStrictEqual([]);
      expect(state.focusedSkillId).toBeNull();
    });
  });

  /**
   * `setInstallMode`'s scope authority.
   *
   * The Sources step renders an inherited global install as a locked, non-focusable row, and
   * `SourceGrid`'s SPACE handler returns on an inert row — so the per-row control provably
   * cannot commit a mode for one. The store setter behind it has to agree, or an authority the
   * UI enforces rests on the UI alone.
   *
   * The gate is on the SLOT, never on the id. An id legitimately occupies slots at both scopes
   * at once: a global install adopted at project scope renders a locked global row AND an
   * editable project row for the same skill, and `step-sources.tsx` threads that project row's
   * scope into the call. An id-keyed gate would freeze the half the project owns — the half the
   * grid deliberately leaves editable.
   *
   * The gate is on the HYDRATION SNAPSHOT, never on the live entry's scope alone: a skill added
   * this session at global scope, and every skill in a first `init` (where the snapshot is
   * `null`), are nobody's install yet and must stay editable.
   */
  describe("setInstallMode scope authority", () => {
    it("does not rewrite a global slot the hydration snapshot already owns", () => {
      const installed = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      });
      useWizardStore.setState({
        skillConfigs: [...installed],
        installedSkillConfigs: installed,
        isEditingFromGlobalScope: false,
      });

      useWizardStore.getState().setInstallMode("web-framework-react", "eject", "global");

      expect(
        useWizardStore.getState().skillConfigs,
        "a project-context call may not change the install mode of an inherited global install",
      ).toStrictEqual(installed);
    });

    it("still rewrites the project half of a dual-scope pair over that same global install", () => {
      // The `[P][G]` shape a global→project adoption leaves: the snapshot holds the active
      // global entry, the live config holds the project entry that masks it plus the tombstone.
      // This is the case an id-keyed gate would break, so it is pinned beside the gate itself.
      const installed = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      });
      const tombstone = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
        excluded: true,
      });
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "project",
            origin: DEFAULT_PUBLIC_SOURCE_NAME,
          }),
          ...tombstone,
        ],
        installedSkillConfigs: installed,
        isEditingFromGlobalScope: false,
      });

      useWizardStore.getState().setInstallMode("web-framework-react", "eject", "project");

      expect(
        useWizardStore.getState().skillConfigs,
        "the project's own half of a dual-scope pair stays editable, and the tombstone keeps describing the masked global install",
      ).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: EJECT_SOURCE,
        }),
        ...tombstone,
      ]);
    });

    it("rewrites a global slot when the edit is running at global scope", () => {
      const installed = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        origin: DEFAULT_PUBLIC_SOURCE_NAME,
      });
      useWizardStore.setState({
        skillConfigs: [...installed],
        installedSkillConfigs: installed,
        isEditingFromGlobalScope: true,
      });

      useWizardStore.getState().setInstallMode("web-framework-react", "eject", "global");

      expect(
        useWizardStore.getState().skillConfigs,
        "an edit at global scope owns the global install and may change its mode",
      ).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
      );
    });

    it("rewrites a global slot the hydration snapshot does not carry", () => {
      // `installedSkillConfigs: null` is a first `init` — nothing is installed at either scope,
      // so nothing is inherited and every row on the Sources step is the session's own.
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
        installedSkillConfigs: null,
        isEditingFromGlobalScope: false,
      });

      useWizardStore.getState().setInstallMode("web-framework-react", "eject", "global");

      expect(
        useWizardStore.getState().skillConfigs,
        "a global-scope skill this session added is nobody's install yet and stays editable",
      ).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: EJECT_SOURCE }),
      );
    });
  });

  describe("computed getters", () => {
    it("should get all selected technologies", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      const technologies = store.getAllSelectedTechnologies();
      expect(technologies).toStrictEqual([
        "web-framework-react",
        "web-styling-scss-modules",
        "api-framework-hono",
      ]);
    });

    it("should get selected technologies per domain", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      const perDomain = store.getSelectedTechnologiesPerDomain();
      expect(perDomain.web).toStrictEqual(["web-framework-react", "web-styling-scss-modules"]);
      expect(perDomain.api).toStrictEqual(["api-framework-hono"]);
      expect(perDomain.cli).toBeUndefined();
    });

    it("should return empty object for getSelectedTechnologiesPerDomain with no selections", () => {
      const store = useWizardStore.getState();
      const perDomain = store.getSelectedTechnologiesPerDomain();
      expect(perDomain).toStrictEqual({});
    });

    it("should omit domains with empty category arrays from getSelectedTechnologiesPerDomain", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-framework", "web-framework-react", true); // toggle off

      const perDomain = store.getSelectedTechnologiesPerDomain();
      expect(perDomain.web).toBeUndefined();
    });

    it("should get technology count", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      expect(store.getTechnologyCount()).toBe(3);
    });

    it("should return 0 for getTechnologyCount with no selections", () => {
      const store = useWizardStore.getState();
      expect(store.getTechnologyCount()).toBe(0);
    });
  });

  describe("navigation guards", () => {
    it("canGoToNextDomain should return true when not at last domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");

      expect(store.canGoToNextDomain()).toBe(true);
    });

    it("canGoToNextDomain should return false when at last domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");

      expect(store.canGoToNextDomain()).toBe(false);
    });

    it("canGoToNextDomain should return false with no domains", () => {
      const store = useWizardStore.getState();
      expect(store.canGoToNextDomain()).toBe(false);
    });

    it("canGoToPreviousDomain should return false when at first domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");

      expect(store.canGoToPreviousDomain()).toBe(false);
    });

    it("canGoToPreviousDomain should return true when past first domain", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.nextDomain();

      expect(store.canGoToPreviousDomain()).toBe(true);
    });

    it("canGoToPreviousDomain should return false with no domains", () => {
      const store = useWizardStore.getState();
      expect(store.canGoToPreviousDomain()).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      const store = useWizardStore.getState();

      store.setStep("stack");
      store.setApproach("scratch");
      store.selectStack("nextjs-fullstack");
      store.toggleDomain("web");

      store.reset();

      const state = useWizardStore.getState();
      expect(state.step).toBe("stack");
      expect(state.approach).toBeNull();
      expect(state.selectedStackId).toBeNull();
      expect(state.selectedDomains).toStrictEqual([]);
      expect(state.history).toStrictEqual([]);
    });
  });

  describe("complex flows", () => {
    it("should handle complete stack selection flow", () => {
      const store = useWizardStore.getState();

      store.setApproach("stack");
      store.selectStack("nextjs-fullstack");
      store.setStackAction("customize");
      store.setStep("build");

      store.setStep("confirm");

      const state = useWizardStore.getState();
      expect(state.step).toBe("confirm");
      expect(state.approach).toBe("stack");
      expect(state.selectedStackId).toBe("nextjs-fullstack");
      expect(state.stackAction).toBe("customize");
      expect(state.history).toStrictEqual(["stack", "build"]);
    });

    it("should handle complete scratch flow", () => {
      const store = useWizardStore.getState();

      store.setApproach("scratch");
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.setStep("build");

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);
      store.setStep("confirm");

      const state = useWizardStore.getState();
      expect(state.step).toBe("confirm");
      expect(state.approach).toBe("scratch");
      expect(state.selectedDomains).toStrictEqual(["web", "api"]);
      expect(state.domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
      expect(state.domainSelections.web!["web-styling"]).toStrictEqual([
        "web-styling-scss-modules",
      ]);
      expect(state.domainSelections.api!["api-api"]).toStrictEqual(["api-framework-hono"]);
    });

    it("should preserve selections when going back", () => {
      const store = useWizardStore.getState();

      store.setApproach("scratch");
      store.toggleDomain("web");
      store.setStep("build");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.goBack();

      const state = useWizardStore.getState();
      expect(state.selectedDomains).toContain("web");
      expect(state.domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
    });
  });

  describe("buildSourceRows install-mode cells", () => {
    it("should offer exactly the two install modes, local first", () => {
      const store = useWizardStore.getState();
      initializeMatrix(
        createMockMatrix({
          ...SKILLS.react,
          availableSources: [{ name: "Acme Corp", type: "private", installed: false }],
        }),
      );

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).options.map((option) => option.mode)).toStrictEqual([
        "eject",
        "plugin",
      ]);
    });

    it("should select the local cell for a skill saved as ejected", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      const selected = firstElement(store.buildSourceRows()).options.filter(
        (option) => option.selected,
      );
      expect(selected.map((option) => option.mode)).toStrictEqual(["eject"]);
    });

    it("should select the plugin cell for a skill saved against a marketplace", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "Acme Corp",
        }),
      });

      const selected = firstElement(store.buildSourceRows()).options.filter(
        (option) => option.selected,
      );
      expect(selected.map((option) => option.mode)).toStrictEqual(["plugin"]);
    });

    it("should read each skill's install mode from its origin", () => {
      const store = useWizardStore.getState();
      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: PRIVATE_MARKETPLACE_NAME,
          }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "global", origin: EJECT_SOURCE }),
        ],
      });

      const rows = store.buildSourceRows().map((row) => ({
        skillId: row.skillId,
        selected: row.options.filter((option) => option.selected).map((option) => option.mode),
      }));

      expect(rows).toStrictEqual([
        { skillId: "web-framework-react", selected: ["plugin"] },
        { skillId: "api-framework-hono", selected: ["eject"] },
      ]);
    });

    it("offers the local cell alone for a skill no marketplace carries", () => {
      const store = useWizardStore.getState();
      initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);

      store.toggleTechnology("web", "web-tooling", CUSTOM_HOUSE_TOOLING_ID, false);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).options.map((option) => option.mode)).toStrictEqual(["eject"]);
      expect(
        firstElement(rows).options.filter((option) => option.selected).length,
        "the only mode a skill can take is the one it renders as selected",
      ).toBe(1);
    });

    it("still offers both cells for a skill the marketplace carries", () => {
      const store = useWizardStore.getState();
      initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).options.map((option) => option.mode)).toStrictEqual([
        "eject",
        "plugin",
      ]);
    });
  });

  describe("default origin of a newly selected skill", () => {
    it("takes the marketplace that carries it", () => {
      const store = useWizardStore.getState();
      initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      );
    });

    it("takes the project's own copy when no marketplace carries it", () => {
      const store = useWizardStore.getState();
      initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);

      store.toggleTechnology("web", "web-tooling", CUSTOM_HOUSE_TOOLING_ID, false);

      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs([CUSTOM_HOUSE_TOOLING_ID], { scope: "global", origin: EJECT_SOURCE }),
      );
    });
  });

  describe("buildSourceRows scope", () => {
    it("should include scope from skillConfigs", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      // Default scope is "global" from createDefaultSkillConfig
      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).scope).toBe("global");

      // Toggle to project scope
      store.toggleSkillScope("web-framework-react");
      const updatedRows = store.buildSourceRows();
      expect(firstElement(updatedRows).scope).toBe("project");
    });

    it("should return undefined scope for skills not in skillConfigs", () => {
      initializeMatrix(ALL_SKILLS_WEB_AND_API_MATRIX);
      const store = useWizardStore.getState();

      // Add a skill via domainSelections but remove its skillConfig entry
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({ skillConfigs: [] });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).scope).toBeUndefined();
    });

    it("should mark global-scoped skills as readOnly when previously installed globally", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).readOnly).toBe(true);
    });

    it("should not mark global-scoped skills as readOnly when not previously installed", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      // installedSkillConfigs is null (default) — no prior installs
      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should not mark global-scoped skills as readOnly when editing from global scope", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        isEditingFromGlobalScope: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should not mark project-scoped skills as readOnly when previously installed as project", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // The live entry is set explicitly: toggleTechnology defaults its config entry to GLOBAL
      // scope, which would make this a project→global migration — a different state, with a
      // pending-removal row for the emptied project slot — rather than a skill that stays put.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      // One row is the contract: the skill occupies the same (id, project) slot it was saved in, so
      // no slot is emptied and nothing is pending removal.
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).scope).toBe("project");
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should emit both global locked and project editable rows for re-scoped skills", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Simulate: was installed globally, now toggled to project
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(2);

      // First row: locked global copy
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).scope).toBe("global");
      expect(firstElement(rows).readOnly).toBe(true);

      // Second row: editable project copy
      expect(elementAt(rows, 1).skillId).toBe("web-framework-react");
      expect(elementAt(rows, 1).scope).toBe("project");
      expect(elementAt(rows, 1).readOnly).toBeUndefined();
    });

    it("should not mark new global skills as readOnly when not previously installed", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // No installedSkillConfigs entry for this skill — it's new
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).scope).toBe("global");
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should emit single locked row for skill that remains global-scoped", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).scope).toBe("global");
      expect(firstElement(rows).readOnly).toBe(true);
    });

    it("should show excluded global skills as locked rows", () => {
      const store = useWizardStore.getState();
      // Don't toggle any technology — the excluded skill was deselected
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).scope).toBe("global");
      expect(firstElement(rows).readOnly).toBe(true);
    });

    it("should not duplicate rows for re-scoped skills with excluded tombstone", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(2);
      expect(firstElement(rows).scope).toBe("global");
      expect(firstElement(rows).readOnly).toBe(true);
      expect(elementAt(rows, 1).scope).toBe("project");
      expect(elementAt(rows, 1).readOnly).toBeUndefined();
    });

    it("should emit single editable row for new project-scoped skill", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).scope).toBe("project");
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should produce correct rows for mixed re-scoped and excluded skills", () => {
      const store = useWizardStore.getState();
      // React is selected (re-scoped to project), Vitest is NOT selected (purely excluded)
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
      });

      const rows = store.buildSourceRows();
      // React: 2 rows (locked global + editable project)
      // Vitest: 1 row (locked global, purely excluded)
      // Total: 3
      expect(rows).toHaveLength(3);

      const reactRows = rows.filter((r) => r.skillId === "web-framework-react");
      const vitestRows = rows.filter((r) => r.skillId === "web-testing-vitest");

      expect(reactRows).toHaveLength(2);
      expect(firstElement(reactRows).scope).toBe("global");
      expect(firstElement(reactRows).readOnly).toBe(true);
      expect(elementAt(reactRows, 1).scope).toBe("project");
      expect(elementAt(reactRows, 1).readOnly).toBeUndefined();

      expect(vitestRows).toHaveLength(1);
      expect(firstElement(vitestRows).scope).toBe("global");
      expect(firstElement(vitestRows).readOnly).toBe(true);
    });

    it("should keep a deselected saved project skill visible as a disabled row", () => {
      const store = useWizardStore.getState();
      // Don't toggle any technology — the saved project skill was deselected, and a project
      // entry is dropped outright (no tombstone), so skillConfigs no longer holds it.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).disabled).toBe(true);
      // A lock would read as "installed globally"; this row is pending removal instead.
      expect(firstElement(rows).readOnly).toBeUndefined();
      expect(firstElement(rows).scope).toBe("project");
    });

    it("should show the persisted source on a deselected saved project skill", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(
        firstElement(rows)
          .options.filter((option) => option.selected)
          .map((option) => option.mode),
      ).toStrictEqual(["eject"]);
    });

    it("should not surface a never-saved skill as a disabled row during init", () => {
      const store = useWizardStore.getState();
      // Init has no hydration snapshot, so a skill deselected before saving must not linger.
      useWizardStore.setState({ installedSkillConfigs: null, skillConfigs: [] });

      expect(store.buildSourceRows()).toStrictEqual([]);
    });

    it("should surface a deselected saved skill as a disabled row when editing from global scope", () => {
      const store = useWizardStore.getState();
      // Deselecting while editing from global scope drops the skill outright — reconcileSkillConfigs
      // passes null so applySkillRemoval leaves no tombstone — which makes the snapshot the only
      // surviving record of what saving is about to remove. The confirm step's computeScopeDiff
      // reports that removal with no global-scope gate, so the Sources tab must not gate it either.
      // The snapshot entry is global-scoped because a global config only ever holds global-active
      // entries (splitConfigByScope).
      useWizardStore.setState({
        isEditingFromGlobalScope: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).skillId).toBe("web-framework-react");
      expect(firstElement(rows).disabled).toBe(true);
      expect(firstElement(rows).scope).toBe("global");
      // A global-scope edit owns every row, so nothing renders as locked-because-inherited.
      expect(firstElement(rows).readOnly).toBeUndefined();
    });

    it("should skip a saved skill the marketplace no longer carries instead of throwing", () => {
      const store = useWizardStore.getState();
      initializeMatrix(createMockMatrix(SKILLS.react));
      // A config referencing a removed/renamed skill: present in the snapshot, absent from the
      // matrix. Rendering a row for it would throw in getSkillById.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-testing-vitest"], {
          scope: "project",
          origin: "eject",
        }),
        skillConfigs: [],
      });

      expect(store.buildSourceRows()).toStrictEqual([]);
    });

    it("should render a collapsed dual-scope skill as a locked global row plus a project pending-removal row", () => {
      const store = useWizardStore.getState();
      // A skill installed at BOTH scopes that collapses [P][G] to [G] empties its PROJECT slot:
      // saving deletes the project copy while the global install survives. Removal is a property
      // of the (id, scope) slot, not of the id, so the surviving global entry must not hide the
      // emptied project slot — the Sources tab shows the skill twice, exactly as the confirm step
      // does (`-` at Project, `•` at Global).
      useWizardStore.setState({
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "project",
            origin: "agents-inc",
          }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.skillId)).toStrictEqual([
        "web-framework-react",
        "web-framework-react",
      ]);
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      // The surviving global install is locked-because-inherited, never pending removal.
      expect(firstElement(rows).readOnly).toBe(true);
      expect(firstElement(rows).disabled).toBeUndefined();
      // The emptied project slot is inert and pending removal — a lock there would read as
      // "installed globally" instead of "about to be removed".
      expect(elementAt(rows, 1).disabled).toBe(true);
      expect(elementAt(rows, 1).readOnly).toBeUndefined();
      // Both slots come FROM the snapshot, so neither can be new this session.
      expect(rows.map((r) => r.added)).toStrictEqual([undefined, undefined]);
    });

    it("should render a pending-removal row inline after the still-selected rows of its scope", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "project",
            origin: "eject",
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project", origin: "eject" }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      // The removed row is not sunk into a separate section: it shares the project scope and simply
      // trails the still-selected project row, matching the info panel's active-then-removed order.
      expect(rows.map((r) => r.skillId)).toStrictEqual([
        "web-framework-react",
        "web-testing-vitest",
      ]);
      expect(rows.map((r) => r.scope)).toStrictEqual(["project", "project"]);
      expect(firstElement(rows).disabled).toBeUndefined();
      expect(elementAt(rows, 1).disabled).toBe(true);
    });

    it("should mark every row added when there is no installation snapshot", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // A first init hydrates no snapshot. An absent baseline occupies no slot, so every row is
      // new — the same answer computeScopeDiff gives the confirm step, which prints `+` on every
      // row of a first install.
      useWizardStore.setState({ installedSkillConfigs: null });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).added).toBe(true);
    });

    it("should mark every row added when the installation snapshot is empty", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // "No snapshot" and "empty snapshot" are the same baseline and must classify identically —
      // the divergence between them is what left a first init unmarked while the confirm step
      // marked the same rows added.
      useWizardStore.setState({ installedSkillConfigs: [] });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(firstElement(rows).added).toBe(true);
    });

    it("should mark only the project half of an adopted global skill as added", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Adopting a global skill at project scope occupies a NEW (id, project) slot while the
      // global install stays put, so the addition belongs to the editable project row alone.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      expect(firstElement(rows).added).toBeUndefined();
      expect(elementAt(rows, 1).added).toBe(true);
    });

    it("should render a collapsed persisted dual-scope pair as an unmarked global row plus a project pending-removal row", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // A persisted [P][G] pair — project entry plus global tombstone masking the global install —
      // IS the both-scopes installation. Collapsing it back to [G] re-activates the slot the
      // tombstone already occupied, so the surviving global row is unchanged rather than an
      // addition, while the emptied PROJECT slot is what saving deletes and must stay visible.
      useWizardStore.setState({
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.skillId)).toStrictEqual([
        "web-framework-react",
        "web-framework-react",
      ]);
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      // The still-active global row survives the collapse — it is not swallowed by the emptied
      // project slot — and carries neither diff marker: re-occupying a tombstoned slot is not an
      // addition, and the global install is not what saving removes.
      expect(firstElement(rows).added).toBeUndefined();
      expect(firstElement(rows).disabled).toBeUndefined();
      // The emptied project slot is inert and pending removal — a lock there would read as
      // "installed globally" instead of "about to be removed".
      expect(elementAt(rows, 1).disabled).toBe(true);
      expect(elementAt(rows, 1).readOnly).toBeUndefined();
      expect(elementAt(rows, 1).added).toBeUndefined();
    });

    it("should render a project-to-global migration as an added global row plus a project pending-removal row", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Re-scoping a saved project skill to global occupies a NEW (id, global) slot and empties the
      // (id, project) one, with no tombstone involved. Both halves of that move must stay visible,
      // exactly as the confirm step reports it (`-` at Project, `+` at Global).
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.skillId)).toStrictEqual([
        "web-framework-react",
        "web-framework-react",
      ]);
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      // The newly occupied global slot is the addition, and it is editable: no global install
      // predates this session, so there is nothing inherited to lock against.
      expect(firstElement(rows).added).toBe(true);
      expect(firstElement(rows).disabled).toBeUndefined();
      expect(firstElement(rows).readOnly).toBeUndefined();
      // The emptied project slot is what saving deletes — inert, and never new this session.
      expect(elementAt(rows, 1).disabled).toBe(true);
      expect(elementAt(rows, 1).added).toBeUndefined();
      expect(elementAt(rows, 1).readOnly).toBeUndefined();
    });
  });

  describe("agent selection", () => {
    it("should start with empty selectedAgents", () => {
      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
    });

    it("should toggle agent on", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer"]);
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
    });

    it("should block toggling globally installed agents from project scope and set toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer"]);
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
      expect(toastMessage).toBe("Global agents cannot be changed from project scope");
    });

    it("should block toggling globally installed agents in init mode too, with the same toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: true,
      });

      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer"]);
      expect(
        agentConfigs,
        "a blocked agent toggle must leave the global entry active — no tombstone",
      ).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
      expect(toastMessage).toBe("Global agents cannot be changed from project scope");
    });

    it("should allow toggling globally installed agents from global scope (clean removal, no toast)", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: true,
        isInitMode: false,
      });

      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
      // Editing at ~/ has no project overlay: deselect is a genuine removal, not a tombstone.
      expect(selectedAgents).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
      expect(toastMessage).toBeNull();
    });

    it("should toggle an installed PROJECT-scope agent off freely, with no toast", () => {
      // The counterweight to the two blocked-toggle tests above: the lock is scoped to
      // GLOBAL installs, so an agent the project owns must stay freely deselectable under
      // the identical project-scope conditions (a hydration snapshot present, not editing
      // from global scope, not init).
      const store = useWizardStore.getState();
      useWizardStore.setState({
        selectedAgents: ["web-developer"],
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
      expect(toastMessage, "a project-owned agent deselect must not be refused").toBeNull();
    });

    it("should toggle agent off", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
    });

    it("should allow multiple agents to be selected", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.toggleAgent("api-developer");
      store.toggleAgent("reviewer");

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer", "api-developer", "reviewer"]);
    });

    it("should reset selectedAgents on reset", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.reset();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
    });
  });

  describe("agentConfigs and scope management", () => {
    it("should have empty agentConfigs initially", () => {
      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual([]);
    });

    it("should sync agentConfigs when toggleAgent is called", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");

      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
    });

    it("should remove global agent from agentConfigs when toggled off during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.toggleAgent("web-developer");

      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual([]);
    });

    it("removes a global agent from agentConfigs when toggled off while editing from global scope", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: true,
      });
      store.toggleAgent("web-developer");
      store.toggleAgent("web-developer");

      const { agentConfigs } = useWizardStore.getState();
      // Global-scope edit: no overlay, so removal is clean (no tombstone).
      expect(agentConfigs).toStrictEqual([]);
    });

    it("should remove project agent from agentConfigs when toggled off", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      // Set to project scope
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });
      store.toggleAgent("web-developer");

      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual([]);
    });

    it("should toggle agent scope between global and project", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      store.toggleAgentScope("web-developer");

      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"]));

      store.toggleAgentScope("web-developer");
      expect(useWizardStore.getState().agentConfigs).toStrictEqual(
        buildAgentConfigs(["web-developer"], { scope: "global" }),
      );
    });

    it("round-trips a persisted dual-scope agent row with `s`: collapse to [G], then restore [P][G]", () => {
      // Agent mirror of the skill `s` round-trip: `s` is the SOLE dual-scope toggle, so a
      // persisted [P][G] agent pair collapses on the first press and is restored on the second.
      const dualScope = (): AgentScopeConfig[] => [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ];
      const store = useWizardStore.getState();
      useWizardStore.setState({
        agentConfigs: dualScope(),
        installedAgentConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleAgentScope("web-developer");
      const first = useWizardStore.getState();
      expect(first.agentConfigs).toStrictEqual(
        buildAgentConfigs(["web-developer"], { scope: "global" }),
      );
      expect(first.toastMessage).toBeNull();

      store.toggleAgentScope("web-developer");
      const second = useWizardStore.getState();
      expect(second.agentConfigs).toStrictEqual(dualScope());
      expect(second.toastMessage).toBeNull();
    });

    it("runs the full in-session blocked-toggle → s-collapse → blocked-toggle → s-restore sequence on a persisted [P][G] agent", () => {
      // Agent mirror of the skill in-session sequence. The hydration snapshot stays a frozen
      // [P][G] throughout while the live agentConfigs is mutated by each keypress.
      const dualScope = (): AgentScopeConfig[] => [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ];
      const plainGlobal = (): AgentScopeConfig[] =>
        buildAgentConfigs(["web-developer"], { scope: "global" });

      const store = useWizardStore.getState();
      useWizardStore.setState({
        selectedAgents: ["web-developer"],
        agentConfigs: dualScope(),
        installedAgentConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      // Step 1 — the selection key on the live [P][G] row is BLOCKED: only `s` may change a
      // dual-scope pair. Live config and selection unchanged, toast shown.
      store.toggleAgent("web-developer");
      const afterBlockedToggle = useWizardStore.getState();
      expect(afterBlockedToggle.agentConfigs).toStrictEqual(dualScope());
      expect(afterBlockedToggle.selectedAgents).toStrictEqual(["web-developer"]);
      expect(afterBlockedToggle.toastMessage).toBe(
        "Global agents cannot be changed from project scope",
      );

      // Step 2 — `s` collapses [P][G] to a single active inherited-global entry; the agent
      // stays selected (still active via global).
      useWizardStore.setState({ toastMessage: null });
      store.toggleAgentScope("web-developer");
      const afterCollapse = useWizardStore.getState();
      expect(afterCollapse.agentConfigs).toStrictEqual(plainGlobal());
      expect(afterCollapse.selectedAgents).toStrictEqual(["web-developer"]);
      expect(afterCollapse.toastMessage).toBeNull();

      // Step 3 — the selection key on the collapsed row is BLOCKED too. Live config unchanged.
      store.toggleAgent("web-developer");
      const afterBlocked = useWizardStore.getState();
      expect(afterBlocked.agentConfigs).toStrictEqual(plainGlobal());
      expect(afterBlocked.toastMessage).toBe("Global agents cannot be changed from project scope");

      // Step 4 — `s` restores a fresh [P][G] pair.
      useWizardStore.setState({ toastMessage: null });
      store.toggleAgentScope("web-developer");
      const afterRestore = useWizardStore.getState();
      expect(afterRestore.agentConfigs).toStrictEqual(dualScope());
      expect(afterRestore.toastMessage).toBeNull();

      // Step 5 — `s` again freely flips the reconstructed pair back to plain global.
      store.toggleAgentScope("web-developer");
      const afterFlip = useWizardStore.getState();
      expect(afterFlip.agentConfigs).toStrictEqual(plainGlobal());
      expect(afterFlip.toastMessage).toBeNull();

      // Step 5b — and back to [P][G], proving a free P↔G round-trip within the session.
      store.toggleAgentScope("web-developer");
      expect(useWizardStore.getState().agentConfigs).toStrictEqual(dualScope());
    });

    it("writes no tombstone when a project agent re-scoped to global in-session is then deselected", () => {
      // Agent mirror of the skill case: the snapshot holds the agent at PROJECT scope only, so
      // nothing is installed globally. `s` rescopes it to global in-session; the following
      // deselect has no global install to mask and must not mint a tombstone.
      const store = useWizardStore.getState();
      useWizardStore.setState({
        selectedAgents: ["web-developer"],
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleAgentScope("web-developer");
      expect(useWizardStore.getState().agentConfigs).toStrictEqual(
        buildAgentConfigs(["web-developer"], { scope: "global" }),
      );

      store.toggleAgent("web-developer");

      const { agentConfigs, selectedAgents } = useWizardStore.getState();
      expect(
        agentConfigs.filter((ac) => ac.excluded),
        "an agent never installed globally must not gain a global tombstone",
      ).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
      expect(selectedAgents).toStrictEqual([]);
    });

    it("should set and clear focusedAgentId", () => {
      const store = useWizardStore.getState();
      store.setFocusedAgentId("web-developer");

      expect(useWizardStore.getState().focusedAgentId).toBe("web-developer");

      store.setFocusedAgentId(null);
      expect(useWizardStore.getState().focusedAgentId).toBeNull();
    });

    it("should remove global agent when deselected during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      // web-developer is now selected with global scope

      store.toggleAgent("web-developer");
      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
    });

    it("removes a global agent cleanly (no tombstone, dropped from selectedAgents) when deselected while editing from global scope", () => {
      // At ~/ the config being edited IS the global config — there is no project overlay,
      // so a deselect is a genuine removal, not a tombstone-and-keep-selected.
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: true,
      });
      store.toggleAgent("web-developer");
      // web-developer is now selected with global scope

      store.toggleAgent("web-developer");
      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
      expect(agentConfigs).toStrictEqual([]);
    });

    it("cleanly re-adds a global agent when re-selected while editing from global scope", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: true,
      });
      store.toggleAgent("web-developer");
      store.toggleAgent("web-developer"); // deselect → clean removal (global-scope edit)
      store.toggleAgent("web-developer"); // re-select → clean re-add

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer"]);
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
    });

    it("drops a global agent from selectedAgents when toggled off while editing from global scope", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        isEditingFromGlobalScope: true,
      });

      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).not.toContain("web-developer");
      expect(agentConfigs.some((ac) => ac.name === "web-developer")).toBe(false);
    });

    it("should remove non-installed agent from selectedAgents when toggled off", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");

      store.toggleAgent("web-developer");

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).not.toContain("web-developer");
    });

    it("should restore excluded global agent when toggled back on", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      store.toggleAgent("web-developer");
      store.toggleAgent("web-developer");

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toContain("web-developer");
      expect(agentConfigs).not.toContainEqual(
        expect.objectContaining({ name: "web-developer", excluded: true }),
      );
    });

    describe("dual-scope selection toggle (agents)", () => {
      const dualScopeAgents = () => [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ];

      it("leaves a dual-scope agent untouched when the selection key is pressed and emits the global-locked toast", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          selectedAgents: ["web-developer"],
          agentConfigs: dualScopeAgents(),
          installedAgentConfigs: dualScopeAgents(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        store.toggleAgent("web-developer");

        const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
        // The selection key is inert on a `[P][G]` row — `s` alone changes a dual-scope pair.
        expect(toastMessage).toBe("Global agents cannot be changed from project scope");
        expect(selectedAgents).toStrictEqual(["web-developer"]);
        expect(agentConfigs).toStrictEqual(dualScopeAgents());
      });

      it("restores [P][G] when re-selecting an inherited-global agent row (fresh project entry AND tombstone)", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          selectedAgents: [],
          agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
          installedAgentConfigs: dualScopeAgents(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        store.toggleAgent("web-developer");

        const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBeNull();
        expect(selectedAgents).toStrictEqual(["web-developer"]);
        expect(agentConfigs).toStrictEqual(dualScopeAgents());
      });

      it("restores [P][G] cleanly (no two active entries) via `s` after the collapse is saved and re-opened", () => {
        const store = useWizardStore.getState();
        useWizardStore.setState({
          selectedAgents: ["web-developer"],
          agentConfigs: dualScopeAgents(),
          installedAgentConfigs: dualScopeAgents(),
          isEditingFromGlobalScope: false,
          isInitMode: false,
        });

        // `s` collapses [P][G] -> single inherited-global [G]; the agent stays selected.
        store.toggleAgentScope("web-developer");
        expect(useWizardStore.getState().agentConfigs).toStrictEqual(
          buildAgentConfigs(["web-developer"], { scope: "global" }),
        );

        // Simulate save-and-reopen: the persisted single-global entry becomes the installed
        // snapshot, so `s` (the sanctioned restore path) re-creates a fresh [P][G] pair.
        useWizardStore.setState({
          agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
          installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        });

        store.toggleAgentScope("web-developer"); // G->P restores a fresh [P][G] pair

        const { agentConfigs } = useWizardStore.getState();
        const activeEntries = agentConfigs.filter((ac) => !ac.excluded);
        expect(activeEntries).toStrictEqual(
          buildAgentConfigs(["web-developer"], { scope: "project" }),
        );
        expect(agentConfigs.filter((ac) => ac.excluded)).toStrictEqual(
          buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        );
      });

      it("removes a global-scope agent entirely when deselected from a global-context edit (Scenario C setup)", () => {
        // Global install edited at ~/ : deselecting an active [G] agent must produce a genuine
        // removal so it truly disappears from the global config — the precondition for
        // propagation to drop stale project tombstones.
        const store = useWizardStore.getState();
        useWizardStore.setState({
          selectedAgents: ["web-developer"],
          agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
          installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
          isEditingFromGlobalScope: true,
          isInitMode: false,
        });

        store.toggleAgent("web-developer");

        const { selectedAgents, agentConfigs, toastMessage } = useWizardStore.getState();
        expect(toastMessage).toBeNull();
        expect(selectedAgents).toStrictEqual([]);
        expect(agentConfigs).toStrictEqual([]);
      });
    });

    it("should not toggle agent scope when isEditingFromGlobalScope is true", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({ isEditingFromGlobalScope: true });

      store.toggleAgentScope("web-developer");
      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
    });

    it("should add excluded global entry when toggling previously-installed global agent to project", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      store.toggleAgentScope("web-developer");
      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual([
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ]);
    });

    it("should remove excluded global entry when toggling agent back from project to global", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      store.toggleAgentScope("web-developer"); // global → project (adds excluded)
      store.toggleAgentScope("web-developer"); // project → global (removes excluded)
      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"], { scope: "global" }));
    });

    it("should not add excluded entry when toggling agent scope during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("web-developer");
      // installedAgentConfigs is null (fresh init)

      store.toggleAgentScope("web-developer");
      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs).toStrictEqual(buildAgentConfigs(["web-developer"]));
    });
  });

  describe("preselectAgentsFromDomains", () => {
    it("should preselect web-related agents when web domain is selected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([...EXPECTED_AGENTS.WEB]);
      expect(agentConfigs).toStrictEqual(
        EXPECTED_AGENTS.WEB.map((name) => ({ name, scope: "global" })),
      );
    });

    it("should preselect api-related agents when api domain is selected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("api");
      store.preselectAgentsFromDomains();

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([...EXPECTED_AGENTS.API]);
      expect(agentConfigs).toStrictEqual(
        EXPECTED_AGENTS.API.map((name) => ({ name, scope: "global" })),
      );
    });

    it("should preselect cli agents when cli domain is selected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("cli");
      store.preselectAgentsFromDomains();

      const { selectedAgents, agentConfigs } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([...EXPECTED_AGENTS.CLI]);
      expect(agentConfigs).toStrictEqual(
        EXPECTED_AGENTS.CLI.map((name) => ({ name, scope: "global" })),
      );
    });

    it("should never include optional agents regardless of domains", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.toggleDomain("cli");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([...EXPECTED_AGENTS.ALL]);
    });

    it("should return empty agents when no domains are selected", () => {
      const store = useWizardStore.getState();
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual([]);
    });

    it("should produce union of agents for multiple domains", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toContain("web-developer");
      expect(selectedAgents).toContain("api-developer");
      // One consolidated reviewer serves both domains — present exactly once.
      expect(selectedAgents.filter((name) => name === "reviewer")).toHaveLength(1);
    });

    it("should not preselect api agents when only web domain is selected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toContain("web-developer");
      expect(selectedAgents).toContain("reviewer");
      expect(selectedAgents).not.toContain("api-developer");
      expect(selectedAgents).not.toContain("api-tester");
    });

    it("should return sorted agents", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.toggleDomain("api");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      const sorted = [...selectedAgents].sort();
      expect(selectedAgents).toStrictEqual(sorted);
    });

    it("should replace previous agent selection", () => {
      const store = useWizardStore.getState();
      store.toggleAgent("codex-keeper");
      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      // preselectAgentsFromDomains replaces the array entirely
      expect(selectedAgents).not.toContain("codex-keeper");
    });

    it("should retain a globally installed agent that no selected domain rosters", () => {
      const store = useWizardStore.getState();
      // cli-developer is installed globally but belongs to the cli roster, not web's.
      // Preselection rebuilds the roster — it must not silently drop the global install.
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["cli-developer"], { scope: "global" }),
        installedAgentConfigs: buildAgentConfigs(["cli-developer"], { scope: "global" }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { agentConfigs, selectedAgents } = useWizardStore.getState();
      expect(
        agentConfigs.filter((ac) => ac.name === "cli-developer"),
        "a globally installed agent outside the domain roster must survive preselection",
      ).toStrictEqual(buildAgentConfigs(["cli-developer"], { scope: "global" }));
      expect(
        agentConfigs.filter((ac) => ac.name !== "cli-developer"),
        "the domain roster is still preselected alongside the retained global agent",
      ).toStrictEqual(EXPECTED_AGENTS.WEB.map((name) => ({ name, scope: "global" })));
      expect(selectedAgents).toContain("web-developer");
    });

    it("should preserve a saved agent's model and effort through the roster rebuild", () => {
      const store = useWizardStore.getState();
      // Preselection re-derives every rostered agent's config from scratch. The scope survives
      // that rebuild; the user's model/effort choice has to survive it on the same terms.
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["web-developer"], {
          scope: "project",
          model: "haiku",
          effort: "xhigh",
        }),
      });

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { agentConfigs } = useWizardStore.getState();
      expect(agentConfigs.filter((ac) => ac.name === "web-developer")).toStrictEqual(
        buildAgentConfigs(["web-developer"], {
          scope: "project",
          model: "haiku",
          effort: "xhigh",
        }),
      );
    });

    it("should preserve excluded agent configs", () => {
      const store = useWizardStore.getState();
      // Set up an excluded agent config that is not in any domain's agents
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["codex-keeper"], { scope: "global", excluded: true }),
      });

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { agentConfigs } = useWizardStore.getState();
      // Excluded agent should still be present in agentConfigs
      const excludedConfig = agentConfigs.find((ac) => ac.name === "codex-keeper");
      expect(excludedConfig?.excluded).toBe(true);
      // Domain agents should also be present
      const webDevConfig = agentConfigs.find((ac) => ac.name === "web-developer");
      expect(webDevConfig?.name).toBe("web-developer");
    });

    it("should clear excluded flag when re-including previously excluded agent via domain preselection", () => {
      const store = useWizardStore.getState();
      // Set up web-developer as excluded (it IS in web domain's agent list)
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      });

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { agentConfigs } = useWizardStore.getState();
      const webDevConfig = agentConfigs.find((ac) => ac.name === "web-developer");
      // Excluded flag should be cleared since web-developer is in the domain's agents
      expect(webDevConfig?.excluded).toBeUndefined();
    });

    it("preserves excluded tombstone when active agent entry exists for same agent at different scope", () => {
      const store = useWizardStore.getState();

      // Project-scope active + global-scope excluded tombstone for an agent that IS in the
      // web domain. preselectAgentsFromDomains must preserve both so the render layer can
      // compute the secondary scope badge (mirrors the skill-side dual-scope invariant).
      useWizardStore.setState({
        agentConfigs: [
          ...buildAgentConfigs(["web-developer"]),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });

      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { agentConfigs } = useWizardStore.getState();
      const webDevConfigs = agentConfigs.filter((ac) => ac.name === "web-developer");
      expect(webDevConfigs).toHaveLength(2);

      const active = webDevConfigs.find((ac) => !ac.excluded);
      const tombstone = webDevConfigs.find((ac) => ac.excluded);
      expect(active?.scope).toBe("project");
      expect(tombstone?.scope).toBe("global");
      expect(tombstone?.excluded).toBe(true);
    });

    it("preserves excluded tombstone in preselectAgentsFromStack when active entry exists at different scope", () => {
      const store = useWizardStore.getState();

      // Dual-scope pair seeded in globalAgentPreselections. Merging a stack that also
      // references the agent must keep both the active project entry and the global tombstone.
      useWizardStore.setState({
        globalAgentPreselections: {
          agents: ["web-developer"],
          configs: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ],
        },
      });

      store.preselectAgentsFromStack(["web-developer"]);

      const { agentConfigs } = useWizardStore.getState();
      const webDevConfigs = agentConfigs.filter((ac) => ac.name === "web-developer");
      expect(webDevConfigs).toHaveLength(2);

      const active = webDevConfigs.find((ac) => !ac.excluded);
      const tombstone = webDevConfigs.find((ac) => ac.excluded);
      expect(active?.scope).toBe("project");
      expect(tombstone?.scope).toBe("global");
      expect(tombstone?.excluded).toBe(true);
    });
  });

  describe("step progress with agents step", () => {
    // A stack step can only be behind you in a flow that has one, and the
    // suite's own matrix ships no stacks — so these say so explicitly.
    beforeEach(() => {
      initializeMatrix(REACT_HONO_ONE_STACK_MATRIX);
    });

    it("should include agents in completed steps when on confirm", () => {
      const store = useWizardStore.getState();
      store.setApproach("scratch");
      store.setStep("domains");
      store.setStep("build");
      store.setStep("sources");
      store.setStep("agents");
      store.setStep("confirm");

      const { completedSteps } = store.getStepProgress();
      expect(completedSteps).toContain("stack");
      expect(completedSteps).toContain("domains");
      expect(completedSteps).toContain("agents");
      expect(completedSteps).toContain("sources");
      expect(completedSteps).toContain("build");
    });

    it("should include sources in completed steps when on agents step", () => {
      const store = useWizardStore.getState();
      store.setApproach("scratch");
      store.setStep("domains");
      store.setStep("build");
      store.setStep("sources");
      store.setStep("agents");

      const { completedSteps } = store.getStepProgress();
      expect(completedSteps).toContain("stack");
      expect(completedSteps).toContain("domains");
      expect(completedSteps).toContain("build");
      expect(completedSteps).toContain("sources");
      expect(completedSteps).not.toContain("agents");
    });

    it("should skip agents step when using stack defaults", () => {
      const store = useWizardStore.getState();
      store.setApproach("stack");
      store.selectStack("nextjs-fullstack");
      store.setStackAction("defaults");
      store.setStep("confirm");

      const { skippedSteps } = store.getStepProgress();
      expect(skippedSteps).toContain("agents");
      expect(skippedSteps).toContain("build");
      expect(skippedSteps).toContain("sources");
    });
  });

  /**
   * The steps this session runs are what the tab bar is drawn from, so a step
   * the wizard never opens is a tab it never paints. Both flows are spelled out
   * literally rather than derived from `WIZARD_STEP_ORDER` — an expectation
   * built from the constant under test agrees with it however it changes.
   */
  describe("active step flow", () => {
    it("runs every step when the source ships stacks", () => {
      initializeMatrix(REACT_HONO_ONE_STACK_MATRIX);

      expect(getActiveStepFlow()).toStrictEqual([
        "stack",
        "domains",
        "build",
        "sources",
        "agents",
        "confirm",
      ]);
    });

    it("has no stack step when the source ships none", () => {
      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);

      expect(getActiveStepFlow()).toStrictEqual([
        "domains",
        "build",
        "sources",
        "agents",
        "confirm",
      ]);
    });

    it("counts no stack step as completed behind the step a stackless flow opens on", () => {
      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
      hydrateWizardStore({});

      const store = useWizardStore.getState();
      store.setStep("build");

      const { completedSteps } = store.getStepProgress();
      expect(completedSteps).toStrictEqual(["domains"]);
    });
  });

  describe("deriveInstallMode", () => {
    it("should return 'plugin' when all skills have default marketplace source", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", true);

      const result = store.deriveInstallMode();
      expect(result).toBe("plugin");
    });

    it("should return 'eject' when all skills are set to eject", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);
      store.setInstallMode("web-framework-react", "eject", "global");
      store.setInstallMode("api-framework-hono", "eject", "global");

      const result = store.deriveInstallMode();
      expect(result).toBe("eject");
    });

    it("should return 'mixed' when some skills are local and some are not", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);
      store.setInstallMode("web-framework-react", "eject", "global");
      store.setInstallMode("api-framework-hono", "plugin", "global");

      const result = store.deriveInstallMode();
      expect(result).toBe("mixed");
    });

    it("should return 'local' when no skills are configured", () => {
      const store = useWizardStore.getState();

      const result = store.deriveInstallMode();
      expect(result).toBe("eject");
    });

    it("should handle single skill as local", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.setInstallMode("web-framework-react", "eject", "global");

      const result = store.deriveInstallMode();
      expect(result).toBe("eject");
    });

    it("should handle single skill as plugin", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const result = store.deriveInstallMode();
      expect(result).toBe("plugin");
    });
  });

  describe("setToastMessage", () => {
    it("should set and clear toast message", () => {
      const store = useWizardStore.getState();

      store.setToastMessage("hello");
      expect(useWizardStore.getState().toastMessage).toBe("hello");

      store.setToastMessage(null);
      expect(useWizardStore.getState().toastMessage).toBeNull();
    });
  });

  describe("hydrateWizardStore", () => {
    beforeEach(() => {
      initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
    });

    it("sets edit-mode state when initialStep is provided", () => {
      hydrateWizardStore({
        initialStep: "build",
        initialDomains: ["web"],
        installedSkillIds: ["web-framework-react"],
      });

      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.history).toStrictEqual([]);
      expect(state.approach).toBe("scratch");
      expect(state.selectedDomains).toStrictEqual(["web"]);
      expect(state.isInitMode).toBe(false);
    });

    it("sets init-mode defaults when no options are provided", () => {
      initializeMatrix(REACT_HONO_ONE_STACK_MATRIX);

      hydrateWizardStore({});

      const state = useWizardStore.getState();
      expect(state.step).toBe("stack");
      expect(state.history).toStrictEqual([]);
      expect(state.isInitMode).toBe(true);
    });

    it("opens past the stack step, prepared as scratch, when the source offers no stacks", () => {
      // The beforeEach matrix carries no stacks, which is what a custom
      // marketplace shipping none loads as: the step would hold nothing but its
      // own scratch row, so the wizard opens where that row leads.
      hydrateWizardStore({});

      const state = useWizardStore.getState();
      expect(state.step).toBe("domains");
      expect(state.history).toStrictEqual([]);
      expect(state.isInitMode).toBe(true);
      expect(state.approach).toBe("scratch");
      expect(state.selectedStackId).toBeNull();
      expect(state.selectedDomains).toStrictEqual([...DEFAULT_SCRATCH_DOMAINS]);
    });

    it("merges global preselections into the opening step it skips the stack step for", () => {
      const skillConfigs: SkillConfig[] = [
        { id: "web-framework-react", scope: "global", origin: "eject" },
      ];

      hydrateWizardStore({ installedSkillConfigs: skillConfigs });

      const state = useWizardStore.getState();
      expect(state.step).toBe("domains");
      expect(state.skillConfigs).toStrictEqual(skillConfigs);
      expect(state.domainSelections.web?.["web-framework"]).toStrictEqual(["web-framework-react"]);
    });

    it("populates installedSkillConfigs for diff rendering", () => {
      const skillConfigs: SkillConfig[] = [
        { id: "web-framework-react", scope: "global", origin: "eject" },
      ];

      hydrateWizardStore({
        initialStep: "build",
        installedSkillConfigs: skillConfigs,
      });

      const state = useWizardStore.getState();
      expect(state.installedSkillConfigs).toStrictEqual(skillConfigs);
    });

    it("sets isEditingFromGlobalScope when flag is true", () => {
      hydrateWizardStore({
        initialStep: "build",
        isEditingFromGlobalScope: true,
      });

      expect(useWizardStore.getState().isEditingFromGlobalScope).toBe(true);
    });

    it("resets prior store state before applying new hydration", () => {
      // Seed some state
      useWizardStore.setState({ step: "confirm", selectedDomains: ["api"] });

      hydrateWizardStore({
        initialStep: "build",
        initialDomains: ["web"],
      });

      const state = useWizardStore.getState();
      expect(state.step).toBe("build");
      expect(state.selectedDomains).toStrictEqual(["web"]);
    });

    it("stores globalPreselections in init flow when installedSkillConfigs provided", () => {
      const skillConfigs: SkillConfig[] = [
        { id: "web-framework-react", scope: "global", origin: "eject" },
      ];

      hydrateWizardStore({
        installedSkillConfigs: skillConfigs,
      });

      const state = useWizardStore.getState();
      expect(state.isInitMode).toBe(true);
      expect(state.globalPreselections).toStrictEqual(skillConfigs);
    });

    it("seeds focusedSkillId to the active domain's first grid option (edit flow)", () => {
      hydrateWizardStore({
        initialStep: "build",
        initialDomains: ["web"],
        installedSkillIds: ["web-framework-react"],
      });

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });

    it("seeds focusedSkillId to the active domain's first grid option (init flow)", () => {
      hydrateWizardStore({ initialDomains: ["web"] });

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });

    it("seeds focusedSkillId to the fallback domain's first grid option when no domains are selected", () => {
      hydrateWizardStore({});

      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");
    });
  });
});
