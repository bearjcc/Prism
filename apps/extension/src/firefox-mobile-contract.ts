export type FirefoxManifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  background?: {
    service_worker?: string;
    scripts?: string[];
    type?: string;
  };
  browser_specific_settings?: {
    gecko?: unknown;
    gecko_android?: {
      strict_min_version?: string;
      strict_max_version?: string;
    };
  };
};

/** Floor used by Firefox for Android contract tests and the unpack manifest. */
export const FIREFOX_ANDROID_MIN_VERSION = "142.0";

/**
 * Permissions that must not appear in the Firefox unpack manifest while
 * Firefox for Android still rejects them below FIREFOX_ANDROID_MIN_VERSION.
 */
export const ANDROID_FORBIDDEN_PERMISSIONS: readonly string[] = [];

export function firefoxMobileContractViolations(
  manifest: FirefoxManifest,
): string[] {
  const violations: string[] = [];

  const geckoAndroid = manifest.browser_specific_settings?.gecko_android;
  if (geckoAndroid === undefined) {
    violations.push(
      "browser_specific_settings.gecko_android is required for Firefox for Android",
    );
  } else if (
    geckoAndroid.strict_min_version !== undefined &&
    geckoAndroid.strict_min_version !== FIREFOX_ANDROID_MIN_VERSION
  ) {
    violations.push(
      `browser_specific_settings.gecko_android.strict_min_version must be ${FIREFOX_ANDROID_MIN_VERSION}`,
    );
  }

  if (manifest.browser_specific_settings?.gecko !== undefined) {
    violations.push(
      "browser_specific_settings.gecko must not be set on the unpack Firefox target",
    );
  }

  if (manifest.background?.service_worker !== undefined) {
    violations.push(
      "background.service_worker is unsupported on Firefox for Android; use background.scripts",
    );
  }

  if (
    manifest.background?.scripts === undefined ||
    manifest.background.scripts.length === 0
  ) {
    violations.push("background.scripts is required for the Firefox target");
  }

  if (
    manifest.host_permissions !== undefined &&
    manifest.host_permissions.length > 0
  ) {
    violations.push(
      "host_permissions must not be declared on the Firefox unpack target",
    );
  }

  for (const permission of ANDROID_FORBIDDEN_PERMISSIONS) {
    if (manifest.permissions?.includes(permission) === true) {
      violations.push(
        `permission ${permission} is not supported on Firefox for Android`,
      );
    }
  }

  return violations;
}
