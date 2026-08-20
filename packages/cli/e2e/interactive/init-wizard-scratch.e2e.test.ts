import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { ADDED_MARKER, STEP_TEXT } from "../pages/constants.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";

describe("init wizard — scratch flow", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("scratch flow", () => {
    it("should navigate to 'Start from scratch' and enter domain selection", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();

      const output = domain.getOutput();
      expect(output).toContain(STEP_TEXT.DOMAIN_WEB);
    });

    it("should complete a scratch-based init flow selecting both domains", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();

      const domainOutput = domain.getOutput();
      expect(domainOutput).toContain(STEP_TEXT.DOMAIN_WEB);
      expect(domainOutput).toContain(STEP_TEXT.DOMAIN_API);

      const build = await domain.acceptDefaults();

      const buildOutput = build.getOutput();
      expect(buildOutput).toContain(STEP_TEXT.DOMAIN_WEB);
      expect(buildOutput).toContain(STEP_TEXT.DOMAIN_API);
    });

    it("should navigate domain views with Enter and Escape in build step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();

      // Select required Framework skill before advancing
      await build.selectSkill(E2E_SKILL.react.display);

      // Advance to next domain (API)
      await build.advanceDomain();

      const afterAdvance = build.getOutput();
      expect(afterAdvance).toContain(STEP_TEXT.DOMAIN_API);

      // Go back to previous domain (Web)
      await build.goBack();

      const afterBack = build.getOutput();
      expect(afterBack).toContain(STEP_TEXT.DOMAIN_WEB);
    });

    it("should show confirm step details with selected technologies", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughScratchDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(confirmOutput).toContain(STEP_TEXT.SCOPE_GLOBAL);

      // The technologies the name promises. The scratch flow defaults to the
      // Web and API domains, so each domain's required framework skill is
      // selected, and the agents column carries the pair those domains bring.
      expect(confirmOutput).toContain(`${ADDED_MARKER} ${E2E_SKILL.react.display}`);
      expect(confirmOutput).toContain(`${ADDED_MARKER} ${E2E_SKILL.hono.display}`);
      for (const agentName of E2E_AGENTS.WEB_AND_API) {
        expect(confirmOutput).toContain(`${ADDED_MARKER} ${agentName}`);
      }
    });

    it("should complete a full scratch-based init flow through to install", async () => {
      wizard = await InitWizard.launchInProject();

      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughScratchDomains();
      await sources.setAllLocal();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      // Config lands under projectDir; the compiled agents and ejected skills
      // (default global scope) land under the wizard's global HOME.
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
        agents: E2E_AGENTS.WEB_AND_API,
        origin: "eject",
      });
      await expectPhaseSuccess(
        { project: { dir: wizard.globalHome }, exitCode: result.exitCode },
        {
          compiledAgents: E2E_AGENTS.WEB_AND_API,
          copiedSkills: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
        },
      );
      // A scratch init asserts no load state of its own and reads no stack that
      // could assert one for it, so every pick arrives on the shared defaults'
      // terms — and those answer REACH and EAGERNESS from two different tables,
      // deliberately. Reach is derived from a skill's taxonomy, so a framework
      // lands on its own domain's agents and reaches no other domain's.
      // Eagerness is authored per catalogue skill id and nothing derives it;
      // this fixture publishes under its own marketplace, so its ids match no
      // row and arrive lazy by rule. The frontmatter list IS the preload list,
      // so a lazy skill leaves it empty.
      //
      // The two matchers only prove that together: an empty frontmatter alone
      // would equally describe a skill that never reached the agent, and a body
      // hit alone would not say how it arrives.
      await expect({ dir: wizard.globalHome }).toHaveAgentFrontmatter("web-developer", {
        noSkills: true,
      });
      await expect({ dir: wizard.globalHome }).toHaveAgentDynamicSkills("web-developer", {
        skillIds: [E2E_SKILL.react.id],
        noSkillIds: [E2E_SKILL.hono.id],
      });
      await expect({ dir: wizard.globalHome }).toHaveAgentFrontmatter("api-developer", {
        noSkills: true,
      });
      await expect({ dir: wizard.globalHome }).toHaveAgentDynamicSkills("api-developer", {
        skillIds: [E2E_SKILL.hono.id],
        noSkillIds: [E2E_SKILL.react.id],
      });
    });
  });

  describe("single-domain scratch flow", () => {
    it("should show only Web domain in build step when API is deselected", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();

      // Deselect API and Mobile, keep only Web
      await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
      await domain.toggleDomain(STEP_TEXT.DOMAIN_MOBILE);

      const build = await domain.advance();

      const buildOutput = build.getOutput();
      expect(buildOutput).toContain(STEP_TEXT.BUILD);
    });
  });

  describe("all domains deselected", () => {
    it("should show empty message when all domains are deselected", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();

      // Deselect all pre-selected scratch domains by navigating and toggling each.
      // Scratch pre-selects Web, API, Mobile. The cursor starts on Web.
      await domain.deselectAll();

      const output = domain.getOutput();
      expect(output).toContain("Please select at least one domain");
    });
  });
});
