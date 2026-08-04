import { describe, it, expect, beforeEach } from "vitest";
import { hydrateWizardStore, useWizardStore } from "./wizard-store";
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
  REACT_HONO_FRAMEWORK_API_MATRIX,
  REACT_HONO_WEB_API_DOMAINS_MATRIX,
} from "../lib/__tests__/mock-data/mock-matrices";
import type { AgentScopeConfig, SkillConfig, SkillSource } from "../types";
import { EXPECTED_AGENTS } from "../lib/__tests__/expected-values";

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
      expect(state.boundSkills).toStrictEqual([]);
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
      expect(state.boundSkills).toStrictEqual([]);
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
      expect(stateAfterClear.boundSkills).toStrictEqual([]);
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
        buildSkillConfigs(["api-framework-hono"], { scope: "global", source: "agents-inc" }),
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
          source: "agents-inc",
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
          source: "agents-inc",
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
        buildSkillConfigs(["web-styling-tailwind"], { scope: "global", source: "agents-inc" }),
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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

    it("should toggle settings on", () => {
      const store = useWizardStore.getState();

      store.toggleSettings();

      const { showSettings } = useWizardStore.getState();
      expect(showSettings).toBe(true);
    });

    it("should toggle settings off (show then hide)", () => {
      const store = useWizardStore.getState();

      store.toggleSettings();
      store.toggleSettings();

      const { showSettings } = useWizardStore.getState();
      expect(showSettings).toBe(false);
    });

    it("should start with showInfo false", () => {
      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(false);
    });

    it("should start with showSettings false", () => {
      const { showSettings } = useWizardStore.getState();
      expect(showSettings).toBe(false);
    });

    it("should reset showInfo to false after reset", () => {
      const store = useWizardStore.getState();
      store.toggleInfo();
      store.reset();

      const { showInfo } = useWizardStore.getState();
      expect(showInfo).toBe(false);
    });

    it("should reset showSettings to false after reset", () => {
      const store = useWizardStore.getState();
      store.toggleSettings();
      store.reset();

      const { showSettings } = useWizardStore.getState();
      expect(showSettings).toBe(false);
    });
  });

  describe("skillConfigs and per-skill scope", () => {
    it("should sync skillConfigs when toggling a technology on", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(1);
      expect(skillConfigs[0]).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" })[0],
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
          source: "agents-inc",
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
          source: "agents-inc",
        }),
      );
    });

    it("removes the old global skill cleanly (no tombstone) in exclusive mode while editing from global scope and adds the new skill", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
          source: "agents-inc",
        }),
      );
    });

    it("cleanly re-adds a global skill when re-selected while editing from global scope", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
    });

    it("restores the persisted project scope and eject source when a project-only skill is deselected and re-selected in one session", () => {
      const store = useWizardStore.getState();
      const persisted = buildSkillConfigs(["web-framework-react"], {
        scope: "project",
        source: "eject",
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
          source: "eject",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleTechnology("web", "web-testing", "web-testing-vitest", false);

      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", source: "agents-inc" }),
      );
    });

    describe("dual-scope selection toggle", () => {
      const dualScopeConfigs = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      ];

      it("leaves a dual-scope skill untouched when the selection key is pressed and emits the global-locked toast", () => {
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
        // Space is inert on a `[P][G]` row — `s` is the only key that changes a dual-scope pair.
        expect(toastMessage).toBe("Global skills cannot be changed from project scope");
        expect(domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
        expect(skillConfigs).toStrictEqual(dualScopeConfigs());
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

        // A radio swap to another framework would implicitly drop the `[P][G]` pair.
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
            source: "agents-inc",
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
          buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
        );

        // Simulate save-and-reopen: the persisted single-global entry becomes the installed
        // snapshot. Re-selection via the selection key on the collapsed [G] row is a guarded
        // no-op (installedSkillConfigs now holds an ACTIVE global entry) — `s` is the
        // sanctioned restore path.
        useWizardStore.setState({
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
        });

        store.toggleSkillScope("web-framework-react"); // G->P restores a fresh [P][G] pair

        const { skillConfigs } = useWizardStore.getState();
        const activeEntries = skillConfigs.filter((sc) => !sc.excluded);
        expect(activeEntries).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        );
        expect(skillConfigs.filter((sc) => sc.excluded)).toStrictEqual(
          buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
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
            source: "agents-inc",
          }),
          installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
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
      expect(skillConfigs[0].scope).toBe("project");
    });

    it("should toggle skill scope back to global", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.toggleSkillScope("web-framework-react");
      store.toggleSkillScope("web-framework-react");

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs[0].scope).toBe("global");
    });

    it("should block project eject to global when global eject already exists and set toastMessage", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
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
          source: "eject",
        }),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
        }),
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs, toastMessage } = useWizardStore.getState();
      expect(skillConfigs[0].scope).toBe("project");
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
      expect(skillConfigs[0].scope).toBe("global");
      expect(toastMessage).toBeNull();
    });

    it("should not toggle skill scope when isEditingFromGlobalScope is true", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({ isEditingFromGlobalScope: true });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs[0].scope).toBe("global");
    });

    it("should add excluded global entry when toggling previously-installed global skill to project", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
      });

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
          source: "agents-inc",
        }),
      });

      store.toggleSkillScope("web-framework-react"); // global → project (adds excluded)
      store.toggleSkillScope("web-framework-react"); // project → global (removes excluded)
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
    });

    it("should not add excluded entry when toggling scope during fresh init", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // installedSkillConfigs is null (fresh init)

      store.toggleSkillScope("web-framework-react");
      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toHaveLength(1);
      expect(skillConfigs[0].scope).toBe("project");
    });

    it("should allow P→G reverse toggle for ejected skills after G→P toggle (round-trip)", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
        }),
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
        }),
      });

      // G→P: should succeed and create tombstone
      store.toggleSkillScope("web-framework-react");
      const afterGtoP = useWizardStore.getState();
      expect(afterGtoP.skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { source: "eject" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
          excluded: true,
        }),
      ]);
      expect(afterGtoP.toastMessage).toBeNull();

      // P→G: should succeed (not blocked) and remove tombstone
      store.toggleSkillScope("web-framework-react");
      const afterPtoG = useWizardStore.getState();
      expect(afterPtoG.skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "eject" }),
      );
      expect(afterPtoG.toastMessage).toBeNull();
    });

    it("round-trips a persisted dual-scope skill row with `s`: collapse to [G], then restore [P][G]", () => {
      // Reopened session on a persisted [P][G] pair: the snapshot carries only the EXCLUDED
      // global tombstone (never an active global entry). `s` is the SOLE dual-scope toggle —
      // P→G drops the tombstone (collapse), G→P re-adds it (restore), with no toast either way.
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
      expect(first.toastMessage).toBeNull();

      store.toggleSkillScope("web-framework-react");
      const second = useWizardStore.getState();
      expect(second.skillConfigs).toStrictEqual(dualScope());
      expect(second.toastMessage).toBeNull();
    });

    it("runs the full in-session blocked-space → s-collapse → blocked-space → s-restore sequence on a persisted [P][G] skill", () => {
      // Single wizard session on a persisted dual-scope pair: the hydration snapshot stays a
      // frozen [P][G] (project-active + global tombstone) throughout, while the live config is
      // mutated by each keypress. Exercises the state machine the E2E suite drives end-to-end.
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      ];
      const plainGlobal = (): SkillConfig[] =>
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" });

      const store = useWizardStore.getState();
      useWizardStore.setState({
        domainSelections: { web: { "web-framework": ["web-framework-react"] } },
        skillConfigs: dualScope(),
        installedSkillConfigs: dualScope(),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      // Step 1 — spacebar on the live [P][G] row is BLOCKED: only `s` may change a dual-scope
      // pair. Live config and selection unchanged, toast shown.
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      const afterBlockedSpace = useWizardStore.getState();
      expect(afterBlockedSpace.skillConfigs).toStrictEqual(dualScope());
      expect(afterBlockedSpace.domainSelections.web!["web-framework"]).toStrictEqual([
        "web-framework-react",
      ]);
      expect(afterBlockedSpace.toastMessage).toBe(
        "Global skills cannot be changed from project scope",
      );

      // Step 2 — `s` collapses [P][G] to a single active inherited-global entry; the skill
      // stays selected (still active via global).
      useWizardStore.setState({ toastMessage: null });
      store.toggleSkillScope("web-framework-react");
      const afterCollapse = useWizardStore.getState();
      expect(afterCollapse.skillConfigs).toStrictEqual(plainGlobal());
      expect(afterCollapse.domainSelections.web!["web-framework"]).toStrictEqual([
        "web-framework-react",
      ]);
      expect(afterCollapse.toastMessage).toBeNull();

      // Step 3 — spacebar on the collapsed row is BLOCKED too (would otherwise tombstone the
      // still-real global install). Live config unchanged, toast shown.
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
          source: "agents-inc",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
        toastMessage: null,
      });

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleSkillScope("web-framework-react");
      expect(useWizardStore.getState().skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const { skillConfigs } = useWizardStore.getState();
      expect(
        skillConfigs.filter((sc) => sc.excluded),
        "a skill never installed globally must not gain a global tombstone",
      ).toStrictEqual([]);
      expect(skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
    });

    it("should set and clear focusedSkillId", () => {
      const store = useWizardStore.getState();

      store.setFocusedSkillId("web-framework-react");
      expect(useWizardStore.getState().focusedSkillId).toBe("web-framework-react");

      store.setFocusedSkillId(null);
      expect(useWizardStore.getState().focusedSkillId).toBeNull();
    });

    it("should update source via setSourceSelection on skillConfigs", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.setSourceSelection("web-framework-react", "eject", "global");

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs[0].source).toBe("eject");
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
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
        ...buildSkillConfigs(["web-testing-vitest"], {
          scope: "global",
          source: "agents-inc",
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
      expect(excludedConfigs[0].id).toBe("web-testing-vitest");
      expect(excludedConfigs[0].excluded).toBe(true);
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
          source: "agents-inc",
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
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
          source: "agents-inc",
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
          source: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });
      store.toggleDomain("web");
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);
      // Set react to global, zustand to project
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-state-zustand"], { scope: "project", source: "agents-inc" }),
        ],
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
      expect(selectedDomains).toStrictEqual([]);
      expect(domainSelections.web).toBeUndefined();
    });

    it("collapses a dual-scope pair to one inherited global entry when its domain is deselected", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const dualScope = (): SkillConfig[] => [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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

    it("should set all sources to eject via setAllSourcesEject", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      store.setAllSourcesEject();

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs.every((sc) => sc.source === "eject")).toBe(true);
    });

    it("should set all sources to plugin via setAllSourcesPlugin", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.setSourceSelection("web-framework-react", "eject", "global");

      initializeMatrix(
        createMockMatrix({
          ...SKILLS.react,
          availableSources: [{ name: "Acme Corp", type: "private", installed: false }],
        }),
      );

      store.setAllSourcesPlugin();

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs[0].source).toBe("Acme Corp");
    });

    it("flips the active entry but leaves an excluded global tombstone's source intact via setAllSourcesEject", () => {
      // Dual-scope pair: active project entry + masked global tombstone. The bulk set-all is a
      // project-scope action, so the tombstone (which records the masked global install's source)
      // must keep its marketplace source rather than inherit the eject switch.
      const store = useWizardStore.getState();
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
      });

      store.setAllSourcesEject();

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "eject" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      ]);
    });

    it("flips the active entry but leaves an excluded global tombstone's source intact via setAllSourcesPlugin", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "eject" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
      });

      initializeMatrix(
        createMockMatrix({
          ...SKILLS.react,
          availableSources: [{ name: "Acme Corp", type: "private", installed: false }],
        }),
      );

      store.setAllSourcesPlugin();

      const { skillConfigs } = useWizardStore.getState();
      expect(skillConfigs).toStrictEqual([
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "Acme Corp" }),
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      ]);
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

  describe("buildSourceRows sort order", () => {
    function makeSource(overrides: Partial<SkillSource> & { name: string }): SkillSource {
      return {
        type: "private",
        installed: false,
        ...overrides,
      };
    }

    it("should sort local sources before scoped marketplace sources", () => {
      const store = useWizardStore.getState();

      const skill = {
        ...SKILLS.react,
        availableSources: [
          makeSource({ name: "Acme Corp", type: "private", primary: true }),
          makeSource({ name: "eject", type: "local", installed: true, installMode: "eject" }),
        ],
      };

      initializeMatrix(createMockMatrix(skill));

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].options[0].id).toBe("eject");
      expect(rows[0].options[1].id).toBe("Acme Corp");
    });

    it("should sort scoped marketplace before default public marketplace", () => {
      const store = useWizardStore.getState();

      const skill = {
        ...SKILLS.react,
        availableSources: [
          makeSource({ name: "agents-inc", type: "public" }),
          makeSource({ name: "Acme Corp", type: "private", primary: true }),
        ],
      };

      initializeMatrix(createMockMatrix(skill));

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].options[0].id).toBe("eject");
      expect(rows[0].options[1].id).toBe("Acme Corp");
      expect(rows[0].options[2].id).toBe("agents-inc");
    });

    it("should sort default public marketplace before third-party sources", () => {
      const store = useWizardStore.getState();

      const skill = {
        ...SKILLS.react,
        availableSources: [
          makeSource({ name: "Extra Corp", type: "private" }),
          makeSource({ name: "agents-inc", type: "public" }),
        ],
      };

      initializeMatrix(createMockMatrix(skill));

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].options[0].id).toBe("eject");
      expect(rows[0].options[1].id).toBe("agents-inc");
      expect(rows[0].options[2].id).toBe("Extra Corp");
    });

    it("should sort all four tiers in correct order", () => {
      const store = useWizardStore.getState();

      const skill = {
        ...SKILLS.react,
        availableSources: [
          makeSource({ name: "Extra Corp", type: "private" }),
          makeSource({ name: "agents-inc", type: "public" }),
          makeSource({ name: "Acme Corp", type: "private", primary: true }),
          makeSource({ name: "eject", type: "local", installed: true, installMode: "eject" }),
        ],
      };

      initializeMatrix(createMockMatrix(skill));

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);

      const sourceNames = rows[0].options.map((opt) => opt.id);
      expect(sourceNames).toStrictEqual(["eject", "Acme Corp", "agents-inc", "Extra Corp"]);
    });
  });

  describe("buildSourceRows scope", () => {
    it("should include scope from skillConfigs", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      // Default scope is "global" from createDefaultSkillConfig
      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("global");

      // Toggle to project scope
      store.toggleSkillScope("web-framework-react");
      const updatedRows = store.buildSourceRows();
      expect(updatedRows[0].scope).toBe("project");
    });

    it("should return undefined scope for skills not in skillConfigs", () => {
      initializeMatrix(ALL_SKILLS_WEB_AND_API_MATRIX);
      const store = useWizardStore.getState();

      // Add a skill via domainSelections but remove its skillConfig entry
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({ skillConfigs: [] });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].scope).toBeUndefined();
    });

    it("should mark global-scoped skills as readOnly when previously installed globally", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].readOnly).toBe(true);
    });

    it("should not mark global-scoped skills as readOnly when not previously installed", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      // installedSkillConfigs is null (default) — no prior installs
      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].readOnly).toBeUndefined();
    });

    it("should not mark global-scoped skills as readOnly when editing from global scope", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        isEditingFromGlobalScope: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].readOnly).toBeUndefined();
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
          source: "eject",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "eject",
        }),
      });

      const rows = store.buildSourceRows();
      // One row is the contract: the skill occupies the same (id, project) slot it was saved in, so
      // no slot is emptied and nothing is pending removal.
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("project");
      expect(rows[0].readOnly).toBeUndefined();
    });

    it("should emit both global locked and project editable rows for re-scoped skills", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Simulate: was installed globally, now toggled to project
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(2);

      // First row: locked global copy
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].scope).toBe("global");
      expect(rows[0].readOnly).toBe(true);

      // Second row: editable project copy
      expect(rows[1].skillId).toBe("web-framework-react");
      expect(rows[1].scope).toBe("project");
      expect(rows[1].readOnly).toBeUndefined();
    });

    it("should not mark new global skills as readOnly when not previously installed", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // No installedSkillConfigs entry for this skill — it's new
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("global");
      expect(rows[0].readOnly).toBeUndefined();
    });

    it("should emit single locked row for skill that remains global-scoped", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].scope).toBe("global");
      expect(rows[0].readOnly).toBe(true);
    });

    it("should show excluded global skills as locked rows", () => {
      const store = useWizardStore.getState();
      // Don't toggle any technology — the excluded skill was deselected
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].scope).toBe("global");
      expect(rows[0].readOnly).toBe(true);
    });

    it("should not duplicate rows for re-scoped skills with excluded tombstone", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].scope).toBe("global");
      expect(rows[0].readOnly).toBe(true);
      expect(rows[1].scope).toBe("project");
      expect(rows[1].readOnly).toBeUndefined();
    });

    it("should emit single editable row for new project-scoped skill", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].scope).toBe("project");
      expect(rows[0].readOnly).toBeUndefined();
    });

    it("should produce correct rows for mixed re-scoped and excluded skills", () => {
      const store = useWizardStore.getState();
      // React is selected (re-scoped to project), Vitest is NOT selected (purely excluded)
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
            scope: "global",
            source: "agents-inc",
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
      expect(reactRows[0].scope).toBe("global");
      expect(reactRows[0].readOnly).toBe(true);
      expect(reactRows[1].scope).toBe("project");
      expect(reactRows[1].readOnly).toBeUndefined();

      expect(vitestRows).toHaveLength(1);
      expect(vitestRows[0].scope).toBe("global");
      expect(vitestRows[0].readOnly).toBe(true);
    });

    it("should keep a deselected saved project skill visible as a disabled row", () => {
      const store = useWizardStore.getState();
      // Don't toggle any technology — the saved project skill was deselected, and a project
      // entry is dropped outright (no tombstone), so skillConfigs no longer holds it.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].disabled).toBe(true);
      // A lock would read as "installed globally"; this row is pending removal instead.
      expect(rows[0].readOnly).toBeUndefined();
      expect(rows[0].scope).toBe("project");
    });

    it("should show the persisted source on a deselected saved project skill", () => {
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(rows[0].options.filter((o) => o.selected).map((o) => o.id)).toStrictEqual(["eject"]);
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
          source: "eject",
        }),
        skillConfigs: [],
      });

      const rows = store.buildSourceRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].skillId).toBe("web-framework-react");
      expect(rows[0].disabled).toBe(true);
      expect(rows[0].scope).toBe("global");
      // A global-scope edit owns every row, so nothing renders as locked-because-inherited.
      expect(rows[0].readOnly).toBeUndefined();
    });

    it("should skip a saved skill the marketplace no longer carries instead of throwing", () => {
      const store = useWizardStore.getState();
      initializeMatrix(createMockMatrix(SKILLS.react));
      // A config referencing a removed/renamed skill: present in the snapshot, absent from the
      // matrix. Rendering a row for it would throw in getSkillById.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-testing-vitest"], {
          scope: "project",
          source: "eject",
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
            source: "agents-inc",
          }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.skillId)).toStrictEqual([
        "web-framework-react",
        "web-framework-react",
      ]);
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      // The surviving global install is locked-because-inherited, never pending removal.
      expect(rows[0].readOnly).toBe(true);
      expect(rows[0].disabled).toBeUndefined();
      // The emptied project slot is inert and pending removal — a lock there would read as
      // "installed globally" instead of "about to be removed".
      expect(rows[1].disabled).toBe(true);
      expect(rows[1].readOnly).toBeUndefined();
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
            source: "eject",
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "project", source: "eject" }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "eject",
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
      expect(rows[0].disabled).toBeUndefined();
      expect(rows[1].disabled).toBe(true);
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
      expect(rows[0].added).toBe(true);
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
      expect(rows[0].added).toBe(true);
    });

    it("should mark only the project half of an adopted global skill as added", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      // Adopting a global skill at project scope occupies a NEW (id, project) slot while the
      // global install stays put, so the addition belongs to the editable project row alone.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          source: "agents-inc",
        }),
      });

      const rows = store.buildSourceRows();
      expect(rows.map((r) => r.scope)).toStrictEqual(["global", "project"]);
      expect(rows[0].added).toBeUndefined();
      expect(rows[1].added).toBe(true);
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", source: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
      expect(rows[0].added).toBeUndefined();
      expect(rows[0].disabled).toBeUndefined();
      // The emptied project slot is inert and pending removal — a lock there would read as
      // "installed globally" instead of "about to be removed".
      expect(rows[1].disabled).toBe(true);
      expect(rows[1].readOnly).toBeUndefined();
      expect(rows[1].added).toBeUndefined();
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
          source: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
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
      expect(rows[0].added).toBe(true);
      expect(rows[0].disabled).toBeUndefined();
      expect(rows[0].readOnly).toBeUndefined();
      // The emptied project slot is what saving deletes — inert, and never new this session.
      expect(rows[1].disabled).toBe(true);
      expect(rows[1].added).toBeUndefined();
      expect(rows[1].readOnly).toBeUndefined();
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
      store.toggleAgent("web-reviewer");

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toStrictEqual(["web-developer", "api-developer", "web-reviewer"]);
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
      expect(selectedAgents).toContain("web-reviewer");
      expect(selectedAgents).toContain("api-reviewer");
    });

    it("should not preselect api agents when only web domain is selected", () => {
      const store = useWizardStore.getState();
      store.toggleDomain("web");
      store.preselectAgentsFromDomains();

      const { selectedAgents } = useWizardStore.getState();
      expect(selectedAgents).toContain("web-developer");
      expect(selectedAgents).not.toContain("api-developer");
      expect(selectedAgents).not.toContain("api-reviewer");
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
      store.setSourceSelection("web-framework-react", "eject", "global");
      store.setSourceSelection("api-framework-hono", "eject", "global");

      const result = store.deriveInstallMode();
      expect(result).toBe("eject");
    });

    it("should return 'mixed' when some skills are local and some are not", () => {
      const store = useWizardStore.getState();
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);
      store.setSourceSelection("web-framework-react", "eject", "global");
      store.setSourceSelection("api-framework-hono", "agents-inc", "global");

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
      store.setSourceSelection("web-framework-react", "eject", "global");

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

  describe("toggleFilterIncompatible", () => {
    it("should deselect framework-incompatible skills from web categories when enabling filter", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      // Select React as framework, then select pinia (Vue-only) in client-state
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);

      // Verify pinia is selected
      expect(useWizardStore.getState().domainSelections.web!["web-client-state"]).toContain(
        "web-state-pinia",
      );

      // Enable filter
      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.filterIncompatible).toBe(true);
      // Pinia should be deselected (incompatible with React)
      expect(state.domainSelections.web!["web-client-state"]).not.toContain("web-state-pinia");
    });

    it("should NOT deselect framework-compatible skills when enabling filter", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      // Select React as framework, then select zustand (React-compatible) in client-state
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.filterIncompatible).toBe(true);
      // Zustand should remain (compatible with React)
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-zustand");
    });

    it("should NOT deselect skills in non-web domains when enabling filter", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("api", "api-api", "api-framework-hono", true);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // API domain should be untouched
      expect(state.domainSelections.api!["api-api"]).toStrictEqual(["api-framework-hono"]);
    });

    it("should NOT deselect the framework category itself when enabling filter", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // Framework selection should be untouched
      expect(state.domainSelections.web!["web-framework"]).toStrictEqual(["web-framework-react"]);
    });

    it("should skip excluded skills when filtering incompatible", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);

      // Mark pinia as excluded so it is skipped by the filter
      useWizardStore.setState({
        skillConfigs: useWizardStore
          .getState()
          .skillConfigs.map((sc) => (sc.id === "web-state-pinia" ? { ...sc, excluded: true } : sc)),
      });

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // Pinia should remain in domainSelections because it's excluded (not affected by filter)
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-pinia");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-pinia")).toBe(true);
    });

    it("should NOT deselect anything when disabling filter", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);

      // Enable then disable
      store.toggleFilterIncompatible();
      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.filterIncompatible).toBe(false);
      // Zustand should still be selected (was compatible, not removed on enable)
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-zustand");
    });

    it("should remove global incompatible skills from skillConfigs during fresh init", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);

      // Verify both are in skillConfigs
      expect(useWizardStore.getState().skillConfigs.some((sc) => sc.id === "web-state-pinia")).toBe(
        true,
      );
      expect(
        useWizardStore.getState().skillConfigs.some((sc) => sc.id === "web-state-zustand"),
      ).toBe(true);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // Fresh init: pinia removed from both domainSelections and skillConfigs
      expect(state.domainSelections.web!["web-client-state"]).not.toContain("web-state-pinia");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-pinia")).toBe(false);
      // Zustand kept in both (compatible)
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-zustand");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-zustand")).toBe(true);
    });

    it("removes global incompatible skills cleanly (no tombstone) while editing from global scope", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-state-pinia"], {
          scope: "global",
          source: "agents-inc",
        }),
        isEditingFromGlobalScope: true,
      });

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // Global-scope edit: incompatible pinia is uninstalled cleanly, not tombstoned.
      expect(state.domainSelections.web!["web-client-state"]).not.toContain("web-state-pinia");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-pinia")).toBe(false);
      // Zustand kept in both
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-zustand");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-zustand")).toBe(true);
    });

    it("should just toggle the boolean when no frameworks are selected", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      // Select a client-state skill but no framework
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.filterIncompatible).toBe(true);
      // Pinia should remain (no framework to check against)
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-pinia");
    });

    it("should not deselect skills with empty compatibleWith when enabling filter", () => {
      initializeMatrix(ALL_SKILLS_TEST_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      // Select React, then SCSS (which has empty compatibleWith — compatible with everything)
      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-styling", "web-styling-scss-modules", false);

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      // SCSS has compatibleWith: [] so it should remain
      expect(state.domainSelections.web!["web-styling"]).toContain("web-styling-scss-modules");
    });

    it("refuses to uninstall an actively-installed global skill from project scope", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);
      store.toggleTechnology("web", "web-client-state", "web-state-zustand", false);

      // pinia is globally installed; the project-scope edit has no authority over it.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-state-pinia"], {
          scope: "global",
          source: "eject",
        }),
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.toastMessage).toBe("Global skills cannot be changed from project scope");
      // The whole operation is refused: the filter stays off and nothing is removed.
      expect(state.filterIncompatible).toBe(false);
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-pinia");
      expect(state.skillConfigs.some((sc) => sc.id === "web-state-pinia")).toBe(true);
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-zustand");
    });

    it("refuses the filter when a stale global tombstone has collapsed to an active global entry", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);

      // Snapshot still holds the persisted [P][G] tombstone while the live config has already
      // collapsed to a plain active global entry — the same shape toggleTechnology blocks.
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-state-pinia"], {
          scope: "global",
          source: "eject",
        }),
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-state-pinia"], { scope: "project", source: "eject" }),
          ...buildSkillConfigs(["web-state-pinia"], {
            scope: "global",
            source: "eject",
            excluded: true,
          }),
        ],
        isEditingFromGlobalScope: false,
        isInitMode: false,
      });

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.toastMessage).toBe("Global skills cannot be changed from project scope");
      expect(state.filterIncompatible).toBe(false);
      expect(state.skillConfigs).toStrictEqual(
        buildSkillConfigs(["web-state-pinia"], { scope: "global", source: "eject" }),
      );
    });

    it("refuses to uninstall an actively-installed global skill in init mode too", () => {
      initializeMatrix(ALL_SKILLS_FULLSTACK_CATEGORIES_MATRIX);
      const store = useWizardStore.getState();

      store.toggleTechnology("web", "web-framework", "web-framework-react", true);
      store.toggleTechnology("web", "web-client-state", "web-state-pinia", false);

      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-state-pinia"], {
          scope: "global",
          source: "eject",
        }),
        isInitMode: true,
      });
      const skillConfigsBefore = [...useWizardStore.getState().skillConfigs];

      store.toggleFilterIncompatible();

      const state = useWizardStore.getState();
      expect(state.toastMessage).toBe("Global skills cannot be changed from project scope");
      // The whole operation is refused: the filter stays off and nothing is removed.
      expect(state.filterIncompatible).toBe(false);
      expect(state.domainSelections.web!["web-client-state"]).toContain("web-state-pinia");
      expect(
        state.skillConfigs,
        "a refused filter must leave skillConfigs untouched",
      ).toStrictEqual(skillConfigsBefore);
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
      hydrateWizardStore({});

      const state = useWizardStore.getState();
      expect(state.step).toBe("stack");
      expect(state.history).toStrictEqual([]);
      expect(state.isInitMode).toBe(true);
    });

    it("populates installedSkillConfigs for diff rendering", () => {
      const skillConfigs: SkillConfig[] = [
        { id: "web-framework-react", scope: "global", source: "eject" },
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
        { id: "web-framework-react", scope: "global", source: "eject" },
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
