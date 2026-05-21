/**
 * (guest-meeting-livekit-peer-disconnect): pure helper for the
 * RoomEvent.Disconnected handler.
 *
 * Maps the `DisconnectReason` enum (from `@livekit/protocol`, re-exported
 * by `livekit-client`) to one of the three pre-ranked hypotheses captured
 * in the investigation that opened this ticket:
 *
 *   (a) transport-failure — coturn/ICE/TURN/signaling collapsed before
 *       or during the media path. Most likely for the guest path given
 *       the consistent ~3s post-signal-connect timing.
 *   (b) duplicate-identity — same JWT identity joined twice. React 18
 *       StrictMode dev double-mount can trigger this if the cleanup
 *       runs slower than the second connect.
 *   (c) client-cleanup — our own `useMeetingRoom` effect cleanup called
 *       `room.disconnect()`, which the server reports back as
 *       CLIENT_INITIATED. Caused by an unstable effect dependency
 *       (e.g. fresh `guestCredentials` object literal on every render
 *       of `GuestMeetingRoomLoader`).
 *
 * The hook calls this inside the Disconnected handler and console.warns
 * the result, so a browser smoke against `/app/meeting/{id}?guest=1`
 * surfaces the answer directly: the `hypothesis` field IS the verdict.
 *
 * Future debugging: the `description` is a short hint, not the full
 * fix — the actual fix depends on the hypothesis. See `lessons.md`
 * entries for each hypothesis once the corresponding fix lands.
 */

import { DisconnectReason } from "livekit-client";

export type DisconnectHypothesis =
  | "client-cleanup"
  | "duplicate-identity"
  | "transport-failure"
  | "media-failure"
  | "server-initiated"
  | "unknown";

export interface DisconnectDiagnosis {
  /** The raw enum value, or undefined if the callback fired without one. */
  reason: DisconnectReason | undefined;
  /** The enum name (e.g. "CLIENT_INITIATED") for log readability. */
  label: string;
  /** Which of the pre-ranked investigation hypotheses this reason matches. */
  hypothesis: DisconnectHypothesis;
  /** Short diagnostic hint pointing to the suspected root cause. */
  description: string;
}

export function describeDisconnectReason(
  reason: DisconnectReason | undefined,
): DisconnectDiagnosis {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return {
        reason,
        label: "CLIENT_INITIATED",
        hypothesis: "client-cleanup",
        description:
          "Client-side teardown — AMBIGUOUS. Fires for BOTH (a) explicit room.disconnect() (our useEffect cleanup or hangup) AND (b) LiveKit's internal abort when connect() fails (e.g. ICE/TURN unreachable). Fastest disambiguation: look for a SECOND 'Signal connecting to …' log line in the console preceding the disconnect — its presence means LiveKit retried internally before aborting (variant b, failed connect). A single 'Signal connecting' line means a real cleanup after a successful join (variant a). Cross-check with the 'Abort connection attempt due to user initiated disconnect' line: EMPTY roomID/participantID confirms variant b (transport/ICE failure), populated values confirm variant a (check effect deps for unstable refs).",
      };

    case DisconnectReason.DUPLICATE_IDENTITY:
      return {
        reason,
        label: "DUPLICATE_IDENTITY",
        hypothesis: "duplicate-identity",
        description:
          "Two clients joined with the same JWT identity. Suspect React StrictMode double-mount or a stale connection that did not fully tear down.",
      };

    case DisconnectReason.CONNECTION_TIMEOUT:
      return {
        reason,
        label: "CONNECTION_TIMEOUT",
        hypothesis: "transport-failure",
        description:
          "ICE / TURN candidate gathering or peer-connection establishment did not complete. Check coturn reachability and LIVEKIT_TURN_UDP ports.",
      };

    case DisconnectReason.SIGNAL_CLOSE:
      return {
        reason,
        label: "SIGNAL_CLOSE",
        hypothesis: "transport-failure",
        description:
          "Signaling WebSocket dropped. Check LIVEKIT_URL reachability and Traefik WS routing to the LiveKit container.",
      };

    case DisconnectReason.JOIN_FAILURE:
      return {
        reason,
        label: "JOIN_FAILURE",
        hypothesis: "transport-failure",
        description:
          "Client could not fully join the room. Often a JWT / room-name / signaling issue surfacing as a peer disconnect.",
      };

    case DisconnectReason.MEDIA_FAILURE:
      return {
        reason,
        label: "MEDIA_FAILURE",
        hypothesis: "media-failure",
        description:
          "Media plane failed (DTLS, SRTP, or transport-level RTP). Usually downstream of a TURN/ICE problem.",
      };

    case DisconnectReason.SERVER_SHUTDOWN:
      return {
        reason,
        label: "SERVER_SHUTDOWN",
        hypothesis: "server-initiated",
        description:
          "LiveKit server instance shut down or restarted while the client was connected.",
      };

    case DisconnectReason.PARTICIPANT_REMOVED:
      return {
        reason,
        label: "PARTICIPANT_REMOVED",
        hypothesis: "server-initiated",
        description:
          "Server called RemoveParticipant. Expected after host-side moderation; unexpected otherwise.",
      };

    case DisconnectReason.ROOM_DELETED:
      return {
        reason,
        label: "ROOM_DELETED",
        hypothesis: "server-initiated",
        description:
          "Server called DeleteRoom. Expected when the host ends the meeting; unexpected mid-call.",
      };

    case DisconnectReason.ROOM_CLOSED:
      return {
        reason,
        label: "ROOM_CLOSED",
        hypothesis: "server-initiated",
        description:
          "Room closed by the server (empty timeout, scheduled end, or admin action).",
      };

    case DisconnectReason.STATE_MISMATCH:
      return {
        reason,
        label: "STATE_MISMATCH",
        hypothesis: "transport-failure",
        description:
          "Client tried to resume a session the server no longer knows about. Often a reconnect after a server restart.",
      };

    case DisconnectReason.MIGRATION:
      return {
        reason,
        label: "MIGRATION",
        hypothesis: "server-initiated",
        description:
          "Cloud-only: server asked the participant to migrate connections. Not expected in self-hosted deployments.",
      };

    case DisconnectReason.USER_UNAVAILABLE:
      return {
        reason,
        label: "USER_UNAVAILABLE",
        hypothesis: "server-initiated",
        description:
          "Server signalled the user is unavailable (SIP/agent path).",
      };

    case DisconnectReason.USER_REJECTED:
      return {
        reason,
        label: "USER_REJECTED",
        hypothesis: "server-initiated",
        description: "Server signalled the user rejected the call (SIP path).",
      };

    case DisconnectReason.SIP_TRUNK_FAILURE:
      return {
        reason,
        label: "SIP_TRUNK_FAILURE",
        hypothesis: "transport-failure",
        description: "SIP trunk failed. Not expected for browser-only flows.",
      };

    case DisconnectReason.AGENT_ERROR:
      return {
        reason,
        label: "AGENT_ERROR",
        hypothesis: "server-initiated",
        description:
          "LiveKit agent reported an error. Not expected for browser-only flows.",
      };

    case DisconnectReason.UNKNOWN_REASON:
    case undefined:
      return {
        reason,
        label: "UNKNOWN_REASON",
        hypothesis: "unknown",
        description:
          "No DisconnectReason supplied by the SDK. Often a clean network teardown or an older LiveKit server.",
      };
  }
}
