export type CallStatus =
  | "ringing"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export interface LiveKitTokenResponse {
  token: string;
  wsUrl: string;
  roomName: string;
}

export interface IncomingCallPayload {
  callId: string;
  callerName: string;
  callerDepartment: string | null;
  roomName: string;
}
