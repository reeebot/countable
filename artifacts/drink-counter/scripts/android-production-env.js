function getAndroidProductionEnv(source = process.env) {
  const configuredDomain =
    source.REPLIT_INTERNAL_APP_DOMAIN ||
    source.REPLIT_DEV_DOMAIN ||
    source.EXPO_PUBLIC_DOMAIN;
  if (!configuredDomain) {
    throw new Error(
      "No production API domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN.",
    );
  }

  const domainUrl = /^https?:\/\//i.test(configuredDomain)
    ? configuredDomain
    : `https://${configuredDomain}`;
  const env = {
    ...source,
    EXPO_PUBLIC_DOMAIN: new URL(domainUrl).host,
  };

  const replId = source.REPL_ID || source.EXPO_PUBLIC_REPL_ID;
  if (replId) {
    env.EXPO_PUBLIC_REPL_ID = replId;
  }
  return env;
}

module.exports = { getAndroidProductionEnv };
