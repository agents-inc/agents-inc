import { PROVIDERS, type Provider } from "../../../consts.js";

export function otherThan(provider: Provider): Provider[] {
  return PROVIDERS.filter((candidate) => candidate !== provider);
}
