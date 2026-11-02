import { networkDown } from "@/lib/offline/network";
import { strings } from "@/lib/strings";

/**
 * The toast for an action that failed: when requests are not getting through
 * say it is the connection, not a vague "something went wrong".
 */
export function failureText(): string {
  return networkDown() ? strings.offline.actionFailedOffline : strings.common.error;
}
