/** Restores one variable as it was found, absent included. */
export type RestoreEnv = () => void;

export function captureEnv(name: string): RestoreEnv {
  const original = process.env[name];

  return () => {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  };
}

export function overrideEnv(name: string, value: string): RestoreEnv {
  const restore = captureEnv(name);
  process.env[name] = value;
  return restore;
}
