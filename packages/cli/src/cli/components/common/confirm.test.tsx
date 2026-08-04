// ConfirmInput requires longer delays than other components for useInput processing
import { render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Confirm } from "./confirm";
import {
  KEY_Y,
  KEY_N,
  ENTER,
  RENDER_DELAY_MS,
  CONFIRM_INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

describe("Confirm component", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render the message", () => {
      const { lastFrame, unmount } = render(
        <Confirm message="Do you want to proceed?" onConfirm={() => {}} onCancel={() => {}} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Do you want to proceed?");
    });

    it("should show y/n prompt", () => {
      const { lastFrame, unmount } = render(
        <Confirm message="Continue?" onConfirm={() => {}} onCancel={() => {}} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      // ConfirmInput shows (Y/n) or (y/N) depending on default
      expect(output?.toLowerCase()).toMatch(/[yn]/);
    });

    it("should show Y/n when default is confirm (true)", () => {
      const { lastFrame, unmount } = render(
        <Confirm message="Confirm?" onConfirm={() => {}} onCancel={() => {}} defaultValue={true} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Y/n");
    });

    it("should show y/N when default is cancel (false)", () => {
      const { lastFrame, unmount } = render(
        <Confirm
          message="Confirm?"
          onConfirm={() => {}}
          onCancel={() => {}}
          defaultValue={false}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("y/N");
    });
  });

  describe("keyboard interactions", () => {
    it("should call onConfirm when pressing y", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Confirm message="Confirm?" onConfirm={onConfirm} onCancel={onCancel} />,
      );
      cleanup = unmount;

      // Wait for component to mount and set up input handler
      await delay(RENDER_DELAY_MS);

      await stdin.write(KEY_Y);
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onConfirm).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("should call onCancel when pressing n", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Confirm message="Confirm?" onConfirm={onConfirm} onCancel={onCancel} />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      await stdin.write(KEY_N);
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("should call onConfirm when default is true and enter pressed", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Confirm
          message="Confirm?"
          onConfirm={onConfirm}
          onCancel={onCancel}
          defaultValue={true}
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      await stdin.write(ENTER);
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onConfirm).toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("should call onCancel when default is false and enter pressed", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Confirm
          message="Confirm?"
          onConfirm={onConfirm}
          onCancel={onCancel}
          defaultValue={false}
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      await stdin.write(ENTER);
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onCancel).toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("should handle uppercase Y", async () => {
      const onConfirm = vi.fn();

      const { stdin, unmount } = render(
        <Confirm message="Confirm?" onConfirm={onConfirm} onCancel={() => {}} />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      await stdin.write("Y");
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onConfirm).toHaveBeenCalled();
    });

    it("should handle uppercase N", async () => {
      const onCancel = vi.fn();

      const { stdin, unmount } = render(
        <Confirm message="Confirm?" onConfirm={() => {}} onCancel={onCancel} />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      await stdin.write("N");
      await delay(CONFIRM_INPUT_DELAY_MS);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("default value", () => {
    it("should default to false when not specified", () => {
      const { lastFrame, unmount } = render(
        <Confirm message="Confirm?" onConfirm={() => {}} onCancel={() => {}} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      // When default is false, N is capitalized (y/N)
      expect(output).toContain("y/N");
    });

    it("should render with specified default value of true", () => {
      const { lastFrame, unmount } = render(
        <Confirm message="Confirm?" onConfirm={() => {}} onCancel={() => {}} defaultValue={true} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      // When default is true, Y is capitalized (Y/n)
      expect(output).toContain("Y/n");
    });
  });
});
